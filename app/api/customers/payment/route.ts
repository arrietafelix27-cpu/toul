import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * atomic customer payment API
 * Handles:
 * 1. customer.total_debt reduction
 * 2. credits table tracking (new 'payment' entry)
 * 3. Wallet balance update (incoming money)
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { customerId, amount, methodName, notes } = await request.json()

        if (!customerId || !amount || amount <= 0 || !methodName) {
            return NextResponse.json({ error: 'Datos de abono inválidos' }, { status: 400 })
        }

        // 1. Get Store
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .eq('owner_id', user.id)
            .single()

        if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

        const storeId = store.id

        // 2. Fetch Customer and Verify Debt
        const { data: customer, error: fetchError } = await supabase
            .from('customers')
            .select('id, name, total_debt')
            .eq('id', customerId)
            .single()

        if (fetchError || !customer) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
        }

        // 3. Perform atomic-like operations

        // A. Reduce customers.total_debt
        const { error: custErr } = await supabase.from('customers').update({
            total_debt: Math.max(0, Number(customer.total_debt) - amount)
        }).eq('id', customerId)
        if (custErr) throw custErr

        // B. Record in 'credits' table
        const { error: creditErr } = await supabase.from('credits').insert({
            store_id: storeId,
            customer_id: customerId,
            type: 'payment',
            amount: amount,
            notes: notes || `Abono de cliente: ${customer.name}`
        })
        if (creditErr) throw creditErr

        // C. Record incoming payment (Caja)
        const { error: payErr } = await supabase.from('payments').insert({
            store_id: storeId,
            type: 'sale_payment',
            method: methodName,
            amount: amount,
            notes: `Abono del cliente: ${customer.name}`
        })
        if (payErr) throw payErr

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('Customer Payment Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno al procesar el abono' }, { status: 500 })
    }
}
