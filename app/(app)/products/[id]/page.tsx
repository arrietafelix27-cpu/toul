'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Edit3, ChevronLeft, ChevronRight, Package, TrendingUp, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, t } from '@/lib/motion'
import {
    buildSignalContext,
    computeProductSignal,
    computeInsightMessage,
    getSignalStyle,
} from '@/lib/products/signals'

// ────────────────────────────────────────────────────────────
// Local helpers (mobile redesign)
// ────────────────────────────────────────────────────────────

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function getInitials(name: string): string {
    const cleaned = (name || '').trim()
    if (!cleaned) return '??'
    const words = cleaned.split(/\s+/).filter(w => /^[a-záéíóúñ]/i.test(w))
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
    return cleaned.slice(0, 2).toUpperCase()
}

function formatRevenue(n: number): string {
    const rounded = Math.round(n)
    if (rounded === 0) return '$0'
    if (rounded >= 1_000_000) {
        return `$${(rounded / 1_000_000).toFixed(1)}M`.replace('.0M', 'M')
    }
    return formatCOP(rounded)
}

function formatDate(iso: string): string {
    if (!iso) return '—'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '—'
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────

export default function ProductDetailPage() {
    const { id } = useParams<{ id: string }>()
    const supabase = createClient()
    const [product, setProduct] = useState<Product | null>(null)
    const [loading, setLoading] = useState(true)
    const [imgIdx, setImgIdx] = useState(0)

    const [unitsSold14d, setUnitsSold14d] = useState(0)
    const [revenue14d, setRevenue14d] = useState(0)
    const [variantPrices, setVariantPrices] = useState<{ min: number; max: number } | null>(null)
    const [allProducts, setAllProducts] = useState<Product[]>([])
    const [allSaleItems, setAllSaleItems] = useState<Array<{ product_id: string; quantity: number; unit_price: number; created_at: string }>>([])

    const loadProduct = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setLoading(false); return }

        const { data: prod } = await supabase
            .from('products')
            .select('*, category:product_categories(id, name)')
            .eq('id', id)
            .single()
        setProduct(prod as Product | null)

        if (prod) {
            const [productsRes, salesRes, variantsRes] = await Promise.all([
                supabase.from('products').select('*').eq('store_id', store.id).eq('is_active', true),
                // sale_items has NO created_at column — it lives on the sales parent. Join inline.
                supabase.from('sale_items').select('product_id, quantity, unit_price, sales!inner(created_at)').eq('store_id', store.id),
                supabase.from('product_variants').select('sale_price').eq('product_id', id).eq('is_active', true),
            ])
            if (variantsRes.data && variantsRes.data.length > 0) {
                const prices = (variantsRes.data as { sale_price: number }[]).map(v => v.sale_price)
                setVariantPrices({ min: Math.min(...prices), max: Math.max(...prices) })
            }
            setAllProducts(productsRes.data || [])

            // Normalize joined sales.created_at to a flat shape
            const saleItems = ((salesRes.data || []) as unknown as Array<{
                product_id: string
                quantity: number
                unit_price: number | null
                sales: { created_at: string } | { created_at: string }[] | null
            }>).map(item => {
                const salesRelation = Array.isArray(item.sales) ? item.sales[0] : item.sales
                return {
                    product_id: item.product_id,
                    quantity: item.quantity,
                    unit_price: item.unit_price ?? 0,
                    created_at: salesRelation?.created_at ?? '',
                }
            }).filter(item => item.created_at)
            setAllSaleItems(saleItems)

            // Units sold + revenue last 14 days
            const now = new Date()
            const fourteenDaysAgo = new Date(now)
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
            const recentSales = saleItems.filter(
                item => item.product_id === id && new Date(item.created_at) >= fourteenDaysAgo
            )
            setUnitsSold14d(recentSales.reduce((sum, item) => sum + item.quantity, 0))
            setRevenue14d(recentSales.reduce((sum, item) => sum + Math.round((item.unit_price || 0) * item.quantity), 0))
        }
        setLoading(false)
    }, [id])

    useEffect(() => { loadProduct() }, [loadProduct])

    // Signal context (preserved for desktop)
    const signalContext = useMemo(() => {
        if (!allProducts.length || !allSaleItems) return null
        return buildSignalContext(allProducts, allSaleItems)
    }, [allProducts, allSaleItems])

    // ── Loading skeleton (mobile-friendly, new language) ─────
    if (loading) return (
        <div>
            {/* Mobile skeleton */}
            <div className="md:hidden">
                <div className="skeleton" style={{ width: '100%', height: 300, borderRadius: 0 }} />
                <div style={{ padding: '20px 16px 90px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                        {[0, 1, 2, 3].map(i => (
                            <div key={i} className="skeleton" style={{ height: 84, borderRadius: 16 }} />
                        ))}
                    </div>
                    <div className="skeleton" style={{ height: 18, width: 100, borderRadius: 6, marginBottom: 14 }} />
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className="skeleton" style={{ height: 18, borderRadius: 6, marginBottom: 18 }} />
                    ))}
                </div>
            </div>
            {/* Desktop skeleton (legacy) */}
            <div className="hidden md:block px-8 pt-6">
                <div className="skeleton h-10 w-32 rounded-xl mb-5" />
                <div className="skeleton h-72 w-full rounded-3xl mb-4" />
                <div className="skeleton h-8 w-48 rounded-xl mb-2" />
                <div className="skeleton h-10 w-32 rounded-xl mb-5" />
                <div className="skeleton h-20 w-full rounded-2xl" />
            </div>
        </div>
    )
    if (!product) return <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>Producto no encontrado</div>

    // Images
    const images: string[] = []
    if (product.images && product.images.length > 0) {
        images.push(...product.images)
    } else if (product.image_url) {
        images.push(product.image_url)
    }

    // Derived metrics
    const sale = Math.round(product.sale_price || 0)
    const cpp = Math.round(product.cpp || 0)
    const hasCost = cpp > 0
    const profit = hasCost ? sale - cpp : 0
    const marginPct = hasCost && sale > 0 ? Math.round((profit / sale) * 100) : 0
    const profitColor = !hasCost ? 'rgba(255,255,255,0.4)' : profit >= 0 ? '#32d74b' : '#ff453a'
    const marginColor = !hasCost
        ? 'rgba(255,255,255,0.4)'
        : marginPct > 35 ? '#32d74b'
            : marginPct > 15 ? '#ffd60a'
                : '#ff453a'

    // Hero price (respects variantPrices). Strip any whitespace between $ and the digits —
    // Intl.NumberFormat('es-CO', 'currency') inserts a non-breaking space that's visible at 28px/800.
    const stripDollarGap = (s: string) => s.replace(/\$[\s ]+/g, '$')
    const heroPrice = stripDollarGap(
        variantPrices
            ? variantPrices.min === variantPrices.max
                ? formatCOP(variantPrices.min)
                : `${formatCOP(variantPrices.min)} – ${formatCOP(variantPrices.max)}`
            : formatCOP(sale)
    )

    // Legacy margin & profit for desktop (preserved)
    const marginLegacy = product.sale_price > 0 && product.cpp > 0
        ? ((product.sale_price - product.cpp) / product.sale_price * 100)
        : 0
    const profitPerUnit = variantPrices ? null : product.sale_price - product.cpp
    const signal = signalContext ? computeProductSignal(product, signalContext) : null
    const signalStyle = signal ? getSignalStyle(signal.color) : null
    const insight = signalContext ? computeInsightMessage(product, signalContext) : null

    const heroImage = images[0] || null
    const categoryName = (product as Product & { category?: { id: string; name: string } | null }).category?.name

    return (
        <>
            {/* ═══════════════════════════════════════════════════════
                MOBILE — Hero immersive + scrollable content
            ═══════════════════════════════════════════════════════ */}
            <div className="md:hidden">

                {/* ─── HERO ─────────────────────────────────────── */}
                <div style={{ position: 'relative', height: 300, overflow: 'hidden' }}>
                    {/* Image or initials fallback */}
                    {heroImage ? (
                        <img
                            src={heroImage}
                            alt={product.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            width: '100%', height: '100%',
                            background: 'rgba(26,15,46,1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{
                                fontSize: 48,
                                fontWeight: 700,
                                color: 'rgba(255,255,255,0.15)',
                                letterSpacing: '-0.02em',
                            }}>
                                {getInitials(product.name)}
                            </span>
                        </div>
                    )}

                    {/* Gradient overlay (bottom 200px → #0a0a0a) */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0, left: 0, right: 0,
                        height: 200,
                        background: 'linear-gradient(to top, #0a0a0a 30%, transparent 100%)',
                        pointerEvents: 'none',
                    }} />

                    {/* Topbar */}
                    <div style={{
                        position: 'absolute',
                        top: 16, left: 0, right: 0,
                        padding: '0 16px',
                        zIndex: 2,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}>
                        <Link
                            href="/products"
                            className="active:scale-95"
                            style={{
                                width: 36, height: 36,
                                borderRadius: 11,
                                background: 'rgba(10,10,10,0.7)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                backdropFilter: 'blur(8px)',
                                WebkitBackdropFilter: 'blur(8px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'transform 0.15s var(--toul-ease)',
                                textDecoration: 'none',
                            }}>
                            <ArrowLeft size={17} strokeWidth={2} color="rgba(255,255,255,0.8)" />
                        </Link>

                        <Link
                            href={`/products/${id}/edit`}
                            className="active:scale-95"
                            style={{
                                height: 36,
                                padding: '0 14px',
                                borderRadius: 11,
                                background: '#32d74b',
                                color: '#000',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                fontSize: 12,
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                textDecoration: 'none',
                                boxShadow: '0 4px 16px rgba(50,215,75,0.25)',
                                transition: 'transform 0.15s var(--toul-ease)',
                            }}>
                            <Edit3 size={13} strokeWidth={2.6} />
                            Editar
                        </Link>
                    </div>

                    {/* Name + Price */}
                    <div style={{
                        position: 'absolute',
                        bottom: 0, left: 0, right: 0,
                        padding: '0 18px 20px',
                        zIndex: 2,
                    }}>
                        <h1 style={{
                            fontSize: 26,
                            fontWeight: 700,
                            color: '#fff',
                            letterSpacing: '-0.8px',
                            lineHeight: 1.1,
                            margin: 0,
                            marginBottom: 6,
                        }}>
                            {product.name}
                        </h1>
                        <p style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color: '#32d74b',
                            letterSpacing: '-1px',
                            margin: 0,
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {heroPrice}
                        </p>
                    </div>
                </div>

                {/* ─── CONTENT ──────────────────────────────────── */}
                <div style={{ padding: '20px 16px 90px' }}>

                    {/* Metrics 2x2 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 10,
                        marginBottom: 20,
                    }}>
                        <MetricCard
                            label="Ganancia por unidad"
                            value={hasCost ? formatCOP(profit) : '—'}
                            valueColor={profitColor}
                            sub="precio - costo"
                        />
                        <MetricCard
                            label="Margen"
                            value={hasCost && sale > 0 ? `${marginPct}%` : '—'}
                            valueColor={marginColor}
                            sub="sobre precio de venta"
                        />
                        <MetricCard
                            label="Vendidas"
                            value={String(unitsSold14d)}
                            valueColor="rgba(255,255,255,0.8)"
                            sub="últimos 14 días"
                        />
                        <MetricCard
                            label="Ingresos"
                            value={formatRevenue(revenue14d)}
                            valueColor="rgba(255,255,255,0.8)"
                            sub="últimos 14 días"
                        />
                    </div>

                    {/* Divisor */}
                    <div style={{
                        height: 1,
                        background: 'rgba(255,255,255,0.06)',
                        margin: '4px 0 20px',
                    }} />

                    {/* Información */}
                    <div style={{ marginBottom: 20 }}>
                        <h2 style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: 'rgba(255,255,255,0.38)',
                            margin: '0 0 12px 0',
                        }}>
                            Información
                        </h2>

                        <InfoRow
                            label="Referencia"
                            value={product.reference || 'Sin referencia'}
                            faded={!product.reference}
                        />
                        <InfoRow
                            label="Categoría"
                            value={categoryName || 'Sin categoría'}
                            faded={!categoryName}
                        />
                        <InfoRow
                            label="Costo"
                            value={cpp > 0 ? formatCOP(cpp) : 'No registrado'}
                            faded={cpp === 0}
                        />
                        <InfoRow
                            label="Creado"
                            value={formatDate(product.created_at)}
                            faded={false}
                            isLast
                        />
                    </div>

                    {/* Acciones — 2 botones */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 10,
                        marginTop: 20,
                    }}>
                        <ActionButton
                            href={`/inventory?product=${id}`}
                            icon={Package}
                            label="Ver inventario"
                        />
                        <ActionButton
                            href={`/ventas?product=${id}`}
                            icon={BarChart3}
                            label="Ver ventas"
                        />
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                DESKTOP — preserved 100%
            ═══════════════════════════════════════════════════════ */}
            <div className="hidden md:block pb-10" style={{ position: 'relative' }}>
                <div className="toul-ambient" />
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-6 mb-4 md:px-8" style={{ position: 'relative' }}>
                    <Link href="/products"
                        className="flex items-center justify-center transition-all active:scale-90"
                        style={{
                            width: 36, height: 36, borderRadius: 12,
                            background: 'rgba(255,255,255,0.07)',
                            color: 'rgba(255,255,255,0.7)',
                        }}>
                        <ArrowLeft size={17} strokeWidth={2} />
                    </Link>
                    <Link href={`/products/${id}/edit`}
                        className="flex items-center gap-2 transition-all active:scale-95"
                        style={{
                            padding: '9px 16px',
                            borderRadius: 12,
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            background: 'var(--toul-accent)',
                            color: '#000',
                            textDecoration: 'none',
                            boxShadow: '0 4px 16px var(--toul-accent-glow)',
                        }}>
                        <Edit3 size={15} strokeWidth={2.4} /> Editar
                    </Link>
                </div>

                <div className="md:grid md:grid-cols-2 md:gap-10 md:px-8 md:items-start">

                    {/* Hero Image */}
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mx-4 mb-5 md:mx-0 md:mb-0 md:sticky md:top-6">
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
                                <div className="w-full h-full flex items-center justify-center text-6xl opacity-40">📦</div>
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

                    {/* Product Info */}
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" className="px-4 md:px-0">
                        {/* Name + Price + Signal */}
                        <div className="mb-5">
                            <h1 className="text-2xl font-bold leading-tight mb-1" style={{ color: 'var(--toul-text)' }}>
                                {product.name}
                            </h1>
                            <p className="text-3xl font-bold mb-2" style={{ color: 'var(--toul-accent)' }}>
                                {heroPrice}
                            </p>
                            {signal && signalStyle && (
                                <span
                                    className="inline-block text-xs font-medium px-2.5 py-1 rounded-lg"
                                    style={{ background: signalStyle.bg, color: signalStyle.text }}
                                >
                                    {signal.label}
                                </span>
                            )}
                        </div>

                        {/* Key Block — 3 metrics */}
                        <div className="grid grid-cols-3 gap-3 mb-5">
                            <div className="toul-card py-3 text-center">
                                <p className="text-[11px] mb-1" style={{ color: 'var(--toul-text-muted)' }}>Ganancia/ud</p>
                                <p className="font-bold text-sm" style={{ color: profitPerUnit !== null && profitPerUnit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {profitPerUnit !== null ? formatCOP(profitPerUnit) : '—'}
                                </p>
                            </div>
                            <div className="toul-card py-3 text-center">
                                <p className="text-[11px] mb-1" style={{ color: 'var(--toul-text-muted)' }}>Margen</p>
                                <p className="font-bold text-sm" style={{ color: marginLegacy >= 20 ? 'var(--toul-accent)' : '#F59E0B' }}>
                                    {marginLegacy > 0 ? `${marginLegacy.toFixed(1)}%` : '—'}
                                </p>
                            </div>
                            <div className="toul-card py-3 text-center">
                                <p className="text-[11px] mb-1" style={{ color: 'var(--toul-text-muted)' }}>Vendidas (14d)</p>
                                <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>
                                    {unitsSold14d > 0 ? unitsSold14d : 'Aún no tiene ventas'}
                                </p>
                            </div>
                        </div>

                        {/* Mini Insight */}
                        {insight && (
                            <div
                                className="flex items-center gap-3 p-3.5 rounded-xl mb-5"
                                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}
                            >
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'var(--toul-accent-dim)' }}>
                                    <TrendingUp size={16} style={{ color: 'var(--toul-accent)' }} />
                                </div>
                                <p className="text-sm font-medium" style={{ color: 'var(--toul-text-muted)' }}>
                                    {insight.message}
                                </p>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col gap-2.5">
                            <Link href={`/products/${id}/edit`}
                                className="toul-btn-primary"
                                style={{ display: 'flex', textDecoration: 'none', gap: '0.5rem' }}>
                                <Edit3 size={18} /> Editar producto
                            </Link>
                            <div className="grid grid-cols-2 gap-2.5">
                                <Link href="/inventory"
                                    className="toul-btn-ghost justify-center py-3"
                                    style={{ textDecoration: 'none' }}>
                                    <Package size={16} /> Ver en inventario
                                </Link>
                                <Link href="/ventas"
                                    className="toul-btn-ghost justify-center py-3"
                                    style={{ textDecoration: 'none' }}>
                                    <BarChart3 size={16} /> Ver ventas
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                </div>{/* grid wrapper */}
            </div>
        </>
    )
}

