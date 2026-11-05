'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { useSessionContext } from '@/lib/isla/useSession'
import { PENDING_SALES_EVENT, listPendingSales, type PendingSale } from '@/lib/isla/offline'
import { demandaDeVentasGuardadas, stockRestante, unidadProducto, unidadVariante, type Cuenta } from './stock'
import type { Product, PaymentMethodConfig, Customer } from '@/lib/types'

// ─── Fetchers ─────────────────────────────────────────────────
// Guarda la última respuesta buena en el computador: si se cae internet,
// la caja sigue mostrando productos, métodos de pago y clientes.
// La copia lleva el nombre de la tienda: antes era una sola para todo
// el equipo, y si se caía el internet otra cuenta veía los productos
// y clientes de la anterior.
// `pedidoEn`: cuándo se pidió. Así se sabe si el stock que llegó ya
// incluye una venta que se envió desde la cola.
const CACHE_PREFIX = 'toul-pos-cache:'

const jsonFetcher = async ([url, storeId]: [string, string]) => {
    const llave = `${CACHE_PREFIX}${storeId}:${url}`
    const pedidoEn = Date.now()
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const data = { ...(await res.json()), pedidoEn }
        try { localStorage.setItem(llave, JSON.stringify(data)) } catch { /* sin espacio */ }
        return data
    } catch (err) {
        try {
            const cached = localStorage.getItem(llave)
            if (cached) return JSON.parse(cached)
        } catch { /* sin almacenamiento */ }
        throw err
    }
}

// ─── Types ────────────────────────────────────────────────────
export interface POSVariant {
    id: string
    product_id: string
    name: string
    sale_price: number
    cpp: number
    stock: number
}

export interface POSComboItem {
    product_id: string | null
    variant_id: string | null
    quantity: number
    products: { id: string; name: string; cpp: number; stock?: number } | null
    product_variants: { id: string; product_id?: string; name: string; cpp: number; stock?: number } | null
}

export interface POSCombo {
    id: string
    name: string
    sale_price: number
    image_url: string | null
    combo_items: POSComboItem[]
}

// ─── Hook ─────────────────────────────────────────────────────
export interface POSDataState {
    /** Con el stock que queda: ya descuenta las ventas guardadas sin internet */
    products: Product[]
    variantsByProduct: Record<string, POSVariant[]>
    combos: POSCombo[]
    methods: PaymentMethodConfig[]
    customers: Customer[]
    /** Lo que queda de cada unidad de inventario ('p:<producto>', 'v:<presentación>') */
    stock: Cuenta
    /** "Sauvage" o "Bleu · 50ml": para decir qué le falta a un combo */
    unitName: (unidad: string) => string
    isLoading: boolean
    /** Qué no cargó (ni hay copia guardada): los productos, o métodos de pago y clientes */
    failed: 'products' | 'other' | null
    /** Vuelve a pedir lo que no cargó */
    retry: () => void
    /** Trae otra vez los productos (por ejemplo, cuando un precio cambió) */
    refreshProducts: () => void
    /** Trae otra vez los clientes (después de crear uno) */
    refreshCustomers: () => void
}

/** Una venta que salió de la cola: hasta que lleguen productos pedidos
 *  después, su stock se sigue descontando */
interface EnCamino { salioEn: number; venta: PendingSale }

/**
 * SWR-based data hook for POS.
 * Fetches products, payment methods, and customers in parallel.
 * Keeps data fresh but avoids re-fetching while the POS is open.
 */
