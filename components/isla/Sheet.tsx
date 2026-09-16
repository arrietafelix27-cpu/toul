'use client'

import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE_OUT_EMIL } from '@/components/ui'

/**
 * Sheet — hoja inferior en móvil, panel centrado en pantallas grandes.
 * Fondo con blur, entrada con curva ease-out, cierra con Escape o tocando afuera.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, width = 460 }: {
    open: boolean
    onClose: () => void
    title: string
    subtitle?: string
    children: ReactNode
    footer?: ReactNode
    width?: number
}) {
    useEffect(() => {
        if (!open) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
    }, [open, onClose])

    return (
        <AnimatePresence>
            {open && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', justifyContent: 'center' }}
                    className="items-end md:items-center md:p-6">
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, ease: EASE_OUT_EMIL }}
                        onClick={onClose}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
                    />
                    <motion.div
                        role="dialog" aria-modal="true" aria-label={title}
                        initial={{ y: 24, opacity: 0, scale: 0.98 }}
                        animate={{ y: 0, opacity: 1, scale: 1 }}
                        exit={{ y: 16, opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.24, ease: EASE_OUT_EMIL }}
                        className="rounded-t-[28px] md:rounded-[24px]"
                        style={{
                            position: 'relative', width: '100%', maxWidth: width, maxHeight: '90dvh',
                            display: 'flex', flexDirection: 'column',
                            background: 'var(--toul-surface-overlay)', border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 20px 12px' }}>
                            <div style={{ minWidth: 0 }}>
                                <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>{title}</h2>
                                {subtitle && <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>{subtitle}</p>}
                            </div>
                            <button onClick={onClose} aria-label="Cerrar"
                                style={{ width: 36, height: 36, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <X size={17} />
                            </button>
                        </div>
                        <div style={{ overflowY: 'auto', padding: '0 20px 16px', flex: 1 }}>{children}</div>
                        {footer && (
                            <div style={{ padding: '12px 20px calc(16px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--toul-divider)' }}>
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
