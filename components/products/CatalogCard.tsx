'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Gift, Layers, Package } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { t } from '@/lib/motion'

/* ══════════════════════════════════════════════════════════════
   Una sola tarjeta para todo el catálogo.
   La estructura nunca cambia — imagen cuadrada, nombre de dos
   líneas, precio y un pie — para que la grilla se vea pareja
   sin importar si es producto, presentaciones o combo.
   ══════════════════════════════════════════════════════════════ */

export type CatalogKind = 'simple' | 'presentaciones' | 'combo'

export interface CatalogCardData {
    id: string
    kind: CatalogKind
    name: string
    /** Precio o rango, ya formateado */
    priceLabel: string
    image: string | null
    stock: number | null
    presentations?: number
    badge?: { label: string; bg: string; text: string } | null
    href: string
}

const KIND_CHIP: Record<CatalogKind, { label: string; Icon: typeof Package } | null> = {
    simple: null,
    presentaciones: { label: 'Presentaciones', Icon: Layers },
    combo: { label: 'Combo', Icon: Gift },
}

export function CatalogCard({ item, index }: { item: CatalogCardData; index: number }) {
    const chip = KIND_CHIP[item.kind]
    const outOfStock = item.stock === 0
    const lowStock = typeof item.stock === 'number' && item.stock > 0 && item.stock <= 3
    const Placeholder = item.kind === 'combo' ? Gift : item.kind === 'presentaciones' ? Layers : Package

    const footer = item.kind === 'combo'
        ? 'Combo'
        : item.kind === 'presentaciones'
            ? `${item.presentations ?? 0} presentaciones`
            : outOfStock ? 'Sin stock' : `${item.stock ?? 0} und`

    const footerColor = outOfStock ? 'var(--toul-error)'
        : lowStock && item.kind === 'simple' ? 'var(--toul-warning)'
            : 'var(--toul-text-dim)'

    // La entrada se escalona solo en las primeras tarjetas: con un
    // catálogo grande no se puede esperar a que aparezcan todas
    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...t.base, delay: Math.min(index, 11) * 0.03 }}
        >
            <Link
                href={item.href}
                style={{
                    display: 'flex', flexDirection: 'column', height: '100%', textDecoration: 'none',
                    borderRadius: 18, overflow: 'hidden',
                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                    transition: 'background var(--toul-transition), border-color var(--toul-transition), transform 120ms var(--toul-ease)',
                }}
                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
                {/* Imagen — cuadrada pase lo que pase: la foto se recorta,
                    nunca estira la tarjeta (fotos verticales incluidas) */}
                <div style={{
                    position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', flexShrink: 0,
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                    opacity: outOfStock ? 0.45 : 1,
                }}>
                    {item.image
                        ? <img src={item.image} alt={item.name} loading="lazy"
                            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Placeholder size={26} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--toul-text-faint)' }} />}

                    {chip && (
                        <span style={{
                            position: 'absolute', top: 8, left: 8,
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 10, fontWeight: 600, color: 'var(--toul-text-muted)',
                            background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(10px)',
                            borderRadius: 999, padding: '4px 9px',
                        }}>
                            <chip.Icon size={11} /> {chip.label}
                        </span>
                    )}

                    {/* La señal no repite lo que ya dice el pie de la tarjeta */}
                    {item.badge && !outOfStock && (
                        <span style={{
                            position: 'absolute', bottom: 8, right: 8,
                            fontSize: 10, fontWeight: 600, borderRadius: 999, padding: '4px 9px',
                            background: item.badge.bg, color: item.badge.text,
                        }}>
                            {item.badge.label}
                        </span>
                    )}
                </div>

                {/* Cuerpo — tres renglones de alto fijo: todas las tarjetas miden igual */}
                <div style={{ padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <p style={{
                        fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--toul-text)',
                        margin: 0, lineHeight: 1.3, height: 36,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                        {item.name}
                    </p>
                    <p style={{
                        fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-accent)', margin: 0,
                        lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {item.priceLabel}
                    </p>
                    <p style={{
                        fontSize: 12, color: footerColor, margin: 0, lineHeight: '16px',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {footer}
                    </p>
                </div>
            </Link>
        </motion.div>
    )
}
