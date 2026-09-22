'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, Plus, Minus, Trash2, Package, ChevronRight, Layers, LayoutGrid, Square, Check, ChevronDown } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { usePOSFlow } from '../POSFlowProvider'

interface Props { onContinue: () => void }

type SortKey = 'az' | 'za' | 'price-up' | 'price-down'
type FilterType = 'all' | 'simple' | 'variant' | 'combo'

const SORT_ORDER: SortKey[] = ['az', 'za', 'price-up', 'price-down']
const SORT_LABELS: Record<SortKey, string> = {
    az: 'A → Z',
    za: 'Z → A',
    'price-up': 'Precio ↑',
    'price-down': 'Precio ↓',
}

type FilterDef = { value: FilterType; label: string; Icon: React.ElementType; color: string }
const FILTER_DEFS: FilterDef[] = [
    { value: 'all',     label: 'Todos',          Icon: LayoutGrid, color: 'var(--toul-primary)' },
    { value: 'simple',  label: 'Simples',         Icon: Square,     color: 'var(--toul-pos-text-sec)' },
    { value: 'variant', label: 'Con variantes',   Icon: Layers,     color: 'var(--toul-info)' },
    { value: 'combo',   label: 'Combos',          Icon: Package,    color: 'var(--toul-warning)' },
]

