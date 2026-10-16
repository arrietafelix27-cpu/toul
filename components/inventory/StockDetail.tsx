'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, ChevronLeft, Package, Pencil, ShoppingCart, SlidersHorizontal, Tag } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'

/* ══════════════════════════════════════════════════════════════
   Detalle de inventario.
   Responde solo lo del stock: cuánto hay, cuánto te dura, qué se
   movió y cuándo deberías volver a comprar. Los precios y el
   margen viven en el catálogo.
   ══════════════════════════════════════════════════════════════ */

export interface StockPresentation {
    id: string
    name: string
    stock: number
    href: string
}

export interface StockMovement {
    id: string
    label: string
    quantity: number
    date: string
    /** Quién lo movió */
    author?: string | null
}

export interface StockDetailProps {
    name: string
    parent?: { name: string; href: string } | null
    reference?: string | null
    image?: string | null
    stock: number
    cost: number
    /** Lo que se vendió en los últimos 30 días */
    sold30d: number
    /** Mínimo que manda hoy (automático o puesto a mano) */
    minStock: number
    /** El que puso el dueño, si lo hay */
    manualMin: number | null
    coverageDays: number
    presentations?: StockPresentation[]
    movements: StockMovement[]
    backHref: string
    catalogHref: string
    buyHref: string
    onAdjust: () => void
    onSaveMin: (value: number | null) => Promise<void>
    /** Un producto con presentaciones no se ajusta ni se cuenta por sí mismo */
    readOnlyStock?: boolean
    extra?: ReactNode
}

const CSS = PANEL_CSS + `
.sd-wrap { position: relative; max-width: 680px; margin: 0 auto; padding: 24px 16px 48px; }
@media (min-width: 768px) { .sd-wrap { padding-left: 32px; padding-right: 32px; } }
.sd-stat { padding: 14px 16px; border-radius: 16px; background: var(--toul-surface); border: 1px solid var(--toul-border); min-width: 0; }
.sd-min { width: 76px; height: 38px; border-radius: 11px; padding: 0 12px; font-family: inherit;
    background: var(--toul-surface-2); border: 1px solid var(--toul-border); color: var(--toul-text);
    font-size: 15px; font-weight: 600; outline: none; }
`

