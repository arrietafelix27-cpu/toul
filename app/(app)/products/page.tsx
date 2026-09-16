'use client'
import { useState, useMemo } from 'react'
import { formatCOP } from '@/lib/utils'
import { Plus, Search, Package, Share, Tag, ChevronDown, ChevronRight, Layers, X, ArrowUpDown, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem, fadeUp } from '@/lib/motion'
import { Skeleton, GridSkeleton } from '@/components/ui/Skeleton'
import { useToulData, useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import dynamic from 'next/dynamic'
import {
    buildSignalContext,
    computeProductSignal,
    getSignalStyle,
    type SignalContext,
} from '@/lib/products/signals'

const CatalogExportModal = dynamic(() => import('./CatalogExportModal').then(m => m.CatalogExportModal), { ssr: false })
const CategoriesModal = dynamic(() => import('@/components/products/CategoriesModal').then(m => m.CategoriesModal), { ssr: false })

type TypeFilter = 'todos' | 'simples' | 'variantes' | 'combos'
type SortOrder = 'az' | 'za' | 'mas_caros' | 'mas_baratos' | 'mas_vendidos' | 'recientes'

const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'simples', label: 'Simples' },
    { value: 'variantes', label: 'Con variantes' },
    { value: 'combos', label: 'Combos' },
]

const SORT_CYCLE: SortOrder[] = ['az', 'za', 'mas_vendidos', 'mas_caros']
const SORT_LABELS: Record<SortOrder, string> = {
    az: 'A → Z',
    za: 'Z → A',
    mas_caros: 'Más caros',
    mas_baratos: 'Más baratos',
    mas_vendidos: 'Más vendidos',
    recientes: 'Recientes',
}

const GRID_COLS = 'repeat(auto-fill, minmax(220px, 1fr))'

const PLACEHOLDER_BGS = ['#16092e', '#051a0e', '#1a0f02', '#040d1c', '#1a0609', '#09041a']
const PLACEHOLDER_TEXTS = ['#6d28d9', '#166534', '#92400e', '#1e40af', '#9d174d', '#4c1d95']

function hashColor(name: string): { bg: string; text: string } {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
        hash = (hash * 31 + name.charCodeAt(i)) & 0xffffff
    }
    const idx = Math.abs(hash) % 6
    return { bg: PLACEHOLDER_BGS[idx], text: PLACEHOLDER_TEXTS[idx] }
}

function getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(w => /[a-zA-ZÀ-ÿ]/.test(w[0] || ''))
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
    return name.trim().slice(0, 2).toUpperCase()
}

type ComboRow = { id: string; name: string; sale_price: number; image_url: string | null }
type VariantRow = { id: string; product_id: string; name: string; sale_price: number }
type CatalogItem =
    | { kind: 'product'; data: Product }
    | { kind: 'combo'; data: ComboRow }

type MobileItem =
    | { kind: 'simple'; data: Product }
    | { kind: 'variant'; data: Product; variants: VariantRow[] }
    | { kind: 'combo'; data: ComboRow }

async function fetchCombos(storeId: string) {
    const supabase = createClient()
    const { data } = await supabase
        .from('combos')
        .select('id, name, sale_price, image_url')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('name')
    return (data || []) as ComboRow[]
}

async function fetchVariants(storeId: string) {
    const supabase = createClient()
    const { data } = await supabase
        .from('product_variants')
        .select('id, product_id, name, sale_price')
        .eq('store_id', storeId)
        .eq('is_active', true)
    return (data || []) as VariantRow[]
}

async function fetchSaleItemsWithDates(storeId: string) {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, quantity, sale_id, sales!inner(created_at)')
        .eq('store_id', storeId)
    if (error) return []
    return (data || []).map((item: any) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        created_at: item.sales?.created_at || new Date().toISOString(),
    }))
}

