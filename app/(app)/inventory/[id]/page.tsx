'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { StockDetail, StockDetailSkeleton, type StockMovement, type StockPresentation } from '@/components/inventory/StockDetail'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { VariantManager } from '@/components/inventory/VariantManager'
import { REASON_LABEL, formatMovementDate } from '@/lib/products/movements'
import { explainError } from '@/lib/errors'

const supabase = createClient()
const DAYS = 30

export default function InventoryProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [adjustOpen, setAdjustOpen] = useState(false)

    const { data, isLoading, mutate } = useSWR(['inv-producto', id], async () => {
        const since = new Date(Date.now() - DAYS * 86400000).toISOString()

        const [productRes, variantsRes, movementsRes, soldRes, storeRes] = await Promise.all([
            supabase.from('products').select('id, store_id, name, reference, image_url, images, stock, cpp, low_stock_threshold').eq('id', id).single(),
            supabase.from('product_variants').select('id, name, stock, cpp, low_stock_threshold')
                .eq('product_id', id).eq('is_active', true).order('name'),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at, variant_id, created_by_name')
                .eq('product_id', id).order('created_at', { ascending: false }).limit(10),
            supabase.from('sale_items').select('quantity, variant_id, sales!inner(created_at)')
                .eq('product_id', id).gte('sales.created_at', since),
            supabase.from('stores').select('stock_coverage_days').limit(1).single(),
        ])

        if (!productRes.data) return null
        const variants = variantsRes.data ?? []
        const sold = (soldRes.data ?? []) as { quantity: number; variant_id: string | null }[]
        const variantName = new Map(variants.map(v => [v.id, v.name]))

        const movements: StockMovement[] = (movementsRes.data ?? []).map(row => {
            const reason = row.notes || REASON_LABEL[row.reason] || 'Movimiento'
            const presentation = row.variant_id ? variantName.get(row.variant_id) : null
            return {
                id: row.id,
                label: presentation ? `${reason} · ${presentation}` : reason,
                quantity: Number(row.quantity),
                date: formatMovementDate(row.created_at),
                author: row.created_by_name === 'Administrador' ? null : (row.created_by_name ?? null),
            }
        })

        return {
            product: productRes.data,
            variants,
            movements,
            sold30d: sold.reduce((sum, item) => sum + Number(item.quantity), 0),
            coverageDays: storeRes.data?.stock_coverage_days ?? 7,
        }
    }, { revalidateOnFocus: false })

    if (isLoading) return <StockDetailSkeleton />
    if (!data) {
        return (
            <div className="px-4 pt-10 max-w-xl mx-auto" style={{ textAlign: 'center', color: 'var(--toul-text-muted)' }}>
                Este producto ya no existe.
            </div>
        )
    }

    const { product, variants, movements, sold30d, coverageDays } = data
    const hasVariants = variants.length > 0

    const stock = hasVariants
        ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
        : Number(product.stock) || 0

    // Con presentaciones, el costo del padre es cero: el costo real
    // es el promedio de lo que hay guardado en cada una
    const cost = hasVariants
        ? (stock > 0
            ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0) * (Number(v.cpp) || 0), 0) / stock
            : 0)
        : Number(product.cpp) || 0

    const manualMin = product.low_stock_threshold ?? null
    const autoMin = Math.max(Math.ceil((sold30d / 30) * coverageDays), 1)
    const minStock = manualMin ?? autoMin

    const presentations: StockPresentation[] = variants.map(v => ({
        id: v.id, name: v.name, stock: Number(v.stock) || 0,
        href: `/inventory/variant/${v.id}`,
    }))

    async function saveMin(value: number | null) {
        const { error } = await supabase.from('products').update({ low_stock_threshold: value }).eq('id', id)
        if (error) { toast.error(explainError(error)); return }
        await mutate()
        toast.success(value === null ? 'Vuelve a calcularse solo' : `Te avisamos con ${value} o menos`)
    }

    return (
        <>
            <StockDetail
                name={product.name}
                reference={product.reference}
                image={(product.images?.[0] as string | undefined) ?? product.image_url}
                stock={stock}
                cost={Math.round(cost)}
                sold30d={sold30d}
                minStock={minStock}
                manualMin={manualMin}
                coverageDays={coverageDays}
                presentations={presentations}
                movements={movements}
                backHref="/inventory"
                catalogHref={`/products/${product.id}`}
                buyHref={`/inventory/purchase?product=${product.id}`}
                onAdjust={() => setAdjustOpen(true)}
                onSaveMin={saveMin}
                readOnlyStock={hasVariants}
                extra={
                    <VariantManager
                        productId={product.id}
                        storeId={product.store_id}
                        variants={variants}
                        onChange={mutate}
                    />
                }
            />

            <StockAdjustSheet
                open={adjustOpen}
                storeId={product.store_id}
                onClose={() => setAdjustOpen(false)}
                onDone={mutate}
                preselect={{ productId: product.id }}
            />
        </>
    )
}
