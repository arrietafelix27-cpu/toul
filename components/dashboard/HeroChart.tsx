'use client'
import { useEffect, useId, useRef, useState } from 'react'
import useSWR from 'swr'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio, getDateRange, formatDate } from '@/lib/utils'
import { inicio } from '@/lib/motion'
import type { Periodo, Rango } from './Desplegable'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   La gráfica del Inicio.

   Sin caja y de borde a borde: una línea verde con un degradado que
   se apaga hacia abajo. Al tocarla (o pasar el mouse) dice cuánto se
   vendió a esa hora o ese día; las horas de abajo van muy tenues,
   solo para ubicarse.

   La primera vez que se abre la app la línea se dibuja de izquierda
   a derecha y el relleno aparece al final. También al cambiar de
   periodo. Al volver al Inicio aparece de una.
   ══════════════════════════════════════════════════════════════ */

interface Punto { label: string; total: number }

const CSS = `
.hc-plot { position: relative; width: 100%; }
/* "backwards": al terminar no queda el recorte puesto, que cortaría el globo de la gráfica */
.hc-plot[data-dibuja="true"] { animation: hc-trazo ${inicio.grafica.trazo}s cubic-bezier(0.77, 0, 0.175, 1) backwards; }
.hc-plot[data-dibuja="true"] .recharts-area-area {
    animation: hc-aparece ${inicio.grafica.relleno}s cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.2}s backwards; }
.hc-plot[data-dibuja="false"] { animation: hc-aparece 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@keyframes hc-trazo { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes hc-aparece { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
    .hc-plot[data-dibuja="true"] { animation: hc-aparece 200ms ease backwards; }
    .hc-plot[data-dibuja="true"] .recharts-area-area { animation: none; }
}
`

/** Ventas menos devoluciones, cada una en el momento en que pasó: así la
 *  gráfica suma lo mismo que el número grande */
async function movimientos(storeId: string, from: string | null, to: string | null) {
    let ventas = supabase.from('sales').select('total, created_at').eq('store_id', storeId)
    let devoluciones = supabase.from('sale_returns').select('total, created_at').eq('store_id', storeId)
    if (from) { ventas = ventas.gte('created_at', from); devoluciones = devoluciones.gte('created_at', from) }
    if (to) { ventas = ventas.lte('created_at', to); devoluciones = devoluciones.lte('created_at', to) }
    const [v, d] = await Promise.all([ventas, devoluciones])
    return [
        ...(v.data || []).map(s => ({ total: Number(s.total), created_at: s.created_at as string })),
        ...(d.data || []).map(r => ({ total: -Number(r.total), created_at: r.created_at as string })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

async function cargarPuntos(storeId: string, period: Periodo, rango: Rango): Promise<Punto[]> {
    if (period === 'today') {
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const rows = await movimientos(storeId, todayStart.toISOString(), null)
        const hourMap: number[] = new Array(24).fill(0)
        for (const s of rows) hourMap[new Date(s.created_at).getHours()] += s.total
        return hourMap.map((total, h) => ({
            label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
            total: Math.round(total),
        }))
    }
    const { from, to } = period === 'custom' && rango ? rango : getDateRange(period)
    const rows = await movimientos(storeId, from, to)
    const grouped: Record<string, number> = {}
    for (const s of rows) {
        const d = formatDate(s.created_at)
        grouped[d] = (grouped[d] || 0) + s.total
    }
    return Object.entries(grouped).map(([label, total]) => ({ label, total: Math.round(total) }))
}

/** Las horas o días de abajo. La primera y la última se alinean al borde
 *  para que no se corten, porque la línea llega hasta los bordes. */
function Marca({ x, y, payload, index = 0, visibleTicksCount = 0 }: {
    x?: number; y?: number; payload?: { value: string }; index?: number; visibleTicksCount?: number
}) {
    const anchor = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'
    return (
        <text x={x} y={y} dy={9} textAnchor={anchor} fill="var(--toul-text-ghost)" fontSize={10} fontWeight={500}>
            {payload?.value}
        </text>
    )
}

export default function HeroChart({ storeId, period, rango, alto, dibujar }: {
    storeId: string | null
    period: Periodo
    rango: Rango
    alto: number
    /** Trazar la línea de izquierda a derecha (si no, aparece de una) */
    dibujar: boolean
}) {
    const idDegradado = `hc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const clave = `${period}|${rango?.from ?? ''}|${rango?.to ?? ''}`

    const { data } = useSWR(
        storeId ? ['grafica-inicio', storeId, clave] : null,
        () => cargarPuntos(storeId!, period, rango),
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

    return (
        <div ref={plotRef} style={{ height: alto, position: 'relative' }}>
            <style>{CSS}</style>
            {!data ? null : data.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--toul-text-faint)' }}>Sin ventas en este periodo</span>
                </div>
            ) : canRender ? (
                // Cambia de periodo → se monta de nuevo y se vuelve a dibujar
                <div key={clave} className="hc-plot" data-dibuja={dibujar} style={{ height: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id={idDegradado} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--toul-accent)" stopOpacity={0.45} />
                                    <stop offset="100%" stopColor="var(--toul-accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={<Marca />}
                                interval={period === 'today' ? 3 : 'preserveStartEnd'}
                                padding={{ left: 0, right: 0 }}
                                height={20}
                            />
                            {/* Un día sin ventas igual tiene que dibujar la línea en cero:
                                con el techo pegado al máximo real, en cero no se veía nada.
                                Si se devolvió más de lo que se vendió, baja de cero */}
                            <YAxis hide domain={[(dataMin: number) => (dataMin < 0 ? dataMin * 1.12 : 0), (dataMax: number) => (dataMax > 0 ? dataMax * 1.12 : 1)]} />
                            <Tooltip
                                cursor={{ stroke: 'var(--toul-border-2)', strokeWidth: 1 }}
                                contentStyle={{
                                    background: 'var(--toul-surface-overlay)',
                                    border: '1px solid var(--toul-border-2)',
                                    borderRadius: 12,
                                    fontSize: 11,
                                    padding: '8px 12px',
                                    boxShadow: '0 8px 30px color-mix(in srgb, var(--toul-bg) 60%, transparent)',
                                }}
                                labelStyle={{ color: 'var(--toul-text-dim)', marginBottom: 3, fontWeight: 500, fontSize: 10 }}
                                itemStyle={{ color: 'var(--toul-text)', fontWeight: 600 }}
                                formatter={(valor) => [formatPrecio(Number(valor)), 'Ventas']}
                            />
                            <Area
                                type="monotone"
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
