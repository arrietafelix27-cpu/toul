'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Info, Plus } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

/* ══════════════════════════════════════════════════════════════
   Resumen del periodo.
   Tres datos y nada más: cuántas ventas, cuánto se gastó y
   cuánto quedó. Cada uno con un segundo renglón que explica.

   Por defecto muestra la utilidad BRUTA: un día de arriendo no
   puede hacerle creer al dueño que el negocio va en pérdida.
   ══════════════════════════════════════════════════════════════ */

export interface FinancialSummaryMetrics {
    salesCount: number
    unitsSold: number
    creditAmount: number
    expenses: number
    expensesTopCategory: string | null
    grossProfit: number
    netProfit: number
    revenue: number
    prevGrossProfit: number
    prevNetProfit: number
}

type ProfitKind = 'bruta' | 'neta'
const STORAGE_KEY = 'toul-utilidad'

const CATEGORY_LABEL: Record<string, string> = {
    publicidad: 'publicidad',
    transporte: 'transporte',
    compras: 'compras',
    servicios: 'servicios',
    otros: 'otros gastos',
}

const CSS = `
.fs-root { position: relative; height: 100%; display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
    border: 1px solid var(--toul-border); border-left-color: transparent; }
/* Se funde con el gráfico por la izquierda y se vuelve sólido a la derecha */
.fs-root::before {
    content: ''; position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.012) 28%, var(--toul-surface) 62%, var(--toul-surface) 100%);
}
.fs-root::after {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 1px; z-index: 1; pointer-events: none;
    background: linear-gradient(to bottom, transparent, var(--toul-border) 45%, var(--toul-border));
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 40%, #000);
    mask-image: linear-gradient(to bottom, transparent, #000 40%, #000);
}
.fs-body { position: relative; z-index: 2; display: flex; flex-direction: column; height: 100%; padding: 18px 20px; }

.fs-add { width: 28px; height: 28px; border-radius: 9px; flex-shrink: 0; border: 1px solid var(--toul-border);
    background: transparent; color: var(--toul-text-dim); cursor: pointer;
    display: flex; align-items: center; justify-content: center; text-decoration: none;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.fs-add:active { transform: scale(0.92); }

.fs-switch { display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent; padding: 0;
    font-family: inherit; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--toul-text-subtle); cursor: pointer;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
.fs-info { border: none; background: transparent; padding: 0; cursor: pointer; color: var(--toul-text-faint); display: flex;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }

@media (hover: hover) and (pointer: fine) {
    .fs-add:hover { background: var(--toul-accent-dim); color: var(--toul-accent); border-color: var(--toul-accent-dim); }
    .fs-switch:hover, .fs-info:hover { color: var(--toul-text-muted); }
}
@media (prefers-reduced-motion: reduce) { .fs-add:active { transform: none; } }
`

function Delta({ value, previous }: { value: number; previous: number }) {
    if (!previous) return null
    const change = Math.round(((value - previous) / Math.abs(previous)) * 100)
    if (!Number.isFinite(change) || change === 0) return null
    const up = change > 0
    return (
        <span style={{ color: up ? 'var(--toul-accent)' : 'var(--toul-error)', fontWeight: 600 }}>
            {up ? '▲' : '▼'} {Math.abs(change)}%
        </span>
    )
}

function Block({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--toul-text-subtle)' }}>
                    {label}
                </span>
                {action}
            </div>
            {children}
        </div>
    )
}

