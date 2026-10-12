'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { AlertTriangle, ClipboardList, Package, Plus, Search, Settings2, SlidersHorizontal } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { ReorderPanel, type ReorderItem } from '@/components/inventory/ReorderPanel'

const supabase = createClient()
const PAGE_SIZE = 40
/** Después de dos meses sin venderse, esa plata está dormida */
const QUIETO_DAYS = 60

/* ══════════════════════════════════════════════════════════════
   Inventario.
   No es "qué tengo": es "qué tengo que pedir". Por eso el pedido
   manda, y la bodega acompaña.
   Todo lo que tiene que ver con cantidades se mide por unidad real
   de stock —la talla o la presentación— porque una referencia con
   40 unidades y sin tallas M ni L está muerta.
   ══════════════════════════════════════════════════════════════ */

interface AlertRow {
    id: string
    kind: 'producto' | 'presentacion'
    product_id: string
    product_name: string
    variant_name: string | null
    image_url: string | null
    stock: number
    cost: number
    min_stock: number
    sold_30d: number
}

interface Overview {
    coverageDays: number
    value: number
    units: number
    items: number
    outOfStock: number
    lowStock: number
    alerts: AlertRow[]
}

type Filtro = 'todo' | 'agotados' | 'pocos' | 'quietos'

interface Row {
    key: string
    href: string
    image: string | null
    title: string
    subtitle: string
    subtitleTone: 'dim' | 'warn' | 'error'
    stock: number
}

const CSS = PANEL_CSS + `
.inv-wrap { position: relative; max-width: 1240px; margin: 0 auto; padding: 24px 16px 96px; container-type: inline-size; }
@media (min-width: 768px) { .inv-wrap { padding-left: 32px; padding-right: 32px; } }

.inv-top { display: grid; gap: 30px; align-items: stretch; padding: 20px 24px; border-radius: 20px;
    background: var(--toul-surface); border: 1px solid var(--toul-border); margin-bottom: 26px; }
.inv-side { position: relative; min-width: 0; }
@container (min-width: 820px) {
    .inv-top { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); }
    .inv-side::before {
        content: ''; position: absolute; left: -15px; top: 2%; bottom: 2%; width: 1px;
        background: var(--toul-divider);
        -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
        mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
    }
}

.inv-chip { height: 34px; padding: 0 13px; border-radius: 999px; cursor: pointer; font-family: inherit;
    font-size: 13px; white-space: nowrap; border: 1px solid var(--toul-border); background: var(--toul-surface);
    color: var(--toul-text-muted);
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1); }
.inv-input { width: 100%; height: 46px; border-radius: 14px; padding: 0 14px 0 40px; font-family: inherit;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text);
    font-size: 15px; outline: none; }
.inv-input:focus { border-color: var(--toul-border-focused); }
.inv-item { opacity: 0; transform: translateY(6px); animation: inv-in 240ms cubic-bezier(0.23,1,0.32,1) forwards; }
@keyframes inv-in { to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .inv-item { animation: none; opacity: 1; transform: none; } }
`

const daysAgo = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)

