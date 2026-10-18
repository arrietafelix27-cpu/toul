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

   Tres datos y nada más: cuántas ventas, cuánto se gastó y cuánto
   quedó. La utilidad es la conclusión, así que es la única que va
   resaltada; las otras dos la sustentan.

   Por defecto muestra la utilidad BRUTA: un día de arriendo no
   puede hacerle creer al dueño que el negocio va en pérdida.

   La misma marcación sirve para los dos tamaños. En computador
   tiene una columna alta y se lee de arriba abajo; en el celular
   cada dato es una fila —concepto a la izquierda, plata a la
   derecha— y se lee como un estado de cuenta.
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
.fs-root { position: relative; height: 100%; display: flex; flex-direction: column;
    border-radius: 18px; overflow: hidden;
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

.fs-body { position: relative; z-index: 2; display: flex; flex-direction: column;
    height: 100%; padding: 18px 20px; }
.fs-titulo { margin: 0 0 16px; }

.fs-dato { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
.fs-linea { height: 1px; background: var(--toul-divider); flex-shrink: 0; }

.fs-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; min-width: 0; }
.fs-rotulo { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--toul-text-subtle); white-space: nowrap; }
.fs-val { font-size: 25px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.12;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.fs-dato[data-fuerte="true"] .fs-val { font-size: 28px; letter-spacing: -0.038em; }
.fs-det { font-size: 12.5px; color: var(--toul-text-dim); margin-top: 3px; line-height: 1.4;
    display: flex; align-items: center; justify-content: space-between; gap: 12px; }

/* El botón de gasto: con texto donde hay sitio, y solo el signo
   cuando no lo hay —pero siempre con su forma, nunca un hueco— */
.fs-gasto { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    flex-shrink: 0; height: 28px; padding: 0 11px; border-radius: 999px;
    border: 1px solid var(--toul-border); background: var(--toul-surface);
    color: var(--toul-text-muted); text-decoration: none;
    font-family: inherit; font-size: 11.5px; font-weight: 600; letter-spacing: -0.01em;
    white-space: nowrap;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1),
                color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 140ms cubic-bezier(0.23,1,0.32,1); }
.fs-gasto:active { transform: scale(0.95); }

.fs-switch { display: inline-flex; align-items: center; gap: 3px; border: none; background: transparent;
    padding: 0; font-family: inherit; font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.1em; color: var(--toul-text-subtle); cursor: pointer; white-space: nowrap;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
.fs-info { border: none; background: transparent; padding: 0; cursor: pointer;
    color: var(--toul-text-faint); display: flex; flex-shrink: 0;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }

/* ── Celular ──────────────────────────────────────────────────
   La columna alta no cabe: apretada deja tres números gigantes
   peleando y los botones flotando. Cada dato pasa a ser una fila. */
@media (max-width: 1023px) {
    .fs-root { border: none; border-radius: 0; overflow: visible; }
    .fs-root::before { background: linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 62%); }
    .fs-root::after { display: none; }

    .fs-body { padding: 0; }
    .fs-titulo { margin: 0 0 4px; }

    .fs-dato { flex: none; display: grid; grid-template-columns: 1fr auto;
        column-gap: 16px; align-items: baseline; padding: 13px 2px; }
    .fs-cab { grid-column: 1; grid-row: 1; margin-bottom: 0; }
    .fs-val { grid-column: 2; grid-row: 1; text-align: right; font-size: 20px; letter-spacing: -0.028em; }
    .fs-dato[data-fuerte="true"] .fs-val { font-size: 23px; }
    .fs-det { grid-column: 1 / -1; grid-row: 2; margin-top: 4px; font-size: 12px; }
}

