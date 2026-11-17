import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/isla/context'

const DIAS_MAS_VENDIDOS = 30

/**
 * Todo lo que la caja necesita en un solo pedido: productos, presentaciones,
 * combos, categorías, lo vendido en 30 días, métodos de pago y clientes.
 *
 * El stock es el mismo que muestra Inventario (toul_estado_stock lee estas
 * mismas columnas, que la base mantiene al día con cada movimiento).
 */
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }
    const desde = new Date(Date.now() - DIAS_MAS_VENDIDOS * 24 * 60 * 60 * 1000).toISOString()

    const [productsRes, variantsRes, combosRes, categoriesRes, soldRes, methodsRes, customersRes] = await Promise.all([
        supabase.from('products').select('id, name, sale_price, cpp, stock, image_url, images, reference, category_id').eq('store_id', store.id).eq('is_active', true).order('name'),
        supabase.from('product_variants').select('id, product_id, name, sale_price, cpp, stock').eq('store_id', store.id).eq('is_active', true),
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
        // Un combo cuenta para sí mismo, no para lo que lleva.
        // select('*') porque combo_id no existe en todas las bases
        supabase.from('sale_items').select('*, sales!inner(created_at)').eq('store_id', store.id).gte('sales.created_at', desde).limit(5000),
        supabase.from('payment_methods').select('*').eq('store_id', store.id).eq('is_active', true).order('sort_order'),
        supabase.from('customers').select('*').eq('store_id', store.id).order('name'),
    ])

    // Sin productos no hay caja: mejor un error (la caja usa la copia guardada)
    // que una lista vacía que parezca que no hay nada
    if (productsRes.error || variantsRes.error) {
        return NextResponse.json({ error: 'No se pudieron cargar los productos' }, { status: 500 })
    }

    const variants = (variantsRes.data || []).map(v => ({
        ...v,
        stock: Math.max(0, Number(v.stock) || 0),
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
        // null = no cargaron: la caja usa la copia guardada o los pide aparte
        methods: methodsRes.error ? null : methodsRes.data || [],
        customers: customersRes.error ? null : customersRes.data || [],
    })
}
