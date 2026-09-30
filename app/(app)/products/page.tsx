'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Search, Package, Share, Tag, ArrowUpDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useToulData, useStore } from '@/lib/hooks/useData'
import { staggerContainer, fadeUp } from '@/lib/motion'
import type { Product } from '@/lib/types'
import { CatalogCard, type CatalogCardData } from '@/components/products/CatalogCard'
import { buildSignalContext, computeProductSignal, getSignalStyle, type SignalContext } from '@/lib/products/signals'

const CatalogExportModal = dynamic(() => import('./CatalogExportModal').then(m => m.CatalogExportModal), { ssr: false })
const CategoriesModal = dynamic(() => import('@/components/products/CategoriesModal').then(m => m.CategoriesModal), { ssr: false })

/* ── Tipos y datos ──────────────────────────────────────── */

type TypeFilter = 'todos' | 'simples' | 'variantes' | 'combos'
type SortOrder = 'az' | 'za' | 'mas_vendidos' | 'mas_caros'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
    { value: 'todos', label: 'Todo' },
    { value: 'simples', label: 'Productos' },
    { value: 'variantes', label: 'Con presentaciones' },
    { value: 'combos', label: 'Combos' },
]

const SORT_CYCLE: SortOrder[] = ['az', 'za', 'mas_vendidos', 'mas_caros']
const SORT_LABELS: Record<SortOrder, string> = {
    az: 'A → Z',
    za: 'Z → A',
    mas_vendidos: 'Más vendidos',
    mas_caros: 'Más caros',
}

type ComboRow = { id: string; name: string; sale_price: number; image_url: string | null }
type VariantRow = { id: string; product_id: string; name: string; sale_price: number }

const supabase = createClient()

async function fetchCombos(storeId: string) {
    const { data } = await supabase.from('combos').select('id, name, sale_price, image_url')
        .eq('store_id', storeId).eq('is_active', true).order('name')
    return (data || []) as ComboRow[]
}

async function fetchVariants(storeId: string) {
    const { data } = await supabase.from('product_variants').select('id, product_id, name, sale_price')
        .eq('store_id', storeId).eq('is_active', true)
    return (data || []) as VariantRow[]
}

async function fetchSaleItems(storeId: string) {
    const { data, error } = await supabase.from('sale_items')
        .select('product_id, quantity, sales!inner(created_at)').eq('store_id', storeId)
    if (error) return []
    // Supabase tipa la relación como arreglo aunque venga un solo registro
    return (data || []).map(item => {
        const sale = item.sales as unknown as { created_at?: string } | { created_at?: string }[] | null
        const createdAt = Array.isArray(sale) ? sale[0]?.created_at : sale?.created_at
        return {
            product_id: item.product_id as string,
            quantity: item.quantity as number,
            created_at: createdAt || new Date().toISOString(),
        }
    })
}

/* ── Pantalla ───────────────────────────────────────────── */

