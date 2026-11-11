'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { REASON_LABEL, formatMovementDate } from '@/lib/products/movements'
import { explainError } from '@/lib/errors'
import { costoDeProducto, minimoAutomatico, stockDeProducto, vendidasEn30 } from './calculos'

/* ══════════════════════════════════════════════════════════════
   Los datos del detalle de inventario: de un producto y de una
   talla o presentación. Cuánto hay, a qué costo, cuánto salió en
   30 días, el mínimo y los últimos movimientos.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()
const DAYS = 30

export interface Movimiento {
    id: string
    label: string
    quantity: number
    date: string
    /** Quién lo movió */
    author: string | null
}

export interface PresentacionDetalle {
    id: string
    name: string
    stock: number
    href: string
}

const autor = (nombre: string | null) => nombre === 'Administrador' ? null : (nombre ?? null)

/** Lo vendido en 30 días, contando lo que salió dentro de los combos
 *  (toul_vendido_30d). Si la base todavía no tiene esa función, cuenta
 *  solo lo vendido suelto, como antes */
async function vendido30(productId: string, variantId: string | null): Promise<number> {
    const { data, error } = await supabase.rpc('toul_vendido_30d', { p_product_id: productId, p_variant_id: variantId })
    if (!error) return Math.round(Number(data) || 0)

    const since = new Date(Date.now() - DAYS * 86400000).toISOString()
    const query = supabase.from('sale_items').select('quantity, sales!inner(created_at)').gte('sales.created_at', since)
    const { data: rows, error: errorFilas } = await (variantId ? query.eq('variant_id', variantId) : query.eq('product_id', productId))
    // Sin internet no es "no se ha vendido"
    if (errorFilas) throw errorFilas
    return vendidasEn30(rows ?? [])
}

/** "No existe" es una respuesta; sin internet o sin permiso es un error y se avisa */
function siFallo(res: { error: { code?: string } | null }, noExisteEsValido = false) {
    if (!res.error) return
    if (noExisteEsValido && res.error.code === 'PGRST116') return
    throw res.error
}

/** Avisa y vuelve a pedir el detalle después de cambiar el mínimo */
async function guardarMinimo(tabla: 'products' | 'product_variants', id: string, value: number | null, mutate: () => Promise<unknown>) {
    const { error } = await supabase.from(tabla).update({ low_stock_threshold: value }).eq('id', id)
    if (error) { toast.error(explainError(error)); return }
    await mutate()
    toast.success(value === null ? 'Vuelve a calcularse solo' : `Te avisamos con ${value} o menos`)
}

/* ── Un producto ────────────────────────────────────────────── */

export function useDetalleProducto(id: string) {
    const { data, error, isLoading, mutate } = useSWR(['inv-producto', id], async () => {
        const [productRes, variantsRes, movementsRes, sold30d, storeRes] = await Promise.all([
            supabase.from('products').select('id, store_id, name, reference, image_url, images, stock, cpp, low_stock_threshold').eq('id', id).single(),
            supabase.from('product_variants').select('id, name, stock, cpp, low_stock_threshold')
                .eq('product_id', id).eq('is_active', true).order('name'),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at, variant_id, created_by_name')
                .eq('product_id', id).order('created_at', { ascending: false }).limit(10),
            vendido30(id, null),
            supabase.from('stores').select('stock_coverage_days').limit(1).single(),
        ])

        siFallo(productRes, true)
        siFallo(variantsRes)
        siFallo(movementsRes)
        siFallo(storeRes)
        if (!productRes.data) return null
        const variants = variantsRes.data ?? []
        const variantName = new Map(variants.map(v => [v.id, v.name]))

        const movements: Movimiento[] = (movementsRes.data ?? []).map(row => {
            const reason = row.notes || REASON_LABEL[row.reason] || 'Movimiento'
            const presentation = row.variant_id ? variantName.get(row.variant_id) : null
            return {
                id: row.id,
                label: presentation ? `${reason} · ${presentation}` : reason,
                quantity: Number(row.quantity),
                date: formatMovementDate(row.created_at),
                author: autor(row.created_by_name),
            }
        })

        return {
            product: productRes.data,
            variants,
            movements,
            sold30d,
            coverageDays: (storeRes.data?.stock_coverage_days ?? 7) as number,
        }
    }, { revalidateOnFocus: false })

    const saveMin = useCallback((value: number | null) => guardarMinimo('products', id, value, mutate), [id, mutate])

    // Con presentaciones, el costo del padre es cero: el costo real
    // es el promedio de lo que hay guardado en cada una
    const detalle = data ? (() => {
        const { product, variants, sold30d, coverageDays } = data
        const manualMin = (product.low_stock_threshold ?? null) as number | null
        const presentations: PresentacionDetalle[] = variants.map(v => ({
            id: v.id, name: v.name, stock: Number(v.stock) || 0,
            href: `/inventory/variant/${v.id}`,
        }))
        return {
            ...data,
            hasVariants: variants.length > 0,
            stock: stockDeProducto(variants, product.stock),
            cost: Math.round(costoDeProducto(variants, product.cpp)),
            manualMin,
            minStock: manualMin ?? minimoAutomatico(sold30d, coverageDays),
            presentations,
        }
    })() : null

    return { detalle, error, isLoading, mutate, saveMin }
}

/* ── Una talla o presentación ───────────────────────────────── */

export function useDetallePresentacion(variantId: string) {
    const { data, error, isLoading, mutate } = useSWR(['inv-presentacion', variantId], async () => {
        const variantRes = await supabase.from('product_variants')
            .select('id, store_id, product_id, name, stock, cpp, low_stock_threshold')
            .eq('id', variantId).single()
        siFallo(variantRes, true)
        const variant = variantRes.data
        if (!variant) return null

        const [productRes, movementsRes, sold30d, storeRes] = await Promise.all([
            supabase.from('products').select('id, name, reference, image_url, images').eq('id', variant.product_id).single(),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at, created_by_name')
                .eq('variant_id', variantId).order('created_at', { ascending: false }).limit(10),
            vendido30(variant.product_id, variantId),
            supabase.from('stores').select('stock_coverage_days').limit(1).single(),
        ])
        siFallo(productRes, true)
        siFallo(movementsRes)
        siFallo(storeRes)

        const movements: Movimiento[] = (movementsRes.data ?? []).map(row => ({
            id: row.id,
            label: row.notes || REASON_LABEL[row.reason] || 'Movimiento',
            quantity: Number(row.quantity),
            date: formatMovementDate(row.created_at),
            author: autor(row.created_by_name),
        }))

        return {
            variant,
            product: productRes.data,
            movements,
            sold30d,
            coverageDays: (storeRes.data?.stock_coverage_days ?? 7) as number,
        }
    }, { revalidateOnFocus: false })

    const saveMin = useCallback((value: number | null) => guardarMinimo('product_variants', variantId, value, mutate), [variantId, mutate])

    const detalle = data && data.product ? (() => {
        const { variant, product, sold30d, coverageDays } = data
        const manualMin = (variant.low_stock_threshold ?? null) as number | null
        return {
            ...data,
            product,
            stock: Number(variant.stock) || 0,
            cost: Number(variant.cpp) || 0,
            manualMin,
            minStock: manualMin ?? minimoAutomatico(sold30d, coverageDays),
        }
    })() : null

    return { detalle, error, isLoading, mutate, saveMin }
}
