'use client'

import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrecio } from '@/lib/utils'
import type { Periodo, Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   Lo vendido en el periodo.

   Una sola pregunta: ¿cuánto vendí? Es el número grande. Debajo,
   cuántas ventas fueron, y aparte lo que dejó la mercancía y lo que
   se gastó. Sin tarjeta: los números se apoyan en el fondo.

   "Ganancia en ventas" es la utilidad bruta: lo vendido menos lo que
   costó la mercancía. No resta los gastos: por eso los gastos van al
   lado, y el nombre lo dice.

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

const CSS = `
.rv-rotulo { font-size: 13px; color: var(--toul-text-subtle); margin: 0; letter-spacing: -0.01em; }
.rv-monto { font-weight: 700; letter-spacing: -2px; line-height: 1.04; margin: 6px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-monto-movil { font-size: 46px; }
.rv-monto-pc { font-size: 44px; }
.rv-cuenta { font-size: 13px; font-weight: 500; margin: 8px 0 0; }
.rv-cols { display: flex; align-items: stretch; gap: 20px; }
.rv-linea { width: 1px; flex-shrink: 0; background: var(--toul-border); }
.rv-valor { font-size: 21px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2; margin: 4px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-margen { font-size: 12px; color: var(--toul-text-subtle); margin: 3px 0 0; }
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

export function Vendiste({ metrics, loading, period, variante, conteo }: {
    metrics: MetricasInicio
    loading: boolean
    period: Periodo
    variante: Variante
    conteo: Conteo
}) {
    const sinVentas = metrics.salesCount === 0

    return (
        <div>
            <style>{CSS}</style>
            <p className="rv-rotulo">Vendiste</p>
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="200px" height="2.75rem" /></div>
            ) : (
                <AnimatedNumber value={metrics.revenue} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                    className={`rv-monto rv-monto-${variante}`} style={{ ...BLOQUE, color: sinVentas ? APAGADO : 'var(--toul-text)' }} />
            )}
            {/* Sin ventas los montos van apagados: no hay nada que celebrar ni que lamentar */}
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="70px" height="0.9rem" /></div>
            ) : (
                <p className="rv-cuenta" style={{ color: sinVentas ? APAGADO : 'var(--toul-accent)' }}>
                    {sinVentas ? sinVentasTexto(period) : `${metrics.salesCount} ${metrics.salesCount === 1 ? 'venta' : 'ventas'}`}
                </p>
            )}
        </div>
    )
}

export function GananciaGastos({ metrics, loading, variante, conteo }: {
    metrics: MetricasInicio
    loading: boolean
    variante: Variante
    conteo: Conteo
}) {
    const sinVentas = metrics.salesCount === 0
    const ganancia = metrics.grossProfit
    const colorGanancia = sinVentas ? APAGADO
        : ganancia > 0 ? 'var(--toul-accent)'
            : ganancia < 0 ? 'var(--toul-error)'
                : 'var(--toul-text)'
    const margen = metrics.revenue > 0 ? Math.round((ganancia / metrics.revenue) * 100) : null

    return (
        <div className="rv-cols">
            <style>{CSS}</style>
            <div style={{ minWidth: 0 }}>
                <p className="rv-rotulo">Ganancia en ventas</p>
                {loading
                    ? <div style={{ marginTop: 8 }}><Skeleton width="96px" height="1.35rem" /></div>
                    : <AnimatedNumber value={ganancia} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-valor" style={{ ...BLOQUE, color: colorGanancia }} />}
                {variante === 'pc' && !loading && margen !== null && (
                    <p className="rv-margen">{margen}% de margen</p>
                )}
            </div>
            <span className="rv-linea" aria-hidden />
            <div style={{ minWidth: 0 }}>
                <p className="rv-rotulo">Gastos</p>
                {loading
                    ? <div style={{ marginTop: 8 }}><Skeleton width="72px" height="1.35rem" /></div>
                    : <AnimatedNumber value={metrics.expenses} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-valor" style={{ ...BLOQUE, color: sinVentas && metrics.expenses === 0 ? APAGADO : 'var(--toul-text)' }} />}
            </div>
        </div>
    )
}
