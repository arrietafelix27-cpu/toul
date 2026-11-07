'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { usePOSFlow } from '@/components/pos/POSFlowProvider'
import { useCaja } from '@/components/isla/CajaContext'
import { useCreditApproval, type CreditApprovalState } from '@/lib/isla/useCreditApproval'
import { createClient } from '@/lib/supabase/client'
import { loadReceiptData, printReceipt } from '@/lib/isla/receipt'
import { listPendingSales, queueSale, removePendingSale } from '@/lib/isla/offline'
import type { ReceiptData } from '@/lib/isla/types'
import type { CartItem, PaymentSplit } from '@/lib/types'
import { formatCOP } from '@/lib/utils'
import { revisarVenta, type Revision } from './permisos'
import { mensajeComprobante, enlaceWhatsApp, cuandoSeVea } from './comprobante'

/* ══════════════════════════════════════════════════════════════
   Cobrar: enviar la venta (o guardarla sin internet), pedir la
   aprobación que haga falta, el comprobante y deshacer.

   Lo que el vendedor puede hacer solo lo decide el servidor. Aquí
   solo se usa para mostrar el botón correcto y no mandar una venta
   que de todas formas va a rechazar.
   ══════════════════════════════════════════════════════════════ */

/** Foto de la venta recién hecha: la confirmación, la tirilla, WhatsApp y deshacer salen de aquí */
export interface VentaHecha {
    clientSaleId: string
    /** null: quedó guardada en el equipo */
    saleId: string | null
    offline: boolean
    soldAt: string
    items: CartItem[]
    /** El carrito tal cual, para devolverlo si se deshace */
    cartMap: Record<string, number>
    subtotal: number
    discount: number
    total: number
    payments: PaymentSplit[]
    isCredit: boolean
    customerName: string | null
    customerPhone: string | null
    /** Fiado: lo que pagó al llevarse la mercancía y lo que queda */
    abono: number
    debe: number
    cashReceived: number | null
    change: number
    receipt: ReceiptData
}

/** Número propio de la venta (uuid v4). Si se guarda sin internet, entra a
 *  TOUL con este mismo número y la tirilla coincide con la venta. Sin
 *  conexión segura (por ejemplo, la caja abierta por la IP del equipo)
 *  el navegador no trae randomUUID: se arma igual con números al azar. */
