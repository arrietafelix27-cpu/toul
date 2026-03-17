import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Cache duration: 1 hour (was 12h — too stale)
const CACHE_TTL = 1 * 60 * 60 * 1000

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { storeId } = await request.json()

    // Check cache
    const { data: cached } = await supabase
        .from('ai_insights')
        .select('insights, generated_at')
        .eq('store_id', storeId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

    if (cached) {
        const ageMs = Date.now() - new Date(cached.generated_at).getTime()
        if (ageMs < CACHE_TTL) {
            return NextResponse.json({ insights: cached.insights })
        }
    }

    // ── Gather rich data ──────────────────────────────────────────────────────
    const now = new Date()
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const last60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

    const [
        { data: products },
        { data: salesRaw },
        { data: salesPrevRaw },
        { data: expenses },
        { data: saleItems },
        { data: payments },
    ] = await Promise.all([
        supabase.from('products').select('id, name, stock, cpp, sale_price, is_active, created_at').eq('store_id', storeId).eq('is_active', true),
        supabase.from('sales').select('id, total, created_at, payment_method').eq('store_id', storeId).eq('is_credit', false).gte('created_at', last30),
        supabase.from('sales').select('total').eq('store_id', storeId).eq('is_credit', false).gte('created_at', last60).lt('created_at', last30),
        supabase.from('expenses').select('amount, category, description, created_at').eq('store_id', storeId).gte('created_at', last30),
        supabase.from('sale_items').select('product_id, quantity, unit_price, unit_cost, sales!inner(created_at, store_id)').eq('sales.store_id', storeId).gte('sales.created_at', last30),
        supabase.from('payments').select('method, amount, type').eq('store_id', storeId).gte('created_at', last30),
    ])

    // ── Compute derived metrics ───────────────────────────────────────────────
    const sales = salesRaw || []
    const prevSales = salesPrevRaw || []
    const items = saleItems || []
    const prods = products || []
    const exps = expenses || []
    const pays = payments || []

    const totalRevenue = sales.reduce((s, v) => s + v.total, 0)
    const prevRevenue = prevSales.reduce((s, v) => s + v.total, 0)
    const revGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue * 100).toFixed(1) : null
    const totalExpenses = exps.reduce((s, e) => s + e.amount, 0)
    const inventoryValue = prods.reduce((s, p) => s + p.stock * p.cpp, 0)
    const avgTicket = sales.length > 0 ? totalRevenue / sales.length : 0

    // Product analytics
    const prodMap: Record<string, { name: string; revenue: number; units: number; cost: number; stock: number; cpp: number; lastSale?: string }> = {}
    for (const p of prods) prodMap[p.id] = { name: p.name, revenue: 0, units: 0, cost: 0, stock: p.stock, cpp: p.cpp }
    for (const item of items) {
        if (prodMap[item.product_id]) {
            prodMap[item.product_id].revenue += item.unit_price * item.quantity
            prodMap[item.product_id].units += item.quantity
            prodMap[item.product_id].cost += item.unit_cost * item.quantity
            prodMap[item.product_id].lastSale = (item.sales as any)?.created_at
        }
    }
    const prodList = Object.entries(prodMap).map(([id, p]) => ({
        id, ...p,
        profit: p.revenue - p.cost,
        margin: p.revenue > 0 ? ((p.revenue - p.cost) / p.revenue * 100) : 0,
        trappedCapital: p.stock * p.cpp,
    })).sort((a, b) => b.revenue - a.revenue)

    const starProduct = prodList[0]
    const highMarginProduct = [...prodList].sort((a, b) => b.margin - a.margin)[0]
    const highTrapped = [...prodList].sort((a, b) => b.trappedCapital - a.trappedCapital)[0]
    const lowRotation = prodList.filter(p => p.units === 0 && p.stock > 0).sort((a, b) => b.trappedCapital - a.trappedCapital)[0]
    const lowStockProds = prods.filter(p => p.stock > 0 && p.stock <= 5)
    const outOfStock = prods.filter(p => p.stock === 0)

    // Sales by day of week
    const dayMap: Record<number, number> = {}
    for (const s of sales) {
        const d = new Date(s.created_at).getDay()
        dayMap[d] = (dayMap[d] || 0) + s.total
    }
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    const bestDayNum = Object.entries(dayMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    const bestDay = bestDayNum ? dayNames[Number(bestDayNum[0])] : null

    // Sales by hour
    const hourMap: Record<number, number> = {}
    for (const s of sales) { const h = new Date(s.created_at).getHours(); hourMap[h] = (hourMap[h] || 0) + 1 }
    const bestHourNum = Object.entries(hourMap).sort((a, b) => Number(b[1]) - Number(a[1]))[0]
    const bestHour = bestHourNum ? Number(bestHourNum[0]) : null

    // Payment methods
    const methodMap: Record<string, number> = {}
    for (const s of sales) { methodMap[s.payment_method] = (methodMap[s.payment_method] || 0) + s.total }
    const topMethod = Object.entries(methodMap).sort((a, b) => b[1] - a[1])[0]

    // Expense categories
    const expCatMap: Record<string, number> = {}
    for (const e of exps) expCatMap[e.category] = (expCatMap[e.category] || 0) + e.amount
    const topExpenseCat = Object.entries(expCatMap).sort((a, b) => b[1] - a[1])[0]

    // Check if profit is shrinking despite revenue growth
    const grossProfit = prodList.reduce((s, p) => s + p.profit, 0)
    const marginPressure = totalRevenue > 0 && grossProfit / totalRevenue < 0.3 // <30% gross margin

    // ── Fallback (no OpenAI) — rich and varied ────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ insights: generateRichFallback({ sales, totalRevenue, prevRevenue, revGrowth, avgTicket, starProduct, highMarginProduct, highTrapped, lowRotation, lowStockProds, outOfStock, bestDay, bestHour, topMethod, topExpenseCat, totalExpenses, inventoryValue, grossProfit, marginPressure, prods }) })
    }

    // ── OpenAI — rich prompt ──────────────────────────────────────────────────
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

        const prompt = `Eres el AI Manager de TOUL, asesor estratégico de negocios para emprendedores latinoamericanos que venden por Instagram, WhatsApp y TikTok. Tu tono es directo, amigable, útil y concreto. No hablas como robot ni como consultor corporativo. Hablas como un socio de negocio inteligente.

DATOS DEL NEGOCIO (últimos 30 días):
- Facturación: $${totalRevenue.toLocaleString('es-CO')} COP
- Facturación período anterior: $${prevRevenue.toLocaleString('es-CO')} COP  
- Variación: ${revGrowth !== null ? `${revGrowth}%` : 'primer período'}
- # Ventas: ${sales.length}
- Ticket promedio: $${Math.round(avgTicket).toLocaleString('es-CO')} COP
- Total gastos: $${totalExpenses.toLocaleString('es-CO')} COP
- Capital en inventario: $${inventoryValue.toLocaleString('es-CO')} COP
- Utilidad bruta estimada: $${Math.round(grossProfit).toLocaleString('es-CO')} COP
- Margen bruto: ${totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(1) : 0}%

PRODUCTOS (más vendidos primero):
${prodList.slice(0, 8).map(p => `  - ${p.name}: ${p.units} uds, $${p.revenue.toLocaleString('es-CO')} facturado, margen ${p.margin.toFixed(0)}%, capital atrapado $${p.trappedCapital.toLocaleString('es-CO')}`).join('\n')}

Productos sin rotación en 30 días (stock > 0): ${lowRotation ? `${lowRotation.name} (${lowRotation.stock} unidades, $${lowRotation.trappedCapital.toLocaleString('es-CO')} atrapados)` : 'ninguno'}
Productos con stock bajo (≤5): ${lowStockProds.map(p => p.name).join(', ') || 'ninguno'}
Productos sin stock: ${outOfStock.map(p => p.name).join(', ') || 'ninguno'}

COMPORTAMIENTO:
- Mejor día de ventas: ${bestDay || 'sin datos'}
- Mejor hora de ventas: ${bestHour !== null ? `${bestHour}:00` : 'sin datos'}
- Método de pago más usado: ${topMethod ? topMethod[0] : 'sin datos'}
- Categoría de gasto más alta: ${topExpenseCat ? `${topExpenseCat[0]} ($${topExpenseCat[1].toLocaleString('es-CO')})` : 'sin datos'}

INSTRUCCIONES:
Genera exactamente 5 insights variados, no repitas tipos. Elige los más relevantes según los datos reales. Sé específico con los números. 
Tipos disponibles: ventas_comparativa, ticket_promedio, producto_estrella, producto_mayor_margen, capital_atrapado, producto_sin_rotacion, stock_bajo, sin_stock, mejor_dia, mejor_hora, metodo_pago, gasto_alto, alerta_margen, promocionar, reponer, liquidar, tendencia_gastos

Responde con JSON array de 5 objetos, cada uno con:
- id: string único
- type: string tipo elegido
- title: string (máx 5 palabras, directo)
- explanation: string (1-2 frases con datos reales, lenguaje natural)
- suggestion: string (acción concreta y específica, 1 frase)
- icon: emoji relevante
- urgency: "info" | "warning" | "success"

Responde SOLO el JSON array, sin markdown.`

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            max_tokens: 1200,
        })

        const rawContent = response.choices[0]?.message?.content || '[]'
        const insights = JSON.parse(rawContent)

        await supabase.from('ai_insights').upsert({ store_id: storeId, insights, generated_at: new Date().toISOString() }, { onConflict: 'store_id' })
        return NextResponse.json({ insights })
    } catch (error) {
        console.error('AI insights error:', error)
        return NextResponse.json({ insights: generateRichFallback({ sales, totalRevenue, prevRevenue, revGrowth, avgTicket, starProduct, highMarginProduct, highTrapped, lowRotation, lowStockProds, outOfStock, bestDay, bestHour, topMethod, topExpenseCat, totalExpenses, inventoryValue, grossProfit, marginPressure, prods }) })
    }
}

