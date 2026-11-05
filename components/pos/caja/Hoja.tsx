'use client'

import { useEffect, type ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { EASE_HOJA } from './piezas'

/**
 * Hoja de la caja. Sube con la curva de iOS (0,32 · 0,72 · 0 · 1) en 0,4 s
 * sobre un fondo desenfocado. En el celular se cierra arrastrándola hacia
 * abajo desde la manija; en PC queda centrada. Escape y tocar afuera la cierran.
 */
export function Hoja({ open, onClose, titulo, subtitulo, children, pie, completa = false, ancho = 480, narrow, cerrable = true }: {
    open: boolean
    onClose: () => void
    titulo?: string
    subtitulo?: string
    children: ReactNode
    pie?: ReactNode
    /** Celular: ocupa toda la pantalla */
    completa?: boolean
    ancho?: number
    narrow: boolean
    /** Sin la X (por ejemplo, mientras se registra la venta) */
    cerrable?: boolean
}) {
    const arrastre = useDragControls()
    const reducir = useReducedMotion()
    const abajo = narrow

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose() } }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const entrada = reducir ? { opacity: 0 } : abajo ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.97 }
    const visible = reducir ? { opacity: 1 } : abajo ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }

    return (
        <AnimatePresence>
            {open && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'center',
                    alignItems: abajo ? 'flex-end' : 'center', padding: abajo ? 0 : 24,
                }}>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE_HOJA }}
                        onClick={onClose}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
                    />
                    <motion.div
                        role="dialog" aria-modal="true" aria-label={titulo}
                        initial={entrada} animate={visible} exit={entrada}
                        transition={{ duration: 0.4, ease: EASE_HOJA }}
                        drag={abajo && !reducir ? 'y' : false} dragListener={false} dragControls={arrastre}
                        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 1 }} dragSnapToOrigin
                        onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 600) onClose() }}
                        style={{
                            position: 'relative', width: '100%', maxWidth: abajo ? '100%' : ancho,
                            height: abajo && completa ? 'calc(100dvh - env(safe-area-inset-top, 0px) - 8px)' : undefined,
                            maxHeight: abajo ? 'calc(100dvh - env(safe-area-inset-top, 0px) - 8px)' : 'min(760px, calc(100dvh - 48px))',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            borderRadius: abajo ? '26px 26px 0 0' : 24,
                            background: 'var(--toul-surface-overlay)', border: '1px solid var(--toul-border)',
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
                        }}>
                        {/* La manija y el título: desde aquí se arrastra para cerrar */}
                        <div onPointerDown={e => { if (abajo) arrastre.start(e) }}
                            style={{ flexShrink: 0, touchAction: abajo ? 'none' : undefined, cursor: abajo ? 'grab' : undefined }}>
                            {abajo && <div aria-hidden style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--toul-text-ghost)', margin: '8px auto 0' }} />}
                            {(titulo || cerrable) && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: titulo ? '14px 20px 10px' : '6px 12px 0' }}>
                                    <div style={{ minWidth: 0 }}>
                                        {titulo && <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>{titulo}</h2>}
                                        {subtitulo && <p style={{ fontSize: 13.5, color: 'var(--toul-text-subtle)', margin: '2px 0 0' }}>{subtitulo}</p>}
                                    </div>
                                    {cerrable && (
                                        <button type="button" onClick={onClose} aria-label="Cerrar" className="cj-btn cj-press"
                                            style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                                            <X size={17} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="cj-scroll-y" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
                        {pie && (
                            <div style={{ flexShrink: 0, padding: '12px 20px calc(16px + env(safe-area-inset-bottom, 0px))' }}>{pie}</div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
