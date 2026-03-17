'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, getDateRange } from '@/lib/utils'
import { TrendingUp, Package, Settings, Brain, ChevronRight, Star } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import HeroChart from '@/components/dashboard/HeroChart'
import AIInsightCard from '@/components/dashboard/AIInsightCard'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import type { AIInsight } from '@/lib/types'
import { staggerContainer, staggerItem, fadeUp, t } from '@/lib/motion'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'

type Period = 'today' | 'week' | 'month' | 'total'

interface StarProduct {
    name: string
    image_url: string | null
    units: number
    revenue: number
}

export default function DashboardPage() {
    const supabase = createClient()
    const [period, setPeriod] = useState<Period>('today')
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null
    const storeName = store?.name || ''

    // Metrics fetching with SWR for caching
    const { data: metricsData, isLoading: metricsLoading } = useSWR(
        storeId ? ['metrics', storeId, period] : null,
        async () => {
            const { from, to } = getDateRange(period)
            let q = supabase.from('sales').select('total, sale_items(unit_price, unit_cost, quantity, product_id, products(name, image_url))').eq('store_id', storeId).eq('is_credit', false)
            if (from) q = q.gte('created_at', from)
            if (to) q = q.lte('created_at', to)
            const { data: sales } = await q

            let revenue = 0, profit = 0
            const productMap: Record<string, { name: string; image_url: string | null; units: number; revenue: number }> = {}

            for (const sale of (sales || [])) {
                revenue += sale.total
                for (const item of ((sale as any).sale_items || [])) {
                    profit += (item.unit_price - item.unit_cost) * item.quantity
                    const pid = item.product_id
                    if (!productMap[pid]) {
                        productMap[pid] = { name: (item.products as any)?.name || 'Producto', image_url: (item.products as any)?.image_url || null, units: 0, revenue: 0 }
                    }
                    productMap[pid].units += item.quantity
                    productMap[pid].revenue += item.unit_price * item.quantity
                }
            }

            const { data: products } = await supabase.from('products').select('stock, cpp').eq('store_id', storeId).eq('is_active', true)
            const inventoryValue = (products || []).reduce((s, p) => s + p.stock * p.cpp, 0)

            const entries = Object.values(productMap).sort((a, b) => b.revenue - a.revenue)

            return {
                metrics: { revenue, profit, inventoryValue },
                starProduct: entries[0] || null
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 } // 30s cache
    )

    const metrics = metricsData?.metrics || { revenue: 0, profit: 0, inventoryValue: 0 }
    const starProduct = metricsData?.starProduct || null
    const loading = metricsLoading || storeLoading

    const { data: insights, isLoading: insightsLoading } = useSWR(
        storeId ? ['insights', storeId] : null,
        async () => {
            const r = await fetch('/api/ai-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
            const d = await r.json()
            return d.insights as AIInsight[]
        },
        { revalidateOnFocus: false, dedupingInterval: 300000 } // 5min cache
    )

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
        { value: 'total', label: 'Todo' },
    ]

    return (
        <div className="px-4 md:px-8 pt-6 pb-4">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Dashboard</p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>
                        Hola, <span className="gradient-text">{storeName || (storeLoading ? '...' : '')}</span> 👋
                    </h1>
                </div>
                <Link href="/settings" className="w-9 h-9 rounded-full flex items-center justify-center md:hidden"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                    <Settings size={18} />
                </Link>
            </motion.div>

            {/* ═══ HERO: CHART ═══ */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.05 }}
                className="toul-card mb-4 pt-4 pb-2" style={{ background: 'var(--toul-surface)' }}>

                {/* Period tabs with layoutId pill */}
                <div className="flex gap-1 px-2 mb-4">
                    {PERIODS.map(p => (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                            className="relative flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            style={{ color: period === p.value ? '#fff' : 'var(--toul-text-subtle)' }}>
                            {period === p.value && (
                                <motion.span layoutId="periodPill" className="absolute inset-0 rounded-lg"
                                    style={{ background: 'var(--toul-accent)' }} transition={t.base} />
                            )}
                            <span className="relative z-10">{p.label}</span>
                        </button>
                    ))}
                </div>

                {/* Revenue hero number */}
                <div className="px-2 mb-3">
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Facturación</p>
                    {loading ? (
                        <Skeleton height="2.25rem" width="160px" className="rounded-lg" />
                    ) : (
                        <AnimatedNumber value={metrics.revenue} formatter={formatCOP}
                            className="text-3xl font-bold tracking-tight"
                            style={{ color: 'var(--toul-text)' } as React.CSSProperties} duration={0.5} />
                    )}
                </div>

                {storeId ? <HeroChart storeId={storeId} period={period} /> : <div className="h-[200px] flex items-center justify-center"><Skeleton height="150px" width="100%" /></div>}
            </motion.div>

            {/* ═══ METRICS ROW ═══ */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <MetricChip label="Ganancia real" value={metrics.profit} loading={loading}
                    color="var(--toul-accent)" icon={<TrendingUp size={14} />} />
                <MetricChip label="Capital en productos" value={metrics.inventoryValue} loading={loading}
                    color="#F59E0B" icon={<Package size={14} />} />
                <motion.div variants={staggerItem} className="col-span-2 md:col-span-1">
                    <Link href="/cash" className="toul-card toul-card-interactive h-full flex items-center justify-between"
                        style={{ textDecoration: 'none' }}>
                        <div>
                            <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Ver caja</p>
                            <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>Saldos y movimientos</p>
                        </div>
                        <ChevronRight size={16} style={{ color: 'var(--toul-text-subtle)' }} />
                    </Link>
                </motion.div>
            </motion.div>

            {/* ═══ PRODUCTO ESTRELLA ═══ */}
            {loading ? (
                <Skeleton height="80px" className="rounded-2xl mb-4" />
            ) : starProduct ? (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.12 }}
                    className="toul-card mb-4 flex items-center gap-4 relative overflow-hidden"
                    style={{ borderColor: '#854d0e40', background: 'rgba(120,53,15,0.05)' }}>
                    <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full" style={{ background: '#F59E0B' }} />
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {starProduct.image_url ? (
                            <img src={starProduct.image_url} alt={starProduct.name}
                                className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                                style={{ background: 'rgba(245,158,11,0.1)' }}>📦</div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <Star size={12} fill="#F59E0B" style={{ color: '#F59E0B' }} />
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>Producto estrella</span>
                            </div>
                            <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{starProduct.name}</p>
                            <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{starProduct.units} unid. vendidas</p>
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0 relative z-10">
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Facturado</p>
                        <p className="font-bold text-sm" style={{ color: '#F59E0B' }}>{formatCOP(starProduct.revenue)}</p>
                    </div>
                </motion.div>
            ) : null}

            {/* ═══ AI MANAGER ═══ */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Brain size={16} style={{ color: 'var(--toul-accent)' }} />
                    <h2 className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>AI Manager</h2>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                        Inteligencia de negocio
                    </span>
                </div>
                {insightsLoading ? (
                    <div className="flex flex-col gap-3">
                        <Skeleton height="100px" className="rounded-2xl" />
                        <Skeleton height="100px" className="rounded-2xl" />
                    </div>
                ) : !insights || insights.length === 0 ? (
                    <div className="toul-card text-center py-7">
                        <Brain size={26} className="mx-auto mb-2" style={{ color: 'var(--toul-border-2)' }} />
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Registra ventas para obtener insights</p>
                    </div>
                ) : (
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-3">
                        {insights.slice(0, 2).map((insight, i) => (
                            <motion.div key={insight.id} variants={staggerItem} transition={{ ...t.base, delay: i * 0.06 }}>
                                <AIInsightCard insight={insight} />
                            </motion.div>
                        ))}
                    </motion.div>
                )}
            </div>
        </div>
    )
}

function MetricChip({ label, value, loading, color, icon }: {
    label: string; value: number; loading: boolean; color: string; icon: React.ReactNode
}) {
    return (
        <motion.div variants={staggerItem} className="toul-card py-3">
            <div className="flex items-center gap-1.5 mb-1.5" style={{ color }}>
                {icon}
                <p className="text-xs font-medium">{label}</p>
            </div>
            {loading ? (
                <Skeleton height="1.5rem" width="100px" className="rounded" />
            ) : (
                <AnimatedNumber value={value} formatter={formatCOP}
                    className="text-lg font-bold"
                    style={{ color: 'var(--toul-text)' } as React.CSSProperties}
                    duration={0.5} />
            )}
        </motion.div>
    )
}