function nuevoNumeroDeVenta(): string {
    const c: Crypto = globalThis.crypto
    if (typeof c.randomUUID === 'function') return c.randomUUID()
    const b = c.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = Array.from(b, (x: number) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Una vibración corta en el celular (los computadores la ignoran) */
export function vibrar(patron: number | number[]) {
    try { navigator.vibrate?.(patron) } catch { /* sin soporte */ }
}

const nombreLinea = (i: CartItem) => `${i.product.name}${i.variantName ? ` · ${i.variantName}` : ''}`

export interface BotonCobro {
    texto: string
    accion: 'cobrar' | 'pedir' | 'cancelar' | null
    deshabilitado: boolean
    /** Por qué no deja seguir, en palabras de la caja */
    razon: string | null
    espera: boolean
}

export interface CobroState {
    enviar: () => Promise<void>
    enviando: boolean
    error: string | null
    limpiarError: () => void
    venta: VentaHecha | null
    nuevaVenta: () => void
    /** Qué necesita aprobación del administrador (solo vendedores) */
    necesita: 'fiado' | 'descuento' | null
    revision: Revision
    aprobacion: CreditApprovalState
    boton: BotonCobro
    /** Ejecuta lo que dice el botón */
    accionar: () => void
    deshacer: () => Promise<void>
    deshaciendo: boolean
    imprimir: () => Promise<void>
    imprimiendo: boolean
    compartir: () => void
}

const SIN_REVISION: Revision = { fiado: false, descuento: false, bloqueo: null }

export function useCobro(): CobroState {
    const { data, cart, payment } = usePOSFlow()
    const { ctx, session, autoPrint, isPro, permisos, tienda, offline } = useCaja()
    const { mutate: globalMutate } = useSWRConfig()
    const storeId = ctx.storeId
    const esAdmin = ctx.role === 'admin'
    // El administrador puede vender con el turno de otra persona abierto:
    // esas ventas no entran a ese turno
    const miTurno = session && session.opened_by === ctx.userId ? session.id : null

    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [venta, setVenta] = useState<VentaHecha | null>(null)
    const [imprimiendo, setImprimiendo] = useState(false)
    const [deshaciendo, setDeshaciendo] = useState(false)

    const esFiado = payment.saleType === 'credito'
    const revision = useMemo(() => esAdmin ? SIN_REVISION : revisarVenta({
        permisos, esFiado, subtotal: cart.subtotal, descuento: payment.discountAmount,
    }), [esAdmin, permisos, esFiado, cart.subtotal, payment.discountAmount])
    const necesita = revision.fiado ? 'fiado' : revision.descuento ? 'descuento' : null

    const approvalItems = useMemo(
        () => cart.cartItems.map(i => ({ name: nombreLinea(i), quantity: i.quantity })),
        [cart.cartItems]
    )
    const aprobacion = useCreditApproval({
        enabled: !!necesita && !cart.isEmpty,
        type: revision.fiado ? 'credit_sale' : 'discount_sale',
        total: payment.total,
        subtotal: cart.subtotal,
        discount: payment.discountAmount,
        customerName: payment.selectedCustomer?.name || payment.customerSearch.trim(),
        dueDate: payment.dueDate,
        initialPayment: esFiado ? payment.paymentTarget : 0,
        items: approvalItems,
    })

    // ── Lo que no deja cobrar ─────────────────────────────────────
    const online = offline.online
    const bloqueo = revision.bloqueo
        ?? (!online && esFiado ? 'Sin internet no se puede fiar. Cobra de contado o espera señal.' : null)
        ?? (!online && necesita ? 'Sin internet no se puede pedir aprobación' : null)
        ?? (!esAdmin && permisos.crear_clientes === 'no' && esFiado && !payment.selectedCustomer
            ? 'Elige un cliente que ya exista' : null)
    const razon = bloqueo ?? payment.blockedReason

    const boton = useMemo<BotonCobro>(() => {
        const normal = esFiado ? 'Confirmar venta' : `Cobrar ${formatCOP(payment.total)}`
        if (enviando) return { texto: 'Registrando…', accion: null, deshabilitado: true, razon: null, espera: true }
        if (necesita && aprobacion.status !== 'approved') {
            if (aprobacion.status === 'pending') return { texto: 'Esperando aprobación · Cancelar', accion: 'cancelar', deshabilitado: false, razon: null, espera: true }
            if (aprobacion.status === 'requesting') return { texto: 'Enviando solicitud…', accion: null, deshabilitado: true, razon: null, espera: true }
            return { texto: 'Pedir aprobación', accion: 'pedir', deshabilitado: !!razon, razon, espera: false }
        }
        return { texto: normal, accion: 'cobrar', deshabilitado: !!razon, razon, espera: false }
    }, [esFiado, payment.total, enviando, necesita, aprobacion.status, razon])

    // La tirilla sale con la venta como quedó en el servidor; sin ella,
    // con lo que hay en el equipo
    const datosTirilla = useCallback((saleId: string | null, respaldo: ReceiptData): Promise<ReceiptData> =>
        saleId ? loadReceiptData(createClient(), saleId).catch(() => respaldo) : Promise.resolve(respaldo), [])

    const imprimirServidor = useCallback(async (saleId: string, respaldo: ReceiptData) => {
        setImprimiendo(true)
        try {
            printReceipt(await datosTirilla(saleId, respaldo))
        } finally {
            setImprimiendo(false)
        }
    }, [datosTirilla])

    // La automática: se busca ya y se imprime cuando la pantalla esté lista.
    // Deshacer la cancela si todavía no salió
    const tirillaEnEspera = useRef<{ cancelada: boolean } | null>(null)
    const tirillaAutomatica = useCallback((saleId: string | null, respaldo: ReceiptData) => {
        if (tirillaEnEspera.current) tirillaEnEspera.current.cancelada = true
        const esta = { cancelada: false }
        tirillaEnEspera.current = esta
        setImprimiendo(true)
        void Promise.all([datosTirilla(saleId, respaldo), cuandoSeVea()]).then(([datos]) => {
            if (esta.cancelada) return
            tirillaEnEspera.current = null
            setImprimiendo(false)
            printReceipt(datos)
        })
    }, [datosTirilla])
    const cancelarTirilla = useCallback(() => {
        if (!tirillaEnEspera.current) return
        tirillaEnEspera.current.cancelada = true
        tirillaEnEspera.current = null
        setImprimiendo(false)
    }, [])

    const enviar = useCallback(async () => {
        if (enviando || cart.isEmpty || razon) return
        if (necesita && aprobacion.status !== 'approved') return
        setEnviando(true)
        setError(null)

        const clientSaleId = nuevoNumeroDeVenta()
        const soldAt = new Date().toISOString()
        const payments = payment.paymentTarget > 0 ? payment.paymentSplits.filter(s => s.amount > 0) : []
        const customerName = payment.selectedCustomer?.name || payment.customerSearch.trim() || null
        const abono = esFiado ? payment.paymentTarget : payment.total
        const cashReceived = payment.cashDue > 0 && payment.cashReceived !== null ? payment.cashReceived : null

        const receipt: ReceiptData = {
            saleId: clientSaleId,
            createdAt: soldAt,
            storeName: tienda?.name || ctx.storeName,
            nit: tienda?.nit ?? null,
            address: tienda?.address ?? null,
            phone: tienda?.phone ?? null,
            footer: tienda?.receipt_footer ?? null,
            sellerName: ctx.displayName,
            customerName,
            items: cart.cartItems.map(i => ({ name: nombreLinea(i), quantity: i.quantity, unitPrice: i.unitPrice ?? i.product.sale_price })),
            subtotal: cart.subtotal,
            discount: payment.discountAmount,
            total: payment.total,
            payments: payments.map(p => ({ method: p.methodName, amount: p.amount })),
            isCredit: esFiado,
            initialPayment: esFiado ? abono : undefined,
            cashReceived,
            change: payment.change,
        }

        const foto: Omit<VentaHecha, 'saleId' | 'offline'> = {
            clientSaleId, soldAt,
            items: [...cart.cartItems],
            cartMap: { ...cart.cartMap },
            subtotal: cart.subtotal,
            discount: payment.discountAmount,
            total: payment.total,
            payments,
            isCredit: esFiado,
            customerName,
            customerPhone: payment.selectedCustomer?.phone ?? null,
            abono,
            debe: esFiado ? Math.max(0, payment.total - abono) : 0,
            cashReceived,
            change: payment.change,
            receipt,
        }

        const saleArgs = {
            cartItems: cart.cartItems,
            subtotal: cart.subtotal,
            approvalId: necesita ? aprobacion.requestId : null,
            cashSessionId: miTurno,
            clientSaleId,
            soldAt,
        }

        const terminar = (saleId: string | null, cambio: number | null) => {
            const change = cambio ?? foto.change
            const hecha: VentaHecha = { ...foto, saleId, offline: !saleId, change, receipt: { ...receipt, change } }
            setEnviando(false)
            setVenta(hecha)
            aprobacion.reset()
            payment.rememberMethod()
            vibrar([12, 50, 18])
            if (autoPrint && isPro) tirillaAutomatica(saleId, hecha.receipt)
            cart.clearCart()
            payment.resetPayment()
            globalMutate(() => true)
        }

        // Guardar en el computador para enviarla cuando vuelva el internet
        const guardar = () => {
            const guardada = queueSale(storeId, {
                clientSaleId,
                soldAt,
                total: payment.total,
                // Marcada sin internet: el servidor la acepta con el precio que tenía
                // a la hora de la venta y avisa si se cobró otro
                body: { ...payment.buildSaleBody(saleArgs), offline: true },
                receipt,
            })
            if (!guardada) {
                // Nunca dar por hecha una venta que no quedó guardada
                setEnviando(false)
                setError('No se pudo guardar la venta en este computador. Anótala en papel y avisa al administrador.')
                return
            }
            terminar(null, null)
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            // El fiado necesita señal (cliente, deuda y aprobación)
            if (esFiado) {
                setEnviando(false)
                setError('Sin internet no se puede fiar. Cobra de contado o espera señal.')
                return
            }
            guardar()
            return
        }

        try {
            const tiempo = new Promise<{ success: false; timedOut: true }>(resolve =>
                setTimeout(() => resolve({ success: false, timedOut: true }), 10000)
            )
            const result = await Promise.race([payment.submitSale(saleArgs), tiempo])

            if (!('timedOut' in result) && result.success) {
                terminar(result.saleId ?? clientSaleId, typeof result.change === 'number' ? result.change : null)
                void offline.sync()
                return
            }

            // Sin señal o el servidor no respondió: la venta no se pierde. Se
            // guarda con el mismo número, así que si sí alcanzó a entrar, al
            // enviarla de nuevo TOUL no la duplica
            if ('timedOut' in result || result.networkError) {
                guardar()
                return
            }

            setEnviando(false)
            const message = result.error
            setError(message || 'No se pudo registrar la venta. Intenta de nuevo.')
            // Si cambió un precio o el stock, se traen los productos de nuevo
            if (message && /precio|stock/i.test(message)) data.refreshProducts()
        } catch (err: unknown) {
            setEnviando(false)
            setError(err instanceof Error ? err.message : 'Error inesperado al registrar la venta.')
        }
    }, [enviando, cart, razon, necesita, aprobacion, payment, esFiado, tienda, ctx.storeName, ctx.displayName, miTurno, autoPrint, isPro, tirillaAutomatica, globalMutate, storeId, offline, data])

    const accionar = useCallback(() => {
        if (boton.deshabilitado || !boton.accion) return
        if (boton.accion === 'pedir') void aprobacion.request()
        else if (boton.accion === 'cancelar') void aprobacion.cancel()
        else void enviar()
    }, [boton, aprobacion, enviar])

    const nuevaVenta = useCallback(() => {
        setVenta(null)
        setError(null)
    }, [])

    const limpiarError = useCallback(() => setError(null), [])

    // Deshacer (solo el administrador, apenas termina la venta): se anula
    // con su motivo, o se saca de la cola si todavía no se envió. Los
    // productos vuelven a la venta para corregir lo que estuvo mal
    const deshacer = useCallback(async () => {
        if (!venta || !esAdmin || deshaciendo) return
        setDeshaciendo(true)
        // Si la tirilla todavía no salió, ya no sale
        cancelarTirilla()
        try {
            const enCola = listPendingSales(storeId).some(s => s.clientSaleId === venta.clientSaleId)
            if (enCola) {
                removePendingSale(storeId, venta.clientSaleId)
            } else {
                const { error: err } = await createClient().rpc('toul_void_sale', {
                    p_sale_id: venta.saleId ?? venta.clientSaleId,
                    p_reason: 'Deshecha al registrar',
                })
                if (err) { toast.error(err.message || 'No se pudo deshacer la venta'); return }
            }
            cart.restoreCart(venta.cartMap)
            setVenta(null)
            data.refreshProducts()
            globalMutate(() => true)
            toast.success('Venta deshecha. Los productos volvieron a la venta.')
        } finally {
            setDeshaciendo(false)
        }
    }, [venta, esAdmin, deshaciendo, storeId, cart, data, globalMutate, cancelarTirilla])

    const imprimir = useCallback(async () => {
        if (!venta) return
        // Si la automática está por salir, sale ya (no dos veces)
        cancelarTirilla()
        if (venta.saleId && !venta.offline) await imprimirServidor(venta.saleId, venta.receipt)
        else printReceipt(venta.receipt)
    }, [venta, imprimirServidor, cancelarTirilla])

    // Comprobante por WhatsApp: directo al chat del cliente si tiene celular;
    // si no, el menú de compartir del equipo
    const compartir = useCallback(() => {
        if (!venta) return
        const mensaje = mensajeComprobante({
            tienda: tienda?.name || ctx.storeName,
            fecha: venta.soldAt,
            items: venta.items.map(i => ({
                nombre: nombreLinea(i),
                cantidad: i.quantity,
                valor: Math.round((i.unitPrice ?? i.product.sale_price) * i.quantity),
            })),
            subtotal: venta.subtotal,
            descuento: venta.discount,
            total: venta.total,
            pagos: venta.payments.map(p => ({ metodo: p.methodName, monto: p.amount })),
            recibido: venta.cashReceived,
            vuelto: venta.change,
            fiado: venta.isCredit ? { abono: venta.abono, debe: venta.debe } : null,
            cliente: venta.customerName,
            mensajeFinal: tienda?.receipt_footer,
        })
        const directo = enlaceWhatsApp(venta.customerPhone, mensaje)
        if (directo) { window.open(directo, '_blank', 'noopener'); return }
        if (typeof navigator.share === 'function') {
            navigator.share({ text: mensaje }).catch(() => { /* lo cerró */ })
            return
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener')
    }, [venta, tienda, ctx.storeName])

    return {
        enviar, enviando, error, limpiarError,
        venta, nuevaVenta,
        necesita, revision, aprobacion, boton, accionar,
        deshacer, deshaciendo,
        imprimir, imprimiendo,
        compartir,
    }
}
