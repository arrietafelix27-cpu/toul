import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { category, description, amount, method, isCapital } = await request.json()

        if (!amount || amount <= 0) {
            return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
        }

        // 1. Get Store
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .eq('owner_id', user.id)
            .single()

        if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

        const storeId = store.id

        // 2. Register Expense
        const { data: expense, error: expError } = await supabase.from('expenses').insert({
            store_id: storeId,
            category,
            description: description || null,
            amount,
            payment_method: method
        }).select().single()

        if (expError) throw expError

        // 3. Register Movement
        if (isCapital || method === 'capital') {
            await supabase.from('owner_capital_injections').insert({
                store_id: storeId,
                amount: amount,
                reference_type: 'expense',
                reference_id: expense.id,
                notes: `Gasto: ${description || category} (Capital Propio)`
            })
        } else {
            // General payment record
            // Note: If 'method' is the name of a specific wallet, ensure balance validation if needed?
            // For expenses, we'll keep it simple but record it.
            await supabase.from('payments').insert({
                store_id: storeId,
                type: 'expense',
                method: method,
                amount: amount,
                reference_id: expense.id,
                notes: `Gasto: ${description || category}`
            })
        }

        return NextResponse.json({ success: true, expenseId: expense.id })

    } catch (error: any) {
        console.error('Expense Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno al registrar el gasto' }, { status: 500 })
    }
}