export default function ProductsPage() {
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const { data: products, isLoading: productsLoading } = useToulData<Product>(
        'products',
        storeId,
        { select: '*, category:product_categories(id, name)', eq: { is_active: true }, order: { column: 'name' } }
    )

    const { data: saleItems } = useSWR(
        storeId ? ['sale-items-signals', storeId] : null,
        ([, sid]) => fetchSaleItemsWithDates(sid as string),
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    const { data: combos } = useSWR(
        storeId ? ['combos-catalog', storeId] : null,
        ([, sid]) => fetchCombos(sid as string),
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    const { data: variantRows } = useSWR(
        storeId ? ['variants-catalog', storeId] : null,
        ([, sid]) => fetchVariants(sid as string),
        { revalidateOnFocus: false, dedupingInterval: 60000 }
    )

    const variantsByProduct = useMemo<Record<string, VariantRow[]>>(() => {
        const map: Record<string, VariantRow[]> = {}
        for (const v of variantRows || []) {
            if (!map[v.product_id]) map[v.product_id] = []
            map[v.product_id].push(v)
        }
        return map
    }, [variantRows])

    const unitsByProduct = useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {}
        for (const item of saleItems || []) {
            map[item.product_id] = (map[item.product_id] || 0) + item.quantity
        }
        return map
    }, [saleItems])

    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
    const [sortOrder, setSortOrder] = useState<SortOrder>('az')
    const [showExportModal, setShowExportModal] = useState(false)
    const [showCategoriesModal, setShowCategoriesModal] = useState(false)
    const [showFilterPanel, setShowFilterPanel] = useState(false)
    const [searchFocused, setSearchFocused] = useState(false)
    const [drawerProductId, setDrawerProductId] = useState<string | null>(null)

    function cycleSortOrder() {
        setSortOrder(prev => {
            const idx = SORT_CYCLE.indexOf(prev)
            return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
        })
    }

    const isLoading = productsLoading || storeLoading
    const isFiltered = typeFilter !== 'todos' || sortOrder !== 'az'

    const signalContext = useMemo<SignalContext | null>(() => {
        if (!products) return null
        return buildSignalContext(products, saleItems || [])
    }, [products, saleItems])

    const { simpleProducts, variantProducts, comboItems } = useMemo(() => {
        const query = search.trim().toLowerCase()
        const allProducts = (products || []).filter(p =>
            !query ||
            p.name.toLowerCase().includes(query) ||
            (p.reference && p.reference.toLowerCase().includes(query))
        )

        const sortProductList = (list: Product[]): Product[] => {
            const copy = [...list]
            switch (sortOrder) {
                case 'az': return copy.sort((a, b) => a.name.localeCompare(b.name))
                case 'za': return copy.sort((a, b) => b.name.localeCompare(a.name))
                case 'mas_caros': return copy.sort((a, b) => b.sale_price - a.sale_price)
                case 'mas_baratos': return copy.sort((a, b) => a.sale_price - b.sale_price)
                case 'mas_vendidos': return copy.sort((a, b) => (unitsByProduct[b.id] || 0) - (unitsByProduct[a.id] || 0))
                case 'recientes': return copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                default: return copy
            }
        }

        const sortComboList = (list: ComboRow[]): ComboRow[] => {
            const copy = [...list]
            switch (sortOrder) {
                case 'az': return copy.sort((a, b) => a.name.localeCompare(b.name))
                case 'za': return copy.sort((a, b) => b.name.localeCompare(a.name))
                case 'mas_caros': return copy.sort((a, b) => b.sale_price - a.sale_price)
                case 'mas_baratos': return copy.sort((a, b) => a.sale_price - b.sale_price)
                default: return copy
            }
        }

        const simples = allProducts.filter(p => !(variantsByProduct[p.id]?.length))
        const variantes = allProducts.filter(p => (variantsByProduct[p.id]?.length || 0) > 0)
        const combosFiltered = (combos || []).filter(c => !query || c.name.toLowerCase().includes(query))

        return {
            simpleProducts: (typeFilter === 'todos' || typeFilter === 'simples') ? sortProductList(simples) : [],
            variantProducts: (typeFilter === 'todos' || typeFilter === 'variantes') ? sortProductList(variantes) : [],
            comboItems: (typeFilter === 'todos' || typeFilter === 'combos') ? sortComboList(combosFiltered) : [] as ComboRow[],
        }
    }, [products, combos, typeFilter, sortOrder, search, variantsByProduct, unitsByProduct])

    const mobileItems = useMemo<MobileItem[]>(() => [
        ...simpleProducts.map(p => ({ kind: 'simple' as const, data: p })),
        ...variantProducts.map(p => ({ kind: 'variant' as const, data: p, variants: variantsByProduct[p.id] || [] })),
        ...comboItems.map(c => ({ kind: 'combo' as const, data: c })),
    ], [simpleProducts, variantProducts, comboItems, variantsByProduct])

    const hasAny = simpleProducts.length > 0 || variantProducts.length > 0 || comboItems.length > 0

    const drawerProduct = useMemo(
        () => drawerProductId ? (products?.find(p => p.id === drawerProductId) ?? null) : null,
        [drawerProductId, products]
    )
    const drawerVariants = drawerProductId ? (variantsByProduct[drawerProductId] || []) : []

    return (
        <div style={{ position: 'relative' }}>
            <div className="md:hidden toul-ambient" />

            {/* ══════════════════════════════════════════
                MOBILE LAYOUT
            ══════════════════════════════════════════ */}
            <div className="md:hidden flex flex-col" style={{ position: 'relative' }}>

                {/* Sticky header */}
                <div
                    className="sticky top-0 z-20 px-4 pt-5 pb-3"
                    style={{
                        background: 'rgba(10,10,10,0.85)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                    }}
                >
                    {/* Row 1: icon buttons only (auxiliary actions) */}
                    <div className="flex items-center gap-2 mb-4">
                        <button
                            onClick={() => setShowCategoriesModal(true)}
                            className="flex items-center justify-center active:scale-[0.93] transition-transform"
                            style={{
                                width: 36, height: 36, borderRadius: 11,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.09)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                cursor: 'pointer', flexShrink: 0,
                            }}
                        >
                            <Tag size={15} color="rgba(255,255,255,0.45)" />
                        </button>
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="flex items-center justify-center active:scale-[0.93] transition-transform"
                            style={{
                                width: 36, height: 36, borderRadius: 11,
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.09)',
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                cursor: 'pointer', flexShrink: 0,
                            }}
                        >
                            <Share size={15} color="rgba(255,255,255,0.45)" />
                        </button>
                    </div>

                    {/* Row 2: title + subtitle */}
                    <div className="mb-3">
                        <h1 style={{
                            fontSize: 22, fontWeight: 700,
                            letterSpacing: '-0.8px',
                            color: 'var(--toul-text)',
                            margin: 0, lineHeight: 1.05,
                        }}>
                            Productos
                        </h1>
                    </div>

                    {/* Row 3: search + filter button as peer controls */}
                    <div className="flex items-center gap-2 mb-2.5">
                        <div className="relative flex-1">
                            <Search
                                size={15}
                                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ color: searchFocused ? 'rgba(50,215,75,0.7)' : 'rgba(255,255,255,0.4)', transition: 'color 150ms ease' }}
                            />
                            <input
                                style={{
                                    width: '100%',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: searchFocused ? '1px solid rgba(50,215,75,0.35)' : '1px solid rgba(255,255,255,0.09)',
                                    borderRadius: 13,
                                    height: 44,
                                    paddingLeft: 42,
                                    paddingRight: 16,
                                    fontSize: 14,
                                    color: 'var(--toul-text)',
                                    outline: 'none',
                                    boxShadow: searchFocused
                                        ? 'inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 3px rgba(50,215,75,0.08)'
                                        : 'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 1px 3px rgba(0,0,0,0.2)',
                                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                                }}
                                placeholder="Buscar producto..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilterPanel(true)}
                            className="relative flex items-center gap-1.5 active:scale-95 transition-transform"
                            style={{
                                height: 44, paddingLeft: 13, paddingRight: 13,
                                borderRadius: 13,
                                background: isFiltered ? 'rgba(50,215,75,0.08)' : 'rgba(255,255,255,0.04)',
                                border: isFiltered ? '1px solid rgba(50,215,75,0.28)' : '1px solid rgba(255,255,255,0.09)',
                                boxShadow: isFiltered
                                    ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 12px rgba(50,215,75,0.08)'
                                    : 'inset 0 1px 0 rgba(255,255,255,0.05)',
                                cursor: 'pointer', flexShrink: 0,
                                transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease',
                            }}
                        >
                            <SlidersHorizontal size={14} color={isFiltered ? '#32d74b' : 'rgba(255,255,255,0.45)'} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: isFiltered ? '#32d74b' : 'rgba(255,255,255,0.45)', letterSpacing: '0.01em' }}>
                                {isFiltered ? 'Filtrado' : 'Ordenar'}
                            </span>
                            {isFiltered && (
                                <span style={{
                                    position: 'absolute', top: 10, right: 10,
                                    width: 5, height: 5, borderRadius: '50%',
                                    background: '#32d74b',
                                    boxShadow: '0 0 4px rgba(50,215,75,0.8)',
                                }} />
                            )}
                        </button>
                    </div>

                    {/* Row 4: nuevo producto full width */}
                    <Link href="/products/new" style={{ textDecoration: 'none', display: 'block' }}>
                        <div
                            className="active:scale-[0.97] transition-transform"
                            style={{
                                width: '100%', height: 40, borderRadius: 12,
                                background: 'linear-gradient(135deg, #32d74b 0%, #28b73f 100%)',
                                color: '#000',
                                fontSize: 13.5, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                gap: 7, cursor: 'pointer',
                                boxShadow: '0 4px 18px rgba(50,215,75,0.22), inset 0 1px 0 rgba(255,255,255,0.25)',
                                letterSpacing: '0.01em',
                            }}
                        >
                            <Plus size={14} strokeWidth={2.5} />
                            Nuevo producto
                        </div>
                    </Link>
                </div>

                {/* Filter Panel overlay */}
                <AnimatePresence>
                    {showFilterPanel && (
                        <FilterPanel
                            typeFilter={typeFilter}
                            sortOrder={sortOrder}
                            onApply={(type, sort) => {
                                setTypeFilter(type)
                                setSortOrder(sort)
                                setShowFilterPanel(false)
                            }}
                            onClose={() => setShowFilterPanel(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Product list */}
                {isLoading ? (
                    <MobileListSkeleton />
                ) : !hasAny ? (
                    <div className="px-4 mt-4">
                        <EmptyState hasSearch={!!search.trim()} hasFilter={typeFilter !== 'todos'} />
                    </div>
                ) : (
                    <div
                        className="px-4 pb-24 pt-2"
                        style={{
                            maskImage: 'linear-gradient(to bottom, transparent 0px, black 8px)',
                            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 8px)',
                        }}
                    >
                        <AnimatePresence mode="popLayout">
                            <motion.div
                                key={typeFilter + '_' + sortOrder}
                                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                            >
                                {mobileItems.map((item, index) => (
                                    <MobileProductCard
                                        key={
                                            item.kind === 'combo'
                                                ? 'combo-' + item.data.id
                                                : item.kind === 'variant'
                                                ? 'variant-' + item.data.id
                                                : 'simple-' + item.data.id
                                        }
                                        item={item}
                                        index={index}
                                    />
                                ))}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════
                DESKTOP LAYOUT
            ══════════════════════════════════════════ */}
            <div className="hidden md:block px-8 pt-6 pb-4">

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="flex items-center justify-between mb-5 relative">
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Productos</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCategoriesModal(true)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                            style={{ color: 'var(--toul-text)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                            <Tag size={15} /> Categorías
                        </button>
                        <button
                            onClick={() => setShowExportModal(true)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 border"
                            style={{ color: 'var(--toul-text)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                            <Share size={15} /> Exportar
                        </button>
                        <Link href="/products/new"
                            className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                            style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)', textDecoration: 'none' }}>
                            <Plus size={16} /> Nuevo
                        </Link>
                    </div>
                </motion.div>

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="flex items-center gap-2 mb-5">
                    <div className="relative flex-1">
                        <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                        <input
                            className="toul-input text-sm"
                            style={{ paddingLeft: 42 }}
                            placeholder="Buscar producto..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                        <select
                            className="toul-input text-sm pr-8 appearance-none cursor-pointer"
                            style={{ minWidth: 130 }}
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
                        >
                            {TYPE_FILTER_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: 'var(--toul-text-subtle)' }} />
                    </div>
                    <button
                        onClick={cycleSortOrder}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold flex-shrink-0 transition-all active:scale-95 border"
                        style={{
                            background: 'var(--toul-surface)',
                            color: 'var(--toul-text)',
                            borderColor: 'var(--toul-border)',
                            whiteSpace: 'nowrap',
                        }}>
                        <ArrowUpDown size={14} style={{ color: 'var(--toul-text-muted)' }} />
                        <span>{SORT_LABELS[sortOrder]}</span>
                    </button>
                </motion.div>

                {isLoading ? (
                    <DesktopGridSkeleton />
                ) : !hasAny ? (
                    <EmptyState hasSearch={!!search.trim()} hasFilter={typeFilter !== 'todos'} />
                ) : (
                    <div
                        key={'desktop-' + sortOrder}
                        className="flex flex-col"
                        style={{
                            paddingRight: drawerProductId ? 336 : 0,
                            transition: 'padding-right 300ms ease',
                        }}
                    >
                        {typeFilter === 'todos' ? (
                            <>
                                {simpleProducts.length > 0 && (
                                    <>
                                        <SectionDivider label="Simples" />
                                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                                            className="grid gap-4" style={{ gridTemplateColumns: GRID_COLS }}>
                                            {simpleProducts.map(p => (
                                                <DesktopProductCard key={p.id} entry={{ kind: 'product', data: p }}
                                                    signalContext={signalContext} variantsByProduct={variantsByProduct}
                                                    onOpenDrawer={setDrawerProductId} />
                                            ))}
                                        </motion.div>
                                    </>
                                )}
                                {variantProducts.length > 0 && (
                                    <>
                                        <SectionDivider label="Con variantes" />
                                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                                            className="grid gap-4" style={{ gridTemplateColumns: GRID_COLS }}>
                                            {variantProducts.map(p => (
                                                <DesktopProductCard key={p.id} entry={{ kind: 'product', data: p }}
                                                    signalContext={signalContext} variantsByProduct={variantsByProduct}
                                                    onOpenDrawer={setDrawerProductId} />
                                            ))}
                                        </motion.div>
                                    </>
                                )}
                                {comboItems.length > 0 && (
                                    <>
                                        <SectionDivider label="Combos" />
                                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                                            className="grid gap-4" style={{ gridTemplateColumns: GRID_COLS }}>
                                            {comboItems.map(c => (
                                                <DesktopProductCard key={c.id} entry={{ kind: 'combo', data: c }}
                                                    signalContext={signalContext} variantsByProduct={variantsByProduct}
                                                    onOpenDrawer={setDrawerProductId} />
                                            ))}
                                        </motion.div>
                                    </>
                                )}
                            </>
                        ) : (
                            <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                                className="grid gap-4" style={{ gridTemplateColumns: GRID_COLS }}>
                                {simpleProducts.map(p => (
                                    <DesktopProductCard key={p.id} entry={{ kind: 'product', data: p }}
                                        signalContext={signalContext} variantsByProduct={variantsByProduct}
                                        onOpenDrawer={setDrawerProductId} />
                                ))}
                                {variantProducts.map(p => (
                                    <DesktopProductCard key={p.id} entry={{ kind: 'product', data: p }}
                                        signalContext={signalContext} variantsByProduct={variantsByProduct}
                                        onOpenDrawer={setDrawerProductId} />
                                ))}
                                {comboItems.map(c => (
                                    <DesktopProductCard key={c.id} entry={{ kind: 'combo', data: c }}
                                        signalContext={signalContext} variantsByProduct={variantsByProduct}
                                        onOpenDrawer={setDrawerProductId} />
                                ))}
                            </motion.div>
                        )}
                    </div>
                )}
            </div>

            {/* ══════════════════════════════════════════
                SHARED
            ══════════════════════════════════════════ */}
            <AnimatePresence>
                {drawerProductId && drawerProduct && (
                    <VariantDrawer
                        key={drawerProductId}
                        productId={drawerProductId}
                        productName={drawerProduct.name}
                        variants={drawerVariants}
                        onClose={() => setDrawerProductId(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showExportModal && products && (
                    <CatalogExportModal products={products} onClose={() => setShowExportModal(false)} />
                )}
                {showCategoriesModal && storeId && (
                    <CategoriesModal storeId={storeId} onClose={() => setShowCategoriesModal(false)} />
                )}
            </AnimatePresence>
        </div>
    )
}

// ─── Filter Panel ─────────────────────────────────────────

const PANEL_TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'simples', label: 'Individuales' },
    { value: 'variantes', label: 'Variantes' },
    { value: 'combos', label: 'Combos' },
]

const PANEL_SORT_OPTIONS: { value: SortOrder; label: string }[] = [
    { value: 'az', label: 'A → Z' },
    { value: 'za', label: 'Z → A' },
    { value: 'mas_caros', label: 'Más caros primero' },
    { value: 'mas_baratos', label: 'Más baratos primero' },
    { value: 'mas_vendidos', label: 'Más vendidos' },
    { value: 'recientes', label: 'Recién agregados' },
]

function RadioOption({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
    return (
        <button
            onClick={onSelect}
            className="active:scale-[0.98] transition-transform"
            style={{
                padding: '12px 14px',
                background: active ? 'rgba(50,215,75,0.07)' : 'rgba(255,255,255,0.03)',
                border: active ? '1px solid rgba(50,215,75,0.25)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                color: active ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                textAlign: 'left',
                transition: 'border-color 120ms ease, color 120ms ease, background 120ms ease',
            }}
        >
            <span>{label}</span>
            <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: active ? 'none' : '1.5px solid rgba(255,255,255,0.18)',
                background: active ? '#32d74b' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: active ? '0 0 8px rgba(50,215,75,0.3)' : 'none',
            }}>
                {active && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
        </button>
    )
}

function FilterPanel({
    typeFilter,
    sortOrder,
    onApply,
    onClose,
}: {
    typeFilter: TypeFilter
    sortOrder: SortOrder
    onApply: (type: TypeFilter, sort: SortOrder) => void
    onClose: () => void
}) {
    const [pendingType, setPendingType] = useState<TypeFilter>(typeFilter)
    const [pendingSort, setPendingSort] = useState<SortOrder>(sortOrder)

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 50,
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
            }}
        >
            <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--toul-surface)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    borderBottom: 'none',
                    borderRadius: '24px 24px 0 0',
                    maxHeight: '92vh',
                    overflowY: 'auto',
                    boxShadow: '0 -32px 80px rgba(0,0,0,0.55)',
                    padding: '0 20px 40px',
                }}
            >
                {/* Drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 6px' }}>
                    <div style={{ width: 36, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }} />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between" style={{ marginBottom: 22, marginTop: 10 }}>
                    <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--toul-text)', margin: 0, letterSpacing: '-0.3px' }}>
                        Filtrar y ordenar
                    </p>
                    <button
                        onClick={onClose}
                        className="flex items-center justify-center active:scale-90 transition-transform"
                        style={{
                            width: 30, height: 30, borderRadius: 8,
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            cursor: 'pointer',
                        }}
                    >
                        <X size={14} style={{ color: 'var(--toul-text-muted)' }} />
                    </button>
                </div>

                {/* Section: tipo */}
                <p style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--toul-text-subtle)',
                    margin: '0 0 10px',
                }}>
                    Tipo de producto
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22 }}>
                    {PANEL_TYPE_OPTIONS.map(opt => (
                        <RadioOption
                            key={opt.value}
                            label={opt.label}
                            active={pendingType === opt.value}
                            onSelect={() => setPendingType(opt.value)}
                        />
                    ))}
                </div>

                {/* Section: ordenar */}
                <p style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--toul-text-subtle)',
                    margin: '0 0 10px',
                }}>
                    Ordenar por
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 28 }}>
                    {PANEL_SORT_OPTIONS.map(opt => (
                        <RadioOption
                            key={opt.value}
                            label={opt.label}
                            active={pendingSort === opt.value}
                            onSelect={() => setPendingSort(opt.value)}
                        />
                    ))}
                </div>

                {/* Apply */}
                <button
                    onClick={() => onApply(pendingType, pendingSort)}
                    className="active:scale-[0.97] transition-transform"
                    style={{
                        width: '100%', height: 52, borderRadius: 14,
                        background: 'linear-gradient(135deg, #32d74b 0%, #28b73f 100%)',
                        color: '#000',
                        fontSize: 15, fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(50,215,75,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
                    }}
                >
                    Aplicar
                </button>
            </motion.div>
        </motion.div>
    )
}