function generateRichFallback(d: any) {
    const insights: any[] = []

    // Revenue trend
    if (d.prevRevenue > 0 && d.revGrowth !== null) {
        const grew = Number(d.revGrowth) > 0
        insights.push({
            id: 'revenue-trend', type: 'ventas_comparativa',
            icon: grew ? '📈' : '📉',
            urgency: grew ? 'success' : 'warning',
            title: grew ? `Ventas subieron ${d.revGrowth}%` : `Ventas bajaron ${Math.abs(Number(d.revGrowth))}%`,
            explanation: grew
                ? `Tus ventas de este mes (${(d.totalRevenue / 1000).toFixed(0)}k) superan el período anterior (${(d.prevRevenue / 1000).toFixed(0)}k). Vas muy bien.`
                : `Este mes facturaste ${(d.totalRevenue / 1000).toFixed(0)}k vs ${(d.prevRevenue / 1000).toFixed(0)}k del período anterior. Hay oportunidad de mejorar.`,
            suggestion: grew ? 'Duplica lo que estás haciendo bien: identifica qué producto o canal está jalando más.' : 'Activa tus clientes anteriores con un mensaje de WhatsApp o una oferta especial.',
        })
    } else if (d.sales.length > 0) {
        insights.push({
            id: 'sales-count', type: 'ventas_comparativa', icon: '🎯', urgency: 'info',
            title: `${d.sales.length} ventas en 30 días`,
            explanation: `Has registrado ${d.sales.length} ventas con un ticket promedio de $${Math.round(d.avgTicket / 1000)}k.`,
            suggestion: 'Comparte tus productos más vendidos en stories para atraer nuevos compradores.',
        })
    }

    // Star product
    if (d.starProduct) {
        insights.push({
            id: 'star-product', type: 'producto_estrella', icon: '⭐', urgency: 'success',
            title: `${d.starProduct.name.slice(0, 20)} lidera`,
            explanation: `Tu producto estrella generó $${(d.starProduct.revenue / 1000).toFixed(0)}k con ${d.starProduct.units} unidades vendidas este mes.`,
            suggestion: `Asegúrate de tener stock suficiente de ${d.starProduct.name} y ponlo siempre en tu contenido de ventas.`,
        })
    }

    // Trapped capital
    if (d.highTrapped && d.highTrapped.trappedCapital > 100000 && d.highTrapped.units === 0) {
        insights.push({
            id: 'trapped-capital', type: 'capital_atrapado', icon: '💰', urgency: 'warning',
            title: 'Capital atrapado en inventario',
            explanation: `Tienes $${(d.highTrapped.trappedCapital / 1000).toFixed(0)}k invertidos en "${d.highTrapped.name}" sin ventas en 30 días. Ese dinero no está trabajando.`,
            suggestion: 'Crea una promoción del 15-20% solo por esta semana. Recuperar liquidez vale más que el margen.',
        })
    }

    // Low stock alert
    if (d.lowStockProds.length > 0) {
        insights.push({
            id: 'low-stock', type: 'stock_bajo', icon: '⚠️', urgency: 'warning',
            title: 'Stock bajo, cuidado',
            explanation: `${d.lowStockProds.slice(0, 2).map((p: any) => p.name).join(' y ')} tienen ${d.lowStockProds.length > 1 ? 'pocas' : 'poca'} unidad disponible. Si sigues vendiendo, te quedas sin inventario.`,
            suggestion: `Haz el pedido de reposición hoy. Quedarse sin stock en un producto popular puede costarte ventas de clientes frecuentes.`,
        })
    }

    // Best day insight
    if (d.bestDay) {
        insights.push({
            id: 'best-day', type: 'mejor_dia', icon: '📅', urgency: 'info',
            title: `${d.bestDay} es tu mejor día`,
            explanation: `Tus ventas históricas muestran que los ${d.bestDay}s concentran más actividad de compra en tu negocio.`,
            suggestion: `Publica tu mejor contenido y activaciones en el día previo (${d.bestDay === 'lunes' ? 'domingos' : d.bestDay}s noche) para capturar ese pico.`,
        })
    }

    // High margin product
    if (d.highMarginProduct && d.highMarginProduct.margin > 40) {
        insights.push({
            id: 'high-margin', type: 'producto_mayor_margen', icon: '💎', urgency: 'success',
            title: `${d.highMarginProduct.name.slice(0, 18)} es tu joya`,
            explanation: `Tiene un margen del ${d.highMarginProduct.margin.toFixed(0)}%, lo que significa que de cada $100 vendidos te quedan $${d.highMarginProduct.margin.toFixed(0)}.`,
            suggestion: 'Prioriza este producto en tu catálogo y dale más visibilidad. Un cliente más de este vale doble.',
        })
    }

    // Best hour
    if (d.bestHour !== null && d.bestHour !== undefined) {
        insights.push({
            id: 'best-hour', type: 'mejor_hora', icon: '🕐', urgency: 'info',
            title: `Más ventas a las ${d.bestHour}h`,
            explanation: `La mayoría de tus ventas ocurre alrededor de las ${d.bestHour}:00. Tus clientes compran en ese horario.`,
            suggestion: `Publica en redes 1-2 horas antes de las ${d.bestHour}:00 para calentar la audiencia justo cuando está lista para comprar.`,
        })
    }

    // Expense warning
    if (d.topExpenseCat && d.totalExpenses > 0) {
        insights.push({
            id: 'top-expense', type: 'gasto_alto', icon: '💸', urgency: 'info',
            title: `Mayor gasto: ${d.topExpenseCat[0]}`,
            explanation: `Tu categoría de gasto más alta este mes es "${d.topExpenseCat[0]}" con $${(d.topExpenseCat[1] / 1000).toFixed(0)}k. Representa el ${(d.topExpenseCat[1] / d.totalExpenses * 100).toFixed(0)}% de tus gastos.`,
            suggestion: 'Evalúa si ese gasto está generando retorno. Si es publicidad, revisa qué contenido convierte mejor.',
        })
    }

    // Margin pressure alert
    if (d.marginPressure && d.totalRevenue > 0) {
        insights.push({
            id: 'margin-pressure', type: 'alerta_margen', icon: '🔴', urgency: 'warning',
            title: 'Margen bajo, ojo aquí',
            explanation: `Estás facturando bien, pero tu margen bruto es menor al 30%. Eso puede significar que tus precios de venta son muy bajos vs tu costo real.`,
            suggestion: 'Revisa tu precio de venta vs costo actualizado. Un ajuste de precio del 10% puede cambiar completamente tu rentabilidad.',
        })
    }

    // Payment method
    if (d.topMethod) {
        const methodLabels: Record<string, string> = { efectivo: 'Efectivo', nequi: 'Nequi', bancolombia: 'Bancolombia', daviplata: 'Daviplata' }
        insights.push({
            id: 'top-method', type: 'metodo_pago', icon: '💳', urgency: 'info',
            title: `${methodLabels[d.topMethod[0]] || d.topMethod[0]} es tu rey`,
            explanation: `La mayoría de tus pagos llegan por ${methodLabels[d.topMethod[0]] || d.topMethod[0]}. Es el canal preferido de tus clientes.`,
            suggestion: `Destaca ese método de pago en tu descripción de productos para reducir fricción al comprar.`,
        })
    }

    // Shuffle and take 4-5 
    const shuffled = insights.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 5)
}
