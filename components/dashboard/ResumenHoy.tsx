'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrecio } from '@/lib/utils'
import type { Periodo, Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   Lo vendido en el periodo.

   Una sola pregunta: ¿cuánto vendí? Es el número grande, en blanco.
   Debajo, cuántas ventas fueron y cómo va contra el mismo tramo del
   periodo anterior. Después de una línea, lo que dejó la mercancía,
   lo que se gastó y lo que queda de las dos.

   "Ganancia en ventas" es la utilidad bruta: lo vendido menos lo que
   costó la mercancía. "Ganancia después de gastos" le resta los gastos.
   Tocar lo vendido abre Reportes en el mismo periodo.

   Son dos piezas porque en el celular la gráfica va entre las dos.
   ══════════════════════════════════════════════════════════════ */

export interface MetricasInicio {
    revenue: number
    grossProfit: number
    expenses: number
    salesCount: number
}

/** Cómo cuentan los montos: al aparecer la primera vez y al cambiar de periodo */
export interface Conteo {
    cuenta: boolean
    clave: string
}

/** Contra el mismo tramo del periodo anterior. null: no hay con qué comparar */
export interface Tendencia {
    porcentaje: number | null
    /** "vs ayer", "vs semana pasada", "vs 1–26 sep" */
    contra: string
}

const CSS = `
.rv-cabeza { display: flex; align-items: center; gap: 10px; min-height: 26px; }
.rv-rotulo { font-size: 13px; color: var(--toul-text-subtle); margin: 0; letter-spacing: -0.01em; }
.rv-monto { font-weight: 700; letter-spacing: -2px; line-height: 1.04; margin: 6px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-monto-movil { font-size: 46px; }
.rv-monto-pc { font-size: 44px; }
.rv-bajo { display: flex; align-items: center; gap: 12px; margin: 8px 0 0; min-height: 22px; }
.rv-cuenta { font-size: 13px; font-weight: 500; color: var(--toul-text-subtle); margin: 0; }
/* Lo vendido abre Reportes: se hunde un poco al tocarlo */
.rv-enlace { display: grid; justify-content: start; color: inherit; text-decoration: none; border-radius: 10px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms var(--toul-ease-emil), opacity 160ms var(--toul-ease-emil); }
.rv-enlace:active { transform: scale(0.98); }
.rv-enlace:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 4px; }

/* La tendencia: flecha de color, número en blanco. Al tocarla o pasar
   el mouse dice contra qué se compara */
.rv-tendencia { position: relative; display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px 0 4px;
    border: none; border-radius: 999px; background: var(--toul-surface); color: var(--toul-text);
    font: inherit; font-size: 12.5px; font-weight: 600; font-variant-numeric: tabular-nums; cursor: default;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
/* Debajo de la flecha: arriba taparía el monto */
.rv-globo { position: absolute; z-index: 20; left: 50%; top: calc(100% + 8px); white-space: nowrap; pointer-events: none;
    padding: 5px 9px; border-radius: 8px; background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    font-size: 12px; font-weight: 500; color: var(--toul-text-muted);
    opacity: 0; transform: translateX(-50%) translateY(-2px);
    transition: opacity 140ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.rv-tendencia[data-abierta="true"] .rv-globo { opacity: 1; transform: translateX(-50%) translateY(0); }
@media (hover: hover) and (pointer: fine) {
    .rv-tendencia:hover .rv-globo { opacity: 1; transform: translateX(-50%) translateY(0); }
    .rv-enlace:hover { opacity: 0.82; }
}

.rv-division { height: 1px; background: var(--toul-border); margin: 0 0 18px; }
.rv-cols { display: flex; align-items: stretch; gap: 20px; }
.rv-linea { width: 1px; flex-shrink: 0; background: var(--toul-border); }
.rv-valor { font-size: 21px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2; margin: 4px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-quedan { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-top: 18px; }
.rv-quedan-valor { font-size: 17px; font-weight: 600; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
    .rv-globo { transition: opacity 140ms ease; transform: translateX(-50%); }
    .rv-enlace:active { transform: none; }
}
`

const APAGADO = 'var(--toul-text-dim)'
/** El monto ocupa su propia línea, con el ancho del valor final */
const BLOQUE = { display: 'grid', justifyContent: 'start' } as const

function sinVentasTexto(period: Periodo): string {
    if (period === 'today') return 'Aún no hay ventas hoy'
    if (period === 'week') return 'Aún no hay ventas esta semana'
    if (period === 'month') return 'Aún no hay ventas este mes'
    if (period === 'custom') return 'No hubo ventas en estas fechas'
    return 'Aún no hay ventas'
}

function FlechaTendencia({ tendencia }: { tendencia: Tendencia }) {
    const [abierta, setAbierta] = useState(false)
    const p = tendencia.porcentaje
    if (p === null) return null
    const sube = p > 0
    const baja = p < 0
    return (
        <button type="button" className="rv-tendencia" data-abierta={abierta}
            aria-label={`${sube ? 'Sube' : baja ? 'Baja' : 'Igual'} ${Math.abs(p)}% ${tendencia.contra}`}
            onClick={() => setAbierta(v => !v)} onBlur={() => setAbierta(false)}>
            {sube && <ArrowUpRight size={15} strokeWidth={2.6} style={{ color: 'var(--toul-accent)' }} />}
            {baja && <ArrowDownRight size={15} strokeWidth={2.6} style={{ color: 'var(--toul-error)' }} />}
            <span style={{ paddingLeft: sube || baja ? 0 : 3 }}>{sube ? '+' : baja ? '−' : ''}{Math.abs(p)}%</span>
            <span className="rv-globo" aria-hidden>{tendencia.contra}</span>
        </button>
    )
}

export function Vendiste({ metrics, loading, period, variante, conteo, tendencia, selector, href }: {
    metrics: MetricasInicio
    loading: boolean
    period: Periodo
    variante: Variante
    conteo: Conteo
    tendencia: Tendencia
    /** En PC, la píldora del periodo va al lado de "Vendiste" */
    selector?: ReactNode
    /** Reportes en el mismo periodo */
    href: string
}) {
    const sinVentas = metrics.salesCount === 0

    return (
        <div>
            <style>{CSS}</style>
            <div className="rv-cabeza">
                <p className="rv-rotulo">Vendiste</p>
                {selector}
            </div>
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="200px" height="2.75rem" /></div>
            ) : (
                <Link href={href} className="rv-enlace" aria-label="Ver el reporte de este periodo">
                    <AnimatedNumber value={metrics.revenue} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className={`rv-monto rv-monto-${variante}`} style={{ ...BLOQUE, color: sinVentas ? APAGADO : 'var(--toul-text)' }} />
                </Link>
            )}
            {/* Sin ventas el monto va apagado y no hay tendencia: no hay nada que comparar */}
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="120px" height="0.9rem" /></div>
            ) : (
                <div className="rv-bajo">
                    <p className="rv-cuenta">
                        {sinVentas ? sinVentasTexto(period) : `${metrics.salesCount} ${metrics.salesCount === 1 ? 'venta' : 'ventas'}`}
                    </p>
                    {!sinVentas && <FlechaTendencia tendencia={tendencia} />}
                </div>
            )}
        </div>
    )
}

