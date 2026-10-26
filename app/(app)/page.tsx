'use client'
import { useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDateRange, getDaysDiff } from '@/lib/utils'
import { Settings, AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

// Components
import HeroChart from '@/components/dashboard/HeroChart'
import { InsightsRow } from '@/components/dashboard/InsightsRow'
import MobileDashboard from '@/components/dashboard/MobileDashboard'
import { PrimerosPasos } from '@/components/dashboard/PrimerosPasos'
import { SelectorPeriodo, textoRango, type Periodo, type Rango } from '@/components/dashboard/Desplegable'
import { Vendiste, GananciaGastos, type MetricasInicio, type Tendencia } from '@/components/dashboard/ResumenHoy'

// Hooks & Motion
import { useStore } from '@/lib/hooks/useData'
import { ENTRADA_INICIO_CSS, entrada, useEntradaInicio } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'

type Period = Periodo

/** Cada cuánto se recalculan las ideas de TOUL AI */
const IDEAS_VIGENCIA = 6 * 60 * 60 * 1000

export default function DashboardPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null
    const storeName = store?.name || ''

    const [period, setPeriod] = useState<Period>('today')
    const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)

    // ─── MAIN METRICS FETCHING ──────────────────────────────────────────────
    const { data: dashboardData, isLoading: metricsLoading, error: metricsError, mutate: retryMetrics } = useSWR(
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
            const [sales, expenses, products, purchases, sales7d, salesStreak, salesYesterday, customersDebt, providersPending, allPurchases] = await Promise.all([
                supabase.from('sales').select('total, created_at, is_credit, sale_items(unit_price, unit_cost, quantity, product_id, products(name, image_url))').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('expenses').select('amount, category, created_at').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('products').select('*').eq('store_id', storeId).eq('is_active', true),
                supabase.from('purchases').select('total, created_at, provider_id, due_date').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                // Mejora 1: 7-day average
                supabase.from('sales').select('total, created_at').eq('store_id', storeId).gte('created_at', sevenDaysAgo.toISOString()),
                // Mejora 1: Streak — all unique sale dates (last 60 days max)
                supabase.from('sales').select('created_at').eq('store_id', storeId).gte('created_at', new Date(todayStart.getTime() - 60 * 86400000).toISOString()).order('created_at', { ascending: false }),
                // Mejora 1: Yesterday's total
                supabase.from('sales').select('total').eq('store_id', storeId).gte('created_at', yesterdayStart.toISOString()).lt('created_at', todayStart.toISOString()),
                // Lo que te deben sale de los movimientos, igual que en
                // Cuentas por cobrar: un solo número en toda la app
                supabase.rpc('toul_receivables'),
                // Mejora 2: Providers with credit purchases pending
                supabase.from('providers').select('id, name, phone, total_debt').eq('store_id', storeId).gt('total_debt', 0).order('total_debt', { ascending: false }),
                // Desde cuándo le debes a cada proveedor
                supabase.from('purchases').select('provider_id, created_at').eq('store_id', storeId).not('provider_id', 'is', null).order('created_at', { ascending: true })
            ])

            // Fetch previous data for variations
            const [prevSales, prevExpenses, returns, prevReturns, returns7d] = await Promise.all([
                supabase.from('sales').select('total, sale_items(unit_price, unit_cost, quantity)').eq('store_id', storeId).gte('created_at', prevRange.from || '2000-01-01').lte('created_at', prevRange.to || '2000-01-01'),
                supabase.from('expenses').select('amount').eq('store_id', storeId).gte('created_at', prevRange.from || '2000-01-01').lte('created_at', prevRange.to || '2000-01-01'),
                // Lo devuelto resta el día en que se devuelve. Antes de activar
                // las devoluciones la tabla no existe y no llega nada
                supabase.from('sale_returns').select('total, cost_total, sale_return_items(quantity, unit_price, unit_cost, sale_items(product_id))').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('sale_returns').select('total, cost_total').eq('store_id', storeId).gte('created_at', prevRange.from || '2000-01-01').lte('created_at', prevRange.to || '2000-01-01'),
                // Para "ayer" y el promedio de 7 días de la gráfica
                supabase.from('sale_returns').select('total, created_at').eq('store_id', storeId).gte('created_at', sevenDaysAgo.toISOString()),
            ])
            const devuelto = (rows: { total: number; cost_total: number }[] | null) => ({
                total: (rows || []).reduce((s, d) => s + Number(d.total), 0),
                cost: (rows || []).reduce((s, d) => s + Number(d.cost_total), 0),
            })
            const returned = devuelto(returns.data)
            const prevReturned = devuelto(prevReturns.data)

            // 1. CALCULATE TOP ROW METRICS
            const currentRevenue = Math.round((sales.data || []).reduce((s, r) => s + r.total, 0) - returned.total)
            const currentExpenses = Math.round((expenses.data || []).reduce((s, e) => s + e.amount, 0))
            const salesCount = (sales.data || []).length
            const avgTicket = salesCount > 0 ? Math.round(currentRevenue / salesCount) : 0

            let currentCost = 0
            const productUnitsMap: Record<string, { name: string; image_url: string | null; units: number; profit: number; revenue: number; stock: number; last_sale: string }> = {}

            for (const s of (sales.data || [])) {
                for (const item of (s.sale_items as any || [])) {
                    currentCost += Math.round((item.unit_cost || 0) * item.quantity)
                    const profitVal = Math.round((item.unit_price - (item.unit_cost || 0)) * item.quantity)

                    // Los combos no tienen ficha de producto (se guardan sin product_id):
                    // cuentan en los totales, no en las listas de productos
                    const pid = item.product_id
                    if (!pid) continue
                    if (!productUnitsMap[pid]) {
                        productUnitsMap[pid] = {
                            name: item.products?.name || 'Producto',
                            image_url: item.products?.image_url || null,
                            units: 0,
                            profit: 0,
                            revenue: 0,
                            stock: 0,
                            last_sale: s.created_at
                        }
                    }
                    productUnitsMap[pid].units += item.quantity
                    productUnitsMap[pid].profit += profitVal
                    productUnitsMap[pid].revenue += Math.round(item.unit_price * item.quantity)
                }
            }

            currentCost = Math.round(currentCost - returned.cost)

            // Lo devuelto en el periodo también baja las unidades de cada producto
            type ItemDevuelto = { quantity: number; unit_price: number; unit_cost: number; sale_items: { product_id: string | null } | null }
            const itemsDevueltos = ((returns.data || []) as unknown as { sale_return_items?: ItemDevuelto[] }[]).flatMap(r => r.sale_return_items ?? [])
            for (const item of itemsDevueltos) {
                const pid = item.sale_items?.product_id
                const producto = pid ? productUnitsMap[pid] : undefined
                if (!producto) continue
                producto.units -= Number(item.quantity)
                producto.profit -= Math.round((Number(item.unit_price) - Number(item.unit_cost)) * Number(item.quantity))
                producto.revenue -= Math.round(Number(item.unit_price) * Number(item.quantity))
            }

            const currentNetProfit = Math.round(currentRevenue - currentCost - currentExpenses)
            const currentGrossProfit = Math.round(currentRevenue - currentCost)

            // Unidades que salieron del inventario en el periodo
            const unitsSold = (sales.data || []).reduce(
                (sum, sale) => sum + ((sale.sale_items as any[]) || []).reduce((n, item) => n + Number(item.quantity), 0), 0)
                - itemsDevueltos.reduce((n, item) => n + Number(item.quantity), 0)

            // Lo fiado: una venta es una venta, pero esa plata todavía no entró
            const creditAmount = Math.round((sales.data || [])
                .filter(sale => (sale as any).is_credit)
                .reduce((sum, sale) => sum + sale.total, 0))

            // Qué categoría se llevó la mayoría de los gastos
            const byCategory: Record<string, number> = {}
            for (const expense of (expenses.data || [])) {
                const key = (expense as any).category || 'otros'
                byCategory[key] = (byCategory[key] || 0) + Number(expense.amount)
            }
            const topExpense = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
            const expensesTopCategory = topExpense ? topExpense[0] : null

            // Previous periods for variation
            const pRev = Math.round((prevSales.data || []).reduce((s, r) => s + r.total, 0) - prevReturned.total)
            const pExp = Math.round((prevExpenses.data || []).reduce((s, e) => s + e.amount, 0))
            const pSalesCount = (prevSales.data || []).length

            let pCost = 0
            for (const s of (prevSales.data || [])) {
                for (const item of (s.sale_items as any || [])) {
                    pCost += Math.round((item.unit_cost || 0) * item.quantity)
                }
            }
            pCost = Math.round(pCost - prevReturned.cost)
            const pNetProfit = Math.round(pRev - pCost - pExp)
            const pGrossProfit = Math.round(pRev - pCost)

            // 2. OPERATIONAL DATA: PRODUCTS
            // Hasta 10 por lista: el celular los muestra en una fila que se
            // desliza; el computador, los 3 primeros.
            // Lo que se devolvió completo ya no cuenta como vendido
            const vendidos = Object.entries(productUnitsMap).filter(([, p]) => p.units > 0)
            const sortedByUnits = vendidos
                .map(([id, p]) => ({ id, name: p.name, image_url: p.image_url, value: p.units }))
                .sort((a, b) => b.value - a.value).slice(0, 10)
            // Más rentables: el % que le queda de cada venta. Si dos empatan,
            // primero el que dejó más plata
            const sortedByProfit = vendidos
                .filter(([, p]) => p.revenue > 0)
                .map(([id, p]) => ({ id, name: p.name, image_url: p.image_url, value: Math.round((p.profit / p.revenue) * 100) }))
                .sort((a, b) => b.value - a.value || productUnitsMap[b.id].profit - productUnitsMap[a.id].profit).slice(0, 10)
            const lowStock = (products.data || []).filter(p => p.stock <= (p.low_stock_threshold || 5)).map(p => ({ id: p.id, name: p.name, image_url: p.image_url, value: p.stock })).sort((a, b) => a.value - b.value).slice(0, 10)

            // "Sin mover" sale de la base: días desde la última venta de
            // verdad. Antes se contaba desde que se creó la ficha y
            // entraba todo lo que no se hubiera vendido en el periodo
            // que estuvieras mirando — por eso decía 160 días.
            const { data: pulse } = await supabase.rpc('toul_inventory_overview', { p_limit: 30 })
            const dormant = (pulse?.dormant ?? []) as {
                id: string; kind: string; product_id: string; product_name: string
                variant_name: string | null; image_url: string | null
                stock: number; idle_days: number; never_sold: boolean
            }[]
            const slowMoving = dormant.slice(0, 10).map(row => ({
                id: row.kind === 'presentacion' ? row.product_id : row.id,
                name: row.variant_name ? `${row.product_name} · ${row.variant_name}` : row.product_name,
                image_url: row.image_url,
                value: row.idle_days,
            }))

            // ── Mejora 1: Compute 7-day average ────────────────────────────
            const dayTotals7d: Record<string, number> = {}
            for (const s of (sales7d.data || [])) {
                const d = new Date(s.created_at).toISOString().slice(0, 10)
                dayTotals7d[d] = (dayTotals7d[d] || 0) + s.total
            }
            // Cada devolución resta el día en que se hizo, igual que en la gráfica
            for (const r of (returns7d.data || [])) {
                const d = new Date(r.created_at).toISOString().slice(0, 10)
                dayTotals7d[d] = (dayTotals7d[d] || 0) - Number(r.total)
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
            const devueltoAyer = (returns7d.data || [])
                .filter(r => { const t = new Date(r.created_at).getTime(); return t >= yesterdayStart.getTime() && t < todayStart.getTime() })
                .reduce((s, r) => s + Number(r.total), 0)
            const yesterdayTotal = Math.round((salesYesterday.data || []).reduce((s, r) => s + r.total, 0) - devueltoAyer)

            // ── Plata pendiente ──────────────────────────────────────────────
            // Hace cuánto quedó debiendo cada uno: la fiada o la compra más
            // vieja. Antes se mostraba la fecha en que se creó el cliente,
            // que no tiene nada que ver con la deuda.
            const daysSince = (iso: string | null) =>
                iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null

            const firstPurchase = new Map<string, string>()
            for (const row of (allPurchases.data || [])) {
                if (row.provider_id && !firstPurchase.has(row.provider_id)) firstPurchase.set(row.provider_id, row.created_at)
            }

            type FilaCartera = { id: string; nombre: string; telefono: string | null; saldo: number; diasFiado: number | null }
            const cartera = (customersDebt.data as { clientes?: FilaCartera[] } | null)?.clientes ?? []
            const customerDebts = cartera.map(c => ({
                id: c.id,
                name: c.nombre,
                amount: Math.round(Number(c.saldo)),
                phone: c.telefono ?? null,
                // Hace cuánto está abierto el fiado más viejo que sigue sin pagar
                days: c.diasFiado ?? null,
            }))

            const providerDebts = (providersPending.data || []).map(p => ({
                id: p.id,
                name: p.name,
                amount: Math.round(p.total_debt),
                phone: p.phone ?? null,
                days: daysSince(firstPurchase.get(p.id) ?? null),
            }))

            return {
                metrics: {
                    revenue: currentRevenue,
                    expenses: currentExpenses,
                    netProfit: currentNetProfit,
                    grossProfit: currentGrossProfit,
                    cost: currentCost,
                    salesCount,
                    unitsSold,
                    creditAmount,
                    expensesTopCategory,
                    avgTicket,
                    prevRevenue: pRev,
                    prevExpenses: pExp,
                    prevNetProfit: pNetProfit,
                    prevGrossProfit: pGrossProfit,
                    prevSalesCount: pSalesCount
                },
                operational: {
                    products: { topUnits: sortedByUnits, topProfit: sortedByProfit, lowStock, slowMoving }
                },
                chart: { avg7d, streak, yesterdayTotal },
                pending: {
                    customerDebts, providerDebts,
                    customerCount: customerDebts.length,
                    providerCount: providerDebts.length,
                }
            }
        },
        // Al cambiar de periodo se siguen viendo los datos anteriores mientras
        // llegan los nuevos: la plata pendiente no depende del periodo y no
        // tiene por qué desaparecer y volver a contar
        { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
    )

    // Las ideas de TOUL AI tardan unos 8 segundos y cada cálculo cuesta.
    // Se guardan en el equipo y se recalculan máximo cada 6 horas: al abrir
    // la app salen al instante. Empiezan por "toul": si entra otra cuenta,
    // se borran con todo lo demás.
    const { data: insights, isLoading: insightsLoading } = useSWR(
        storeId ? ['insights', storeId] : null,
        async () => {
            // v2: las guardadas antes traían el botón elegido por palabras sueltas
            const llave = `toul-ideas-v2:${storeId}`
            let guardadas: { at: number; insights: AIInsight[] } | null = null
            try { guardadas = JSON.parse(localStorage.getItem(llave) || 'null') } catch { /* sin almacenamiento */ }
            if (guardadas && Date.now() - guardadas.at < IDEAS_VIGENCIA) return guardadas.insights
            try {
                const r = await fetch('/api/ai-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
                const d = await r.json()
                const nuevas = (d.insights ?? []) as AIInsight[]
                try { localStorage.setItem(llave, JSON.stringify({ at: Date.now(), insights: nuevas })) } catch { /* sin espacio */ }
                return nuevas
            } catch (error) {
                // Sin señal: mejor las ideas de antes que nada
                if (guardadas) return guardadas.insights
                throw error
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 300000 }
    )

    const loading = metricsLoading || storeLoading
    // Solo la primera vez no hay nada que mostrar (ver keepPreviousData arriba)
    const primeraCarga = !dashboardData

    // Saludo según la hora. Sin fecha: el Inicio dice lo que importa hoy
    const greeting = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Buenos días'
        if (hour < 19) return 'Buenas tardes'
        return 'Buenas noches'
    }, [])

    // La entrada completa (cascada, línea que se dibuja, montos que cuentan)
    // pasa la primera vez que se abre la app. Al cambiar de periodo, la
    // gráfica se vuelve a dibujar y los montos vuelven a contar.
    const animar = useEntradaInicio()
    const [periodoTocado, setPeriodoTocado] = useState(false)
    const cambiarPeriodo = useCallback((p: Periodo) => { setPeriod(p); setPeriodoTocado(true) }, [])
    const cambiarRango = useCallback((r: Rango) => { setCustomRange(r); setPeriodoTocado(true) }, [])
    const dibujar = animar || periodoTocado
    const conteo = useMemo(() => ({
        cuenta: animar || periodoTocado,
        clave: `${period}|${customRange?.from ?? ''}|${customRange?.to ?? ''}`,
    }), [animar, periodoTocado, period, customRange])

    const metrics: MetricasInicio = {
        revenue: dashboardData?.metrics.revenue || 0,
        grossProfit: dashboardData?.metrics.grossProfit || 0,
        expenses: dashboardData?.metrics.expenses || 0,
        salesCount: dashboardData?.metrics.salesCount || 0,
    }
    // Cómo va contra el mismo tramo del periodo anterior. Sin ventas antes,
    // no hay con qué comparar
    const tendencia: Tendencia = useMemo(() => {
        const rango = period === 'custom' && customRange ? customRange : getDateRange(period)
        const antes = dashboardData?.metrics.prevRevenue ?? 0
        const ahora = dashboardData?.metrics.revenue ?? 0
        return {
            porcentaje: antes > 0 ? Math.round(((ahora - antes) / antes) * 100) : null,
            contra: contraQue(period, rango),
        }
    }, [dashboardData, period, customRange])
    const products = dashboardData?.operational.products || { topUnits: [], topProfit: [], lowStock: [], slowMoving: [] }
    const pending = dashboardData?.pending || { customerDebts: [], providerDebts: [] }

    return (
        <>
            {/* ── Cuando la carga falla ─────────────────────────────────────
                Antes la pantalla caía a cero y decía que no habías vendido
                nada. Un número falso es peor que un error: con esto el
                usuario sabe que lo que ve no es su negocio. */}
            {metricsError && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    margin: '16px 16px 0', padding: '14px 16px', borderRadius: 16,
                    background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)',
                }}>
                    <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            No se pudieron cargar tus números
                        </p>
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 10px', lineHeight: 1.5 }}>
                            Lo que ves abajo no es tu negocio. Revisa tu conexión y vuelve a intentar.
                        </p>
                        <button onClick={() => retryMetrics()}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px',
                                borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                                background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--toul-text-muted)',
                            }}>
                            <RefreshCw size={13} /> Volver a intentar
                        </button>
                    </div>
                </div>
            )}

            {/* ── CELULAR ───────────────────────────────────────────────────── */}
            <div className="lg:hidden">
                {/* Desaparece solo apenas hace su primera venta */}
                <div style={{ padding: '18px 16px 0' }}>
                    <PrimerosPasos storeId={storeId} />
                </div>
                <MobileDashboard
                    storeName={storeName}
                    saludo={greeting}
                    storeId={storeId}
                    period={period}
                    setPeriod={cambiarPeriodo}
                    rango={customRange}
                    setRango={cambiarRango}
                    metrics={metrics}
                    products={products}
                    pending={pending}
                    insight={insights?.[0] || null}
                    loading={loading}
                    primeraCarga={primeraCarga}
                    insightsLoading={insightsLoading || false}
                    animar={animar}
                    dibujar={dibujar}
                    conteo={conteo}
                    tendencia={tendencia}
                />
            </div>

            {/* ── COMPUTADOR ────────────────────────────────────────────────
                Arriba el encabezado: la gráfica a la izquierda y lo vendido a
                la derecha. Abajo, tres columnas sin cajas. */}
            <div className="hidden lg:block in-pc">
                <style>{PC_CSS}</style>
                <div className="in-pc-contenido">
                    <PrimerosPasos storeId={storeId} />

                    {/* Arriba el saludo en una línea. Debajo, la gráfica a la izquierda
                        y el resumen a la derecha */}
                    <header className="in-pc-cabeza">
                        <div {...entrada(0, animar, 'in-pc-arriba')}>
                            <h1 className="in-pc-saludo" suppressHydrationWarning>{greeting}, {storeName || 'Mi negocio'}</h1>
                            <Link href="/settings" className="in-pc-ajustes" aria-label="Ajustes">
                                <Settings size={20} strokeWidth={1.9} />
                            </Link>
                        </div>
                        <div className="in-pc-cuerpo">
                            <div {...entrada(1, animar, 'in-pc-grafica')}>
                                <HeroChart storeId={storeId} period={period} rango={customRange} alto="100%" dibujar={dibujar} />
                            </div>
                            <div className="in-pc-resumen">
                                <div {...entrada(2, animar)}>
                                    <Vendiste metrics={metrics} loading={loading} period={period} variante="pc" conteo={conteo}
                                        tendencia={tendencia}
                                        selector={<SelectorPeriodo variante="pc" forma="pildora" period={period} setPeriod={cambiarPeriodo}
                                            rango={customRange} setRango={cambiarRango} />} />
                                </div>
                                <div {...entrada(3, animar, undefined, { marginTop: 20 })}>
                                    <GananciaGastos metrics={metrics} loading={loading} conteo={conteo} />
                                </div>
                            </div>
                        </div>
                    </header>

                    {/* Llega hasta el final de la pantalla */}
                    <div className="in-pc-abajo">
                        <InsightsRow
                            products={products}
                            pending={pending}
                            insight={insights?.[0] || null}
                            storeName={storeName}
                            loading={loading}
                            primeraCarga={primeraCarga}
                            insightsLoading={!!insightsLoading}
                            animar={animar}
                            turno={4}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}