export function usePOSData(enabled: boolean): POSDataState {
    // La tienda de quien vende: la memoria y la copia sin internet van a su nombre
    const { data: sesion } = useSessionContext()
    const storeId = sesion?.storeId ?? null
    const listo = enabled && !!storeId

    // Los precios se refrescan cada 2 minutos: así casi nunca se cobra uno viejo
    const { data: prodData, error: prodErr, mutate: mutateProd } = useSWR(
        listo ? ['/api/pos-data', storeId] : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000, refreshInterval: 120_000 }
    )

    const { data: methData, error: methErr, mutate: mutateMeth } = useSWR(
        listo ? ['/api/payment-methods', storeId] : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 60_000 }
    )

    const { data: custData, error: custErr, mutate: mutateCust } = useSWR(
        listo ? ['/api/customers', storeId] : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000 }
    )

    // ── Ventas guardadas sin internet: su stock ya salió ─────────
    const [guardadas, setGuardadas] = useState<PendingSale[]>([])
    const [enCamino, setEnCamino] = useState<EnCamino[]>([])
    const anteriores = useRef<PendingSale[]>([])

    useEffect(() => {
        if (!storeId) return
        const leer = () => {
            const ahora = listPendingSales(storeId)
            const quedan = new Set(ahora.map(s => s.clientSaleId))
            const salieron = anteriores.current.filter(s => !quedan.has(s.clientSaleId))
            anteriores.current = ahora
            setGuardadas(ahora)
            if (salieron.length > 0) {
                const salioEn = Date.now()
                setEnCamino(prev => [...prev, ...salieron.map(venta => ({ salioEn, venta }))])
                void mutateProd()
            }
        }
        leer()
        window.addEventListener(PENDING_SALES_EVENT, leer)
        window.addEventListener('storage', leer)
        return () => {
            window.removeEventListener(PENDING_SALES_EVENT, leer)
            window.removeEventListener('storage', leer)
        }
    }, [storeId, mutateProd])

    // Cuando llegan productos pedidos después de que la venta salió, ya la incluyen
    const pedidoEn: number = prodData?.pedidoEn ?? 0

    const rawProducts = useMemo<Product[]>(() => prodData?.products ?? [], [prodData])
    const rawVariants = useMemo<POSVariant[]>(() => prodData?.variants ?? [], [prodData])
    const combos = useMemo<POSCombo[]>(() => (prodData?.combos ?? []) as unknown as POSCombo[], [prodData])

    const stock = useMemo<Cuenta>(() => {
        const base: Cuenta = {}
        // Lo que va dentro de los combos puede no estar a la venta suelto
        for (const combo of combos) {
            for (const ci of combo.combo_items ?? []) {
                if (ci.variant_id && ci.product_variants) base[unidadVariante(ci.variant_id)] = Number(ci.product_variants.stock) || 0
                else if (ci.product_id && ci.products) base[unidadProducto(ci.product_id)] = Number(ci.products.stock) || 0
            }
        }
        for (const p of rawProducts) base[unidadProducto(p.id)] = Number(p.stock) || 0
        for (const v of rawVariants) base[unidadVariante(v.id)] = Number(v.stock) || 0
        const comprometido = demandaDeVentasGuardadas(
            [...guardadas, ...enCamino.filter(e => e.salioEn >= pedidoEn).map(e => e.venta)],
            combos,
        )
        return stockRestante(base, comprometido)
    }, [rawProducts, rawVariants, combos, guardadas, enCamino, pedidoEn])

    const products = useMemo<Product[]>(() => rawProducts.map(p => {
        const queda = stock[unidadProducto(p.id)] ?? 0
        return queda === p.stock ? p : { ...p, stock: queda }
    }), [rawProducts, stock])

    const variantsByProduct = useMemo<Record<string, POSVariant[]>>(() => {
        const map: Record<string, POSVariant[]> = {}
        for (const v of rawVariants) {
            const queda = stock[unidadVariante(v.id)] ?? 0
            if (!map[v.product_id]) map[v.product_id] = []
            map[v.product_id].push(queda === v.stock ? v : { ...v, stock: queda })
        }
        return map
    }, [rawVariants, stock])

    const unitName = useCallback((unidad: string) => {
        const id = unidad.slice(2)
        if (unidad.startsWith('p:')) {
            const p = rawProducts.find(x => x.id === id)
            if (p) return p.name
        } else {
            const v = rawVariants.find(x => x.id === id)
            const padre = v ? rawProducts.find(x => x.id === v.product_id) : undefined
            if (v) return padre ? `${padre.name} · ${v.name}` : v.name
        }
        for (const combo of combos) {
            for (const ci of combo.combo_items ?? []) {
                if (unidad.startsWith('p:') && ci.product_id === id && ci.products) return ci.products.name
                if (unidad.startsWith('v:') && ci.variant_id === id && ci.product_variants) {
                    const padre = rawProducts.find(x => x.id === ci.product_variants?.product_id)?.name
                    return padre ? `${padre} · ${ci.product_variants.name}` : ci.product_variants.name
                }
            }
        }
        return 'un producto'
    }, [rawProducts, rawVariants, combos])

    // Dedupe payment methods defensively: API may return duplicates if seedDefaultMethods
    // race-conditioned on first store load (two parallel requests both inserted defaults).
    // Dedupe by lowercased name (handles different IDs with same name from race).
    const methods: PaymentMethodConfig[] = useMemo(() => {
        const arr: PaymentMethodConfig[] = methData?.methods ?? []
        const seen = new Set<string>()
        const out: PaymentMethodConfig[] = []
        for (const m of arr) {
            const key = m.name.trim().toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            out.push(m)
        }
        return out
    }, [methData?.methods])
    const customers: Customer[] = custData?.customers ?? []

    // Sin respuesta y sin copia guardada: la caja muestra "Reintentar"
    const failed = prodErr && !prodData ? 'products'
        : (methErr && !methData) || (custErr && !custData) ? 'other'
        : null
    const isLoading = enabled && !failed && (!prodData || !methData || !custData)

    const retry = useCallback(() => {
        void mutateProd()
        void mutateMeth()
        void mutateCust()
    }, [mutateProd, mutateMeth, mutateCust])

    const refreshProducts = useCallback(() => { void mutateProd() }, [mutateProd])
    const refreshCustomers = useCallback(() => { void mutateCust() }, [mutateCust])

    return useMemo(() => ({
        products, variantsByProduct, combos, methods, customers, stock, unitName,
        isLoading, failed, retry, refreshProducts, refreshCustomers,
    }), [products, variantsByProduct, combos, methods, customers, stock, unitName, isLoading, failed, retry, refreshProducts, refreshCustomers])
}
