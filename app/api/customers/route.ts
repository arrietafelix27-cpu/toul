import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getSessionContext } from '@/lib/isla/context'
import { clienteConTelefono, normalizar, pareceTelefono, soloDigitos } from '@/lib/pos/clientes'

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

/** El WhatsApp: 10 dígitos (con o sin el +57 adelante). null si no sirve */
function whatsapp(texto: string): string | null {
    let d = soloDigitos(texto)
    if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
    return d.length === 10 ? d : null
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, phone } = await req.json()
    const nombre = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : ''
    if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
    // Un cliente a nombre de "300 123 4567" no le sirve a nadie
    if (pareceTelefono(nombre)) return NextResponse.json({ error: 'El nombre no puede ser un número de teléfono' }, { status: 400 })

    const escrito = typeof phone === 'string' ? phone.trim() : ''
    const telefono = escrito ? whatsapp(escrito) : null
    if (escrito && !telefono) return NextResponse.json({ error: 'El número de WhatsApp debe tener 10 dígitos' }, { status: 400 })

    const context = await getSessionContext(supabase)
    if (!context) return NextResponse.json({ error: 'Store not found' }, { status: 404 })
    const store = { id: context.storeId }

    // Nombre y teléfono identifican a la persona: si ya está, no se crea
    // otra vez (la deuda quedaría partida en dos clientes)
    const { data: todos, error: errorLeer } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', store.id)
    if (errorLeer) return NextResponse.json({ error: 'No se pudo revisar si el cliente ya existe. Intenta de nuevo.' }, { status: 500 })
    const clave = normalizar(nombre)
    const mismoNombre = (todos ?? []).find(c => normalizar(c.name) === clave)
    if (mismoNombre) {
        return NextResponse.json({ error: `Ya existe "${mismoNombre.name}"`, existing: mismoNombre }, { status: 409 })
    }
    const conTelefono = telefono ? clienteConTelefono(todos ?? [], telefono) : undefined
    if (conTelefono) {
        return NextResponse.json({ error: `Ya existe ${conTelefono.name} con ese número`, existing: conTelefono }, { status: 409 })
    }

    const { data: customer, error } = await supabase
        .from('customers')
        .insert({ store_id: store.id, name: nombre, phone: telefono })
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
