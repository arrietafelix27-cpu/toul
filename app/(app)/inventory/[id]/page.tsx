'use client'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, Package, History, Sparkles, ShoppingCart,
    Layers, ArrowUpRight, ArrowDownLeft, SlidersHorizontal,
    ChevronDown, TrendingUp, Wallet
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp } from '@/lib/motion'
import { buildSignalContext, computeInsightMessage } from '@/lib/products/signals'

// ─── Helpers ────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
    damage: 'Daño / Avería',
    loss: 'Pérdida',
    theft: 'Robo',
    expired: 'Vencimiento',
    other: 'Ajuste manual',
    purchase: 'Compra',
    sale: 'Venta',
    reconciliation: 'Reconciliación',
}

function getMovementDisplay(quantity: number, reason: string) {
    if (quantity > 0) {
        return {
            label: REASON_LABELS[reason] ?? 'Entrada',
            Icon: ArrowUpRight,
            color: 'var(--toul-accent)',
            bg: 'rgba(50,215,75,0.1)',
        }
    }
    const isAdjustment = ['damage', 'loss', 'theft', 'expired', 'other'].includes(reason)
    if (isAdjustment) {
        return {
            label: REASON_LABELS[reason] ?? 'Ajuste',
            Icon: SlidersHorizontal,
            color: 'var(--toul-warning)',
            bg: 'var(--toul-warning-dim)',
        }
    }
    return {
        label: REASON_LABELS[reason] ?? 'Salida',
        Icon: ArrowDownLeft,
        color: 'var(--toul-error)',
        bg: 'rgba(239,68,68,0.1)',
    }
}

function getStockColor(stock: number, threshold: number): string {
    if (stock === 0) return 'var(--toul-text-muted)'
    if (stock <= threshold) return 'var(--toul-warning)'
    return 'var(--toul-accent)'
}

// ─── Page ────────────────────────────────────────────────────

