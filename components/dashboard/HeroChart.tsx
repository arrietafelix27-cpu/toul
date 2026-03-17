'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import { formatCOP, getDateRange, formatDate } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

type Period = 'today' | 'week' | 'month' | 'total'
interface ChartPoint { label: string; total: number }

export default function HeroChart({ storeId, period }: { storeId: string; period: Period }) {
    const supabase = createClient()
    const [data, setData] = useState<ChartPoint[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => { loadData() }, [storeId, period])

    async function loadData() {
        setLoading(true)

        if (period === 'today') {
            // Hourly bar chart — group sales 0-23h
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)
            const { data: sales } = await supabase
                .from('sales').select('total, created_at')
                .eq('store_id', storeId).eq('is_credit', false)
                .gte('created_at', todayStart.toISOString())
                .order('created_at')

            // Build 24-slot array
            const hourMap: number[] = new Array(24).fill(0)
            for (const s of (sales || [])) {
                const h = new Date(s.created_at).getHours()
                hourMap[h] += s.total
            }
            const currentHour = new Date().getHours()
            setData(hourMap.map((total, h) => ({
                label: h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`,
                total,
                _hour: h,
                _active: h <= currentHour,
            } as ChartPoint & { _hour: number; _active: boolean })))
        } else {
            // Area chart — group by date
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
        setLoading(false)
    }

    if (loading) return <div className="skeleton mx-2 rounded-xl" style={{ height: 200 }} />

    if (data.length === 0 || (period !== 'today' && data.every(d => d.total === 0))) return (
        <div className="flex flex-col items-center justify-center py-12 px-4" style={{ minHeight: 160 }}>
            <p className="text-sm" style={{ color: 'var(--toul-text-subtle)' }}>Sin ventas en este período</p>
            <p className="text-xs mt-1" style={{ color: 'var(--toul-text-subtle)', opacity: 0.5 }}>
                {period === 'today' ? 'Registra tu primera venta de hoy' : 'Las ventas aparecerán aquí'}
            </p>
        </div>
    )

    const tooltipStyle = {
        contentStyle: { background: '#161616', border: '1px solid #2A2A2A', borderRadius: 12, fontSize: 12 },
        labelStyle: { color: '#8A8A8A', marginBottom: 4 },
        cursor: { fill: 'rgba(16,185,129,0.06)' },
        formatter: (v: number | string | undefined) => [formatCOP(Number(v || 0)), 'Ventas'],
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div key={period}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}>

                {period === 'today' ? (
                    /* ── HOURLY BAR CHART ─────────────────────── */
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barCategoryGap="15%">
                            <CartesianGrid stroke="#1a1a1a" strokeDasharray="0" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 9 }} axisLine={false} tickLine={false}
                                interval={2} />
                            <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false}
                                tickFormatter={v => v === 0 ? '' : `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                                labelFormatter={(label) => `Hora: ${label}`} />
                            <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                                {data.map((entry: any, i) => (
                                    <Cell key={i}
                                        fill={entry.total > 0 ? '#10B981' : '#1f1f1f'}
                                        opacity={entry._active ? 1 : 0.4}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    /* ── AREA CHART (week/month/total) ─────────── */
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="#1F1F1F" strokeDasharray="0" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false}
                                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                            <Tooltip {...tooltipStyle} cursor={{ stroke: '#10B981', strokeWidth: 1, strokeDasharray: '4 4' }} />
                            <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={2.5} fill="url(#heroGrad)"
                                dot={data.length <= 7 ? { fill: '#10B981', strokeWidth: 0, r: 3 } : false}
                                activeDot={{ r: 5, fill: '#34D399', strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </motion.div>
        </AnimatePresence>
    )
}
