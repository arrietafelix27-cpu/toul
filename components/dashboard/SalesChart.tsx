'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCOP, getDateRange, formatDate } from '@/lib/utils'

type Period = 'today' | 'week' | 'month' | 'total'

interface ChartPoint { date: string; total: number }

export default function SalesChart({ storeId, period }: { storeId: string; period: Period }) {
    const supabase = createClient()
    const [data, setData] = useState<ChartPoint[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadChartData()
    }, [storeId, period])

    async function loadChartData() {
        setLoading(true)
        const { from, to } = getDateRange(period)
        let query = supabase.from('sales').select('total, created_at').eq('store_id', storeId).eq('is_credit', false).order('created_at')
        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', to)
        const { data: sales } = await query

        // Group by date
        const grouped: Record<string, number> = {}
        for (const sale of (sales || [])) {
            const date = formatDate(sale.created_at)
            grouped[date] = (grouped[date] || 0) + sale.total
        }
        setData(Object.entries(grouped).map(([date, total]) => ({ date, total })))
        setLoading(false)
    }

    if (loading) return <div className="skeleton h-40 w-full rounded-2xl mb-4" />
    if (data.length === 0) return (
        <div className="toul-card py-6 text-center mb-4">
            <p className="text-slate-500 text-sm">Sin ventas en este período</p>
        </div>
    )

    return (
        <div className="toul-card mb-4 pt-3 pb-1">
            <p className="text-xs text-slate-400 mb-3 px-1">Ventas del período</p>
            <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={data} margin={{ top: 0, right: 4, left: -16, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', fontSize: 12 }}
                        labelStyle={{ color: '#94a3b8' }}
                        formatter={(v: number | string | undefined) => [formatCOP(Number(v || 0)), 'Ventas']}
                    />
                    <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#colorTotal)" dot={false} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    )
}
