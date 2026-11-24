'use client'

import { useState, useCallback, useMemo } from 'react'
import type { Customer, PaymentMethodConfig, PaymentSplit, CartItem } from '@/lib/types'
import { repartir, esEfectivo, vuelto as calcularVuelto, fechaEnDias, fechaPagoValida, type MetodoElegido } from './pagos'

/** Plazo con el que arranca una venta a crédito */
export const PLAZO_INICIAL = 15

// ─── Hook ─────────────────────────────────────────────────────
export interface POSPaymentState {
    // Sale type
    saleType: 'contado' | 'credito'
    setSaleType: (type: 'contado' | 'credito') => void

    // Discount
    discountType: '%' | '$'
    setDiscountType: (type: '%' | '$') => void
    discountValue: string
    discountAmount: number
    setDiscountValue: (val: string) => void
    showDiscount: boolean
    setShowDiscount: (show: boolean) => void

    // Total
    total: number
    /** Lo que se cobra hoy: el total, o el abono si es fiado */
    paymentTarget: number

    // Pago mixto: el primer método es el resto; en los demás se escribe cuánto
    selectedMethodIds: string[]
    paymentSplits: PaymentSplit[]
    toggleMethod: (method: PaymentMethodConfig) => void
    /** El método principal (el que se lleva el resto). Si había un segundo distinto, se queda */
    chooseMethod: (method: PaymentMethodConfig) => void
    /** Dividir pago: el segundo método (null lo quita) */
    setSecondMethod: (method: PaymentMethodConfig | null) => void
    setMethodAmount: (methodId: string, amount: number | null) => void
    /** Lo escrito en los otros métodos (para mostrar el campo tal cual) */
    typedAmounts: Record<string, number | null>
    /** Cuánto se pasa lo escrito del total: si es más de cero no deja cobrar */
    overpaid: number

    // Efectivo recibido y vuelto
    /** Lo que se paga en efectivo */
    cashDue: number
    /** null = pagó exacto */
    cashReceived: number | null
    setCashReceived: (amount: number | null) => void
    change: number

    // Credit fields
    selectedCustomer: Customer | null
    setSelectedCustomer: (c: Customer | null) => void
    customerSearch: string
    setCustomerSearch: (s: string) => void
    /** "AAAA-MM-DD", o vacía = sin fecha. Arranca a 15 días */
    dueDate: string
    setDueDate: (d: string) => void
    /** La fecha de pago sirve (vacía, o de mañana en adelante) */
    dueDateValid: boolean
    /** Abono del fiado: sin abono, la mitad del total u otro valor (el que va en initialPayment) */
    abonoMode: 'sin' | 'mitad' | 'otro'
    setAbonoMode: (m: 'sin' | 'mitad' | 'otro') => void
    initialPayment: string
    setInitialPayment: (v: string) => void

    // Validation
    canConfirm: boolean
    /** Por qué no deja cobrar todavía, en palabras de la caja */
    blockedReason: string | null

    // Submit
    buildSaleBody: (payload: SalePayload) => Record<string, unknown>
    submitSale: (payload: SalePayload) => Promise<SubmitResult>

    // Reset
    resetPayment: () => void
}

export interface SubmitResult {
    success: boolean
    saleId?: string
    networkError?: boolean
    /** Por qué TOUL rechazó la venta (sin stock, un precio que cambió…) */
    error?: string
    /** Vuelto que calculó TOUL */
    change?: number | null
}

export interface SalePayload {
    cartItems: CartItem[]
    subtotal: number
    /** Modo isla: aprobación del administrador (fiado o descuento de un vendedor) */
    approvalId?: string | null
    /** Turno de caja en el que se hace la venta */
    cashSessionId?: string | null
    /** Identificador propio de la venta: evita duplicados al reintentar el envío */
    clientSaleId?: string
    /** Hora real de la venta (importante para ventas hechas sin internet) */
    soldAt?: string
}

