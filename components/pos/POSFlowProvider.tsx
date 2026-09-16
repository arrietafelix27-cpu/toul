'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { usePOSData, type POSDataState } from '@/lib/pos/usePOSData'
import { usePOSCart, type POSCartState } from '@/lib/pos/usePOSCart'
import { usePOSPayment, type POSPaymentState } from '@/lib/pos/usePOSPayment'

// ─── Context Shape ────────────────────────────────────────────
interface POSFlowContextType {
    data: POSDataState
    cart: POSCartState
    payment: POSPaymentState
}

const POSFlowContext = createContext<POSFlowContextType | null>(null)

// ─── Provider ─────────────────────────────────────────────────
export function POSFlowProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
    const data = usePOSData(enabled)
    const cart = usePOSCart(data.products, data.variantsByProduct, data.combos)
    const payment = usePOSPayment(cart.subtotal, cart.isEmpty, data.methods)

    const value = useMemo(() => ({ data, cart, payment }), [data, cart, payment])

    return (
        <POSFlowContext.Provider value={value}>
            {children}
        </POSFlowContext.Provider>
    )
}

// ─── Consumer Hook ────────────────────────────────────────────
export function usePOSFlow(): POSFlowContextType {
    const ctx = useContext(POSFlowContext)
    if (!ctx) throw new Error('usePOSFlow must be used inside <POSFlowProvider>')
    return ctx
}