/* Lo del computador que no cabe en clases de Tailwind: la luz verde de
   arriba a la izquierda, la gráfica que llega hasta el borde derecho y
   la pantalla que se llena de arriba abajo */
const PC_CSS = ENTRADA_INICIO_CSS + `
/* Las medidas que comparten el encabezado y la fila de abajo. La fila
   mide lo que miden tus productos (título, píldora, foto y nombre); la
   gráfica toma todo lo que sobra, para que la pantalla quede llena sin
   franja vacía y sin desplazamiento de sobra */
.in-pc {
    position: relative;
    --in-pc-foto: clamp(150px, 24vh, 260px);
    --in-pc-fila: calc(134px + var(--in-pc-foto));
    --in-pc-hueco: clamp(24px, 3.5vh, 40px);
}
/* Sin z-index ni isolation, como en el celular: los menús y las hojas
   tienen que poder quedar por encima de todo. Los 2rem son el margen de
   abajo que ya pone la app. En pantallas muy anchas no pasa de 1680 px */
.in-pc-contenido { position: relative; width: 100%; max-width: 1680px; margin: 0 auto;
    min-height: calc(100dvh - 2rem); display: flex; flex-direction: column; padding: 24px 24px 16px; }

.in-pc-arriba { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 40px; }
.in-pc-saludo { min-width: 0; font-size: 14px; font-weight: 400; letter-spacing: -0.01em; color: var(--toul-text-subtle); margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.in-pc-ajustes { flex-shrink: 0; width: 40px; height: 40px; margin-right: -8px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; color: var(--toul-text-subtle);
    transition: color 160ms var(--toul-ease-emil), background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.in-pc-ajustes:active { transform: scale(0.94); }

/* La gráfica ocupa cerca del 60% desde el borde izquierdo; el resumen,
   el resto. Abajo quedan alineados */
.in-pc-cuerpo { display: grid; grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr); column-gap: clamp(32px, 4vw, 64px);
    align-items: end; margin-top: 6px; }
/* Alto: la ventana menos todo lo demás (márgenes, saludo y la fila de abajo) */
.in-pc-grafica { min-width: 0;
    height: clamp(240px, calc(100dvh - 2rem - 24px - 16px - 40px - 6px - var(--in-pc-hueco) - var(--in-pc-fila)), 560px); }
.in-pc-resumen { min-width: 0; }
.in-pc-abajo { flex: none; margin-top: var(--in-pc-hueco); }
@media (hover: hover) and (pointer: fine) {
    .in-pc-ajustes:hover { color: var(--toul-text); background: var(--toul-surface); }
}
@media (min-width: 1280px) {
    .in-pc-contenido { padding-left: 32px; padding-right: 32px; }
}
`

