import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/* ══════════════════════════════════════════════════════════════
   Ajuste de inventario.
   Sirve para los dos lados: dar de baja lo que se perdió y meter
   lo que entró sin ser una compra (una devolución, algo que
   apareció, un regalo del proveedor).
   Y funciona sobre la presentación, no solo sobre el producto:
   lo que se daña es el frasco de 50 ml o la talla M.
   ══════════════════════════════════════════════════════════════ */

const SALIDAS = ['damage', 'loss', 'theft', 'expired', 'other']
const ENTRADAS = ['return', 'found', 'gift', 'other']

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { productId, variantId, direction, quantity, reason, notes } = await request.json()

        const amount = Math.round(Number(quantity))
        if (!productId || !Number.isFinite(amount) || amount <= 0) {
            return NextResponse.json({ error: 'Escribe una cantidad mayor a cero' }, { status: 400 })
        }

        const isEntrada = direction === 'in'
        const allowed = isEntrada ? ENTRADAS : SALIDAS
        if (!allowed.includes(reason)) {
            return NextResponse.json({ error: 'Elige un motivo' }, { status: 400 })
        }

        const { data: store } = await supabase
            .from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })

        // Que el producto (o la presentación) sea de esta tienda
        if (variantId) {
            const { data: variant } = await supabase
                .from('product_variants')
                .select('id, name, stock, product_id')
                .eq('id', variantId).eq('store_id', store.id).single()

            if (!variant || variant.product_id !== productId) {
                return NextResponse.json({ error: 'Presentación no encontrada' }, { status: 404 })
            }
            if (!isEntrada && Number(variant.stock) < amount) {
                return NextResponse.json(
                    { error: `Solo hay ${variant.stock} de ${variant.name}. No puedes dar de baja ${amount}.` },
                    { status: 400 })
            }
        } else {
            const { data: product } = await supabase
                .from('products').select('id, name, stock')
                .eq('id', productId).eq('store_id', store.id).single()

            if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
            if (!isEntrada && Number(product.stock) < amount) {
                return NextResponse.json(
                    { error: `Solo hay ${product.stock} de ${product.name}. No puedes dar de baja ${amount}.` },
                    { status: 400 })
            }
        }

        // El disparador de la base pone al día el stock del producto
        // y el de la presentación
        const { error } = await supabase.from('inventory_adjustments').insert({
            store_id: store.id,
            product_id: productId,
            variant_id: variantId || null,
            quantity: isEntrada ? amount : -amount,
            reason,
            notes: notes?.trim() || null,
        })
        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('Adjustment Error:', error)
        const message = error instanceof Error ? error.message : 'Error interno del servidor'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
