'use client'
import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import { Plus, Search, Package, Share, Tag } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem, fadeUp } from '@/lib/motion'
import { Skeleton, GridSkeleton } from '@/components/ui/Skeleton'
import { useToulData, useStore } from '@/lib/hooks/useData'
import dynamic from 'next/dynamic'

// Lazy Modals
const CatalogExportModal = dynamic(() => import('./CatalogExportModal').then(m => m.CatalogExportModal), { ssr: false })
const CategoriesModal = dynamic(() => import('@/components/products/CategoriesModal').then(m => m.CategoriesModal), { ssr: false })

export default function InventoryPage() {
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const { data: products, isLoading, mutate } = useToulData<Product>(
        'products',
        storeId,
        { eq: { is_active: true }, order: { column: 'name' } }
    )

    const [search, setSearch] = useState('')
    const [showExportModal, setShowExportModal] = useState(false)
    const [showCategoriesModal, setShowCategoriesModal] = useState(false)

    const filtered = (products || []).filter(p => p.name.toLowerCase().includes(search.toLowerCase()))

    function getProductImage(p: Product): string | null {
        if (p.images && p.images.length > 0) return p.images[0]
        return p.image_url
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-4">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Catálogo</p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Productos</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowCategoriesModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                        style={{ color: 'var(--toul-text)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                        <Tag size={16} /> Categorías
                    </button>
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                        style={{ color: 'var(--toul-text)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                        <Share size={16} /> Exportar
                    </button>
                    <Link href="/products/new"
                        className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                        style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                        <Plus size={16} /> Nuevo
                    </Link>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-5">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                <input className="toul-input pl-9 text-sm" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} />
            </motion.div>

            {/* Products grid */}
            {(isLoading || storeLoading) ? (
                <GridSkeleton count={6}>
                    <div className="rounded-2xl border aspect-[3/4] p-3 flex flex-col gap-3" style={{ background: 'var(--toul-surface)', borderColor: 'var(--toul-border)' }}>
                        <Skeleton className="flex-1 rounded-xl" />
                        <Skeleton width="60%" height="0.8rem" />
                        <Skeleton width="40%" height="1rem" />
                    </div>
                </GridSkeleton>
            ) : filtered.length === 0 ? (
                <div className="toul-card text-center py-16">
                    <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--toul-border-2)' }} />
                    <p className="font-semibold mb-1" style={{ color: 'var(--toul-text)' }}>Sin productos</p>
                    <p className="text-sm mb-5" style={{ color: 'var(--toul-text-muted)' }}>
                        {search ? 'No hay resultados para tu búsqueda' : 'Agrega tu primer producto al catálogo'}
                    </p>
                    {!search && (
                        <Link href="/products/new"
                            className="inline-flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
                            style={{ background: 'var(--toul-accent)', textDecoration: 'none' }}>
                            <Plus size={16} /> Agregar producto
                        </Link>
                    )}
                </div>
            ) : (
                <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                    className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filtered.map(product => {
                        const img = getProductImage(product)
                        return (
                            <motion.div key={product.id} variants={staggerItem}>
                                <Link href={`/products/${product.id}`} style={{ textDecoration: 'none' }}>
                                    <div className="rounded-2xl overflow-hidden border transition-all active:scale-[0.98] cursor-pointer h-full"
                                        style={{ background: 'var(--toul-surface)', borderColor: 'var(--toul-border)' }}>
                                        {/* Image */}
                                        <div className="relative w-full aspect-square overflow-hidden"
                                            style={{ background: 'var(--toul-surface-2)' }}>
                                            {img ? (
                                                <img src={img} alt={product.name}
                                                    loading="lazy"
                                                    className="w-full h-full object-cover transition-opacity duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>
                                            )}
                                        </div>
                                        {/* Info */}
                                        <div className="p-3">
                                            {product.reference && (
                                                <p className="text-[10px] font-mono mb-0.5 truncate"
                                                    style={{ color: 'var(--toul-text-subtle)' }}>{product.reference}</p>
                                            )}
                                            <p className="font-semibold text-sm leading-tight mb-1 line-clamp-2"
                                                style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                            <p className="font-bold text-base" style={{ color: 'var(--toul-accent)' }}>
                                                {formatCOP(product.sale_price)}
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        )
                    })}
                </motion.div>
            )}

            <AnimatePresence>
                {showExportModal && products && (
                    <CatalogExportModal
                        products={products}
                        onClose={() => setShowExportModal(false)}
                    />
                )}
                {showCategoriesModal && storeId && (
                    <CategoriesModal
                        storeId={storeId}
                        onClose={() => setShowCategoriesModal(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
