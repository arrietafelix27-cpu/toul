'use client'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, ShoppingCart, Package, ArrowUpRight, ArrowDownLeft,
    SlidersHorizontal, Sparkles, History,
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp } from '@/lib/motion'

const supabase = createClient()

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
        return { label: REASON_LABELS[reason] ?? 'Entrada', Icon: ArrowUpRight, color: 'var(--toul-accent)', bg: 'rgba(50,215,75,0.1)' }
    }
    const isAdjustment = ['damage', 'loss', 'theft', 'expired', 'other'].includes(reason)
    if (isAdjustment) {
        return { label: REASON_LABELS[reason] ?? 'Ajuste', Icon: SlidersHorizontal, color: 'var(--toul-warning)', bg: 'var(--toul-warning-dim)' }
    }
    return { label: REASON_LABELS[reason] ?? 'Salida', Icon: ArrowDownLeft, color: 'var(--toul-error)', bg: 'rgba(239,68,68,0.1)' }
}

function getStockColor(stock: number, threshold: number): string {
    if (stock === 0) return 'var(--toul-text-muted)'
    if (stock <= threshold) return 'var(--toul-warning)'
    return 'var(--toul-accent)'
}

function getStockBadge(stock: number, threshold: number): { label: string; bg: string; color: string } {
    if (stock === 0) return { label: 'Sin stock', bg: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }
    if (stock <= threshold) return { label: 'Stock bajo', bg: 'var(--toul-warning-dim)', color: 'var(--toul-warning)' }
    return { label: 'En stock', bg: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function InventoryVariantDetailPage() {
    const { variantId } = useParams<{ variantId: string }>()
    const [activeTab, setActiveTab] = useState<'movements' | 'insights'>('movements')

    // 1 — Variant
    const { data: variant, isLoading: variantLoading } = useSWR(
        ['inv-variant', variantId],
        async () => {
            const { data } = await supabase
                .from('product_variants')
                .select('id, name, sale_price, cpp, product_id, low_stock_threshold')
                .eq('id', variantId)
                .single()
            return data
        }
    )

    // 2 — Parent product
    const { data: product } = useSWR(
        variant?.product_id ? ['inv-variant-parent', variant.product_id] : null,
        async () => {
            const { data } = await supabase
                .from('products')
                .select('id, name')
                .eq('id', variant!.product_id)
                .single()
            return data
        }
    )

    // 3 — Movements (stock source + movement list)
    const { data: movements } = useSWR(
        ['inv-variant-movements', variantId],
        async () => {
            const { data } = await supabase
                .from('inventory_adjustments')
                .select('id, quantity, reason, notes, created_at')
                .eq('variant_id', variantId)
                .order('created_at', { ascending: false })
                .limit(50)
            return data ?? []
        }
    )

    // 4 — Sales last 30d
    const { data: sales30d } = useSWR(
        ['inv-variant-sales-30d', variantId],
        async () => {
            const since = new Date()
            since.setDate(since.getDate() - 30)
            const { data } = await supabase
                .from('sale_items')
                .select('quantity, created_at')
                .eq('variant_id', variantId)
                .gte('created_at', since.toISOString())
            return data ?? []
        }
    )

    // Derived values
    const stock = useMemo(
        () => Math.round((movements ?? []).reduce((s, m) => s + m.quantity, 0)),
        [movements]
    )

    const sold30d = useMemo(
        () => (sales30d ?? []).reduce((s, i) => s + i.quantity, 0),
        [sales30d]
    )

    const threshold = variant?.low_stock_threshold ?? 5
    const cpp = variant?.cpp ?? 0
    const salePrice = variant?.sale_price ?? 0
    const totalValue = Math.round(stock * cpp)
    const dailyRate = sold30d / 30
    const daysLeft = dailyRate > 0 ? Math.round(stock / dailyRate) : null

    // ── Loading ──────────────────────────────────────────────
    if (variantLoading) return (
        <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
            <div className="h-8 w-36 rounded-xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="h-36 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
            <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
                ))}
            </div>
            <div className="h-64 rounded-2xl animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
        </div>
    )

    if (!variant) return (
        <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>
            Variante no encontrada
        </div>
    )

    const badge = getStockBadge(stock, threshold)

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center gap-3 mb-6"
                style={{ position: 'relative' }}>
                <Link href="/inventory"
                    className="flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                        textDecoration: 'none',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </Link>
                <div className="flex-1 min-w-0">
                    {product && (
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {product.name}
                        </p>
                    )}
                    <h1 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {variant.name}
                    </h1>
                </div>
                {product && (
                    <Link
                        href={`/inventory/purchase?product=${product.id}&variant=${variantId}`}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 flex-shrink-0"
                        style={{ background: 'var(--toul-accent)', color: '#000', textDecoration: 'none' }}>
                        <ShoppingCart size={15} />
                        Comprar
                    </Link>
                )}
            </motion.div>

            {/* Stock Hero */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card p-5 mb-4 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 opacity-[0.04]" style={{ color: 'var(--toul-text)' }}>
                    <Package size={100} />
                </div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1"
                    style={{ color: 'var(--toul-text-subtle)' }}>Stock actual</p>
                <div className="flex items-end gap-3 mb-2">
                    <span className="text-5xl font-bold leading-none"
                        style={{ color: getStockColor(stock, threshold) }}>
                        {stock}
                    </span>
                    <span className="text-base mb-1 font-medium" style={{ color: 'var(--toul-text-muted)' }}>
                        unidades
                    </span>
                    <span className="mb-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                        style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                    </span>
                </div>
                <div className="flex items-center gap-5 pt-4"
                    style={{ borderTop: '1px solid var(--toul-border)' }}>
                    <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Costo promedio</p>
                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(cpp)}</p>
                    </div>
                    <div className="w-px h-8" style={{ background: 'var(--toul-border)' }} />
                    <div>
                        <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Valor en bodega</p>
                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(totalValue)}</p>
                    </div>
                </div>
            </motion.div>

            {/* Quick metrics */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="grid grid-cols-2 gap-3 mb-6">
                <div className="toul-card p-4">
                    <p className="text-xs mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Ventas últimos 30d</p>
                    {sales30d === undefined ? (
                        <div className="h-8 w-10 rounded animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
                    ) : (
                        <>
                            <p className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>{sold30d}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-muted)' }}>unidades</p>
                        </>
                    )}
                </div>
                <div className="toul-card p-4">
                    <p className="text-xs mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Días restantes</p>
                    {movements === undefined ? (
                        <div className="h-8 w-10 rounded animate-pulse" style={{ background: 'var(--toul-surface-2)' }} />
                    ) : (
                        <>
                            <p className="text-2xl font-bold"
                                style={{ color: daysLeft !== null && daysLeft < 7 ? 'var(--toul-warning)' : 'var(--toul-text)' }}>
                                {daysLeft !== null ? daysLeft : '—'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-muted)' }}>
                                {daysLeft !== null ? 'al ritmo actual' : 'sin ventas recientes'}
                            </p>
                        </>
                    )}
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
                            border: 'none', cursor: 'pointer',
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
                {activeTab === 'movements' && (
                    <motion.div key="movements"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                        {movements === undefined ? (
                            <div className="space-y-3">
                                {[0, 1, 2, 3].map(i => (
                                    <div key={i} className="h-16 rounded-2xl animate-pulse"
                                        style={{ background: 'var(--toul-surface-2)' }} />
                                ))}
                            </div>
                        ) : movements.length === 0 ? (
                            <div className="toul-card flex flex-col items-center py-12 gap-2">
                                <History size={28} style={{ color: 'var(--toul-border-2)' }} />
                                <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Sin movimientos registrados</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {movements.map(mov => {
                                    const { label, Icon, color, bg } = getMovementDisplay(mov.quantity, mov.reason)
                                    return (
                                        <div key={mov.id} className="toul-card p-3 flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                                style={{ background: bg }}>
                                                <Icon size={16} style={{ color }} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate" style={{ color: 'var(--toul-text)' }}>
                                                    {label}
                                                </p>
                                                {mov.notes && (
                                                    <p className="text-xs truncate mt-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                                                        {mov.notes}
                                                    </p>
                                                )}
                                                <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-muted)' }}>
                                                    {formatDate(mov.created_at)}
                                                </p>
                                            </div>
                                            <span className="text-sm font-bold flex-shrink-0"
                                                style={{ color: mov.quantity > 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                                {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </motion.div>
                )}

                {activeTab === 'insights' && (
                    <motion.div key="insights"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
                        <div className="toul-card flex flex-col items-center py-12 gap-3 text-center px-6">
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                                style={{ background: 'var(--toul-accent-dim)' }}>
                                <Sparkles size={22} style={{ color: 'var(--toul-accent)' }} />
                            </div>
                            <p className="font-semibold" style={{ color: 'var(--toul-text)' }}>Análisis de variante</p>
                            <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                                Stock: {stock} uds · Vendidas 30d: {sold30d} · CPP: {formatCOP(cpp)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                Los insights AI están disponibles en el producto padre
                            </p>
                            {product && (
                                <Link href={`/inventory/${product.id}`}
                                    className="text-sm font-semibold px-4 py-2 rounded-xl transition-all active:scale-95"
                                    style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)', textDecoration: 'none' }}>
                                    Ver producto padre
                                </Link>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
