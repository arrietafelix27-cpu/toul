'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import {
    AlertTriangle, ClipboardList, Package, Plus, Search, Settings2, ShoppingCart, SlidersHorizontal,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'

const supabase = createClient()
const PAGE_SIZE = 40

/* ══════════════════════════════════════════════════════════════
   Inventario.
   Responde cuatro cosas, en este orden: cuánto vale lo que tengo,
   qué me falta, qué hay en bodega y si cuadra con la realidad.

   Todo lo que tiene que ver con cantidades se calcula por unidad
   real de stock — la talla o la presentación — porque una
   referencia con 40 unidades sin tallas M ni L está muerta.
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

const CSS = PANEL_CSS + `
.inv-hero { position: relative; border-radius: 20px; padding: 20px 22px; overflow: hidden;
    background: var(--toul-surface); border: 1px solid var(--toul-border); }
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
    const [filter, setFilter] = useState<'todo' | 'agotados' | 'pocos'>('todo')
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [adjustOpen, setAdjustOpen] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    // ── Valor, alertas y mínimos: todo lo calcula la base ──
    const { data: overview, error: overviewError, mutate: refreshOverview } = useSWR(
        storeId ? ['inventory-overview', storeId] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_inventory_overview', { p_limit: 60 })
            if (error) throw error
            return data as Overview
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
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
                    .select('id, product_id, name, stock, cpp, low_stock_threshold')
                    .eq('store_id', storeId!).eq('is_active', true).order('name'),
            ])
            const rows = productsRes.data ?? []
            return {
                products: rows.slice(0, limit),
                hasMore: rows.length > limit,
                variants: variantsRes.data ?? [],
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const refresh = () => { refreshOverview(); refreshShelf() }

    const alerts = useMemo(() => {
        const list = overview?.alerts ?? []
        if (filter === 'agotados') return list.filter(a => a.stock <= 0)
        if (filter === 'pocos') return list.filter(a => a.stock > 0)
        return list
    }, [overview, filter])

    const variantsOf = (productId: string) => (shelf?.variants ?? []).filter(v => v.product_id === productId)

    function toggle(productId: string) {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId); else next.add(productId)
            return next
        })
    }

    // La actualización de la base todavía no se ha aplicado
    if (overviewError) {
        return (
            <div className="px-4 md:px-8 py-10 max-w-xl mx-auto" style={{ textAlign: 'center' }}>
                <AlertTriangle size={26} style={{ color: 'var(--toul-warning)', margin: '0 auto 12px' }} />
                <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--toul-text)', margin: '0 0 8px' }}>
                    Falta aplicar una actualización
                </h1>
                <p style={{ fontSize: 14.5, color: 'var(--toul-text-muted)', lineHeight: 1.55, margin: 0 }}>
                    El inventario necesita un cambio en la base de datos para contar bien las presentaciones.
                    Corre <strong style={{ color: 'var(--toul-text)' }}>deploy_inventario.sql</strong> en Supabase y vuelve a entrar.
                </p>
            </div>
        )
    }

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-3xl mx-auto" style={{ position: 'relative' }}>
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

            {/* ── Cuánto vale lo que tengo ── */}
            <div className="inv-hero" style={{ marginBottom: 14 }}>
                <p className="pnl-label" style={{ marginBottom: 6 }}>Valor de tu bodega</p>
                {!overview ? <Skeleton height="2.2rem" width="190px" /> : (
                    <>
                        <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.1 }}>
                            {formatCOP(overview.value)}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                            {overview.units} {overview.units === 1 ? 'unidad' : 'unidades'} · {overview.items} {overview.items === 1 ? 'cosa que cuentas' : 'cosas que cuentas'}
                        </p>
                    </>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--toul-divider)' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', minWidth: 0 }}>
                        {lastCount === undefined ? ' '
                            : lastCount ? `Último conteo hace ${daysAgo(lastCount)} ${daysAgo(lastCount) === 1 ? 'día' : 'días'}`
                                : 'Nunca has contado tu inventario'}
                    </span>
                    <Link href="/inventory/conteo" className="pnl-pill">
                        <ClipboardList size={13} /> Contar
                    </Link>
                </div>
            </div>

            {/* ── Qué me falta ── */}
            {overview && (overview.outOfStock > 0 || overview.lowStock > 0) && (
                <section style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                        <p className="pnl-label" style={{ margin: 0 }}>Necesita atención</p>
                        <Link href="/settings" className="pnl-link" style={{ fontSize: 11.5 }}>
                            <Settings2 size={12} /> {overview.coverageDays} días de respaldo
                        </Link>
                    </div>

                    <div style={{ display: 'flex', gap: 7, marginBottom: 10, overflowX: 'auto', paddingBottom: 2 }}>
                        {([
                            { key: 'todo' as const, label: `Todo (${overview.outOfStock + overview.lowStock})`, color: 'var(--toul-text)' },
                            { key: 'agotados' as const, label: `Agotados (${overview.outOfStock})`, color: 'var(--toul-error)' },
                            { key: 'pocos' as const, label: `Por acabarse (${overview.lowStock})`, color: 'var(--toul-warning)' },
                        ]).map(chip => {
                            const active = filter === chip.key
                            return (
                                <button key={chip.key} className="inv-chip" onClick={() => setFilter(chip.key)}
                                    style={{
                                        background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                        borderColor: active ? 'var(--toul-border-focused)' : 'var(--toul-border)',
                                        color: active ? 'var(--toul-accent)' : chip.color,
                                        fontWeight: active ? 600 : 500,
                                    }}>
                                    {chip.label}
                                </button>
                            )
                        })}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {alerts.map((row, index) => (
                            <div key={`${row.kind}-${row.id}`} className="inv-item"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, animationDelay: `${Math.min(index, 10) * 35}ms` }}>
                                <Link href={row.kind === 'presentacion' ? `/inventory/variant/${row.id}` : `/inventory/${row.id}`}
                                    className="pnl-row" style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{
                                        width: 34, height: 34, borderRadius: 10, flexShrink: 0, overflow: 'hidden', position: 'relative',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                    }}>
                                        {row.image_url
                                            ? <img src={row.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                            : <Package size={14} style={{ color: 'var(--toul-text-faint)' }} />}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {row.product_name}{row.variant_name ? ` · ${row.variant_name}` : ''}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 11.5, color: row.stock <= 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                            {row.stock <= 0 ? 'se agotó' : `quedan ${row.stock}, deberías tener ${row.min_stock}`}
                                        </span>
                                    </span>
                                </Link>
                                <Link href={`/inventory/purchase?product=${row.product_id}${row.kind === 'presentacion' ? `&variant=${row.id}` : ''}`}
                                    className="pnl-pill">
                                    <ShoppingCart size={13} /> Comprar
                                </Link>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Qué hay en bodega ── */}
            <section>
                <p className="pnl-label" style={{ marginBottom: 9 }}>Todo lo que tienes</p>

                <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                    <input className="inv-input" placeholder="Buscar por nombre o referencia"
                        value={search} onChange={event => { setSearch(event.target.value); setLimit(PAGE_SIZE) }} />
                </div>

                {isLoading || !shelf ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="62px" className="rounded-2xl" />)}
                    </div>
                ) : shelf.products.length === 0 ? (
                    <div style={{ padding: '34px 16px', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', margin: 0 }}>
                            {search ? 'No encontramos nada con eso.' : 'Todavía no tienes productos.'}
                        </p>
                    </div>
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

                                const row = (
                                    <>
                                        <span style={{
                                            width: 42, height: 42, borderRadius: 12, flexShrink: 0, overflow: 'hidden', position: 'relative',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                        }}>
                                            {image
                                                ? <img src={image} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Package size={16} style={{ color: 'var(--toul-text-faint)' }} />}
                                        </span>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {product.name}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 12, color: agotadas > 0 ? 'var(--toul-error)' : 'var(--toul-text-dim)' }}>
                                                {hasVariants
                                                    ? agotadas > 0
                                                        ? `${variants.length} presentaciones · ${agotadas} sin existencias`
                                                        : `${variants.length} presentaciones`
                                                    : formatCOP(Math.round(stock * (Number(product.cpp) || 0)))}
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
                                            <button onClick={() => toggle(product.id)} className="pnl-row" style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit' }}>
                                                {row}
                                            </button>
                                        ) : (
                                            <Link href={`/inventory/${product.id}`} className="pnl-row">{row}</Link>
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
