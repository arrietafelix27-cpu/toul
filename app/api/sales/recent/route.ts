import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/sales/recent?total=X&secondsAgo=30
 *
 * Used by the POS frontend after a network timeout to determine whether a sale
 * that "failed" actually persisted on the backend. Looks up the most recent sale
 * for the authenticated store matching the given total within the time window.
 *
 * Returns { sale: { id, total, created_at } | null }
 */
export async function GET(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const url = new URL(request.url)
    const totalStr = url.searchParams.get('total')
    const secondsAgoStr = url.searchParams.get('secondsAgo') || '30'

    if (!totalStr) {
        return NextResponse.json({ error: '`total` query param required' }, { status: 400 })
    }

    const total = Math.round(Number(totalStr))
    const secondsAgo = Math.min(300, Math.max(5, Number(secondsAgoStr)))
    const since = new Date(Date.now() - secondsAgo * 1000).toISOString()

    const { data, error } = await supabase
        .from('sales')
        .select('id, total, created_at')
        .eq('store_id', store.id)
        .eq('total', total)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ sale: data && data.length > 0 ? data[0] : null })
}
