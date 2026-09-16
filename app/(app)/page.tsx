'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, getDateRange, getDaysDiff } from '@/lib/utils'
import { Settings, Calendar } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import useSWR from 'swr'

// Components
import HeroChart from '@/components/dashboard/HeroChart'
import DashboardMetrics from '@/components/dashboard/DashboardMetrics'
import OperationalMetrics from '@/components/dashboard/OperationalMetrics'
import StrategicMetrics from '@/components/dashboard/StrategicMetrics'
import MobileDashboard from '@/components/dashboard/MobileDashboard'
import { Skeleton } from '@/components/ui/Skeleton'
import { Star } from 'lucide-react'

// Hooks & Motion
import { useStore } from '@/lib/hooks/useData'
import { fadeUp, staggerContainer, t } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'

export default function DashboardPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null
    const storeName = store?.name || ''

    const [period, setPeriod] = useState<Period>('today')
    const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)

    // ─── MAIN METRICS FETCHING ──────────────────────────────────────────────
    const { data: dashboardData, isLoading: metricsLoading } = useSWR(
        storeId ? ['dashboard-v3', storeId, period, customRange] : null,
        async () => {
            const range = period === 'custom' && customRange ? customRange : getDateRange(period)
            const daysCount = getDaysDiff(range.from, range.to)

            // Previous period range for variation
            const prevRange = getPrevRange(period, range)

            // ── Date helpers for extra queries ─────────────────────────────
            const now = new Date()
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
            const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1)
            const sevenDaysAgo = new Date(todayStart); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

            // Fetch current data + new dashboard enhancement queries
            const [sales, expenses, products, pm, deposits, purchases, sales7d, salesStreak, salesYesterday, customersDebt, providersPending] = await Promise.all([
                supabase.from('sales').select('total, created_at, sale_items(unit_price, unit_cost, quantity, product_id, products(name, image_url))').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('expenses').select('amount, created_at').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('products').select('*').eq('store_id', storeId).eq('is_active', true),
                supabase.from('payment_methods').select('*').eq('store_id', storeId).eq('is_active', true).order('sort_order'),
                supabase.from('payments').select('amount, method, type').eq('store_id', storeId),
                supabase.from('purchases').select('total, created_at, provider_id, due_date').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                // Mejora 1: 7-day average
                supabase.from('sales').select('total, created_at').eq('store_id', storeId).gte('created_at', sevenDaysAgo.toISOString()),
                // Mejora 1: Streak — all unique sale dates (last 60 days max)
                supabase.from('sales').select('created_at').eq('store_id', storeId).gte('created_at', new Date(todayStart.getTime() - 60 * 86400000).toISOString()).order('created_at', { ascending: false }),
                // Mejora 1: Yesterday's total
                supabase.from('sales').select('total').eq('store_id', storeId).gte('created_at', yesterdayStart.toISOString()).lt('created_at', todayStart.toISOString()),
                // Mejora 2: Customers with debt > 0
                supabase.from('customers').select('id, name, total_debt, created_at').eq('store_id', storeId).gt('total_debt', 0).order('total_debt', { ascending: false }).limit(10),
                // Mejora 2: Providers with credit purchases pending
                supabase.from('providers').select('id, name, total_debt').eq('store_id', storeId).gt('total_debt', 0).order('total_debt', { ascending: false }).limit(10)
            ])

            // Fetch previous data for variations
            const [prevSales, prevExpenses] = await Promise.all([
                supabase.from('sales').select('total, sale_items(unit_price, unit_cost, quantity)').eq('store_id', storeId).gte('created_at', prevRange.from || '2000-01-01').lte('created_at', prevRange.to || '2000-01-01'),
                supabase.from('expenses').select('amount').eq('store_id', storeId).gte('created_at', prevRange.from || '2000-01-01').lte('created_at', prevRange.to || '2000-01-01')
            ])

            // 1. CALCULATE TOP ROW METRICS
            const currentRevenue = Math.round((sales.data || []).reduce((s, r) => s + r.total, 0))
            const currentExpenses = Math.round((expenses.data || []).reduce((s, e) => s + e.amount, 0))
            const salesCount = (sales.data || []).length
            const avgTicket = salesCount > 0 ? Math.round(currentRevenue / salesCount) : 0

            let currentCost = 0
            const productUnitsMap: Record<string, { name: string; image_url: string | null; units: number; profit: number; stock: number; last_sale: string }> = {}

            for (const s of (sales.data || [])) {
                for (const item of (s.sale_items as any || [])) {
                    currentCost += Math.round((item.unit_cost || 0) * item.quantity)
                    const profitVal = Math.round((item.unit_price - (item.unit_cost || 0)) * item.quantity)

                    const pid = item.product_id
                    if (!productUnitsMap[pid]) {
                        productUnitsMap[pid] = {
                            name: item.products?.name || 'Producto',
                            image_url: item.products?.image_url || null,
                            units: 0,
                            profit: 0,
                            stock: 0,
                            last_sale: s.created_at
                        }
                    }
                    productUnitsMap[pid].units += item.quantity
                    productUnitsMap[pid].profit += profitVal
                }
            }

            const currentNetProfit = Math.round(currentRevenue - currentCost - currentExpenses)

            // Previous periods for variation
            const pRev = Math.round((prevSales.data || []).reduce((s, r) => s + r.total, 0))
            const pExp = Math.round((prevExpenses.data || []).reduce((s, e) => s + e.amount, 0))
            const pSalesCount = (prevSales.data || []).length

            let pCost = 0
            for (const s of (prevSales.data || [])) {
                for (const item of (s.sale_items as any || [])) {
                    pCost += Math.round((item.unit_cost || 0) * item.quantity)
                }
            }
            const pNetProfit = Math.round(pRev - pCost - pExp)

            // 2. OPERATIONAL DATA: PRODUCTS
            const sortedByUnits = Object.entries(productUnitsMap).map(([id, p]) => ({ id, ...p, value: p.units, units: p.units, subValue: `${p.units} unidades` })).sort((a, b) => b.value - a.value).slice(0, 5)
            const sortedByProfit = Object.entries(productUnitsMap).map(([id, p]) => ({ id, ...p, value: p.profit, units: p.units, subValue: formatCOP(p.profit) })).sort((a, b) => b.value - a.value).slice(0, 5)
            const lowStock = (products.data || []).filter(p => p.stock <= (p.low_stock_threshold || 5)).map(p => ({ id: p.id, name: p.name, image_url: p.image_url, value: p.stock, units: 0, subValue: `${p.stock} disponibles` })).sort((a, b) => a.value - b.value).slice(0, 5)

            // Slow moving (all active products - those sold)
            const soldIds = new Set(Object.keys(productUnitsMap))
            const slowMoving = (products.data || []).filter(p => !soldIds.has(p.id) && p.stock > 0).map(p => {
                const days = getDaysDiff(p.created_at, new Date().toISOString())
                return { id: p.id, name: p.name, image_url: p.image_url, value: days, units: 0, subValue: `${days} días sin rotación` }
            }).sort((a, b) => b.value - a.value).slice(0, 5)

            // 3. STRATEGIC DATA: CAJA
            const balMap: Record<string, number> = {}
            for (const p of (deposits.data || [])) {
                const isOut = p.type === 'transfer_out' || p.type === 'expense' || p.type === 'purchase' || p.type === 'provider_payment'
                const sign = isOut ? -1 : 1
                balMap[p.method] = (balMap[p.method] || 0) + p.amount * sign
            }

            const totalMoney = Math.round(Object.values(balMap).reduce((s, v) => s + v, 0))
            const distribution = (pm.data || []).map(m => ({
                name: m.name,
                value: Math.max(0, balMap[m.name] || 0),
                color: m.color
            })).filter(d => d.value > 0)

            // ── Mejora 1: Compute 7-day average ────────────────────────────
            const dayTotals7d: Record<string, number> = {}
            for (const s of (sales7d.data || [])) {
                const d = new Date(s.created_at).toISOString().slice(0, 10)
                dayTotals7d[d] = (dayTotals7d[d] || 0) + s.total
            }
            const dayValues7d = Object.values(dayTotals7d)
            const avg7d = dayValues7d.length >= 2 ? Math.round(dayValues7d.reduce((a, b) => a + b, 0) / dayValues7d.length) : null

            // ── Mejora 1: Compute streak ─────────────────────────────────────
            const saleDatesSet = new Set<string>()
            for (const s of (salesStreak.data || [])) {
                saleDatesSet.add(new Date(s.created_at).toISOString().slice(0, 10))
            }
            let streak = 0
            const checkDate = new Date(todayStart)
            // If there are sales today, start counting from today; otherwise from yesterday
            if (!saleDatesSet.has(checkDate.toISOString().slice(0, 10))) {
                checkDate.setDate(checkDate.getDate() - 1)
            }
            while (saleDatesSet.has(checkDate.toISOString().slice(0, 10))) {
                streak++
                checkDate.setDate(checkDate.getDate() - 1)
            }

            // ── Mejora 1: Yesterday's total ──────────────────────────────────
            const yesterdayTotal = Math.round((salesYesterday.data || []).reduce((s, r) => s + r.total, 0))

            // ── Mejora 2: Customer debts (por cobrar) ────────────────────────
            const customerDebts = (customersDebt.data || []).map(c => ({
                id: c.id,
                name: c.name,
                amount: Math.round(c.total_debt),
                createdAt: c.created_at,
                isOverdue: false, // Clients don't have due_date; use 'hace X días' instead
            }))

            // ── Mejora 2: Provider debts (por pagar) ─────────────────────────
            const providerDebts = (providersPending.data || []).map(p => ({
                id: p.id,
                name: p.name,
                amount: Math.round(p.total_debt),
                dueDate: null as string | null, // We'll enrich this in a future iteration if needed
                isOverdue: false,
            }))

            return {
                metrics: {
                    revenue: currentRevenue,
                    expenses: currentExpenses,
                    netProfit: currentNetProfit,
                    salesCount,
                    avgTicket,
                    prevRevenue: pRev,
                    prevExpenses: pExp,
                    prevNetProfit: pNetProfit,
                    prevSalesCount: pSalesCount
                },
                operational: {
                    products: { topUnits: sortedByUnits, topProfit: sortedByProfit, lowStock, slowMoving }
                },
                strategic: { totalMoney, distribution },
                chart: { avg7d, streak, yesterdayTotal },
                pending: { customerDebts, providerDebts }
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    const { data: insights, isLoading: insightsLoading } = useSWR(
        storeId ? ['insights', storeId] : null,
        async () => {
            const r = await fetch('/api/ai-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
            const d = await r.json()
            return d.insights as AIInsight[]
        },
        { revalidateOnFocus: false, dedupingInterval: 300000 }
    )

    const loading = metricsLoading || storeLoading

    const greeting = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Buenos días'
        if (hour < 18) return 'Buenas tardes'
        return 'Buenas noches'
    }, [])

    const currentDate = useMemo(() => {
        return new Intl.DateTimeFormat('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }).format(new Date())
    }, [])

    // Top product for mobile
    const topProduct = useMemo(() => {
        const units = dashboardData?.operational.products.topUnits
        if (!units || units.length === 0) return null
        return { name: units[0].name, image_url: units[0].image_url, units: units[0].units }
    }, [dashboardData])

    return (
        <>
            {/* ── MOBILE DASHBOARD ──────────────────────────────────────────── */}
            <div className="lg:hidden">
                <MobileDashboard
                    storeName={storeName}
                    currentDate={currentDate}
                    storeId={storeId}
                    period={period}
                    setPeriod={setPeriod}
                    customRange={customRange}
                    setCustomRange={setCustomRange}
                    metrics={{
                        revenue: dashboardData?.metrics.revenue || 0,
                        expenses: dashboardData?.metrics.expenses || 0,
                        netProfit: dashboardData?.metrics.netProfit || 0,
                        salesCount: dashboardData?.metrics.salesCount || 0,
                        avgTicket: dashboardData?.metrics.avgTicket || 0,
                    }}
                    topProduct={topProduct}
                    insight={insights?.[0] || null}
                    strategic={dashboardData?.strategic || { totalMoney: 0, distribution: [] }}
                    loading={loading}
                    insightsLoading={insightsLoading || false}
                />
            </div>

            {/* ── DESKTOP DASHBOARD ─────────────────────────────────────────── */}
            <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="hidden lg:flex w-full max-w-none px-6 xl:px-8 py-6 min-h-screen flex-col gap-6"
            >
                {/* Identity Header — Calm, minimal */}
                <motion.div variants={fadeUp} className="flex items-end justify-between mb-1">
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--toul-text-subtle)]">
                                {greeting}
                            </span>
                            <div className="w-1 h-1 rounded-full" style={{ background: 'var(--toul-border-2)' }} />
                            <span className="text-[10px] font-bold text-[var(--toul-text-subtle)] uppercase tracking-widest">
                                {currentDate}
                            </span>
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter uppercase text-white">
                            {storeName || 'Mi Negocio'}
                        </h1>
                    </div>
                    <Link href="/settings" className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--toul-surface)] border border-[var(--toul-border)] text-[var(--toul-text-subtle)] hover:text-white hover:border-[var(--toul-border-2)]" style={{ transition: 'var(--toul-transition)' }}>
                        <Settings size={16} />
                    </Link>
                </motion.div>

                {/* Row 1: Chart Protagonist (8) + Vital Signs (4) */}
                <div className="grid grid-cols-12 gap-6 items-stretch">
                    <div className="col-span-8">
                        <HeroChart
                            storeId={storeId!}
                            period={period}
                            setPeriod={setPeriod}
                            revenue={dashboardData?.metrics.revenue || 0}
                            loading={loading}
                            customRange={customRange}
                            setCustomRange={setCustomRange}
                            avg7d={dashboardData?.chart.avg7d ?? null}
                            streak={dashboardData?.chart.streak ?? 0}
                            yesterdayTotal={dashboardData?.chart.yesterdayTotal ?? 0}
                        />
                    </div>
                    <div className="col-span-4">
                        <DashboardMetrics.MiniStrip
                            metrics={dashboardData?.metrics || {}}
                            loading={loading}
                        />
                    </div>
                </div>

                {/* Row 2: Operational + Cash + AI — with breathing room */}
                <OperationalMetrics
                    products={dashboardData?.operational.products || { topUnits: [], topProfit: [], lowStock: [], slowMoving: [] }}
                    strategic={dashboardData?.strategic || { totalMoney: 0, distribution: [] }}
                    insights={insights || []}
                    loading={loading}
                    insightsLoading={insightsLoading}
                    pending={dashboardData?.pending || { customerDebts: [], providerDebts: [] }}
                />
            </motion.div>
        </>
    )
}

function getPrevRange(period: Period, current: { from: string | null; to: string | null }) {
    if (!current.from || !current.to) return { from: null, to: null }

    const start = new Date(current.from)
    const end = new Date(current.to)

    if (period === 'today') {
        const yesterdayStart = new Date(start)
        yesterdayStart.setDate(yesterdayStart.getDate() - 1)
        const yesterdayEnd = new Date(end)
        yesterdayEnd.setDate(yesterdayEnd.getDate() - 1)
        return { from: yesterdayStart.toISOString(), to: yesterdayEnd.toISOString() }
    }

    const diff = end.getTime() - start.getTime()
    return {
        from: new Date(start.getTime() - diff).toISOString(),
        to: current.from
    }
}
