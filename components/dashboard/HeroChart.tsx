'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    AreaChart, Area,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts'
import { formatCOP, getDateRange, formatDate } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'
interface ChartPoint { label: string; total: number }

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
                .eq('store_id', storeId).eq('is_credit', false)
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
                .eq('store_id', storeId).eq('is_credit', false)
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
            let q = supabase.from('sales').select('total, created_at').eq('store_id', storeId).eq('is_credit', false).order('created_at')
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

    const tooltipStyle = {
        contentStyle: { background: '#111', border: '1px solid #222', borderRadius: 12, fontSize: 10, padding: '8px 12px' },
        labelStyle: { color: '#666', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', fontSize: 9 },
        cursor: { stroke: 'var(--toul-accent)', strokeWidth: 1, strokeDasharray: '4 4' },
        formatter: (v: number) => [formatCOP(v), 'Ventas'],
    }

    return (
        <motion.div
            className={`toul-card p-6 flex flex-col bg-[var(--toul-surface)] border-[var(--toul-border)]`}
            style={{ height: mobileHeight || 380 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
        >
            {/* Command Zone Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--toul-text-subtle)' }}>
                        Ventas {periodLabel}
                    </div>
                    {loading ? (
                        <Skeleton height="2.25rem" width="180px" className="rounded-lg" />
                    ) : (
                        <>
                            <h2 className="text-3xl font-black tracking-tighter text-white">
                                {formatCOP(revenue)}
                            </h2>
                            {avg7d !== null && avg7d !== undefined && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[10px] font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Promedio 7d:</span>
                                    <span className="text-[10px] font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(avg7d)}</span>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!hideControls && (
                    <div className="flex items-center gap-2">
                        <div className="flex p-0.5 rounded-xl" style={{ background: 'var(--toul-bg)', border: '1px solid var(--toul-border)' }}>
                            {PERIODS.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setPeriod(p.value)}
                                    className="px-4 py-1.5 rounded-lg text-[10px] font-bold"
                                    style={{
                                        transition: 'var(--toul-transition)',
                                        ...(period === p.value
                                            ? { background: 'var(--toul-surface-2)', color: 'var(--toul-text)', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }
                                            : { color: 'var(--toul-text-subtle)' })
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Streak flame badge */}
                        {streak >= 2 && (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                                style={{
                                    background: 'rgba(245, 158, 11, 0.08)',
                                    border: '1px solid rgba(245, 158, 11, 0.15)',
                                }}>
                                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 0C6 0 7.5 2 7.5 4C7.5 5 7 5.5 7 5.5C7 5.5 8.5 4.5 9 3C9 3 11 5.5 11 8C11 11 8.5 13 6 13C3.5 13 1 11 1 8C1 6 2 4 3 3C3 3 3 5 4 5.5C4 5.5 3.5 2 6 0Z" fill="#F59E0B" />
                                </svg>
                                <span className="text-[10px] font-bold" style={{ color: '#F59E0B' }}>{streak}</span>
                            </div>
                        )}

                        {/* Calendar button with popover */}
                        <div className="relative" ref={calRef}>
                            <button
                                onClick={() => setShowCalendar(v => !v)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl"
                                style={{
                                    background: showCalendar || period === 'custom' ? 'var(--toul-surface-2)' : 'var(--toul-bg)',
                                    border: `1px solid ${showCalendar || period === 'custom' ? 'var(--toul-accent-dim)' : 'var(--toul-border)'}`,
                                    color: period === 'custom' ? 'var(--toul-accent)' : 'var(--toul-text-subtle)',
                                    transition: 'var(--toul-transition)',
                                }}
                            >
                                <Calendar size={14} />
                            </button>

                            <AnimatePresence>
                                {showCalendar && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 4, scale: 0.96 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 4, scale: 0.96 }}
                                        transition={{ duration: 0.12 }}
                                        className="absolute right-0 top-full mt-2 z-50 p-4 rounded-2xl shadow-2xl"
                                        style={{
                                            background: 'var(--toul-surface)',
                                            border: '1px solid var(--toul-border)',
                                            minWidth: 260,
                                        }}
                                    >
                                        <div className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--toul-text-subtle)' }}>
                                            Rango personalizado
                                        </div>
                                        <div className="space-y-2 mb-3">
                                            <div>
                                                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                                                <input
                                                    type="date"
                                                    value={calFrom}
                                                    onChange={e => setCalFrom(e.target.value)}
                                                    className="toul-input text-sm w-full"
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                                                <input
                                                    type="date"
                                                    value={calTo}
                                                    onChange={e => setCalTo(e.target.value)}
                                                    className="toul-input text-sm w-full"
                                                    style={{ colorScheme: 'dark' }}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleApplyCustomRange}
                                            disabled={!calFrom || !calTo}
                                            className="w-full py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider"
                                            style={{
                                                background: calFrom && calTo ? 'var(--toul-accent)' : 'var(--toul-border)',
                                                color: calFrom && calTo ? '#fff' : 'var(--toul-text-subtle)',
                                                transition: 'var(--toul-transition)',
                                            }}
                                        >
                                            Aplicar
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}
            </div>

            {/* Expansive Main Protagonist */}
            <div className="flex-1 min-h-0 -ml-6 -mr-2">
                {chartLoading ? (
                    <div className="w-full h-full flex items-end justify-between px-6 pb-2 gap-2">
                        {[...Array(12)].map((_, i) => (
                            <Skeleton key={i} height={`${20 + (i * 7) % 60}%`} width="100%" className="rounded-t-md opacity-20" />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                        <div className="text-[11px] font-bold uppercase tracking-widest">Sin actividad comercial</div>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--toul-accent)" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="var(--toul-accent)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="0" vertical={false} stroke="#1A1A1A" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#333', fontSize: 9, fontWeight: 700 }}
                                interval={period === 'today' ? 3 : 'preserveStartEnd'}
                                padding={{ left: 30, right: 0 }}
                            />
                            <YAxis hide />
                            <Tooltip {...(tooltipStyle as any)} />
                            {/* Yesterday reference line — today view only */}
                            {period === 'today' && yesterdayTotal > 0 && (
                                <ReferenceLine
                                    y={yesterdayTotal}
                                    stroke="var(--toul-border-2)"
                                    strokeDasharray="4 4"
                                    strokeWidth={1}
                                    label={{
                                        value: `ayer ${formatCOP(yesterdayTotal)}`,
                                        position: 'right',
                                        fill: 'var(--toul-text-subtle)',
                                        fontSize: 9,
                                        fontWeight: 600,
                                    }}
                                />
                            )}
                            <Area
                                type="monotone"
                                dataKey="total"
                                stroke="var(--toul-accent)"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#revenueGradient)"
                                animationDuration={600}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </motion.div>
    )
}
