import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * atomic provider payment API
 * Handles:
 * 1. provider.total_debt reduction
 * 2. provider_debts.remaining_amount distribution (FIFO: oldest first)
 * 3. Wallet balance validation
 * 4. Movement records (payments or owner_capital_injections)
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { providerId, amount, paymentMethod, walletId, walletName } = await request.json()

        if (!providerId || !amount || amount <= 0) {
            return NextResponse.json({ error: 'Datos de pago inválidos' }, { status: 400 })
        }

        // 1. Get Store
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .eq('owner_id', user.id)
            .single()

        if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

        const storeId = store.id

        // 2. Fetch Provider and Verify Debt
        const { data: provider, error: fetchError } = await supabase
            .from('providers')
            .select('id, name, total_debt')
            .eq('id', providerId)
            .single()

        if (fetchError || !provider) {
            return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 })
        }

        if (Number(provider.total_debt) < amount) {
            return NextResponse.json({ error: 'El monto del abono supera la deuda total' }, { status: 400 })
        }

        // 3. Wallet Balance Validation (if cash)
        if (paymentMethod === 'cash') {
            if (!walletName) return NextResponse.json({ error: 'Nombre de cartera requerido para pago en efectivo' }, { status: 400 })

            const { data: payHistory } = await supabase
                .from('payments')
                .select('type, amount')
                .eq('store_id', storeId)
                .eq('method', walletName)

            let balance = 0
            for (const p of (payHistory || [])) {
                const isOut = p.type === 'transfer_out' || p.type === 'expense' || p.type === 'purchase' || p.type === 'provider_payment'
                balance += isOut ? -p.amount : p.amount
            }

            if (balance < amount) {
                return NextResponse.json({
                    error: `Saldo insuficiente en "${walletName}". Disponible: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(balance)}`
                }, { status: 400 })
            }
        }

        // 4. Perform atomic-like operations

        // A. Reduce providers.total_debt
        await supabase.from('providers').update({
            total_debt: Math.max(0, Number(provider.total_debt) - amount)
        }).eq('id', providerId)

        // B. Distribute abono to provider_debts (FIFO)
        const { data: debts } = await supabase
            .from('provider_debts')
            .select('*')
            .eq('provider_id', providerId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })

        let remainingToPay = amount
        for (const debt of (debts || [])) {
            if (remainingToPay <= 0) break

            const deduction = Math.min(remainingToPay, Number(debt.remaining_amount))
            const newRemaining = Number(debt.remaining_amount) - deduction

            await supabase.from('provider_debts').update({
                remaining_amount: newRemaining,
                status: newRemaining <= 0 ? 'paid' : 'pending'
            }).eq('id', debt.id)

            remainingToPay -= deduction
        }

        // C. Record movement
        if (paymentMethod === 'capital') {
            await supabase.from('owner_capital_injections').insert({
                store_id: storeId,
                amount: amount,
                reference_type: 'provider_payment',
                reference_id: providerId,
                notes: `Abono a proveedor ${provider.name}`
            })
        } else {
            await supabase.from('payments').insert({
                store_id: storeId,
                type: 'provider_payment',
                method: walletName,
                amount: amount,
                reference_id: providerId,
                notes: `Abono a proveedor: ${provider.name}`
            })
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error('Provider Payment Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno al procesar el abono' }, { status: 500 })
    }
}
