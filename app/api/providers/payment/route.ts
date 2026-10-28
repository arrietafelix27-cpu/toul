import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Pago a un proveedor.
 *
 * Todo pasa en una sola transacción (toul_pagar_proveedor): baja lo que
 * falta de sus compras, de la más vieja a la más nueva, anota la salida de
 * caja y deja la copia del proveedor igual a lo que de verdad falta. Antes
 * eran tres escrituras sueltas y si una fallaba quedaba descuadrado.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { providerId, amount, notes } = await request.json().catch(() => ({}))

    if (!providerId || !amount || Number(amount) <= 0) {
        return NextResponse.json({ error: 'Escribe cuánto le pagaste' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('toul_pagar_proveedor', {
        p_provider_id: providerId,
        p_amount: Math.round(Number(amount)),
        p_notes: notes ?? null,
    })

    if (error) {
        console.error('Provider Payment Error:', error)
        // Los mensajes de la base ya vienen en español y para el usuario
        return NextResponse.json({ error: error.message || 'No se pudo registrar el pago' }, { status: 400 })
    }

    return NextResponse.json(data)
}
