'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Edit3, PackageMinus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ProductDetailView, type MovementLine, type Presentation } from '@/components/products/ProductDetailView'

const supabase = createClient()
const DAYS = 14

const REASON_LABEL: Record<string, string> = {
    sale: 'Venta',
    purchase: 'Compra',
    reduction: 'Baja o merma',
    count: 'Conteo de inventario',
    void: 'Anulación de venta',
    initial: 'Stock inicial',
    reconciliation: 'Ajuste del sistema',
}

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)

    const { data, isLoading } = useSWR(['producto', id], async () => {
        const since = new Date(Date.now() - DAYS * 86400000).toISOString()

        const [productRes, variantsRes, adjustmentsRes, saleItemsRes] = await Promise.all([
            supabase.from('products').select('*, category:product_categories(id, name)').eq('id', id).single(),
            supabase.from('product_variants').select('id, name, sale_price, cpp').eq('product_id', id).eq('is_active', true).order('name'),
            supabase.from('inventory_adjustments').select('id, quantity, reason, notes, created_at, variant_id').eq('product_id', id).order('created_at', { ascending: false }).limit(60),
            supabase.from('sale_items').select('quantity, unit_price, sales!inner(created_at)').eq('product_id', id).gte('sales.created_at', since),
        ])

        const product = productRes.data as Record<string, unknown> | null
        if (!product) return null

        const adjustments = (adjustmentsRes.data ?? []) as { id: string; quantity: number; reason: string; notes: string | null; created_at: string; variant_id: string | null }[]

        // El stock de cada presentación vive en los movimientos de inventario
        const stockByVariant = new Map<string, number>()
        for (const adjustment of adjustments) {
            if (adjustment.variant_id) {
                stockByVariant.set(adjustment.variant_id, (stockByVariant.get(adjustment.variant_id) ?? 0) + Number(adjustment.quantity))
            }
        }

        const presentations: Presentation[] = (variantsRes.data ?? []).map(variant => ({
            id: variant.id,
            name: variant.name,
            price: Number(variant.sale_price),
            stock: Math.max(0, stockByVariant.get(variant.id) ?? 0),
            href: `/inventory/variant/${variant.id}`,
        }))

        const saleItems = (saleItemsRes.data ?? []) as { quantity: number; unit_price: number }[]
        const units = saleItems.reduce((sum, item) => sum + Number(item.quantity), 0)
        const revenue = saleItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0)

        const movements: MovementLine[] = adjustments.slice(0, 6).map(adjustment => ({
            id: adjustment.id,
            label: adjustment.notes || REASON_LABEL[adjustment.reason] || 'Movimiento',
            quantity: Number(adjustment.quantity),
            date: formatDate(adjustment.created_at),
        }))

        return { product, presentations, sales: { units, revenue, days: DAYS }, movements }
    }, { revalidateOnFocus: false })

    if (isLoading || !data) {
        return (
            <div className="px-4 md:px-8 pt-6 max-w-2xl mx-auto flex flex-col gap-3">
                <div className="skeleton" style={{ height: 220, borderRadius: 20 }} />
                <div className="skeleton" style={{ height: 90, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 160, borderRadius: 16 }} />
            </div>
        )
    }

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

    const cost = Number(product.cpp) || Number(product.cost_price) || 0
    const price = hasPresentations ? (prices.reduce((a, b) => a + b, 0) / prices.length) : Number(product.sale_price)
    const margin = price > 0 ? ((price - cost) / price) * 100 : null

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
            stock={Number(product.stock)}
            stockValue={Math.round(Number(product.stock) * cost)}
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
