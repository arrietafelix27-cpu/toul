'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Edit3 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ProductDetailView, ProductDetailSkeleton, type ComboComponent } from '@/components/products/ProductDetailView'

const supabase = createClient()

interface ComboItemRow {
    quantity: number
    product_id: string | null
    variant_id: string | null
    products: { name: string; cpp: number } | null
    product_variants: { name: string; cpp: number; product_id: string } | null
}

export default function ComboDetailPage({ params }: { params: Promise<{ comboId: string }> }) {
    const { comboId } = use(params)

    const { data, isLoading } = useSWR(['combo', comboId], async () => {
        const { data: combo } = await supabase
            .from('combos')
            .select(`id, name, sale_price, image_url,
                category:product_categories(name),
                combo_items(quantity, product_id, variant_id,
                    products!product_id(name, cpp),
                    product_variants!variant_id(name, cpp, product_id))`)
            .eq('id', comboId)
            .single()
        return combo as Record<string, unknown> | null
    }, { revalidateOnFocus: false })

    if (isLoading || !data) return <ProductDetailSkeleton />

    const combo = data as unknown as {
        id: string; name: string; sale_price: number; image_url: string | null
        category: { name: string } | null
        combo_items: ComboItemRow[]
    }

    const components: ComboComponent[] = (combo.combo_items ?? []).map((item, index) => ({
        id: `${item.product_id ?? item.variant_id ?? index}`,
        name: item.product_variants
            ? `${item.product_variants.name}`
            : item.products?.name ?? 'Producto',
        quantity: Number(item.quantity),
    }))

    // El costo del combo es la suma de lo que cuesta cada cosa que trae
    const cost = (combo.combo_items ?? []).reduce((sum, item) => {
        const unitCost = Number(item.product_variants?.cpp ?? item.products?.cpp ?? 0)
        return sum + unitCost * Number(item.quantity)
    }, 0)

    const price = Number(combo.sale_price)
    const margin = price > 0 ? ((price - cost) / price) * 100 : null

    return (
        <ProductDetailView
            kind="combo"
            name={combo.name}
            categoryName={combo.category?.name ?? null}
            images={combo.image_url ? [combo.image_url] : []}
            priceLabel={formatCOP(price)}
            cost={cost || null}
            margin={margin}
            components={components}
            actions={
                <Link href={`/products/combo/${combo.id}/edit`}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, height: 40, padding: '0 16px', borderRadius: 12,
                        background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                        boxShadow: '0 4px 20px var(--toul-accent-glow)',
                    }}>
                    <Edit3 size={16} /> Editar
                </Link>
            }
        />
    )
}
