'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { preload } from 'swr'
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
        try {
            const raw = JSON.stringify(data)
            localStorage.setItem(llave, raw)
            leidas.set(llave, { raw, data })
        } catch { /* sin espacio */ }
        return data
    } catch (err) {
        try {
            const cached = localStorage.getItem(llave)
            if (cached) return JSON.parse(cached)
        } catch { /* sin almacenamiento */ }
        throw err
    }
}

/** Las copias ya leídas: abrir la caja no vuelve a leer lo que se leyó en Inicio */
const leidas = new Map<string, { raw: string; data: unknown }>()

/** La última respuesta buena guardada en este equipo (para abrir sin esperar) */
function copiaGuardada(storeId: string, url: string) {
    try {
        const llave = `${CACHE_PREFIX}${storeId}:${url}`
        const raw = localStorage.getItem(llave)
        if (!raw) return undefined
        const ya = leidas.get(llave)
        if (ya && ya.raw === raw) return ya.data
        const data = JSON.parse(raw)
        leidas.set(llave, { raw, data })
        return data
    } catch {
        return undefined
    }
}

/**
 * Con Inicio quieto: deja leída la copia guardada y pide los datos de la
 * caja (el mismo pedido de siempre, solo lectura). Así tocar "+" no espera
 * ni lee nada mientras corre la gota.
 */
export function precargarDatosCaja(storeId: string) {
    for (const url of ['/api/pos-data', '/api/payment-methods', '/api/customers']) copiaGuardada(storeId, url)
    precargas.set(storeId, Date.now())
    preload(['/api/pos-data', storeId], jsonFetcher).catch(() => { /* la caja lo vuelve a pedir */ })
}

/** Cuándo se precargó cada tienda. Lo precargado se usa una sola vez, al abrir
 *  la caja: si ya tiene más de un minuto, la caja lo vuelve a pedir enseguida
 *  (si no, abriría con el stock de cuando se cargó Inicio, hasta 2 minutos) */
const precargas = new Map<string, number>()
const PRECARGA_VIGENTE = 60_000

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
    created_at?: string
    sale_price: number
    image_url: string | null
    category_id?: string | null
    combo_items: POSComboItem[]
}

export interface POSCategory {
    id: string
    name: string
    sort_order: number
}

// ─── Hook ─────────────────────────────────────────────────────
export interface POSDataState {
    /** Con el stock que queda: ya descuenta las ventas guardadas sin internet */
    products: Product[]
    variantsByProduct: Record<string, POSVariant[]>
    combos: POSCombo[]
    methods: PaymentMethodConfig[]
    customers: Customer[]
    categories: POSCategory[]
    /** Unidades vendidas en los últimos 30 días ('producto' o 'combo:id') */
    sold: Record<string, number>
    /** El mínimo de cada producto (sin presentaciones) y de cada presentación, por id,
     *  con la misma regla de Inventario. null: no llegó (no se avisa "Quedan N") */
    minimos: Record<string, number> | null
    /** Lo que queda de cada unidad de inventario ('p:<producto>', 'v:<presentación>') */
    stock: Cuenta
    /** "Sauvage" o "Bleu · 50ml": para decir qué le falta a un combo */
    unitName: (unidad: string) => string
    /** Solo los productos: la caja se muestra apenas llegan */
    isLoading: boolean
    /** Métodos de pago y clientes pueden llegar después que los productos */
    methodsLoading: boolean
    customersLoading: boolean
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
 * Datos de la caja: productos, métodos de pago y clientes en un solo pedido.
 * Se mantienen frescos sin volver a pedirlos a cada rato.
 */
export function usePOSData(enabled: boolean): POSDataState {
    // La tienda de quien vende: la memoria y la copia sin internet van a su nombre
    const { data: sesion } = useSessionContext()
    const storeId = sesion?.storeId ?? null
    const listo = enabled && !!storeId

    // La caja abre con lo último guardado en este equipo y se actualiza por
    // detrás. Si un precio cambió en ese momento, el servidor rechaza la
    // venta y pide volver a cobrar: nunca se cobra un precio viejo.
    // Las copias viejas de métodos y clientes (de cuando eran pedidos
    // aparte) sirven mientras llega la primera respuesta completa
    const copias = useMemo(() => listo && storeId ? {
        prod: copiaGuardada(storeId, '/api/pos-data'),
        meth: copiaGuardada(storeId, '/api/payment-methods'),
        cust: copiaGuardada(storeId, '/api/customers'),
    } : null, [listo, storeId])

    // Un solo pedido trae productos, métodos de pago y clientes.
    // Los precios se refrescan cada 2 minutos: así casi nunca se cobra uno viejo
    const { data: prodData, error: prodErr, mutate: mutateProd } = useSWR(
        listo ? ['/api/pos-data', storeId] : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000, refreshInterval: 120_000, fallbackData: copias?.prod }
    )