export function usePOSPayment(
    subtotal: number,
    cartIsEmpty: boolean,
    methods: PaymentMethodConfig[],
): POSPaymentState {
    // Sale type
    const [saleType, setTipo] = useState<'contado' | 'credito'>('contado')

    // Discount
    const [discountType, setDiscountType] = useState<'%' | '$'>('$')
    const [discountValue, setDiscountValue] = useState('')
    const [showDiscount, setShowDiscount] = useState(false)

    const discountAmount = useMemo(() => {
        const val = Number(discountValue) || 0
        if (val <= 0) return 0
        if (discountType === '$') return Math.round(Math.min(val, subtotal))
        return Math.round(Math.min(subtotal * (val / 100), subtotal))
    }, [discountValue, discountType, subtotal])

    const total = Math.round(Math.max(0, subtotal - discountAmount))

    // Credit fields
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [customerSearch, setCustomerSearch] = useState('')
    // null = nadie la ha tocado: el plazo de siempre (15 días desde hoy)
    const [fechaElegida, setDueDate] = useState<string | null>(null)
    const dueDate = fechaElegida ?? fechaEnDias(PLAZO_INICIAL)
    const dueDateValid = fechaPagoValida(dueDate)
    const [initialPayment, setInitialPayment] = useState('')
    const [abonoMode, setAbonoMode] = useState<'sin' | 'mitad' | 'otro'>('sin')

    // Lo que se cobra hoy: de contado el total, fiado el abono.
    // "La mitad" sigue al total si cambia el descuento o el carrito
    const isCredit = saleType === 'credito'
    const abono = abonoMode === 'mitad' ? total / 2 : abonoMode === 'otro' ? Math.min(Number(initialPayment) || 0, total) : 0
    const paymentTarget = Math.round(isCredit ? abono : total)

    // ── Métodos elegidos ──────────────────────────────────────────
    // Ningún método viene elegido: la persona siempre dice cómo le pagaron
    const [chosen, setChosen] = useState<MetodoElegido[]>([])
    const elegidos = useMemo<MetodoElegido[]>(
        () => chosen.filter(c => methods.some(m => m.id === c.methodId)),
        [chosen, methods]
    )

    const reparto = useMemo(() => repartir(elegidos, paymentTarget), [elegidos, paymentTarget])
    const paymentSplits = reparto.splits
    const overpaid = reparto.exceso

    const selectedMethodIds = useMemo(() => elegidos.map(e => e.methodId), [elegidos])
    const typedAmounts = useMemo(
        () => Object.fromEntries(elegidos.slice(1).map(e => [e.methodId, e.escrito])) as Record<string, number | null>,
        [elegidos]
    )

    const toggleMethod = useCallback((method: PaymentMethodConfig) => {
        setChosen(() => {
            const actual = elegidos
            if (actual.some(e => e.methodId === method.id)) {
                const quedan = actual.filter(e => e.methodId !== method.id)
                // El que queda de primero pasa a ser el resto
                return quedan.map((e, i) => i === 0 ? { ...e, escrito: null } : e)
            }
            return [...actual, { methodId: method.id, methodName: method.name, methodColor: method.color, escrito: null }]
        })
    }, [elegidos])

    const chooseMethod = useCallback((method: PaymentMethodConfig) => {
        setChosen(() => [
            { methodId: method.id, methodName: method.name, methodColor: method.color, escrito: null },
            ...elegidos.slice(1, 2).filter(e => e.methodId !== method.id),
        ])
    }, [elegidos])

    const setSecondMethod = useCallback((method: PaymentMethodConfig | null) => {
        setChosen(() => {
            const [primero, segundo] = elegidos
            if (!primero) return elegidos
            if (!method || method.id === primero.methodId) return [primero]
            return [primero, { methodId: method.id, methodName: method.name, methodColor: method.color, escrito: segundo?.escrito ?? null }]
        })
    }, [elegidos])

    const setMethodAmount = useCallback((methodId: string, amount: number | null) => {
        setChosen(() => elegidos.map(e => e.methodId === methodId ? { ...e, escrito: amount } : e))
    }, [elegidos])

    // ── Efectivo recibido y vuelto ────────────────────────────────
    const [cashReceived, setCashReceived] = useState<number | null>(null)

    // Contado y abono se pagan aparte: al cambiar el tipo de venta no
    // queda ningún método ni monto recibido elegido de antes
    const setSaleType = useCallback((tipo: 'contado' | 'credito') => {
        if (tipo === saleType) return
        setTipo(tipo)
        setChosen([])
        setCashReceived(null)
    }, [saleType])
    const cashDue = useMemo(() => paymentSplits.reduce((sum, s) => {
        const m = methods.find(x => x.id === s.methodId)
        return m && esEfectivo(m) ? sum + s.amount : sum
    }, 0), [paymentSplits, methods])
    const change = cashReceived === null ? 0 : calcularVuelto(cashReceived, cashDue)
    const shortCash = cashDue > 0 && cashReceived !== null && cashReceived < cashDue

    // ── Validación ────────────────────────────────────────────────
    // El cliente es solo el que se eligió de la lista (o se creó): nunca un nombre escrito a medias
    const hasCustomer = !!selectedCustomer
    const blockedReason = useMemo(() => {
        if (cartIsEmpty) return 'Agrega productos a la venta'
        // Con el descuento cubriendo todo no hay nada que deber
        if (isCredit && Math.round(total) <= 0) return 'Una venta sin cobro no puede ser a crédito'
        if (isCredit && !hasCustomer) return 'Selecciona un cliente'
        if (isCredit && !dueDateValid) return 'Selecciona la fecha de pago'
        if (paymentTarget > 0 && paymentSplits.length === 0) return 'Selecciona el método de pago'
        if (overpaid > 0) return 'Revisa los montos del pago'
        if (shortCash) return 'Monto recibido insuficiente'
        return null
    }, [cartIsEmpty, isCredit, total, hasCustomer, dueDateValid, paymentTarget, paymentSplits.length, overpaid, shortCash])
    const canConfirm = blockedReason === null

    // Armar el cuerpo de la venta (se usa también para guardarla sin internet)
    const buildSaleBody = useCallback((payload: SalePayload): Record<string, unknown> => ({
        cart: payload.cartItems,
        payments: paymentTarget > 0 ? paymentSplits.filter(s => s.amount > 0) : [],
        discount: discountAmount,
        subtotal: payload.subtotal,
        total,
        isCredit,
        customerId: selectedCustomer?.id || null,
        customerName: selectedCustomer?.name ?? null,
        customerPhone: selectedCustomer?.phone || null,
        dueDate: isCredit ? dueDate : null,
        initialPayment: paymentTarget,
        // Sin dato el servidor lo toma como exacto
        cashReceived: cashDue > 0 ? cashReceived : null,
        notes: null,
        approvalId: payload.approvalId ?? null,
        cashSessionId: payload.cashSessionId ?? null,
        clientSaleId: payload.clientSaleId ?? null,
        soldAt: payload.soldAt ?? new Date().toISOString(),
    }), [paymentTarget, paymentSplits, discountAmount, total, isCredit, selectedCustomer, dueDate, cashDue, cashReceived])

    // Submit
    const submitSale = useCallback(async (payload: SalePayload): Promise<SubmitResult> => {
        const body = buildSaleBody(payload)
        try {
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
            return { success: true, saleId: result.saleId, change: typeof result.change === 'number' ? result.change : null }
        } catch (err: unknown) {
            // Falla de red (sin internet): quien llama decide si la guarda para enviarla después
            if (err instanceof TypeError) return { success: false, networkError: true }
            const message = err instanceof Error ? err.message : 'Error desconocido'
            return { success: false, error: message }
        }
    }, [buildSaleBody])

    // Reset
    const resetPayment = useCallback(() => {
        setTipo('contado')
        setDiscountType('$')
        setDiscountValue('')
        setShowDiscount(false)
        setChosen([])
        setCashReceived(null)
        setSelectedCustomer(null)
        setCustomerSearch('')
        setDueDate(null)
        setInitialPayment('')
        setAbonoMode('sin')
    }, [])

    return useMemo(() => ({
        saleType, setSaleType,
        discountType, setDiscountType, discountValue, discountAmount, setDiscountValue,
        showDiscount, setShowDiscount,
        total, paymentTarget,
        selectedMethodIds, paymentSplits, toggleMethod, chooseMethod, setSecondMethod, setMethodAmount, typedAmounts, overpaid,
        cashDue, cashReceived, setCashReceived, change,
        selectedCustomer, setSelectedCustomer, customerSearch, setCustomerSearch,
        dueDate, setDueDate, dueDateValid, abonoMode, setAbonoMode, initialPayment, setInitialPayment,
        canConfirm, blockedReason,
        buildSaleBody,
        submitSale,
        resetPayment,
    }), [
        saleType, setSaleType,
        discountType, discountValue, discountAmount,
        showDiscount,
        total, paymentTarget,
        selectedMethodIds, paymentSplits, toggleMethod, chooseMethod, setSecondMethod, setMethodAmount, typedAmounts, overpaid,
        cashDue, cashReceived, change,
        selectedCustomer, customerSearch,
        dueDate, dueDateValid, abonoMode, initialPayment,
        canConfirm, blockedReason,
        buildSaleBody,
        submitSale,
        resetPayment,
    ])
}
