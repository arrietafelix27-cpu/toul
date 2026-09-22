'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Plus, Search, PackageMinus, Package, ChevronRight, Layers, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import dynamic from 'next/dynamic'

const PAGE_SIZE = 50

const AdjustInventoryModal = dynamic(() => import('@/components/inventory/AdjustInventoryModal').then(m => m.AdjustInventoryModal), {
    loading: () => <Skeleton height="400px" className="rounded-3xl" />
})

function getStockStyle(state: 'ok' | 'low' | 'zero') {
    if (state === 'ok') return { background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }
    if (state === 'low') return { background: 'var(--toul-warning-dim)', color: 'var(--toul-warning)' }
    return { background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }
}

function getStockState(stock: number, threshold: number): 'ok' | 'low' | 'zero' {
    if (stock === 0) return 'zero'
    if (stock <= threshold) return 'low'
    return 'ok'
}

export default function InventoryPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [searchQuery, setSearchQuery] = useState('')
    const [showAdjustModal, setShowAdjustModal] = useState(false)
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [hasMore, setHasMore] = useState(true)
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

    // Products (paginated)
    const { data: products, isLoading: productsLoading, isValidating, mutate } = useSWR(
        storeId ? ['inventory', storeId, searchQuery, limit] : null,
        async () => {
            let q = supabase.from('products').select('*').eq('store_id', storeId!).order('name')
            if (searchQuery) q = q.or(`name.ilike.%${searchQuery}%,reference.ilike.%${searchQuery}%`)
            q = q.limit(limit + 1)
            const { data, error } = await q
            if (error) throw error
            const results = data as Product[]
            if (results.length > limit) { setHasMore(true); return results.slice(0, limit) }
            setHasMore(false)
            return results
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    // Aggregate stats — all products, no pagination needed
    const { data: stats } = useSWR(
        storeId ? ['inventory-stats', storeId] : null,
        async () => {
            const { data } = await supabase
                .from('products')
                .select('stock, cpp, low_stock_threshold')
                .eq('store_id', storeId!)
                .eq('is_active', true)
            const prods = data || []
            return {
                totalValue: prods.reduce((sum, p) => sum + ((p.stock || 0) * (p.cpp || 0)), 0),
                totalCount: prods.length,
                zeroStock: prods.filter(p => (p.stock || 0) === 0).length,
                lowStock: prods.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= (p.low_stock_threshold || 5)).length,
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    // Product IDs that have active variants (option A: one lightweight query)
    const { data: variantProductIds } = useSWR(
        storeId ? ['variant-product-ids', storeId] : null,
        async () => {
            const { data } = await supabase
                .from('product_variants')
                .select('product_id')
                .eq('store_id', storeId!)
                .eq('is_active', true)
            return new Set((data || []).map((v: any) => v.product_id as string))
        },
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    // Variants detail + stock per variant from inventory_adjustments
    const { data: variantsDetail } = useSWR(
        storeId ? ['variants-detail', storeId] : null,
        async () => {
            const [varRes, adjRes] = await Promise.all([
                supabase.from('product_variants')
                    .select('id, product_id, name, cpp, low_stock_threshold')
                    .eq('store_id', storeId!)
                    .eq('is_active', true),
                supabase.from('inventory_adjustments')
                    .select('variant_id, quantity')
                    .eq('store_id', storeId!)
                    .not('variant_id', 'is', null),
            ])
            const stockMap: Record<string, number> = {}
            for (const adj of adjRes.data || []) {
                if (adj.variant_id) stockMap[adj.variant_id] = (stockMap[adj.variant_id] || 0) + adj.quantity
            }
            return { variants: varRes.data || [], stockMap }
        },
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    const isLoading = productsLoading || storeLoading

    function toggleExpand(productId: string) {
        setExpandedProducts(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId)
            else next.add(productId)
            return next
        })
    }

    function getProductImage(product: Product): string | null {
        if (product.images && product.images.length > 0) return product.images[0]
        return product.image_url
    }

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5"
                style={{ position: 'relative' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px 0' }}>Operaciones</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Inventario</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/inventory/conteo"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                        style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)', textDecoration: 'none' }}>
                        <ClipboardList size={15} /> Conteo
                    </Link>
                    <button
                        onClick={() => setShowAdjustModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                        style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                        <PackageMinus size={15} /> Ajuste
                    </button>
                    <Link href="/inventory/purchase"
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                        style={{ background: 'var(--toul-accent)', color: '#000', boxShadow: '0 4px 16px var(--toul-accent-glow)', textDecoration: 'none' }}>
                        <Plus size={16} /> Nueva compra
                    </Link>
                </div>
            </motion.div>

            {/* Stats Card */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="toul-card p-4 mb-6">
                <div className="grid grid-cols-2 gap-y-4">
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Valor inventario</p>
                        {!stats ? <Skeleton height="1.5rem" width="110px" className="rounded" /> : (
                            <p className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(stats.totalValue)}</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Productos</p>
                        {!stats ? <Skeleton height="1.5rem" width="50px" className="rounded" /> : (
                            <p className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>{stats.totalCount}</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Sin stock</p>
                        {!stats ? <Skeleton height="1.25rem" width="40px" className="rounded" /> : (
                            <p className="text-lg font-bold" style={{ color: stats.zeroStock > 0 ? 'var(--toul-error)' : 'var(--toul-text-muted)' }}>
                                {stats.zeroStock}
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Stock bajo</p>
                        {!stats ? <Skeleton height="1.25rem" width="40px" className="rounded" /> : (
                            <p className="text-lg font-bold" style={{ color: stats.lowStock > 0 ? 'var(--toul-warning)' : 'var(--toul-text-muted)' }}>
                                {stats.lowStock}
                            </p>
                        )}
                    </div>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-6">
                <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                <input
                    type="text"
                    placeholder="Buscar producto por nombre o ref..."
                    className="toul-input w-full pr-10"
                    style={{ paddingLeft: 42 }}
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setLimit(PAGE_SIZE) }}
                />
            </motion.div>

            {/* List */}
            {isLoading ? (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="80px" className="rounded-2xl" />)}
                </div>
            ) : (products || []).length === 0 ? (
                <EmptyState
                    icon={Package}
                    title="Sin productos"
                    description={searchQuery ? 'No hay resultados para tu búsqueda.' : 'Parece que aún no tienes productos en tu inventario.'}
                    action={!searchQuery && (
                        <Link href="/products/new"
                            className="inline-flex items-center gap-2 text-white px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-95"
                            style={{ background: 'var(--toul-accent)', textDecoration: 'none', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                            <Plus size={16} /> Crear mi primer producto
                        </Link>
                    )}
                />
            ) : (
                <>
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-3">
                        {(products || []).map(product => {
                            const hasVariants = variantProductIds?.has(product.id) ?? false
                            const imageSrc = getProductImage(product)
                            const threshold = product.low_stock_threshold || 5
                            const state = getStockState(product.stock, threshold)
                            const isExpanded = expandedProducts.has(product.id)
                            const productVariants = variantsDetail?.variants.filter(v => v.product_id === product.id) || []

                            if (hasVariants) {
                                return (
                                    <motion.div key={product.id} variants={staggerItem}>
                                        {/* Variant product — expandable header */}
                                        <div
                                            className="toul-card p-3 flex items-center gap-4 transition-all active:scale-[0.98] cursor-pointer select-none"
                                            onClick={() => toggleExpand(product.id)}>
                                            <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface-2)' }}>
                                                {imageSrc ? (
                                                    <img src={imageSrc} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-sm truncate mb-1" style={{ color: 'var(--toul-text)' }}>{product.name}</h3>
                                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md"
                                                    style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                                    <Layers size={10} /> {productVariants.length || '…'} variantes
                                                </span>
                                            </div>
                                            <ChevronRight size={18} style={{
                                                color: 'var(--toul-text-muted)',
                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                transition: 'transform 180ms ease',
                                                flexShrink: 0,
                                            }} />
                                        </div>

                                        {/* Variant sub-rows */}
                                        <AnimatePresence>
                                            {isExpanded && productVariants.map(variant => {
                                                const vStock = Math.round(variantsDetail?.stockMap[variant.id] ?? 0)
                                                const vThreshold = variant.low_stock_threshold || 5
                                                const vState = getStockState(vStock, vThreshold)
                                                return (
                                                    <motion.div key={variant.id}
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.18 }}
                                                        className="overflow-hidden">
                                                        <Link href={`/inventory/variant/${variant.id}`}
                                                            className="block ml-5 mt-1.5"
                                                            style={{ textDecoration: 'none' }}>
                                                            <div className="flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98]"
                                                                style={{
                                                                    background: 'var(--toul-surface-2)',
                                                                    borderLeft: '2px solid var(--toul-border)',
                                                                    opacity: vState === 'zero' ? 0.55 : 1,
                                                                }}>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{variant.name}</p>
                                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                                                                        Costo promedio: {formatCOP(variant.cpp)}
                                                                    </p>
                                                                </div>
                                                                <div className="flex-shrink-0 text-right">
                                                                    <p className="text-[10px] mb-1" style={{ color: 'var(--toul-text-muted)' }}>Stock</p>
                                                                    <div className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold"
                                                                        style={getStockStyle(vState)}>
                                                                        {vStock}
                                                                    </div>
                                                                </div>
                                                                <ChevronRight size={14} className="flex-shrink-0" style={{ color: 'var(--toul-text-muted)' }} />
                                                            </div>
                                                        </Link>
                                                    </motion.div>
                                                )
                                            })}
                                        </AnimatePresence>
                                    </motion.div>
                                )
                            }

                            // Regular product row
                            return (
                                <motion.div key={product.id} variants={staggerItem}>
                                    <Link href={`/inventory/${product.id}`} className="block" style={{ textDecoration: 'none' }}>
                                        <div className="toul-card p-3 flex items-center gap-4 transition-all active:scale-[0.98]"
                                            style={{ opacity: state === 'zero' ? 0.55 : 1 }}>
                                            <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface-2)' }}>
                                                {imageSrc ? (
                                                    <img src={imageSrc} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-bold text-sm truncate mb-0.5" style={{ color: 'var(--toul-text)' }}>{product.name}</h3>
                                                <p className="text-xs truncate" style={{ color: 'var(--toul-text-subtle)' }}>
                                                    Costo promedio: {formatCOP(product.cpp)} · En bodega: {formatCOP(Math.round(product.stock * product.cpp))}
                                                </p>
                                            </div>
                                            <div className="flex-shrink-0 text-right">
                                                <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Stock</p>
                                                <div className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold"
                                                    style={getStockStyle(state)}>
                                                    {product.stock}
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                </motion.div>
                            )
                        })}
                    </motion.div>

                    {hasMore && (
                        <button
                            onClick={() => setLimit(l => l + PAGE_SIZE)}
                            disabled={isValidating}
                            className="w-full py-4 mt-4 rounded-2xl border border-dashed font-semibold text-xs transition-colors"
                            style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)' }}>
                            {isValidating ? 'Cargando más...' : 'Ver más productos'}
                        </button>
                    )}
                </>
            )}

            {/* Modal */}
            <AnimatePresence>
                {showAdjustModal && storeId && (
                    <AdjustInventoryModal
                        storeId={storeId}
                        onClose={() => setShowAdjustModal(false)}
                        onSuccess={() => mutate()}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
