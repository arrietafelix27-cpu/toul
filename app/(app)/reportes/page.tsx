'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { BarChart2, Package, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { staggerContainer, staggerItem, fadeUp, t } from '@/lib/motion'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'
type SortKey = 'revenue' | 'profit' | 'units' | 'margin'

interface ProductRow {
    id: string
    name: string
    image_url: string | null
    units: number
    revenue: number
    cost: number
    profit: number
    margin: number
    profitPerUnit: number
}

function getRange(period: Period, from: string, to: string): { from: string | null; to: string | null } {
    if (period === 'custom') return { from: from || null, to: to ? to + 'T23:59:59' : null }
    const now = new Date()
    if (period === 'total') return { from: null, to: null }
    if (period === 'today') {
        const s = new Date(now); s.setHours(0, 0, 0, 0)
        return { from: s.toISOString(), to: now.toISOString() }
    }
    if (period === 'week') {
        const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0)
        return { from: s.toISOString(), to: now.toISOString() }
    }
    if (period === 'month') {
        const s = new Date(now.getFullYear(), now.getMonth(), 1)
        return { from: s.toISOString(), to: now.toISOString() }
    }
    return { from: null, to: null }
}

export default function ReportesPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [period, setPeriod] = useState<Period>('month')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('profit')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const { data: reportData, isLoading: reportLoading } = useSWR(
        storeId ? ['reports', storeId, period, fromDate, toDate] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)

            // Parallel fetch for stats and items
            const [salesRes, stockRes] = await Promise.all([
                supabase.from('sale_items')
                    .select('quantity, unit_price, unit_cost, product_id, products(name, image_url), sales!inner(store_id, is_credit, created_at)')
                    .eq('sales.store_id', storeId)
                    .eq('sales.is_credit', false)
                    .gte('sales.created_at', range.from || '1970-01-01')
                    .lte('sales.created_at', range.to || '9999-12-31'),
                supabase.from('products').select('stock').eq('store_id', storeId).eq('is_active', true)
            ])

            if (salesRes.error) throw salesRes.error
            if (stockRes.error) throw stockRes.error

            const map: Record<string, ProductRow> = {}
            for (const item of (salesRes.data || [])) {
                const pid = item.product_id
                if (!map[pid]) {
                    map[pid] = {
                        id: pid,
                        name: (item.products as any)?.name || 'Producto',
                        image_url: (item.products as any)?.image_url || null,
                        units: 0, revenue: 0, cost: 0, profit: 0, margin: 0, profitPerUnit: 0,
                    }
                }
                map[pid].units += item.quantity
                map[pid].revenue += item.unit_price * item.quantity
                map[pid].cost += item.unit_cost * item.quantity
            }

            const rows = Object.values(map).map(r => {
                const profit = r.revenue - r.cost
                return {
                    ...r,
                    profit,
                    margin: r.revenue > 0 ? (profit / r.revenue) * 100 : 0,
                    profitPerUnit: r.units > 0 ? profit / r.units : 0,
                }
            })

            return {
                rows,
                totalStock: (stockRes.data || []).reduce((s, p) => s + p.stock, 0)
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const loading = reportLoading || storeLoading
    const rows = reportData?.rows || []
    const totalStock = reportData?.totalStock || 0

    const sorted = useMemo(() => {
        const copy = [...rows]
        copy.sort((a, b) => {
            const valA = a[sortKey] as number
            const valB = b[sortKey] as number
            const diff = valA - valB
            return sortDir === 'desc' ? -diff : diff
        })
        return copy
    }, [rows, sortKey, sortDir])

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        else { setSortKey(key); setSortDir('desc') }
    }

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const totalProfit = rows.reduce((s, r) => s + r.profit, 0)

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
        { value: 'total', label: 'Todo' },
        { value: 'custom', label: 'Rango' },
    ]

    function SortIcon({ k }: { k: SortKey }) {
        if (sortKey !== k) return <ChevronDown size={12} style={{ opacity: 0.3 }} />
        return sortDir === 'desc' ? <ChevronDown size={12} style={{ color: 'var(--toul-accent)' }} /> : <ChevronUp size={12} style={{ color: 'var(--toul-accent)' }} />
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-8">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5">
                <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Analytics</p>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Reportes</h1>
            </motion.div>

            {/* Period tabs */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.04 }}
                className="flex gap-1.5 mb-4 flex-wrap">
                {PERIODS.map(p => (
                    <button key={p.value} onClick={() => setPeriod(p.value)}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
                        style={period === p.value
                            ? { background: 'var(--toul-accent)', color: '#fff', borderColor: 'var(--toul-accent)' }
                            : { color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                        {p.label}
                    </button>
                ))}
            </motion.div>

            {/* Custom date range */}
            {period === 'custom' && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="toul-card mb-4 flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                        <input type="date" className="toul-input text-sm" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                        <input type="date" className="toul-input text-sm" value={toDate} onChange={e => setToDate(e.target.value)} />
                    </div>
                </motion.div>
            )}

            {/* KPIs */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                className="grid grid-cols-3 gap-3 mb-6">
                {[
                    { label: 'Total facturado', value: totalRevenue, color: 'var(--toul-text)', icon: <TrendingUp size={14} />, accent: 'var(--toul-accent)' },
                    { label: 'Utilidad bruta', value: totalProfit, color: 'var(--toul-text)', icon: <BarChart2 size={14} />, accent: 'var(--toul-accent)' },
                    { label: 'Unidades en stock', value: totalStock, color: 'var(--toul-text)', icon: <Package size={14} />, accent: '#F59E0B', raw: true },
                ].map(kpi => (
                    <motion.div key={kpi.label} variants={staggerItem} className="toul-card py-3 px-3">
                        <div className="flex items-center gap-1.5 mb-1" style={{ color: kpi.accent }}>{kpi.icon}
                            <span className="text-[10px] font-medium">{kpi.label}</span>
                        </div>
                        {loading ? <div className="skeleton h-6 w-20 rounded" /> : (
                            kpi.raw
                                ? <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                                : <AnimatedNumber value={kpi.value} formatter={formatCOP}
                                    className="text-xl font-bold"
                                    style={{ color: kpi.color } as React.CSSProperties} duration={0.5} />
                        )}
                    </motion.div>
                ))}
            </motion.div>

            {/* Profitability Table */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.1 }}>
                <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Rentabilidad por producto</h2>

                {loading ? (
                    <div className="flex flex-col gap-2">{[1, 2, 3, 4].map(n => <div key={n} className="skeleton h-14 rounded-2xl" />)}</div>
                ) : sorted.length === 0 ? (
                    <div className="toul-card text-center py-10">
                        <BarChart2 size={28} className="mx-auto mb-2" style={{ color: 'var(--toul-border-2)' }} />
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Sin ventas en este período</p>
                    </div>
                ) : (
                    <>
                        {/* Desktop table */}
                        <div className="hidden md:block rounded-2xl overflow-hidden" style={{ border: '1px solid var(--toul-border)', background: 'var(--toul-surface)' }}>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                        <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--toul-text-muted)' }}>Producto</th>
                                        {([
                                            { key: 'units' as SortKey, label: 'Unidades' },
                                            { key: 'revenue' as SortKey, label: 'Ingresos' },
                                            { key: 'profit' as SortKey, label: 'Utilidad' },
                                            { key: 'margin' as SortKey, label: 'Margen' },
                                        ]).map(col => (
                                            <th key={col.key}
                                                className="text-right px-4 py-3 text-xs font-semibold cursor-pointer select-none"
                                                style={{ color: sortKey === col.key ? 'var(--toul-accent)' : 'var(--toul-text-muted)' }}
                                                onClick={() => toggleSort(col.key)}>
                                                <span className="inline-flex items-center gap-1 justify-end">
                                                    {col.label} <SortIcon k={col.key} />
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sorted.map((row, i) => (
                                        <tr key={row.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--toul-border)' : 'none' }}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {row.image_url
                                                        ? <img src={row.image_url} alt={row.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                                                        : <div className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: 'var(--toul-border)' }}>📦</div>
                                                    }
                                                    <span className="font-medium" style={{ color: 'var(--toul-text)' }}>{row.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right" style={{ color: 'var(--toul-text-muted)' }}>{row.units}</td>
                                            <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--toul-text)' }}>{formatCOP(row.revenue)}</td>
                                            <td className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(row.profit)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
                                                    style={{ background: row.margin >= 30 ? 'var(--toul-accent-dim)' : 'rgba(245,158,11,0.1)', color: row.margin >= 30 ? 'var(--toul-accent)' : '#F59E0B' }}>
                                                    {row.margin.toFixed(1)}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden flex flex-col gap-2">
                            {sorted.map(row => (
                                <div key={row.id} className="toul-card flex items-center gap-3 py-3">
                                    {row.image_url
                                        ? <img src={row.image_url} alt={row.name} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                                        : <div className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: 'var(--toul-surface)' }}>📦</div>
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{row.name}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{row.units} unid. · Costo {formatCOP(row.cost)}</p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-bold text-sm" style={{ color: 'var(--toul-accent)' }}>{formatCOP(row.profit)}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{row.margin.toFixed(1)}% margen</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    )
}
