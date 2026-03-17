import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * atomic purchase API
 * Handles:
 * 1. Stock addition (Atomic-ish)
 * 2. CPP recalulation
 * 3. Wallet balance validation (Multi-payment)
 * 4. Provider debt management
 * 5. Owner capital injections
 * 6. Audit logs (purchase_items, purchase_payments, payments)
 */
export async function POST(request: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const body = await request.json()
        const {
            providerId,
            subtotal,
            total,
            isCredit,
            dueDate,
            payments, // Array of { methodId, methodName, amount, isCapital }
            items // Array of { productId, quantity, unitCost }
        } = body

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'La compra debe tener al menos un producto' }, { status: 400 })
        }

        // 1. Get Store
        const { data: store } = await supabase
            .from('stores')
            .select('id')
            .eq('owner_id', user.id)
            .single()

        if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

        const storeId = store.id

        // 2. Validate Wallet Balances (for non-capital, non-credit payments)
        for (const payment of payments) {
            if (!payment.isCapital && payment.methodName) {
                // Calculate balance for this specific wallet
                const { data: payHistory } = await supabase
                    .from('payments')
                    .select('type, amount')
                    .eq('store_id', storeId)
                    .eq('method', payment.methodName)

                let balance = 0
                for (const p of (payHistory || [])) {
                    const isOut = p.type === 'transfer_out' || p.type === 'expense' || p.type === 'purchase' || p.type === 'provider_payment'
                    balance += isOut ? -p.amount : p.amount
                }

                if (balance < payment.amount) {
                    return NextResponse.json({
                        error: `Saldo insuficiente en "${payment.methodName}". Disponible: ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(balance)}`
                    }, { status: 400 })
                }
            }
        }

        // 3. Create Main Purchase Record
        const { data: purchase, error: purchaseError } = await supabase
            .from('purchases')
            .insert({
                store_id: storeId,
                provider_id: providerId || null,
                subtotal,
                total,
                payment_method: isCredit ? 'credit' : (payments[0]?.isCapital ? 'capital' : 'cash'),
                is_credit: !!isCredit,
                status: 'completed'
            })
            .select()
            .single()

        if (purchaseError) throw purchaseError

        // 4. Process Items (Audit, Stock, CPP)
        for (const item of items) {
            // A. Audit record
            await supabase.from('purchase_items').insert({
                purchase_id: purchase.id,
                product_id: item.productId,
                quantity: item.quantity,
                unit_cost: item.unitCost,
                total_cost: item.quantity * item.unitCost
            })

            // B. Get current product state for CPP calculation
            const { data: product } = await supabase
                .from('products')
                .select('stock, cpp')
                .eq('id', item.productId)
                .single()

            if (product) {
                const currentStock = Number(product.stock) || 0
                const currentCPP = Number(product.cpp) || 0
                const newQty = Number(item.quantity)
                const newCost = Number(item.unitCost)

                // CPP Formula: ((Stock Actual * CPP Actual) + (Cant. Nueva * Costo Uni. Nuevo)) / (Stock Actual + Cant. Nueva)
                // If stock is 0 or less, new CPP is just the new cost
                let nuevoCPP = newCost
                if (currentStock > 0) {
                    nuevoCPP = ((currentStock * currentCPP) + (newQty * newCost)) / (currentStock + newQty)
                }

                // C. Update Stock and CPP
                await supabase.from('products').update({
                    stock: currentStock + newQty,
                    cpp: nuevoCPP,
                    updated_at: new Date().toISOString()
                }).eq('id', item.productId)
            }
        }

        // 5. Handle Payments/Debts
        if (isCredit) {
            // Create Provider Debt
            const totalAbonos = payments.reduce((sum: number, p: any) => sum + p.amount, 0)
            const remainingAmount = total - totalAbonos

            await supabase.from('provider_debts').insert({
                store_id: storeId,
                provider_id: providerId,
                purchase_id: purchase.id,
                amount: total,
                remaining_amount: remainingAmount,
                due_date: dueDate,
                status: remainingAmount <= 0 ? 'paid' : 'pending'
            })

            // Update Provider total_debt
            const { data: provider } = await supabase.from('providers').select('total_debt').eq('id', providerId).single()
            if (provider) {
                await supabase.from('providers').update({
                    total_debt: Number(provider.total_debt || 0) + remainingAmount
                }).eq('id', providerId)
            }
        }

        // Register each payment entry
        for (const payment of payments) {
            if (payment.amount <= 0) continue

            // A. Link to purchase
            await supabase.from('purchase_payments').insert({
                purchase_id: purchase.id,
                amount: payment.amount,
                method_id: payment.isCapital ? null : payment.methodId,
                is_capital: !!payment.isCapital
            })

            // B. Movement records
            if (payment.isCapital) {
                await supabase.from('owner_capital_injections').insert({
                    store_id: storeId,
                    amount: payment.amount,
                    reference_type: 'purchase',
                    reference_id: purchase.id,
                    notes: `Compra de contado (Capital Propio)`
                })
            } else {
                await supabase.from('payments').insert({
                    store_id: storeId,
                    type: 'purchase',
                    method: payment.methodName,
                    amount: payment.amount,
                    reference_id: purchase.id,
                    notes: `Compra de contado`
                })
            }
        }

        return NextResponse.json({ success: true, purchaseId: purchase.id })

    } catch (error: any) {
        console.error('Purchase Implementation Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno al procesar la compra' }, { status: 500 })
    }
}
