import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DEFAULT_PAYMENT_METHODS } from '@/lib/types'

async function getStoreId(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
    return store?.id ?? null
}

async function seedDefaultMethods(supabase: Awaited<ReturnType<typeof createClient>>, storeId: string) {
    const inserts = DEFAULT_PAYMENT_METHODS.map(m => ({ ...m, store_id: storeId }))
    await supabase.from('payment_methods').insert(inserts)
}

// GET — list all payment methods for store (auto-seed if none)
export async function GET() {
    const supabase = await createClient()
    const storeId = await getStoreId(supabase)
    if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('sort_order')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-seed default methods on first access
    if (!data || data.length === 0) {
        await seedDefaultMethods(supabase, storeId)
        const { data: seeded } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
            .order('sort_order')
        data = seeded || []
    }

    return NextResponse.json({ methods: data })
}

// POST — create new payment method
export async function POST(request: Request) {
    const supabase = await createClient()
    const storeId = await getStoreId(supabase)
    if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, color } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const { data: existing } = await supabase
        .from('payment_methods')
        .select('sort_order')
        .eq('store_id', storeId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

    const sort_order = (existing?.sort_order ?? -1) + 1

    const { data, error } = await supabase
        .from('payment_methods')
        .insert({ store_id: storeId, name: name.trim(), color: color || '#6366F1', sort_order })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ method: data })
}

// PATCH — update name/color
export async function PATCH(request: Request) {
    const supabase = await createClient()
    const storeId = await getStoreId(supabase)
    if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, name, color } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const updates: Record<string, string> = {}
    if (name) updates.name = name.trim()
    if (color) updates.color = color

    const { error } = await supabase
        .from('payment_methods')
        .update(updates)
        .eq('id', id)
        .eq('store_id', storeId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
}

// DELETE — soft-delete (check balance first)
export async function DELETE(request: Request) {
    const supabase = await createClient()
    const storeId = await getStoreId(supabase)
    if (!storeId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    // Get method name for balance check
    const { data: method } = await supabase
        .from('payment_methods')
        .select('name')
        .eq('id', id)
        .eq('store_id', storeId)
        .single()

    if (!method) return NextResponse.json({ error: 'Method not found' }, { status: 404 })

    // Check balance via payments table
    const { data: payments } = await supabase
        .from('payments')
        .select('type, amount')
        .eq('store_id', storeId)
        .eq('method', method.name)

    let balance = 0
    for (const p of payments || []) {
        const isOut = p.type === 'transfer_out' || p.type === 'expense' || p.type === 'purchase' || p.type === 'provider_payment'
        balance += isOut ? -p.amount : p.amount
    }

    if (balance > 0) {
        return NextResponse.json({ error: `No puedes eliminar "${method.name}" mientras tenga saldo. Transfiere primero.` }, { status: 409 })
    }

    // Soft delete
    const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', id)
        .eq('store_id', storeId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
}