@media (hover: hover) and (pointer: fine) {
    .fs-switch:hover, .fs-info:hover { color: var(--toul-text-muted); }
    .fs-gasto:hover { background: rgba(255,255,255,0.08); color: var(--toul-text);
        border-color: rgba(255,255,255,0.18); }
}
@media (prefers-reduced-motion: reduce) { .fs-gasto:active { transform: none; } }
`

/** Cuánto cambió contra el periodo anterior. Sin nada con qué
 *  comparar —o en cero— no se dice nada: un "▼100%" al lado de un
 *  "$0" no informa, solo asusta. */
function Delta({ value, previous }: { value: number; previous: number }) {
    if (!previous || !value) return null
    const change = Math.round(((value - previous) / Math.abs(previous)) * 100)
    if (!Number.isFinite(change) || change === 0) return null
    const up = change > 0
    return (
        <span style={{ color: up ? 'var(--toul-accent)' : 'var(--toul-error)', fontWeight: 600 }}>
            {up ? '▲' : '▼'} {Math.abs(change)}%
        </span>
    )
}

/** Un dato del resumen: rótulo, número y una línea que lo explica. */
function Dato({ rotulo, extra, valor, detalle, accion, fuerte }: {
    rotulo: React.ReactNode
    /** Va pegado al rótulo: la ⓘ de la utilidad */
    extra?: React.ReactNode
    valor: React.ReactNode
    detalle?: React.ReactNode
    /** Va al final del renglón explicativo: el + de gastos */
    accion?: React.ReactNode
    fuerte?: boolean
}) {
    return (
        <div className="fs-dato" data-fuerte={fuerte}>
            <div className="fs-cab">
                {typeof rotulo === 'string' ? <span className="fs-rotulo">{rotulo}</span> : rotulo}
                {extra}
            </div>
            <div className="fs-val">{valor}</div>
            {(detalle || accion) && (
                <div className="fs-det">
                    <span style={{ minWidth: 0 }}>{detalle}</span>
                    {accion}
                </div>
            )}
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
    const sinVentas = metrics.salesCount === 0

    return (
        <div className="fs-root">
            <style>{CSS}</style>

            <div className="fs-body">
                <p className="pnl-label fs-titulo">Resumen {periodLabel ?? 'del periodo'}</p>

                {/* ── Ventas ── */}
                <Dato
                    rotulo="Ventas"
                    valor={loading ? <Skeleton width="50px" height="1.5rem" />
                        : <span style={{ color: sinVentas ? 'var(--toul-text-dim)' : 'var(--toul-text)' }}>
                            {metrics.salesCount}
                        </span>}
                    detalle={loading ? null : sinVentas ? 'sin ventas todavía' : (
                        <>
                            {metrics.unitsSold} {metrics.unitsSold === 1 ? 'unidad' : 'unidades'}
                            {metrics.creditAmount > 0 && (
                                <>
                                    <span style={{ color: 'var(--toul-text-faint)' }}> · </span>
                                    <span style={{ color: 'var(--toul-warning)' }}>
                                        {formatCOP(metrics.creditAmount)} fiados
                                    </span>
                                </>
                            )}
                        </>
                    )} />

                <div className="fs-linea" />

                {/* ── Gastos ── */}
                <Dato
                    rotulo="Gastos"
                    valor={loading ? <Skeleton width="80px" height="1.5rem" />
                        : <span style={{ color: metrics.expenses > 0 ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>
                            {formatCOP(metrics.expenses)}
                        </span>}
                    detalle={loading ? null
                        : metrics.expenses === 0 ? 'sin gastos en el periodo'
                            : metrics.expensesTopCategory
                                ? `la mayoría: ${CATEGORY_LABEL[metrics.expensesTopCategory] ?? metrics.expensesTopCategory}`
                                : null}
                    accion={
                        <Link href="/expenses" className="fs-gasto">
                            <Plus size={13} strokeWidth={2.8} /> Gasto
                        </Link>
                    } />

                <div className="fs-linea" />

                {/* ── Utilidad: la conclusión ── */}
                <Dato
                    fuerte
                    rotulo={
                        <button className="fs-switch" onClick={switchKind}
                            title="Cambiar entre utilidad bruta y neta">
                            Utilidad {kind} <ChevronDown size={12} strokeWidth={2.4} />
                        </button>
                    }
                    extra={
                        <button className="fs-info" onClick={() => setShowInfo(v => !v)} aria-label="Qué significa">
                            <Info size={14} />
                        </button>
                    }
                    valor={loading ? <Skeleton width="110px" height="1.7rem" />
                        : <span style={{
                            color: sinVentas ? 'var(--toul-text-dim)'
                                : negative ? 'var(--toul-error)' : 'var(--toul-accent)',
                        }}>
                            {formatCOP(profit)}
                        </span>}
                    detalle={loading || sinVentas ? null : (
                        <span>
                            {margin !== null && <span>{margin}% de margen</span>}
                            {margin !== null && prevProfit !== 0 && profit !== 0 && (
                                <span style={{ color: 'var(--toul-text-faint)' }}> · </span>
                            )}
                            <Delta value={profit} previous={prevProfit} />
                        </span>
                    )} />

                <AnimatePresence>
                    {showInfo && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                            style={{ overflow: 'hidden', flexShrink: 0 }}>
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
    )
}
