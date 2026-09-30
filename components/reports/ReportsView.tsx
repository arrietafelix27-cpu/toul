'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronDown, TrendingUp, TrendingDown, Info, ArrowRight } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { EASE_OUT_EMIL } from '@/components/ui'
import type { ReportData, ProductLine } from '@/lib/reports/types'

/* ══════════════════════════════════════════════════════════════
   Reportes — la pregunta que responde esta pantalla es simple:
   ¿gané o perdí, y dónde se me está yendo la plata?
   Todo lo demás se subordina a eso.
   ══════════════════════════════════════════════════════════════ */

export type Period = 'today' | 'week' | 'month' | 'year' | 'custom'

export const PERIODS: { value: Period; label: string; previous: string }[] = [
    { value: 'today', label: 'Hoy', previous: 'ayer' },
    { value: 'week', label: 'Semana', previous: 'la semana pasada' },
    { value: 'month', label: 'Mes', previous: 'el mes pasado' },
    { value: 'year', label: 'Año', previous: 'el año pasado' },
    { value: 'custom', label: 'Rango', previous: 'el período anterior' },
]

const pct = (current: number, previous: number): number | null => {
    if (!previous) return null
    return ((current - previous) / Math.abs(previous)) * 100
}

/* ── Piezas ─────────────────────────────────────────────── */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <section style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 2px' }}>{title}</h2>
            {hint && <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 12px', lineHeight: 1.45 }}>{hint}</p>}
            {!hint && <div style={{ height: 12 }} />}
            {children}
        </section>
    )
}

/** `lowerIsBetter` para gastos: bajar es bueno, aunque la flecha apunte hacia abajo. */
function Delta({ value, suffix, lowerIsBetter = false }: { value: number | null; suffix: string; lowerIsBetter?: boolean }) {
    if (value === null || !isFinite(value)) {
        return <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>sin comparación con {suffix}</span>
    }
    const up = value >= 0
    const good = lowerIsBetter ? !up : up
    const Icon = up ? TrendingUp : TrendingDown
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: good ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
            <Icon size={14} />
            {up ? '+' : ''}{Math.round(value)}%
            <span style={{ fontWeight: 400, color: 'var(--toul-text-dim)' }}>vs {suffix}</span>
        </span>
    )
}

/** Una línea de la cadena: ventas → costo → bruta → gastos → final */
function ChainRow({ label, help, amount, tone = 'neutral', strong, sign }: {
    label: string
    help?: string
    amount: number
    tone?: 'neutral' | 'out' | 'good' | 'bad'
    strong?: boolean
    sign?: '−' | '='
}) {
    const color = tone === 'out' ? 'var(--toul-error)'
        : tone === 'good' ? 'var(--toul-accent)'
            : tone === 'bad' ? 'var(--toul-error)'
                : 'var(--toul-text)'
    return (
        <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14,
            padding: strong ? '14px 0' : '11px 0',
            borderTop: strong ? '1px solid var(--toul-border)' : 'none',
        }}>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: strong ? 16 : 15, fontWeight: strong ? 700 : 500, color: strong ? 'var(--toul-text)' : 'var(--toul-text-muted)', letterSpacing: strong ? '-0.01em' : undefined }}>
                    {label}
                </span>
                {help && <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)', marginTop: 2 }}>{help}</span>}
            </span>
            <span style={{ fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 600, letterSpacing: '-0.02em', color, whiteSpace: 'nowrap' }}>
                {sign === '−' ? '− ' : ''}{formatCOP(Math.abs(amount))}
            </span>
        </div>
    )
}

