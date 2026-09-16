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
    cashWallets: { id: string; name: string }[]
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
    paymentMethod: 'cash' | 'credit' | 'capital'
    setPaymentMethod: (v: 'cash' | 'credit' | 'capital') => void
    selectedCashWallet: string
    setSelectedCashWallet: (v: string) => void
    initialPayment: string
    setInitialPayment: (v: string) => void
    initialPaymentMethod: 'cash' | 'capital'
    setInitialPaymentMethod: (v: 'cash' | 'capital') => void
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
    products, variantsByProduct, providers, cashWallets,
    selectedItems, addItem, updateItem, removeItem,
    expandedInPicker, toggleExpand, searchQuery, setSearchQuery, sortBy, setSortBy,
    paymentMethod, setPaymentMethod, selectedCashWallet, setSelectedCashWallet,
    initialPayment, setInitialPayment, initialPaymentMethod, setInitialPaymentMethod,
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

                    {/* Payment method */}
                    <div className="toul-card p-5 space-y-3">
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>¿De dónde saldrá el dinero?</p>

                        {/* Cash */}
                        <button onClick={() => setPaymentMethod('cash')}
                            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all border ${paymentMethod === 'cash' ? 'ring-2' : ''}`}
                            style={{
                                background: paymentMethod === 'cash' ? 'rgba(74,222,128,0.06)' : 'var(--toul-surface-2)',
                                borderColor: paymentMethod === 'cash' ? 'var(--toul-accent)' : 'transparent',
                                '--tw-ring-color': 'var(--toul-accent)',
                            } as any}>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                                <CreditCard size={16} />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>Billetera del Negocio</p>
                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Nequi, Efectivo, Bancolombia...</p>
                            </div>
                            {paymentMethod === 'cash' && <CheckCircle2 size={16} style={{ color: 'var(--toul-accent)' }} />}
                        </button>

                        {paymentMethod === 'cash' && (
                            <div className="pl-3 border-l-2" style={{ borderColor: 'var(--toul-accent)' }}>
                                <select className="toul-input w-full text-sm"
                                    value={selectedCashWallet}
                                    onChange={(e) => setSelectedCashWallet(e.target.value)}>
                                    {cashWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    {cashWallets.length === 0 && <option value="" disabled>No hay carteras</option>}
                                </select>
                            </div>
                        )}

                        {/* Capital */}
                        <button onClick={() => setPaymentMethod('capital')}
                            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all border ${paymentMethod === 'capital' ? 'ring-2' : ''}`}
                            style={{
                                background: paymentMethod === 'capital' ? 'rgba(59,130,246,0.06)' : 'var(--toul-surface-2)',
                                borderColor: paymentMethod === 'capital' ? 'var(--toul-info)' : 'transparent',
                                '--tw-ring-color': 'var(--toul-info)',
                            } as any}>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--toul-info)' }}>
                                <CreditCard size={16} />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>Capital Propio</p>
                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Dinero de tu bolsillo</p>
                            </div>
                            {paymentMethod === 'capital' && <CheckCircle2 size={16} style={{ color: 'var(--toul-info)' }} />}
                        </button>

                        {/* Credit */}
                        <button onClick={() => setPaymentMethod('credit')}
                            className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all border ${paymentMethod === 'credit' ? 'ring-2' : ''}`}
                            style={{
                                background: paymentMethod === 'credit' ? 'rgba(245,158,11,0.06)' : 'var(--toul-surface-2)',
                                borderColor: paymentMethod === 'credit' ? 'var(--toul-warning)' : 'transparent',
                                '--tw-ring-color': 'var(--toul-warning)',
                            } as any}>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'var(--toul-warning-dim)', color: 'var(--toul-warning)' }}>
                                <Package size={16} />
                            </div>
                            <div className="flex-1 text-left">
                                <p className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>A Crédito</p>
                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Genera deuda con proveedor</p>
                            </div>
                            {paymentMethod === 'credit' && <CheckCircle2 size={16} style={{ color: 'var(--toul-warning)' }} />}
                        </button>
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
                                {Number(initialPayment) > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>¿De dónde sale el abono?</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => setInitialPaymentMethod('cash')}
                                                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border"
                                                style={{
                                                    background: initialPaymentMethod === 'cash' ? 'var(--toul-accent-dim)' : 'transparent',
                                                    color: initialPaymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                                    borderColor: initialPaymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-border)',
                                                }}>
                                                Billetera
                                            </button>
                                            <button onClick={() => setInitialPaymentMethod('capital')}
                                                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border"
                                                style={{
                                                    background: initialPaymentMethod === 'capital' ? 'rgba(59,130,246,0.12)' : 'transparent',
                                                    color: initialPaymentMethod === 'capital' ? 'var(--toul-info)' : 'var(--toul-text-muted)',
                                                    borderColor: initialPaymentMethod === 'capital' ? 'var(--toul-info)' : 'var(--toul-border)',
                                                }}>
                                                Capital
                                            </button>
                                        </div>
                                        {initialPaymentMethod === 'cash' && (
                                            <select className="toul-input w-full mt-2 text-sm"
                                                value={selectedCashWallet}
                                                onChange={(e) => setSelectedCashWallet(e.target.value)}>
                                                {cashWallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                )}
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
                        {/* Context alert */}
                        {paymentMethod === 'cash' && selectedItems.length > 0 && (
                            <p className="text-xs p-2.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--toul-error)' }}>
                                Se registrará un <strong>egreso</strong> de {formatCOP(total)} en tu caja.
                            </p>
                        )}
                        {paymentMethod === 'capital' && selectedItems.length > 0 && (
                            <p className="text-xs p-2.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--toul-info)' }}>
                                Se registrará como <strong>capital propio</strong>. Tu caja no se verá afectada.
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
