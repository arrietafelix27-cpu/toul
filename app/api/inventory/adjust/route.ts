import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { productId, quantity, reason, notes } = await request.json()

        if (!productId || !quantity || quantity <= 0) {
            return NextResponse.json({ error: 'Datos de ajuste inválidos' }, { status: 400 })
        }

        // 1. Get Store
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .eq('owner_id', user.id)
            .single()

        if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

        // 2. Fetch current stock and verify
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('id, stock')
            .eq('id', productId)
            .eq('store_id', store.id)
            .single()

        if (fetchError || !product) {
            return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
        }

        if (product.stock < quantity) {
            return NextResponse.json({ error: 'Stock insuficiente para el ajuste' }, { status: 400 })
        }

        // 3. Perform atomic-like operations (Sequentially on server)

        // A. Insert adjustment record
        const { error: adjError } = await supabase.from('inventory_adjustments').insert({
            store_id: store.id,
            product_id: productId,
            quantity: quantity,
            type: 'reduction',
            reason: reason,
            notes: notes?.trim() || null
        })

        if (adjError) throw adjError

        // B. Update Product Stock
        const { error: prodError } = await supabase
            .from('products')
            .update({
                stock: product.stock - quantity,
                updated_at: new Date().toISOString()
            })
            .eq('id', productId)

        if (prodError) throw prodError

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('Adjustment Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
    }
}
