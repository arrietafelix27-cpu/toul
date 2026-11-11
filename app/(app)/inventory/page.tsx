'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ChevronDown, ClipboardList, Plus, Search, Settings2, SlidersHorizontal, Truck } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { ReorderPanel } from '@/components/inventory/ReorderPanel'
import { StockGauge } from '@/components/inventory/StockGauge'
import { InventoryRow, ROW_CSS } from '@/components/inventory/InventoryRow'
import { useInventario } from '@/lib/inventory/useInventario'
import { SinInternet } from '@/components/inventory/SinInternet'
import { filaDePresentacion, filaDeEstante, type Filtro } from '@/lib/inventory/calculos'

/* ══════════════════════════════════════════════════════════════
   Inventario.
   No es "qué tengo": es "qué tengo que pedir". Por eso el pedido
   manda, y la bodega acompaña.
   Todo lo que tiene que ver con cantidades se mide por unidad real
   de stock —la talla o la presentación— porque una referencia con
   40 unidades y sin tallas M ni L está muerta.
   ══════════════════════════════════════════════════════════════ */

const CSS = PANEL_CSS + ROW_CSS + `
.inv-wrap { position: relative; max-width: 1000px; margin: 0 auto; padding: 24px 16px 96px; container-type: inline-size; }
@media (min-width: 768px) { .inv-wrap { padding-left: 32px; padding-right: 32px; } }

/* PC: en una sola columna el nombre quedaba a un lado de la pantalla y
   la cantidad al otro. Ahí se parte en dos: a la izquierda cuánto
   aguantas y qué pedir, a la derecha la bodega */
@media (min-width: 1100px) {
    .inv-wrap { max-width: 1180px; }
    .inv-cols { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: 48px; align-items: start; }
    .inv-sep-medio { display: none; }
}

/* Lo que separa son líneas que se desvanecen, no bordes de cajas */
.inv-sep { height: 1px; margin: 26px 0; background: var(--toul-divider); border: none;
    -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
    mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent); }

.inv-chip { height: 34px; padding: 0 13px; border-radius: 999px; cursor: pointer; font-family: inherit;
    font-size: 13px; white-space: nowrap; flex-shrink: 0;
    border: 1px solid var(--toul-border); background: var(--toul-surface); color: var(--toul-text-muted);
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1), transform 140ms cubic-bezier(0.23,1,0.32,1); }
.inv-chip:active { transform: scale(0.97); }

.inv-chips { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.inv-chips::-webkit-scrollbar { display: none; }

.inv-input { width: 100%; height: 46px; border-radius: 14px; padding: 0 14px 0 40px; font-family: inherit;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text);
    font-size: 16px; outline: none;
    transition: border-color 160ms cubic-bezier(0.23,1,0.32,1); }
.inv-input:focus { border-color: var(--toul-border-focused); }

.inv-caret { flex-shrink: 0; color: var(--toul-text-faint);
    transition: transform 220ms cubic-bezier(0.23,1,0.32,1); }
.inv-caret[data-open="true"] { transform: rotate(180deg); }

@media (prefers-reduced-motion: reduce) {
    .inv-chip:active { transform: none; }
    .inv-caret { transition: none; }
}
`

