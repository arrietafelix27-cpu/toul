'use client'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, Package, Plus, Search, Layers, ChevronRight,
    CreditCard, CheckCircle2, Trash2, Navigation
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { Product, Provider } from '@/lib/types'

// ─── Types (mirror purchase/page.tsx) ───────────────────────

type Variant = { id: string; product_id: string; name: string; sale_price: number; cpp: number }

type SelectedItem = {
    itemKey: string
    product: Product
    variantId?: string
    variantName?: string
    quantity: string
    cost: string
}

interface Props {
    // Data
    products: Product[]
    variantsByProduct: Record<string, Variant[]>
    providers: Provider[]
    // Cart state
    selectedItems: SelectedItem[]
    addItem: (product: Product, variantId?: string, variantName?: string) => void
    updateItem: (itemKey: string, field: 'quantity' | 'cost', value: string) => void
    removeItem: (itemKey: string) => void
    expandedInPicker: Set<string>
    toggleExpand: (productId: string) => void
    searchQuery: string
    setSearchQuery: (v: string) => void
    sortBy: 'A-Z' | 'Stock' | 'Recientes'
    setSortBy: (v: 'A-Z' | 'Stock' | 'Recientes') => void
    // Payment state
    paymentMethod: 'cash' | 'credit'
    setPaymentMethod: (v: 'cash' | 'credit') => void
    initialPayment: string
    setInitialPayment: (v: string) => void
    selectedProviderId: string
    setSelectedProviderId: (v: string) => void
    dueDate: string
    setDueDate: (v: string) => void
    // Submit
    subtotal: number
    total: number
    saving: boolean
    onSubmit: () => void
}

// ─── Component ───────────────────────────────────────────────

