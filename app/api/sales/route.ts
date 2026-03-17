import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
    if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

    const body = await request.json()
    const {
        cart,
        payments,      // PaymentSplit[]
        discount,
        subtotal,
        total,
        isCredit,
        customerName,
        customerPhone,
        initialPayment,
        notes,
    } = body

    try {
        // 1. Resolve or create customer STRICTLY
        let customerId: string | null = body.customerId || null

        // If no ID was provided but a name was typed, we create a new customer
        if (!customerId && customerName?.trim()) {
            const { data: newCustomer, error: custErr } = await supabase
                .from('customers')
                .insert({
                    store_id: store.id,
                    name: customerName.trim(),
                    phone: customerPhone?.trim() || null,
                    total_debt: 0,
                })
                .select('id')
                .single()

            if (custErr) throw new Error('Error creando nuevo cliente: ' + custErr.message)
            customerId = newCustomer.id
        }

        // 2. Resolve Primary Method
        let primaryMethod = 'efectivo'
        if (payments && payments.length > 0) {
            const sorted = [...payments].sort((a: any, b: any) => b.amount - a.amount)
            primaryMethod = sorted[0]?.methodName?.toLowerCase() || 'efectivo'
        }

        // 3. Create Sale Record
        const { data: sale, error: saleErr } = await supabase
            .from('sales')
            .insert({
                store_id: store.id,
                customer_id: customerId,
                customer_name: customerName?.trim() || null,
                customer_phone: customerPhone?.trim() || null,
                subtotal,
                discount: discount || 0,
                total,
                payment_method: primaryMethod,
                is_credit: !!isCredit,
                initial_payment: initialPayment || 0,
                notes: notes || null,
            })
            .select()
            .single()

        if (saleErr || !sale) throw saleErr

        // 4. Create Sale Items + Decrement Stock (Safe)
        for (const item of cart) {
            // Fetch fresh stock and CPP
            const { data: product, error: pErr } = await supabase
                .from('products')
                .select('id, stock, cpp, sale_price')
                .eq('id', item.product.id)
                .single()

            if (pErr || !product) throw new Error(`Producto no encontrado: ${item.product.name}`)
            if (product.stock < item.quantity) throw new Error(`Stock insuficiente para ${item.product.name}. Disponible: ${product.stock}`)

            await supabase.from('sale_items').insert({
                store_id: store.id,
                sale_id: sale.id,
                product_id: product.id,
                quantity: item.quantity,
                unit_price: product.sale_price,
                unit_cost: product.cpp,
                subtotal: product.sale_price * item.quantity,
            })

            // Decrement Stock
            const { error: stockErr } = await supabase
                .from('products')
                .update({
                    stock: product.stock - item.quantity,
                    updated_at: new Date().toISOString()
                })
                .eq('id', product.id)

            if (stockErr) throw stockErr
        }

        // 5. Create sale_payments rows + register cash movements
        for (const pay of (payments || [])) {
            if (!pay.amount || pay.amount <= 0) continue

            // Record split payment
            await supabase.from('sale_payments').insert({
                sale_id: sale.id,
                store_id: store.id,
                method_id: pay.methodId,
                amount: pay.amount,
            })

            // Record movement in the ledger (payments table)
            // For credit: only record what was paid NOW (initialPayment). 
            // In split payments, we assume the provided payments ARRAY is the actual money received.
            await supabase.from('payments').insert({
                store_id: store.id,
                type: 'sale',
                method: pay.methodName,
                amount: pay.amount,
                reference_id: sale.id,
                notes: `Venta${customerName ? ` - ${customerName}` : ''} #${sale.id.slice(0, 8)}`,
            })
        }

        // 6. Handle Credit / Customer Debt
        if (isCredit && customerId) {
            const paidNow = payments?.reduce((sum: number, p: any) => sum + p.amount, 0) || 0
            const debtAmount = Math.max(0, total - paidNow)

            if (debtAmount > 0) {
                // Record Debt strictly in 'credits'
                await supabase.from('credits').insert({
                    store_id: store.id,
                    customer_id: customerId,
                    sale_id: sale.id,
                    type: 'debt',
                    amount: debtAmount,
                    notes: `Deuda - Venta #${sale.id.slice(0, 8)}${body.dueDate ? ` - Vence: ${body.dueDate}` : ''}`,
                })

                // Increment customer.total_debt
                const { data: cust } = await supabase
                    .from('customers')
                    .select('total_debt')
                    .eq('id', customerId)
                    .single()

                await supabase
                    .from('customers')
                    .update({ total_debt: (cust?.total_debt || 0) + debtAmount })
                    .eq('id', customerId)
            }
        }

        return NextResponse.json({ success: true, saleId: sale.id })
    } catch (error: any) {
        console.error('Sale error:', error)
        return NextResponse.json({ error: error?.message || 'Error al registrar la venta' }, { status: 500 })
    }
}