export default function Step1Products({ onContinue }: Props) {
    const { data, cart } = usePOSFlow()
    const searchRef = useRef<HTMLInputElement>(null)
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('az')
    const [filterType, setFilterType] = useState<FilterType>('all')
    const [showFilterMenu, setShowFilterMenu] = useState(false)
    const [expandedVariantProduct, setExpandedVariantProduct] = useState<string | null>(null)

    useEffect(() => { setTimeout(() => searchRef.current?.focus(), 200) }, [])

    const filterCounts = useMemo<Record<FilterType, number>>(() => ({
        all:     data.products.length + data.combos.length,
        simple:  data.products.filter(p => !(data.variantsByProduct[p.id]?.length)).length,
        variant: data.products.filter(p => (data.variantsByProduct[p.id]?.length || 0) > 0).length,
        combo:   data.combos.length,
    }), [data.products, data.variantsByProduct, data.combos])

    const sorted = useMemo(() => {
        let list = [...data.products]
        const q = search.toLowerCase().trim()
        if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q))

        if (filterType === 'simple')  list = list.filter(p => !(data.variantsByProduct[p.id]?.length))
        if (filterType === 'variant') list = list.filter(p => (data.variantsByProduct[p.id]?.length || 0) > 0)
        if (filterType === 'combo')   list = []

        switch (sortKey) {
            case 'az':         list.sort((a, b) => a.name.localeCompare(b.name)); break
            case 'za':         list.sort((a, b) => b.name.localeCompare(a.name)); break
            case 'price-up':   list.sort((a, b) => a.sale_price - b.sale_price); break
            case 'price-down': list.sort((a, b) => b.sale_price - a.sale_price); break
        }

        const inCart    = list.filter(p => {
            const vv = data.variantsByProduct[p.id]
            if (vv?.length) return vv.some(v => (cart.cartMap[`${p.id}:${v.id}`] || 0) > 0)
            return (cart.cartMap[p.id] || 0) > 0
        })
        const notInCart = list.filter(p => {
            const vv = data.variantsByProduct[p.id]
            if (vv?.length) return !vv.some(v => (cart.cartMap[`${p.id}:${v.id}`] || 0) > 0)
            return !(cart.cartMap[p.id] || 0)
        })
        return [...inCart, ...notInCart]
    }, [data.products, data.variantsByProduct, search, sortKey, filterType, cart.cartMap])

    const filteredCombos = useMemo(() => {
        if (filterType === 'simple' || filterType === 'variant') return []
        const q = search.toLowerCase().trim()
        if (!q) return data.combos
        return data.combos.filter(c => c.name.toLowerCase().includes(q))
    }, [data.combos, search, filterType])

    function cycleSort() {
        setSortKey(prev => {
            const idx = SORT_ORDER.indexOf(prev)
            return SORT_ORDER[(idx + 1) % SORT_ORDER.length]
        })
    }

    const activeFilter = FILTER_DEFS.find(f => f.value === filterType)!
    const isFiltered = filterType !== 'all'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Toolbar */}
            <div style={{ flexShrink: 0, marginBottom: 10 }}>
                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 8 }}>
                    <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-pos-text-sec)' }} />
                    <input
                        ref={searchRef}
                        placeholder="Buscar producto..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', background: 'var(--toul-pos-bg-card)', border: '1.5px solid var(--toul-pos-border)',
                            borderRadius: 10, padding: '10px 12px 10px 36px', fontSize: 13,
                            color: 'var(--toul-pos-text-main)', outline: 'none',
                        }}
                    />
                </div>

                {/* Filter + Sort row */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Filter dropdown */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        <button
                            onClick={() => setShowFilterMenu(v => !v)}
                            style={{
                                width: '100%',
                                background: 'var(--toul-pos-bg-card)',
                                border: `1.5px solid ${showFilterMenu || isFiltered ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                borderRadius: 10, padding: '8px 10px',
                                display: 'flex', alignItems: 'center', gap: 6,
                                cursor: 'pointer',
                            }}
                        >
                            <activeFilter.Icon
                                size={13}
                                style={{ color: activeFilter.color, flexShrink: 0 }}
                            />
                            <span style={{
                                flex: 1, fontSize: 12, fontWeight: 600,
                                color: isFiltered ? 'var(--toul-primary)' : 'var(--toul-pos-text-main)',
                                textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {activeFilter.label}
                            </span>
                            <ChevronDown
                                size={12}
                                style={{
                                    color: 'var(--toul-pos-text-sec)', flexShrink: 0,
                                    transform: showFilterMenu ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 150ms ease',
                                }}
                            />
                        </button>

                        {showFilterMenu && (
                            <>
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                                    onClick={() => setShowFilterMenu(false)}
                                />
                                <div style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
                                    background: 'var(--toul-surface-overlay)',
                                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 14, overflow: 'hidden',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                }}>
                                    {FILTER_DEFS.map((fd, i) => {
                                        const active = filterType === fd.value
                                        return (
                                            <button
                                                key={fd.value}
                                                onClick={() => { setFilterType(fd.value); setShowFilterMenu(false) }}
                                                style={{
                                                    width: '100%', padding: '0 14px', height: 48,
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    background: active ? 'var(--toul-surface-focused)' : 'transparent',
                                                    border: 'none',
                                                    borderBottom: i < FILTER_DEFS.length - 1 ? '1px solid var(--toul-divider)' : 'none',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <fd.Icon size={13} style={{ color: fd.color, flexShrink: 0 }} />
                                                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--toul-pos-text-main)', textAlign: 'left' }}>
                                                    {fd.label}
                                                </span>
                                                <span style={{
                                                    fontSize: 11, fontWeight: 600,
                                                    color: 'var(--toul-pos-text-sec)',
                                                    background: 'var(--toul-pos-bg-main)',
                                                    padding: '1px 6px', borderRadius: 6,
                                                }}>
                                                    {filterCounts[fd.value]}
                                                </span>
                                                {active && (
                                                    <Check size={12} style={{ color: 'var(--toul-primary)', flexShrink: 0 }} />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Sort cycle button */}
                    <button
                        onClick={cycleSort}
                        style={{
                            width: 80, flexShrink: 0,
                            background: 'var(--toul-pos-bg-card)',
                            border: '1.5px solid var(--toul-pos-border)',
                            borderRadius: 10, padding: '8px 10px',
                            fontSize: 11, fontWeight: 700,
                            color: 'var(--toul-pos-text-main)',
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                    >
                        {SORT_LABELS[sortKey]}
                    </button>
                </div>
            </div>

            {/* Product list */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: cart.isEmpty ? 12 : 90 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sorted.map(product => {
                        const variants = data.variantsByProduct[product.id]
                        const isVariantProduct = variants && variants.length > 0
                        const img = (product.images?.[0] || product.image_url) as string | null

                        // ── Variant product ──────────────────────────────────
                        if (isVariantProduct) {
                            const expanded = expandedVariantProduct === product.id
                            const anyInCart = variants.some(v => (cart.cartMap[`${product.id}:${v.id}`] || 0) > 0)
                            const prices = variants.map(v => v.sale_price)
                            const minP = Math.min(...prices)
                            const maxP = Math.max(...prices)
                            const priceLabel = minP === maxP ? formatCOP(minP) : `${formatCOP(minP)} – ${formatCOP(maxP)}`

                            return (
                                <div key={product.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div
                                        onClick={() => setExpandedVariantProduct(expanded ? null : product.id)}
                                        style={{
                                            background: 'var(--toul-pos-bg-card)',
                                            border: `1.5px solid ${anyInCart ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 12, padding: '10px 12px',
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            cursor: 'pointer', transition: 'all 120ms ease',
                                        }}
                                    >
                                        <div style={{
                                            width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                                            background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {img ? (
                                                <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                            ) : (
                                                <Package size={16} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {product.name}
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                                <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>{priceLabel}</span>
                                                <span style={{
                                                    fontSize: 9, fontWeight: 700,
                                                    background: 'rgba(59,130,246,0.12)', color: 'var(--toul-info)',
                                                    padding: '1px 5px', borderRadius: 4,
                                                }}>
                                                    {variants.length} variantes
                                                </span>
                                            </div>
                                        </div>
                                        <ChevronRight
                                            size={16}
                                            style={{
                                                color: 'var(--toul-pos-text-sec)', flexShrink: 0,
                                                transform: expanded ? 'rotate(90deg)' : 'none',
                                                transition: 'transform 150ms ease',
                                            }}
                                        />
                                    </div>

                                    {expanded && variants.map(variant => {
                                        const key = `${product.id}:${variant.id}`
                                        const vQty = cart.cartMap[key] || 0
                                        const vOos = variant.stock <= 0
                                        const vSelected = vQty > 0
                                        return (
                                            <div
                                                key={key}
                                                style={{
                                                    background: 'var(--toul-pos-bg-card)',
                                                    border: `1.5px solid ${vSelected ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                                    borderRadius: 10, padding: '8px 12px 8px 62px',
                                                    display: 'flex', alignItems: 'center', gap: 10,
                                                    opacity: vOos ? 0.4 : 1,
                                                    pointerEvents: vOos ? 'none' : 'auto',
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0 }}>{variant.name}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                                        <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>{formatCOP(variant.sale_price)}</span>
                                                        <span style={{ fontSize: 10, color: 'var(--toul-pos-text-dim)' }}>{vOos ? 'Sin stock' : `Stock: ${variant.stock}`}</span>
                                                    </div>
                                                </div>
                                                {!vSelected && (
                                                    <button
                                                        onClick={() => cart.addItem(`${product.id}:${variant.id}`, variant.stock)}
                                                        style={{
                                                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                                                            background: 'var(--toul-pos-bg-card)', border: '1.5px solid var(--toul-pos-border)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', color: 'var(--toul-pos-text-inactive)',
                                                        }}
                                                    >
                                                        <Plus size={13} />
                                                    </button>
                                                )}
                                                {vSelected && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                        <button
                                                            onClick={() => cart.decrementItem(key)}
                                                            style={{
                                                                width: 26, height: 26, borderRadius: 6, border: 'none',
                                                                background: vQty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                cursor: 'pointer', color: vQty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                                            }}
                                                        >
                                                            {vQty === 1 ? <Trash2 size={11} /> : <Minus size={11} />}
                                                        </button>
                                                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--toul-primary)', minWidth: 20, textAlign: 'center' }}>{vQty}</span>
                                                        <button
                                                            onClick={() => cart.addItem(`${product.id}:${variant.id}`, variant.stock)}
                                                            disabled={vQty >= variant.stock}
                                                            style={{
                                                                width: 26, height: 26, borderRadius: 6, border: 'none',
                                                                background: 'var(--toul-pos-green-dark)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                cursor: vQty >= variant.stock ? 'default' : 'pointer',
                                                                color: 'var(--toul-primary)', opacity: vQty >= variant.stock ? 0.3 : 1,
                                                            }}
                                                        >
                                                            <Plus size={11} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        }

                        // ── Simple product ───────────────────────────────────
                        const qty = cart.cartMap[product.id] || 0
                        const oos = product.stock <= 0
                        const selected = qty > 0

                        return (
                            <div
                                key={product.id}
                                style={{
                                    background: 'var(--toul-pos-bg-card)',
                                    border: `1.5px solid ${selected ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                    borderRadius: 12, padding: '10px 12px',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    opacity: oos ? 0.4 : 1,
                                    pointerEvents: oos ? 'none' : 'auto',
                                    transition: 'all 120ms ease',
                                }}
                            >
                                <div style={{
                                    width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                                    background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {img ? (
                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    ) : (
                                        <Package size={16} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {product.name}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                        <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>
                                            {formatCOP(product.sale_price)}
                                        </span>
                                        <span style={{ fontSize: 10, color: 'var(--toul-pos-text-dim)' }}>
                                            {oos ? '' : `Stock: ${product.stock}`}
                                        </span>
                                    </div>
                                </div>
                                {oos && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--toul-pos-error)', flexShrink: 0 }}>
                                        Sin stock
                                    </span>
                                )}
                                {!oos && !selected && (
                                    <button
                                        onClick={() => cart.addItem(product.id, product.stock)}
                                        style={{
                                            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                            background: 'var(--toul-pos-bg-card)', border: '1.5px solid var(--toul-pos-border)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', color: 'var(--toul-pos-text-inactive)',
                                        }}
                                    >
                                        <Plus size={14} />
                                    </button>
                                )}
                                {selected && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                        <button
                                            onClick={() => cart.decrementItem(product.id)}
                                            style={{
                                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                                background: qty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: qty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                            }}
                                        >
                                            {qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                                        </button>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--toul-primary)', minWidth: 22, textAlign: 'center' }}>
                                            {qty}
                                        </span>
                                        <button
                                            onClick={() => cart.addItem(product.id, product.stock)}
                                            disabled={qty >= product.stock}
                                            style={{
                                                width: 28, height: 28, borderRadius: 6, border: 'none',
                                                background: 'var(--toul-pos-green-dark)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: qty >= product.stock ? 'default' : 'pointer',
                                                color: 'var(--toul-primary)', opacity: qty >= product.stock ? 0.3 : 1,
                                            }}
                                        >
                                            <Plus size={13} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {sorted.length === 0 && filteredCombos.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--toul-pos-text-sec)', fontSize: 13 }}>
                        Sin resultados
                    </div>
                )}

                {/* Combos section */}
                {filteredCombos.length > 0 && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                            <Layers size={12} style={{ color: 'var(--toul-pos-text-sec)' }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--toul-pos-text-sec)', textTransform: 'uppercase', letterSpacing: 1 }}>Combos</span>
                        </div>
                        {filteredCombos.map(combo => {
                            const key = `combo:${combo.id}`
                            const qty = cart.cartMap[key] || 0
                            const selected = qty > 0
                            return (
                                <div key={combo.id} style={{
                                    background: 'var(--toul-pos-bg-card)',
                                    border: `1.5px solid ${selected ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                    borderRadius: 12, padding: '10px 12px',
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    transition: 'all 120ms ease',
                                    marginBottom: 8,
                                }}>
                                    <div style={{
                                        width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
                                        background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {combo.image_url ? (
                                            <img src={combo.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                        ) : (
                                            <Layers size={16} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                        )}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {combo.name}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                            <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>
                                                {formatCOP(combo.sale_price)}
                                            </span>
                                            <span style={{
                                                fontSize: 9, fontWeight: 700,
                                                background: 'var(--toul-pos-green-dark)', color: 'var(--toul-primary)',
                                                padding: '1px 5px', borderRadius: 4,
                                            }}>
                                                Combo
                                            </span>
                                        </div>
                                    </div>
                                    {!selected ? (
                                        <button
                                            onClick={() => cart.addCombo(combo.id)}
                                            style={{
                                                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                                                background: 'var(--toul-pos-bg-card)', border: '1.5px solid var(--toul-pos-border)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: 'var(--toul-pos-text-inactive)',
                                            }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                            <button
                                                onClick={() => cart.decrementItem(key)}
                                                style={{
                                                    width: 28, height: 28, borderRadius: 6, border: 'none',
                                                    background: qty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', color: qty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                                }}
                                            >
                                                {qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                                            </button>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--toul-primary)', minWidth: 22, textAlign: 'center' }}>{qty}</span>
                                            <button
                                                onClick={() => cart.addCombo(combo.id)}
                                                style={{
                                                    width: 28, height: 28, borderRadius: 6, border: 'none',
                                                    background: 'var(--toul-pos-green-dark)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', color: 'var(--toul-primary)',
                                                }}
                                            >
                                                <Plus size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </>
                )}
            </div>

            {/* Sticky footer */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                background: 'var(--toul-pos-bg-main)', borderTop: '1px solid var(--toul-pos-footer-border)',
                padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div>
                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        {cart.cartItems.length} producto{cart.cartItems.length !== 1 ? 's' : ''} · {cart.totalUnits} und
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--toul-pos-text-main)', margin: 0 }}>
                        {formatCOP(cart.subtotal)}
                    </p>
                </div>
                <button
                    onClick={onContinue}
                    disabled={cart.isEmpty}
                    style={{
                        background: cart.isEmpty ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)',
                        color: cart.isEmpty ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 10, padding: '12px 20px',
                        fontSize: 13, fontWeight: 700, cursor: cart.isEmpty ? 'default' : 'pointer',
                    }}
                >
                    Continuar →
                </button>
            </div>
        </div>
    )
}