export function DesktopPurchase({
    products, variantsByProduct, providers,
    selectedItems, addItem, updateItem, removeItem,
    expandedInPicker, toggleExpand, searchQuery, setSearchQuery, sortBy, setSortBy,
    paymentMethod, setPaymentMethod,
    initialPayment, setInitialPayment,
    selectedProviderId, setSelectedProviderId, dueDate, setDueDate,
    subtotal, total, saving, onSubmit,
}: Props) {
    const canSubmit = selectedItems.length > 0
        && !(paymentMethod === 'credit' && (!selectedProviderId || !dueDate))
        && !saving

    const productsToShow = [...products]
        .sort((a, b) => {
            if (sortBy === 'A-Z') return a.name.localeCompare(b.name)
            if (sortBy === 'Stock') return a.stock - b.stock
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        .filter(p => searchQuery === '' ? true : (
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.reference && p.reference.toLowerCase().includes(searchQuery.toLowerCase()))
        ))
        .slice(0, searchQuery ? 30 : 15)

    return (
        <div className="px-8 pt-6 pb-12 max-w-6xl mx-auto">

            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <Link href="/inventory"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                        Inventario
                    </p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Nueva Compra</h1>
                </div>
            </div>

            {/* 2-column layout */}
            <div className="grid gap-8 items-start" style={{ gridTemplateColumns: '1fr 380px' }}>

                {/* ── LEFT: Product picker + Cart ─────────────────────── */}
                <div className="space-y-6">

                    {/* Search + Sort */}
                    <div className="flex flex-col gap-3">
                        <div className="relative">
                            <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                placeholder="Buscar producto para agregar..."
                                className="toul-input w-full"
                                style={{ paddingLeft: 42 }}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: 'var(--toul-text-subtle)' }}>Ordenar por:</span>
                            {(['A-Z', 'Stock', 'Recientes'] as const).map(opt => (
                                <button key={opt}
                                    onClick={() => setSortBy(opt)}
                                    className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                                    style={{
                                        background: sortBy === opt ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
                                        color: sortBy === opt ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                    }}>
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Product list */}
                    <div className="toul-card overflow-hidden" style={{ maxHeight: '42vh', overflowY: 'auto' }}>
                        {productsToShow.map(product => {
                            const productVariants = variantsByProduct[product.id]
                            const hasVariants = productVariants && productVariants.length > 0
                            const isExpanded = expandedInPicker.has(product.id)

                            return (
                                <div key={product.id} className="border-b last:border-0"
                                    style={{ borderColor: 'var(--toul-border)' }}>
                                    <button
                                        onClick={() => hasVariants ? toggleExpand(product.id) : addItem(product)}
                                        className="w-full px-4 py-3 text-left flex items-center gap-3 transition-all active:scale-[0.99]">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                                            style={{ background: 'var(--toul-surface-2)' }}>
                                            {(product.images?.[0] || product.image_url)
                                                ? <img src={product.images?.[0] ?? product.image_url!} alt="" className="w-full h-full object-cover" />
                                                : <Package size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                                {hasVariants && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 flex items-center gap-0.5"
                                                        style={{ background: 'rgba(74,222,128,0.12)', color: 'var(--toul-accent)' }}>
                                                        <Layers size={9} />
                                                        {productVariants.length}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs flex gap-2 mt-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                                                <span>Stock: {product.stock}</span>
                                                <span className="opacity-40">•</span>
                                                <span>Costo: {formatCOP(product.cpp)}</span>
                                            </p>
                                        </div>
                                        {hasVariants ? (
                                            <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                <ChevronRight size={16} style={{ color: 'var(--toul-text-muted)' }} />
                                            </motion.div>
                                        ) : (
                                            <Plus size={16} style={{ color: 'var(--toul-accent)' }} />
                                        )}
                                    </button>

                                    <AnimatePresence>
                                        {hasVariants && isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.18 }}
                                                className="overflow-hidden">
                                                <div className="pb-1" style={{ background: 'var(--toul-bg)' }}>
                                                    {productVariants.map(v => {
                                                        const itemKey = `${product.id}:${v.id}`
                                                        const alreadyAdded = selectedItems.some(i => i.itemKey === itemKey)
                                                        return (
                                                            <button key={v.id}
                                                                onClick={() => !alreadyAdded && addItem(product, v.id, v.name)}
                                                                disabled={alreadyAdded}
                                                                className="w-full px-5 py-2 flex items-center gap-3 transition-all active:scale-[0.99]"
                                                                style={{ opacity: alreadyAdded ? 0.45 : 1 }}>
                                                                <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--toul-text-muted)' }} />
                                                                <div className="flex-1 min-w-0 text-left">
                                                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--toul-text)' }}>{v.name}</p>
                                                                    <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Costo: {formatCOP(v.cpp)}</p>
                                                                </div>
                                                                {alreadyAdded
                                                                    ? <CheckCircle2 size={14} style={{ color: 'var(--toul-accent)' }} />
                                                                    : <Plus size={14} style={{ color: 'var(--toul-accent)' }} />
                                                                }
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )
                        })}
                        {productsToShow.length === 0 && (
                            <div className="p-10 flex flex-col items-center text-center">
                                <Package size={28} className="mb-2 opacity-20" />
                                <p className="text-sm font-semibold" style={{ color: 'var(--toul-text-muted)' }}>No hay resultados</p>
                            </div>
                        )}
                    </div>

                    {/* Selected items */}
                    {selectedItems.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs uppercase tracking-wider font-semibold px-1" style={{ color: 'var(--toul-text-subtle)' }}>
                                Ítems seleccionados ({selectedItems.length})
                            </p>
                            {selectedItems.map(item => (
                                <div key={item.itemKey} className="toul-card p-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                                            style={{ background: 'var(--toul-surface-2)' }}>
                                            {(item.product.images?.[0] || item.product.image_url)
                                                ? <img src={item.product.images?.[0] ?? item.product.image_url!} alt="" className="w-full h-full object-cover" />
                                                : <Package size={14} style={{ color: 'var(--toul-text-muted)' }} />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate leading-tight" style={{ color: 'var(--toul-text)' }}>{item.product.name}</p>
                                            {item.variantName && (
                                                <p className="text-xs font-medium" style={{ color: 'var(--toul-accent)' }}>{item.variantName}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex flex-col items-end">
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Cant.</label>
                                                <input type="number" min="1" value={item.quantity}
                                                    onChange={e => updateItem(item.itemKey, 'quantity', e.target.value)}
                                                    className="toul-input py-1 text-sm text-right"
                                                    style={{ width: '64px' }} />
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Costo unit.</label>
                                                <input type="number" min="0" value={item.cost}
                                                    onChange={e => updateItem(item.itemKey, 'cost', e.target.value)}
                                                    className="toul-input py-1 text-sm text-right"
                                                    style={{ width: '100px' }} />
                                            </div>
                                            <button onClick={() => removeItem(item.itemKey)}
                                                className="p-1.5 rounded-lg mt-4" style={{ color: 'var(--toul-error)' }}>
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {selectedItems.length === 0 && (
                        <div className="toul-card p-8 flex flex-col items-center text-center">
                            <Package size={32} className="mb-3 opacity-20" />
                            <p className="text-sm font-semibold" style={{ color: 'var(--toul-text-muted)' }}>
                                Selecciona productos del panel de arriba
                            </p>
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Payment + Submit ──────────────────────────── */}
                <div className="sticky top-6 space-y-4">

                    {/* Cómo se paga la compra */}
                    <div className="toul-card p-5 space-y-3">
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>¿Cómo vas a pagar esta compra?</p>

                        {([
                            { value: 'cash' as const, title: 'Ya la pagué', text: 'La compra queda saldada', color: 'var(--toul-accent)', dim: 'var(--toul-accent-dim)' },
                            { value: 'credit' as const, title: 'Queda debiendo', text: 'Genera deuda con el proveedor', color: 'var(--toul-warning)', dim: 'var(--toul-warning-dim)' },
                        ]).map(option => {
                            const active = paymentMethod === option.value
                            return (
                                <button key={option.value} onClick={() => setPaymentMethod(option.value)}
                                    className="w-full p-3 rounded-xl flex items-center gap-3 border text-left"
                                    style={{
                                        minHeight: 64,
                                        background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface-2)',
                                        borderColor: active ? 'var(--toul-border-focused)' : 'transparent',
                                        transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                    }}>
                                    <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: option.dim, color: option.color }}>
                                        {option.value === 'cash' ? <CreditCard size={17} /> : <Package size={17} />}
                                    </span>
                                    <span className="flex-1">
                                        <span className="block text-sm font-bold" style={{ color: 'var(--toul-text)' }}>{option.title}</span>
                                        <span className="block text-xs" style={{ color: 'var(--toul-text-subtle)' }}>{option.text}</span>
                                    </span>
                                    {active && <CheckCircle2 size={16} style={{ color: option.color }} />}
                                </button>
                            )
                        })}
                    </div>

                    {/* Provider + Credit fields */}
                    <div className="toul-card p-5 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                Proveedor {paymentMethod === 'credit' && <span style={{ color: 'var(--toul-error)' }}>*</span>}
                            </label>
                            <select className="toul-input w-full"
                                value={selectedProviderId}
                                onChange={(e) => setSelectedProviderId(e.target.value)}>
                                <option value="">Sin proveedor (opcional)</option>
                                {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>

                        {paymentMethod === 'credit' && (
                            <>
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                        Fecha de Vencimiento <span style={{ color: 'var(--toul-error)' }}>*</span>
                                    </label>
                                    <input type="date" className="toul-input w-full"
                                        value={dueDate}
                                        onChange={(e) => setDueDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]} />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                        Abono Inicial <span className="text-xs font-normal" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                                    </label>
                                    <input type="number" min="0" className="toul-input w-full"
                                        placeholder="0"
                                        value={initialPayment}
                                        onChange={(e) => setInitialPayment(e.target.value)} />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Total + Submit */}
                    <div className="toul-card p-5 space-y-4">
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-medium" style={{ color: 'var(--toul-text-muted)' }}>Total a pagar</span>
                            <span className="text-2xl font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(total)}</span>
                        </div>
                        {paymentMethod === 'credit' && Number(initialPayment) > 0 && (
                            <div className="flex justify-between items-center pt-3 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                <span className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>Saldo pendiente</span>
                                <span className="text-sm font-bold" style={{ color: 'var(--toul-error)' }}>
                                    {formatCOP(total - Number(initialPayment))}
                                </span>
                            </div>
                        )}
                        {selectedItems.length > 0 && (
                            <p className="text-xs p-2.5 rounded-lg" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                Los productos entran al inventario y se recalcula su costo promedio.
                                {paymentMethod === 'credit' && ' La deuda queda registrada con el proveedor.'}
                            </p>
                        )}
                        <button
                            disabled={!canSubmit}
                            onClick={onSubmit}
                            className="toul-btn-primary w-full flex items-center justify-center gap-2"
                            style={{ background: 'var(--toul-accent)', boxShadow: canSubmit ? '0 4px 16px rgba(16,185,129,0.3)' : 'none' }}>
                            {saving ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    Registrando...
                                </span>
                            ) : (
                                <>Finalizar Compra <CheckCircle2 size={18} /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
