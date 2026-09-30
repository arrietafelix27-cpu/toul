'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Edit3, PackageMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ProductDetailView, type MovementLine, type Presentation } from '@/components/products/ProductDetailView'
import { REASON_LABEL, formatMovementDate } from '@/lib/products/movements'

const supabase = createClient()
const DAYS = 14

/* ══════════════════════════════════════════════════════════════
   Detalle comercial de una presentación.
   Inventario responde "cuánto queda y qué se movió"; esta pantalla
   responde "a cómo la vendo, cuánto me cuesta y cuánto dejo".
   ══════════════════════════════════════════════════════════════ */

export default function PresentationDetailPage({ params }: { params: Promise<{ id: string; variantId: string }> }) {
    const { id, variantId } = use(params)

    const { data, isLoading } = useSWR(['presentacion', id, variantId], async () => {
        const since = new Date(Date.now() - DAYS * 86400000).toISOString()

        const [productRes, variantsRes, stockRes, movementsRes, saleItemsRes] = await Promise.all([
            supabase.from('products').select('id, name, reference, image_url, images, category:product_categories(name)').eq('id', id).single(),
            supabase.from('product_variants').select('id, name, sale_price, cpp, cost_price').eq('product_id', id).eq('is_active', true).order('name'),
            supabase.from('inventory_adjustments').select('variant_id, quantity').eq('product_id', id),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at').eq('variant_id', variantId).order('created_at', { ascending: false }).limit(8),
            supabase.from('sale_items').select('quantity, unit_price, sales!inner(created_at)').eq('variant_id', variantId).gte('sales.created_at', since),
        ])

        const product = productRes.data as Record<string, unknown> | null
        const variants = (variantsRes.data ?? []) as { id: string; name: string; sale_price: number; cpp: number; cost_price: number }[]
        const variant = variants.find(v => v.id === variantId)
        if (!product || !variant) return null

        // El stock de cada presentación es la suma de sus movimientos
        const stockByVariant = new Map<string, number>()
        for (const row of (stockRes.data ?? []) as { variant_id: string | null; quantity: number }[]) {
            if (row.variant_id) stockByVariant.set(row.variant_id, (stockByVariant.get(row.variant_id) ?? 0) + Number(row.quantity))
        }

        const siblings: Presentation[] = variants
            .filter(v => v.id !== variantId)
            .map(v => ({
                id: v.id,
                name: v.name,
                price: Number(v.sale_price),
                stock: Math.max(0, Math.round(stockByVariant.get(v.id) ?? 0)),
                href: `/products/${id}/presentacion/${v.id}`,
            }))

        const movements: MovementLine[] = ((movementsRes.data ?? []) as { id: string; quantity: number; reason: string; notes: string | null; created_at: string }[])
            .map(movement => ({
                id: movement.id,
                label: movement.notes || REASON_LABEL[movement.reason] || 'Movimiento',
                quantity: Number(movement.quantity),
                date: formatMovementDate(movement.created_at),
            }))

        const saleItems = (saleItemsRes.data ?? []) as { quantity: number; unit_price: number }[]

        return {
            product,
            variant,
            siblings,
            movements,
            stock: Math.max(0, Math.round(stockByVariant.get(variantId) ?? 0)),
            sales: {
                units: saleItems.reduce((sum, item) => sum + Number(item.quantity), 0),
                revenue: Math.round(saleItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0)),
                days: DAYS,
            },
        }
    }, { revalidateOnFocus: false })

    if (isLoading) {
        return (
            <div className="px-4 md:px-8 pt-6 max-w-2xl mx-auto flex flex-col gap-3">
                <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
                <div className="skeleton" style={{ height: 90, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
            </div>
        )
    }

    if (!data) {
        return (
            <div className="px-4 pt-10 max-w-2xl mx-auto" style={{ textAlign: 'center' }}>
                <p style={{ color: 'var(--toul-text-muted)', margin: '0 0 14px' }}>Esta presentación ya no existe.</p>
                <Link href={`/products/${id}`} style={{ color: 'var(--toul-accent)', fontWeight: 600, textDecoration: 'none' }}>
                    Volver al producto
                </Link>
            </div>
        )
    }

    const product = data.product as {
        id: string; name: string; reference: string | null
        image_url: string | null; images: string[] | null
        category: { name: string } | null
    }

    const price = Number(data.variant.sale_price)
    const cost = Number(data.variant.cpp) || Number(data.variant.cost_price) || 0
    const margin = price > 0 ? ((price - cost) / price) * 100 : null
    const images = [...(product.images ?? []), product.image_url].filter(Boolean) as string[]

    const insight = data.sales.units === 0
        ? 'Esta presentación no se ha vendido en las últimas dos semanas. Revisa el precio o muévela en el mostrador.'
        : `Se están vendiendo ${(data.sales.units / DAYS * 7).toFixed(1)} unidades por semana de esta presentación.`

    return (
        <ProductDetailView
            kind="presentacion"
            name={data.variant.name}
            parent={{ name: product.name, href: `/products/${product.id}` }}
            categoryName={product.category?.name ?? null}
            reference={product.reference}
            images={images}
            priceLabel={formatCOP(price)}
            cost={cost || null}
            margin={margin}
            stock={data.stock}
            stockValue={Math.round(data.stock * cost)}
            presentations={data.siblings}
            sales={data.sales}
            insight={insight}
            movements={data.movements}
            backHref={`/products/${product.id}`}
            actions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={`/inventory/variant/${data.variant.id}`}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 14px', borderRadius: 12,
                            background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text-muted)',
                            fontSize: 14, fontWeight: 500, textDecoration: 'none',
                        }}>
                        <PackageMinus size={16} /> Inventario
                    </Link>
                    <Link href={`/products/${product.id}/edit`}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', borderRadius: 12,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                            boxShadow: '0 4px 20px var(--toul-accent-glow)',
                        }}>
                        <Edit3 size={16} /> Editar
                    </Link>
                </div>
            }
        />
    )
}
