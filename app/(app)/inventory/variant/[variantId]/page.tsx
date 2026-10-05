'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { StockDetail, StockDetailSkeleton, type StockMovement } from '@/components/inventory/StockDetail'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { REASON_LABEL, formatMovementDate } from '@/lib/products/movements'
import { explainError } from '@/lib/errors'

const supabase = createClient()
const DAYS = 30

export default function InventoryVariantPage({ params }: { params: Promise<{ variantId: string }> }) {
    const { variantId } = use(params)
    const [adjustOpen, setAdjustOpen] = useState(false)

    const { data, isLoading, mutate } = useSWR(['inv-presentacion', variantId], async () => {
        const since = new Date(Date.now() - DAYS * 86400000).toISOString()

        const { data: variant } = await supabase.from('product_variants')
            .select('id, store_id, product_id, name, stock, cpp, low_stock_threshold')
            .eq('id', variantId).single()
        if (!variant) return null

        const [productRes, movementsRes, soldRes, storeRes] = await Promise.all([
            supabase.from('products').select('id, name, reference, image_url, images').eq('id', variant.product_id).single(),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at')
                .eq('variant_id', variantId).order('created_at', { ascending: false }).limit(10),
            supabase.from('sale_items').select('quantity, sales!inner(created_at)')
                .eq('variant_id', variantId).gte('sales.created_at', since),
            supabase.from('stores').select('stock_coverage_days').limit(1).single(),
        ])

        const movements: StockMovement[] = (movementsRes.data ?? []).map(row => ({
            id: row.id,
            label: row.notes || REASON_LABEL[row.reason] || 'Movimiento',
            quantity: Number(row.quantity),
            date: formatMovementDate(row.created_at),
        }))

        return {
            variant,
            product: productRes.data,
            movements,
            sold30d: (soldRes.data ?? []).reduce((sum, item) => sum + Number(item.quantity), 0),
            coverageDays: storeRes.data?.stock_coverage_days ?? 7,
        }
    }, { revalidateOnFocus: false })

    if (isLoading) return <StockDetailSkeleton />
    if (!data || !data.product) {
        return (
            <div className="px-4 pt-10 max-w-xl mx-auto" style={{ textAlign: 'center', color: 'var(--toul-text-muted)' }}>
                Esta presentación ya no existe.
            </div>
        )
    }

    const { variant, product, movements, sold30d, coverageDays } = data
    const manualMin = variant.low_stock_threshold ?? null
    const autoMin = Math.max(Math.ceil((sold30d / 30) * coverageDays), 1)

    async function saveMin(value: number | null) {
        const { error } = await supabase.from('product_variants').update({ low_stock_threshold: value }).eq('id', variantId)
        if (error) { toast.error(explainError(error)); return }
        await mutate()
        toast.success(value === null ? 'Vuelve a calcularse solo' : `Te avisamos con ${value} o menos`)
    }

    return (
        <>
            <StockDetail
                name={variant.name}
                parent={{ name: product.name, href: `/inventory/${product.id}` }}
                reference={product.reference}
                image={(product.images?.[0] as string | undefined) ?? product.image_url}
                stock={Number(variant.stock) || 0}
                cost={Number(variant.cpp) || 0}
                sold30d={sold30d}
                minStock={manualMin ?? autoMin}
                manualMin={manualMin}
                coverageDays={coverageDays}
                movements={movements}
                backHref={`/inventory/${product.id}`}
                catalogHref={`/products/${product.id}/presentacion/${variant.id}`}
                buyHref={`/inventory/purchase?product=${product.id}&variant=${variant.id}`}
                onAdjust={() => setAdjustOpen(true)}
                onSaveMin={saveMin}
            />

            <StockAdjustSheet
                open={adjustOpen}
                storeId={variant.store_id}
                onClose={() => setAdjustOpen(false)}
                onDone={mutate}
                preselect={{ productId: product.id, variantId: variant.id }}
            />
        </>
    )
}
