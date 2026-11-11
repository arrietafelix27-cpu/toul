import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { explainError } from '@/lib/errors'

/**
 * POST /api/purchases
 *
 * Thin wrapper around the `process_purchase` PostgreSQL RPC.
 * Purchase record, items, CPP recalculation, inventory entry, provider debt
 * and payment movements run inside a single PostgreSQL transaction.
 * If any step fails, nothing is saved.
 *
 * Requires: `supabase/rpc/process_purchase.sql` deployed to the database.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Tu sesión se venció. Vuelve a entrar.' }, { status: 401 })

    let payload: unknown
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: 'No se recibieron los datos de la compra. Intenta de nuevo.' }, { status: 400 })
    }

    if (!payload || typeof payload !== 'object') {
        return NextResponse.json({ error: 'No se recibieron los datos de la compra. Intenta de nuevo.' }, { status: 400 })
    }

    const body = payload as Record<string, unknown>
    if (!Array.isArray(body.items) || body.items.length === 0) {
        return NextResponse.json({ error: 'La compra debe tener al menos un producto' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('process_purchase', { payload: body })

    if (error) {
        // P0001 = RAISE EXCEPTION from the RPC (validation) → 400; anything else → 500.
        // explainError deja pasar las reglas de TOUL (ya en español) y traduce el resto
        const isValidation = error.code === 'P0001'
        const message = explainError(error, 'No se pudo registrar la compra. Intenta de nuevo.')
        return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
    }

    if (!data || typeof data !== 'object' || !(data as { success?: boolean }).success) {
        return NextResponse.json({ error: 'Respuesta inválida del servidor' }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        purchaseId: (data as { purchaseId: string }).purchaseId,
    })
}
