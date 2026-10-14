'use client'

import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'

/** Avisa que se recuperó lo que había escrito, y deja empezar de cero. */
export function DraftNotice({ show, onDiscard, note }: { show: boolean; onDiscard: () => void; note?: string }) {
    if (!show) return null
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
            style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
                padding: '11px 14px', borderRadius: 14,
                background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
            }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                    Recuperamos lo que estabas escribiendo
                </p>
                <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0', lineHeight: 1.45 }}>
                    {note ?? 'La foto sí hay que volver a escogerla.'}
                </p>
            </div>
            <button onClick={onDiscard}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    height: 30, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.055)',
                    color: 'var(--toul-text-muted)', fontSize: 11.5, fontWeight: 600,
                }}>
                <RotateCcw size={12} /> Empezar de cero
            </button>
        </motion.div>
    )
}
