'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Package, Layers, Gift } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { EASE_OUT_EMIL } from '@/components/ui'

/* ══════════════════════════════════════════════════════════════
   Detalle de producto — una sola plantilla para los cuatro casos:
   producto simple, producto con presentaciones, una presentación
   y combo. Cambia el contenido, nunca la estructura.

   En celular es una sola columna. En PC son dos: la foto queda
   fija a la izquierda y la información se lee al lado, en vez de
   estirar la pantalla del celular a lo ancho.
   ══════════════════════════════════════════════════════════════ */

export interface Presentation {
    id: string
    name: string
    price: number
    stock: number
    href?: string
}

export interface ComboComponent {
    id: string
    name: string
    quantity: number
}

export interface MovementLine {
    id: string
    label: string
    quantity: number
    date: string
}

export interface ProductDetailProps {
    kind: 'simple' | 'presentaciones' | 'combo' | 'presentacion'
    name: string
    /** Producto al que pertenece — solo cuando se ve una presentación */
    parent?: { name: string; href: string } | null
    categoryName?: string | null
    reference?: string | null
    images: string[]
    /** Precio de venta o rango, ya formateado */
    priceLabel: string
    cost?: number | null
    margin?: number | null
    stock?: number | null
    stockValue?: number | null
    presentations?: Presentation[]
    components?: ComboComponent[]
    sales?: { units: number; revenue: number; days: number }
    insight?: string | null
    movements?: MovementLine[]
    actions?: ReactNode
    backHref?: string
}

const KIND_LABEL: Record<ProductDetailProps['kind'], { label: string; Icon: typeof Package }> = {
    simple: { label: 'Producto', Icon: Package },
    presentaciones: { label: 'Con presentaciones', Icon: Layers },
    combo: { label: 'Combo', Icon: Gift },
    presentacion: { label: 'Presentación', Icon: Layers },
}

/* ── La medida del ancho vive aquí y no en globals.css ── */
const LAYOUT_CSS = `
.pdv { position: relative; max-width: 680px; margin: 0 auto; padding: 24px 16px 40px; container-type: inline-size; }
.pdv-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; position: relative; }
.pdv-grid { position: relative; }
.pdv-name { font-size: 26px; }
.pdv-price { font-size: 20px; }
.pdv-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 18px; }

@media (min-width: 768px) {
    .pdv { padding-left: 32px; padding-right: 32px; }
}
@media (min-width: 1024px) {
    .pdv { max-width: 1240px; padding: 28px 40px 64px; }
    .pdv-top { margin-bottom: 24px; }
}

/* Se mide el ancho disponible, no el de la pantalla: la barra
   lateral de la app se lleva 325 px que no se pueden usar */
@container (min-width: 840px) {
    .pdv-grid { display: grid; grid-template-columns: minmax(0, 440px) minmax(0, 1fr); gap: 44px; align-items: start; }
    .pdv-media { position: sticky; top: 24px; }
    /* El nombre arranca a la misma altura que la foto */
    .pdv-chips { margin-top: 0; }
    .pdv-name { font-size: 32px; }
    .pdv-price { font-size: 24px; }
    .pdv-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (min-width: 1080px) {
    .pdv-stats { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`

function Stat({ label, value, tone = 'default', hint }: { label: string; value: string; tone?: 'default' | 'accent' | 'warn' | 'error'; hint?: string }) {
    const color = tone === 'accent' ? 'var(--toul-accent)'
        : tone === 'warn' ? 'var(--toul-warning)'
            : tone === 'error' ? 'var(--toul-error)'
                : 'var(--toul-text)'
    return (
        <div className="toul-card" style={{ padding: '14px 16px', minWidth: 0 }}>
            <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0, whiteSpace: 'nowrap' }}>{label}</p>
            <p style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color, margin: '2px 0 0' }}>{value}</p>
            {hint && <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>{hint}</p>}
        </div>
    )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 2px' }}>{title}</h2>
            {hint && <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 10px' }}>{hint}</p>}
            {!hint && <div style={{ height: 10 }} />}
            {children}
        </section>
    )
}