function BarList({ items, total, emptyText }: { items: { label: string; amount: number }[]; total: number; emptyText: string }) {
    if (items.length === 0) {
        return <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', margin: 0 }}>{emptyText}</p>
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((item, i) => {
                const share = total > 0 ? (item.amount / total) * 100 : 0
                return (
                    <div key={item.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--toul-text)' }}>{item.label}</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', whiteSpace: 'nowrap' }}>
                                {formatCOP(item.amount)}
                                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)', marginLeft: 6 }}>{Math.round(share)}%</span>
                            </span>
                        </div>
                        <div style={{ height: 8, borderRadius: 999, background: 'var(--toul-surface-2)', overflow: 'hidden' }}>
                            <motion.div
                                initial={{ width: 0 }} animate={{ width: `${Math.max(2, share)}%` }}
                                transition={{ duration: 0.5, ease: EASE_OUT_EMIL, delay: Math.min(i, 6) * 0.05 }}
                                style={{ height: '100%', borderRadius: 999, background: 'var(--toul-accent)', opacity: 1 - Math.min(i, 5) * 0.13 }}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function ProductTable({ rows, emptyText, highlightLow }: { rows: ProductLine[]; emptyText: string; highlightLow?: boolean }) {
    if (rows.length === 0) {
        return <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', margin: 0 }}>{emptyText}</p>
    }
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                    <tr>
                        {['Producto', 'Vendidos', 'Vendiste', 'Te dejó', 'Margen'].map((head, i) => (
                            <th key={head} style={{
                                textAlign: i === 0 ? 'left' : 'right', padding: '0 0 8px',
                                fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)',
                            }}>
                                {head}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const marginColor = row.margin >= 35 ? 'var(--toul-margin-high)'
                            : row.margin >= 15 ? 'var(--toul-margin-mid)' : 'var(--toul-margin-low)'
                        return (
                            <tr key={row.id} style={{ borderTop: '1px solid var(--toul-divider)' }}>
                                <td style={{ padding: '11px 8px 11px 0', fontSize: 14, fontWeight: 500, color: 'var(--toul-text)' }}>{row.name}</td>
                                <td style={{ padding: '11px 0', textAlign: 'right', fontSize: 14, color: 'var(--toul-text-muted)' }}>{row.units}</td>
                                <td style={{ padding: '11px 0 11px 12px', textAlign: 'right', fontSize: 14, color: 'var(--toul-text-muted)' }}>{formatCOP(row.revenue)}</td>
                                <td style={{ padding: '11px 0 11px 12px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: row.profit >= 0 ? 'var(--toul-text)' : 'var(--toul-error)' }}>{formatCOP(row.profit)}</td>
                                <td style={{ padding: '11px 0 11px 12px', textAlign: 'right', fontSize: 14, fontWeight: 600, color: highlightLow ? marginColor : 'var(--toul-text-muted)' }}>
                                    {Math.round(row.margin)}%
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

/* ── Pantalla ───────────────────────────────────────────── */

export function ReportsView({ data, loading, period, periodLabel }: {
    data: ReportData | null
    loading: boolean
    period: Period
    periodLabel: string
}) {
    const [showHow, setShowHow] = useState(false)

    if (loading || !data) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="skeleton" style={{ height: 160, borderRadius: 20 }} />
                <div className="skeleton" style={{ height: 260, borderRadius: 20 }} />
                <div className="skeleton" style={{ height: 200, borderRadius: 20 }} />
            </div>
        )
    }

    const { current: c, previous: p } = data
    const previousLabel = PERIODS.find(x => x.value === period)?.previous ?? 'el período anterior'
    const won = c.netProfit >= 0
    const noData = c.revenue === 0 && c.expenses === 0

    if (noData) {
        return (
            <div className="toul-card" style={{ textAlign: 'center', padding: '48px 22px' }}>
                <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Sin movimientos en {periodLabel.toLowerCase()}</p>
                <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '6px 0 18px', lineHeight: 1.5 }}>
                    Cuando registres ventas o gastos, aquí verás si estás ganando o perdiendo y en qué se te va la plata.
                </p>
                <Link href="/caja" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 14,
                    background: 'var(--toul-accent)', color: '#000', fontSize: 15, fontWeight: 600, textDecoration: 'none',
                }}>
                    Ir a la caja <ArrowRight size={16} />
                </Link>
            </div>
        )
    }

    /* ── 1. ¿Gané o perdí? ── */
    const heroBg = won ? 'var(--toul-accent-dim)' : 'var(--toul-error-dim)'
    const heroColor = won ? 'var(--toul-accent)' : 'var(--toul-error)'

    return (
        <div>
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT_EMIL }}
                style={{ borderRadius: 22, padding: '24px 22px', background: heroBg, border: won ? '1px solid var(--toul-border-focused)' : '1px solid rgba(255,69,58,0.2)' }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--toul-text-muted)', margin: 0 }}>
                    {won ? `Ganaste en ${periodLabel.toLowerCase()}` : `Perdiste en ${periodLabel.toLowerCase()}`}
                </p>
                <p style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.1, color: heroColor, margin: '2px 0 8px' }}>
                    {formatCOP(Math.abs(c.netProfit))}
                </p>
                <Delta value={pct(c.netProfit, p.netProfit)} suffix={previousLabel} />
                <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                    Es lo que queda después de pagar la mercancía que vendiste y los gastos del negocio.
                </p>
            </motion.div>

            {/* ── 2. La cadena completa ── */}
            <Section title="De dónde sale ese número" hint="Se lee de arriba hacia abajo: cada línea le quita algo a la anterior.">
                <div className="toul-card" style={{ padding: '6px 18px 14px' }}>
                    <ChainRow
                        label="Vendiste"
                        help={`${c.salesCount} ${c.salesCount === 1 ? 'venta' : 'ventas'} · ${c.unitsSold} und · ticket promedio ${formatCOP(c.avgTicket)}`}
                        amount={c.revenue}
                    />
                    <ChainRow
                        label="Te costó esa mercancía"
                        help="Lo que pagaste por los productos que vendiste"
                        amount={c.cogs}
                        tone="out"
                        sign="−"
                    />
                    <ChainRow
                        label="Ganancia bruta"
                        help={`${Math.round(c.grossMargin)}% de lo que vendiste`}
                        amount={c.grossProfit}
                        strong
                        tone={c.grossProfit >= 0 ? 'good' : 'bad'}
                    />
                    <ChainRow
                        label="Gastos del negocio"
                        help="Arriendo, servicios, domicilios, publicidad…"
                        amount={c.expenses}
                        tone="out"
                        sign="−"
                    />
                    <ChainRow
                        label={won ? 'Te quedó' : 'Perdiste'}
                        amount={c.netProfit}
                        strong
                        tone={won ? 'good' : 'bad'}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                    {[
                        { label: 'Ventas', value: c.revenue, prev: p.revenue, lowerIsBetter: false },
                        { label: 'Ganancia bruta', value: c.grossProfit, prev: p.grossProfit, lowerIsBetter: false },
                        { label: 'Gastos', value: c.expenses, prev: p.expenses, lowerIsBetter: true },
                    ].map(item => (
                        <div key={item.label} className="toul-card" style={{ padding: '14px 16px' }}>
                            <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>{item.label}</p>
                            <p style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 4px' }}>
                                {formatCOP(item.value)}
                            </p>
                            <Delta value={pct(item.value, item.prev)} suffix={previousLabel} lowerIsBetter={item.lowerIsBetter} />
                        </div>
                    ))}
                </div>
            </Section>

            {/* ── 3. Dónde se va la plata ── */}
            <Section title="Dónde se te va la plata" hint="Tus gastos, ordenados de mayor a menor.">
                <div className="toul-card">
                    <BarList
                        items={data.expensesByCategory}
                        total={c.expenses}
                        emptyText="No registraste gastos en este período."
                    />
                </div>

                {c.inventoryPurchases > 0 && (
                    <div className="toul-card" style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <Info size={17} style={{ color: 'var(--toul-info)', flexShrink: 0, marginTop: 2 }} />
                        <div>
                            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                                Compraste {formatCOP(c.inventoryPurchases)} en mercancía
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '3px 0 0', lineHeight: 1.5 }}>
                                Eso no es un gasto: es plata que cambió de forma y hoy está guardada en tu inventario.
                                Se vuelve costo cuando vendes el producto.
                            </p>
                        </div>
                    </div>
                )}
            </Section>

            {/* ── 4. Qué deja plata ── */}
            <Section title="Lo que más te deja" hint="Ordenado por la ganancia que te dejó cada producto, no por cuánto vendiste.">
                <div className="toul-card">
                    <ProductTable rows={data.topProducts} emptyText="Aún no hay ventas en este período." />
                </div>
            </Section>

            {data.worstProducts.length > 0 && (
                <Section title="Lo que menos te deja" hint="Revisa si el precio está muy bajo o el costo muy alto.">
                    <div className="toul-card">
                        <ProductTable rows={data.worstProducts} emptyText="Sin datos." highlightLow />
                    </div>
                </Section>
            )}

            {/* ── 5. Pendientes ── */}
            <Section title="Lo que te deben y lo que debes" hint="Esto no depende del período: es lo que está pendiente hoy.">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                    {([
                        { title: 'Te deben', total: data.receivables.total, rows: data.receivables.top, color: 'var(--toul-accent)', empty: 'Nadie te debe. Bien ahí.', href: '/customers' },
                        { title: 'Debes', total: data.payables.total, rows: data.payables.top, color: 'var(--toul-error)', empty: 'No le debes a ningún proveedor.', href: '/providers' },
                    ]).map(box => (
                        <Link key={box.title} href={box.href} className="toul-card toul-card-interactive" style={{ textDecoration: 'none', display: 'block' }}>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>{box.title}</p>
                            <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: box.color, margin: '2px 0 10px' }}>
                                {formatCOP(box.total)}
                            </p>
                            {box.rows.length === 0 ? (
                                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>{box.empty}</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {box.rows.map(row => (
                                        <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                                            <span style={{ color: 'var(--toul-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
                                            <span style={{ color: 'var(--toul-text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCOP(row.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            </Section>

            {/* ── 6. Inventario ── */}
            <Section title="Tu plata guardada" hint="Lo que tienes en mercancía, valorado a lo que te costó.">
                <div className="toul-card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' }}>
                    <div>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>Valor del inventario</p>
                        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 0' }}>
                            {formatCOP(data.inventory.value)}
                        </p>
                    </div>
                    <div>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>Unidades</p>
                        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 0' }}>
                            {data.inventory.units}
                        </p>
                    </div>
                    <div>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>Con stock bajo</p>
                        <p style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: data.inventory.lowStock > 0 ? 'var(--toul-warning)' : 'var(--toul-text)', margin: '2px 0 0' }}>
                            {data.inventory.lowStock}
                        </p>
                    </div>
                </div>

                {data.inventory.stale.length > 0 && (
                    <div className="toul-card" style={{ marginTop: 10 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: '0 0 2px' }}>Plata quieta</p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '0 0 12px' }}>
                            Con stock y sin una sola venta en este período.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {data.inventory.stale.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name}
                                        <span style={{ color: 'var(--toul-text-dim)', marginLeft: 8 }}>{item.stock} und</span>
                                    </span>
                                    <span style={{ color: 'var(--toul-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatCOP(item.value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Section>

            {/* ── Cómo se calcula ── */}
            <button
                onClick={() => setShowHow(v => !v)}
                style={{
                    width: '100%', marginTop: 28, padding: '14px 16px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 14, fontWeight: 500,
                }}>
                ¿Cómo se calculan estos números?
                <ChevronDown size={17} style={{ transform: showHow ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--toul-ease)' }} />
            </button>

            {showHow && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}
                    className="toul-card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                        ['Vendiste', 'Suma de todas las ventas del período, incluidas las fiadas. Las ventas anuladas no cuentan.'],
                        ['Te costó esa mercancía', 'Lo que pagaste por cada producto vendido, usando su costo promedio al momento de la venta.'],
                        ['Gastos', 'Solo lo que registras en Gastos. Comprar mercancía no es gasto.'],
                        ['Comprar inventario', 'No resta ganancia: la plata pasa de tu bolsillo a tu bodega. Resta cuando vendes.'],
                        ['Te deben / debes', 'Es el saldo pendiente de hoy, sin importar el período que estés viendo.'],
                    ].map(([title, text]) => (
                        <div key={title}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{title}</p>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '2px 0 0', lineHeight: 1.5 }}>{text}</p>
                        </div>
                    ))}
                </motion.div>
            )}
        </div>
    )
}
