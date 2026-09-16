import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/sales
 *
 * Thin wrapper around the `process_sale` PostgreSQL RPC.
 * All business logic (customer creation, sale items, inventory adjustments,
 * payment splits, credit handling) runs inside a single PostgreSQL transaction.
 * If any step fails, the entire transaction rolls back — no orphan rows,
 * no half-applied stock, no broken debt.
 *
 * Requires: `supabase/rpc/process_sale.sql` deployed to the database.
 * Optional (improves combo history): `supabase/migration_v9.sql` (sale_items.combo_id).
 *
 * The backup of the previous monolithic implementation lives at
 * `app/api/sales/route.legacy.ts.bak` for reference / rollback.
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let payload: unknown
    try {
        payload = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    if (!payload || typeof payload !== 'object') {
        return NextResponse.json({ error: 'Payload required' }, { status: 400 })
    }

    const body = payload as Record<string, unknown>
    if (!Array.isArray(body.cart) || body.cart.length === 0) {
        return NextResponse.json({ error: 'Cart vacío' }, { status: 400 })
    }
    if (typeof body.total !== 'number' && typeof body.total !== 'string') {
        return NextResponse.json({ error: 'Total inválido' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('process_sale', { payload: body })

    if (error) {
        // Surface friendly error from RAISE EXCEPTION inside the RPC
        const message = error.message || 'Error al registrar la venta'
        // Status 409 for stock conflicts, 500 otherwise
        const isStockError = /stock insuficiente/i.test(message)
        return NextResponse.json({ error: message }, { status: isStockError ? 409 : 500 })
    }

    if (!data || typeof data !== 'object' || !(data as { success?: boolean }).success) {
        return NextResponse.json({ error: 'Respuesta inválida del servidor' }, { status: 500 })
    }

    return NextResponse.json({
        success: true,
        saleId: (data as { saleId: string }).saleId,
    })
}