export function GananciaGastos({ metrics, loading, conteo }: {
    metrics: MetricasInicio
    loading: boolean
    conteo: Conteo
}) {
    const sinVentas = metrics.salesCount === 0
    const ganancia = metrics.grossProfit
    const quedan = ganancia - metrics.expenses
    const colorGanancia = sinVentas ? APAGADO
        : ganancia > 0 ? 'var(--toul-accent)'
            : ganancia < 0 ? 'var(--toul-error)'
                : 'var(--toul-text)'
    const nada = sinVentas && metrics.expenses === 0

    return (
        <div>
            <style>{CSS}</style>
            <div className="rv-division" aria-hidden />
            <div className="rv-cols">
                <div style={{ minWidth: 0 }}>
                    <p className="rv-rotulo">Ganancia en ventas</p>
                    {loading
                        ? <div style={{ marginTop: 8 }}><Skeleton width="96px" height="1.35rem" /></div>
                        : <AnimatedNumber value={ganancia} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                            className="rv-valor" style={{ ...BLOQUE, color: colorGanancia }} />}
                </div>
                <span className="rv-linea" aria-hidden />
                <div style={{ minWidth: 0 }}>
                    <p className="rv-rotulo">Gastos</p>
                    {loading
                        ? <div style={{ marginTop: 8 }}><Skeleton width="72px" height="1.35rem" /></div>
                        : <AnimatedNumber value={metrics.expenses} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                            className="rv-valor" style={{ ...BLOQUE, color: nada ? APAGADO : 'var(--toul-text)' }} />}
                </div>
            </div>
            {/* Lo que queda de la ganancia después de los gastos */}
            <div className="rv-quedan">
                <p className="rv-rotulo">Ganancia después de gastos</p>
                {loading
                    ? <Skeleton width="84px" height="1.1rem" />
                    : <AnimatedNumber value={quedan} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-quedan-valor"
                        style={{ color: quedan < 0 ? 'var(--toul-error)' : nada ? APAGADO : 'var(--toul-text)' }} />}
            </div>
        </div>
    )
}