// ─── Section Divider ──────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-4">
            <div style={{ width: 80, height: 0.5, background: 'var(--toul-border)', flexShrink: 0 }} />
            <span style={{
                fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'var(--toul-text-subtle)', whiteSpace: 'nowrap',
            }}>
                {label}
            </span>
            <div style={{ width: 80, height: 0.5, background: 'var(--toul-border)', flexShrink: 0 }} />
        </div>
    )
}

// ─── Variant Drawer ───────────────────────────────────────

function VariantDrawer({
    productId,
    productName,
    variants,
    onClose,
}: {
    productId: string
    productName: string
    variants: VariantRow[]
    onClose: () => void
}) {
    return (
        <>
            <div className="fixed inset-0 z-40" onClick={onClose} />
            <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
                style={{
                    width: 320,
                    background: 'var(--toul-surface)',
                    borderLeft: '1px solid var(--toul-border)',
                    boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
                }}
            >
                <div className="flex items-start justify-between p-5"
                    style={{ borderBottom: '1px solid var(--toul-border)' }}>
                    <div className="min-w-0 flex-1 pr-3">
                        <p className="font-bold text-sm leading-tight mb-0.5 truncate"
                            style={{ color: 'var(--toul-text)' }}>{productName}</p>
                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                            Selecciona una variante
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all active:scale-90"
                        style={{
                            background: 'var(--toul-surface-2)',
                            border: '1px solid var(--toul-border)',
                            color: 'var(--toul-text-muted)',
                            cursor: 'pointer',
                        }}>
                        <X size={15} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                    {variants.map(v => (
                        <Link key={v.id} href={`/products/${productId}/edit`} style={{ textDecoration: 'none' }}>
                            <div
                                className="flex items-center gap-3 p-3 rounded-xl border transition-all"
                                style={{ background: 'var(--toul-surface-2)', borderColor: 'var(--toul-border)', cursor: 'pointer' }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.75' }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--toul-text)' }}>{v.name}</p>
                                    <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--toul-accent)' }}>{formatCOP(v.sale_price)}</p>
                                </div>
                                <ChevronRight size={14} style={{ color: 'var(--toul-text-subtle)', flexShrink: 0 }} />
                            </div>
                        </Link>
                    ))}
                </div>
                <div className="p-4" style={{ borderTop: '1px solid var(--toul-border)' }}>
                    <Link href={`/products/variant-group/${productId}`} style={{ textDecoration: 'none' }}>
                        <button
                            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]"
                            style={{
                                background: 'var(--toul-accent)', border: 'none',
                                color: 'white', cursor: 'pointer',
                                boxShadow: '0 4px 12px var(--toul-accent-glow)',
                            }}>
                            Ver detalle del producto
                        </button>
                    </Link>
                </div>
            </motion.div>
        </>
    )
}

