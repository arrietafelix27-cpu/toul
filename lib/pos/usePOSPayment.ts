'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Customer, PaymentMethodConfig, PaymentSplit, CartItem } from '@/lib/types'
import toast from 'react-hot-toast'

// ─── Hook ─────────────────────────────────────────────────────
export interface POSPaymentState {
    // Sale type
    saleType: 'contado' | 'credito'
    setSaleType: (type: 'contado' | 'credito') => void

    // Discount
    discountType: '%' | '$'
    discountValue: string
    discountAmount: number
    toggleDiscountType: () => void
    setDiscountValue: (val: string) => void
    showDiscount: boolean
    setShowDiscount: (show: boolean) => void

    // Total
    total: number

    // Payment methods selection
    selectedMethodIds: string[]
    paymentSplits: PaymentSplit[]
    toggleMethod: (method: PaymentMethodConfig) => void
    setMethodAmount: (methodId: string, amount: number) => void
    balanced: boolean
    remaining: number

    // Credit fields
    selectedCustomer: Customer | null
    setSelectedCustomer: (c: Customer | null) => void
    customerSearch: string
    setCustomerSearch: (s: string) => void
    dueDate: string
    setDueDate: (d: string) => void
    initialPayment: string
    setInitialPayment: (v: string) => void

    // Validation
    canConfirm: boolean

    // Submit
    submitSale: (payload: SalePayload) => Promise<{ success: boolean; saleId?: string }>

    // Reset
    resetPayment: () => void
}

export interface SalePayload {
    cartItems: CartItem[]
    subtotal: number
}

