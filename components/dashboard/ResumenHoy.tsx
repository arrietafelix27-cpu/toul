'use client'

import { formatCOP } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import type { FinancialSummaryMetrics } from './FinancialSummary'

/* ══════════════════════════════════════════════════════════════
   El resumen del celular.

   Una sola pregunta: ¿cuánto vendí? Es el número grande. Debajo,
   lo que lo explica —cuántas ventas— y dos datos que lo completan:
   lo que dejó la mercancía y lo que se gastó.

   "Ganancia en ventas" es la utilidad bruta: lo vendido menos lo que
   costó la mercancía. Es la misma que el computador muestra por
   defecto, así que los dos coinciden. No resta los gastos: por eso
   los gastos van al lado, y el nombre lo dice.

   El periodo es el del selector de arriba (Hoy / Semana / Mes o
   fechas propias). La fecha no se repite: ya está en el saludo.
   ══════════════════════════════════════════════════════════════ */

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'

const CSS = `
.rh-titulo { font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.1;
    color: var(--toul-text); margin: 0 0 12px; }
.rh-card { background: var(--toul-surface); border-radius: 24px; padding: 20px; }
.rh-rotulo { font-size: 13px; color: var(--toul-text-subtle); margin: 0; }
.rh-monto { font-size: 42px; font-weight: 700; letter-spacing: -1.5px; line-height: 1.08;
    font-variant-numeric: tabular-nums; margin: 4px 0 0; white-space: nowrap; }
.rh-cuenta { font-size: 13px; margin: 6px 0 0; }
.rh-linea { height: 1px; background: var(--toul-border); margin: 18px 0 16px; }
.rh-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.rh-valor { font-size: 20px; font-weight: 600; letter-spacing: -0.4px; line-height: 1.2;
    font-variant-numeric: tabular-nums; margin: 4px 0 0; white-space: nowrap; }
`

/** "$50.000": sin el espacio que deja el formato de Colombia */
const dinero = (valor: number) => formatCOP(valor).replace(/\s/g, '')

function titulo(period: Period, rango: { from: string; to: string } | null): string {
    if (period === 'today') return 'Hoy'
    if (period === 'week') return 'Esta semana'
    if (period === 'month') return 'Este mes'
    if (period === 'total') return 'Todo'
    if (!rango) return 'Estas fechas'
    const desde = new Date(rango.from)
    const hasta = new Date(rango.to)
    const mes = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
    return desde.getMonth() === hasta.getMonth()
        ? `${desde.getDate()} – ${hasta.getDate()} ${mes(hasta)}`
        : `${desde.getDate()} ${mes(desde)} – ${hasta.getDate()} ${mes(hasta)}`
}

function sinVentasTexto(period: Period): string {
    if (period === 'today') return 'Aún no hay ventas hoy'
    if (period === 'week') return 'Aún no hay ventas esta semana'
    if (period === 'month') return 'Aún no hay ventas este mes'
    if (period === 'custom') return 'No hubo ventas en estas fechas'
    return 'Aún no hay ventas'
}

export function ResumenHoy({ metrics, loading, period, customRange }: {
    metrics: FinancialSummaryMetrics
    loading: boolean
    period: Period
    customRange: { from: string; to: string } | null
}) {
    const sinVentas = metrics.salesCount === 0
    const ganancia = metrics.grossProfit
    // Sin ventas los tres montos van apagados: no hay nada que celebrar ni que lamentar
    const apagado = 'var(--toul-text-dim)'
    const colorGanancia = sinVentas ? apagado
        : ganancia > 0 ? 'var(--toul-accent)'
            : ganancia < 0 ? 'var(--toul-error)'
                : 'var(--toul-text)'

    return (
        <section>
            <style>{CSS}</style>
            <h2 className="rh-titulo">{titulo(period, customRange)}</h2>

            <div className="rh-card">
                <p className="rh-rotulo">Vendiste</p>
                {loading
                    ? <div style={{ margin: '8px 0 4px' }}><Skeleton width="170px" height="2.6rem" /></div>
                    : <p className="rh-monto" style={{ color: sinVentas ? apagado : 'var(--toul-text)' }}>{dinero(metrics.revenue)}</p>}
                {loading
                    ? <div style={{ marginTop: 8 }}><Skeleton width="70px" height="0.9rem" /></div>
                    : <p className="rh-cuenta" style={{ color: sinVentas ? apagado : 'var(--toul-accent)' }}>
                        {sinVentas ? sinVentasTexto(period)
                            : `${metrics.salesCount} ${metrics.salesCount === 1 ? 'venta' : 'ventas'}`}
                    </p>}

                <div className="rh-linea" />

                <div className="rh-cols">
                    <div style={{ minWidth: 0 }}>
                        <p className="rh-rotulo">Ganancia en ventas</p>
                        {loading
                            ? <div style={{ marginTop: 6 }}><Skeleton width="90px" height="1.3rem" /></div>
                            : <p className="rh-valor" style={{ color: colorGanancia }}>{dinero(ganancia)}</p>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <p className="rh-rotulo">Gastos</p>
                        {loading
                            ? <div style={{ marginTop: 6 }}><Skeleton width="80px" height="1.3rem" /></div>
                            : <p className="rh-valor" style={{ color: sinVentas ? apagado : 'var(--toul-text)' }}>{dinero(metrics.expenses)}</p>}
                    </div>
                </div>
            </div>
        </section>
    )
}
