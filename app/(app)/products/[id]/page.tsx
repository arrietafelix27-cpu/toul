'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Edit3, PackageMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ProductDetailView, ProductDetailSkeleton, type MovementLine, type Presentation } from '@/components/products/ProductDetailView'
import { REASON_LABEL, formatMovementDate } from '@/lib/products/movements'

const supabase = createClient()
const DAYS = 14

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)

    const { data, isLoading } = useSWR(['producto', id], async () => {
        const since = new Date(Date.now() - DAYS * 86400000).toISOString()

        const [productRes, variantsRes, stockRes, movementsRes, saleItemsRes] = await Promise.all([
            supabase.from('products').select('*, category:product_categories(id, name)').eq('id', id).single(),
            supabase.from('product_variants').select('id, name, sale_price, cpp, cost_price').eq('product_id', id).eq('is_active', true).order('name'),
            supabase.from('inventory_adjustments').select('variant_id, quantity').eq('product_id', id),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at, variant_id').eq('product_id', id).order('created_at', { ascending: false }).limit(8),
            supabase.from('sale_items').select('quantity, unit_price, sales!inner(created_at)').eq('product_id', id).gte('sales.created_at', since),
        ])

        const product = productRes.data as Record<string, unknown> | null
        if (!product) return null

        const variants = (variantsRes.data ?? []) as { id: string; name: string; sale_price: number; cpp: number; cost_price: number }[]

        // El stock de cada presentación es la suma de todos sus movimientos
        const stockByVariant = new Map<string, number>()
        for (const row of (stockRes.data ?? []) as { variant_id: string | null; quantity: number }[]) {
            if (row.variant_id) stockByVariant.set(row.variant_id, (stockByVariant.get(row.variant_id) ?? 0) + Number(row.quantity))
        }

        const presentations: Presentation[] = variants.map(variant => ({
            id: variant.id,
            name: variant.name,
            price: Number(variant.sale_price),
            stock: Math.max(0, Math.round(stockByVariant.get(variant.id) ?? 0)),
            href: `/products/${id}/presentacion/${variant.id}`,
        }))

        // Costo y margen salen de las presentaciones, no del producto padre:
        // en un producto con presentaciones el padre no guarda costo
        const costByVariant = new Map(variants.map(v => [v.id, Number(v.cpp) || Number(v.cost_price) || 0]))
        const totalUnits = presentations.reduce((sum, p) => sum + p.stock, 0)
        const totalCost = presentations.reduce((sum, p) => sum + p.stock * (costByVariant.get(p.id) ?? 0), 0)
        const variantCosts = variants.map(v => costByVariant.get(v.id) ?? 0).filter(c => c > 0)
        const variantCost = totalUnits > 0
            ? totalCost / totalUnits
            : variantCosts.length ? variantCosts.reduce((a, b) => a + b, 0) / variantCosts.length : 0

        const saleItems = (saleItemsRes.data ?? []) as { quantity: number; unit_price: number }[]
        const units = saleItems.reduce((sum, item) => sum + Number(item.quantity), 0)
        const revenue = saleItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0)

        const variantName = new Map(variants.map(v => [v.id, v.name]))
        const movements: MovementLine[] = ((movementsRes.data ?? []) as { id: string; quantity: number; reason: string; notes: string | null; created_at: string; variant_id: string | null }[])
            .map(adjustment => {
                const reason = adjustment.notes || REASON_LABEL[adjustment.reason] || 'Movimiento'
                const presentation = adjustment.variant_id ? variantName.get(adjustment.variant_id) : null
                return {
                    id: adjustment.id,
                    // Con presentaciones hay que poder ver de cuál salió o entró
                    label: presentation ? `${reason} · ${presentation}` : reason,
                    quantity: Number(adjustment.quantity),
                    date: formatMovementDate(adjustment.created_at),
                }
            })

        return {
            product, presentations, movements,
            variantStock: totalUnits,
            variantCost,
            sales: { units, revenue: Math.round(revenue), days: DAYS },
        }
    }, { revalidateOnFocus: false })

    if (isLoading || !data) return <ProductDetailSkeleton />

    const product = data.product as {
        id: string; name: string; sale_price: number; cpp: number; cost_price: number; stock: number
        reference: string | null; image_url: string | null; images: string[] | null
        category: { name: string } | null
    }

    const hasPresentations = data.presentations.length > 0
    const prices = data.presentations.map(p => p.price)
    const priceLabel = hasPresentations
        ? (Math.min(...prices) === Math.max(...prices)
            ? formatCOP(Math.min(...prices))
            : `${formatCOP(Math.min(...prices))} – ${formatCOP(Math.max(...prices))}`)
        : formatCOP(Number(product.sale_price))

    const cost = hasPresentations ? data.variantCost : (Number(product.cpp) || Number(product.cost_price) || 0)
    const stock = hasPresentations ? data.variantStock : Number(product.stock)
    const price = hasPresentations ? (prices.reduce((a, b) => a + b, 0) / prices.length) : Number(product.sale_price)
    const margin = price > 0 && cost > 0 ? ((price - cost) / price) * 100 : null

    const images = [...(product.images ?? []), product.image_url].filter(Boolean) as string[]

    const insight = data.sales.units === 0
        ? 'No se ha vendido en las últimas dos semanas. Revisa el precio o dale más visibilidad.'
        : `Se están vendiendo ${(data.sales.units / DAYS * 7).toFixed(1)} unidades por semana.`

    return (
        <ProductDetailView
            kind={hasPresentations ? 'presentaciones' : 'simple'}
            name={product.name}
            categoryName={product.category?.name ?? null}
            reference={product.reference}
            images={images}
            priceLabel={priceLabel}
            cost={cost || null}
            margin={margin}
            stock={stock}
            stockValue={Math.round(stock * cost)}
            presentations={data.presentations}
            sales={data.sales}
            insight={insight}
            movements={data.movements}
            actions={
                <div style={{ display: 'flex', gap: 8 }}>
                    <Link href={`/inventory/${product.id}`}
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
