'use client'
import { useEffect, useId, useRef, useState } from 'react'
import useSWR from 'swr'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio, getDateRange } from '@/lib/utils'
import { inicio } from '@/lib/motion'
import type { Periodo, Rango } from './Desplegable'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   La gráfica del Inicio.

   Muestra solo el tramo que tiene algo que contar: arranca un
   intervalo antes de la primera venta del periodo (una hora en "Hoy",
   un día en los demás) y llega hasta ahora o hasta el final de las
   fechas elegidas. Así nunca queda una franja plana al principio, y
   con una sola venta la curva sube desde cero hasta ella.

   Si desde la primera venta hay menos de 4 días, va por horas: con
   días, las 5 marcas de abajo repetirían la fecha.

   Curva monótona: entre dos puntos no inventa subidas ni bajadas.
   Al pasar el mouse o deslizar el dedo dice la hora o el día y el
   valor exacto. Sin ventas no se dibuja.
   ══════════════════════════════════════════════════════════════ */

type Modo = 'hora' | 'dia'

interface Punto {
    t: number
    total: number
    /** El punto de arranque cae antes del periodo: se dibuja, pero no se lee */
    fuera: boolean
}

interface Serie {
    puntos: Punto[]
    modo: Modo
    /** Por horas, pero pasando de un día a otro: las marcas dicen el día */
    variosDias: boolean
}

const HORA = 3_600_000
const DIA = 86_400_000

const CSS = `
.hc-plot { position: relative; width: 100%; }
/* "backwards": al terminar no queda el recorte puesto, que cortaría el globo de la gráfica */
.hc-plot[data-dibuja="true"] { animation: hc-trazo ${inicio.grafica.trazo}s cubic-bezier(0.77, 0, 0.175, 1) backwards; }
.hc-plot[data-dibuja="true"] .recharts-area-area {
    animation: hc-aparece ${inicio.grafica.relleno}s cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.2}s backwards; }
.hc-plot[data-dibuja="false"] { animation: hc-aparece 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@keyframes hc-trazo { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes hc-aparece { from { opacity: 0; } }
.hc-globo { padding: 7px 11px; border-radius: 10px; background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    box-shadow: 0 8px 30px color-mix(in srgb, var(--toul-bg) 60%, transparent); white-space: nowrap; }
.hc-globo-cuando { font-size: 11px; font-weight: 500; color: var(--toul-text-subtle); margin: 0; }
.hc-globo-valor { font-size: 13px; font-weight: 600; color: var(--toul-text); margin: 2px 0 0; font-variant-numeric: tabular-nums; }
@media (prefers-reduced-motion: reduce) {
    .hc-plot[data-dibuja="true"] { animation: hc-aparece 200ms ease backwards; }
    .hc-plot[data-dibuja="true"] .recharts-area-area { animation: none; }
}
`

/** Ventas menos devoluciones, cada una en el momento en que pasó: así la
 *  gráfica suma lo mismo que el número grande */
