'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import type { Product, CartItem } from '@/lib/types'
import type { POSVariant, POSCombo } from './usePOSData'
import { cabeUnaMas, loQueFalta, type Cuenta, type Unidad } from './stock'

const STORAGE_KEY = 'toul_pos_cart'
// El carrito vive en localStorage (no sessionStorage): si se cierra el navegador
// o se va la luz en plena venta, al volver sigue ahí. Se descarta a las 12 horas.
const CART_TTL_MS = 12 * 60 * 60 * 1000

// ─── Persistence helpers ──────────────────────────────────────
function persistCart(cartMap: Record<string, number>) {
    try {
        if (Object.keys(cartMap).length === 0) {
            localStorage.removeItem(STORAGE_KEY)
            return
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart: cartMap, savedAt: Date.now() }))
    } catch {
        /* Storage full or unavailable — silent fallback */
    }
}

function hydrateCart(): Record<string, number> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as { cart?: Record<string, number>; savedAt?: number }
        if (!parsed?.cart || !parsed.savedAt || Date.now() - parsed.savedAt > CART_TTL_MS) {
            localStorage.removeItem(STORAGE_KEY)
            return {}
        }
        return parsed.cart
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
    /** Una más de la línea ('producto', 'producto:presentación' o 'combo:id'), si alcanza el stock */
    addItem: (itemKey: string) => void
    addCombo: (comboId: string) => void
    /** ¿Alcanza el stock para una más? Cuenta lo que ya lleva el carrito, combos incluidos */
    canAdd: (itemKey: string) => boolean
    /** Lo que no alcanza para una más de esta línea (null si alcanza) */
    missingFor: (itemKey: string) => Unidad | null
    decrementItem: (productId: string) => void
    removeItem: (productId: string) => void
    clearCart: () => void
}

export function usePOSCart(products: Product[], variantsByProduct: Record<string, POSVariant[]>, combos: POSCombo[], stock: Cuenta): POSCartState {
    const [cartMap, setCartMap] = useState<Record<string, number>>(() => hydrateCart())

    // Persist on every change
    useEffect(() => {
        persistCart(cartMap)
    }, [cartMap])

    // El tope es el stock que queda, contando lo que ya va en el carrito:
    // un perfume suelto y el mismo perfume dentro de un combo salen del mismo stock
    const addItem = useCallback((itemKey: string) => {
        setCartMap(prev => {
            if (!cabeUnaMas(itemKey, prev, combos, stock)) return prev
            return { ...prev, [itemKey]: (prev[itemKey] || 0) + 1 }
        })
    }, [combos, stock])

    const canAdd = useCallback((itemKey: string) => cabeUnaMas(itemKey, cartMap, combos, stock), [cartMap, combos, stock])
    const missingFor = useCallback((itemKey: string) => loQueFalta(itemKey, cartMap, combos, stock), [cartMap, combos, stock])

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
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
    }, [])

    const addCombo = useCallback((comboId: string) => addItem(`combo:${comboId}`), [addItem])

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
        canAdd,
        missingFor,
        decrementItem,
        removeItem,
        clearCart,
    }), [cartMap, cartItems, subtotal, totalUnits, isEmpty, addItem, addCombo, canAdd, missingFor, decrementItem, removeItem, clearCart])
}