// ────────────────────────────────────────────────────────────
// Sub-components (mobile)
// ────────────────────────────────────────────────────────────

function MetricCard({
    label, value, valueColor, sub,
}: {
    label: string
    value: string
    valueColor: string
    sub: string
}) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
            padding: '14px 16px',
        }}>
            <p style={{
                fontSize: 11,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.38)',
                margin: '0 0 6px 0',
            }}>
                {label}
            </p>
            <p style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.5px',
                color: valueColor,
                margin: 0,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.1,
            }}>
                {value}
            </p>
            <p style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.25)',
                margin: '3px 0 0',
            }}>
                {sub}
            </p>
        </div>
    )
}

function InfoRow({
    label, value, faded, isLast,
}: {
    label: string
    value: string
    faded: boolean
    isLast?: boolean
}) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 0',
            borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
        }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>{label}</span>
            <span style={{
                fontSize: 13,
                fontWeight: 500,
                color: faded ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.8)',
            }}>
                {value}
            </span>
        </div>
    )
}

function ActionButton({
    href, icon: Icon, label,
}: {
    href: string
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
    label: string
}) {
    return (
        <Link
            href={href}
            className="active:scale-[0.98]"
            style={{
                height: 48,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                textDecoration: 'none',
                transition: 'background 0.15s var(--toul-ease), transform 0.15s var(--toul-ease)',
            }}>
            <Icon size={16} strokeWidth={1.8} color="rgba(255,255,255,0.5)" />
            <span style={{
                fontSize: 13,
                color: 'rgba(255,255,255,0.6)',
                fontWeight: 500,
            }}>
                {label}
            </span>
        </Link>
    )
}
