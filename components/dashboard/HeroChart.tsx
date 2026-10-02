'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    AreaChart, Area,
    XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { formatCOP, getDateRange, formatDate } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'
interface ChartPoint { label: string; total: number }

const HERO_CSS = `
/* Sin caja: el gráfico se apoya en el fondo de la página */
.hc-root { position: relative; background: transparent; border: none; padding: 0; }

/* Los bordes se desvanecen en vez de cortarse en seco */
.hc-plot {
    -webkit-mask-image: linear-gradient(to right, transparent 0, #000 26px, #000 calc(100% - 20px), transparent 100%);
    mask-image: linear-gradient(to right, transparent 0, #000 26px, #000 calc(100% - 20px), transparent 100%);
}

.hc-period { position: relative; padding: 6px 13px; border-radius: 9px; border: none; background: transparent;
    font-family: inherit; font-size: 12px; letter-spacing: -0.01em; cursor: pointer;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.hc-period:active { transform: scale(0.97); }

.hc-cal { width: 32px; height: 32px; border-radius: 10px; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.hc-cal:active { transform: scale(0.94); }

.hc-apply { height: 40px; border-radius: 12px; border: none; cursor: pointer; font-family: inherit;
    font-size: 13.5px; font-weight: 600;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.hc-apply:active { transform: scale(0.98); }

@media (hover: hover) and (pointer: fine) {
    .hc-period:hover { color: var(--toul-text-muted); }
    .hc-cal:hover { background: rgba(255,255,255,0.06); }
}
@media (prefers-reduced-motion: reduce) {
    .hc-period:active, .hc-cal:active, .hc-apply:active { transform: none; }
}
`

interface HeroChartProps {
    storeId: string
    period: Period
    setPeriod: (p: Period) => void
    revenue: number
    loading: boolean
    customRange: { from: string; to: string } | null
    setCustomRange: (range: { from: string; to: string } | null) => void
    mobileHeight?: number
    hideControls?: boolean
    avg7d?: number | null
    streak?: number
    yesterdayTotal?: number
}

