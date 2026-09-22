'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import type { Product, PaymentMethodConfig, Customer } from '@/lib/types'

// ─── Fetchers ─────────────────────────────────────────────────
// Guarda la última respuesta buena en el computador: si se cae internet,
// la caja sigue mostrando productos, métodos de pago y clientes.
const CACHE_PREFIX = 'toul-pos-cache:'

const jsonFetcher = async (url: string) => {
    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        try { localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(data)) } catch { /* sin espacio */ }
        return data
    } catch (err) {
        try {
            const cached = localStorage.getItem(CACHE_PREFIX + url)
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
    products: { id: string; name: string; cpp: number } | null
    product_variants: { id: string; name: string; cpp: number } | null
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
    products: Product[]
    variantsByProduct: Record<string, POSVariant[]>
    combos: POSCombo[]
    methods: PaymentMethodConfig[]
    customers: Customer[]
    isLoading: boolean
    error: string | null
}

/**
 * SWR-based data hook for POS.
 * Fetches products, payment methods, and customers in parallel.
 * Keeps data fresh but avoids re-fetching while the POS is open.
 */
export function usePOSData(enabled: boolean): POSDataState {
    const { data: prodData, error: prodErr } = useSWR(
        enabled ? '/api/pos-data' : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000 }
    )

    const { data: methData, error: methErr } = useSWR(
        enabled ? '/api/payment-methods' : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 60_000 }
    )

    const { data: custData, error: custErr } = useSWR(
        enabled ? '/api/customers' : null,
        jsonFetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000 }
    )

    const products: Product[] = prodData?.products ?? []
    const combos: POSCombo[] = (prodData?.combos ?? []) as unknown as POSCombo[]
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

    const variantsByProduct = useMemo<Record<string, POSVariant[]>>(() => {
        const map: Record<string, POSVariant[]> = {}
        for (const v of (prodData?.variants ?? []) as POSVariant[]) {
            if (!map[v.product_id]) map[v.product_id] = []
            map[v.product_id].push(v)
        }
        return map
    }, [prodData?.variants])

    const isLoading = enabled && (!prodData || !methData || !custData)
    const error = prodErr?.message || methErr?.message || custErr?.message || null

    return { products, variantsByProduct, combos, methods, customers, isLoading, error }
}
