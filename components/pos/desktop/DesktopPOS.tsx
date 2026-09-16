'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
    Search, Plus, Minus, Trash2, SlidersHorizontal, Package, Check,
    ShoppingBag, UserPlus, ChevronRight, AlertTriangle, RefreshCw, X, Layers,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { formatCOP } from '@/lib/utils'
import { usePOS } from '../POSContext'
import { usePOSFlow } from '../POSFlowProvider'
import type { SaleSnapshot } from '../mobile/Step3Confirmation'
import type { Customer } from '@/lib/types'

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Desktop POS v2 — Built from mobile visual DNA
   Tokens CSS globales desde globals.css (--toul-pos-*)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type SortKey = 'az' | 'za' | 'stock-up' | 'stock-down' | 'price-up' | 'price-down'
const SORTS: { key: SortKey; label: string }[] = [
    { key: 'az', label: 'A → Z' },
    { key: 'za', label: 'Z → A' },
    { key: 'stock-up', label: 'Stock ↑' },
    { key: 'stock-down', label: 'Stock ↓' },
    { key: 'price-up', label: 'Precio ↑' },
    { key: 'price-down', label: 'Precio ↓' },
]

/* ── Section Card — identical to mobile Step2 ──────────────── */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--toul-pos-bg-card)', border: `1px solid ${'var(--toul-pos-border)'}`,
            borderRadius: 12, padding: '10px 12px',
        }}>
            <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px' }}>
                {label}
            </p>
            {children}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   LEFT COLUMN — Product List (row-based, like mobile Step1)
   ══════════════════════════════════════════════════════════════ */
