import { SupabaseClient } from '@supabase/supabase-js'
import { enColombia } from '@/lib/periodos'
import { resumir } from '@/lib/reports/calculos'
import { REPORTE_VACIO, type ReporteSQL } from '@/lib/reports/types'
import { capitalizeFirst } from '@/lib/format/text'
import { nombreCategoria } from '@/lib/types'

// ─── Business Snapshot Builder ──────────────────────────────────────────────
// Pre-fetches ALL business data and builds a structured context string
// for the AI model. No tools needed — the model gets everything upfront.
// ─────────────────────────────────────────────────────────────────────────────

export async function buildBusinessSnapshot(supabase: SupabaseClient, storeId: string): Promise<string> {
    const now = new Date()
    const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

    // ── Parallel Queries (8 queries) ────────────────────────────────────────
    const [
        { data: products },
        { data: sales7d },
        { data: sales14d },
        { data: sales30d },
        { data: sales90d },
        { data: saleItems30d },
        { data: cartera },
        { data: inventario },
        { data: rep7 },
        { data: rep14 },
        { data: rep30 },
        { data: rep90 },
        { data: repAntes },
    ] = await Promise.all([
        supabase.from('products').select('id, name, stock, sale_price, cost_price, cpp, low_stock_threshold, is_active, created_at').eq('store_id', storeId).eq('is_active', true),
        supabase.from('sales').select('id, total, created_at, payment_method, is_credit').eq('store_id', storeId).gte('created_at', daysAgo(7)),
        supabase.from('sales').select('id, total, created_at, payment_method, is_credit').eq('store_id', storeId).gte('created_at', daysAgo(14)),
        supabase.from('sales').select('id, total, created_at, payment_method, is_credit').eq('store_id', storeId).gte('created_at', daysAgo(30)),
        supabase.from('sales').select('id, total, created_at, payment_method, is_credit').eq('store_id', storeId).gte('created_at', daysAgo(90)),
        supabase.from('sale_items').select('product_id, quantity, unit_price, unit_cost, sales!inner(created_at, store_id)').eq('sales.store_id', storeId).gte('sales.created_at', daysAgo(30)),
        // Lo que te deben sale de los movimientos, igual que en Cuentas por cobrar
        supabase.rpc('toul_receivables'),
        // El valor del inventario cuenta cada presentación, igual que en Inventario
        supabase.rpc('toul_inventory_overview', { p_limit: 1 }),
        // Ventas, ganancia, gastos, plata que entró y salió, métodos y
        // productos: la misma función de Reportes, en cada ventana
        supabase.rpc('toul_reporte', { p_desde: daysAgo(7), p_hasta: now.toISOString() }),
        supabase.rpc('toul_reporte', { p_desde: daysAgo(14), p_hasta: now.toISOString() }),
        supabase.rpc('toul_reporte', { p_desde: daysAgo(30), p_hasta: now.toISOString() }),
        supabase.rpc('toul_reporte', { p_desde: daysAgo(90), p_hasta: now.toISOString() }),
        supabase.rpc('toul_reporte', { p_desde: daysAgo(60), p_hasta: daysAgo(30) }),
    ])

    // ── Compute Derived Metrics ─────────────────────────────────────────────
    const prods = products || []
    const s7 = sales7d || []
    const s14 = sales14d || []
    const s30 = sales30d || []
    const s90 = sales90d || []
    const items = saleItems30d || []
    const r = (x: unknown) => resumir((x ?? REPORTE_VACIO) as ReporteSQL)
    const r7 = r(rep7), r14 = r(rep14), r30 = r(rep30), r90 = r(rep90), rPrev = r(repAntes)
    const reporte30 = (rep30 ?? REPORTE_VACIO) as ReporteSQL
    const debts = ((cartera as { clientes?: { nombre: string; saldo: number }[] } | null)?.clientes ?? [])
        .map(c => ({ name: c.nombre, total_debt: Number(c.saldo) }))
        .sort((a, b) => b.total_debt - a.total_debt)

    // Vendiste por periodo: ya sin devoluciones, igual que en Reportes
    const rev7 = r7.vendiste
    const rev14 = r14.vendiste
    const rev30 = r30.vendiste
    const rev90 = r90.vendiste
    const revPrev30 = rPrev.vendiste

    // Growth
    const growthVsPrev = revPrev30 > 0 ? ((rev30 - revPrev30) / revPrev30 * 100) : null
    const dailyAvg7 = rev7 / 7
    const dailyAvg30 = rev30 / 30
    const dailyAvg90 = rev90 / 90

    // Tickets
    const salesCount30 = r30.cantidad
    const avgTicket = r30.ticket ?? 0

    // Lo que quedó fiado (la parte a crédito de las ventas)
    const creditSales30 = s30.filter(s => s.is_credit)
    const creditRevenue30 = r30.credito

    // Product analytics
    type ProdMetric = { name: string; revenue: number; units: number; cost: number; stock: number; cpp: number; salePrice: number }
    const prodMap: Record<string, ProdMetric> = {}
    for (const p of prods) {
        prodMap[p.id] = { name: p.name, revenue: 0, units: 0, cost: 0, stock: p.stock, cpp: p.cpp, salePrice: p.sale_price }
    }
    for (const item of items) {
        if (prodMap[item.product_id]) {
            prodMap[item.product_id].revenue += item.unit_price * item.quantity
            prodMap[item.product_id].units += item.quantity
            prodMap[item.product_id].cost += item.unit_cost * item.quantity
        }
    }

    const prodList = Object.entries(prodMap).map(([id, p]) => ({
        id, ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
        trappedCapital: p.stock * p.cpp,
    })).sort((a, b) => b.revenue - a.revenue)

    const totalRevenue = rev30
    const grossProfit = r30.gananciaVentas
    const grossMargin = r30.margen ?? 0

    // Inventory
    const inventoryValue = Number((inventario as { value?: number } | null)?.value ?? 0)
    const outOfStock = prods.filter(p => p.stock === 0)
    const lowStock = prods.filter(p => p.stock > 0 && p.stock <= (p.low_stock_threshold || 5))
    const noRotation = prodList.filter(p => p.units === 0 && p.stock > 0)
    const trappedCapitalTotal = noRotation.reduce((s, p) => s + p.trappedCapital, 0)

    // Gastos, como en Reportes
    const totalExpenses = r30.gastos
    const topExpCats = reporte30.gastosPorCategoria.slice(0, 3).map(g => [nombreCategoria(g.categoria), Number(g.monto)] as [string, number])

    // Plata que entró y salió, como en "Tu plata" de Reportes. Antes se
    // buscaba un tipo de movimiento que no existe y siempre daba $0
    const cashIn = r30.entro
    const cashOut = r30.salio
    const netCashFlow = cashIn - cashOut

    // Cómo te pagan, como en Reportes
    const topMethods = reporte30.metodos.slice(0, 3).map(m => [capitalizeFirst(m.nombre), Number(m.monto)] as [string, number])

    // Debts
    const totalDebt = debts.reduce((s, c) => s + c.total_debt, 0)
    const topDebtors = debts.slice(0, 5)

    // Abonos que te hicieron
    const abonos = r30.abonos

    // Sales by day of week
    const dayMap: Record<number, number> = {}
    // El día de la semana en Colombia: el servidor está en UTC
    for (const s of s30) { const d = enColombia(s.created_at).semana; dayMap[d] = (dayMap[d] || 0) + s.total }
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const bestDayEntry = Object.entries(dayMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    const bestDay = bestDayEntry ? dayNames[Number(bestDayEntry[0])] : 'sin datos'

    // Sales by hour
    const hourMap: Record<number, number> = {}
    // La hora en Colombia: el servidor está en UTC
    for (const s of s30) { const h = enColombia(s.created_at).hora; hourMap[h] = (hourMap[h] || 0) + 1 }
    const bestHourEntry = Object.entries(hourMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    const bestHour = bestHourEntry ? `${Number(bestHourEntry[0])}:00` : 'sin datos'

    // Top products: lo que vendió y dejó cada uno sale de Reportes (ya sin
    // devoluciones y con los descuentos repartidos); el stock, del catálogo
    const delReporte = reporte30.productos.map(p => ({
        id: p.id, name: p.nombre,
        revenue: Number(p.ventas), profit: Number(p.ganancia), margin: Number(p.margen),
        units: prodMap[p.id]?.units ?? 0, stock: prodMap[p.id]?.stock ?? 0,
    }))
    const top5Revenue = [...delReporte].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    const top5Margin = [...delReporte].filter(p => p.revenue > 0).sort((a, b) => b.margin - a.margin).slice(0, 5)
    const starProduct = top5Revenue[0]
    const starDependency = starProduct && totalRevenue > 0 ? (starProduct.revenue / totalRevenue * 100) : 0

    // ── Interpreted Signals ─────────────────────────────────────────────────
    const signals: string[] = []

    // Liquidity
    if (netCashFlow < 0) signals.push('⚠️ LIQUIDEZ TENSIONADA: El flujo de caja neto es negativo. Los gastos superan los ingresos de caja en el último mes.')
    else if (netCashFlow < totalRevenue * 0.1) signals.push('🟡 LIQUIDEZ AJUSTADA: El flujo neto es positivo pero muy bajo respecto a la facturación.')

    // Product dependency
    if (starDependency > 60) signals.push(`⚠️ DEPENDENCIA ALTA: El ${starDependency.toFixed(0)}% de la facturación depende de un solo producto (${starProduct?.name}). Alto riesgo si deja de rotar.`)
    else if (starDependency > 40) signals.push(`🟡 CONCENTRACIÓN MODERADA: ${starProduct?.name} representa el ${starDependency.toFixed(0)}% de las ventas.`)

    // Trapped inventory
    if (trappedCapitalTotal > inventoryValue * 0.3) signals.push(`⚠️ INVENTARIO INMOVILIZADO: $${fmt(trappedCapitalTotal)} en productos sin ventas en 30 días (${noRotation.length} productos). Capital atrapado.`)
    else if (noRotation.length > 3) signals.push(`🟡 ROTACIÓN LENTA: ${noRotation.length} productos no se han vendido en 30 días.`)

    // Growth
    if (growthVsPrev !== null) {
        if (growthVsPrev > 20) signals.push(`🟢 CRECIMIENTO ACELERADO: Facturación creció ${growthVsPrev.toFixed(1)}% vs período anterior.`)
        else if (growthVsPrev > 5) signals.push(`🟢 CRECIMIENTO MODERADO: Facturación creció ${growthVsPrev.toFixed(1)}% vs período anterior.`)
        else if (growthVsPrev > -5) signals.push(`🟡 ESTANCAMIENTO: Facturación prácticamente igual al período anterior (${growthVsPrev.toFixed(1)}%).`)
        else signals.push(`🔴 CAÍDA EN VENTAS: Facturación cayó ${Math.abs(growthVsPrev).toFixed(1)}% vs período anterior.`)
    }

    // Margin pressure
    if (grossMargin < 20 && totalRevenue > 0) signals.push('🔴 MARGEN CRÍTICO: El margen bruto está por debajo del 20%. La operación puede no ser rentable después de gastos.')
    else if (grossMargin < 30 && totalRevenue > 0) signals.push('⚠️ PRESIÓN DE MARGEN: El margen bruto está por debajo del 30%.')

    // Debt exposure
    if (totalDebt > rev30 * 0.5 && totalDebt > 0) signals.push(`⚠️ EXPOSICIÓN A DEUDAS: Las cuentas por cobrar ($${fmt(totalDebt)}) representan más del 50% de la facturación mensual.`)

    // Out of stock on top products
    const topOutOfStock = top5Revenue.filter(p => p.stock === 0)
    if (topOutOfStock.length > 0) signals.push(`🔴 QUIEBRE DE STOCK: ${topOutOfStock.map(p => p.name).join(', ')} — productos estrella sin inventario.`)

    // Credit sales exposure
    if (creditRevenue30 > rev30 * 0.4 && creditRevenue30 > 0) signals.push(`⚠️ ALTO FIADO: ${(creditRevenue30 / rev30 * 100).toFixed(0)}% de las ventas son a crédito. Riesgo de no cobro.`)

    // ── Executive Summary ───────────────────────────────────────────────────
    const phase = detectPhase(prods.length, salesCount30, rev30, growthVsPrev)
    const health = detectHealth(grossMargin, netCashFlow, growthVsPrev, signals)
    const mainRisk = detectMainRisk(signals)
    const mainOpportunity = detectOpportunity(growthVsPrev, top5Margin, noRotation, totalDebt, abonos)
    const priority = detectPriority(signals, netCashFlow, outOfStock, topOutOfStock)

    // ── Build Output ────────────────────────────────────────────────────────
    return `
═══════════════════════════════════════════════════
RESUMEN EJECUTIVO
═══════════════════════════════════════════════════
• Fase del negocio: ${phase}
• Salud financiera: ${health}
• Principal riesgo: ${mainRisk}
• Principal oportunidad: ${mainOpportunity}
• Prioridad sugerida: ${priority}

═══════════════════════════════════════════════════
VENTAS (Multi-período)
═══════════════════════════════════════════════════
• Últimos 7 días: $${fmt(rev7)} (${s7.length} ventas) — promedio diario: $${fmt(dailyAvg7)}
• Últimos 14 días: $${fmt(rev14)} (${s14.length} ventas)
• Últimos 30 días: $${fmt(rev30)} (${salesCount30} ventas) — promedio diario: $${fmt(dailyAvg30)}
• Últimos 90 días: $${fmt(rev90)} (${s90.length} ventas) — promedio diario: $${fmt(dailyAvg90)}
• Período anterior (30-60d): $${fmt(revPrev30)}
• Variación 30d vs anterior: ${growthVsPrev !== null ? `${growthVsPrev.toFixed(1)}%` : 'primer período (sin comparación)'}
• Ticket promedio: $${fmt(avgTicket)}
• Ventas a crédito: $${fmt(creditRevenue30)} (${creditSales30.length} ventas)
• Mejor día de ventas: ${bestDay}
• Hora pico: ${bestHour}
• Métodos de pago principales: ${topMethods.map(([m, v]) => `${m}: $${fmt(v)}`).join(' | ')}

═══════════════════════════════════════════════════
RENTABILIDAD
═══════════════════════════════════════════════════
• Margen bruto: ${grossMargin.toFixed(1)}%
• Ganancia bruta (30d): $${fmt(grossProfit)}
• Gastos totales (30d): $${fmt(totalExpenses)}
• Principales gastos: ${topExpCats.map(([c, v]) => `${c}: $${fmt(v)}`).join(' | ') || 'sin gastos registrados'}

═══════════════════════════════════════════════════
FLUJO DE CAJA
═══════════════════════════════════════════════════
• Plata que entró (30d): $${fmt(cashIn)} (de contado + abonos)
• Plata que salió (30d): $${fmt(cashOut)} (gastos + mercancía pagada + devoluciones)
• Flujo neto: $${fmt(netCashFlow)} ${netCashFlow >= 0 ? '✅' : '⚠️'}
${r30.metiste > 0 || r30.sacaste > 0 ? `
═══════════════════════════════════════════════════
ENTRE EL DUEÑO Y SU NEGOCIO (30d)
═══════════════════════════════════════════════════
• Metiste (plata del dueño que entró al negocio): $${fmt(r30.metiste)}
• Sacaste para ti (plata que el dueño sacó para él): $${fmt(r30.sacaste)}
• No es ganancia ni gasto: ya está fuera de la ganancia, los gastos y el flujo de caja de arriba
` : ''}
═══════════════════════════════════════════════════
INVENTARIO
═══════════════════════════════════════════════════
• Valor total del inventario: $${fmt(inventoryValue)}
• Total productos activos: ${prods.length}
• Sin stock: ${outOfStock.length} productos${outOfStock.length > 0 ? ` (${outOfStock.slice(0, 5).map(p => p.name).join(', ')})` : ''}
• Stock bajo: ${lowStock.length} productos${lowStock.length > 0 ? ` (${lowStock.slice(0, 5).map(p => `${p.name}: ${p.stock} uds`).join(', ')})` : ''}
• Sin rotación (0 ventas en 30d): ${noRotation.length} productos — capital atrapado: $${fmt(trappedCapitalTotal)}${noRotation.length > 0 ? `\n  → ${noRotation.slice(0, 5).map(p => `${p.name}: ${p.stock} uds, $${fmt(p.trappedCapital)} atrapados`).join('\n  → ')}` : ''}

═══════════════════════════════════════════════════
PRODUCTOS TOP (por facturación 30d)
═══════════════════════════════════════════════════
${top5Revenue.length > 0 ? top5Revenue.map((p, i) => `${i + 1}. ${p.name} — $${fmt(p.revenue)} revenue, ${p.units} uds, margen ${p.margin.toFixed(0)}%, stock: ${p.stock}`).join('\n') : 'Sin ventas registradas'}

PRODUCTOS TOP (por margen):
${top5Margin.length > 0 ? top5Margin.map((p, i) => `${i + 1}. ${p.name} — margen ${p.margin.toFixed(0)}%, $${fmt(p.revenue)} revenue`).join('\n') : 'Sin datos'}

═══════════════════════════════════════════════════
CUENTAS POR COBRAR
═══════════════════════════════════════════════════
• Total deuda de clientes: $${fmt(totalDebt)}
• Número de deudores: ${debts.length}
• Abonos recibidos (30d): $${fmt(abonos)}
${topDebtors.length > 0 ? `• Top deudores:\n${topDebtors.map((d, i) => `  ${i + 1}. ${d.name}: $${fmt(d.total_debt)}`).join('\n')}` : '• Sin cuentas por cobrar'}

═══════════════════════════════════════════════════
SEÑALES INTERPRETADAS
═══════════════════════════════════════════════════
${signals.length > 0 ? signals.join('\n') : '✅ No se detectaron señales de alerta significativas.'}
`.trim()
}

// ── Helper Functions ────────────────────────────────────────────────────────

function fmt(n: number): string {
    return Math.round(n).toLocaleString('es-CO')
}

function detectPhase(productCount: number, salesCount: number, revenue: number, growth: number | null): string {
    if (productCount === 0) return 'Pre-operación (sin productos registrados)'
    if (salesCount === 0) return 'Arranque (productos registrados, sin ventas aún)'
    if (salesCount < 10) return 'Arranque temprano (pocas ventas, validando mercado)'
    if (growth !== null && growth > 15) return 'Crecimiento activo'
    if (growth !== null && growth < -10) return 'Contracción (ventas en caída)'
    if (growth !== null && growth >= -10 && growth <= 5) return 'Estabilización (ventas sostenidas)'
    return 'Operación regular'
}

function detectHealth(margin: number, cashFlow: number, growth: number | null, signals: string[]): string {
    const alertCount = signals.filter(s => s.startsWith('🔴')).length
    const warningCount = signals.filter(s => s.startsWith('⚠️')).length

    if (alertCount >= 2) return '🔴 Crítica — múltiples alertas activas'
    if (alertCount === 1) return '🔴 En riesgo — alerta activa requiere atención'
    if (warningCount >= 3) return '⚠️ Tensionada — varias señales de precaución'
    if (warningCount >= 1) return '🟡 Aceptable con precauciones'
    if (margin > 30 && cashFlow > 0) return '🟢 Saludable'
    return '🟢 Estable'
}

function detectMainRisk(signals: string[]): string {
    const red = signals.find(s => s.startsWith('🔴'))
    if (red) return red.split(':')[0].replace('🔴 ', '')
    const yellow = signals.find(s => s.startsWith('⚠️'))
    if (yellow) return yellow.split(':')[0].replace('⚠️ ', '')
    return 'Sin riesgos significativos detectados'
}

function detectOpportunity(growth: number | null, topMargin: any[], noRotation: any[], totalDebt: number, abonos: number): string {
    if (growth !== null && growth > 10) return 'Escalar ventas aprovechando el momentum de crecimiento'
    if (topMargin.length > 0 && topMargin[0].margin > 50 && topMargin[0].units < 5) return `Impulsar ${topMargin[0].name} (alto margen, baja rotación)`
    if (noRotation.length > 3) return 'Liquidar inventario inmovilizado para recuperar capital'
    if (totalDebt > 0 && abonos === 0) return 'Activar cobranza para mejorar liquidez'
    return 'Optimizar mix de productos y márgenes'
}

function detectPriority(signals: string[], netCashFlow: number, outOfStock: any[], topOutOfStock: any[]): string {
    if (topOutOfStock.length > 0) return `Reponer stock de productos estrella (${topOutOfStock.map(p => p.name).join(', ')})`
    if (netCashFlow < 0) return 'Estabilizar flujo de caja — revisar gastos y cobranza'
    const red = signals.find(s => s.startsWith('🔴'))
    if (red) return 'Resolver alerta crítica identificada en señales'
    return 'Mantener ritmo y buscar crecimiento sostenido'
}