export default function InventoryPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const [search, setSearch] = useState('')
    const [filtro, setFiltro] = useState<Filtro>('todo')
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [adjustOpen, setAdjustOpen] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    // ── Valor, mínimos y lo que falta: lo calcula la base ──
    const { data: overview, error: overviewError, mutate: refreshOverview } = useSWR(
        storeId ? ['inventory-overview', storeId] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_inventory_overview', { p_limit: 120 })
            if (error) throw error
            return data as Overview
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    // ── Cuánto dura la bodega y cuánta plata está dormida ──
    const { data: pulse } = useSWR(
        storeId ? ['inventory-pulse', storeId] : null,
        async () => {
            const since60 = new Date(Date.now() - QUIETO_DAYS * 86400000).toISOString()
            const since30 = new Date(Date.now() - 30 * 86400000).toISOString()

            const [productsRes, variantsRes, soldRes] = await Promise.all([
                supabase.from('products').select('id, stock, cpp').eq('store_id', storeId!).eq('is_active', true),
                supabase.from('product_variants').select('id, product_id, stock, cpp').eq('store_id', storeId!).eq('is_active', true),
                supabase.from('sale_items').select('product_id, variant_id, quantity, sales!inner(created_at)')
                    .eq('store_id', storeId!).gte('sales.created_at', since60),
            ])

            const sold = (soldRes.data ?? []) as unknown as {
                product_id: string; variant_id: string | null; quantity: number; sales: { created_at: string } | null
            }[]
            const movedIn60 = new Set<string>()
            let units30 = 0
            for (const item of sold) {
                movedIn60.add(item.variant_id ?? item.product_id)
                if ((item.sales?.created_at ?? '') >= since30) units30 += Number(item.quantity)
            }

            const variants = variantsRes.data ?? []
            const withVariants = new Set(variants.map(v => v.product_id))
            let unitsInStock = 0
            let quietValue = 0
            const quietKeys = new Set<string>()

            const add = (key: string, stock: number, cost: number) => {
                const safe = Math.max(stock, 0)
                unitsInStock += safe
                if (safe > 0 && !movedIn60.has(key)) { quietValue += safe * cost; quietKeys.add(key) }
            }
            for (const product of productsRes.data ?? []) {
                if (withVariants.has(product.id)) continue
                add(product.id, Number(product.stock) || 0, Number(product.cpp) || 0)
            }
            for (const variant of variants) add(variant.id, Number(variant.stock) || 0, Number(variant.cpp) || 0)

            const perDay = units30 / 30
            return {
                daysLeft: perDay > 0 ? Math.floor(unitsInStock / perDay) : null,
                quietValue: Math.round(quietValue),
                quietKeys,
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 60000 },
    )

    const { data: lastCount } = useSWR(
        storeId ? ['last-count', storeId] : null,
        async () => {
            const { data } = await supabase.from('inventory_counts')
                .select('applied_at').eq('store_id', storeId!).eq('status', 'applied')
                .order('applied_at', { ascending: false }).limit(1).maybeSingle()
            return data?.applied_at as string | undefined
        },
        { revalidateOnFocus: false },
    )

    // ── La bodega ──
    const { data: shelf, isLoading, mutate: refreshShelf } = useSWR(
        storeId ? ['inventory-shelf', storeId, search, limit] : null,
        async () => {
            let query = supabase.from('products')
                .select('id, name, reference, image_url, images, stock, cpp')
                .eq('store_id', storeId!).eq('is_active', true).order('name').limit(limit + 1)
            if (search) query = query.or(`name.ilike.%${search}%,reference.ilike.%${search}%`)

            const [productsRes, variantsRes] = await Promise.all([
                query,
                supabase.from('product_variants')
                    .select('id, product_id, name, stock, cpp')
                    .eq('store_id', storeId!).eq('is_active', true).order('name'),
            ])
            const rows = productsRes.data ?? []
            return { products: rows.slice(0, limit), hasMore: rows.length > limit, variants: variantsRes.data ?? [] }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const refresh = () => { refreshOverview(); refreshShelf() }

    // ── Lo que hay que pedir ──
    const reorder: ReorderItem[] = useMemo(() => (overview?.alerts ?? []).map(alert => ({
        id: alert.id,
        kind: alert.kind,
        productId: alert.product_id,
        title: alert.product_name,
        subtitle: alert.variant_name,
        image: alert.image_url,
        stock: Math.max(Number(alert.stock) || 0, 0),
        toOrder: Math.max(Number(alert.min_stock) - Number(alert.stock), 1),
        cost: Number(alert.cost) || 0,
    })), [overview])

    // ── La lista, según el filtro ──
    const filtered: Row[] | null = useMemo(() => {
        if (filtro === 'todo' || !overview) return null
        const text = search.trim().toLowerCase()

        if (filtro === 'quietos') {
            if (!pulse || !shelf) return []
            const rows: Row[] = []
            const withVariants = new Set(shelf.variants.map(v => v.product_id))
            for (const product of shelf.products) {
                if (withVariants.has(product.id)) continue
                if (!pulse.quietKeys.has(product.id)) continue
                rows.push({
                    key: `p-${product.id}`, href: `/inventory/${product.id}`,
                    image: (product.images?.[0] as string | undefined) ?? product.image_url,
                    title: product.name, subtitle: `${formatCOP(Math.round((Number(product.stock) || 0) * (Number(product.cpp) || 0)))} dormidos`,
                    subtitleTone: 'warn', stock: Number(product.stock) || 0,
                })
            }
            for (const variant of shelf.variants) {
                if (!pulse.quietKeys.has(variant.id)) continue
                const parent = shelf.products.find(p => p.id === variant.product_id)
                if (!parent) continue
                rows.push({
                    key: `v-${variant.id}`, href: `/inventory/variant/${variant.id}`,
                    image: (parent.images?.[0] as string | undefined) ?? parent.image_url,
                    title: `${parent.name} · ${variant.name}`,
                    subtitle: `${formatCOP(Math.round((Number(variant.stock) || 0) * (Number(variant.cpp) || 0)))} dormidos`,
                    subtitleTone: 'warn', stock: Number(variant.stock) || 0,
                })
            }
            return rows.filter(row => !text || row.title.toLowerCase().includes(text))
        }

        return overview.alerts
            .filter(alert => filtro === 'agotados' ? alert.stock <= 0 : alert.stock > 0)
            .map(alert => ({
                key: `${alert.kind}-${alert.id}`,
                href: alert.kind === 'presentacion' ? `/inventory/variant/${alert.id}` : `/inventory/${alert.id}`,
                image: alert.image_url,
                title: alert.variant_name ? `${alert.product_name} · ${alert.variant_name}` : alert.product_name,
                subtitle: alert.stock <= 0 ? 'se agotó' : `quedan ${alert.stock}, deberías tener ${alert.min_stock}`,
                subtitleTone: (alert.stock <= 0 ? 'error' : 'warn') as Row['subtitleTone'],
                stock: Math.max(Number(alert.stock) || 0, 0),
            }))
            .filter(row => !text || row.title.toLowerCase().includes(text))
    }, [filtro, overview, pulse, shelf, search])

    const variantsOf = (productId: string) => (shelf?.variants ?? []).filter(v => v.product_id === productId)

    function toggle(productId: string) {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId); else next.add(productId)
            return next
        })
    }

    if (overviewError) {
        return (
            <div className="px-4 md:px-8 py-10 max-w-xl mx-auto" style={{ textAlign: 'center' }}>
                <AlertTriangle size={26} style={{ color: 'var(--toul-warning)', margin: '0 auto 12px' }} />
                <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--toul-text)', margin: '0 0 8px' }}>
                    Falta aplicar una actualización
                </h1>
                <p style={{ fontSize: 14.5, color: 'var(--toul-text-muted)', lineHeight: 1.55, margin: 0 }}>
                    Corre <strong style={{ color: 'var(--toul-text)' }}>deploy_inventario.sql</strong> en Supabase y vuelve a entrar.
                </p>
            </div>
        )
    }

    const CHIPS: { key: Filtro; label: string; count?: number; color: string }[] = [
        { key: 'todo', label: 'Todo', color: 'var(--toul-text)' },
        { key: 'agotados', label: 'Agotados', count: overview?.outOfStock, color: 'var(--toul-error)' },
        { key: 'pocos', label: 'Por acabarse', count: overview?.lowStock, color: 'var(--toul-warning)' },
        { key: 'quietos', label: 'Quietos', count: pulse?.quietKeys.size, color: 'var(--toul-warning)' },
    ]

    return (
        <div className="inv-wrap">
            <style>{CSS}</style>
            <div className="toul-ambient" />

            {/* ── Encabezado ── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-start justify-between gap-3 mb-5" style={{ position: 'relative' }}>
                <div>
                    <p className="pnl-label" style={{ marginBottom: 3 }}>Operaciones</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                        Inventario
                    </h1>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                    <button className="pnl-pill" style={{ height: 38, fontSize: 13 }} onClick={() => setAdjustOpen(true)}>
                        <SlidersHorizontal size={14} /> Ajustar
                    </button>
                    <Link href="/inventory/purchase"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 11,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 13.5, fontWeight: 600,
                            textDecoration: 'none', whiteSpace: 'nowrap', boxShadow: '0 4px 18px var(--toul-accent-glow)',
                        }}>
                        <Plus size={15} strokeWidth={2.6} /> Comprar
                    </Link>
                </div>
            </motion.div>

            {/* ── El pedido manda; la bodega acompaña ── */}
            <div className="inv-top">
                {!overview ? <Skeleton height="160px" className="rounded-2xl" /> : <ReorderPanel items={reorder} />}

                <aside className="inv-side pnl">
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Tu bodega</p>
                    {!overview ? <Skeleton height="2.2rem" width="170px" /> : (
                        <>
                            <p style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.15 }}>
                                {formatCOP(overview.value)}
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                                {overview.units} {overview.units === 1 ? 'unidad' : 'unidades'} · {overview.items} {overview.items === 1 ? 'producto' : 'productos'}
                            </p>

                            {pulse?.daysLeft !== null && pulse?.daysLeft !== undefined && (
                                <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '10px 0 0' }}>
                                    Te alcanza para <strong style={{ color: 'var(--toul-text)' }}>{pulse.daysLeft} días</strong>
                                </p>
                            )}
                            {!!pulse?.quietValue && (
                                <button onClick={() => setFiltro('quietos')}
                                    style={{
                                        display: 'block', textAlign: 'left', border: 'none', background: 'transparent', padding: 0,
                                        fontFamily: 'inherit', fontSize: 13, color: 'var(--toul-warning)', margin: '4px 0 0', cursor: 'pointer',
                                    }}>
                                    {formatCOP(pulse.quietValue)} llevan 2 meses sin venderse
                                </button>
                            )}
                        </>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 'auto', paddingTop: 16 }}>
                        <span style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', minWidth: 0 }}>
                            {lastCount === undefined ? ' '
                                : lastCount ? `Contado hace ${daysAgo(lastCount)} ${daysAgo(lastCount) === 1 ? 'día' : 'días'}`
                                    : 'Nunca has contado'}
                        </span>
                        <Link href="/inventory/conteo" className="pnl-pill">
                            <ClipboardList size={13} /> Contar
                        </Link>
                    </div>
                </aside>
            </div>

            {/* ── Todo lo que tienes ── */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <p className="pnl-label" style={{ margin: 0 }}>Todo lo que tienes</p>
                    <Link href="/settings" className="pnl-link" style={{ fontSize: 11.5 }}>
                        <Settings2 size={12} /> {overview?.coverageDays ?? 7} días de respaldo
                    </Link>
                </div>

                <div style={{ display: 'flex', gap: 7, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
                    {CHIPS.map(chip => {
                        const active = filtro === chip.key
                        return (
                            <button key={chip.key} className="inv-chip" onClick={() => setFiltro(chip.key)}
                                style={{
                                    background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                    borderColor: active ? 'var(--toul-border-focused)' : 'var(--toul-border)',
                                    color: active ? 'var(--toul-accent)' : chip.color,
                                    fontWeight: active ? 600 : 500,
                                }}>
                                {chip.label}{chip.count !== undefined && chip.count > 0 ? ` (${chip.count})` : ''}
                            </button>
                        )
                    })}
                </div>

                <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                    <input className="inv-input" placeholder="Buscar por nombre o referencia"
                        value={search} onChange={event => { setSearch(event.target.value); setLimit(PAGE_SIZE) }} />
                </div>

                {isLoading || !shelf ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="62px" className="rounded-2xl" />)}
                    </div>
                ) : filtered ? (
                    filtered.length === 0 ? (
                        <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '32px 16px', margin: 0 }}>
                            {filtro === 'agotados' ? 'No tienes nada agotado.'
                                : filtro === 'pocos' ? 'Nada está por acabarse.'
                                    : 'Todo tu inventario se está moviendo.'}
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {filtered.map((row, index) => (
                                <Link key={row.key} href={row.href} className="pnl-row inv-item"
                                    style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
                                    <Thumb src={row.image} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {row.title}
                                        </span>
                                        <span style={{
                                            display: 'block', fontSize: 12,
                                            color: row.subtitleTone === 'error' ? 'var(--toul-error)' : row.subtitleTone === 'warn' ? 'var(--toul-warning)' : 'var(--toul-text-dim)',
                                        }}>
                                            {row.subtitle}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 15, fontWeight: 700, flexShrink: 0, color: row.stock <= 0 ? 'var(--toul-error)' : 'var(--toul-text)' }}>
                                        {row.stock}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )
                ) : shelf.products.length === 0 ? (
                    <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '32px 16px', margin: 0 }}>
                        {search ? 'No encontramos nada con eso.' : 'Todavía no tienes productos.'}
                    </p>
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {shelf.products.map((product, index) => {
                                const variants = variantsOf(product.id)
                                const hasVariants = variants.length > 0
                                const stock = hasVariants
                                    ? variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
                                    : Number(product.stock) || 0
                                const agotadas = variants.filter(v => (Number(v.stock) || 0) <= 0).length
                                const image = (product.images?.[0] as string | undefined) ?? product.image_url
                                const isOpen = expanded.has(product.id)

                                const inner = (
                                    <>
                                        <Thumb src={image} size={42} />
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {product.name}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 12, color: agotadas > 0 ? 'var(--toul-error)' : 'var(--toul-text-dim)' }}>
                                                {hasVariants
                                                    ? agotadas > 0
                                                        ? `${variants.length} presentaciones · ${agotadas} sin existencias`
                                                        : `${variants.length} presentaciones`
                                                    : `${formatCOP(Math.round(stock * (Number(product.cpp) || 0)))} en bodega`}
                                            </span>
                                        </span>
                                        <span style={{ fontSize: 15, fontWeight: 700, flexShrink: 0, color: stock <= 0 ? 'var(--toul-error)' : 'var(--toul-text)' }}>
                                            {stock}
                                        </span>
                                    </>
                                )

                                return (
                                    <div key={product.id} className="inv-item" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
                                        {hasVariants ? (
                                            <button onClick={() => toggle(product.id)} className="pnl-row"
                                                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit' }}>
                                                {inner}
                                            </button>
                                        ) : (
                                            <Link href={`/inventory/${product.id}`} className="pnl-row">{inner}</Link>
                                        )}

                                        {hasVariants && isOpen && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, margin: '2px 0 6px 20px', paddingLeft: 12, borderLeft: '1px solid var(--toul-divider)' }}>
                                                {variants.map(variant => {
                                                    const vStock = Number(variant.stock) || 0
                                                    return (
                                                        <Link key={variant.id} href={`/inventory/variant/${variant.id}`} className="pnl-row">
                                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--toul-text)' }}>{variant.name}</span>
                                                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                                                                    {formatCOP(Math.round(vStock * (Number(variant.cpp) || 0)))} en bodega
                                                                </span>
                                                            </span>
                                                            <span style={{ fontSize: 14, fontWeight: 700, color: vStock <= 0 ? 'var(--toul-error)' : 'var(--toul-text-muted)' }}>
                                                                {vStock}
                                                            </span>
                                                        </Link>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {shelf.hasMore && (
                            <button onClick={() => setLimit(l => l + PAGE_SIZE)}
                                style={{
                                    width: '100%', marginTop: 12, height: 44, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                                    background: 'transparent', border: '1px dashed var(--toul-border)',
                                    color: 'var(--toul-text-dim)', fontSize: 13, fontWeight: 500,
                                }}>
                                Ver más productos
                            </button>
                        )}
                    </>
                )}
            </section>

            {storeId && (
                <StockAdjustSheet open={adjustOpen} storeId={storeId}
                    onClose={() => setAdjustOpen(false)} onDone={refresh} />
            )}
        </div>
    )
}

function Thumb({ src, size = 34 }: { src: string | null; size?: number }) {
    return (
        <span style={{
            width: size, height: size, borderRadius: size > 38 ? 12 : 10, flexShrink: 0, overflow: 'hidden', position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
        }}>
            {src
                ? <img src={src} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Package size={size > 38 ? 16 : 14} style={{ color: 'var(--toul-text-faint)' }} />}
        </span>
    )
}