export default function InventoryProductDetail() {
    const { id } = useParams<{ id: string }>()
    const supabase = createClient()
    const [activeTab, setActiveTab] = useState<'movements' | 'insights'>('movements')
    const [variantsExpanded, setVariantsExpanded] = useState(false)

    // ── Data ─────────────────────────────────────────────────

    const { data: product, isLoading: prodLoading } = useSWR(
        ['inv-product', id],
        async () => {
            const { data } = await supabase.from('products').select('*').eq('id', id).single()
            return data
        }
    )

    const { data: variants } = useSWR(
        ['inv-variants', id],
        async () => {
            const { data } = await supabase
                .from('product_variants')
                .select('id, name, sale_price, cost_price, cpp')
                .eq('product_id', id)
                .eq('is_active', true)
                .order('name')
            return data ?? []
        }
    )

    const { data: movements } = useSWR(
        ['inv-movements', id],
        async () => {
            const { data } = await supabase
                .from('inventory_adjustments')
                .select('id, quantity, reason, notes, created_at, variant_id')
                .eq('product_id', id)
                .order('created_at', { ascending: false })
                .limit(50)
            return data ?? []
        }
    )

    const { data: saleItems30d } = useSWR(
        ['inv-sale-items-30d', id],
        async () => {
            const since = new Date()
            since.setDate(since.getDate() - 30)
            const { data } = await supabase
                .from('sale_items')
                .select('product_id, quantity, created_at')
                .eq('product_id', id)
                .gte('created_at', since.toISOString())
            return data ?? []
        }
    )

    // ── Derived ───────────────────────────────────────────────

    const variantStockMap = useMemo(() => {
        const map: Record<string, number> = {}
        for (const mov of movements ?? []) {
            if (mov.variant_id) {
                map[mov.variant_id] = (map[mov.variant_id] ?? 0) + mov.quantity
            }
        }
        return map
    }, [movements])

    const hasVariants = (variants?.length ?? 0) > 0
    const threshold = product?.low_stock_threshold ?? 5
    const totalValue = Math.round((product?.stock ?? 0) * (product?.cpp ?? 0))
    const margin = product && product.sale_price > 0
        ? Math.round((product.sale_price - product.cpp) / product.sale_price * 100)
        : 0

    const sales30d = (saleItems30d ?? []).reduce((sum, i) => sum + i.quantity, 0)
    const dailyRate = sales30d / 30
    const daysLeft = dailyRate > 0 && product ? Math.round(product.stock / dailyRate) : null

    const signalContext = useMemo(() => {
        if (!product || !saleItems30d) return null
        return buildSignalContext(
            [product],
            saleItems30d.map(i => ({ product_id: i.product_id, quantity: i.quantity, created_at: i.created_at }))
        )
    }, [product, saleItems30d])

    const insight = signalContext && product ? computeInsightMessage(product, signalContext) : null

    // ── Loading ────────────────────────────────────────────────

    if (prodLoading) return (
        <div className="px-4 py-6 max-w-2xl mx-auto">
            <div className="h-8 w-32 rounded-xl animate-pulse mb-6" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="h-36 rounded-2xl animate-pulse mb-4" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="grid grid-cols-2 gap-3 mb-6">
                {[0, 1].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />)}
            </div>
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
        </div>
    )

    if (!product) return (
        <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>
            Producto no encontrado
        </div>
    )

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center gap-3 mb-6"
                style={{ position: 'relative' }}>
                <Link href="/inventory"
                    className="flex items-center justify-center transition-all active:scale-90"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </Link>
                <div className="flex-1 min-w-0">
                    {product.reference && (
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px 0' }}>
                            {product.reference}
                        </p>
                    )}
                    <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {product.name}
                    </h1>
                </div>
                <Link href={`/inventory/purchase?product=${id}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
                    style={{ background: 'var(--toul-accent)', color: '#000' }}>
                    <ShoppingCart size={15} />
                    Comprar
                </Link>
            </motion.div>

            {/* Stock Hero */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card p-5 mb-4 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 opacity-[0.04]" style={{ color: 'var(--toul-text)' }}>
                    <Package size={100} />
                </div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1"
                    style={{ color: 'var(--toul-text-subtle)' }}>Stock actual</p>
                <div className="flex items-end gap-3 mb-4">
                    <span className="text-5xl font-bold leading-none"
                        style={{ color: getStockColor(product.stock, threshold) }}>
                        {product.stock}
                    </span>
                    <span className="text-base mb-1 font-medium" style={{ color: 'var(--toul-text-muted)' }}>
                        unidades
                    </span>
                </div>
                <div className="flex items-center gap-5 pt-4"
                    style={{ borderTop: '1px solid var(--toul-border)' }}>
                    <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Costo promedio</p>
                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(product.cpp)}</p>
                    </div>
                    <div className="w-px h-8" style={{ background: 'var(--toul-border)' }} />
                    <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Valor en bodega</p>
                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(totalValue)}</p>
                    </div>
                    <div className="w-px h-8" style={{ background: 'var(--toul-border)' }} />
                    <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Margen</p>
                        <p className="font-bold text-sm"
                            style={{ color: margin >= 20 ? 'var(--toul-accent)' : 'var(--toul-warning)' }}>
                            {margin}%
                        </p>
                    </div>
                </div>
            </motion.div>

            {/* Variants section */}
            {hasVariants && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="toul-card mb-4 overflow-hidden">
                    <button
                        onClick={() => setVariantsExpanded(v => !v)}
                        className="w-full p-4 flex items-center gap-3 transition-all active:scale-[0.99]">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(50,215,75,0.12)', color: 'var(--toul-accent)' }}>
                            <Layers size={14} />
                        </div>
                        <span className="flex-1 text-left text-sm font-semibold"
                            style={{ color: 'var(--toul-text)' }}>
                            {variants!.length} {variants!.length === 1 ? 'variante' : 'variantes'}
                        </span>
                        <motion.div animate={{ rotate: variantsExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown size={16} style={{ color: 'var(--toul-text-muted)' }} />
                        </motion.div>
                    </button>
                    <AnimatePresence>
                        {variantsExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden">
                                <div className="px-4 pb-4 space-y-2">
                                    {variants!.map(v => {
                                        const vStock = variantStockMap[v.id] ?? 0
                                        return (
                                            <div key={v.id}
                                                className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                                                style={{ background: 'var(--toul-surface-2)' }}>
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{v.name}</p>
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-subtle)' }}>{formatCOP(v.sale_price)}</p>
                                                </div>
                                                <p className="text-sm font-bold"
                                                    style={{ color: vStock === 0 ? 'var(--toul-text-muted)' : vStock <= threshold ? 'var(--toul-warning)' : 'var(--toul-accent)' }}>
                                                    {vStock} uds
                                                </p>
                                            </div>
                                        )
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}

            {/* Quick metrics */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="grid grid-cols-2 gap-3 mb-6">
                <div className="toul-card p-4">
                    <p className="text-xs mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Ventas últimos 30d</p>
                    <p className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>{sales30d}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-muted)' }}>unidades</p>
                </div>
                <div className="toul-card p-4">
                    <p className="text-xs mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Días restantes</p>
                    <p className="text-2xl font-bold"
                        style={{ color: daysLeft !== null && daysLeft < 7 ? 'var(--toul-warning)' : 'var(--toul-text)' }}>
                        {daysLeft !== null ? daysLeft : '—'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-muted)' }}>
                        {daysLeft !== null ? 'al ritmo actual' : 'sin ventas recientes'}
                    </p>
                </div>
            </motion.div>

            {/* Tabs */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex gap-2 mb-4 p-1 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }}>
                {(['movements', 'insights'] as const).map(tab => (
                    <button key={tab}
                        onClick={() => setActiveTab(tab)}
                        className="flex-1 py-2 text-sm font-semibold rounded-xl transition-all"
                        style={{
                            background: activeTab === tab ? 'var(--toul-surface)' : 'transparent',
                            color: activeTab === tab ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                            boxShadow: activeTab === tab ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                        }}>
                        <div className="flex items-center justify-center gap-2">
                            {tab === 'movements'
                                ? <><History size={15} /> Movimientos</>
                                : <><Sparkles size={15} style={{ color: activeTab === 'insights' ? 'var(--toul-accent)' : undefined }} /> Insights</>
                            }
                        </div>
                    </button>
                ))}
            </motion.div>

            {/* Tab content */}
            <AnimatePresence mode="wait">
                {activeTab === 'movements' ? (
                    <motion.div key="movements"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex flex-col gap-2">
                        {(movements ?? []).length === 0 ? (
                            <div className="toul-card p-8 text-center">
                                <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                                    Sin movimientos registrados
                                </p>
                            </div>
                        ) : (movements ?? []).map(mov => {
                            const { label, Icon, color, bg } = getMovementDisplay(mov.quantity, mov.reason)
                            return (
                                <div key={mov.id} className="toul-card p-3.5 flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: bg, color }}>
                                        <Icon size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>{label}</p>
                                        <p className="text-xs truncate" style={{ color: 'var(--toul-text-muted)' }}>
                                            {new Date(mov.created_at).toLocaleDateString('es-CO', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                            {mov.notes ? ` · ${mov.notes}` : ''}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-bold text-sm" style={{ color }}>
                                            {mov.quantity > 0 ? '+' : ''}{mov.quantity}
                                        </p>
                                    </div>
                                </div>
                            )
                        })}
                    </motion.div>
                ) : (
                    <motion.div key="insights"
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex flex-col gap-3">

                        {/* Stock status */}
                        <div className="toul-card p-4 flex items-start gap-3"
                            style={{ borderLeft: `3px solid ${getStockColor(product.stock, threshold)}` }}>
                            <Package size={18} className="mt-0.5 flex-shrink-0"
                                style={{ color: getStockColor(product.stock, threshold) }} />
                            <div>
                                <p className="text-sm font-bold mb-1" style={{ color: 'var(--toul-text)' }}>
                                    {product.stock === 0 ? 'Sin stock' : product.stock <= threshold ? 'Stock bajo' : 'Stock disponible'}
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                    {product.stock === 0
                                        ? 'Este producto no tiene unidades disponibles. Considera hacer una compra.'
                                        : product.stock <= threshold
                                            ? `Quedan ${product.stock} unidades, por debajo del umbral de ${threshold}.${daysLeft ? ` Al ritmo actual, se agotarán en ${daysLeft} días.` : ''}`
                                            : `Tienes ${product.stock} unidades disponibles.${daysLeft ? ` Al ritmo actual, durarán ~${daysLeft} días.` : ''}`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Signal insight */}
                        {insight && (
                            <div className="toul-card p-4 flex items-start gap-3"
                                style={{
                                    borderLeft: `3px solid ${insight.key === 'top' || insight.key === 'buen_margen'
                                        ? 'var(--toul-accent)'
                                        : insight.key === 'stock_bajo'
                                            ? 'var(--toul-warning)'
                                            : 'var(--toul-text-muted)'}`
                                }}>
                                <Sparkles size={18} className="mt-0.5 flex-shrink-0"
                                    style={{
                                        color: insight.key === 'top' || insight.key === 'buen_margen'
                                            ? 'var(--toul-accent)'
                                            : insight.key === 'stock_bajo'
                                                ? 'var(--toul-warning)'
                                                : 'var(--toul-text-muted)'
                                    }} />
                                <div>
                                    <p className="text-sm font-bold mb-1" style={{ color: 'var(--toul-text)' }}>{insight.message}</p>
                                    <p className="text-sm leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                        {insight.key === 'top' && 'Este producto está entre los más vendidos del negocio. Asegúrate de mantener stock.'}
                                        {insight.key === 'sin_ventas' && 'No ha tenido ventas en 14 días. Considera revisar el precio o visibilidad.'}
                                        {insight.key === 'stock_bajo' && 'El stock está por debajo del umbral configurado. Considera hacer una compra pronto.'}
                                        {insight.key === 'buen_margen' && 'Este producto tiene un buen margen. Es uno de los más rentables del catálogo.'}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Sales velocity */}
                        <div className="toul-card p-4 flex items-start gap-3">
                            <TrendingUp size={18} className="mt-0.5 flex-shrink-0"
                                style={{ color: 'var(--toul-accent)' }} />
                            <div>
                                <p className="text-sm font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Velocidad de ventas</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                    {sales30d === 0
                                        ? 'Sin ventas en los últimos 30 días.'
                                        : `${sales30d} unidades vendidas en 30 días (≈${(sales30d / 30).toFixed(1)} por día).`
                                    }
                                </p>
                            </div>
                        </div>

                        {/* Profitability */}
                        <div className="toul-card p-4 flex items-start gap-3">
                            <Wallet size={18} className="mt-0.5 flex-shrink-0"
                                style={{ color: margin >= 20 ? 'var(--toul-accent)' : 'var(--toul-warning)' }} />
                            <div>
                                <p className="text-sm font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Rentabilidad</p>
                                <p className="text-sm leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                    Precio {formatCOP(product.sale_price)} · Costo promedio {formatCOP(product.cpp)} · Margen {margin}%
                                    {margin < 20 ? ' — por debajo del 20%.' : ' — rentabilidad saludable.'}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
