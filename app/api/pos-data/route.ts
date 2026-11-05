import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/isla/context'

const DIAS_MAS_VENDIDOS = 30

// Lightweight endpoint for POS: active products, variants and combos with their stock
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }
    const desde = new Date(Date.now() - DIAS_MAS_VENDIDOS * 24 * 60 * 60 * 1000).toISOString()

    const [productsRes, variantsRes, adjRes, combosRes, categoriesRes, soldRes] = await Promise.all([
        supabase.from('products').select('id, name, sale_price, cpp, stock, image_url, images, reference, category_id').eq('store_id', store.id).eq('is_active', true).order('name'),
        supabase.from('product_variants').select('id, product_id, name, sale_price, cpp').eq('store_id', store.id).eq('is_active', true),
        supabase.from('inventory_adjustments').select('variant_id, quantity').eq('store_id', store.id).not('variant_id', 'is', null),
        supabase.from('combos')
            // Con el stock de lo que lleva: la caja apaga el combo al que le falta algo
            .select(`id, name, sale_price, image_url, category_id,
                combo_items(product_id, variant_id, quantity,
                    products!product_id(id, name, cpp, stock),
                    product_variants!variant_id(id, product_id, name, cpp, stock)
                )`)
            .eq('store_id', store.id)
            .eq('is_active', true)
            .order('name'),
        supabase.from('product_categories').select('id, name, sort_order').eq('store_id', store.id).order('sort_order').order('name'),
        // Lo vendido en los últimos 30 días: la caja muestra primero lo que más sale.
        // select('*') porque combo_id no existe en todas las bases
        supabase.from('sale_items').select('*, sales!inner(created_at)').eq('store_id', store.id).gte('sales.created_at', desde).limit(5000),
    ])

    const stockByVariant: Record<string, number> = {}
    for (const adj of (adjRes.data || [])) {
        if (adj.variant_id) stockByVariant[adj.variant_id] = (stockByVariant[adj.variant_id] || 0) + adj.quantity
    }

    const variants = (variantsRes.data || []).map((v: any) => ({
        ...v,
        stock: Math.max(0, stockByVariant[v.id] || 0),
    }))

    // Unidades vendidas por producto y por combo. Si la consulta falla, la caja ordena por nombre
    const sold: Record<string, number> = {}
    for (const row of (soldRes.error ? [] : soldRes.data || []) as { product_id?: string | null; combo_id?: string | null; quantity?: number }[]) {
        const key = row.combo_id ? `combo:${row.combo_id}` : row.product_id
        if (key) sold[key] = (sold[key] || 0) + (Number(row.quantity) || 0)
    }

    return NextResponse.json({
        products: productsRes.data || [],
        variants,
        combos: combosRes.data || [],
        categories: categoriesRes.error ? [] : categoriesRes.data || [],
        sold,
    })
}
