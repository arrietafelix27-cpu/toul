import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Abono de un cliente.
 *
 * Todo pasa en una sola transacción (toul_registrar_abono): el movimiento
 * del cliente, la entrada a la caja por el método que eligió y su deuda.
 * Antes eran tres escrituras sueltas y si una fallaba quedaba descuadrado.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { customerId, amount, methodId, notes } = await request.json().catch(() => ({}))

    if (!customerId || !amount || Number(amount) <= 0) {
        return NextResponse.json({ error: 'Escribe cuánto te abonó' }, { status: 400 })
    }
    if (!methodId) {
        return NextResponse.json({ error: 'Elige por dónde te pagó' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('toul_registrar_abono', {
        p_customer_id: customerId,
        p_amount: Math.round(Number(amount)),
        p_method_id: methodId,
        p_notes: notes ?? null,
    })

    if (error) {
        console.error('Customer Payment Error:', error)
        // Los mensajes de la base ya vienen en español y para el usuario
        return NextResponse.json({ error: error.message || 'No se pudo registrar el abono' }, { status: 400 })
    }

    return NextResponse.json(data)
}
