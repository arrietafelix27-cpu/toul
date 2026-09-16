import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/isla/context'

// Lightweight endpoint for POS: returns products with stock > 0
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }

    const [productsRes, variantsRes, adjRes, combosRes] = await Promise.all([
        supabase.from('products').select('id, name, sale_price, cpp, stock, image_url, images, reference').eq('store_id', store.id).eq('is_active', true).order('name'),
        supabase.from('product_variants').select('id, product_id, name, sale_price, cpp').eq('store_id', store.id).eq('is_active', true),
        supabase.from('inventory_adjustments').select('variant_id, quantity').eq('store_id', store.id).not('variant_id', 'is', null),
        supabase.from('combos')
            .select(`id, name, sale_price, image_url,
                combo_items(product_id, variant_id, quantity,
                    products!product_id(id, name, cpp),
                    product_variants!variant_id(id, name, cpp)
                )`)
            .eq('store_id', store.id)
            .eq('is_active', true)
            .order('name'),
    ])

    const stockByVariant: Record<string, number> = {}
    for (const adj of (adjRes.data || [])) {
        if (adj.variant_id) stockByVariant[adj.variant_id] = (stockByVariant[adj.variant_id] || 0) + adj.quantity
    }

    const variants = (variantsRes.data || []).map((v: any) => ({
        ...v,
        stock: Math.max(0, stockByVariant[v.id] || 0),
    }))

    return NextResponse.json({ products: productsRes.data || [], variants, combos: combosRes.data || [] })
}
