'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/client'
import { nombreMetodo, onlyDigits } from '@/lib/format/text'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'
import { cuentaParaGuardar, recordarCuenta } from '@/components/movimientos/CuentaChips'
import type { Product, Provider } from '@/lib/types'
import { guardarBorrador, olvidarBorrador, tomarBorrador, tomarPedido } from './pedido'
import {
    cantidadValida, costoSugerido, lineasDeUnBorrador, lineasDeUnPedido, lineasEnCero, llaveDeLinea, nombreCompleto, pagoDeCompra,
    productosParaElegir, totalDeCompra,
    type FormaDePago, type LineaCompra, type OrdenCompra,
} from './calculos'

/* ══════════════════════════════════════════════════════════════
   Nueva compra: todo lo que pasa detrás de la pantalla.
   La usan el celular (en 3 pasos) y el PC (en una sola pantalla),
   para que las dos versiones cuenten, validen y guarden igual.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()

export type PresentacionCompra = { id: string; product_id: string; name: string; sale_price: number; cpp: number }
export type LineaDeCompra = LineaCompra<Product>

export function useCompra() {
    const router = useRouter()

    const [products, setProducts] = useState<Product[]>([])
    const [variantsByProduct, setVariantsByProduct] = useState<Record<string, PresentacionCompra[]>>({})
    const [providers, setProviders] = useState<Provider[]>([])
    const [loading, setLoading] = useState(true)
    // No se pudo cargar (sin internet): se avisa en vez de quedarse cargando
    const [sinDatos, setSinDatos] = useState(false)
    const [intento, setIntento] = useState(0)

    // Elegir productos
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<OrdenCompra>('Recientes')
    const [selectedItems, setSelectedItems] = useState<LineaDeCompra[]>([])
    const [expandedInPicker, setExpandedInPicker] = useState<Set<string>>(new Set())

    // Pago
    const [paymentMethod, setPaymentMethod] = useState<FormaDePago>('cash')
    const [initialPayment, setInitialPayment] = useState<string>('')
    const [selectedProviderId, setSelectedProviderId] = useState<string>('')
    const [dueDate, setDueDate] = useState<string>('')
    // "¿Con qué pagaste?": siempre una cuenta del negocio
    const [cuenta, setCuenta] = useState<string | null>(null)
    const { methods } = usePaymentMethods()
    const nombreCuenta = nombreMetodo(methods.find(m => m.id === cuenta)?.name)

    const [saving, setSaving] = useState(false)
    // Antes de guardar con costo $0: se avisa una vez y el dueño decide
    const [avisoCero, setAvisoCero] = useState(false)

    useEffect(() => {
        let cancelado = false
        const fallo = () => { if (!cancelado) { setSinDatos(true); setLoading(false) } }

        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) { fallo(); return }
            const { data: store, error: errorTienda } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store || errorTienda) { fallo(); return }

            const [prodRes, provRes, variantsRes] = await Promise.all([
                supabase.from('products').select('*').eq('store_id', store.id).eq('is_active', true).order('name'),
                supabase.from('providers').select('*').eq('store_id', store.id).order('name'),
                supabase.from('product_variants').select('id, product_id, name, sale_price, cpp').eq('store_id', store.id).eq('is_active', true).order('name'),
            ])
            if (cancelado) return
            // Sin productos o presentaciones no se puede armar la compra bien
            if (prodRes.error || provRes.error || variantsRes.error) { fallo(); return }
            setSinDatos(false)

            if (prodRes.data) setProducts(prodRes.data)
            if (provRes.data) setProviders(provRes.data)

            if (variantsRes.data) {
                const grouped: Record<string, PresentacionCompra[]> = {}
                for (const v of variantsRes.data) {
                    if (!grouped[v.product_id]) grouped[v.product_id] = []
                    grouped[v.product_id].push(v)
                }
                setVariantsByProduct(grouped)
            }

            // Vuelve de "Compras anteriores": la compra sigue como la dejó
            const params = new URLSearchParams(window.location.search)
            const borrador = params.get('borrador') ? tomarBorrador() : null
            // Si viene un pedido armado desde Inventario, la compra
            // arranca con todo adentro: el dueño solo ajusta y confirma
            const pedido = borrador ? [] : tomarPedido()
            if (borrador && prodRes.data) {
                setSelectedItems(lineasDeUnBorrador(borrador.lineas, prodRes.data as Product[], variantsRes.data ?? []))
                if (borrador.paymentMethod === 'cash' || borrador.paymentMethod === 'credit') setPaymentMethod(borrador.paymentMethod)
                setInitialPayment(borrador.initialPayment ?? '')
                setSelectedProviderId(borrador.selectedProviderId ?? '')
                setDueDate(borrador.dueDate ?? '')
                if (borrador.cuenta) setCuenta(borrador.cuenta)
            } else if (pedido.length > 0 && prodRes.data) {
                const precargado = lineasDeUnPedido(pedido, prodRes.data as Product[], variantsRes.data ?? [])
                if (precargado.length > 0) {
                    setSelectedItems(precargado)
                    toast.success(`${precargado.length} ${precargado.length === 1 ? 'producto listo' : 'productos listos'} en el pedido`)
                }
            } else if (prodRes.data) {
                // "Comprar" desde el detalle de un producto: llega ya agregado.
                // Si tiene varias presentaciones y no dice cuál, se deja abierto
                // en la lista para que el dueño elija (no se adivina la talla).
                const productId = params.get('product')
                const product = productId ? (prodRes.data as Product[]).find(p => p.id === productId) : undefined
                if (product) {
                    const suyas = (variantsRes.data ?? []).filter(v => v.product_id === product.id)
                    const variantId = params.get('variant') ?? (suyas.length === 1 ? suyas[0].id : null)
                    if (suyas.length > 1 && !variantId) {
                        setExpandedInPicker(new Set([product.id]))
                        setSearchQuery(product.name)
                    } else {
                        setSelectedItems(lineasDeUnPedido([{ productId: product.id, variantId, quantity: 1 }], prodRes.data as Product[], variantsRes.data ?? []))
                    }
                }
            }

            setLoading(false)
        }
        load().catch(fallo)
        return () => { cancelado = true }
    }, [intento])

    const reintentar = useCallback(() => { setLoading(true); setSinDatos(false); setIntento(n => n + 1) }, [])

    const productsToShow = useMemo(
        () => productosParaElegir(products, sortBy, searchQuery),
        [products, sortBy, searchQuery],
    )

    const toggleExpand = useCallback((productId: string) => {
        setExpandedInPicker(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId); else next.add(productId)
            return next
        })
    }, [])

    const addItem = useCallback((product: Product, variantId?: string, variantName?: string) => {
        const itemKey = llaveDeLinea(product.id, variantId)
        if (selectedItems.find(i => i.itemKey === itemKey)) return
        const variant = variantId ? variantsByProduct[product.id]?.find(v => v.id === variantId) : null
        const defaultCost = costoSugerido(product, variant, !!variantId)
        setSelectedItems(prev => [...prev, { itemKey, product, variantId, variantName, quantity: '1', cost: String(defaultCost) }])
        setSearchQuery('')
    }, [selectedItems, variantsByProduct])

    const updateItem = useCallback((itemKey: string, field: 'quantity' | 'cost', value: string) => {
        setSelectedItems(items => items.map(item =>
            item.itemKey === itemKey ? { ...item, [field]: value } : item
        ))
    }, [])

    const removeItem = useCallback((itemKey: string) => {
        setSelectedItems(items => items.filter(i => i.itemKey !== itemKey))
    }, [])

    const subtotal = totalDeCompra(selectedItems)
    const total = subtotal
    const abono = Number(onlyDigits(initialPayment) || 0)
    const { abonoDemasiado, pagado, faltaCuenta } = pagoDeCompra(paymentMethod, abono, total, cuenta)
    const esCredito = paymentMethod === 'credit'
    const faltaCredito = esCredito && (!selectedProviderId || !dueDate)

    /** Cada cantidad tiene que ser un entero de 1 en adelante (ni vacía, ni 0, ni con decimales) */
    const cantidadesBien = selectedItems.every(item => cantidadValida(item.quantity))
    /** Celular, paso 2: lo que hace falta para ver el resumen */
    const puedeVerResumen = cantidadesBien && !((esCredito && (!selectedProviderId || !dueDate || abonoDemasiado)) || faltaCuenta)
    /** PC: lo que hace falta para guardar */
    const canSubmit = selectedItems.length > 0 && cantidadesBien && !faltaCredito && !abonoDemasiado && !faltaCuenta && !saving
    /** Los productos que van con costo $0, para nombrarlos en el aviso */
    const nombresEnCero = lineasEnCero(selectedItems).map(item => nombreCompleto(item.product.name, item.variantName ?? null))

    const handleSubmit = useCallback(async () => {
        if (faltaCuenta) { toast.error('Elige con qué pagaste'); return }
        setSaving(true)
        try {
            const response = await fetch('/api/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: selectedProviderId,
                    subtotal,
                    total,
                    isCredit: paymentMethod === 'credit',
                    paidNow: pagado,
                    ...cuentaParaGuardar(pagado > 0 ? cuenta : null),
                    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                    items: selectedItems.map(item => ({
                        productId: item.product.id,
                        variantId: item.variantId ?? null,
                        quantity: Number(item.quantity),
                        unitCost: Number(item.cost)
                    }))
                })
            })

            const result = await response.json()
            // El servidor ya responde en español (lo técnico lo traduce allá)
            if (!response.ok) throw Object.assign(new Error(result.error || 'No se pudo registrar la compra. Intenta de nuevo.'), { delServidor: true })

            if (pagado > 0) recordarCuenta('compra', cuenta)
            olvidarBorrador()
            toast.success('Compra registrada')
            router.push('/inventory')
        } catch (e: unknown) {
            toast.error(e instanceof Error && (e as { delServidor?: boolean }).delServidor
                ? e.message
                : explainError(e, 'No se pudo registrar la compra. Intenta de nuevo.'))
            setSaving(false)
        }
    }, [faltaCuenta, selectedProviderId, subtotal, total, paymentMethod, pagado, cuenta, dueDate, selectedItems, router])

    /** El botón de guardar: si hay costos en $0, primero pregunta */
    const guardar = useCallback(() => {
        if (!cantidadesBien) { toast.error('Revisa las cantidades: cada producto necesita 1 o más'); return }
        if (nombresEnCero.length > 0) { setAvisoCero(true); return }
        handleSubmit()
    }, [cantidadesBien, nombresEnCero.length, handleSubmit])

    const guardarIgual = useCallback(() => {
        setAvisoCero(false)
        handleSubmit()
    }, [handleSubmit])

    const cerrarAvisoCero = useCallback(() => setAvisoCero(false), [])

    /** "Ver compras anteriores": guarda la compra como va, para que al volver siga igual */
    const guardarParaVolver = useCallback(() => {
        guardarBorrador({
            lineas: selectedItems.map(item => ({
                productId: item.product.id, variantId: item.variantId ?? null, quantity: item.quantity, cost: item.cost,
            })),
            paymentMethod, initialPayment, selectedProviderId, dueDate, cuenta,
        })
    }, [selectedItems, paymentMethod, initialPayment, selectedProviderId, dueDate, cuenta])

    return {
        loading, sinDatos, reintentar,
        products,
        productsToShow,
        variantsByProduct,
        providers,
        searchQuery, setSearchQuery,
        sortBy, setSortBy,
        expandedInPicker, toggleExpand,
        selectedItems, addItem, updateItem, removeItem,
        paymentMethod, setPaymentMethod,
        initialPayment, setInitialPayment,
        selectedProviderId, setSelectedProviderId,
        dueDate, setDueDate,
        cuenta, setCuenta, nombreCuenta,
        subtotal, total, abono, pagado, abonoDemasiado, faltaCuenta,
        puedeVerResumen, canSubmit, cantidadesBien,
        saving, guardar,
        avisoCero, nombresEnCero, guardarIgual, cerrarAvisoCero,
        guardarParaVolver,
    }
}

export type CompraEnCurso = ReturnType<typeof useCompra>
