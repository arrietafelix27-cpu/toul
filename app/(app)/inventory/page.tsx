'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Plus, Search, PackageMinus, Package } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import dynamic from 'next/dynamic'

const PAGE_SIZE = 50

const AdjustInventoryModal = dynamic(() => import('@/components/inventory/AdjustInventoryModal').then(m => m.AdjustInventoryModal), {
    loading: () => <Skeleton height="400px" className="rounded-3xl" />
})

export default function InventoryPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [searchQuery, setSearchQuery] = useState('')
    const [showAdjustModal, setShowAdjustModal] = useState(false)
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [hasMore, setHasMore] = useState(true)

    const { data: products, isLoading, isValidating, mutate } = useSWR(
        storeId ? ['inventory', storeId, searchQuery, limit] : null,
        async () => {
            let q = supabase.from('products').select('*').eq('store_id', storeId).order('name', { ascending: true })
            if (searchQuery) {
                q = q.or(`name.ilike.%${searchQuery}%,reference.ilike.%${searchQuery}%`)
            }
            q = q.limit(limit + 1)
            const { data, error } = await q
            if (error) throw error
            const results = data as Product[]
            if (results.length > limit) {
                setHasMore(true)
                return results.slice(0, limit)
            } else {
                setHasMore(false)
                return results
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const totalStockValue = useMemo(() => (products || []).reduce((sum, p) => sum + (p.stock * p.cpp), 0), [products])

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Operativo</p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Inventario</h1>
                </div>
            </motion.div>

            {/* Top Actions */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex gap-3 mb-6">
                <Link href="/inventory/purchase"
                    className="flex-1 toul-card p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                    style={{ textDecoration: 'none' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                        <Plus size={20} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>Nueva Compra</span>
                </Link>
                <button
                    onClick={() => setShowAdjustModal(true)}
                    className="flex-1 toul-card p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95"
                    style={{ textDecoration: 'none', border: 'none', cursor: 'pointer', background: 'var(--toul-surface)' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                        <PackageMinus size={20} />
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>Ajuste de Inventario</span>
                </button>
            </motion.div>

            {/* Stats Summary */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="toul-card p-4 mb-6 flex items-center justify-between">
                <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Valor del inventario</p>
                    {(isLoading || storeLoading) ? (
                        <Skeleton height="1.5rem" width="120px" className="rounded" />
                    ) : (
                        <p className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(totalStockValue)}</p>
                    )}
                </div>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                    <Package size={20} />
                </div>
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--toul-text-muted)' }} />
                <input
                    type="text"
                    placeholder="Buscar producto por nombre o ref..."
                    className="toul-input w-full pl-10 pr-10"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setLimit(PAGE_SIZE) }}
                />
            </motion.div>

            {/* List */}
            {(isLoading || storeLoading) ? (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="80px" className="rounded-2xl" />)}
                </div>
            ) : (
                <>
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-3">
                        <AnimatePresence>
                            {(products || []).map(product => (
                                <Link href={`/inventory/${product.id}`} key={product.id} className="block" style={{ textDecoration: 'none' }}>
                                    <motion.div variants={staggerItem} layout
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                        className="toul-card p-3 flex items-center gap-4 transition-all active:scale-[0.98]">
                                        <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface-2)' }}>
                                            {product.image_url ? (
                                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <h3 className="font-bold text-sm truncate mb-0.5" style={{ color: 'var(--toul-text)' }}>{product.name}</h3>
                                            {product.reference && (
                                                <p className="text-xs font-mono truncate" style={{ color: 'var(--toul-text-subtle)' }}>{product.reference}</p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Stock</p>
                                            <div className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold"
                                                style={{
                                                    background: product.stock <= (product.low_stock_threshold || 5) ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                                    color: product.stock <= (product.low_stock_threshold || 5) ? 'var(--toul-error)' : 'var(--toul-accent)'
                                                }}>
                                                {product.stock}
                                            </div>
                                        </div>
                                    </motion.div>
                                </Link>
                            ))}
                        </AnimatePresence>
                    </motion.div>

                    {hasMore && (
                        <button
                            onClick={() => setLimit(l => l + PAGE_SIZE)}
                            disabled={isValidating}
                            className="w-full py-4 mt-4 rounded-2xl border border-dashed font-semibold text-xs transition-colors hover:bg-slate-900/50"
                            style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)' }}
                        >
                            {isValidating ? 'Cargando más...' : 'Ver más productos'}
                        </button>
                    )}
                </>
            )}

            {/* Modals */}
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
