import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/isla/context'
import { clienteConTelefono, soloDigitos } from '@/lib/pos/clientes'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }

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

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }

    // El teléfono identifica a la persona: si ya está, no se crea otra
    // vez (la deuda quedaría partida en dos clientes)
    const telefono = typeof phone === 'string' ? phone.trim() : ''
    if (soloDigitos(telefono).length > 0) {
        const { data: conTelefono } = await supabase
            .from('customers')
            .select('*')
            .eq('store_id', store.id)
            .not('phone', 'is', null)
        const existente = clienteConTelefono(conTelefono ?? [], telefono)
        if (existente) {
            return NextResponse.json({ error: `Ya existe ${existente.name} con ese teléfono`, existing: existente }, { status: 409 })
        }
    }

    const { data: customer, error } = await supabase
        .from('customers')
        .insert({ store_id: store.id, name: name.trim(), phone: telefono || null })
        .select()
        .single()

    if (error) {
        // La base no deja crear clientes al vendedor sin ese permiso
        if (error.code === '42501' || /row-level security/i.test(error.message)) {
            return NextResponse.json({ error: 'No tienes permiso para crear clientes. Elige uno que ya exista.' }, { status: 403 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ customer })
}
