'use client'
import { useMemo } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, Pencil, Layers, ShoppingBag, TrendingUp, Wallet, Tag,
} from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { fadeUp } from '@/lib/motion'

const supabase = createClient()

type ComboItemRow = {
    id: string
    quantity: number
    product_id: string | null
    variant_id: string | null
    products: { id: string; name: string; sale_price: number; cpp: number; image_url: string | null } | null
    product_variants: {
        id: string
        name: string
        sale_price: number
        cpp: number
        products: { id: string; name: string; image_url: string | null } | null
    } | null
}

export default function ComboDetailPage() {
    const { comboId } = useParams<{ comboId: string }>()

    const { data: combo, isLoading: comboLoading } = useSWR(
        ['combo-detail', comboId],
        async () => {
            const { data } = await supabase
                .from('combos')
                .select('id, name, sale_price, image_url')
                .eq('id', comboId)
                .single()
            return data
        }
    )

    const { data: items, isLoading: itemsLoading } = useSWR(
        ['combo-items', comboId],
        async () => {
            const { data } = await supabase
                .from('combo_items')
                .select(`
                    id, quantity, product_id, variant_id,
                    products!product_id(id, name, sale_price, cpp, image_url),
                    product_variants!variant_id(id, name, sale_price, cpp,
                        products!product_id(id, name, image_url)
                    )
                `)
                .eq('combo_id', comboId)
            return (data ?? []) as unknown as ComboItemRow[]
        }
    )

    const financials = useMemo(() => {
        if (!items || !combo) return null
        let regularPrice = 0
        let comboCost = 0
        for (const item of items) {
            const unitPrice = item.products?.sale_price ?? item.product_variants?.sale_price ?? 0
            const unitCpp = item.products?.cpp ?? item.product_variants?.cpp ?? 0
            regularPrice += unitPrice * item.quantity
            comboCost += unitCpp * item.quantity
        }
        const comboPrice = combo.sale_price
        return {
            regularPrice: Math.round(regularPrice),
            comboCost: Math.round(comboCost),
            comboPrice: Math.round(comboPrice),
            estimatedProfit: Math.round(comboPrice - comboCost),
            clientSavings: Math.round(regularPrice - comboPrice),
        }
    }, [items, combo])

    const isLoading = comboLoading || itemsLoading

    if (isLoading) return (
        <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
            <div className="h-8 w-40 rounded-xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="h-48 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="h-40 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
        </div>
    )

    if (!combo) return (
        <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>
            Combo no encontrado
        </div>
    )

    const comboPrice = Math.round(combo.sale_price)
    const showStrikethrough = financials && financials.regularPrice > comboPrice

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center gap-3 mb-6"
                style={{ position: 'relative' }}>
                <Link href="/products"
                    className="flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                        <span style={{
                            fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em',
                            padding: '3px 9px', borderRadius: 999,
                            background: 'var(--toul-accent-dim)',
                            color: 'var(--toul-accent)',
                            border: '1px solid var(--toul-border-focused)',
                        }}>
                            Combo
                        </span>
                    </div>
                    <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {combo.name}
                    </h1>
                </div>
                <Link href={`/products/combo/${comboId}/edit`}
                    className="flex items-center gap-2 transition-all active:scale-95 flex-shrink-0"
                    style={{
                        padding: '9px 14px',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        color: '#000',
                        background: 'var(--toul-accent)',
                        textDecoration: 'none',
                        boxShadow: '0 4px 16px var(--toul-accent-glow)',
                    }}>
                    <Pencil size={14} strokeWidth={2.4} /> Editar
                </Link>
            </motion.div>

            {/* Image + Price Hero */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card p-5 mb-4 flex flex-col items-center gap-4">
                {combo.image_url ? (
                    <img
                        src={combo.image_url}
                        alt={combo.name}
                        className="rounded-xl object-cover"
                        style={{ width: 160, height: 160 }}
                    />
                ) : (
                    <div className="rounded-xl flex items-center justify-center"
                        style={{ width: 160, height: 160, background: 'var(--toul-surface-2)', color: 'var(--toul-border-2)' }}>
                        <Layers size={48} />
                    </div>
                )}
                <div className="w-full text-center">
                    <p className="text-xs uppercase tracking-wider font-semibold mb-1"
                        style={{ color: 'var(--toul-text-subtle)' }}>Precio del combo</p>
                    <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--toul-accent)', lineHeight: 1.1 }}>
                        {formatCOP(comboPrice)}
                    </p>
                    {showStrikethrough && (
                        <p className="mt-1 line-through" style={{ fontSize: 14, color: 'var(--toul-text-muted)' }}>
                            Precio regular: {formatCOP(financials!.regularPrice)}
                        </p>
                    )}
                </div>
            </motion.div>

            {/* Items incluidos */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card overflow-hidden mb-4">
                <div className="p-4 border-b" style={{ borderColor: 'var(--toul-border)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>
                        Productos incluidos
                    </p>
                </div>

                {!items || items.length === 0 ? (
                    <div className="flex flex-col items-center py-10 gap-2">
                        <ShoppingBag size={28} style={{ color: 'var(--toul-border-2)' }} />
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                            Sin productos en este combo
                        </p>
                    </div>
                ) : (
                    <div className="divide-y" style={{ borderColor: 'var(--toul-border)' }}>
                        {items.map(item => {
                            const isVariant = item.variant_id !== null
                            const productName = isVariant
                                ? item.product_variants?.products?.name ?? '—'
                                : item.products?.name ?? '—'
                            const variantName = isVariant ? item.product_variants?.name : null
                            const imageUrl = isVariant
                                ? item.product_variants?.products?.image_url
                                : item.products?.image_url
                            const unitPrice = isVariant
                                ? (item.product_variants?.sale_price ?? 0)
                                : (item.products?.sale_price ?? 0)

                            return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={productName}
                                            className="rounded-lg object-cover flex-shrink-0"
                                            style={{ width: 36, height: 36 }}
                                        />
                                    ) : (
                                        <div className="rounded-lg flex items-center justify-center flex-shrink-0"
                                            style={{ width: 36, height: 36, background: 'var(--toul-surface-2)', color: 'var(--toul-border-2)' }}>
                                            <Tag size={16} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" style={{ color: 'var(--toul-text)' }}>
                                            {productName}
                                        </p>
                                        {variantName && (
                                            <p className="text-xs truncate" style={{ color: 'var(--toul-text-muted)' }}>
                                                {variantName}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                            style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                            ×{item.quantity}
                                        </span>
                                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text-subtle)' }}>
                                            {formatCOP(Math.round(unitPrice))}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </motion.div>

            {/* Resumen financiero */}
            {financials && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="toul-card overflow-hidden">
                    <div className="p-4 border-b" style={{ borderColor: 'var(--toul-border)' }}>
                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>
                            Resumen financiero
                        </p>
                    </div>
                    <div className="divide-y" style={{ borderColor: 'var(--toul-border)' }}>

                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Tag size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                <p className="text-sm" style={{ color: 'var(--toul-text-subtle)' }}>Precio regular</p>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>
                                {formatCOP(financials.regularPrice)}
                            </p>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                                <Wallet size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                <p className="text-sm" style={{ color: 'var(--toul-text-subtle)' }}>Costo estimado</p>
                            </div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>
                                {formatCOP(financials.comboCost)}
                            </p>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3"
                            style={{ background: 'var(--toul-accent-dim)' }}>
                            <div className="flex items-center gap-2">
                                <ShoppingBag size={14} style={{ color: 'var(--toul-accent)' }} />
                                <p className="text-sm font-semibold" style={{ color: 'var(--toul-accent)' }}>Precio combo</p>
                            </div>
                            <p className="text-sm font-bold" style={{ color: 'var(--toul-accent)' }}>
                                {formatCOP(financials.comboPrice)}
                            </p>
                        </div>

                        <div className="flex items-center justify-between px-4 py-3">
                            <div className="flex items-center gap-2">
                                <TrendingUp size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                <p className="text-sm" style={{ color: 'var(--toul-text-subtle)' }}>Ganancia estimada</p>
                            </div>
                            <p className="text-sm font-semibold"
                                style={{ color: financials.estimatedProfit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                {formatCOP(financials.estimatedProfit)}
                            </p>
                        </div>

                        {financials.clientSavings > 0 && (
                            <div className="flex items-center justify-between px-4 py-3">
                                <div className="flex items-center gap-2">
                                    <Tag size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                    <p className="text-sm" style={{ color: 'var(--toul-text-subtle)' }}>Ahorro cliente</p>
                                </div>
                                <p className="text-sm font-semibold" style={{ color: 'var(--toul-warning)' }}>
                                    {formatCOP(financials.clientSavings)}
                                </p>
                            </div>
                        )}

                    </div>
                </motion.div>
            )}
        </div>
    )
}
