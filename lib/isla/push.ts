import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

let configured = false

function configure(): boolean {
    if (configured) return true
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    if (!publicKey || !privateKey) return false
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:soporte@toul.app', publicKey, privateKey)
    configured = true
    return true
}

export interface PushPayload {
    title: string
    body: string
    url: string
    tag?: string
}

/**
 * Avisa a los administradores de una solicitud recién creada.
 * Nunca lanza: si no hay llaves o falla el envío, la solicitud igual
 * queda visible dentro de la app.
 */
export async function notifyAdmins(supabase: SupabaseClient, requestId: string, payload: PushPayload): Promise<number> {
    if (!configure()) return 0

    const { data: targets, error } = await supabase.rpc('toul_push_targets', { p_request_id: requestId })
    if (error || !targets?.length) return 0

    let sent = 0
    await Promise.all((targets as { endpoint: string; p256dh: string; auth: string }[]).map(async (t) => {
        try {
            await webpush.sendNotification(
                { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
                JSON.stringify(payload),
                { TTL: 60 * 30, urgency: 'high' }
            )
            sent++
        } catch (err: unknown) {
            const status = (err as { statusCode?: number }).statusCode
            // Suscripción vencida (el admin desinstaló o revocó permisos)
            if (status === 404 || status === 410) {
                await supabase.rpc('toul_delete_push_subscription', { p_endpoint: t.endpoint })
            }
        }
    }))
    return sent
}
