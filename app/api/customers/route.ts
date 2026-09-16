import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

    const { data: customers } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', store.id)
        .order('name')

    return NextResponse.json({ customers: customers || [] })
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, phone } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const { data: store } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', user.id)
        .single()

    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const { data: customer, error } = await supabase
        .from('customers')
        .insert({ store_id: store.id, name: name.trim(), phone: phone?.trim() || null })
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ customer })
}