function ProductList() {
    const { closePOS } = usePOS()
    const { data, cart } = usePOSFlow()
    const searchRef = useRef<HTMLInputElement>(null)
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState<SortKey>('az')
    const [showSort, setShowSort] = useState(false)
    const [expandedVariantProduct, setExpandedVariantProduct] = useState<string | null>(null)

    useEffect(() => { setTimeout(() => searchRef.current?.focus(), 300) }, [])

    const sorted = useMemo(() => {
        let list = [...data.products]
        const q = search.toLowerCase().trim()
        if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q))

        switch (sortKey) {
            case 'az': list.sort((a, b) => a.name.localeCompare(b.name)); break
            case 'za': list.sort((a, b) => b.name.localeCompare(a.name)); break
            case 'stock-up': list.sort((a, b) => a.stock - b.stock); break
            case 'stock-down': list.sort((a, b) => b.stock - a.stock); break
            case 'price-up': list.sort((a, b) => a.sale_price - b.sale_price); break
            case 'price-down': list.sort((a, b) => b.sale_price - a.sale_price); break
        }

        const inCart = list.filter(p => {
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
    }, [data.products, data.variantsByProduct, search, sortKey, cart.cartMap])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 24px', position: 'relative' }}>
            {/* Header with close button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--toul-pos-text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                    Nueva venta
                </h2>
                <button
                    onClick={closePOS}
                    style={{
                        width: 32, height: 32, borderRadius: 8, border: 'none',
                        background: 'var(--toul-pos-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--toul-pos-text-sec)',
                        transition: 'color 120ms ease',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--toul-pos-text-main)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--toul-pos-text-sec)')}
                >
                    <X size={16} />
                </button>
            </div>

            {/* Toolbar — identical structure to mobile */}
            <div style={{ flexShrink: 0, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: showSort ? 8 : 0 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-pos-text-sec)' }} />
                        <input
                            ref={searchRef}
                            placeholder="Buscar producto..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                width: '100%', background: 'var(--toul-pos-bg-card)', border: `1.5px solid ${'var(--toul-pos-border)'}`,
                                borderRadius: 10, padding: '10px 12px 10px 36px', fontSize: 13,
                                color: 'var(--toul-pos-text-main)', outline: 'none',
                            }}
                        />
                    </div>
                    <button
                        onClick={() => setShowSort(!showSort)}
                        style={{
                            background: showSort ? 'var(--toul-pos-green-dark)' : 'var(--toul-pos-bg-card)',
                            border: `1.5px solid ${showSort ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                            borderRadius: 10, width: 42, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: showSort ? 'var(--toul-primary)' : 'var(--toul-pos-text-inactive)',
                        }}
                    >
                        <SlidersHorizontal size={16} />
                    </button>
                </div>
                {showSort && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {SORTS.map(s => {
                            const active = sortKey === s.key
                            return (
                                <button
                                    key={s.key}
                                    onClick={() => { setSortKey(s.key); setShowSort(false) }}
                                    style={{
                                        background: active ? 'var(--toul-pos-green-dark)' : 'transparent',
                                        border: `1.5px solid ${active ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                        borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 600,
                                        color: active ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)', cursor: 'pointer',
                                    }}
                                >
                                    {s.label}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Product Grid — desktop-optimized cards with large images */}
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                    {sorted.map(product => {
                        const variants = data.variantsByProduct[product.id]
                        const isVariantProduct = variants && variants.length > 0
                        const img = (product.images?.[0] || product.image_url) as string | null

                        // ── Variant product card ──────────────────────────────
                        if (isVariantProduct) {
                            const anyInCart = variants.some(v => (cart.cartMap[`${product.id}:${v.id}`] || 0) > 0)
                            const prices = variants.map(v => v.sale_price)
                            const minP = Math.min(...prices)
                            const maxP = Math.max(...prices)
                            const priceLabel = minP === maxP ? formatCOP(minP) : `${formatCOP(minP)} – ${formatCOP(maxP)}`
                            return (
                                <div
                                    key={product.id}
                                    onClick={() => setExpandedVariantProduct(product.id)}
                                    style={{
                                        background: 'var(--toul-pos-bg-card)',
                                        border: `1.5px solid ${anyInCart ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                        borderRadius: 14, overflow: 'hidden',
                                        cursor: 'pointer', transition: 'border-color 120ms ease',
                                        display: 'flex', flexDirection: 'column',
                                    }}
                                >
                                    <div style={{
                                        width: '100%', aspectRatio: '1', background: 'var(--toul-pos-bg-main)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden', position: 'relative',
                                    }}>
                                        {img ? (
                                            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                        ) : (
                                            <Package size={28} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                        )}
                                        {anyInCart && (
                                            <div style={{
                                                position: 'absolute', top: 8, right: 8,
                                                width: 22, height: 22, borderRadius: '50%',
                                                background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                            }}>
                                                <Check size={12} style={{ color: 'var(--toul-pos-bg-main)', strokeWidth: 3 }} />
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '10px 12px 10px' }}>
                                        <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {product.name}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                            <span style={{ fontSize: 12, color: 'var(--toul-primary)', fontWeight: 700 }}>{priceLabel}</span>
                                            <span style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', background: 'var(--toul-pos-bg-main)', padding: '2px 6px', borderRadius: 4 }}>
                                                {variants.length} var
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )
                        }

                        // ── Simple product card ───────────────────────────────
                        const qty = cart.cartMap[product.id] || 0
                        const oos = product.stock <= 0
                        const selected = qty > 0

                        return (
                            <div
                                key={product.id}
                                onClick={() => { if (!oos && !selected) cart.addItem(product.id, product.stock) }}
                                style={{
                                    background: 'var(--toul-pos-bg-card)',
                                    border: `1.5px solid ${selected ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                    borderRadius: 14, overflow: 'hidden',
                                    opacity: oos ? 0.4 : 1,
                                    pointerEvents: oos ? 'none' : 'auto',
                                    cursor: oos ? 'default' : 'pointer',
                                    transition: 'border-color 120ms ease',
                                    display: 'flex', flexDirection: 'column',
                                }}
                            >
                                <div style={{
                                    width: '100%', aspectRatio: '1', background: 'var(--toul-pos-bg-main)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', position: 'relative',
                                }}>
                                    {img ? (
                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    ) : (
                                        <Package size={28} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                    )}
                                    {oos && (
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'rgba(0,0,0,0.55)',
                                        }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--toul-pos-error)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sin stock</span>
                                        </div>
                                    )}
                                    {selected && (
                                        <div style={{
                                            position: 'absolute', top: 8, right: 8,
                                            width: 22, height: 22, borderRadius: '50%',
                                            background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                        }}>
                                            <Check size={12} style={{ color: 'var(--toul-pos-bg-main)', strokeWidth: 3 }} />
                                        </div>
                                    )}
                                </div>
                                <div style={{ padding: '10px 12px 8px' }}>
                                    <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {product.name}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                                        <span style={{ fontSize: 13, color: 'var(--toul-primary)', fontWeight: 700 }}>
                                            {formatCOP(product.sale_price)}
                                        </span>
                                        {!oos && (
                                            <span style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', background: 'var(--toul-pos-bg-main)', padding: '2px 6px', borderRadius: 4 }}>
                                                {product.stock} und
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {selected && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 12px 10px', borderTop: `1px solid ${'var(--toul-pos-border)'}`,
                                    }}>
                                        <button
                                            onClick={e => { e.stopPropagation(); cart.decrementItem(product.id) }}
                                            style={{
                                                width: 30, height: 30, borderRadius: 8, border: 'none',
                                                background: qty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: 'pointer', color: qty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                            }}
                                        >
                                            {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                                        </button>
                                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--toul-primary)' }}>
                                            {qty}
                                        </span>
                                        <button
                                            onClick={e => { e.stopPropagation(); cart.addItem(product.id, product.stock) }}
                                            disabled={qty >= product.stock}
                                            style={{
                                                width: 30, height: 30, borderRadius: 8, border: 'none',
                                                background: 'var(--toul-pos-green-dark)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                cursor: qty >= product.stock ? 'default' : 'pointer',
                                                color: 'var(--toul-primary)', opacity: qty >= product.stock ? 0.3 : 1,
                                            }}
                                        >
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
                {sorted.length === 0 && data.combos.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--toul-pos-text-sec)', fontSize: 13 }}>
                        Sin resultados
                    </div>
                )}

                {/* Combos section */}
                {data.combos.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                            <Layers size={12} style={{ color: 'var(--toul-pos-text-sec)' }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--toul-pos-text-sec)', textTransform: 'uppercase', letterSpacing: 1 }}>Combos</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                            {data.combos.map(combo => {
                                const key = `combo:${combo.id}`
                                const qty = cart.cartMap[key] || 0
                                const selected = qty > 0
                                return (
                                    <div
                                        key={combo.id}
                                        onClick={() => { if (!selected) cart.addCombo(combo.id) }}
                                        style={{
                                            background: 'var(--toul-pos-bg-card)',
                                            border: `1.5px solid ${selected ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 14, overflow: 'hidden',
                                            cursor: selected ? 'default' : 'pointer',
                                            transition: 'border-color 120ms ease',
                                            display: 'flex', flexDirection: 'column',
                                        }}
                                    >
                                        <div style={{
                                            width: '100%', aspectRatio: '1', background: 'var(--toul-pos-bg-main)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', position: 'relative',
                                        }}>
                                            {combo.image_url ? (
                                                <img src={combo.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                            ) : (
                                                <Layers size={28} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                            )}
                                            {selected && (
                                                <div style={{
                                                    position: 'absolute', top: 8, right: 8,
                                                    width: 22, height: 22, borderRadius: '50%',
                                                    background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                                }}>
                                                    <Check size={12} style={{ color: 'var(--toul-pos-bg-main)', strokeWidth: 3 }} />
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ padding: '10px 12px 8px' }}>
                                            <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {combo.name}
                                            </p>
                                            <span style={{ fontSize: 13, color: 'var(--toul-primary)', fontWeight: 700 }}>
                                                {formatCOP(combo.sale_price)}
                                            </span>
                                        </div>
                                        {selected && (
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '6px 12px 10px', borderTop: '1px solid var(--toul-pos-border)',
                                            }}>
                                                <button
                                                    onClick={e => { e.stopPropagation(); cart.decrementItem(key) }}
                                                    style={{
                                                        width: 30, height: 30, borderRadius: 8, border: 'none',
                                                        background: qty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', color: qty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                                    }}
                                                >
                                                    {qty === 1 ? <Trash2 size={14} /> : <Minus size={14} />}
                                                </button>
                                                <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--toul-primary)' }}>{qty}</span>
                                                <button
                                                    onClick={e => { e.stopPropagation(); cart.addCombo(combo.id) }}
                                                    style={{
                                                        width: 30, height: 30, borderRadius: 8, border: 'none',
                                                        background: 'var(--toul-pos-green-dark)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', color: 'var(--toul-primary)',
                                                    }}
                                                >
                                                    <Plus size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Variant picker overlay */}
            {expandedVariantProduct && (() => {
                const product = data.products.find(p => p.id === expandedVariantProduct)
                const variants = product ? (data.variantsByProduct[product.id] ?? []) : []
                return (
                    <div
                        style={{
                            position: 'absolute', inset: 0, zIndex: 20,
                            background: 'rgba(0,0,0,0.45)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 32,
                        }}
                        onClick={() => setExpandedVariantProduct(null)}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'var(--toul-pos-bg-card)', borderRadius: 16,
                                width: '100%', maxWidth: 420,
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                border: '1.5px solid var(--toul-pos-border)',
                                maxHeight: '75%',
                            }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 16px', borderBottom: '1px solid var(--toul-pos-border)', flexShrink: 0,
                            }}>
                                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--toul-pos-text-main)' }}>
                                    {product?.name}
                                </span>
                                <button
                                    onClick={() => setExpandedVariantProduct(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--toul-pos-text-sec)', padding: 4, display: 'flex', alignItems: 'center' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ overflowY: 'auto', flex: 1 }}>
                                {variants.map(variant => {
                                    const key = `${expandedVariantProduct}:${variant.id}`
                                    const vQty = cart.cartMap[key] || 0
                                    const vOos = variant.stock <= 0
                                    const vSelected = vQty > 0
                                    return (
                                        <div
                                            key={key}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '12px 16px', borderBottom: '1px solid var(--toul-pos-border)',
                                                opacity: vOos ? 0.4 : 1,
                                                pointerEvents: vOos ? 'none' : 'auto',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0 }}>{variant.name}</p>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                                                    <span style={{ fontSize: 12, color: 'var(--toul-primary)', fontWeight: 600 }}>{formatCOP(variant.sale_price)}</span>
                                                    <span style={{ fontSize: 10, color: 'var(--toul-pos-text-dim)' }}>{vOos ? 'Sin stock' : `Stock: ${variant.stock}`}</span>
                                                </div>
                                            </div>
                                            {!vSelected ? (
                                                <button
                                                    onClick={() => cart.addItem(key, variant.stock)}
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                                    <button
                                                        onClick={() => cart.decrementItem(key)}
                                                        style={{
                                                            width: 30, height: 30, borderRadius: 8, border: 'none',
                                                            background: vQty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-pos-green-dark)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: 'pointer', color: vQty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-primary)',
                                                        }}
                                                    >
                                                        {vQty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}
                                                    </button>
                                                    <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--toul-primary)', minWidth: 24, textAlign: 'center' }}>{vQty}</span>
                                                    <button
                                                        onClick={() => cart.addItem(key, variant.stock)}
                                                        disabled={vQty >= variant.stock}
                                                        style={{
                                                            width: 30, height: 30, borderRadius: 8, border: 'none',
                                                            background: 'var(--toul-pos-green-dark)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            cursor: vQty >= variant.stock ? 'default' : 'pointer',
                                                            color: 'var(--toul-primary)', opacity: vQty >= variant.stock ? 0.3 : 1,
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
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   RIGHT COLUMN — Cart + Payment (mirrors mobile Step2 exactly)
   ══════════════════════════════════════════════════════════════ */
function RightPanel({ onConfirm, submitting, error, onClearError }: {
    onConfirm: () => void; submitting: boolean; error: string | null; onClearError: () => void
}) {
    const { data, cart, payment } = usePOSFlow()
    const [showDiscount, setShowDiscount] = useState(false)
    const [discType, setDiscType] = useState<'%' | '$'>('$')
    const [discValue, setDiscValue] = useState('')
    const [customerMode, setCustomerMode] = useState<'display' | 'search'>('search')
    const [createPhone, setCreatePhone] = useState('')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    const isCredit = payment.saleType === 'credito'

    const filteredCustomers = useMemo(() => {
        if (!payment.customerSearch.trim()) return data.customers.slice(0, 5)
        const q = payment.customerSearch.toLowerCase()
        return data.customers.filter(c => c.name.toLowerCase().includes(q))
    }, [payment.customerSearch, data.customers])

    const selectCustomer = (c: Customer) => {
        payment.setSelectedCustomer(c)
        setCustomerMode('display')
    }

    const handleCreateCustomer = async () => {
        if (!payment.customerSearch.trim() || creating) return
        setCreating(true)
        setCreateError(null)
        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: payment.customerSearch.trim(), phone: createPhone.trim() || null }),
            })
            const data = await res.json()
            if (!res.ok) { setCreateError(data.error || 'Error al crear cliente'); return }
            payment.setSelectedCustomer(data.customer)
            setCustomerMode('display')
            setCreatePhone('')
        } catch {
            setCreateError('Error de conexión')
        } finally {
            setCreating(false)
        }
    }

    const handleDiscValue = (val: string) => {
        setDiscValue(val)
        payment.setDiscountValue(val)
    }
    const handleDiscType = () => {
        const next = discType === '$' ? '%' : '$'
        setDiscType(next)
        payment.toggleDiscountType()
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Scrollable content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* ── Cart Summary ─────────────────────── */}
                    <Section label={`Carrito · ${cart.totalUnits} und`}>
                        {cart.isEmpty ? (
                            <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                justifyContent: 'center', gap: 8, padding: '24px 0',
                            }}>
                                <ShoppingBag size={28} style={{ color: 'var(--toul-pos-text-inactive)', opacity: 0.5 }} />
                                <p style={{ fontSize: 12, color: 'var(--toul-pos-text-inactive)', textAlign: 'center', margin: 0 }}>
                                    Selecciona productos para comenzar
                                </p>
                            </div>
                        ) : (
                            <>
                                {cart.cartItems.map(item => {
                                    const img = (item.product.images?.[0] || item.product.image_url) as string | null
                                    const itemKey = item.variantId ? `${item.product.id}:${item.variantId}` : item.product.id
                                    return (
                                        <div key={itemKey} style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 0', borderBottom: `1px solid ${'var(--toul-pos-border)'}`,
                                        }}>
                                            <div style={{
                                                width: 32, height: 32, borderRadius: 6, overflow: 'hidden',
                                                background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {img ? (
                                                    <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <Package size={14} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.product.name}{item.variantName ? ` · ${item.variantName}` : ''}
                                                </p>
                                                <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: 0 }}>×{item.quantity}</p>
                                            </div>
                                            <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>
                                                {formatCOP((item.unitPrice ?? item.product.sale_price) * item.quantity)}
                                            </span>
                                        </div>
                                    )
                                })}
                                {/* Subtotal */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 2px' }}>
                                    <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)' }}>Subtotal</span>
                                    <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 700, fontFamily: 'monospace' }}>{formatCOP(cart.subtotal)}</span>
                                </div>
                            </>
                        )}
                    </Section>

                    {/* ── Error banner — identical to mobile ── */}
                    {error && (
                        <div style={{
                            background: 'var(--toul-pos-error-dim)', border: '1.5px solid var(--toul-pos-error-border)',
                            borderRadius: 12, padding: '12px 14px',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <AlertTriangle size={18} style={{ color: 'var(--toul-pos-error)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, color: 'var(--toul-pos-error)', fontWeight: 600, margin: 0 }}>{error}</p>
                                <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: '2px 0 0' }}>Tu carrito está intacto.</p>
                            </div>
                            <button
                                onClick={() => { onClearError(); onConfirm() }}
                                style={{
                                    background: 'var(--toul-pos-error-dim-strong)', border: 'none', borderRadius: 8,
                                    padding: '6px 10px', cursor: 'pointer', color: 'var(--toul-pos-error)',
                                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, flexShrink: 0,
                                }}
                            >
                                <RefreshCw size={12} /> Reintentar
                            </button>
                        </div>
                    )}

                    {/* ── Tipo de venta — identical to mobile ── */}
                    <Section label="Tipo de venta">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {(['contado', 'credito'] as const).map(type => {
                                const active = (type === 'contado' && !isCredit) || (type === 'credito' && isCredit)
                                return (
                                    <button
                                        key={type}
                                        onClick={() => payment.setSaleType(type)}
                                        style={{
                                            background: active ? 'var(--toul-primary-dim)' : 'transparent',
                                            border: `1.5px solid ${active ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 10, padding: '14px 0',
                                            fontSize: 15, fontWeight: 700,
                                            color: active ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)',
                                            cursor: 'pointer', transition: 'all 120ms ease',
                                        }}
                                    >
                                        {type === 'contado' ? 'Contado' : 'Crédito'}
                                    </button>
                                )
                            })}
                        </div>
                    </Section>

                    {/* ── Cliente — identical to mobile ──────── */}
                    <Section label={`Cliente${isCredit ? ' *' : ''}`}>
                        {payment.selectedCustomer && customerMode === 'display' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'var(--toul-pos-green-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 13, fontWeight: 700, color: 'var(--toul-primary)', flexShrink: 0,
                                }}>
                                    {payment.selectedCustomer.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0 }}>{payment.selectedCustomer.name}</p>
                                    {payment.selectedCustomer.phone && (
                                        <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: 0 }}>{payment.selectedCustomer.phone}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => { payment.setSelectedCustomer(null); payment.setCustomerSearch(''); setCustomerMode('search') }}
                                    style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                                >
                                    cambiar <ChevronRight size={12} />
                                </button>
                            </div>
                        ) : (
                            <div>
                                <div style={{ position: 'relative' }}>
                                    <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-pos-text-sec)' }} />
                                    <input
                                        placeholder="Buscar cliente..."
                                        value={payment.customerSearch}
                                        onChange={e => payment.setCustomerSearch(e.target.value)}
                                        style={{
                                            width: '100%', background: 'var(--toul-pos-bg-main)', border: `1px solid ${'var(--toul-pos-border)'}`,
                                            borderRadius: 8, padding: '8px 10px 8px 36px', fontSize: 12,
                                            color: 'var(--toul-pos-text-main)', outline: 'none',
                                        }}
                                    />
                                </div>
                                {payment.customerSearch.trim() && (
                                    <div style={{ marginTop: 6, maxHeight: 130, overflowY: 'auto', borderRadius: 8, border: `1px solid ${'var(--toul-pos-border)'}`, overflow: 'hidden' }}>
                                        {filteredCustomers.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                    padding: '7px 10px', background: 'none', border: 'none',
                                                    borderBottom: `1px solid ${'var(--toul-pos-border)'}`, cursor: 'pointer', textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--toul-pos-green-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--toul-primary)' }}>
                                                    {c.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)' }}>{c.name}</span>
                                            </button>
                                        ))}
                                        {filteredCustomers.length === 0 && (
                                            <div style={{ padding: '10px', background: 'var(--toul-pos-green-dark)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <p style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <UserPlus size={12} /> Crear: &quot;{payment.customerSearch}&quot;
                                                </p>
                                                <input
                                                    placeholder="Teléfono (opcional)"
                                                    value={createPhone}
                                                    onChange={e => setCreatePhone(e.target.value)}
                                                    inputMode="numeric"
                                                    style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--toul-pos-text-main)', outline: 'none' }}
                                                />
                                                {createError && <p style={{ fontSize: 10, color: 'var(--toul-pos-error)', margin: 0 }}>{createError}</p>}
                                                <button
                                                    onClick={handleCreateCustomer}
                                                    disabled={creating}
                                                    style={{ background: creating ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)', color: creating ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)', border: 'none', borderRadius: 6, padding: '7px 0', fontSize: 12, fontWeight: 700, cursor: creating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                >
                                                    {creating ? <div style={{ width: 12, height: 12, border: '2px solid var(--toul-pos-bg-main)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : 'Crear y seleccionar'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </Section>

                    {/* ── Campos crédito — identical to mobile ── */}
                    {isCredit && (
                        <Section label="Crédito">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div>
                                    <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Vence *</p>
                                    <input
                                        type="date"
                                        value={payment.dueDate}
                                        onChange={e => payment.setDueDate(e.target.value)}
                                        style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: `1px solid ${'var(--toul-pos-border)'}`, borderRadius: 8, padding: '8px', fontSize: 11, color: 'var(--toul-pos-text-main)', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Abono inicial</p>
                                    <input
                                        type="number" inputMode="numeric" placeholder="0"
                                        value={payment.initialPayment}
                                        onChange={e => payment.setInitialPayment(e.target.value)}
                                        style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: `1px solid ${'var(--toul-pos-border)'}`, borderRadius: 8, padding: '8px', fontSize: 11, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'rgba(255,180,0,0.08)' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#FFB400' }}>Pendiente</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#FFB400' }}>
                                    {formatCOP(Math.max(0, payment.total - (Number(payment.initialPayment) || 0)))}
                                </span>
                            </div>
                        </Section>
                    )}

                    {/* ── Método de pago — 2-col cards identical to mobile */}
                    {(payment.saleType === 'contado' || (isCredit && Number(payment.initialPayment) > 0)) && (
                        <Section label="¿Cómo te pagaron?">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {data.methods.map(m => {
                                    const isActive = payment.selectedMethodIds.includes(m.id)
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => payment.toggleMethod(m)}
                                            style={{
                                                background: isActive ? 'var(--toul-pos-green-surface)' : 'var(--toul-pos-bg-card)',
                                                border: `1.5px solid ${isActive ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                                borderRadius: 12, padding: 12, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                position: 'relative', textAlign: 'left',
                                                transition: 'all 120ms ease',
                                            }}
                                        >
                                            {isActive && (
                                                <div style={{
                                                    position: 'absolute', top: 6, right: 6,
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Check size={10} style={{ color: 'var(--toul-pos-bg-main)' }} />
                                                </div>
                                            )}
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                background: `${m.color}20`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color }} />
                                            </div>
                                            <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600 }}>
                                                {m.name}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Split inputs — identical to mobile */}
                            {payment.paymentSplits.length > 0 && (
                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {payment.paymentSplits.map(s => (
                                        <div key={s.methodId} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: 'var(--toul-pos-bg-main)', borderRadius: 8, padding: '6px 10px', border: `1px solid ${'var(--toul-pos-border)'}`,
                                        }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.methodColor, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', fontWeight: 600, flexShrink: 0 }}>{s.methodName}</span>
                                            <input
                                                type="number" inputMode="numeric" value={s.amount || ''} placeholder="0"
                                                onChange={e => payment.setMethodAmount(s.methodId, Number(e.target.value) || 0)}
                                                style={{ flex: 1, background: 'none', border: 'none', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace', minWidth: 0 }}
                                            />
                                        </div>
                                    ))}
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: payment.balanced ? 'var(--toul-primary)' : 'var(--toul-pos-error)' }}>
                                            {payment.balanced ? '✓ Cubierto' : `Restan: ${formatCOP(payment.remaining)}`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </Section>
                    )}

                    {/* ── Descuento — identical to mobile ────── */}
                    <Section label="Descuento">
                        {!showDiscount ? (
                            <button
                                onClick={() => { setShowDiscount(true); payment.setShowDiscount(true) }}
                                style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                            >
                                <Plus size={14} /> Añadir descuento
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                    onClick={handleDiscType}
                                    style={{ background: 'var(--toul-pos-bg-main)', border: `1px solid ${'var(--toul-pos-border)'}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--toul-primary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                                >
                                    {discType}<span style={{ fontSize: 9, opacity: 0.6 }}>⌄</span>
                                </button>
                                <input
                                    type="number" inputMode="numeric" placeholder="0" value={discValue}
                                    onChange={e => handleDiscValue(e.target.value)}
                                    style={{ flex: 1, background: 'var(--toul-pos-bg-main)', border: `1px solid ${'var(--toul-pos-border)'}`, borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace', minWidth: 0 }}
                                />
                                <button
                                    onClick={() => { setShowDiscount(false); handleDiscValue('') }}
                                    style={{ background: 'none', border: 'none', color: 'var(--toul-pos-error)', fontSize: 14, cursor: 'pointer', padding: 0 }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </Section>
                </div>
            </div>

            {/* ── Sticky footer — mirrors mobile Step2 footer ── */}
            <div style={{
                flexShrink: 0, borderTop: `1px solid ${'var(--toul-pos-footer-border)'}`,
                padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--toul-pos-bg-main)',
            }}>
                <div>
                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        {cart.cartItems.length} prod · {cart.totalUnits} und
                    </p>
                    {payment.discountAmount > 0 && (
                        <p style={{ fontSize: 10, color: 'var(--toul-primary)', margin: 0 }}>−{formatCOP(payment.discountAmount)} desc.</p>
                    )}
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--toul-pos-text-main)', margin: 0 }}>{formatCOP(payment.total)}</p>
                </div>
                <button
                    onClick={onConfirm}
                    disabled={!payment.canConfirm || cart.isEmpty || submitting}
                    style={{
                        background: (!payment.canConfirm || cart.isEmpty || submitting) ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)',
                        color: (!payment.canConfirm || cart.isEmpty || submitting) ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 10, padding: '12px 18px',
                        fontSize: 13, fontWeight: 700, cursor: (!payment.canConfirm || cart.isEmpty || submitting) ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    {submitting ? (
                        <div style={{ width: 16, height: 16, border: `2px solid ${'var(--toul-pos-bg-main)'}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    ) : 'Confirmar venta'}
                </button>
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   CONFIRMATION VIEW — mirrors mobile Step3 exactly
   ══════════════════════════════════════════════════════════════ */
function ConfirmationPanel({ sale, onNewSale, onViewHistory }: {
    sale: SaleSnapshot; onNewSale: () => void; onViewHistory: () => void
}) {
    const subtotal = Math.round(sale.subtotal || sale.items.reduce((s, i) => s + (i.unitPrice ?? i.product.sale_price) * i.quantity, 0))

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', padding: '20px 20px',
        }}>
            {/* Header — icon + title inline like mobile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 16, flexShrink: 0,
                    background: 'var(--toul-pos-green-mint)', border: `1.5px solid ${'var(--toul-primary)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Check size={24} style={{ color: 'var(--toul-primary)' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--toul-pos-text-main)', margin: 0 }}>
                        ¡Venta lista!
                    </h2>
                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        Inventario y caja actualizados
                    </p>
                </div>
            </div>

            {/* Summary card — identical structure to mobile Step3 */}
            <div style={{
                background: 'var(--toul-pos-bg-card)', border: `1px solid ${'var(--toul-pos-border)'}`,
                borderRadius: 14, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
                marginBottom: 16,
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: `1px solid ${'var(--toul-pos-border)'}`,
                }}>
                    <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Resumen de venta
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>
                        {sale.isCredit
                            ? `Crédito${sale.customerName ? ` — ${sale.customerName}` : ''}`
                            : sale.payments.map(p => p.methodName).join(', ') || 'N/A'
                        }
                    </span>
                </div>

                {/* Items */}
                <div style={{
                    maxHeight: sale.items.length > 4 ? 200 : 'none',
                    overflowY: sale.items.length > 4 ? 'auto' : 'visible',
                    padding: '0 14px',
                }}>
                    {sale.items.map(item => {
                        const img = (item.product.images?.[0] || item.product.image_url) as string | null
                        const itemKey = item.variantId ? `${item.product.id}:${item.variantId}` : item.product.id
                        return (
                            <div key={itemKey} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                borderBottom: `1px solid ${'var(--toul-pos-border)'}`,
                            }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 6, overflow: 'hidden',
                                    background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {img ? (
                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Package size={14} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.product.name}{item.variantName ? ` · ${item.variantName}` : ''}
                                    </p>
                                    <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: 0 }}>×{item.quantity}</p>
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>
                                    {formatCOP((item.unitPrice ?? item.product.sale_price) * item.quantity)}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Totals */}
                <div style={{ padding: '0 14px', marginTop: 'auto' }}>
                    <div style={{ borderTop: `1px solid ${'var(--toul-pos-border)'}` }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${'var(--toul-pos-border)'}` }}>
                        <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)' }}>Subtotal</span>
                        <span style={{ fontSize: 11, color: 'var(--toul-pos-text-main)', fontFamily: 'monospace' }}>{formatCOP(subtotal)}</span>
                    </div>
                    {sale.discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${'var(--toul-pos-border)'}` }}>
                            <span style={{ fontSize: 11, color: 'var(--toul-primary)' }}>Descuento</span>
                            <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontFamily: 'monospace' }}>−{formatCOP(sale.discount)}</span>
                        </div>
                    )}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px', margin: '8px -14px 0', borderRadius: '0 0 14px 14px',
                        background: 'var(--toul-pos-green-surface)',
                    }}>
                        <span style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 700 }}>Total cobrado</span>
                        <span style={{ fontSize: 20, color: 'var(--toul-primary)', fontWeight: 800, fontFamily: 'monospace' }}>
                            {formatCOP(sale.total)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Buttons — identical to mobile */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                <button
                    onClick={onNewSale}
                    style={{
                        width: '100%', background: 'var(--toul-primary)', color: 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 12, padding: '14px 0',
                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    OK
                </button>
                <button
                    onClick={onViewHistory}
                    style={{
                        width: '100%', background: 'transparent',
                        border: `1.5px solid ${'var(--toul-pos-border)'}`, color: 'var(--toul-primary)',
                        borderRadius: 12, padding: '14px 0',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Ver historial
                </button>
            </div>
        </div>
    )
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN EXPORT — DesktopPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function DesktopPOS() {
    const { closePOS } = usePOS()
    const router = useRouter()
    const { cart, payment } = usePOSFlow()
    const { mutate: globalMutate } = useSWRConfig()

    const [saleSnap, setSaleSnap] = useState<SaleSnapshot | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const handleSubmit = useCallback(async () => {
        if (submitting || cart.isEmpty) return
        setSubmitting(true)
        setSubmitError(null)

        const snapshot: SaleSnapshot = {
            items: [...cart.cartItems],
            discount: payment.discountAmount,
            total: payment.total,
            subtotal: cart.subtotal,
            payments: [...payment.paymentSplits],
            isCredit: payment.saleType === 'credito',
            customerName: payment.selectedCustomer?.name || payment.customerSearch || null,
        }

        try {
            const timeoutPromise = new Promise<{ success: false }>((_, reject) =>
                setTimeout(() => reject(new Error('La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.')), 10000)
            )
            const result = await Promise.race([
                payment.submitSale({ cartItems: cart.cartItems, subtotal: cart.subtotal }),
                timeoutPromise,
            ])

            setSubmitting(false)

            if (result.success) {
                setSaleSnap(snapshot)
                setTimeout(() => {
                    cart.clearCart()
                    payment.resetPayment()
                    globalMutate(() => true)
                }, 300)
            } else {
                setSubmitError('No se pudo registrar la venta. Intenta de nuevo.')
            }
        } catch (err: unknown) {
            setSubmitting(false)
            const message = err instanceof Error ? err.message : 'Error inesperado al procesar la venta.'
            setSubmitError(message)
        }
    }, [submitting, cart, payment, globalMutate])

    const handleNewSale = useCallback(() => {
        setSaleSnap(null)
        setSubmitError(null)
        cart.clearCart()
        payment.resetPayment()
        closePOS()
    }, [cart, payment, closePOS])

    const handleViewHistory = useCallback(() => {
        closePOS()
        router.push('/ventas')
    }, [closePOS, router])

    return (
        <div style={{
            display: 'flex', width: '100%', height: '100%', overflow: 'hidden',
        }}>
            {/* ── Left Column: Products (60%) ── */}
            <div style={{
                width: '60%', height: '100%', background: 'var(--toul-pos-bg-main)',
                borderRight: `1px solid var(--toul-pos-border)`,
                overflow: 'hidden', display: 'flex', flexDirection: 'column',
            }}>
                <ProductList />
            </div>

            {/* ── Right Column (40%) ── */}
            <div style={{
                width: '40%', height: '100%', background: 'var(--toul-pos-bg-main)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
                {saleSnap ? (
                    <ConfirmationPanel sale={saleSnap} onNewSale={handleNewSale} onViewHistory={handleViewHistory} />
                ) : (
                    <RightPanel onConfirm={handleSubmit} submitting={submitting} error={submitError} onClearError={() => setSubmitError(null)} />
                )}
            </div>
        </div>
    )
}
