'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Edit3, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, t } from '@/lib/motion'

export default function ProductDetailPage() {
    const { id } = useParams<{ id: string }>()
    const supabase = createClient()
    const [product, setProduct] = useState<Product | null>(null)
    const [loading, setLoading] = useState(true)
    const [imgIdx, setImgIdx] = useState(0)

    const [unitsSold, setUnitsSold] = useState(0)

    const loadProduct = useCallback(async () => {
        const { data: prod } = await supabase.from('products').select('*').eq('id', id).single()
        setProduct(prod)
        if (prod) {
            // Fetch units sold
            const { data: items } = await supabase.from('sale_items').select('quantity').eq('product_id', id)
            const totalSold = items?.reduce((sum, item) => sum + item.quantity, 0) || 0
            setUnitsSold(totalSold)
        }
        setLoading(false)
    }, [id])

    useEffect(() => { loadProduct() }, [loadProduct])

    if (loading) return (
        <div className="px-4 pt-6">
            <div className="skeleton h-12 w-32 rounded-xl mb-5" />
            <div className="skeleton h-72 w-full rounded-3xl mb-4" />
            <div className="skeleton h-20 w-full rounded-2xl" />
        </div>
    )
    if (!product) return <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>Producto no encontrado</div>

    // Build images array (support both legacy image_url and new images[])
    const images: string[] = []
    if (product.images && product.images.length > 0) {
        images.push(...product.images)
    } else if (product.image_url) {
        images.push(product.image_url)
    }

    const margin = product.sale_price > 0 ? ((product.sale_price - product.cpp) / product.sale_price * 100) : 0
    const profitPerUnit = product.sale_price - product.cpp

    return (
        <div className="pb-10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-6 mb-4">
                <Link href="/products"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <Link href={`/products/${id}/edit`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'var(--toul-accent)', color: '#fff', textDecoration: 'none' }}>
                    <Edit3 size={15} /> Editar
                </Link>
            </div>

            {/* Image carousel or placeholder */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mx-4 mb-5">
                <div className="w-full aspect-square rounded-3xl overflow-hidden relative"
                    style={{ background: 'var(--toul-surface-2)', border: '1px solid var(--toul-border)' }}>
                    {images.length > 0 ? (
                        <AnimatePresence mode="wait">
                            <motion.img
                                key={imgIdx}
                                src={images[imgIdx]}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                transition={t.fast}
                            />
                        </AnimatePresence>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-6xl">📦</div>
                    )}

                    {/* Carousel controls */}
                    {images.length > 1 && (
                        <>
                            <button onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                                disabled={imgIdx === 0}
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
                                style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                                <ChevronLeft size={18} />
                            </button>
                            <button onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))}
                                disabled={imgIdx === images.length - 1}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30"
                                style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                                <ChevronRight size={18} />
                            </button>
                            {/* Dots */}
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                {images.map((_, i) => (
                                    <button key={i} onClick={() => setImgIdx(i)}
                                        className="rounded-full transition-all"
                                        style={{
                                            width: i === imgIdx ? 20 : 6,
                                            height: 6,
                                            background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.4)'
                                        }} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </motion.div>

            {/* Product info */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="px-4">
                <div className="mb-1">
                    {product.reference && (
                        <p className="text-xs font-mono mb-1" style={{ color: 'var(--toul-text-subtle)' }}>
                            REF: {product.reference}
                        </p>
                    )}
                    <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--toul-text)' }}>
                        {product.name}
                    </h1>
                </div>
                <p className="text-3xl font-bold mt-2 mb-5" style={{ color: 'var(--toul-accent)' }}>
                    {formatCOP(product.sale_price)}
                </p>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>CPP actual</p>
                        <p className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(product.cpp)}</p>
                    </div>
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Margen estimado</p>
                        <p className="font-bold" style={{ color: margin >= 20 ? 'var(--toul-accent)' : '#F59E0B' }}>
                            {margin.toFixed(1)}%
                        </p>
                    </div>
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Ganancia por unidad</p>
                        <p className="font-bold" style={{ color: profitPerUnit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                            {formatCOP(profitPerUnit)}
                        </p>
                    </div>
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Unidades vendidas</p>
                        <p className="font-bold" style={{ color: 'var(--toul-text)' }}>
                            {unitsSold}
                        </p>
                    </div>
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Categoría</p>
                        <p className="font-bold truncate px-2" style={{ color: 'var(--toul-text)' }}>
                            {product.category || 'General'}
                        </p>
                    </div>
                    <div className="toul-card py-3 text-center">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>En catálogo desde</p>
                        <p className="font-bold" style={{ color: 'var(--toul-text)' }}>
                            {new Date(product.created_at).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })}
                        </p>
                    </div>
                </div>

                {/* Big edit CTA */}
                <Link href={`/products/${id}/edit`}
                    className="toul-btn-primary"
                    style={{ display: 'flex', textDecoration: 'none', gap: '0.5rem' }}>
                    <Edit3 size={18} /> Editar producto
                </Link>
            </motion.div>
        </div>
    )
}
