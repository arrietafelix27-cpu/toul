import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Anotar un gasto.
 *
 * Todo pasa en una sola transacción (toul_registrar_gasto): el gasto y su
 * salida de la plata se guardan juntos o no se guarda nada. Antes eran dos
 * escrituras sueltas y si la segunda fallaba el gasto quedaba sin salir.
 * La base revisa quién puede: el administrador, o el vendedor con el
 * permiso "Registrar gastos" (con una cuenta y nunca con "Plata mía").
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { category, description, amount, methodId, plataMia } = await request.json().catch(() => ({}))

    if (!amount || Number(amount) <= 0) {
        return NextResponse.json({ error: 'Escribe cuánto gastaste' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('toul_registrar_gasto', {
        p_categoria: category ?? null,
        p_monto: Math.round(Number(amount)),
        p_descripcion: description || null,
        p_method_id: methodId || null,
        p_plata_mia: plataMia === true,
    })

    if (error) {
        console.error('Expense Error:', error)
        // Los mensajes de la base ya vienen en español y para el usuario
        return NextResponse.json({ error: error.message || 'No se pudo guardar el gasto' }, { status: 400 })
    }

    return NextResponse.json({ success: true, expenseId: (data as { expenseId: string }).expenseId })
}