// ─── Desktop Product Card ─────────────────────────────────

function DesktopProductCard({
    entry,
    signalContext,
    variantsByProduct,
    onOpenDrawer,
}: {
    entry: CatalogItem
    signalContext: SignalContext | null
    variantsByProduct: Record<string, VariantRow[]>
    onOpenDrawer: (productId: string) => void
}) {
    const { data } = entry
    const imageSrc = entry.kind === 'product'
        ? (entry.data.images?.[0] || entry.data.image_url)
        : entry.data.image_url

    const variants = entry.kind === 'product' ? (variantsByProduct[data.id] || []) : []
    const hasVariants = variants.length > 0

    if (entry.kind === 'product' && hasVariants) {
        return (
            <motion.div variants={staggerItem}>
                <div
                    className="rounded-2xl overflow-hidden border cursor-pointer h-full flex flex-col"
                    style={{
                        background: 'var(--toul-surface)', borderColor: 'var(--toul-border)',
                        transition: 'transform 150ms ease', position: 'relative',
                    }}
                    onClick={() => onOpenDrawer(data.id)}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                    <div className="absolute top-2 right-2 z-10" style={{ color: 'var(--toul-text-subtle)' }}>
                        <ChevronRight size={16} />
                    </div>
                    <div className="relative w-full overflow-hidden"
                        style={{ aspectRatio: '4/3', background: 'var(--toul-surface-2)' }}>
                        {imageSrc
                            ? <img src={imageSrc} alt={data.name} loading="lazy" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">📦</div>
                        }
                    </div>
                    <div className="flex flex-col flex-1 p-3">
                        <p className="font-semibold text-sm leading-tight mb-1.5 line-clamp-2"
                            style={{ color: 'var(--toul-text)' }}>{data.name}</p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md self-start"
                            style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--toul-info)' }}>
                            <Layers size={10} /> {variants.length} variante{variants.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>
            </motion.div>
        )
    }

    const signal = entry.kind === 'product' && signalContext
        ? computeProductSignal(entry.data, signalContext)
        : null
    const signalStyle = signal ? getSignalStyle(signal.color) : null
    const href = entry.kind === 'combo' ? `/products/combo/${data.id}` : `/products/${data.id}`

    return (
        <motion.div variants={staggerItem}>
            <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                    className="rounded-2xl overflow-hidden border cursor-pointer h-full flex flex-col"
                    style={{ background: 'var(--toul-surface)', borderColor: 'var(--toul-border)', transition: 'transform 150ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                >
                    <div className="relative w-full overflow-hidden"
                        style={{ aspectRatio: '4/3', background: 'var(--toul-surface-2)' }}>
                        {imageSrc
                            ? <img src={imageSrc} alt={data.name} loading="lazy" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">📦</div>
                        }
                    </div>
                    <div className="flex flex-col flex-1 p-3">
                        <p className="font-semibold text-sm leading-tight mb-1 line-clamp-2"
                            style={{ color: 'var(--toul-text)' }}>{data.name}</p>
                        <p className="font-bold text-base mb-1.5" style={{ color: 'var(--toul-accent)' }}>
                            {formatCOP(entry.data.sale_price)}
                        </p>
                        {signal && signalStyle && (
                            <span className="inline-block self-start text-[11px] font-medium px-2 py-0.5 rounded-md mt-auto"
                                style={{ background: signalStyle.bg, color: signalStyle.text }}>
                                {signal.label}
                            </span>
                        )}
                        {entry.kind === 'combo' && (
                            <span className="inline-block self-start text-[11px] font-medium px-2 py-0.5 rounded-md mt-auto"
                                style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                Combo
                            </span>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

// ─── Mobile Product Card ──────────────────────────────────

function MobileProductCard({ item, index }: { item: MobileItem; index: number }) {
    const name = item.data.name
    const imageSrc = item.kind === 'combo'
        ? item.data.image_url
        : item.data.images?.[0] || item.data.image_url

    // Normalize: empty strings from DB → null, so display logic treats them as "no reference"
    const reference = item.kind !== 'combo' ? (item.data.reference?.trim() || null) : null

    const price = item.kind === 'variant' && item.variants.length > 0
        ? Math.round(Math.min(...item.variants.map(v => v.sale_price)))
        : Math.round(item.data.sale_price)

    const href = item.kind === 'combo'
        ? `/products/combo/${item.data.id}`
        : item.kind === 'variant'
        ? `/products/variant-group/${item.data.id}`
        : `/products/${item.data.id}`

    const { bg, text } = hashColor(name)
    const initials = getInitials(name)

    // Each type gets a distinct left accent — scannable before reading
    const accentColor = item.kind === 'variant' ? 'rgba(167,139,250,0.55)'
                      : item.kind === 'combo'   ? 'rgba(251,191,36,0.55)'
                      : 'rgba(50,215,75,0.45)'

    // Placeholder: radial glow of the vibrant accent color on dark bg
    const placeholderBg = `radial-gradient(ellipse at 35% 35%, ${text}38 0%, transparent 58%), ${bg}`

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', duration: 0.42, bounce: 0.12, delay: Math.min(index * 0.04, 0.22) }}
        >
            <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
                <div
                    className="flex items-center"
                    style={{
                        background: 'var(--toul-surface)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderLeft: `2.5px solid ${accentColor}`,
                        borderRadius: 16,
                        cursor: 'pointer',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                        overflow: 'hidden',
                        transition: 'transform 100ms cubic-bezier(0.23,1,0.32,1), opacity 100ms ease',
                    }}
                    onPointerDown={e => {
                        e.currentTarget.style.transform = 'scale(0.97)'
                        e.currentTarget.style.opacity = '0.85'
                    }}
                    onPointerUp={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.opacity = ''
                    }}
                    onPointerLeave={e => {
                        e.currentTarget.style.transform = ''
                        e.currentTarget.style.opacity = ''
                    }}
                >
                    {/* Image in recessed well — Double Bezel technique */}
                    <div style={{ padding: '10px 0 10px 11px', flexShrink: 0 }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 10, overflow: 'hidden',
                            background: 'var(--toul-surface-2)',
                            boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
                        }}>
                            {imageSrc ? (
                                <img src={imageSrc} alt={name} loading="lazy"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{
                                    width: '100%', height: '100%',
                                    background: placeholderBg,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontWeight: 800, fontSize: 14, color: text,
                                    letterSpacing: '0.5px',
                                }}>
                                    {initials}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0, padding: '0 10px 0 13px' }}>
                        <p style={{
                            fontSize: 14, fontWeight: 600, color: 'var(--toul-text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            margin: 0, lineHeight: 1.3,
                        }}>
                            {name}
                        </p>
                        <p style={{
                            fontSize: 11,
                            color: reference ? '#334155' : '#1E2D45',
                            margin: '3px 0 0', lineHeight: 1,
                        }}>
                            {reference ?? 'Sin ref'}
                        </p>
                    </div>

                    {/* Right: icon top + price bottom — consistent across all cards */}
                    <div style={{
                        padding: '10px 13px 10px 0',
                        alignSelf: 'stretch',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        flexShrink: 0,
                    }}>
                        {/* Icon slot — 13px reserved; empty for simples to preserve vertical rhythm */}
                        <div style={{ height: 13, display: 'flex', alignItems: 'center' }}>
                            {item.kind === 'variant' && <Layers size={13} color="#a78bfa" />}
                            {item.kind === 'combo' && <Package size={13} color="#fbbf24" />}
                        </div>

                        {/* Price — always bottom */}
                        <span style={{
                            fontSize: 16, fontWeight: 800, color: '#32d74b',
                            letterSpacing: '-0.4px', lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'nowrap',
                        }}>
                            {formatCOP(price)}
                        </span>
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

// ─── Empty State ──────────────────────────────────────────

function EmptyState({ hasSearch, hasFilter }: { hasSearch: boolean; hasFilter: boolean }) {
    const message = hasSearch
        ? 'No hay resultados para tu búsqueda'
        : hasFilter
            ? 'No hay productos con este filtro'
            : 'Agrega tu primer producto y empieza a vender mejor'

    return (
        <div className="toul-card text-center py-16">
            <Package size={40} className="mx-auto mb-3" style={{ color: 'var(--toul-border-2)' }} />
            <p className="font-semibold mb-1" style={{ color: 'var(--toul-text)' }}>Sin productos</p>
            <p className="text-sm mb-5" style={{ color: 'var(--toul-text-muted)' }}>{message}</p>
            {!hasSearch && !hasFilter && (
                <Link href="/products/new"
                    className="inline-flex items-center gap-2 text-white px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: 'var(--toul-accent)', textDecoration: 'none' }}>
                    <Plus size={16} /> Crear producto
                </Link>
            )}
        </div>
    )
}

// ─── Skeletons ────────────────────────────────────────────

function MobileListSkeleton() {
    return (
        <div className="px-4 pt-2 flex flex-col" style={{ gap: 8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center"
                    style={{
                        background: 'var(--toul-surface)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderLeft: '2.5px solid rgba(255,255,255,0.08)',
                        borderRadius: 16,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        overflow: 'hidden',
                    }}>
                    {/* Recessed image well skeleton */}
                    <div style={{ padding: '10px 0 10px 11px', flexShrink: 0 }}>
                        <div className="animate-pulse"
                            style={{ width: 56, height: 56, borderRadius: 10, background: 'rgba(255,255,255,0.06)' }} />
                    </div>
                    <div className="flex-1 flex flex-col justify-center gap-2 px-3.5">
                        <Skeleton width="55%" height="0.875rem" />
                        <Skeleton width="30%" height="0.65rem" />
                    </div>
                    <div className="flex flex-col items-end gap-1.5 pr-3.5">
                        <Skeleton width="70px" height="1.5rem" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function DesktopGridSkeleton() {
    return (
        <GridSkeleton count={8}>
            <div className="rounded-2xl border overflow-hidden"
                style={{ background: 'var(--toul-surface)', borderColor: 'var(--toul-border)' }}>
                <div style={{ aspectRatio: '4/3' }}><Skeleton className="w-full h-full" /></div>
                <div className="p-3 flex flex-col gap-2">
                    <Skeleton width="75%" height="0.85rem" />
                    <Skeleton width="45%" height="1rem" />
                </div>
            </div>
        </GridSkeleton>
    )
}
