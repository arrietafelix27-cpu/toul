'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { useStore } from '@/lib/hooks/useData'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { fadeUp } from '@/lib/motion'
import { ReportsView, PERIODS, type Period } from '@/components/reports/ReportsView'
import { EMPTY_TOTALS, type ProductLine, type ReportData, type ReportTotals } from '@/lib/reports/types'

const supabase = createClient()

/* ── Rangos ─────────────────────────────────────────────── */

interface Range { from: string; to: string }

function getRange(period: Period, from: string, to: string): Range {
    const now = new Date()
    const end = now.toISOString()

    if (period === 'custom') {
        return {
            from: from ? new Date(from).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
            to: to ? new Date(to + 'T23:59:59').toISOString() : end,
        }
    }
    if (period === 'today') {
        const start = new Date(now); start.setHours(0, 0, 0, 0)
        return { from: start.toISOString(), to: end }
    }
    if (period === 'week') {
        const start = new Date(now); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0)
        return { from: start.toISOString(), to: end }
    }
    if (period === 'year') {
        return { from: new Date(now.getFullYear(), 0, 1).toISOString(), to: end }
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: end }
}

/** El mismo lapso, justo antes: sirve para comparar. */
function previousRange(range: Range): Range {
    const from = new Date(range.from).getTime()
    const to = new Date(range.to).getTime()
    const span = Math.max(to - from, 1)
    return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() }
}

/* ── Cálculo ────────────────────────────────────────────── */

interface SaleItemRow {
    product_id: string | null
    quantity: number
    unit_price: number
    unit_cost: number
    products: { name: string } | null
}
interface SaleRow { total: number; sale_items: SaleItemRow[] }

function totalsFrom(sales: SaleRow[], expenses: { amount: number }[], purchases: { total: number }[]): ReportTotals {
    let revenue = 0, cogs = 0, units = 0
    for (const sale of sales) {
        revenue += Number(sale.total) || 0
        for (const item of sale.sale_items ?? []) {
            units += Number(item.quantity) || 0
            cogs += (Number(item.unit_cost) || 0) * (Number(item.quantity) || 0)
        }
    }
    const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const grossProfit = revenue - cogs

    return {
        revenue: Math.round(revenue),
        cogs: Math.round(cogs),
        grossProfit: Math.round(grossProfit),
        expenses: Math.round(expenseTotal),
        netProfit: Math.round(grossProfit - expenseTotal),
        grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        salesCount: sales.length,
        unitsSold: units,
        avgTicket: sales.length > 0 ? Math.round(revenue / sales.length) : 0,
        inventoryPurchases: Math.round(purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0)),
    }
}

function productLines(sales: SaleRow[]): ProductLine[] {
    const map = new Map<string, Omit<ProductLine, 'margin'>>()
    for (const sale of sales) {
        for (const item of sale.sale_items ?? []) {
            if (!item.product_id) continue
            const quantity = Number(item.quantity) || 0
            const revenue = (Number(item.unit_price) || 0) * quantity
            const profit = revenue - (Number(item.unit_cost) || 0) * quantity
            const existing = map.get(item.product_id)
            if (existing) {
                existing.units += quantity
                existing.revenue += revenue
                existing.profit += profit
            } else {
                map.set(item.product_id, {
                    id: item.product_id,
                    name: item.products?.name ?? 'Producto',
                    units: quantity,
                    revenue,
                    profit,
                })
            }
        }
    }
    return [...map.values()].map(line => ({
        ...line,
        revenue: Math.round(line.revenue),
        profit: Math.round(line.profit),
        margin: line.revenue > 0 ? (line.profit / line.revenue) * 100 : 0,
    }))
}

const SALE_SELECT = 'total, sale_items(product_id, quantity, unit_price, unit_cost, products(name))'

/* ── Pantalla ───────────────────────────────────────────── */

