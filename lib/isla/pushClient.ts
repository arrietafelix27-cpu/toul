'use client'

import { createClient } from '@/lib/supabase/client'

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4)
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
    const out = new Uint8Array(new ArrayBuffer(raw.length))
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
}

/** ¿Este dispositivo puede recibir notificaciones? En iPhone hay que instalar la app primero. */
export function getPushSupport(): PushSupport {
    if (typeof window === 'undefined') return 'unsupported'
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (isIOS && !isStandalone) return 'needs-install'
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
    return 'supported'
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
    if (getPushSupport() !== 'supported') return null
    const reg = await navigator.serviceWorker.getRegistration('/')
    return reg ? reg.pushManager.getSubscription() : null
}

/** Pide permiso y registra este dispositivo para recibir avisos. Debe llamarse desde un toque del usuario. */
export async function enablePushNotifications(): Promise<void> {
    const support = getPushSupport()
    if (support === 'needs-install') throw new Error('En iPhone, primero agrega TOUL a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí.')
    if (support === 'unsupported') throw new Error('Este navegador no permite notificaciones.')

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) throw new Error('Faltan las llaves de notificaciones en el servidor.')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Debes permitir las notificaciones para recibir los avisos.')

    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    const subscription = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })

    const json = subscription.toJSON()
    const { error } = await createClient().rpc('toul_save_push_subscription', {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys?.p256dh,
        p_auth: json.keys?.auth,
    })
    if (error) throw new Error('No se pudo guardar este dispositivo. Intenta de nuevo.')
}