export function StockDetail(props: StockDetailProps) {
    const {
        name, parent, reference, image, stock, cost, sold30d, minStock, manualMin, coverageDays,
        presentations, movements, backHref, catalogHref, buyHref, onAdjust, onSaveMin, readOnlyStock, extra,
    } = props

    const [editingMin, setEditingMin] = useState(false)
    const [minDraft, setMinDraft] = useState(String(minStock))
    const [savingMin, setSavingMin] = useState(false)

    const perDay = sold30d / 30
    const daysLeft = perDay > 0 ? Math.floor(stock / perDay) : null
    const state = stock <= 0 ? 'zero' : stock <= minStock ? 'low' : 'ok'
    const tone = state === 'zero' ? 'var(--toul-error)' : state === 'low' ? 'var(--toul-warning)' : 'var(--toul-accent)'
    const estado = state === 'zero' ? 'Se agotó' : state === 'low' ? 'Por acabarse' : 'Con existencias'

    async function saveMin(value: number | null) {
        setSavingMin(true)
        await onSaveMin(value)
        setSavingMin(false)
        setEditingMin(false)
    }

    return (
        <div className="sd-wrap">
            <style>{CSS}</style>
            <div className="toul-ambient" />

            {/* ── Barra superior ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, position: 'relative' }}>
                <Link href={backHref} aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div style={{ display: 'flex', gap: 8 }}>
                    {!readOnlyStock && (
                        <button className="pnl-pill" style={{ height: 38, fontSize: 13 }} onClick={onAdjust}>
                            <SlidersHorizontal size={14} /> Ajustar
                        </button>
                    )}
                    <Link href={buyHref}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 11,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 13.5, fontWeight: 600,
                            textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 18px var(--toul-accent-glow)',
                        }}>
                        <ShoppingCart size={15} /> Comprar
                    </Link>
                </div>
            </div>

            {/* ── Identidad ── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, position: 'relative' }}>
                <span style={{
                    width: 56, height: 56, borderRadius: 16, flexShrink: 0, overflow: 'hidden', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                }}>
                    {image
                        ? <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Package size={22} style={{ color: 'var(--toul-text-faint)' }} />}
                </span>
                <div style={{ minWidth: 0 }}>
                    {parent && (
                        <Link href={parent.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--toul-text-dim)', textDecoration: 'none' }}>
                            <ChevronLeft size={12} /> {parent.name}
                        </Link>
                    )}
                    <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '1px 0 0', textWrap: 'balance' }}>
                        {name}
                    </h1>
                    {reference && (
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>Ref. {reference}</p>
                    )}
                </div>
            </motion.div>

            {/* ── Cuánto hay ── */}
            <div className="sd-stat" style={{ padding: '18px 20px', marginBottom: 10 }}>
                <p className="pnl-label" style={{ marginBottom: 4 }}>En bodega</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.04em', color: tone, lineHeight: 1 }}>{stock}</span>
                    <span style={{ fontSize: 14, color: 'var(--toul-text-dim)', paddingBottom: 3 }}>
                        {stock === 1 ? 'unidad' : 'unidades'}
                    </span>
                    <span style={{
                        marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                        background: state === 'ok' ? 'var(--toul-accent-dim)' : state === 'low' ? 'var(--toul-warning-dim)' : 'rgba(239,68,68,0.12)',
                        color: tone,
                    }}>
                        {estado}
                    </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '8px 0 0' }}>
                    {formatCOP(Math.round(stock * cost))} guardados · costo {formatCOP(cost)} c/u
                </p>
            </div>

            {/* ── Cuánto te dura ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 10 }}>
                <div className="sd-stat">
                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Salieron en 30 días</p>
                    <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 0' }}>{sold30d}</p>
                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                        {perDay > 0 ? `${(perDay * 7).toFixed(1)} por semana` : 'no se ha vendido'}
                    </p>
                </div>
                <div className="sd-stat">
                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Te dura</p>
                    <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', margin: '2px 0 0', color: daysLeft !== null && daysLeft <= coverageDays ? 'var(--toul-warning)' : 'var(--toul-text)' }}>
                        {daysLeft !== null ? `${daysLeft} días` : '—'}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                        {daysLeft !== null ? 'al ritmo de ahora' : 'sin ventas recientes'}
                    </p>
                </div>
            </div>

            {/* ── Cuándo avisar ── */}
            {!readOnlyStock && (
                <div className="sd-stat" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            Avisarme cuando queden {minStock} o menos
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0', lineHeight: 1.45 }}>
                            {manualMin === null
                                ? `Calculado por lo que vendes, para ${coverageDays} días de respaldo`
                                : 'Lo fijaste tú'}
                        </p>
                    </div>
                    {editingMin ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            {/* Entra con el número actual escogido: escribir lo reemplaza */}
                            <input className="sd-min" type="text" inputMode="numeric" autoFocus value={minDraft}
                                onFocus={event => event.target.select()}
                                onChange={event => setMinDraft(event.target.value.replace(/[^0-9]/g, ''))} />
                            <button className="pnl-pill" disabled={savingMin}
                                onClick={() => saveMin(minDraft === '' ? null : Number(minDraft))}>
                                <Check size={14} /> Listo
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {manualMin !== null && (
                                <button className="pnl-pill" onClick={() => saveMin(null)} disabled={savingMin}>Automático</button>
                            )}
                            <button className="pnl-pill" onClick={() => { setMinDraft(String(minStock)); setEditingMin(true) }}>
                                <Pencil size={13} /> Cambiar
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Presentaciones ── */}
            {presentations && presentations.length > 0 && (
                <section style={{ marginTop: 20 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Existencias por presentación</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {presentations.map(item => (
                            <Link key={item.id} href={item.href} className="pnl-row">
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{item.name}</span>
                                <span style={{ fontSize: 15, fontWeight: 700, color: item.stock <= 0 ? 'var(--toul-error)' : 'var(--toul-text-muted)' }}>
                                    {item.stock}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {extra}

            {/* ── Qué se movió ── */}
            <section style={{ marginTop: 20 }}>
                <p className="pnl-label" style={{ marginBottom: 8 }}>Movimientos</p>
                {movements.length === 0 ? (
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: 0, padding: '18px 10px', textAlign: 'center' }}>
                        Todavía no se ha movido nada.
                    </p>
                ) : (
                    <div style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', borderRadius: 16, padding: '2px 16px' }}>
                        {movements.map((movement, i) => (
                            <div key={movement.id}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none' }}>
                                <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--toul-text)' }}>{movement.label}</span>
                                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                                        {movement.date}{movement.author ? ` · ${movement.author}` : ''}
                                    </span>
                                </span>
                                <span style={{ fontSize: 14.5, fontWeight: 700, color: movement.quantity >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {movement.quantity >= 0 ? '+' : '−'}{Math.abs(movement.quantity)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <div style={{ marginTop: 20 }}>
                <Link href={catalogHref} className="pnl-link">
                    <Tag size={13} /> Ver precio y margen en el catálogo
                </Link>
            </div>
        </div>
    )
}

/** Esqueleto con la misma forma que la pantalla real. */
export function StockDetailSkeleton() {
    return (
        <div className="sd-wrap" style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px 48px' }}>
            <div className="skeleton" style={{ height: 36, width: 36, borderRadius: 12, marginBottom: 18 }} />
            <div className="skeleton" style={{ height: 56, borderRadius: 16, marginBottom: 18 }} />
            <div className="skeleton" style={{ height: 110, borderRadius: 16, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 86, borderRadius: 16 }} />
        </div>
    )
}
