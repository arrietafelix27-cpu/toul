import { createClient } from '@/lib/supabase/client'

/* ══════════════════════════════════════════════════════════════
   Avisar cuando algo se rompe.

   Hasta ahora, si la app fallaba para alguien, nadie se enteraba:
   él veía una pantalla rara, cerraba y seguía con su día. Esto
   guarda el error en la base para que se pueda mirar después.

   Reglas que importan:
   - Reportar nunca puede romper nada. Si falla el reporte, calla.
   - El mismo error no se manda cien veces seguidas.
   - Nada de datos del negocio: solo qué falló y dónde.
   ══════════════════════════════════════════════════════════════ */

const vistos = new Map<string, number>()
const UNA_VEZ_CADA = 60_000   // mismo error, máximo una vez por minuto
const TOPE_POR_SESION = 20    // si algo entra en bucle, no inundar la tabla
let enviados = 0

/** Ruido del navegador que no dice nada de la app */
const IGNORAR = [
    'ResizeObserver loop',
    'Script error',
    'Load failed',
    'NetworkError when attempting to fetch',
    'cancelled',
    'AbortError',
]

export function reportError(error: unknown, extra?: Record<string, unknown>) {
    try {
        if (typeof window === 'undefined') return
        if (enviados >= TOPE_POR_SESION) return

        const message = error instanceof Error ? error.message
            : typeof error === 'string' ? error
                : JSON.stringify(error)?.slice(0, 500) ?? 'Error desconocido'

        if (!message) return
        if (IGNORAR.some(t => message.includes(t))) return

        const ahora = Date.now()
        const ultimo = vistos.get(message)
        if (ultimo && ahora - ultimo < UNA_VEZ_CADA) return
        vistos.set(message, ahora)
        enviados++

        const supabase = createClient()
        void supabase.from('app_errors').insert({
            message,
            stack: error instanceof Error ? error.stack ?? null : null,
            url: window.location.pathname + window.location.search,
            user_agent: navigator.userAgent,
            extra: extra ?? null,
        }).then(() => { /* si no se pudo guardar, no hay nada más que hacer */ })
    } catch {
        // Reportar un error jamás puede causar otro
    }
}

/** Se engancha una sola vez, al abrir la app */
let enganchado = false

export function watchErrors() {
    if (enganchado || typeof window === 'undefined') return
    enganchado = true

    window.addEventListener('error', event => {
        reportError(event.error ?? event.message, { tipo: 'error' })
    })

    window.addEventListener('unhandledrejection', event => {
        reportError(event.reason, { tipo: 'promesa' })
    })
}