export function ProductDetailView(props: ProductDetailProps) {
    const {
        kind, name, parent, categoryName, reference, images, priceLabel,
        cost, margin, stock, stockValue, presentations, components,
        sales, insight, movements, actions, backHref = '/products',
    } = props

    const [imageIndex, setImageIndex] = useState(0)
    const { label: kindLabel, Icon: KindIcon } = KIND_LABEL[kind]
    const hasImages = images.length > 0
    const lowStock = typeof stock === 'number' && stock > 0 && stock <= 3
    const outOfStock = stock === 0

    return (
        <div className="pdv">
            <style>{LAYOUT_CSS}</style>
            <div className="toul-ambient" />

            {/* ── Barra superior ── */}
            <div className="pdv-top">
                <Link href={backHref} aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                {actions}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: EASE_OUT_EMIL }}
                className="pdv-grid">

                {/* ── Foto ── */}
                <div className="pdv-media">
                    <div style={{
                        position: 'relative', width: '100%',
                        // Sin foto no tiene sentido reservar media pantalla
                        aspectRatio: hasImages ? '4 / 3' : undefined,
                        height: hasImages ? undefined : 150,
                        borderRadius: 20, overflow: 'hidden',
                        background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                        border: '1px solid var(--toul-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {hasImages ? (
                            <img src={images[imageIndex]} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <KindIcon size={44} style={{ color: 'var(--toul-text-faint)' }} />
                        )}

                        {images.length > 1 && (
                            <>
                                <button onClick={() => setImageIndex(i => (i - 1 + images.length) % images.length)} aria-label="Foto anterior"
                                    style={navButton('left')}><ChevronLeft size={18} /></button>
                                <button onClick={() => setImageIndex(i => (i + 1) % images.length)} aria-label="Foto siguiente"
                                    style={navButton('right')}><ChevronRight size={18} /></button>
                                <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                                    {images.map((_, i) => (
                                        <span key={i} style={{
                                            width: i === imageIndex ? 18 : 6, height: 6, borderRadius: 999,
                                            background: i === imageIndex ? 'var(--toul-accent)' : 'rgba(255,255,255,0.4)',
                                            transition: 'width 200ms var(--toul-ease)',
                                        }} />
                                    ))}
                                </div>
                            </>
                        )}

                        {outOfStock && (
                            <span style={{
                                position: 'absolute', top: 12, left: 12, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                                textTransform: 'uppercase', color: 'var(--toul-text-muted)', background: 'rgba(10,10,10,0.75)',
                                backdropFilter: 'blur(8px)', borderRadius: 999, padding: '5px 11px',
                            }}>
                                Sin stock
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Información ── */}
                <div className="pdv-body">
                    <div className="pdv-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0 6px' }}>
                        <span style={chip()}><KindIcon size={13} /> {kindLabel}</span>
                        {categoryName && <span style={chip()}>{categoryName}</span>}
                        {reference && <span style={chip()}>Ref. {reference}</span>}
                    </div>

                    {parent && (
                        <Link href={parent.href}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none',
                                fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', marginBottom: 2,
                            }}>
                            <ChevronLeft size={13} /> {parent.name}
                        </Link>
                    )}

                    <h1 className="pdv-name" style={{ fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '0 0 4px', textWrap: 'balance' }}>
                        {name}
                    </h1>
                    <p className="pdv-price" style={{ fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-accent)', margin: 0 }}>
                        {priceLabel}
                    </p>

                    {/* ── Números ── */}
                    <div className="pdv-stats">
                        {typeof cost === 'number' && <Stat label="Costo promedio" value={formatCOP(cost)} />}
                        {typeof margin === 'number' && (
                            <Stat
                                label="Margen"
                                value={`${Math.round(margin)}%`}
                                tone={margin >= 35 ? 'accent' : margin >= 15 ? 'warn' : 'error'}
                            />
                        )}
                        {typeof stock === 'number' && (
                            <Stat
                                label="Stock"
                                value={`${stock} und`}
                                tone={outOfStock ? 'error' : lowStock ? 'warn' : 'default'}
                                hint={lowStock ? 'Quedan pocas' : undefined}
                            />
                        )}
                        {typeof stockValue === 'number' && <Stat label="Valor guardado" value={formatCOP(stockValue)} />}
                    </div>

                    {/* ── Presentaciones ── */}
                    {presentations && presentations.length > 0 && (
                        <Section
                            title={kind === 'presentacion' ? 'Otras presentaciones' : 'Presentaciones'}
                            hint={kind === 'presentacion'
                                ? 'El mismo producto en otras medidas.'
                                : 'El mismo producto en distintas medidas. Cada una tiene su precio y su stock.'}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {presentations.map(item => {
                                    const body = (
                                        <>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)' }}>{item.name}</span>
                                                <span style={{ display: 'block', fontSize: 13, color: item.stock === 0 ? 'var(--toul-error)' : item.stock <= 3 ? 'var(--toul-warning)' : 'var(--toul-text-dim)' }}>
                                                    {item.stock === 0 ? 'Sin stock' : `${item.stock} und`}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-accent)' }}>
                                                {formatCOP(item.price)}
                                            </span>
                                            {item.href && <ChevronRight size={16} style={{ color: 'var(--toul-text-dim)', flexShrink: 0 }} />}
                                        </>
                                    )
                                    return item.href ? (
                                        <Link key={item.id} href={item.href} className="toul-card toul-card-interactive"
                                            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                                            {body}
                                        </Link>
                                    ) : (
                                        <div key={item.id} className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {body}
                                        </div>
                                    )
                                })}
                            </div>
                        </Section>
                    )}

                    {/* ── Qué trae el combo ── */}
                    {components && components.length > 0 && (
                        <Section title="Qué trae" hint="Al vender el combo se descuenta cada uno de estos productos.">
                            <div className="toul-card" style={{ padding: '4px 16px' }}>
                                {components.map((item, i) => (
                                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none' }}>
                                        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--toul-text)' }}>{item.name}</span>
                                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text-muted)' }}>×{item.quantity}</span>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* ── Cómo se vende ── */}
                    {sales && (
                        <Section title="Cómo se está vendiendo">
                            <div className="toul-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' }}>
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Unidades ({sales.days} días)</p>
                                    <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 0' }}>{sales.units}</p>
                                </div>
                                <div>
                                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Vendido</p>
                                    <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 0' }}>{formatCOP(sales.revenue)}</p>
                                </div>
                            </div>
                            {insight && (
                                <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', lineHeight: 1.5, margin: '10px 4px 0' }}>{insight}</p>
                            )}
                        </Section>
                    )}

                    {/* ── Movimientos ── */}
                    {movements && movements.length > 0 && (
                        <Section title="Movimientos recientes">
                            <div className="toul-card" style={{ padding: '4px 16px' }}>
                                {movements.map((movement, i) => (
                                    <div key={movement.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none' }}>
                                        <span style={{ minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--toul-text)' }}>{movement.label}</span>
                                            <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)' }}>{movement.date}</span>
                                        </span>
                                        <span style={{ fontSize: 15, fontWeight: 700, color: movement.quantity >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                            {movement.quantity >= 0 ? '+' : '−'}{Math.abs(movement.quantity)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

/** Esqueleto de carga con la misma forma que la pantalla real. */
export function ProductDetailSkeleton() {
    return (
        <div className="pdv">
            <style>{LAYOUT_CSS}</style>
            <div className="pdv-top">
                <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 12 }} />
                <div className="skeleton" style={{ width: 190, height: 40, borderRadius: 12 }} />
            </div>
            <div className="pdv-grid">
                <div className="pdv-media">
                    <div className="skeleton" style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 20 }} />
                </div>
                <div className="pdv-body">
                    <div className="skeleton" style={{ width: 180, height: 26, borderRadius: 999, margin: '16px 0 10px' }} />
                    <div className="skeleton" style={{ width: '70%', height: 32, borderRadius: 10 }} />
                    <div className="skeleton" style={{ width: 140, height: 24, borderRadius: 10, marginTop: 8 }} />
                    <div className="pdv-stats">
                        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />)}
                    </div>
                    <div className="skeleton" style={{ height: 150, borderRadius: 16, marginTop: 26 }} />
                </div>
            </div>
        </div>
    )
}

/* ── Estilos compartidos ── */

const chip = (): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 500, color: 'var(--toul-text-muted)',
    border: '1px solid var(--toul-border)', borderRadius: 999, padding: '5px 11px',
})

const navButton = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 10, width: 36, height: 36, borderRadius: 12, border: 'none',
    background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(10px)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
})
