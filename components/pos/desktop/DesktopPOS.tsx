'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
    Search, Plus, Minus, Trash2, SlidersHorizontal, Package, Check,
    ShoppingBag, UserPlus, ChevronRight, AlertTriangle, RefreshCw, X, Layers,
    Printer, ShieldCheck, Clock, WifiOff, CloudUpload,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { formatCOP } from '@/lib/utils'
import { usePOS } from '../POSContext'
import { usePOSFlow } from '../POSFlowProvider'
import type { SaleSnapshot } from '../mobile/Step3Confirmation'
import type { Customer } from '@/lib/types'
import { usePOSMode } from '../POSMode'
import { useCreditApproval, type CreditApprovalState } from '@/lib/isla/useCreditApproval'
import { createClient } from '@/lib/supabase/client'
import { loadReceiptData, printReceipt } from '@/lib/isla/receipt'
import { useOfflineSales } from '@/lib/isla/useOffline'
import { getCachedStoreInfo, queueSale } from '@/lib/isla/offline'
import type { ReceiptData } from '@/lib/isla/types'
import toast from 'react-hot-toast'

type DesktopSaleSnapshot = SaleSnapshot & { saleId?: string; offline?: boolean; receipt?: ReceiptData }

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
            borderRadius: 16, padding: '14px',
        }}>
            <p style={{ fontSize: 12, color: 'var(--toul-pos-text-sec)', fontWeight: 500, margin: '0 0 10px' }}>
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
    const { mode } = usePOSMode()
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
                {mode === 'drawer' && <button
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
                </button>}
            </div>

            {/* Toolbar — identical structure to mobile */}
            <div style={{ flexShrink: 0, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: showSort ? 8 : 0 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-pos-text-sec)' }} />
                        <input
                            ref={searchRef}
                            placeholder="Buscar producto..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onFocus={e => { e.currentTarget.style.background = 'var(--toul-surface-focused)'; e.currentTarget.style.borderColor = 'var(--toul-border-focused)' }}
                            onBlur={e => { e.currentTarget.style.background = 'var(--toul-pos-bg-card)'; e.currentTarget.style.borderColor = 'var(--toul-pos-border)' }}
                            style={{
                                width: '100%', height: 48, background: 'var(--toul-pos-bg-card)', border: `1px solid ${'var(--toul-pos-border)'}`,
                                borderRadius: 14, padding: '0 14px 0 42px', fontSize: 15, fontFamily: 'inherit',
                                color: 'var(--toul-pos-text-main)', outline: 'none',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                            }}
                        />
                    </div>
                    <button
                        onClick={() => setShowSort(!showSort)}
                        style={{
                            background: showSort ? 'var(--toul-surface-focused)' : 'var(--toul-pos-bg-card)',
                            border: `1px solid ${showSort ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                            borderRadius: 14, width: 48, height: 48, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: showSort ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)',
                            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
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
                                        background: active ? 'var(--toul-surface-focused)' : 'transparent',
                                        border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                                        borderRadius: 11, padding: '9px 14px', fontSize: 13, fontWeight: 500,
                                        color: active ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)', cursor: 'pointer',
                                        fontFamily: 'inherit',
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
                                        background: anyInCart ? 'var(--toul-surface-focused)' : 'var(--toul-pos-bg-card)',
                                        border: `1px solid ${anyInCart ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                                        borderRadius: 16, overflow: 'hidden',
                                        cursor: 'pointer',
                                        transition: 'background var(--toul-transition), border-color var(--toul-transition), transform 120ms var(--toul-ease)',
                                        display: 'flex', flexDirection: 'column',
                                    }}
                                    onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.975)' }}
                                    onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                    onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                >
                                    <div style={{
                                        width: '100%', aspectRatio: '4 / 3',
                                        background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden', position: 'relative',
                                    }}>
                                        {img ? (
                                            <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                        ) : (
                                            <Package size={26} style={{ color: 'var(--toul-pos-text-inactive)' }} />
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
                                    <div style={{ padding: '10px 12px 12px' }}>
                                        <p style={{ fontSize: 14, color: 'var(--toul-pos-text-main)', fontWeight: 600, letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {product.name}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
                                            <span style={{ fontSize: 15, color: 'var(--toul-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>{priceLabel}</span>
                                            <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', border: '1px solid var(--toul-pos-border)', padding: '2px 7px', borderRadius: 999 }}>
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
                                    position: 'relative',
                                    background: selected ? 'var(--toul-surface-focused)' : 'var(--toul-pos-bg-card)',
                                    border: `1px solid ${selected ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                                    borderRadius: 16, overflow: 'hidden',
                                    pointerEvents: oos ? 'none' : 'auto',
                                    cursor: oos ? 'default' : 'pointer',
                                    transition: 'background var(--toul-transition), border-color var(--toul-transition), transform 120ms var(--toul-ease)',
                                    display: 'flex', flexDirection: 'column',
                                }}
                                onPointerDown={e => { if (!selected) e.currentTarget.style.transform = 'scale(0.975)' }}
                                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                            >
                                <div style={{
                                    width: '100%', aspectRatio: '4 / 3',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    overflow: 'hidden', position: 'relative',
                                    opacity: oos ? 0.38 : 1,
                                }}>
                                    {img ? (
                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                                    ) : (
                                        <Package size={26} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                    )}
                                {selected && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                                            style={{
                                                position: 'absolute', left: 8, right: 8, bottom: 8, height: 46,
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '0 6px', borderRadius: 14,
                                                background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                                                border: '1px solid var(--toul-border-focused)',
                                            }}
                                        >
                                            <button
                                                onClick={e => { e.stopPropagation(); cart.decrementItem(product.id) }}
                                                aria-label={qty === 1 ? 'Quitar del carrito' : 'Quitar uno'}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 11, border: 'none',
                                                    background: qty === 1 ? 'var(--toul-pos-error-dim)' : 'var(--toul-surface-2)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', color: qty === 1 ? 'var(--toul-pos-error)' : 'var(--toul-pos-text-main)',
                                                    transition: 'transform 100ms var(--toul-ease)',
                                                }}
                                                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.9)' }}
                                                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                            >
                                                {qty === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                                            </button>
                                            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--toul-pos-text-main)', letterSpacing: '-0.02em' }}>
                                                {qty}
                                            </span>
                                            <button
                                                onClick={e => { e.stopPropagation(); cart.addItem(product.id, product.stock) }}
                                                disabled={qty >= product.stock}
                                                aria-label="Agregar uno"
                                                style={{
                                                    width: 36, height: 36, borderRadius: 11, border: 'none',
                                                    background: 'var(--toul-primary)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: qty >= product.stock ? 'default' : 'pointer',
                                                    color: '#000', opacity: qty >= product.stock ? 0.3 : 1,
                                                    transition: 'transform 100ms var(--toul-ease)',
                                                }}
                                                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.9)' }}
                                                onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                                onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                            >
                                                <Plus size={16} strokeWidth={2.6} />
                                            </button>
                                        </motion.div>
                                    )}
                                </div>
                                {oos && (
                                    <span style={{
                                        position: 'absolute', top: 10, left: 10,
                                        fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                                        color: 'var(--toul-pos-text-sec)', background: 'rgba(10,10,10,0.75)',
                                        backdropFilter: 'blur(8px)', borderRadius: 999, padding: '4px 9px',
                                    }}>
                                        Sin stock
                                    </span>
                                )}
                                <div style={{ padding: '10px 12px 12px', opacity: oos ? 0.38 : 1 }}>
                                    <p style={{ fontSize: 14, color: 'var(--toul-pos-text-main)', fontWeight: 600, letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {product.name}
                                    </p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
                                        <span style={{ fontSize: 15, color: 'var(--toul-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>
                                            {formatCOP(product.sale_price)}
                                        </span>
                                        {!oos && (
                                            <span style={{
                                                fontSize: 11, borderRadius: 999, padding: '2px 7px',
                                                color: product.stock <= 3 ? 'var(--toul-pos-warning)' : 'var(--toul-pos-text-sec)',
                                                border: `1px solid ${product.stock <= 3 ? 'rgba(255,214,10,0.3)' : 'var(--toul-pos-border)'}`,
                                            }}>
                                                {product.stock} und
                                            </span>
                                        )}
                                    </div>
                                </div>
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
                            <Layers size={14} style={{ color: 'var(--toul-pos-text-sec)' }} />
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-pos-text-sec)' }}>Combos</span>
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
                                            position: 'relative',
                                            background: selected ? 'var(--toul-surface-focused)' : 'var(--toul-pos-bg-card)',
                                            border: `1px solid ${selected ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 16, overflow: 'hidden',
                                            cursor: selected ? 'default' : 'pointer',
                                            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
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
                            background: 'rgba(0,0,0,0.55)',
                            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 32,
                        }}
                        onClick={() => setExpandedVariantProduct(null)}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'var(--toul-surface-overlay)', borderRadius: 24,
                                width: '100%', maxWidth: 440,
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.08)',
                                boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
                                maxHeight: '78%',
                            }}
                        >
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '18px 20px 14px', borderBottom: '1px solid var(--toul-divider)', flexShrink: 0,
                            }}>
                                <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--toul-pos-text-sec)' }}>Elige la presentación</span>
                                    <span style={{ display: 'block', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-pos-text-main)' }}>
                                        {product?.name}
                                    </span>
                                </span>
                                <button
                                    onClick={() => setExpandedVariantProduct(null)}
                                    aria-label="Cerrar"
                                    style={{
                                        width: 36, height: 36, borderRadius: 12, border: 'none', flexShrink: 0,
                                        background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <X size={17} />
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
                                                display: 'flex', alignItems: 'center', gap: 12, minHeight: 64,
                                                padding: '12px 20px', borderBottom: '1px solid var(--toul-divider)',
                                                background: vSelected ? 'var(--toul-surface-focused)' : 'transparent',
                                                transition: 'background var(--toul-transition)',
                                                opacity: vOos ? 0.38 : 1,
                                                pointerEvents: vOos ? 'none' : 'auto',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontSize: 15, color: 'var(--toul-pos-text-main)', fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>{variant.name}</p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                                    <span style={{ fontSize: 15, color: 'var(--toul-primary)', fontWeight: 700, letterSpacing: '-0.02em' }}>{formatCOP(variant.sale_price)}</span>
                                                    <span style={{
                                                        fontSize: 11, borderRadius: 999, padding: '2px 7px',
                                                        color: vOos || variant.stock <= 3 ? 'var(--toul-pos-warning)' : 'var(--toul-pos-text-sec)',
                                                        border: `1px solid ${vOos || variant.stock <= 3 ? 'rgba(255,214,10,0.3)' : 'var(--toul-pos-border)'}`,
                                                    }}>
                                                        {vOos ? 'Sin stock' : `${variant.stock} und`}
                                                    </span>
                                                </div>
                                            </div>
                                            {!vSelected ? (
                                                <button
                                                    onClick={() => cart.addItem(key, variant.stock)}
                                                    style={{
                                                        width: 44, height: 44, borderRadius: 13, flexShrink: 0, border: 'none',
                                                        background: 'var(--toul-primary)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        cursor: 'pointer', color: '#000',
                                                        transition: 'transform 100ms var(--toul-ease)',
                                                    }}
                                                    onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.92)' }}
                                                    onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                                    onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                                                >
                                                    <Plus size={18} strokeWidth={2.6} />
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
function RightPanel({ onConfirm, submitting, error, onClearError, approval, needsApproval, online }: {
    onConfirm: () => void; submitting: boolean; error: string | null; onClearError: () => void
    approval: CreditApprovalState; needsApproval: boolean; online: boolean
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
                                                <p style={{ fontSize: 14, color: 'var(--toul-pos-text-main)', fontWeight: 600, letterSpacing: '-0.01em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.product.name}{item.variantName ? ` · ${item.variantName}` : ''}
                                                </p>
                                                <p style={{ fontSize: 12, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                                                    {item.quantity} × {formatCOP(item.unitPrice ?? item.product.sale_price)}
                                                </p>
                                            </div>
                                            <span style={{ fontSize: 14, color: 'var(--toul-pos-text-main)', fontWeight: 600, flexShrink: 0 }}>
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
                                // Sin internet solo se puede vender de contado
                                const blocked = type === 'credito' && !online
                                return (
                                    <button
                                        key={type}
                                        onClick={() => { if (!blocked) payment.setSaleType(type) }}
                                        disabled={blocked}
                                        style={{
                                            background: active ? 'var(--toul-primary-dim)' : 'transparent',
                                            border: `1.5px solid ${active ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 13, height: 50, fontFamily: 'inherit',
                                            fontSize: 15, fontWeight: 600,
                                            color: blocked ? 'var(--toul-pos-text-dim)' : active ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)',
                                            cursor: blocked ? 'not-allowed' : 'pointer', transition: 'all 120ms ease',
                                            opacity: blocked ? 0.5 : 1,
                                        }}
                                    >
                                        {type === 'contado' ? 'Contado' : 'Crédito'}
                                    </button>
                                )
                            })}
                        </div>
                        {!online && (
                            <div style={{
                                marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--toul-pos-warning-dim)',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}>
                                <WifiOff size={14} style={{ color: 'var(--toul-pos-warning)', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--toul-pos-warning)' }}>
                                    Sin internet: puedes seguir vendiendo de contado. El crédito necesita señal.
                                </span>
                            </div>
                        )}
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
                            {needsApproval && <ApprovalBanner approval={approval} />}
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
                                                background: isActive ? 'var(--toul-surface-focused)' : 'transparent',
                                                border: `1px solid ${isActive ? 'var(--toul-border-focused)' : 'var(--toul-pos-border)'}`,
                                                borderRadius: 13, height: 54, padding: '0 12px', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                position: 'relative', textAlign: 'left', fontFamily: 'inherit',
                                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                            }}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                                                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                                                    style={{
                                                        position: 'absolute', top: 7, right: 7,
                                                        width: 17, height: 17, borderRadius: '50%',
                                                        background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                    <Check size={10} strokeWidth={3.5} style={{ color: '#000' }} />
                                                </motion.div>
                                            )}
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                background: `${m.color}20`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color }} />
                                            </div>
                                            <span style={{ fontSize: 14, color: 'var(--toul-pos-text-main)', fontWeight: 500 }}>
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
                padding: '14px 20px calc(14px + env(safe-area-inset-bottom, 0px))',
                display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between',
                background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
            }}>
                <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 12, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        {cart.cartItems.length} prod · {cart.totalUnits} und
                        {payment.discountAmount > 0 && (
                            <span style={{ color: 'var(--toul-primary)' }}> · −{formatCOP(payment.discountAmount)} desc.</span>
                        )}
                    </p>
                    <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.1, color: 'var(--toul-pos-text-main)', margin: 0 }}>
                        {formatCOP(payment.total)}
                    </p>
                </div>
                {(() => {
                    // Vendedor + crédito: primero pedir aprobación, luego confirmar
                    const awaitingApproval = needsApproval && approval.status !== 'approved'
                    const busy = submitting || approval.status === 'requesting' || approval.status === 'pending'
                    const disabled = !payment.canConfirm || cart.isEmpty || busy
                    const label = !awaitingApproval ? 'Confirmar venta'
                        : approval.status === 'pending' ? 'Esperando aprobación'
                        : 'Pedir aprobación'
                    return (
                        <button
                            onClick={awaitingApproval ? approval.request : onConfirm}
                            disabled={disabled}
                            style={{
                                background: disabled ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)',
                                color: disabled ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)',
                                border: 'none', borderRadius: 16, padding: '0 26px', height: 56, flexShrink: 0,
                                fontSize: 16, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
                                boxShadow: disabled ? 'none' : '0 6px 26px var(--toul-accent-glow)',
                                display: 'flex', alignItems: 'center', gap: 8,
                                transition: 'transform 120ms var(--toul-ease), background 150ms var(--toul-ease)',
                            }}
                            onPointerDown={e => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)' }}
                            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
                            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
                        >
                            {(submitting || approval.status === 'requesting') ? (
                                <div style={{ width: 16, height: 16, border: `2px solid ${'var(--toul-pos-bg-main)'}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            ) : (
                                <>
                                    {awaitingApproval && approval.status === 'pending' && <Clock size={16} />}
                                    {awaitingApproval && approval.status !== 'pending' && <ShieldCheck size={16} />}
                                    {label}
                                </>
                            )}
                        </button>
                    )
                })()}
            </div>
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   APPROVAL BANNER — crédito de vendedor (modo isla)
   ══════════════════════════════════════════════════════════════ */
function ApprovalBanner({ approval }: { approval: CreditApprovalState }) {
    const tone = approval.status === 'approved' ? 'ok'
        : approval.status === 'rejected' ? 'error'
        : 'wait'
    const colors = {
        ok: { bg: 'var(--toul-pos-green-surface)', fg: 'var(--toul-primary)' },
        error: { bg: 'var(--toul-pos-error-dim)', fg: 'var(--toul-pos-error)' },
        wait: { bg: 'var(--toul-pos-warning-dim)', fg: 'var(--toul-pos-warning)' },
    }[tone]

    const text = approval.status === 'pending' ? 'Esperando que el administrador apruebe el crédito…'
        : approval.status === 'approved' ? (approval.message || 'Crédito aprobado')
        : approval.status === 'rejected' ? (approval.message || 'Crédito rechazado')
        : approval.message || 'Este crédito necesita aprobación del administrador.'

    return (
        <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 10, background: colors.bg,
            display: 'flex', alignItems: 'center', gap: 8,
        }}>
            {approval.status === 'pending'
                ? <div style={{ width: 12, height: 12, border: `2px solid ${colors.fg}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                : <ShieldCheck size={14} style={{ color: colors.fg, flexShrink: 0 }} />}
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.fg, flex: 1 }}>{text}</span>
            {approval.status === 'pending' && (
                <button onClick={approval.cancel} style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                    Cancelar
                </button>
            )}
        </div>
    )
}

/* ══════════════════════════════════════════════════════════════
   CONFIRMATION VIEW — mirrors mobile Step3 exactly
   ══════════════════════════════════════════════════════════════ */
function ConfirmationPanel({ sale, onNewSale, onViewHistory, onPrint, printing }: {
    sale: DesktopSaleSnapshot; onNewSale: () => void; onViewHistory: () => void
    onPrint?: () => void; printing?: boolean
}) {
    const { mode } = usePOSMode()
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
                        {sale.offline ? 'Guardada en este computador · se envía sola al volver el internet' : 'Inventario y caja actualizados'}
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
                    autoFocus
                    style={{
                        width: '100%', background: 'var(--toul-primary)', color: 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 12, padding: '16px 0',
                        fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    {mode === 'caja' ? 'Nueva venta' : 'OK'}
                </button>
                {onPrint && (sale.saleId || sale.receipt) && (
                    <button
                        onClick={onPrint}
                        disabled={printing}
                        style={{
                            width: '100%', background: 'var(--toul-pos-bg-card)',
                            border: `1.5px solid ${'var(--toul-pos-border)'}`, color: 'var(--toul-pos-text-main)',
                            borderRadius: 12, padding: '14px 0',
                            fontSize: 14, fontWeight: 600, cursor: printing ? 'default' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            opacity: printing ? 0.6 : 1,
                        }}
                    >
                        <Printer size={16} /> {printing ? 'Preparando tirilla…' : 'Imprimir tirilla'}
                    </button>
                )}
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
    const { mode, role, autoPrint, cashSessionId, sellerName, onViewHistory } = usePOSMode()
    const { online, sync } = useOfflineSales()

    const [saleSnap, setSaleSnap] = useState<DesktopSaleSnapshot | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)
    const [printing, setPrinting] = useState(false)

    // Modo isla: el vendedor necesita aprobación del administrador para fiar
    const isCredit = payment.saleType === 'credito'
    const needsApproval = role === 'seller' && isCredit
    const approvalItems = useMemo(
        () => cart.cartItems.map(i => ({ name: `${i.product.name}${i.variantName ? ` · ${i.variantName}` : ''}`, quantity: i.quantity })),
        [cart.cartItems]
    )
    const approval = useCreditApproval({
        enabled: needsApproval,
        total: payment.total,
        customerName: payment.selectedCustomer?.name || payment.customerSearch.trim(),
        dueDate: payment.dueDate,
        initialPayment: Number(payment.initialPayment) || 0,
        items: approvalItems,
    })

    const handlePrint = useCallback(async (saleId: string) => {
        setPrinting(true)
        try {
            printReceipt(await loadReceiptData(createClient(), saleId))
        } catch {
            toast.error('No se pudo preparar la tirilla')
        } finally {
            setPrinting(false)
        }
    }, [])

    // Tirilla de una venta hecha sin internet: se arma con lo que hay en el computador
    const buildLocalReceipt = useCallback((snapshot: SaleSnapshot, clientSaleId: string, soldAt: string): ReceiptData => {
        const store = getCachedStoreInfo()
        return {
            saleId: clientSaleId,
            createdAt: soldAt,
            storeName: store?.name ?? 'TOUL',
            nit: store?.nit ?? null,
            address: store?.address ?? null,
            phone: store?.phone ?? null,
            footer: store?.receipt_footer ?? null,
            sellerName: sellerName ?? null,
            customerName: snapshot.customerName,
            items: snapshot.items.map(i => ({
                name: `${i.product.name}${i.variantName ? ` · ${i.variantName}` : ''}`,
                quantity: i.quantity,
                unitPrice: i.unitPrice ?? i.product.sale_price,
            })),
            subtotal: snapshot.subtotal ?? snapshot.total + snapshot.discount,
            discount: snapshot.discount,
            total: snapshot.total,
            payments: snapshot.payments.map(p => ({ method: p.methodName, amount: p.amount })),
            isCredit: snapshot.isCredit,
        }
    }, [sellerName])

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

        // Identificador propio: si el envío se reintenta, el servidor no duplica la venta
        const clientSaleId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const soldAt = new Date().toISOString()
        const saleArgs = {
            cartItems: cart.cartItems,
            subtotal: cart.subtotal,
            approvalId: needsApproval ? approval.requestId : null,
            cashSessionId: cashSessionId ?? null,
            clientSaleId,
            soldAt,
        }

        const finish = (saleId?: string, receipt?: ReceiptData) => {
            setSubmitting(false)
            setSaleSnap({ ...snapshot, saleId, receipt, offline: !saleId })
            approval.reset()
            if (mode === 'caja' && autoPrint) {
                if (receipt) printReceipt(receipt)
                else if (saleId) void handlePrint(saleId)
            }
            setTimeout(() => {
                cart.clearCart()
                payment.resetPayment()
                globalMutate(() => true)
            }, 300)
        }

        // Guardar en el computador para enviarla cuando vuelva el internet
        const saveForLater = () => {
            const receipt = buildLocalReceipt(snapshot, clientSaleId, soldAt)
            const saved = queueSale({
                clientSaleId,
                soldAt,
                total: snapshot.total,
                body: payment.buildSaleBody(saleArgs),
                receipt,
            })
            if (!saved) {
                // Nunca dar por hecha una venta que no quedó guardada
                setSubmitting(false)
                setSubmitError('No se pudo guardar la venta en este computador. Anótala en papel y avisa al administrador.')
                return
            }
            finish(undefined, receipt)
            toast.success('Venta guardada. Se envía sola cuando vuelva el internet.')
        }

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            // El crédito necesita señal (cliente, deuda y aprobación)
            if (payment.saleType === 'credito') {
                setSubmitting(false)
                setSubmitError('Sin internet no se puede vender a crédito. Cobra de contado o espera señal.')
                return
            }
            saveForLater()
            return
        }

        try {
            const timeoutPromise = new Promise<{ success: false; timedOut: true }>(resolve =>
                setTimeout(() => resolve({ success: false, timedOut: true }), 10000)
            )
            const result = await Promise.race([payment.submitSale(saleArgs), timeoutPromise])

            if (result.success) {
                finish((result as { saleId?: string }).saleId)
                void sync()
                return
            }

            // Sin señal o el servidor no respondió: la venta no se pierde
            if ('timedOut' in result || (result as { networkError?: boolean }).networkError) {
                saveForLater()
                return
            }

            setSubmitting(false)
            setSubmitError('No se pudo registrar la venta. Intenta de nuevo.')
        } catch (err: unknown) {
            setSubmitting(false)
            const message = err instanceof Error ? err.message : 'Error inesperado al procesar la venta.'
            setSubmitError(message)
        }
    }, [submitting, cart, payment, globalMutate, needsApproval, approval, mode, autoPrint, handlePrint, cashSessionId, buildLocalReceipt, sync])

    const handleNewSale = useCallback(() => {
        setSaleSnap(null)
        setSubmitError(null)
        cart.clearCart()
        payment.resetPayment()
        if (mode === 'drawer') closePOS()
    }, [cart, payment, closePOS, mode])

    const handleViewHistory = useCallback(() => {
        if (onViewHistory) { onViewHistory(); return }
        closePOS()
        router.push('/ventas')
    }, [closePOS, router, onViewHistory])

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
                    <ConfirmationPanel
                        sale={saleSnap}
                        onNewSale={handleNewSale}
                        onViewHistory={handleViewHistory}
                        onPrint={saleSnap.receipt
                            ? () => printReceipt(saleSnap.receipt!)
                            : saleSnap.saleId ? () => handlePrint(saleSnap.saleId!) : undefined}
                        printing={printing}
                    />
                ) : (
                    <RightPanel
                        onConfirm={handleSubmit}
                        submitting={submitting}
                        error={submitError}
                        onClearError={() => setSubmitError(null)}
                        approval={approval}
                        needsApproval={needsApproval}
                        online={online}
                    />
                )}
            </div>
        </div>
    )
}
