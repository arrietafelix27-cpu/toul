import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { formatCOP } from '@/lib/utils'
import { notifyAdmins } from '@/lib/isla/push'

/**
 * POST /api/approvals
 *
 * Crea una solicitud de aprobación (anular venta o vender a crédito) vía el RPC
 * `toul_request_approval` y avisa por notificación push a los administradores.
 *
 * Body: { type: 'void_sale' | 'credit_sale', saleId?, amount?, reason?, details? }
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: Record<string, unknown>
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const type = body.type
    if (type !== 'void_sale' && type !== 'credit_sale') {
        return NextResponse.json({ error: 'Tipo de solicitud inválido' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('toul_request_approval', {
        p_type: type,
        p_sale_id: (body.saleId as string) || null,
        p_amount: typeof body.amount === 'number' ? Math.round(body.amount) : null,
        p_reason: (body.reason as string) || null,
        p_details: (body.details as object) || {},
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: error.code === 'P0001' ? 400 : 500 })
    }

    const requestId = (data as { id: string }).id

    const { data: created } = await supabase
        .from('approval_requests')
        .select('requested_by_name, amount, details')
        .eq('id', requestId)
        .single()

    const who = created?.requested_by_name || 'Un vendedor'
    const amount = formatCOP(Number(created?.amount) || 0)
    const customer = (created?.details as { customerName?: string } | null)?.customerName

    const sent = await notifyAdmins(supabase, requestId, type === 'void_sale'
        ? { title: 'Solicitud de anulación', body: `${who} quiere anular una venta de ${amount}`, url: '/aprobaciones', tag: requestId }
        : { title: 'Solicitud de crédito', body: `${who} quiere fiar ${amount}${customer ? ` a ${customer}` : ''}`, url: '/aprobaciones', tag: requestId }
    )

    return NextResponse.json({ id: requestId, notified: sent })
}
