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

        const prompt = `Eres el AI Manager de TOUL, asesor estratégico de negocios para emprendedores latinoamericanos. Tu tono es profesional, claro, seguro y útil. No hablas como robot ni como coach motivacional. Hablas como un socio de negocio experto.

DATOS DEL NEGOCIO (últimos 30 días):
- Facturación: $${totalRevenue.toLocaleString('es-CO')} COP (vs $${prevRevenue.toLocaleString('es-CO')} anteriores)
- Variación: ${revGrowth !== null ? `${revGrowth}%` : 'primer período'}
- # Ventas: ${sales.length} | Ticket promedio: $${Math.round(avgTicket).toLocaleString('es-CO')}
- Gastos: $${totalExpenses.toLocaleString('es-CO')} | Capital en inventario: $${inventoryValue.toLocaleString('es-CO')}
- Margen bruto: ${totalRevenue > 0 ? (grossProfit / totalRevenue * 100).toFixed(1) : 0}%

PRODUCTOS CLAVE:
${prodList.slice(0, 5).map(p => `  - ${p.name}: ${p.units} uds, margen ${p.margin.toFixed(0)}%, capital $${p.trappedCapital.toLocaleString('es-CO')}`).join('\n')}

INSTRUCCIONES:
Genera 5 insights estratégicos candidatos siguiendo esta estructura de 3 niveles:
1. Interpretation (Qué está pasando)
2. Implication (Por qué importa)
3. Suggestion (Qué hacer hoy - breve y accionable)

Responde con un JSON array de objetos con este esquema:
{
  "id": "string",
  "category": "status" | "opportunity" | "dependency" | "alert",
  "severity": "health" | "attention" | "alert" | "info",
  "status_label": "string máx 3 palabras (Badge ejecutivo)",
  "interpretation": "string (frase estratégica)",
  "implication": "string (consecuencia)",
  "suggestion": "string (acción concreta)",
  "icon": "emoji relevante"
}

Prioriza temas de: rentabilidad, dependencia de productos, capital atrapado o alertas financieras.
Responde SOLO el JSON array persistiendo el esquema exacto.`

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 1500,
        })

        const rawContent = response.choices[0]?.message?.content || '[]'
        const cleanContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const candidateInsights = JSON.parse(cleanContent)

        // Strategic Ranking Logic
        const severityWeight = { alert: 100, attention: 60, health: 30, info: 10 }
        const categoryWeight = { alert: 50, dependency: 40, weakness: 35, opportunity: 20, status: 10 }

        const ranked = candidateInsights.sort((a: any, b: any) => {
            const scoreA = (severityWeight[a.severity as keyof typeof severityWeight] || 0) + (categoryWeight[a.category as keyof typeof categoryWeight] || 0)
            const scoreB = (severityWeight[b.severity as keyof typeof severityWeight] || 0) + (categoryWeight[b.category as keyof typeof categoryWeight] || 0)
            return scoreB - scoreA
        })

        const finalInsights = ranked.slice(0, 1)

        await supabase.from('ai_insights').upsert({ store_id: storeId, insights: finalInsights, generated_at: new Date().toISOString() }, { onConflict: 'store_id' })
        return NextResponse.json({ insights: finalInsights })
    } catch (error) {
        console.error('AI insights error:', error)
        const fallback = generateRichFallback({ sales, totalRevenue, prevRevenue, revGrowth, avgTicket, starProduct, highMarginProduct, highTrapped, lowRotation, lowStockProds, outOfStock, bestDay, bestHour, topMethod, topExpenseCat, totalExpenses, inventoryValue, grossProfit, marginPressure, prods })
        return NextResponse.json({ insights: fallback.slice(0, 1) })
    }
}

function generateRichFallback(d: any) {
    const insights: any[] = []

    // Alert: Margin Pressure
    if (d.marginPressure && d.totalRevenue > 0) {
        insights.push({
            id: 'margin-alert', category: 'alert', severity: 'alert', status_label: 'Margen en riesgo',
            interpretation: 'Tu margen bruto es menor al 30% a pesar de tener ventas activas.',
            implication: 'Esto puede significar que estás operando con rentabilidad negativa tras gastos.',
            suggestion: 'Revisa tu estructura de precios vs costos hoy mismo.',
            icon: '🔴'
        })
    }

    // Dependency: Star Product
    if (d.starProduct && d.totalRevenue > 0 && (d.starProduct.revenue / d.totalRevenue) > 0.6) {
        insights.push({
            id: 'dependency-alert', category: 'dependency', severity: 'attention', status_label: 'Dependencia alta',
            interpretation: `Tu facturación depende en un ${(d.starProduct.revenue / d.totalRevenue * 100).toFixed(0)}% de un solo producto.`,
            implication: 'Vuelve frágil tu flujo de caja si ese producto deja de rotar.',
            suggestion: 'Promociona un segundo producto con buen margen para diversificar.',
            icon: '⚠️'
        })
    }

    // Opportunity: Growing Sales
    if (d.revGrowth && Number(d.revGrowth) > 10) {
        insights.push({
            id: 'growth-opp', category: 'opportunity', severity: 'health', status_label: 'En crecimiento',
            interpretation: `Tus ventas han subido un ${d.revGrowth}% respecto al periodo anterior.`,
            implication: 'Indica un buen momentum comercial que puedes escalar.',
            suggestion: 'Aprovecha para invertir en pauta sobre tus productos estrella.',
            icon: '📈'
        })
    }

    // Status: Healthy
    if (insights.length === 0) {
        insights.push({
            id: 'status-healthy', category: 'status', severity: 'health', status_label: 'Negocio saludable',
            interpretation: 'Tu operación mantiene un ritmo de ventas y gastos equilibrado.',
            implication: 'Te permite planear el siguiente paso con estabilidad financiera.',
            suggestion: 'Mantén el control de inventario para evitar quiebres de stock.',
            icon: '✅'
        })
    }

    return insights
}
