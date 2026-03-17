import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Lightweight endpoint for POS: returns products with stock > 0
export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', user.id)
        .single()

    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const { data: products } = await supabase
        .from('products')
        .select('id, name, sale_price, cpp, stock, image_url, images, reference')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .gt('stock', 0)
        .order('name')

    return NextResponse.json({ products: products || [] })
}
