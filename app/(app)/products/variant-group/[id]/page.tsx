'use client'
import { useMemo } from 'react'
import useSWR from 'swr'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStore } from '@/lib/hooks/useData'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Pencil, Package, Layers, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

type ProductData = {
    id: string
    name: string
    images: string[] | null
    image_url: string | null
    reference: string | null
}

type VariantDetail = {
    id: string
    name: string
    sale_price: number
    cpp: number
    low_stock_threshold: number | null
}

type AdjRow = { variant_id: string | null; quantity: number }
type SaleRow = { variant_id: string | null; quantity: number }
type StockStatus = 'ok' | 'low' | 'out'

function getStockStatus(stock: number, threshold: number): StockStatus {
    if (stock === 0) return 'out'
    if (stock <= threshold) return 'low'
    return 'ok'
}

function getStockStyle(status: StockStatus) {
    return {
        color: status === 'ok' ? 'var(--toul-accent)' : status === 'low' ? 'var(--toul-warning)' : 'var(--toul-text-subtle)',
        badgeBg: status === 'ok' ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
        label: status === 'ok' ? 'Disponible' : status === 'low' ? 'Stock bajo' : 'Sin stock',
    }
}

export default function VariantGroupPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()

    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    // 1. Producto padre
    const { data: product, isLoading: productLoading } = useSWR(
        (storeId && id) ? ['vg-product', id, storeId] : null,
        async () => {
            const { data } = await createClient()
                .from('products')
                .select('id, name, images, image_url, reference')
                .eq('id', id)
                .eq('store_id', storeId!)
                .single()
            return data as ProductData | null
        },
        { revalidateOnFocus: false }
    )

    // 2. Variantes activas
    const { data: variants, isLoading: variantsLoading } = useSWR(
        (storeId && id) ? ['vg-variants', id, storeId] : null,
        async () => {
            const { data } = await createClient()
                .from('product_variants')
                .select('id, name, sale_price, cpp, low_stock_threshold')
                .eq('product_id', id)
                .eq('store_id', storeId!)
                .eq('is_active', true)
                .order('name')
            return (data || []) as VariantDetail[]
        },
        { revalidateOnFocus: false }
    )

    // 3. Ajustes de inventario
    const { data: adjustments } = useSWR(
        (storeId && id) ? ['vg-adjustments', id, storeId] : null,
        async () => {
            const { data } = await createClient()
                .from('inventory_adjustments')
                .select('variant_id, quantity')
                .eq('product_id', id)
                .eq('store_id', storeId!)
            return ((data || []) as AdjRow[]).filter(a => a.variant_id !== null)
        },
        { revalidateOnFocus: false }
    )

    // 4. Ventas últimos 30 días
    const { data: saleItems } = useSWR(
        (storeId && id) ? ['vg-sales', id, storeId] : null,
        async () => {
            const since = new Date()
            since.setDate(since.getDate() - 30)
            const { data } = await createClient()
                .from('sale_items')
                .select('variant_id, quantity')
                .eq('product_id', id)
                .eq('store_id', storeId!)
                .gte('created_at', since.toISOString())
            return ((data || []) as SaleRow[]).filter(s => s.variant_id !== null)
        },
        { revalidateOnFocus: false }
    )

    // ─── Cómputos en memoria ──────────────────────────────────
    const stockByVariant = useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {}
        for (const adj of adjustments || []) {
            if (adj.variant_id) map[adj.variant_id] = (map[adj.variant_id] || 0) + adj.quantity
        }
        for (const k in map) map[k] = Math.round(map[k])
        return map
    }, [adjustments])

    const salesByVariant = useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {}
        for (const s of saleItems || []) {
            if (s.variant_id) map[s.variant_id] = (map[s.variant_id] || 0) + s.quantity
        }
        return map
    }, [saleItems])

    const totalStock = useMemo(
        () => Math.round(Object.values(stockByVariant).reduce((a, b) => a + b, 0)),
        [stockByVariant]
    )
    const variantCount = variants?.length ?? 0
    const totalSold30d = useMemo(
        () => Math.round(Object.values(salesByVariant).reduce((a, b) => a + b, 0)),
        [salesByVariant]
    )
    const bestVariantName = useMemo(() => {
        if (!variants || Object.keys(salesByVariant).length === 0) return null
        const [bestId] = Object.entries(salesByVariant).sort((a, b) => b[1] - a[1])[0]
        return variants.find(v => v.id === bestId)?.name ?? null
    }, [variants, salesByVariant])

    if (!id || storeLoading || productLoading || variantsLoading) return <LoadingSkeleton />

    if (!product) return (
        <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>
            Producto no encontrado
        </div>
    )

    const imageSrc = product.images?.[0] || product.image_url || null

    const metricsGrid = (
        <div className="grid grid-cols-2 gap-3">
            <MetricCard
                label="Total en stock"
                value={String(totalStock)}
                valueColor={totalStock > 0 ? 'var(--toul-accent)' : 'var(--toul-text-subtle)'}
            />
            <MetricCard
                label="Variantes activas"
                value={String(variantCount)}
                valueColor="var(--toul-text)"
            />
            <MetricCard
                label="Más vendida (30d)"
                value={bestVariantName ?? 'Sin datos'}
                valueColor={bestVariantName ? 'var(--toul-text)' : 'var(--toul-text-subtle)'}
                compact
            />
            <MetricCard
                label="Vendidas (30d)"
                value={String(totalSold30d)}
                valueColor="var(--toul-text)"
            />
        </div>
    )

    const emptyVariants = (
        <div className="toul-card flex flex-col items-center py-10 gap-2">
            <Layers size={28} style={{ color: 'var(--toul-border-2)' }} />
            <p style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>Sin variantes registradas</p>
        </div>
    )

    return (
        <div className="pt-6 pb-24" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* ── Header compartido ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center gap-3 px-4 md:px-8 mb-5"
                style={{ position: 'relative' }}>
                <Link href="/products"
                    className="flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                        textDecoration: 'none',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </Link>
                <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.name}
                    </p>
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        marginTop: 4,
                        padding: '3px 8px', borderRadius: 999,
                        background: 'var(--toul-info-dim)',
                        color: 'var(--toul-info)',
                        border: '1px solid rgba(10,132,255,0.2)',
                        fontSize: 11, fontWeight: 600, letterSpacing: '-0.01em',
                    }}>
                        <Layers size={10} strokeWidth={2.2} /> Con variantes
                    </span>
                </div>
                <Link href={`/products/${id}/edit`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg flex-shrink-0 transition-all active:scale-95"
                    style={{
                        background: 'var(--toul-surface)',
                        color: 'var(--toul-text)',
                        border: '1px solid var(--toul-border)',
                        textDecoration: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                    }}>
                    <Pencil size={12} /> Editar
                </Link>
            </motion.div>

            {/* ── Layout móvil (md:hidden) ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="md:hidden px-4 flex flex-col gap-5">

                {/* Imagen */}
                <div className="flex items-center justify-center overflow-hidden"
                    style={{
                        height: 160,
                        background: 'var(--toul-surface)',
                        borderRadius: 14,
                        border: '1px solid var(--toul-border)',
                        padding: 12,
                    }}>
                    {imageSrc
                        ? <img src={imageSrc} alt={product.name} style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }} />
                        : <Package size={40} style={{ color: 'var(--toul-text-subtle)', opacity: 0.5 }} />
                    }
                </div>

                {/* Métricas 2×2 */}
                {metricsGrid}

                {/* Lista de variantes */}
                <div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--toul-text-subtle)', marginBottom: 10 }}>
                        Variantes
                    </p>
                    {!variants || variants.length === 0 ? emptyVariants : (
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            className="flex flex-col gap-2">
                            {variants.map(v => {
                                const stock = stockByVariant[v.id] ?? 0
                                const status = getStockStatus(stock, v.low_stock_threshold ?? 5)
                                const { color: stockColor, badgeBg, label: badgeLabel } = getStockStyle(status)
                                return (
                                    <motion.div key={v.id} variants={staggerItem}
                                        style={{ opacity: status === 'out' ? 0.5 : 1 }}>
                                        <Link href={`/products/${id}/edit`} style={{ textDecoration: 'none' }}>
                                            <div className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-[0.99]"
                                                style={{ background: 'var(--toul-surface)', borderColor: 'var(--toul-border)' }}>
                                                <div className="flex-1 min-w-0">
                                                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)', marginBottom: 2 }}>
                                                        {v.name}
                                                    </p>
                                                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--toul-accent)' }}>
                                                        {formatCOP(Math.round(v.sale_price))}
                                                    </p>
                                                    {v.cpp > 0 && (
                                                        <p style={{ fontSize: 10, color: 'var(--toul-text-muted)', marginTop: 2 }}>
                                                            Costo promedio: {formatCOP(Math.round(v.cpp))}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p style={{ fontSize: 18, fontWeight: 700, color: stockColor, lineHeight: 1 }}>
                                                        {stock}
                                                    </p>
                                                    <p style={{ fontSize: 10, color: 'var(--toul-text-muted)', margin: '2px 0 4px' }}>
                                                        en stock
                                                    </p>
                                                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: badgeBg, color: stockColor }}>
                                                        {badgeLabel}
                                                    </span>
                                                </div>
                                                <ChevronRight size={14} className="flex-shrink-0 self-center"
                                                    style={{ color: 'var(--toul-text-subtle)' }} />
                                            </div>
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                    )}
                </div>
            </motion.div>

            {/* ── Layout desktop (hidden md:flex) ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="hidden md:flex items-start px-8">

                {/* Columna izquierda — 260px fija */}
                <div className="flex flex-col gap-5 flex-shrink-0 pr-6"
                    style={{ width: 260, borderRight: '0.5px solid var(--toul-border)' }}>
                    <div className="flex items-center justify-center overflow-hidden"
                        style={{
                            height: 200,
                            background: 'var(--toul-surface)',
                            borderRadius: 14,
                            border: '1px solid var(--toul-border)',
                            padding: 12,
                        }}>
                        {imageSrc
                            ? <img src={imageSrc} alt={product.name} style={{ maxHeight: '100%', objectFit: 'contain', width: '100%' }} />
                            : <Package size={48} style={{ color: 'var(--toul-text-subtle)', opacity: 0.5 }} />
                        }
                    </div>
                </div>

                {/* Columna derecha — flex-1 */}
                <div className="flex-1 min-w-0 pl-6" style={{ paddingTop: 20 }}>
                    <div style={{ marginBottom: 20 }}>{metricsGrid}</div>
                    <p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--toul-text-subtle)', marginBottom: 12 }}>
                        Variantes
                    </p>
                    {!variants || variants.length === 0 ? emptyVariants : (
                        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                    {(['Variante', 'Precio', 'Costo promedio', 'Stock', 'Estado'] as const).map(h => (
                                        <th key={h} className="text-left py-2.5 px-3"
                                            style={{ fontSize: 11, fontWeight: 600, color: 'var(--toul-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {variants.map(v => {
                                    const stock = stockByVariant[v.id] ?? 0
                                    const status = getStockStatus(stock, v.low_stock_threshold ?? 5)
                                    const { color: stockColor, badgeBg, label: badgeLabel } = getStockStyle(status)
                                    return (
                                        <tr key={v.id}
                                            onClick={() => router.push(`/products/${id}/edit`)}
                                            className="cursor-pointer"
                                            style={{
                                                borderBottom: '1px solid var(--toul-border)',
                                                opacity: status === 'out' ? 0.5 : 1,
                                                transition: 'background 150ms ease',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--toul-surface-2)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                        >
                                            <td className="py-3 px-3"
                                                style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)' }}>
                                                {v.name}
                                            </td>
                                            <td className="py-3 px-3"
                                                style={{ fontSize: 13, fontWeight: 700, color: 'var(--toul-accent)', whiteSpace: 'nowrap' }}>
                                                {formatCOP(Math.round(v.sale_price))}
                                            </td>
                                            <td className="py-3 px-3"
                                                style={{ fontSize: 12, color: 'var(--toul-text-muted)', whiteSpace: 'nowrap' }}>
                                                {v.cpp > 0 ? formatCOP(Math.round(v.cpp)) : '—'}
                                            </td>
                                            <td className="py-3 px-3"
                                                style={{ fontSize: 14, fontWeight: 700, color: stockColor }}>
                                                {stock}
                                            </td>
                                            <td className="py-3 px-3">
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: badgeBg, color: stockColor, whiteSpace: 'nowrap' }}>
                                                    {badgeLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </motion.div>
        </div>
    )
}

// ─── Metric Card ──────────────────────────────────────────

function MetricCard({
    label,
    value,
    valueColor,
    compact,
}: {
    label: string
    value: string
    valueColor: string
    compact?: boolean
}) {
    return (
        <div className="toul-card p-3">
            <p style={{ fontSize: 10, fontWeight: 600, color: 'var(--toul-text-subtle)', marginBottom: 6 }}>
                {label}
            </p>
            <p
                className={compact ? 'text-sm font-semibold leading-tight' : 'text-2xl font-bold'}
                style={{ color: valueColor }}
            >
                {value}
            </p>
        </div>
    )
}

// ─── Loading Skeleton ─────────────────────────────────────

function LoadingSkeleton() {
    return (
        <div className="pt-6 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 md:px-8 mb-5">
                <div className="w-9 h-9 rounded-lg animate-pulse flex-shrink-0"
                    style={{ background: 'var(--toul-surface-2)' }} />
                <div className="flex-1">
                    <div className="h-4 w-40 rounded animate-pulse mb-1.5"
                        style={{ background: 'var(--toul-surface-2)' }} />
                    <div className="h-3 w-20 rounded animate-pulse"
                        style={{ background: 'var(--toul-surface-2)' }} />
                </div>
                <div className="w-14 h-7 rounded-lg animate-pulse"
                    style={{ background: 'var(--toul-surface-2)' }} />
            </div>

            {/* Mobile skeleton */}
            <div className="md:hidden px-4 flex flex-col gap-5">
                <div className="h-40 rounded-2xl animate-pulse"
                    style={{ background: 'var(--toul-surface-2)' }} />
                <div className="grid grid-cols-2 gap-3">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="h-16 rounded-xl animate-pulse"
                            style={{ background: 'var(--toul-surface-2)' }} />
                    ))}
                </div>
                <div className="flex flex-col gap-2">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-16 rounded-xl animate-pulse"
                            style={{ background: 'var(--toul-surface-2)' }} />
                    ))}
                </div>
            </div>

            {/* Desktop skeleton */}
            <div className="hidden md:flex items-start px-8">
                <div className="flex-shrink-0 pr-6" style={{ width: 260 }}>
                    <div className="h-52 rounded-2xl animate-pulse mb-5"
                        style={{ background: 'var(--toul-surface-2)' }} />
                    <div className="grid grid-cols-2 gap-3">
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="h-16 rounded-xl animate-pulse"
                                style={{ background: 'var(--toul-surface-2)' }} />
                        ))}
                    </div>
                </div>
                <div className="flex-1 pl-6">
                    <div className="h-3 w-16 rounded animate-pulse mb-4"
                        style={{ background: 'var(--toul-surface-2)' }} />
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="h-12 rounded animate-pulse mb-2"
                            style={{ background: 'var(--toul-surface-2)' }} />
                    ))}
                </div>
            </div>
        </div>
    )
}