export default function ReportesPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const [period, setPeriod] = useState<Period>('month')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')

    const range = useMemo(() => getRange(period, fromDate, toDate), [period, fromDate, toDate])

    const { data, isLoading } = useSWR<ReportData>(
        storeId ? ['reportes', storeId, range.from, range.to] : null,
        async () => {
            const prev = previousRange(range)
            const inRange = (query: any, column = 'created_at', r: Range = range) =>
                query.gte(column, r.from).lte(column, r.to)

            const [sales, prevSales, expenses, prevExpenses, purchases, prevPurchases, customers, providers, products] = await Promise.all([
                inRange(supabase.from('sales').select(SALE_SELECT).eq('store_id', storeId)),
                inRange(supabase.from('sales').select(SALE_SELECT).eq('store_id', storeId), 'created_at', prev),
                inRange(supabase.from('expenses').select('amount, category').eq('store_id', storeId)),
                inRange(supabase.from('expenses').select('amount').eq('store_id', storeId), 'created_at', prev),
                inRange(supabase.from('purchases').select('total').eq('store_id', storeId)),
                inRange(supabase.from('purchases').select('total').eq('store_id', storeId), 'created_at', prev),
                supabase.from('customers').select('id, name, total_debt').eq('store_id', storeId).gt('total_debt', 0).order('total_debt', { ascending: false }),
                supabase.from('providers').select('id, name, total_debt').eq('store_id', storeId).gt('total_debt', 0).order('total_debt', { ascending: false }),
                supabase.from('products').select('id, name, stock, cpp, low_stock_threshold').eq('store_id', storeId).eq('is_active', true),
            ])

            const currentSales = (sales.data ?? []) as unknown as SaleRow[]
            const lines = productLines(currentSales)
            const sold = new Set(lines.map(line => line.id))

            const expenseRows = (expenses.data ?? []) as { amount: number; category: string }[]
            const byCategory = new Map<string, number>()
            for (const expense of expenseRows) {
                const label = EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label ?? 'Otros'
                byCategory.set(label, (byCategory.get(label) ?? 0) + (Number(expense.amount) || 0))
            }

            const productRows = (products.data ?? []) as { id: string; name: string; stock: number; cpp: number; low_stock_threshold: number | null }[]
            const inventoryValue = productRows.reduce((sum, p) => sum + (Number(p.stock) || 0) * (Number(p.cpp) || 0), 0)

            return {
                current: totalsFrom(currentSales, expenseRows, (purchases.data ?? []) as { total: number }[]),
                previous: totalsFrom(
                    (prevSales.data ?? []) as unknown as SaleRow[],
                    (prevExpenses.data ?? []) as { amount: number }[],
                    (prevPurchases.data ?? []) as { total: number }[],
                ),
                expensesByCategory: [...byCategory.entries()]
                    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
                    .sort((a, b) => b.amount - a.amount),
                topProducts: [...lines].sort((a, b) => b.profit - a.profit).slice(0, 8),
                worstProducts: [...lines].filter(l => l.units > 0).sort((a, b) => a.margin - b.margin).slice(0, 5),
                receivables: {
                    total: Math.round((customers.data ?? []).reduce((sum, c) => sum + Number(c.total_debt), 0)),
                    top: (customers.data ?? []).slice(0, 3).map(c => ({ id: c.id, name: c.name, amount: Math.round(Number(c.total_debt)) })),
                },
                payables: {
                    total: Math.round((providers.data ?? []).reduce((sum, p) => sum + Number(p.total_debt), 0)),
                    top: (providers.data ?? []).slice(0, 3).map(p => ({ id: p.id, name: p.name, amount: Math.round(Number(p.total_debt)) })),
                },
                inventory: {
                    value: Math.round(inventoryValue),
                    units: productRows.reduce((sum, p) => sum + (Number(p.stock) || 0), 0),
                    lowStock: productRows.filter(p => Number(p.stock) > 0 && Number(p.stock) <= (p.low_stock_threshold ?? 5)).length,
                    stale: productRows
                        .filter(p => Number(p.stock) > 0 && !sold.has(p.id))
                        .map(p => ({ id: p.id, name: p.name, stock: Number(p.stock), value: Math.round(Number(p.stock) * (Number(p.cpp) || 0)) }))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 5),
                },
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
    )

    const periodLabel = PERIODS.find(p => p.value === period)?.label ?? 'Este mes'

    return (
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-3xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5" style={{ position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Inteligencia</p>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Reportes</h1>
            </motion.div>

            <div className="flex gap-1.5 flex-wrap mb-4">
                {PERIODS.map(p => {
                    const active = period === p.value
                    return (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                            style={{
                                padding: '9px 15px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {p.label}
                        </button>
                    )
                })}
            </div>

            {period === 'custom' && (
                <div className="toul-card mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label htmlFor="desde" className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                        <input id="desde" type="date" className="toul-input text-sm" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    </div>
                    <div className="flex-1">
                        <label htmlFor="hasta" className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                        <input id="hasta" type="date" className="toul-input text-sm" value={toDate} onChange={e => setToDate(e.target.value)} />
                    </div>
                </div>
            )}

            <ReportsView
                data={data ?? null}
                loading={isLoading && !data}
                period={period}
                periodLabel={periodLabel}
            />
        </div>
    )
}

export { EMPTY_TOTALS }
