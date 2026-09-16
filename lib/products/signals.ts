/**
 * TOUL — Product Signal Computation Layer
 * 
 * Pure functions for computing visual signals on product cards.
 * Signals are READ-ONLY visual indicators — they NEVER mutate business logic.
 * 
 * Preprocessing (sales aggregation, top products set) is done ONCE per load,
 * then shared across all cards via context.
 */

import type { Product } from '@/lib/types'

// ─── Signal Types ──────────────────────────────────────────

export type SignalKey = 'sin_stock' | 'pocas_unidades' | 'top' | 'sin_ventas' | 'bajo_margen'

export interface ProductSignal {
    key: SignalKey
    label: string
    color: 'red' | 'yellow' | 'green' | 'gray'
}

export type InsightKey = 'sin_ventas' | 'top' | 'stock_bajo' | 'buen_margen'

export interface ProductInsight {
    key: InsightKey
    message: string
}

// ─── Signal Context (precomputed once per load) ────────────

export interface SignalContext {
    salesLast14DaysMap: Record<string, number>   // productId → total quantity sold
    topProductsSet: Set<string>                   // productIds in top 30%
    threshold: number                             // low stock threshold (default 3)
    now: Date
}

// ─── Preprocessing ─────────────────────────────────────────

/**
 * Build the signal context from raw sale_items data.
 * Call this ONCE when data loads — not per card.
 */
export function buildSignalContext(
    products: Product[],
    saleItems: Array<{ product_id: string; quantity: number; created_at: string }>,
    threshold: number = 3,
): SignalContext {
    const now = new Date()
    const fourteenDaysAgo = new Date(now)
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

    // Aggregate sales per product (last 14 days only)
    const salesLast14DaysMap: Record<string, number> = {}
    for (const item of saleItems) {
        const itemDate = new Date(item.created_at)
        if (itemDate >= fourteenDaysAgo) {
            salesLast14DaysMap[item.product_id] = (salesLast14DaysMap[item.product_id] || 0) + item.quantity
        }
    }

    // Build top 30% set (only if >= 5 products)
    const topProductsSet = new Set<string>()
    if (products.length >= 5) {
        const ranked = products
            .map(p => ({ id: p.id, qty: salesLast14DaysMap[p.id] || 0 }))
            .filter(entry => entry.qty > 0)
            .sort((a, b) => b.qty - a.qty)

        const topCount = Math.ceil(ranked.length * 0.3)
        for (let i = 0; i < topCount; i++) {
            topProductsSet.add(ranked[i].id)
        }
    }

    return { salesLast14DaysMap, topProductsSet, threshold, now }
}

// ─── Signal Computation ────────────────────────────────────

/**
 * Compute the ONE signal for a product.
 * Returns null if no signal applies.
 * 
 * Priority order:
 * 1. Sin stock (stock === 0)
 * 2. Pocas unidades (stock > 0 && stock <= threshold)
 * 3. Se vende bien (in topProductsSet)
 * 4. Sin ventas (0 sales in 14d, product >= 7 days old)
 * 5. Bajo margen (margin < 20%)
 */
export function computeProductSignal(
    product: Product,
    context: SignalContext,
): ProductSignal | null {
    // 1. Sin stock
    if (product.stock === 0) {
        return { key: 'sin_stock', label: 'Sin stock', color: 'red' }
    }

    // 2. Pocas unidades
    const effectiveThreshold = product.low_stock_threshold ?? context.threshold
    if (product.stock > 0 && product.stock <= effectiveThreshold) {
        return { key: 'pocas_unidades', label: 'Pocas unidades', color: 'yellow' }
    }

    // 3. Se vende bien
    if (context.topProductsSet.has(product.id)) {
        return { key: 'top', label: 'Se vende bien', color: 'green' }
    }

    // 4. Sin ventas (only for products >= 7 days old)
    const daysSinceCreation = Math.floor(
        (context.now.getTime() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    const salesLast14Days = context.salesLast14DaysMap[product.id] || 0
    if (salesLast14Days === 0 && daysSinceCreation >= 7) {
        return { key: 'sin_ventas', label: 'Sin ventas', color: 'gray' }
    }

    // 5. Bajo margen
    if (product.sale_price > 0 && product.cpp > 0) {
        const margin = (product.sale_price - product.cpp) / product.sale_price
        if (margin < 0.2) {
            return { key: 'bajo_margen', label: 'Bajo margen', color: 'yellow' }
        }
    }

    return null
}

// ─── Mini Insight ──────────────────────────────────────────

/**
 * Compute ONE mini insight message for the detail page.
 * Returns null if no insight applies.
 * 
 * Fixed messages only — no dynamic text generation.
 */
export function computeInsightMessage(
    product: Product,
    context: SignalContext,
): ProductInsight | null {
    const salesLast14Days = context.salesLast14DaysMap[product.id] || 0
    const daysSinceCreation = Math.floor(
        (context.now.getTime() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )

    // Priority 1: Sin ventas recientes
    if (salesLast14Days === 0 && daysSinceCreation >= 7) {
        return { key: 'sin_ventas', message: 'Sin ventas recientes' }
    }

    // Priority 2: Se vende bien
    if (context.topProductsSet.has(product.id)) {
        return { key: 'top', message: 'Se vende bien' }
    }

    // Priority 3: Stock bajo
    const effectiveThreshold = product.low_stock_threshold ?? context.threshold
    if (product.stock > 0 && product.stock <= effectiveThreshold) {
        return { key: 'stock_bajo', message: 'Stock bajo' }
    }

    // Priority 4: Buen margen
    if (product.sale_price > 0 && product.cpp > 0) {
        const margin = (product.sale_price - product.cpp) / product.sale_price
        if (margin >= 0.3) {
            return { key: 'buen_margen', message: 'Buen margen' }
        }
    }

    return null
}

// ─── Filter Helpers ────────────────────────────────────────

export type ProductFilter = 'todos' | 'mas_vendidos' | 'sin_movimiento' | 'sin_stock'

export function filterProducts(
    products: Product[],
    filter: ProductFilter,
    context: SignalContext,
): Product[] {
    switch (filter) {
        case 'mas_vendidos':
            return products.filter(p => context.topProductsSet.has(p.id))
        case 'sin_movimiento':
            return products.filter(p => (context.salesLast14DaysMap[p.id] || 0) === 0)
        case 'sin_stock':
            return products.filter(p => p.stock === 0)
        case 'todos':
        default:
            return products
    }
}

// ─── Signal Style Map ──────────────────────────────────────

const SIGNAL_STYLES: Record<string, { bg: string; text: string }> = {
    red: { bg: 'rgba(239, 68, 68, 0.12)', text: '#EF4444' },
    yellow: { bg: 'rgba(245, 158, 11, 0.12)', text: '#F59E0B' },
    green: { bg: 'rgba(74, 222, 128, 0.12)', text: '#4ade80' },
    gray: { bg: 'rgba(148, 163, 184, 0.12)', text: '#94A3B8' },
}

export function getSignalStyle(color: ProductSignal['color']) {
    return SIGNAL_STYLES[color]
}