export function usePOSPayment(
    subtotal: number,
    cartIsEmpty: boolean,
    methods: PaymentMethodConfig[],
): POSPaymentState {
    // Sale type
    const [saleType, setSaleType] = useState<'contado' | 'credito'>('contado')

    // Discount
    const [discountType, setDiscountType] = useState<'%' | '$'>('$')
    const [discountValue, setDiscountValue] = useState('')
    const [showDiscount, setShowDiscount] = useState(false)

    const toggleDiscountType = useCallback(() => {
        setDiscountType(prev => prev === '$' ? '%' : '$')
    }, [])

    const discountAmount = useMemo(() => {
        const val = Number(discountValue) || 0
        if (val <= 0) return 0
        if (discountType === '$') return Math.round(Math.min(val, subtotal))
        return Math.round(Math.min(subtotal * (val / 100), subtotal))
    }, [discountValue, discountType, subtotal])

    const total = Math.round(Math.max(0, subtotal - discountAmount))

    // Credit fields — declared early so paymentTarget is available for toggleMethod
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [customerSearch, setCustomerSearch] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [initialPayment, setInitialPayment] = useState('')

    // Computed: payment target (for contado = total, for credito = initialPayment/abono)
    const isCredit = saleType === 'credito'
    const paymentTarget = Math.round(isCredit ? (Number(initialPayment) || 0) : total)

    // Ref to avoid stale closure in toggleMethod — tracks paymentTarget, NOT total
    const targetRef = useRef(paymentTarget)
    targetRef.current = paymentTarget

    // Payment splits
    const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([])

    const selectedMethodIds = useMemo(
        () => paymentSplits.map(p => p.methodId),
        [paymentSplits]
    )

    const toggleMethod = useCallback((method: PaymentMethodConfig) => {
        setPaymentSplits(prev => {
            const currentTarget = targetRef.current
            const exists = prev.find(p => p.methodId === method.id)
            if (exists) {
                const filtered = prev.filter(p => p.methodId !== method.id)
                // Re-distribute among remaining methods
                if (filtered.length > 0) {
                    const perMethod = Math.floor(currentTarget / filtered.length)
                    const remainder = currentTarget - perMethod * filtered.length
                    return filtered.map((p, i) => ({
                        ...p,
                        amount: perMethod + (i === 0 ? remainder : 0),
                    }))
                }
                return filtered
            }
            // Add new method
            const next = [...prev, {
                methodId: method.id,
                methodName: method.name,
                methodColor: method.color,
                amount: 0,
            }]
            // Auto-divide equally using the correct target
            const perMethod = Math.floor(currentTarget / next.length)
            const remainder = currentTarget - perMethod * next.length
            return next.map((p, i) => ({
                ...p,
                amount: perMethod + (i === 0 ? remainder : 0),
            }))
        })
    }, [])

    const setMethodAmount = useCallback((methodId: string, amount: number) => {
        setPaymentSplits(prev =>
            prev.map(p => p.methodId === methodId ? { ...p, amount } : p)
        )
    }, [])

    // Auto-redistribute splits when paymentTarget changes
    // (e.g. user types abono, switches contado/credito, or changes discount)
    useEffect(() => {
        setPaymentSplits(prev => {
            if (prev.length === 0) return prev
            const perMethod = Math.floor(paymentTarget / prev.length)
            const remainder = paymentTarget - perMethod * prev.length
            return prev.map((p, i) => ({
                ...p,
                amount: perMethod + (i === 0 ? remainder : 0),
            }))
        })
    }, [paymentTarget])

    const paymentsTotal = paymentSplits.reduce((sum, p) => sum + (p.amount || 0), 0)
    const remaining = paymentTarget - paymentsTotal
    const balanced = paymentTarget === 0 || Math.abs(remaining) < 1

    // Validation
    const canConfirm = useMemo(() => {
        if (cartIsEmpty) return false

        if (isCredit) {
            const hasCustomer = !!selectedCustomer || !!customerSearch.trim()
            if (!hasCustomer) return false
            if (!dueDate) return false
            // If there's an initial payment, splits must match
            if (Number(initialPayment) > 0 && !balanced) return false
            if (Number(initialPayment) > 0 && paymentSplits.length === 0) return false
        } else {
            // Contado: must have at least one payment method and be balanced
            if (paymentSplits.length === 0) return false
            if (!balanced) return false
        }

        return true
    }, [cartIsEmpty, isCredit, selectedCustomer, customerSearch, dueDate, initialPayment, balanced, paymentSplits])

    // Submit
    const submitSale = useCallback(async (payload: SalePayload): Promise<{ success: boolean; saleId?: string }> => {
        try {
            const body = {
                cart: payload.cartItems,
                payments: paymentTarget > 0 ? paymentSplits : [],
                discount: discountAmount,
                subtotal: payload.subtotal,
                total,
                isCredit,
                customerId: selectedCustomer?.id || null,
                customerName: selectedCustomer ? selectedCustomer.name : (customerSearch.trim() || null),
                customerPhone: selectedCustomer?.phone || null,
                dueDate: isCredit ? dueDate : null,
                initialPayment: paymentTarget,
                notes: null,
            }

            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || 'Error al registrar la venta')
            }

            const result = await res.json()
            return { success: true, saleId: result.saleId }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error desconocido'
            toast.error(message)
            return { success: false }
        }
    }, [paymentTarget, paymentSplits, discountAmount, total, isCredit, selectedCustomer, customerSearch, dueDate])

    // Reset
    const resetPayment = useCallback(() => {
        setSaleType('contado')
        setDiscountType('$')
        setDiscountValue('')
        setShowDiscount(false)
        setPaymentSplits([])
        setSelectedCustomer(null)
        setCustomerSearch('')
        setDueDate('')
        setInitialPayment('')
    }, [])

    return useMemo(() => ({
        saleType, setSaleType,
        discountType, discountValue, discountAmount, toggleDiscountType, setDiscountValue,
        showDiscount, setShowDiscount,
        total,
        selectedMethodIds, paymentSplits, toggleMethod, setMethodAmount, balanced, remaining,
        selectedCustomer, setSelectedCustomer, customerSearch, setCustomerSearch,
        dueDate, setDueDate, initialPayment, setInitialPayment,
        canConfirm,
        submitSale,
        resetPayment,
    }), [
        saleType, setSaleType,
        discountType, discountValue, discountAmount, toggleDiscountType, setDiscountValue,
        showDiscount, setShowDiscount,
        total,
        selectedMethodIds, paymentSplits, toggleMethod, setMethodAmount, balanced, remaining,
        selectedCustomer, setSelectedCustomer, customerSearch, setCustomerSearch,
        dueDate, setDueDate, initialPayment, setInitialPayment,
        canConfirm,
        submitSale,
        resetPayment,
    ])
}
