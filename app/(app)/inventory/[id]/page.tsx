'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Package, History, TrendingUp, Sparkles, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp } from '@/lib/motion'

export default function InventoryProductDetail() {
    const { id } = useParams<{ id: string }>()
    const supabase = createClient()
    const [product, setProduct] = useState<Product | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'movements' | 'insights'>('movements')
    const [movements, setMovements] = useState<any[]>([]) // Placeholder for movements
    const [rotationDays, setRotationDays] = useState<number | null>(null)

    const loadData = useCallback(async () => {
        const { data: prod } = await supabase.from('products').select('*').eq('id', id).single()
        setProduct(prod)

        if (prod) {
            // Placeholder: Fetch movements from purchase_items, sale_items, and adjustments
            setMovements([
                { id: 1, type: 'in', date: new Date().toISOString(), qty: 10, note: 'Compra a proveedor' },
                { id: 2, type: 'out', date: new Date(Date.now() - 86400000).toISOString(), qty: 2, note: 'Venta #1024' },
                { id: 3, type: 'adj', date: new Date(Date.now() - 172800000).toISOString(), qty: -1, note: 'Ajuste (Roto)' }
            ])
            setRotationDays(14) // Placeholder calculation
        }
        setLoading(false)
    }, [id])

    useEffect(() => { loadData() }, [loadData])

    if (loading) return (
        <div className="px-4 py-6">
            <div className="skeleton h-8 w-32 mb-6" />
            <div className="skeleton h-24 w-full rounded-2xl mb-4" />
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="skeleton h-20 rounded-xl" />
                <div className="skeleton h-20 rounded-xl" />
            </div>
            <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
    )

    if (!product) return <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>Producto no encontrado</div>

    const totalValue = product.stock * product.cpp
    const margin = product.sale_price > 0 ? ((product.sale_price - product.cpp) / product.sale_price * 100) : 0

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6">
                <Link href="/inventory"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                        {product.reference || 'Sin Referencia'}
                    </p>
                    <h1 className="text-lg font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</h1>
                </div>
            </motion.div>

            {/* Main Stats Card */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card p-5 mb-5 flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Package size={80} />
                </div>
                <p className="text-sm font-medium mb-1 relative z-10" style={{ color: 'var(--toul-text-muted)' }}>Stock Actual</p>
                <p className="text-5xl font-bold mb-4 relative z-10" style={{
                    color: product.stock <= (product.low_stock_threshold || 5) ? 'var(--toul-error)' : 'var(--toul-accent)'
                }}>
                    {product.stock} <span className="text-xl opacity-50">uds</span>
                </p>
                <div className="flex items-center gap-4 text-sm relative z-10">
                    <div className="flex flex-col items-center">
                        <span style={{ color: 'var(--toul-text-subtle)' }}>Costo Promedio</span>
                        <span className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(product.cpp)}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-200 dark:bg-gray-800" />
                    <div className="flex flex-col items-center">
                        <span style={{ color: 'var(--toul-text-subtle)' }}>Valor en Bodega</span>
                        <span className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(totalValue)}</span>
                    </div>
                </div>
            </motion.div>

            {/* Quick Metrics */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 mb-6">
                <div className="toul-card p-4 flex flex-col items-center justify-center text-center">
                    <TrendingUp size={20} className="mb-2" style={{ color: 'var(--toul-accent)' }} />
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Rotación</p>
                    <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>
                        {rotationDays ? `Cada ${rotationDays} días` : 'Sin datos'}
                    </p>
                </div>
                <div className="toul-card p-4 flex flex-col items-center justify-center text-center">
                    <div className="w-5 h-5 mb-2 rounded-full border-2" style={{ borderColor: margin >= 20 ? 'var(--toul-accent)' : margin > 0 ? '#F59E0B' : 'var(--toul-error)' }} />
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Margen global</p>
                    <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>
                        {margin.toFixed(1)}%
                    </p>
                </div>
            </motion.div>

            {/* Tabs */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }}>
                <button
                    onClick={() => setActiveTab('movements')}
                    className="flex-1 py-2 text-sm font-semibold rounded-xl transition-all"
                    style={{
                        background: activeTab === 'movements' ? 'var(--toul-surface)' : 'transparent',
                        color: activeTab === 'movements' ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                        boxShadow: activeTab === 'movements' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                    }}>
                    <div className="flex items-center justify-center gap-2">
                        <History size={16} /> Movimientos
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('insights')}
                    className="flex-1 py-2 text-sm font-semibold rounded-xl transition-all"
                    style={{
                        background: activeTab === 'insights' ? 'var(--toul-surface)' : 'transparent',
                        color: activeTab === 'insights' ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                        boxShadow: activeTab === 'insights' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none'
                    }}>
                    <div className="flex items-center justify-center gap-2">
                        <Sparkles size={16} style={{ color: 'var(--toul-accent)' }} /> Insights AI
                    </div>
                </button>
            </motion.div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                {activeTab === 'movements' ? (
                    <motion.div key="movements" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-3">
                        {movements.map(mov => (
                            <div key={mov.id} className="toul-card p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center"
                                        style={{
                                            background: mov.type === 'in' ? 'rgba(16,185,129,0.1)' : mov.type === 'out' ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)',
                                            color: mov.type === 'in' ? 'var(--toul-accent)' : mov.type === 'out' ? '#6366f1' : 'var(--toul-error)'
                                        }}>
                                        {mov.type === 'in' ? '+' : mov.type === 'out' ? '-' : '!'}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-sm" style={{ color: 'var(--toul-text)' }}>{mov.note}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                            {new Date(mov.date).toLocaleDateString('es-CO')}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold" style={{
                                        color: mov.type === 'in' ? 'var(--toul-accent)' : 'var(--toul-text)'
                                    }}>
                                        {mov.type === 'in' ? '+' : ''}{mov.qty}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div key="insights" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col gap-3">
                        {/* Placeholder Insights */}
                        <div className="toul-card p-5" style={{ borderLeft: '4px solid var(--toul-accent)' }}>
                            <div className="flex items-start gap-3">
                                <AlertCircle size={20} className="mt-0.5" style={{ color: 'var(--toul-accent)' }} />
                                <div>
                                    <h4 className="font-bold text-sm mb-1" style={{ color: 'var(--toul-text)' }}>Alerta de Stock Bajísimo</h4>
                                    <p className="text-sm leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                        Este producto se vende en promedio cada 14 días. Con tu stock actual ({product.stock}), te quedarás sin unidades antes de fin de mes. Te sugerimos reponer al menos 10 unidades.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