export function FinancialSummary({ metrics, loading, periodLabel }: {
    metrics: FinancialSummaryMetrics
    loading: boolean
    periodLabel?: string
}) {
    // La preferencia se queda: si prefieres ver la neta, no te la cambio
    const [kind, setKind] = useState<ProfitKind>('bruta')
    const [showInfo, setShowInfo] = useState(false)

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY)
            if (saved === 'bruta' || saved === 'neta') setKind(saved)
        } catch { /* modo privado */ }
    }, [])

    const switchKind = () => {
        const next: ProfitKind = kind === 'bruta' ? 'neta' : 'bruta'
        setKind(next)
        try { localStorage.setItem(STORAGE_KEY, next) } catch { /* modo privado */ }
    }

    const profit = kind === 'bruta' ? metrics.grossProfit : metrics.netProfit
    const prevProfit = kind === 'bruta' ? metrics.prevGrossProfit : metrics.prevNetProfit
    const margin = metrics.revenue > 0 ? Math.round((profit / metrics.revenue) * 100) : null
    const negative = profit < 0

    return (
        <div className="fs-root">
            <style>{CSS}</style>

            <div className="fs-body">
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--toul-text-faint)', margin: '0 0 14px' }}>
                    Resumen {periodLabel ?? 'del periodo'}
                </p>

                {/* ── Ventas ── */}
                <Block label="Ventas">
                    {loading ? <Skeleton width="60px" height="1.75rem" /> : (
                        <>
                            <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.1 }}>
                                {metrics.salesCount}
                            </p>
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                {metrics.unitsSold} {metrics.unitsSold === 1 ? 'unidad' : 'unidades'}
                            </p>
                            {metrics.creditAmount > 0 && (
                                <p style={{ fontSize: 12.5, color: 'var(--toul-warning)', margin: '1px 0 0' }}>
                                    {formatCOP(metrics.creditAmount)} quedaron fiados
                                </p>
                            )}
                        </>
                    )}
                </Block>

                <div style={{ height: 1, background: 'var(--toul-divider)', margin: '14px 0' }} />

                {/* ── Gastos ── */}
                <Block
                    label="Gastos"
                    action={
                        <Link href="/expenses" className="fs-add" aria-label="Registrar un gasto" title="Registrar un gasto">
                            <Plus size={15} strokeWidth={2.4} />
                        </Link>
                    }>
                    {loading ? <Skeleton width="90px" height="1.75rem" /> : (
                        <>
                            <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1, color: metrics.expenses > 0 ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>
                                {formatCOP(metrics.expenses)}
                            </p>
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                {metrics.expenses === 0
                                    ? 'sin gastos en el periodo'
                                    : metrics.expensesTopCategory
                                        ? `la mayoría: ${CATEGORY_LABEL[metrics.expensesTopCategory] ?? metrics.expensesTopCategory}`
                                        : ' '}
                            </p>
                        </>
                    )}
                </Block>

                <div style={{ height: 1, background: 'var(--toul-divider)', margin: '14px 0' }} />

                {/* ── Utilidad ── */}
                <div style={{ marginTop: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                        <button className="fs-switch" onClick={switchKind}
                            title="Cambiar entre utilidad bruta y neta">
                            Utilidad {kind} <ChevronDown size={12} strokeWidth={2.4} />
                        </button>
                        <button className="fs-info" onClick={() => setShowInfo(v => !v)} aria-label="Qué significa">
                            <Info size={14} />
                        </button>
                    </div>

                    {loading ? <Skeleton width="120px" height="2rem" /> : (
                        <>
                            <p style={{
                                fontSize: 28, fontWeight: 700, letterSpacing: '-0.035em', margin: 0, lineHeight: 1.1,
                                color: negative ? 'var(--toul-error)' : 'var(--toul-accent)',
                            }}>
                                {formatCOP(profit)}
                            </p>
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {margin !== null && <span>{margin}% de margen</span>}
                                {margin !== null && prevProfit !== 0 && <span style={{ color: 'var(--toul-text-faint)' }}>·</span>}
                                <Delta value={profit} previous={prevProfit} />
                            </p>
                        </>
                    )}

                    <AnimatePresence>
                        {showInfo && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                                style={{ overflow: 'hidden' }}>
                                <div style={{
                                    marginTop: 12, padding: '12px 14px', borderRadius: 13,
                                    background: 'rgba(255,255,255,0.035)', border: '1px solid var(--toul-border)',
                                }}>
                                    <p style={{ fontSize: 12.5, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                                        <strong style={{ color: 'var(--toul-text)' }}>Bruta:</strong> lo que te dejó la mercancía — lo que vendiste menos lo que te costó.
                                    </p>
                                    <p style={{ fontSize: 12.5, color: 'var(--toul-text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
                                        <strong style={{ color: 'var(--toul-text)' }}>Neta:</strong> lo mismo, pero restando también arriendo, servicios y demás gastos del periodo.
                                    </p>
                                    <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '8px 0 0' }}>
                                        Toca el título para cambiar de una a otra.
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