export default function HeroChart({ storeId, period, setPeriod, revenue, loading, customRange, setCustomRange, mobileHeight, hideControls, avg7d, streak = 0, yesterdayTotal = 0 }: HeroChartProps) {
    const supabase = createClient()
    const [data, setData] = useState<ChartPoint[]>([])
    const [chartLoading, setChartLoading] = useState(true)

    // Calendar popover state
    const [showCalendar, setShowCalendar] = useState(false)
    const [calFrom, setCalFrom] = useState('')
    const [calTo, setCalTo] = useState('')
    const calRef = useRef<HTMLDivElement>(null)

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

    // Close popover on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (calRef.current && !calRef.current.contains(e.target as Node)) {
                setShowCalendar(false)
            }
        }
        if (showCalendar) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showCalendar])

    useEffect(() => { loadData() }, [storeId, period, customRange])

    async function loadData() {
        if (!storeId) return
        setChartLoading(true)

        if (period === 'today') {
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const { data: sales } = await supabase
                .from('sales').select('total, created_at')
                .eq('store_id', storeId)
                .gte('created_at', todayStart.toISOString())
                .order('created_at')

            const hourMap: number[] = new Array(24).fill(0)
            for (const s of (sales || [])) {
                const h = new Date(s.created_at).getHours()
                hourMap[h] += s.total
            }
            setData(hourMap.map((total, h) => ({
                label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
                total,
            })))
        } else if (period === 'custom' && customRange) {
            const { data: sales } = await supabase
                .from('sales').select('total, created_at')
                .eq('store_id', storeId)
                .gte('created_at', customRange.from)
                .lte('created_at', customRange.to)
                .order('created_at')

            const grouped: Record<string, number> = {}
            for (const s of (sales || [])) {
                const d = formatDate(s.created_at)
                grouped[d] = (grouped[d] || 0) + s.total
            }
            setData(Object.entries(grouped).map(([label, total]) => ({ label, total })))
        } else {
            const { from, to } = getDateRange(period)
            let q = supabase.from('sales').select('total, created_at').eq('store_id', storeId).order('created_at')
            if (from) q = q.gte('created_at', from)
            if (to) q = q.lte('created_at', to)
            const { data: sales } = await q
            const grouped: Record<string, number> = {}
            for (const s of (sales || [])) {
                const d = formatDate(s.created_at)
                grouped[d] = (grouped[d] || 0) + s.total
            }
            setData(Object.entries(grouped).map(([label, total]) => ({ label, total })))
        }
        setChartLoading(false)
    }

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' }
    ]

    function handleApplyCustomRange() {
        if (!calFrom || !calTo) return
        const fromISO = new Date(calFrom + 'T00:00:00').toISOString()
        const toISO = new Date(calTo + 'T23:59:59').toISOString()
        setCustomRange({ from: fromISO, to: toISO })
        setPeriod('custom')
        setShowCalendar(false)
    }

    const periodLabel = period === 'custom'
        ? 'Rango personalizado'
        : period === 'today' ? 'de hoy' : period === 'week' ? 'de la semana' : 'del mes'

    /* ══════════════════════════════════════════════════════════════
       El gráfico no vive en una caja: se funde con el fondo.
       Los bordes se desvanecen con una máscara y la línea deja un
       halo suave, como en una app de bolsa.
       ══════════════════════════════════════════════════════════════ */

    const tooltipStyle = {
        contentStyle: {
            background: 'rgba(18,18,18,0.82)',
            backdropFilter: 'blur(16px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            fontSize: 11,
            padding: '8px 12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
        },
        labelStyle: { color: 'var(--toul-text-dim)', marginBottom: 3, fontWeight: 500, fontSize: 10 },
        itemStyle: { color: 'var(--toul-text)', fontWeight: 600 },
        cursor: { stroke: 'rgba(255,255,255,0.16)', strokeWidth: 1 },
        formatter: (v: number) => [formatCOP(v), 'Ventas'],
    }

    return (
        <motion.div
            className="hc-root flex flex-col"
            style={{ height: mobileHeight || 380 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
            <style>{HERO_CSS}</style>

            {/* ── Encabezado ── */}
            <div className="flex items-start justify-between gap-4" style={{ marginBottom: 14 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)', letterSpacing: '-0.01em' }}>
                        Ventas {periodLabel}
                    </div>
                    {loading ? (
                        <Skeleton height="2.25rem" width="180px" className="rounded-lg" />
                    ) : (
                        <>
                            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: '2px 0 0', lineHeight: 1.1 }}>
                                {formatCOP(revenue)}
                            </h2>
                            {avg7d !== null && avg7d !== undefined && (
                                <div style={{ fontSize: 11.5, color: 'var(--toul-text-dim)', marginTop: 3 }}>
                                    Promedio 7d <span style={{ color: 'var(--toul-text-muted)', fontWeight: 600 }}>{formatCOP(avg7d)}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!hideControls && (
                    <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                        <div className="flex" style={{ gap: 2 }}>
                            {PERIODS.map(p => {
                                const active = period === p.value
                                return (
                                    <button key={p.value} className="hc-period" onClick={() => setPeriod(p.value)}
                                        style={{ color: active ? 'var(--toul-text)' : 'var(--toul-text-dim)', fontWeight: active ? 600 : 500 }}>
                                        {active && (
                                            <motion.span
                                                layoutId="chart-period"
                                                transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
                                                style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: 9, background: 'rgba(255,255,255,0.07)' }}
                                            />
                                        )}
                                        <span style={{ position: 'relative', zIndex: 1 }}>{p.label}</span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Racha */}
                        {streak >= 2 && (
                            <div className="flex items-center gap-1" style={{ padding: '4px 9px', borderRadius: 999, background: 'rgba(245,158,11,0.09)' }}>
                                <svg width="11" height="13" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 0C6 0 7.5 2 7.5 4C7.5 5 7 5.5 7 5.5C7 5.5 8.5 4.5 9 3C9 3 11 5.5 11 8C11 11 8.5 13 6 13C3.5 13 1 11 1 8C1 6 2 4 3 3C3 3 3 5 4 5.5C4 5.5 3.5 2 6 0Z" fill="#F59E0B" />
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B' }}>{streak}</span>
                            </div>
                        )}

                        {/* Rango personalizado */}
                        <div className="relative" ref={calRef}>
                            <button onClick={() => setShowCalendar(v => !v)} className="hc-cal" aria-label="Rango personalizado"
                                style={{
                                    background: showCalendar || period === 'custom' ? 'rgba(255,255,255,0.07)' : 'transparent',
                                    color: period === 'custom' ? 'var(--toul-accent)' : 'var(--toul-text-dim)',
                                }}>
                                <Calendar size={15} />
                            </button>

                            <AnimatePresence>
                                {showCalendar && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                                        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                                        className="absolute right-0 top-full mt-2 z-50 p-4 rounded-2xl"
                                        style={{
                                            transformOrigin: 'top right',
                                            background: 'var(--toul-surface-overlay)',
                                            border: '1px solid rgba(255,255,255,0.09)',
                                            boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
                                            minWidth: 260,
                                        }}
                                    >
                                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--toul-text-dim)', marginBottom: 10 }}>
                                            Rango personalizado
                                        </div>
                                        <div className="space-y-2 mb-3">
                                            <div>
                                                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                                                <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)}
                                                    className="toul-input text-sm w-full" style={{ colorScheme: 'dark' }} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                                                <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)}
                                                    className="toul-input text-sm w-full" style={{ colorScheme: 'dark' }} />
                                            </div>
                                        </div>
                                        <button onClick={handleApplyCustomRange} disabled={!calFrom || !calTo}
                                            className="hc-apply w-full"
                                            style={{
                                                background: calFrom && calTo ? 'var(--toul-accent)' : 'rgba(255,255,255,0.06)',
                                                color: calFrom && calTo ? '#000' : 'var(--toul-text-subtle)',
                                            }}>
                                            Aplicar
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>

            {/* ── El gráfico ── */}
            <div ref={plotRef} className="hc-plot" style={{ flex: 1, minHeight: 0 }}>
                {chartLoading ? (
                    <div className="w-full h-full flex items-end gap-2">
                        {[...Array(12)].map((_, i) => (
                            <Skeleton key={i} height={`${20 + (i * 7) % 60}%`} width="100%" className="rounded-t-md opacity-20" />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <span style={{ fontSize: 12.5, color: 'var(--toul-text-faint)' }}>Todavía no hay ventas en este periodo</span>
                    </div>
                ) : canRender ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--toul-accent)" stopOpacity={0.26} />
                                    <stop offset="45%" stopColor="var(--toul-accent)" stopOpacity={0.09} />
                                    <stop offset="100%" stopColor="var(--toul-accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 10, fontWeight: 500 }}
                                interval={period === 'today' ? 3 : 'preserveStartEnd'}
                                padding={{ left: 14, right: 14 }}
                                dy={4}
                            />
                            {/* Un día sin ventas igual tiene que dibujar la línea en cero:
                                con el techo pegado al máximo real, en cero no se veía nada */}
                            <YAxis hide domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.12 : 1)]} />
                            <Tooltip {...(tooltipStyle as any)} />
                            {period === 'today' && yesterdayTotal > 0 && (
                                <ReferenceLine
                                    y={yesterdayTotal}
                                    stroke="rgba(255,255,255,0.14)"
                                    strokeDasharray="3 5"
                                    strokeWidth={1}
                                    label={{
                                        value: `ayer ${formatCOP(yesterdayTotal)}`,
                                        position: 'insideTopRight',
                                        fill: 'rgba(255,255,255,0.3)',
                                        fontSize: 10,
                                        fontWeight: 500,
                                    }}
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="var(--toul-accent)"
                                strokeWidth={2}
                                strokeLinecap="round"
                                fillOpacity={1}
                                fill="url(#revenueGradient)"
                                animationDuration={520}
                                animationEasing="ease-out"
                                activeDot={{ r: 4, fill: 'var(--toul-accent)', stroke: 'var(--toul-bg)', strokeWidth: 3 }}
                                style={{ filter: 'drop-shadow(0 3px 12px rgba(50,215,75,0.28))' }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : null}
            </div>
        </motion.div>
    )
}
