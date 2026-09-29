/**
 * Caché corta del rol del usuario para que navegar no cueste una consulta extra.
 *
 * El middleware pregunta a la base de datos quién eres en CADA pantalla.
 * Con wifi de centro comercial eso se siente lento. Esta caché guarda
 * `{ userId, storeId, role }` firmado en una cookie por 2 minutos.
 *
 * La cookie solo decide a qué pantalla te manda la app. Los permisos reales
 * los sigue aplicando la base de datos en cada consulta, así que una cookie
 * alterada no da acceso a datos ajenos.
 *
 * Sin `TOUL_SESSION_SECRET` configurado, simplemente no se usa caché.
 */

const COOKIE = 'toul_ctx'
const TTL_MS = 2 * 60 * 1000

export interface CachedContext {
    userId: string
    storeId: string
    role: 'admin' | 'seller'
}

const encoder = new TextEncoder()

async function sign(payload: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    )
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
    return btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!))
}

/** Lee la cookie si sigue vigente y corresponde a este usuario. */
export async function readCachedContext(raw: string | undefined, userId: string): Promise<CachedContext | null> {
    const secret = process.env.TOUL_SESSION_SECRET
    if (!secret || !raw) return null

    const [payload, signature] = raw.split('.')
    if (!payload || !signature) return null
    if (await sign(payload, secret) !== signature) return null

    try {
        const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as CachedContext & { exp: number }
        if (!data.exp || data.exp < Date.now()) return null
        if (data.userId !== userId) return null
        return { userId: data.userId, storeId: data.storeId, role: data.role }
    } catch {
        return null
    }
}

/** Devuelve el valor a guardar en la cookie, o null si no hay secreto configurado. */
export async function buildContextCookie(context: CachedContext): Promise<{ name: string; value: string; maxAge: number } | null> {
    const secret = process.env.TOUL_SESSION_SECRET
    if (!secret) return null

    const payload = btoa(JSON.stringify({ ...context, exp: Date.now() + TTL_MS }))
        .replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!))
    return { name: COOKIE, value: `${payload}.${await sign(payload, secret)}`, maxAge: TTL_MS / 1000 }
}

export const CONTEXT_COOKIE = COOKIE
