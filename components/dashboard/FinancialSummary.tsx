'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Info, Plus } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from './panelStyles'

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

const CSS = PANEL_CSS + `
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

.fs-band { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
.fs-line { height: 1px; background: var(--toul-divider); flex-shrink: 0; }

/* En computador el panel es una columna alta: el concepto arriba y el
   número grande debajo, con aire de sobra. */
.fs-fila { display: block; }
.fs-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.fs-rotulo { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--toul-text-subtle); }
.fs-val { font-size: 26px; font-weight: 700; letter-spacing: -0.03em; margin: 0; line-height: 1.1;
    font-variant-numeric: tabular-nums; }
.fs-fila[data-fuerte="true"] .fs-val { font-size: 28px; letter-spacing: -0.035em; }
.fs-det { font-size: 12.5px; color: var(--toul-text-dim); margin: 2px 0 0; }

/* En el celular esa misma columna queda con tres números gigantes
   peleando entre sí y el botón flotando donde cae. Aquí cada bloque
   es una fila: el concepto a la izquierda, la plata a la derecha, y
   el detalle debajo. Se lee como un estado de cuenta. */
@media (max-width: 1023px) {
    .fs-root { border: none; border-radius: 0; overflow: visible; }
    .fs-root::before {
        background: linear-gradient(to bottom, rgba(255,255,255,0.022) 0%, transparent 70%);
    }
    .fs-root::after { display: none; }
    .fs-body { padding: 2px 2px 0; }

    .fs-band { flex: none; padding: 11px 0; }
    .fs-fila { display: grid; grid-template-columns: 1fr auto; column-gap: 14px; align-items: baseline; }
    .fs-cab { grid-column: 1; grid-row: 1; margin-bottom: 0; justify-content: flex-start; }
    .fs-val { grid-column: 2; grid-row: 1; text-align: right; font-size: 19px; letter-spacing: -0.025em; }
    .fs-fila[data-fuerte="true"] .fs-val { font-size: 22px; }
    .fs-det { grid-column: 1 / -1; grid-row: 2; margin-top: 3px; font-size: 12px; }

    /* El signo más, pegado a "Gastos" */
    .fs-accion { width: 24px; height: 24px; padding: 0; justify-content: center; border-radius: 999px; }
    .fs-accion-txt { display: none; }
}

.fs-switch { display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent; padding: 0;
    font-family: inherit; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--toul-text-subtle); cursor: pointer;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
.fs-info { border: none; background: transparent; padding: 0; cursor: pointer; color: var(--toul-text-faint); display: flex;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }

@media (hover: hover) and (pointer: fine) {
    .fs-switch:hover, .fs-info:hover { color: var(--toul-text-muted); }
}
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

/** Un renglón del resumen. La misma marcación sirve para la columna
 *  de computador y para la fila del celular: lo que cambia es el CSS. */
function Fila({ label, action, value, detail, fuerte, info }: {
    label: React.ReactNode
    action?: React.ReactNode
    value: React.ReactNode
    detail?: React.ReactNode
    fuerte?: boolean
    info?: React.ReactNode
}) {
    return (
        <div className="fs-fila" data-fuerte={fuerte}>
            <div className="fs-cab">
                {typeof label === 'string' ? <span className="fs-rotulo">{label}</span> : label}
                {action}
                {info}
            </div>
            <div className="fs-val">{value}</div>
            {detail !== undefined && <div className="fs-det">{detail}</div>}
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
                <p className="pnl-label" style={{ marginBottom: 14 }}>
                    Resumen {periodLabel ?? 'del periodo'}
                </p>

                {/* ── Ventas ── */}
                <div className="fs-band">
                <Fila
                    label="Ventas"
                    value={loading ? <Skeleton width="60px" height="1.5rem" />
                        : <span style={{ color: 'var(--toul-text)' }}>{metrics.salesCount}</span>}
                    detail={loading ? null : (
                        <>
                            {metrics.unitsSold} {metrics.unitsSold === 1 ? 'unidad' : 'unidades'}
                            {metrics.creditAmount > 0 && (
                                <>
                                    <span style={{ color: 'var(--toul-text-faint)' }}> · </span>
                                    <span style={{ color: 'var(--toul-warning)' }}>
                                        {formatCOP(metrics.creditAmount)} quedaron fiados
                                    </span>
                                </>
                            )}
                        </>
                    )} />
                </div>

                <div className="fs-line" />

                {/* ── Gastos ── */}
                <div className="fs-band">
                <Fila
                    label="Gastos"
                    action={
                        <Link href="/expenses" className="pnl-pill fs-accion" aria-label="Registrar gasto">
                            <Plus size={14} strokeWidth={2.6} />
                            <span className="fs-accion-txt">Registrar gasto</span>
                        </Link>
                    }
                    value={loading ? <Skeleton width="90px" height="1.5rem" />
                        : <span style={{ color: metrics.expenses > 0 ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>
                            {formatCOP(metrics.expenses)}
                        </span>}
                    detail={loading ? null
                        : metrics.expenses === 0 ? 'sin gastos en el periodo'
                            : metrics.expensesTopCategory
                                ? `la mayoría: ${CATEGORY_LABEL[metrics.expensesTopCategory] ?? metrics.expensesTopCategory}`
                                : null} />
                </div>

                <div className="fs-line" />

                {/* ── Utilidad ── */}
                <div className="fs-band">
                    <Fila
                        fuerte
                        label={
                            <button className="fs-switch" onClick={switchKind}
                                title="Cambiar entre utilidad bruta y neta">
                                Utilidad {kind} <ChevronDown size={12} strokeWidth={2.4} />
                            </button>
                        }
                        info={
                            <button className="fs-info" onClick={() => setShowInfo(v => !v)} aria-label="Qué significa">
                                <Info size={14} />
                            </button>
                        }
                        value={loading ? <Skeleton width="120px" height="1.7rem" />
                            : <span style={{ color: negative ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                {formatCOP(profit)}
                            </span>}
                        detail={loading ? null : (
                            <>
                                {margin !== null && <span>{margin}% de margen</span>}
                                {margin !== null && prevProfit !== 0 && <span style={{ color: 'var(--toul-text-faint)' }}> · </span>}
                                <Delta value={profit} previous={prevProfit} />
                            </>
                        )} />

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
