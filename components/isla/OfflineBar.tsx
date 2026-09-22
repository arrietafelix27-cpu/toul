'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff, CloudUpload, AlertTriangle } from 'lucide-react'
import { EASE_OUT_EMIL } from '@/components/ui'
import type { OfflineState } from '@/lib/isla/useOffline'

/** Aviso de conexión: sin internet, ventas por enviar o ventas rechazadas. */
export function OfflineBar({ offline }: { offline: OfflineState }) {
    const { online, pendingCount, failedCount, syncing, sync } = offline

    const state = !online ? 'offline'
        : failedCount > 0 ? 'failed'
        : pendingCount > 0 ? 'pending'
        : null

    if (!state) return null

    const config = {
        offline: {
            bg: 'var(--toul-warning-dim)', fg: 'var(--toul-warning)', icon: WifiOff,
            text: pendingCount > 0
                ? `Sin internet · ${pendingCount} ${pendingCount === 1 ? 'venta guardada' : 'ventas guardadas'} en este computador`
                : 'Sin internet · puedes seguir vendiendo de contado',
        },
        pending: {
            bg: 'var(--toul-info-dim)', fg: 'var(--toul-info)', icon: CloudUpload,
            text: `Enviando ${pendingCount} ${pendingCount === 1 ? 'venta' : 'ventas'}…`,
        },
        failed: {
            bg: 'var(--toul-error-dim)', fg: 'var(--toul-error)', icon: AlertTriangle,
            text: `${failedCount} ${failedCount === 1 ? 'venta no pudo enviarse' : 'ventas no pudieron enviarse'} · revísalas`,
        },
    }[state]

    const Icon = config.icon

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}
                style={{ overflow: 'hidden', flexShrink: 0 }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                    background: config.bg, borderBottom: '1px solid var(--toul-border)',
                }}>
                    <Icon size={16} style={{ color: config.fg, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: config.fg, flex: 1 }}>{config.text}</span>
                    {online && (pendingCount > 0 || failedCount > 0) && (
                        <button onClick={() => sync(true)} disabled={syncing}
                            style={{
                                height: 34, padding: '0 14px', borderRadius: 10, border: `1px solid ${config.fg}`,
                                background: 'transparent', color: config.fg, fontSize: 13, fontWeight: 600,
                                cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0,
                            }}>
                            {syncing ? 'Enviando…' : 'Reintentar'}
                        </button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