async function movimientos(storeId: string, from: string, to: string) {
    const [v, d] = await Promise.all([
        supabase.from('sales').select('total, created_at').eq('store_id', storeId).gte('created_at', from).lte('created_at', to),
        supabase.from('sale_returns').select('total, created_at').eq('store_id', storeId).gte('created_at', from).lte('created_at', to),
    ])
    return [
        ...(v.data || []).map(s => ({ total: Number(s.total), created_at: s.created_at as string })),
        ...(d.data || []).map(r => ({ total: -Number(r.total), created_at: r.created_at as string })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

const inicioHora = (t: number) => { const d = new Date(t); d.setMinutes(0, 0, 0); return d.getTime() }
const inicioDia = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
// Por fecha y no sumando 24 h: así un día siempre empieza a medianoche
const diaSiguiente = (t: number) => { const d = new Date(t); d.setDate(d.getDate() + 1); return d.getTime() }

async function cargarSerie(storeId: string, period: Periodo, rango: Rango): Promise<Serie> {
    const ahora = Date.now()
    let desde: number
    let hasta: number
    if (period === 'custom' && rango) {
        desde = new Date(rango.from).getTime()
        hasta = Math.min(new Date(rango.to).getTime(), ahora)
    } else {
        const { from } = getDateRange(period)
        desde = from ? new Date(from).getTime() : 0
        hasta = ahora
    }

    const filas = await movimientos(storeId, new Date(desde).toISOString(), new Date(hasta).toISOString())
    if (filas.length === 0) return { puntos: [], modo: 'hora', variosDias: false }
    const primera = new Date(filas[0].created_at).getTime()

    const arranqueDias = inicioDia(primera) - DIA
    const modo: Modo = period === 'today' || inicioDia(hasta) - arranqueDias < 4 * DIA ? 'hora' : 'dia'
    const redondear = modo === 'hora' ? inicioHora : inicioDia
    const arranque = modo === 'hora' ? inicioHora(primera) - HORA : arranqueDias
    const fin = redondear(hasta)

    const porIntervalo = new Map<number, number>()
    for (const f of filas) {
        const t = redondear(new Date(f.created_at).getTime())
        porIntervalo.set(t, (porIntervalo.get(t) ?? 0) + f.total)
    }

    // Todos los intervalos, también los que no tuvieron ventas: si se
    // saltaran, la distancia entre puntos mentiría
    const puntos: Punto[] = []
    for (let t = arranque; t <= fin; t = modo === 'hora' ? t + HORA : diaSiguiente(t)) {
        puntos.push({ t, total: Math.round(porIntervalo.get(t) ?? 0), fuera: t < redondear(desde) })
    }
    return { puntos, modo, variosDias: modo === 'hora' && fin - arranque > 20 * HORA }
}

const hora = (t: number) => {
    const d = new Date(t)
    return d.toLocaleTimeString('es-CO', d.getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' })
}
const diaCorto = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '')
const diaSemana = (t: number) => new Date(t).toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')

/** Lo que dicen las marcas de abajo */
function textoMarca(t: number, serie: Serie) {
    if (serie.modo === 'dia') return diaCorto(t)
    return serie.variosDias ? `${diaSemana(t)} ${hora(t)}` : hora(t)
}

/** Lo que dice el globo: el intervalo completo, sin adivinar */
function textoGlobo(t: number, serie: Serie) {
    if (serie.modo === 'dia') {
        return new Date(t).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }).replace('.', '')
    }
    const tramo = `${hora(t)} – ${hora(t + HORA)}`
    return serie.variosDias ? `${diaSemana(t)} ${diaCorto(t)}, ${tramo}` : tramo
}

/** Las 5 marcas. La primera y la última se alinean al borde para que no
 *  se corten, porque la línea llega hasta los bordes. */
function Marca({ x, y, payload, index = 0, visibleTicksCount = 0, serie }: {
    x?: number; y?: number; payload?: { value: number }; index?: number; visibleTicksCount?: number; serie: Serie
}) {
    const anchor = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'
    return (
        <text x={x} y={y} dy={10} textAnchor={anchor} fill="var(--toul-text-faint)" fontSize={11} fontWeight={500}>
            {payload ? textoMarca(payload.value, serie) : ''}
        </text>
    )
}

function Globo({ active, payload, serie }: {
    active?: boolean; payload?: { payload: Punto }[]; serie: Serie
}) {
    const punto = payload?.[0]?.payload
    if (!active || !punto || punto.fuera) return null
    return (
        <div className="hc-globo">
            <p className="hc-globo-cuando">{textoGlobo(punto.t, serie)}</p>
            <p className="hc-globo-valor">{formatPrecio(punto.total)}</p>
        </div>
    )
}

export default function HeroChart({ storeId, period, rango, alto, margenArriba = 6, dibujar }: {
    storeId: string | null
    period: Periodo
    rango: Rango
    /** En px, o una medida de CSS que crece con la pantalla */
    alto: number | string
    /** Aire arriba de la línea */
    margenArriba?: number
    /** Trazar la línea de izquierda a derecha (si no, aparece de una) */
    dibujar: boolean
}) {
    const idDegradado = `hc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const clave = `${period}|${rango?.from ?? ''}|${rango?.to ?? ''}`

    const { data: serie } = useSWR(
        storeId ? ['grafica-inicio-v2', storeId, clave] : null,
        () => cargarSerie(storeId!, period, rango),
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    )

    // Recharts se queja si lo montan dentro de algo de tamaño cero
    // (pasa con la versión de celular, que en PC está oculta pero montada)
    const plotRef = useRef<HTMLDivElement>(null)
    const [canRender, setCanRender] = useState(false)
    useEffect(() => {
        const node = plotRef.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            setCanRender(width > 0 && height > 0)
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const puntos = serie?.puntos ?? []
    const primero = puntos[0]?.t ?? 0
    const ultimo = puntos[puntos.length - 1]?.t ?? 1
    // Siempre 5 marcas, a la misma distancia una de otra
    const marcas = Array.from({ length: 5 }, (_, i) => primero + ((ultimo - primero) * i) / 4)

    return (
        <div ref={plotRef} style={{ height: alto, position: 'relative' }}>
            <style>{CSS}</style>
            {!serie ? null : puntos.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--toul-text-faint)' }}>Aún no hay ventas</span>
                </div>
            ) : canRender ? (
                // Cambia de periodo → se monta de nuevo y se vuelve a dibujar
                <div key={clave} className="hc-plot" data-dibuja={dibujar} style={{ height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={puntos} margin={{ top: margenArriba, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={idDegradado} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--toul-accent)" stopOpacity={0.18} />
                                    <stop offset="100%" stopColor="var(--toul-accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="t"
                                type="number"
                                domain={[primero, ultimo]}
                                ticks={marcas}
                                interval={0}
                                axisLine={false}
                                tickLine={false}
                                tick={<Marca serie={serie} />}
                                padding={{ left: 0, right: 0 }}
                                height={22}
                            />
                            {/* Si se devolvió más de lo que se vendió, baja de cero */}
                            <YAxis hide domain={[(dataMin: number) => (dataMin < 0 ? dataMin * 1.12 : 0), (dataMax: number) => (dataMax > 0 ? dataMax * 1.12 : 1)]} />
                            <Tooltip
                                cursor={{ stroke: 'var(--toul-border-2)', strokeWidth: 1 }}
                                content={<Globo serie={serie} />}
                                isAnimationActive={false}
                            />
                            <Area
                                type="monotoneX"
                                dataKey="total"
                                stroke="var(--toul-accent)"
                                strokeWidth={2}
                                strokeLinecap="round"
                                fillOpacity={1}
                                fill={`url(#${idDegradado})`}
                                isAnimationActive={false}
                                activeDot={{ r: 4, fill: 'var(--toul-accent)', stroke: 'var(--toul-bg)', strokeWidth: 3 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            ) : null}
        </div>
    )
}