export default function ProductsPage() {
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const { data: products, isLoading: productsLoading } = useToulData<Product>(
        'products', storeId,
        { select: '*, category:product_categories(id, name)', eq: { is_active: true }, order: { column: 'name' } },
    )
    const { data: combos } = useSWR(storeId ? ['combos-catalog', storeId] : null, ([, id]) => fetchCombos(id as string), { revalidateOnFocus: false, dedupingInterval: 60_000 })
    const { data: variantRows } = useSWR(storeId ? ['variants-catalog', storeId] : null, ([, id]) => fetchVariants(id as string), { revalidateOnFocus: false, dedupingInterval: 60_000 })
    const { data: saleItems } = useSWR(storeId ? ['sale-items-signals', storeId] : null, ([, id]) => fetchSaleItems(id as string), { revalidateOnFocus: false, dedupingInterval: 60_000 })

    const [search, setSearch] = useState('')
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
    const [sortOrder, setSortOrder] = useState<SortOrder>('az')
    const [showExport, setShowExport] = useState(false)
    const [showCategories, setShowCategories] = useState(false)

    const variantsByProduct = useMemo(() => {
        const map: Record<string, VariantRow[]> = {}
        for (const variant of variantRows || []) {
            (map[variant.product_id] ??= []).push(variant)
        }
        return map
    }, [variantRows])

    const unitsByProduct = useMemo(() => {
        const map: Record<string, number> = {}
        for (const item of saleItems || []) map[item.product_id] = (map[item.product_id] || 0) + item.quantity
        return map
    }, [saleItems])

    const signalContext = useMemo<SignalContext | null>(
        () => (products ? buildSignalContext(products, saleItems || []) : null),
        [products, saleItems],
    )

    /** Todo el catálogo convertido a la misma forma de tarjeta. */
    const items = useMemo<CatalogCardData[]>(() => {
        const query = search.trim().toLowerCase()
        const matches = (name: string, reference?: string | null) =>
            !query || name.toLowerCase().includes(query) || (reference ?? '').toLowerCase().includes(query)

        const cards: (CatalogCardData & { sortName: string; sortPrice: number; sortUnits: number })[] = []

        for (const product of products || []) {
            if (!matches(product.name, product.reference)) continue
            const variants = variantsByProduct[product.id] || []
            const hasVariants = variants.length > 0
            if (typeFilter === 'combos') continue
            if (typeFilter === 'simples' && hasVariants) continue
            if (typeFilter === 'variantes' && !hasVariants) continue

            const prices = hasVariants ? variants.map(v => Number(v.sale_price)) : [Number(product.sale_price)]
            const min = Math.min(...prices)
            const max = Math.max(...prices)
            const signal = signalContext ? computeProductSignal(product, signalContext) : null
            const signalStyle = signal ? getSignalStyle(signal.color) : null

            cards.push({
                id: product.id,
                kind: hasVariants ? 'presentaciones' : 'simple',
                name: product.name,
                priceLabel: min === max ? formatCOP(min) : `Desde ${formatCOP(min)}`,
                image: product.images?.[0] || product.image_url || null,
                stock: Number(product.stock) || 0,
                presentations: variants.length,
                badge: signal && signalStyle && !/stock/i.test(signal.label)
                    ? { label: signal.label, bg: signalStyle.bg, text: signalStyle.text }
                    : null,
                href: `/products/${product.id}`,
                sortName: product.name,
                sortPrice: max,
                sortUnits: unitsByProduct[product.id] || 0,
            })
        }

        if (typeFilter === 'todos' || typeFilter === 'combos') {
            for (const combo of combos || []) {
                if (!matches(combo.name)) continue
                cards.push({
                    id: combo.id,
                    kind: 'combo',
                    name: combo.name,
                    priceLabel: formatCOP(Number(combo.sale_price)),
                    image: combo.image_url,
                    stock: null,
                    href: `/products/combo/${combo.id}`,
                    sortName: combo.name,
                    sortPrice: Number(combo.sale_price),
                    sortUnits: 0,
                })
            }
        }

        const sorted = [...cards].sort((a, b) => {
            switch (sortOrder) {
                case 'za': return b.sortName.localeCompare(a.sortName)
                case 'mas_caros': return b.sortPrice - a.sortPrice
                case 'mas_vendidos': return b.sortUnits - a.sortUnits
                default: return a.sortName.localeCompare(b.sortName)
            }
        })

        return sorted.map(({ sortName, sortPrice, sortUnits, ...card }) => card)
    }, [products, combos, variantsByProduct, unitsByProduct, signalContext, search, typeFilter, sortOrder])

    const isLoading = productsLoading || storeLoading

    const cycleSort = () => setSortOrder(prev => SORT_CYCLE[(SORT_CYCLE.indexOf(prev) + 1) % SORT_CYCLE.length])

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* ── Encabezado ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between gap-3 mb-4" style={{ position: 'relative' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Operaciones</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Catálogo</h1>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowCategories(true)} aria-label="Categorías" style={iconButton}>
                        <Tag size={17} />
                    </button>
                    <button onClick={() => setShowExport(true)} aria-label="Exportar catálogo" style={iconButton}>
                        <Share size={17} />
                    </button>
                    <Link href="/products/new" className="hidden sm:flex"
                        style={{
                            alignItems: 'center', gap: 7, height: 42, padding: '0 16px', borderRadius: 12,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                            textDecoration: 'none', boxShadow: '0 4px 20px var(--toul-accent-glow)',
                        }}>
                        <Plus size={16} strokeWidth={2.6} /> Nuevo
                    </Link>
                </div>
            </motion.div>

            {/* ── Buscar y ordenar ── */}
            <div className="flex gap-2 mb-3">
                <div className="relative flex-1">
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                    <input className="toul-input" placeholder="Buscar producto o referencia"
                        value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 42 }} />
                </div>
                <button onClick={cycleSort}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 7, height: 48, padding: '0 14px', borderRadius: 14,
                        background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text-muted)',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                    <ArrowUpDown size={15} /> <span className="hidden sm:inline">{SORT_LABELS[sortOrder]}</span>
                </button>
            </div>

            {/* ── Tipo ── */}
            <div className="flex gap-1.5 flex-wrap mb-5">
                {TYPE_FILTERS.map(filter => {
                    const active = typeFilter === filter.value
                    return (
                        <button key={filter.value} onClick={() => setTypeFilter(filter.value)}
                            style={{
                                padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {filter.label}
                        </button>
                    )
                })}
            </div>

            {/* ── Grilla ── */}
            {isLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(150px, 22vw, 210px), 1fr))', gap: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="skeleton" style={{ aspectRatio: '1 / 1.45', borderRadius: 18 }} />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '48px 22px' }}>
                    <Package size={32} strokeWidth={1.5} style={{ color: 'var(--toul-text-faint)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        {search ? 'No hay resultados' : typeFilter !== 'todos' ? 'Nada en esta categoría' : 'Tu catálogo está vacío'}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 18px' }}>
                        {search ? 'Prueba con otro nombre o referencia.' : 'Agrega tu primer producto para empezar a vender.'}
                    </p>
                    {!search && typeFilter === 'todos' && (
                        <Link href="/products/new" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 20px', borderRadius: 14,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 15, fontWeight: 600, textDecoration: 'none',
                        }}>
                            <Plus size={17} strokeWidth={2.6} /> Crear producto
                        </Link>
                    )}
                </div>
            ) : (
                <motion.div
                    key={typeFilter + sortOrder}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(150px, 22vw, 210px), 1fr))', gap: 12, alignItems: 'stretch' }}>
                    {items.map((item, index) => (
                        <CatalogCard key={`${item.kind}-${item.id}`} item={item} index={index} />
                    ))}
                </motion.div>
            )}

            {/* ── Nuevo producto (celular) ── */}
            <Link href="/products/new" className="flex sm:hidden"
                style={{
                    position: 'fixed', left: 16, right: 16, bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', zIndex: 30,
                    height: 52, borderRadius: 16, background: 'var(--toul-accent)', color: '#000',
                    alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontSize: 15, fontWeight: 600, textDecoration: 'none', boxShadow: '0 8px 30px var(--toul-accent-glow)',
                }}>
                <Plus size={18} strokeWidth={2.6} /> Nuevo producto
            </Link>

            <AnimatePresence>
                {showExport && products && <CatalogExportModal products={products} onClose={() => setShowExport(false)} />}
            </AnimatePresence>
            <AnimatePresence>
                {showCategories && storeId && <CategoriesModal storeId={storeId} onClose={() => setShowCategories(false)} />}
            </AnimatePresence>
        </div>
    )
}

const iconButton: React.CSSProperties = {
    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text-muted)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
}
