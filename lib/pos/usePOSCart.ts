'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Product, CartItem } from '@/lib/types'
import type { POSVariant, POSCombo } from './usePOSData'

const STORAGE_KEY = 'toul_pos_cart'

// ─── Persistence helpers ──────────────────────────────────────
function persistCart(cartMap: Record<string, number>) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cartMap))
    } catch {
        /* Storage full or unavailable — silent fallback */
    }
}

function hydrateCart(): Record<string, number> {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        return JSON.parse(raw) as Record<string, number>
    } catch {
        return {}
    }
}

// ─── Hook ─────────────────────────────────────────────────────
export interface POSCartState {
    cartMap: Record<string, number>
    cartItems: CartItem[]
    subtotal: number
    totalUnits: number
    isEmpty: boolean
    addItem: (productId: string, maxStock: number) => void
    addCombo: (comboId: string) => void
    decrementItem: (productId: string) => void
    removeItem: (productId: string) => void
    clearCart: () => void
}

export function usePOSCart(products: Product[], variantsByProduct: Record<string, POSVariant[]>, combos: POSCombo[]): POSCartState {
    const [cartMap, setCartMap] = useState<Record<string, number>>(() => hydrateCart())

    // Persist on every change
    useEffect(() => {
        persistCart(cartMap)
    }, [cartMap])

    const addItem = useCallback((productId: string, maxStock: number) => {
        if (maxStock <= 0) return // Guard: zero-stock products cannot be added
        setCartMap(prev => {
            const current = prev[productId] || 0
            if (current >= maxStock) return prev // Guard: stock ceiling
            return { ...prev, [productId]: current + 1 }
        })
    }, [])

    const decrementItem = useCallback((productId: string) => {
        setCartMap(prev => {
            const next = { ...prev }
            const current = next[productId] || 0
            if (current <= 1) {
                delete next[productId]
            } else {
                next[productId] = current - 1
            }
            return next
        })
    }, [])

    const removeItem = useCallback((productId: string) => {
        setCartMap(prev => {
            const next = { ...prev }
            delete next[productId]
            return next
        })
    }, [])

    const clearCart = useCallback(() => {
        setCartMap({})
        try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    }, [])

    const addCombo = useCallback((comboId: string) => {
        const key = `combo:${comboId}`
        setCartMap(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }))
    }, [])

    const cartItems: CartItem[] = useMemo(() =>
        Object.entries(cartMap)
            .filter(([, qty]) => qty > 0)
            .map(([itemKey, quantity]) => {
                if (itemKey.startsWith('combo:')) {
                    const comboId = itemKey.slice(6)
                    const combo = combos.find(c => c.id === comboId)
                    if (!combo) return null
                    return {
                        product: { id: combo.id, name: combo.name, sale_price: combo.sale_price, image_url: combo.image_url } as any,
                        isCombo: true,
                        comboId: combo.id,
                        unitPrice: combo.sale_price,
                        quantity,
                    }
                }
                const sep = itemKey.indexOf(':')
                const productId = sep >= 0 ? itemKey.slice(0, sep) : itemKey
                const variantId = sep >= 0 ? itemKey.slice(sep + 1) : undefined
                const product = products.find(p => p.id === productId)
                if (!product) return null
                const variant = variantId
                    ? (variantsByProduct[productId] || []).find(v => v.id === variantId)
                    : null
                return {
                    product,
                    variantId,
                    variantName: variant?.name,
                    unitPrice: variant ? variant.sale_price : product.sale_price,
                    quantity,
                }
            })
            .filter(Boolean) as CartItem[],
        [cartMap, products, variantsByProduct, combos]
    )

    const subtotal = useMemo(
        () => Math.round(cartItems.reduce((sum, item) => sum + (item.unitPrice ?? item.product.sale_price) * item.quantity, 0)),
        [cartItems]
    )

    const totalUnits = useMemo(
        () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
        [cartItems]
    )

    const isEmpty = cartItems.length === 0

    return useMemo(() => ({
        cartMap,
        cartItems,
        subtotal,
        totalUnits,
        isEmpty,
        addItem,
        addCombo,
        decrementItem,
        removeItem,
        clearCart,
    }), [cartMap, cartItems, subtotal, totalUnits, isEmpty, addItem, addCombo, decrementItem, removeItem, clearCart])
}