export default function InventoryPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const [adjustOpen, setAdjustOpen] = useState(false)
    // El mismo inventario vale distinto según se mire: lo que costó
    // o lo que va a entrar si se vende
    const [verVenta, setVerVenta] = useState(false)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    const {
        overview, overviewError, daysLeft, textoContar, shelf, shelfError, isLoading, reorder, filtered,
        variantsOf, search, setSearch, filtro, setFiltro, verMas, refresh,
    } = useInventario(storeId)

    function toggle(productId: string) {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId); else next.add(productId)
            return next
        })
    }

    // Sin los números de la base no se muestra nada que parezca real.
    // Si ya había datos y solo falló una actualización, se siguen viendo
    if ((overviewError && !overview) || (shelfError && !shelf)) {
        return <SinInternet onRetry={refresh} que="tu inventario" />
    }

    const CHIPS: { key: Filtro; label: string; count?: number; color: string }[] = [
        { key: 'todo', label: 'Todo', color: 'var(--toul-text)' },
        { key: 'agotados', label: 'Agotados', count: overview?.outOfStock, color: 'var(--toul-error)' },
        { key: 'pocos', label: 'Por acabarse', count: overview?.lowStock, color: 'var(--toul-warning)' },
        { key: 'quietos', label: 'Quietos', count: overview?.dormantCount, color: 'var(--toul-warning)' },
    ]

    return (
        <div className="inv-wrap">
            <style>{CSS}</style>
            <div className="toul-ambient" />

            {/* ── Encabezado: una sola acción principal ── */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
                className="flex items-start justify-between gap-3 mb-7" style={{ position: 'relative' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>
                        Inventario
                    </h1>
                </div>
                <Link href="/inventory/purchase"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                        height: 40, padding: '0 16px', borderRadius: 13,
                        background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                        letterSpacing: '-0.01em', textDecoration: 'none', whiteSpace: 'nowrap',
                        boxShadow: '0 4px 20px var(--toul-accent-glow)',
                    }}>
                    <Plus size={15} strokeWidth={2.6} /> Comprar
                </Link>
            </motion.div>

            <div className="inv-cols">
            <div className="inv-izq">
            {/* ── Cuánto aguantas: el único número que manda ── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.04, ease: [0.23, 1, 0.32, 1] }}
                style={{ position: 'relative' }}>
                {!overview ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Skeleton height="2.8rem" width="190px" className="rounded-xl" />
                        <Skeleton height="10px" className="rounded-full" />
                    </div>
                ) : (
                    <StockGauge
                        days={daysLeft}
                        coverageDays={overview.coverageDays}
                        value={overview.value}
                        retailValue={overview.retailValue}
                        verVenta={verVenta}
                        onToggleValue={() => setVerVenta(v => !v)}
                        references={overview.references}
                        items={overview.items}
                        units={overview.units}
                    />
                )}

                {/* Mantenimiento de la bodega: un solo grupo, no tres */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 15 }}>
                    <button className="pnl-pill" onClick={() => setAdjustOpen(true)}>
                        <SlidersHorizontal size={13} /> Ajustar
                    </button>
                    <Link href="/inventory/conteo" className="pnl-pill">
                        <ClipboardList size={13} />
                        {textoContar}
                    </Link>
                    <Link href="/inventory/compras" className="pnl-pill">
                        <Truck size={13} /> Compras
                    </Link>
                    {overview && overview.dormantValue > 0 && (
                        <button className="pnl-pill" onClick={() => setFiltro('quietos')}
                            style={{ color: 'var(--toul-warning)' }}>
                            {formatCOP(overview.dormantValue)} quietos
                        </button>
                    )}
                </div>
            </motion.div>

            <hr className="inv-sep" />

            {/* ── Lo que hay que pedir ── */}
            {!overview
                ? <Skeleton height="140px" className="rounded-2xl" />
                : <ReorderPanel items={reorder} />}
            </div>

            <hr className="inv-sep inv-sep-medio" />

            {/* ── Todo lo que tienes ── */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 11 }}>
                    <p className="pnl-label" style={{ margin: 0 }}>Todo lo que tienes</p>
                    <Link href="/settings" className="pnl-link" style={{ fontSize: 11.5 }}>
                        <Settings2 size={12} /> {overview?.coverageDays ?? 7} días de respaldo
                    </Link>
                </div>

                <div className="inv-chips" style={{ marginBottom: 10 }}>
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
                                {chip.label}{chip.count !== undefined && chip.count > 0 ? ` ${chip.count}` : ''}
                            </button>
                        )
                    })}
                </div>

                <div style={{ position: 'relative', marginBottom: 10 }}>
                    <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                    <input className="inv-input" placeholder="Buscar por nombre o referencia"
                        value={search} onChange={event => setSearch(event.target.value)} />
                </div>

                {isLoading || !shelf ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="62px" className="rounded-2xl" />)}
                    </div>
                ) : filtered ? (
                    filtered.length === 0 ? (
                        <Vacio texto={filtro === 'agotados' ? 'No tienes nada agotado.'
                            : filtro === 'pocos' ? 'Nada está por acabarse.'
                                : 'Todo tu inventario se está moviendo.'} />
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {filtered.map((row, index) => (
                                <InventoryRow key={row.key} href={row.href}
                                    image={row.image} name={row.title}
                                    title={row.title} subtitle={row.subtitle} tone={row.subtitleTone}
                                    stock={row.stock} target={row.target}
                                    delay={Math.min(index, 12) * 30} />
                            ))}
                        </div>
                    )
                ) : shelf.products.length === 0 ? (
                    <Vacio texto={search ? 'No encontramos nada con eso.' : 'Todavía no tienes productos.'} />
                ) : (
                    <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {shelf.products.map((product, index) => {
                                const variants = variantsOf(product.id)
                                const { conTallas: hasVariants, stock, subtitle, tone, image } = filaDeEstante(product, variants, formatCOP)
                                const isOpen = expanded.has(product.id)
                                const delay = Math.min(index, 12) * 30

                                return (
                                    <div key={product.id}>
                                        <InventoryRow
                                            href={hasVariants ? undefined : `/inventory/${product.id}`}
                                            onClick={hasVariants ? () => toggle(product.id) : undefined}
                                            image={image} name={product.name}
                                            title={product.name} subtitle={subtitle}
                                            tone={tone}
                                            stock={stock} delay={delay}
                                            trailing={
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                                                    <span style={{
                                                        fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em',
                                                        color: stock <= 0 ? 'var(--toul-error)' : 'var(--toul-text)',
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                        {stock}
                                                    </span>
                                                    {hasVariants && (
                                                        <ChevronDown size={15} className="inv-caret" data-open={isOpen} />
                                                    )}
                                                </span>
                                            }
                                        />

                                        {hasVariants && isOpen && (
                                            <div style={{
                                                display: 'flex', flexDirection: 'column', gap: 1,
                                                margin: '2px 0 6px 22px', paddingLeft: 12,
                                                borderLeft: '1px solid var(--toul-divider)',
                                            }}>
                                                {variants.map((variant, vi) => {
                                                    const { stock: vStock, texto: vTexto } = filaDePresentacion(variant, formatCOP)
                                                    return (
                                                        <Link key={variant.id} href={`/inventory/variant/${variant.id}`}
                                                            className="ivr ivr-item" style={{ animationDelay: `${vi * 30}ms` }}>
                                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--toul-text)' }}>
                                                                    {variant.name}
                                                                </span>
                                                                <span style={{ display: 'block', fontSize: 11.5, color: vStock <= 0 ? 'var(--toul-error)' : 'var(--toul-text-dim)' }}>
                                                                    {vTexto}
                                                                </span>
                                                            </span>
                                                            <span style={{
                                                                fontSize: 14, fontWeight: 700, flexShrink: 0,
                                                                color: vStock <= 0 ? 'var(--toul-error)' : 'var(--toul-text-muted)',
                                                                fontVariantNumeric: 'tabular-nums',
                                                            }}>
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
                            <button onClick={verMas}
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
            </div>

            {storeId && (
                <StockAdjustSheet open={adjustOpen} storeId={storeId}
                    onClose={() => setAdjustOpen(false)} onDone={refresh} />
            )}
        </div>
    )
}

function Vacio({ texto }: { texto: string }) {
    return (
        <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '36px 16px', margin: 0 }}>
            {texto}
        </p>
    )
}
