'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Clock, Receipt, type LucideIcon } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrecio } from '@/lib/utils'
import type { ResumenInicio } from '@/lib/reports/calculos'
import type { Periodo } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   El resumen del Inicio.

   "Vendiste": el número grande, en blanco. Debajo, en gris, cuántas
   ventas fueron y cómo va contra el mismo tramo del periodo anterior.
   "Ganaste" (el mismo de Reportes), del mismo tamaño y en verde, con
   cuánto es de lo que vendiste; si perdió, "Perdiste" en rojo. Tocar
   cualquiera de los dos abre Reportes en el mismo periodo.

   Debajo, filas con su ícono: los gastos del periodo (siempre, y en
   gris tenue si son $0) y lo que quedó fiado (solo si hubo). Cada una
   lleva a su pantalla. Lo pagado, lo fiado y los métodos de cada
   venta viven en Reportes.

   Son piezas sueltas porque en el celular la gráfica va entre
   "Vendiste" y lo demás.
   ══════════════════════════════════════════════════════════════ */

export interface MetricasInicio {
    revenue: number
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
.rv-monto { font-size: 42px; font-weight: 700; letter-spacing: -1.9px; line-height: 1.04; margin: 6px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
/* La línea gris: cuántas ventas y la tendencia; debajo de Ganaste,
   cuánto es de lo que vendiste. Si no cabe, baja entera cada parte */
.rv-bajo { display: flex; flex-wrap: wrap; align-items: center; column-gap: 5px; margin: 8px 0 0; min-height: 20px;
    font-size: 13px; font-weight: 500; color: var(--toul-text-subtle); }
.rv-trozo { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rv-flecha { display: inline-flex; align-items: center; gap: 1px; }
/* Lo vendido abre Reportes: se hunde un poco al tocarlo */
.rv-enlace { display: grid; justify-content: start; color: inherit; text-decoration: none; border-radius: 10px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms var(--toul-ease-emil), opacity 160ms var(--toul-ease-emil); }
.rv-enlace:active { transform: scale(0.98); }
.rv-enlace:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 4px; }

/* Va debajo de Vendiste, que ya deja su espacio arriba */
.rv-linea-fina { height: 1px; background: var(--toul-border); margin: 2px 0 18px; }

/* Las filas: ícono en su círculo, el texto y el monto. Toda la fila se toca */
.rv-filas { display: flex; flex-direction: column; margin-top: 14px; }
.rv-filas[data-sin-margen] { margin-top: 0; }
.rv-fila { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 4px 0; font-size: 14px;
    color: var(--toul-text-muted); text-decoration: none; border-radius: 10px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms var(--toul-ease-emil), opacity 160ms var(--toul-ease-emil); }
.rv-fila:active { transform: scale(0.985); }
.rv-fila:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 2px; }
.rv-fila[data-entra] { animation: rv-sube 380ms cubic-bezier(0.23, 1, 0.32, 1) backwards; animation-delay: calc(160ms + var(--rv-i) * 60ms); }
@keyframes rv-sube { from { opacity: 0; transform: translateY(8px); } }
.rv-icono { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center;
    background: color-mix(in srgb, var(--toul-text) 7%, transparent); color: var(--toul-text-subtle); }
.rv-icono[data-tono="fiado"] { background: var(--toul-warning-dim); color: var(--toul-warning); }
.rv-fila-rotulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-fila-monto { margin-left: auto; padding-left: 14px; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (hover: hover) and (pointer: fine) {
    .rv-enlace:hover, .rv-fila:hover { opacity: 0.82; }
}
@keyframes rv-aparece { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
    .rv-enlace:active, .rv-fila:active { transform: none; }
    .rv-fila[data-entra] { animation-name: rv-aparece; }
}
`

/** El $0 de un periodo sin ventas, y un monto en cero: blanco al 28% */
const CERO = 'color-mix(in srgb, var(--toul-text) 28%, transparent)'
/** El monto ocupa su propia línea, con el ancho del valor final */
const BLOQUE = { display: 'grid', justifyContent: 'start' } as const

function sinVentasTexto(period: Periodo, nuevo: boolean): string {
    if (nuevo) return 'Registra tu primera venta y aquí verás cómo avanza tu negocio'
    if (period === 'today') return 'Tu primera venta de hoy aparecerá aquí'
    return 'Aún no hay ventas en este periodo'
}

/** "↗115% vs semana pasada": la flecha de color, el resto en gris */
function TrozoTendencia({ tendencia }: { tendencia: Tendencia }) {
    const p = tendencia.porcentaje
    if (p === null) return null
    const sube = p > 0
    const baja = p < 0
    return (
        <span className="rv-trozo">
            <span aria-hidden>·</span>
            <span className="rv-flecha">
                {sube && <ArrowUpRight size={14} strokeWidth={2.6} style={{ color: 'var(--toul-accent)' }} aria-hidden />}
                {baja && <ArrowDownRight size={14} strokeWidth={2.6} style={{ color: 'var(--toul-error)' }} aria-hidden />}
                <span className="sr-only">{sube ? 'sube' : baja ? 'baja' : 'igual'}</span>
                {Math.abs(p)}%
            </span>
            {tendencia.contra}
        </span>
    )
}

export function Vendiste({ metrics, loading, period, conteo, tendencia, selector, href, nuevo = false }: {
    metrics: MetricasInicio
    loading: boolean
    period: Periodo
    conteo: Conteo
    tendencia: Tendencia
    /** Nunca ha vendido: no hay gráfica ni nada que comparar */
    nuevo?: boolean
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
                <div style={{ marginTop: 10 }}><Skeleton width="200px" height="2.6rem" /></div>
            ) : (
                <Link href={href} className="rv-enlace" aria-label="Ver el reporte de este periodo">
                    <AnimatedNumber value={metrics.revenue} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-monto" style={{ ...BLOQUE, color: sinVentas ? CERO : 'var(--toul-text)' }} />
                </Link>
            )}
            {/* Sin ventas el monto va apagado y no hay tendencia: no hay nada que comparar */}
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="120px" height="0.9rem" /></div>
            ) : sinVentas ? (
                <p className="rv-bajo">{sinVentasTexto(period, nuevo)}</p>
            ) : (
                <p className="rv-bajo">
                    <span className="rv-trozo">{metrics.salesCount} {metrics.salesCount === 1 ? 'venta' : 'ventas'}</span>
                    <TrozoTendencia tendencia={tendencia} />
                </p>
            )}
        </div>
    )
}

/* ─── Ganaste ─────────────────────────────────────────────────── */

export function Ganaste({ resumen, loading, conteo, href }: {
    resumen: ResumenInicio | null
    loading: boolean
    conteo: Conteo
    /** Reportes en el mismo periodo */
    href: string
}) {
    const perdio = !!resumen && resumen.ganaste < 0
    const color = !resumen ? 'var(--toul-text)' : perdio ? 'var(--toul-error)' : resumen.ganaste > 0 ? 'var(--toul-accent)' : 'var(--toul-text)'
    return (
        <div>
            <style>{CSS}</style>
            <p className="rv-rotulo">{perdio ? 'Perdiste' : 'Ganaste'}</p>
            {loading || !resumen ? (
                <>
                    <div style={{ marginTop: 10 }}><Skeleton width="180px" height="2.6rem" /></div>
                    <div style={{ marginTop: 10 }}><Skeleton width="140px" height="0.9rem" /></div>
                </>
            ) : (<>
                <Link href={href} className="rv-enlace" aria-label="Ver el reporte de este periodo">
                    {/* Como en Reportes: al perder, la cifra va sin signo y en rojo */}
                    <AnimatedNumber value={Math.abs(resumen.ganaste)} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-monto" style={{ ...BLOQUE, color }} />
                </Link>
                {resumen.deLoVendido && <p className="rv-bajo">{resumen.deLoVendido}</p>}
            </>)}
        </div>
    )
}

/** La línea fina entre Vendiste y Ganaste (en el PC: en el celular los separa la gráfica) */
export function LineaFina() {
    return <div className="rv-linea-fina" aria-hidden><style>{CSS}</style></div>
}

/* ─── Las filas ───────────────────────────────────────────────── */

export interface FilaInicio {
    clave: string
    rotulo: string
    monto: number
    Icono: LucideIcon
    href: string
    /** Lo fiado va en amarillo */
    tono?: 'fiado'
}

/** Los gastos del periodo: "Gastos de hoy", "Gastos de la semana"… */
export function rotuloGastos(period: Periodo): string {
    if (period === 'today') return 'Gastos de hoy'
    if (period === 'week') return 'Gastos de la semana'
    if (period === 'month') return 'Gastos del mes'
    if (period === 'year') return 'Gastos del año'
    return 'Gastos'
}

export const ICONO_GASTOS = Receipt
export const ICONO_FIADO = Clock
export const ICONO_SEMANA = CalendarDays

/** Las filas entran con un fundido hacia arriba cuando cuentan los montos
 *  (la primera vez que se abre la app y al cambiar de periodo) */
export function FilasInicio({ filas, conteo, loading, claveDatos, pegadas = false }: {
    filas: FilaInicio[]
    conteo: Conteo
    loading: boolean
    /** El periodo de estos números: cuando llegan los de otro, vuelven a entrar */
    claveDatos: string
    /** Sin Ganaste encima: van pegadas a lo de arriba */
    pegadas?: boolean
}) {
    if (loading) {
        return (
            <div className="rv-filas" data-sin-margen={pegadas || undefined}>
                <style>{CSS}</style>
                {[0, 1].map(n => <div key={n} style={{ padding: '12px 0' }}><Skeleton height="1rem" /></div>)}
            </div>
        )
    }
    return (
        <div key={claveDatos} className="rv-filas" data-sin-margen={pegadas || undefined}>
            <style>{CSS}</style>
            {filas.map((f, i) => {
                const { Icono } = f
                const color = f.tono === 'fiado' ? 'var(--toul-warning)' : f.monto === 0 ? CERO : 'var(--toul-text)'
                return (
                    <Link key={f.clave} href={f.href} className="rv-fila" data-entra={conteo.cuenta || undefined}
                        style={{ '--rv-i': i } as CSSProperties}>
                        <span className="rv-icono" data-tono={f.tono} aria-hidden><Icono size={14} strokeWidth={2.2} /></span>
                        <span className="rv-fila-rotulo">{f.rotulo}</span>
                        <AnimatedNumber value={f.monto} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                            className="rv-fila-monto" style={{ color }} />
                    </Link>
                )
            })}
        </div>
    )
}

/** Hoy sin ventas: cómo va la semana */
export interface LlevasHoy {
    semana: number
}