    // La caja ya usó lo precargado en Inicio: si era de hace rato, pide lo de ahora
    useEffect(() => {
        if (!listo || !storeId) return
        const en = precargas.get(storeId)
        if (en === undefined) return
        precargas.delete(storeId)
        if (Date.now() - en > PRECARGA_VIGENTE) void mutateProd()
    }, [listo, storeId, mutateProd])

    // Solo si no vinieron con los productos: una tienda nueva (sin métodos,
    // la ruta de métodos le crea los de siempre) o una copia guardada vieja
    const metodosJuntos: PaymentMethodConfig[] | null = Array.isArray(prodData?.methods) && prodData.methods.length > 0 ? prodData.methods : null
    const clientesJuntos: Customer[] | null = Array.isArray(prodData?.customers) ? prodData.customers : null
    const pedirMetodos = listo && !!prodData && !metodosJuntos
    const pedirClientes = listo && !!prodData && !clientesJuntos

    const { data: methData, error: methErr, mutate: mutateMeth } = useSWR(
        pedirMetodos ? ['/api/payment-methods', storeId] : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 60_000 }
    )

    const { data: custData, error: custErr, mutate: mutateCust } = useSWR(
        pedirClientes ? ['/api/customers', storeId] : null,
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
    const categories = useMemo<POSCategory[]>(() => prodData?.categories ?? [], [prodData])
    const sold = useMemo<Record<string, number>>(() => prodData?.sold ?? {}, [prodData])
    const minimos = useMemo<Record<string, number> | null>(() => prodData?.minimos ?? null, [prodData])

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
    const metodosLista: PaymentMethodConfig[] | undefined = metodosJuntos ?? methData?.methods ?? copias?.meth?.methods
    const clientesLista: Customer[] | undefined = clientesJuntos ?? custData?.customers ?? copias?.cust?.customers
    const methods: PaymentMethodConfig[] = useMemo(() => {
        const arr: PaymentMethodConfig[] = metodosLista ?? []
        const seen = new Set<string>()
        const out: PaymentMethodConfig[] = []
        for (const m of arr) {
            const key = m.name.trim().toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            out.push(m)
        }
        return out
    }, [metodosLista])
    const customers: Customer[] = useMemo(() => clientesLista ?? [], [clientesLista])

    // Sin respuesta y sin copia guardada: la caja muestra "Reintentar"
    const sinMetodos = !metodosLista && (!!methErr || (!!prodErr && !prodData))
    const sinClientes = !clientesLista && (!!custErr || (!!prodErr && !prodData))
    const failed = prodErr && !prodData ? 'products'
        : sinMetodos || sinClientes ? 'other'
        : null
    // Los productos no esperan a los métodos ni a los clientes
    const isLoading = enabled && failed !== 'products' && !prodData
    const methodsLoading = enabled && !metodosLista && !sinMetodos
    const customersLoading = enabled && !clientesLista && !sinClientes

    const retry = useCallback(() => {
        void mutateProd()
        void mutateMeth()
        void mutateCust()
    }, [mutateProd, mutateMeth, mutateCust])

    const refreshProducts = useCallback(() => { void mutateProd() }, [mutateProd])
    // Los clientes vienen con los productos: se trae todo otra vez (un pedido)
    const refreshCustomers = useCallback(() => {
        void mutateProd()
        if (pedirClientes) void mutateCust()
    }, [mutateProd, mutateCust, pedirClientes])

    return useMemo(() => ({
        products, variantsByProduct, combos, methods, customers, categories, sold, minimos, stock, unitName,
        isLoading, methodsLoading, customersLoading, failed, retry, refreshProducts, refreshCustomers,
    }), [products, variantsByProduct, combos, methods, customers, categories, sold, minimos, stock, unitName, isLoading, methodsLoading, customersLoading, failed, retry, refreshProducts, refreshCustomers])
}