/** El mismo tramo del periodo anterior, para que la comparación sea justa:
 *  hoy contra ayer hasta esta hora, la semana contra la semana pasada hasta
 *  este mismo día, el mes contra el mes pasado hasta este mismo día, y unas
 *  fechas elegidas contra los mismos días justo antes. */
function getPrevRange(period: Period, current: { from: string | null; to: string | null }) {
    if (!current.from || !current.to) return { from: null, to: null }

    const start = new Date(current.from)
    const end = new Date(current.to)
    const atras = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() - dias); return x }

    if (period === 'today') return { from: atras(start, 1).toISOString(), to: atras(end, 1).toISOString() }
    if (period === 'week') return { from: atras(start, 7).toISOString(), to: atras(end, 7).toISOString() }
    if (period === 'month') {
        const desde = new Date(start.getFullYear(), start.getMonth() - 1, 1)
        // El mismo día del mes pasado; si no existe, el último (31 de marzo → 28 de febrero)
        const ultimoDia = new Date(end.getFullYear(), end.getMonth(), 0).getDate()
        const hasta = new Date(end)
        hasta.setDate(1)
        hasta.setMonth(hasta.getMonth() - 1)
        hasta.setDate(Math.min(end.getDate(), ultimoDia))
        return { from: desde.toISOString(), to: hasta.toISOString() }
    }

    const diff = end.getTime() - start.getTime()
    return {
        from: new Date(start.getTime() - diff).toISOString(),
        to: current.from
    }
}

/** Contra qué se compara la tendencia: "vs ayer", "vs semana pasada", "vs 1 – 26 sep" */
function contraQue(period: Period, current: { from: string | null; to: string | null }) {
    if (period === 'today') return 'vs ayer'
    if (period === 'week') return 'vs semana pasada'
    const prev = getPrevRange(period, current)
    if (!prev.from || !prev.to) return ''
    // Unas fechas elegidas terminan justo donde empiezan las de ahora
    const hasta = period === 'custom' ? new Date(new Date(prev.to).getTime() - 1) : new Date(prev.to)
    return `vs ${textoRango(new Date(prev.from), hasta)}`
}
