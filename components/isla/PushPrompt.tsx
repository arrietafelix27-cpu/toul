'use client'

import { useEffect, useState } from 'react'
import { BellRing, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { enablePushNotifications, getExistingSubscription, getPushSupport, type PushSupport } from '@/lib/isla/pushClient'

/** Tarjeta para activar las notificaciones de aprobaciones en este dispositivo. */
export function PushPrompt({ compact = false }: { compact?: boolean }) {
    const [support, setSupport] = useState<PushSupport | null>(null)
    const [enabled, setEnabled] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        const s = getPushSupport()
        setSupport(s)
        if (s === 'supported') getExistingSubscription().then(sub => setEnabled(!!sub && Notification.permission === 'granted'))
    }, [])

    async function enable() {
        setBusy(true)
        try {
            await enablePushNotifications()
            setEnabled(true)
            toast.success('Listo: te avisaremos en este dispositivo')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se pudieron activar')
        } finally {
            setBusy(false)
        }
    }

    if (support === null || (compact && enabled)) return null

    return (
        <div className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: enabled ? 'var(--toul-accent-dim)' : 'var(--toul-info-dim)' }}>
                {enabled ? <Check size={20} style={{ color: 'var(--toul-accent)' }} /> : <BellRing size={20} style={{ color: 'var(--toul-info)' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                    {enabled ? 'Notificaciones activas en este dispositivo' : 'Recibe las aprobaciones en tu celular'}
                </p>
                <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '2px 0 0' }}>
                    {enabled ? 'Te avisaremos cuando un vendedor pida anular o fiar.'
                        : support === 'needs-install' ? 'En iPhone: toca Compartir → "Agregar a inicio", abre TOUL desde ahí y vuelve aquí.'
                        : support === 'unsupported' ? 'Este navegador no permite notificaciones. Usa Chrome o Safari.'
                        : 'Te llega un aviso aunque no tengas la app abierta.'}
                </p>
            </div>
            {!enabled && support === 'supported' && (
                <button onClick={enable} disabled={busy}
                    style={{ height: 42, padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                    {busy ? 'Activando…' : 'Activar'}
                </button>
            )}
        </div>
    )
}
