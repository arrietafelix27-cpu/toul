'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, Package, CreditCard, CheckCircle2, Navigation,
    Trash2, Plus, Search, Layers, ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Product, Provider } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, t } from '@/lib/motion'
import toast from 'react-hot-toast'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { DesktopPurchase } from '@/components/inventory/DesktopPurchase'

// ─── Types ───────────────────────────────────────────────────

type Variant = { id: string; product_id: string; name: string; sale_price: number; cpp: number }

type SelectedItem = {
    itemKey: string          // `${productId}:${variantId ?? ''}`
    product: Product
    variantId?: string
    variantName?: string
    quantity: string
    cost: string
}

// ─── Page ────────────────────────────────────────────────────

export default function NewPurchaseFlow() {
    const supabase = createClient()
    const router = useRouter()

    // Global context
    const [storeId, setStoreId] = useState<string | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [variantsByProduct, setVariantsByProduct] = useState<Record<string, Variant[]>>({})
    const [providers, setProviders] = useState<Provider[]>([])
    const [cashWallets, setCashWallets] = useState<{ id: string, name: string }[]>([])
    const [loading, setLoading] = useState(true)

    // Flow state
    const [step, setStep] = useState<1 | 2 | 3>(1)

    // Step 1: Items
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'A-Z' | 'Stock' | 'Recientes'>('Recientes')
    const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
    const [expandedInPicker, setExpandedInPicker] = useState<Set<string>>(new Set())

    // Step 2: Payment
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'capital'>('cash')
    const [selectedCashWallet, setSelectedCashWallet] = useState<string>('')
    const [initialPayment, setInitialPayment] = useState<string>('')
    const [initialPaymentMethod, setInitialPaymentMethod] = useState<'cash' | 'capital'>('cash')
    const [selectedProviderId, setSelectedProviderId] = useState<string>('')
    const [dueDate, setDueDate] = useState<string>('')

    // Step 3: Confirmation
    const [saving, setSaving] = useState(false)
    const isMobile = useIsMobile()

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return
            setStoreId(store.id)

            const [prodRes, provRes, walletsRes, variantsRes] = await Promise.all([
                supabase.from('products').select('*').eq('store_id', store.id).order('name'),
                supabase.from('providers').select('*').eq('store_id', store.id).order('name'),
                supabase.from('payment_methods').select('id, name').eq('store_id', store.id).eq('is_active', true).order('sort_order'),
                supabase.from('product_variants').select('id, product_id, name, sale_price, cpp').eq('store_id', store.id).eq('is_active', true).order('name'),
            ])

            if (prodRes.data) setProducts(prodRes.data)
            if (provRes.data) setProviders(provRes.data)
            if (walletsRes.data) setCashWallets(walletsRes.data)

            if (variantsRes.data) {
                const grouped: Record<string, Variant[]> = {}
                for (const v of variantsRes.data) {
                    if (!grouped[v.product_id]) grouped[v.product_id] = []
                    grouped[v.product_id].push(v)
                }
                setVariantsByProduct(grouped)
            }

            if (walletsRes.data && walletsRes.data.length > 0) {
                setSelectedCashWallet(walletsRes.data[0].id)
            }

            setLoading(false)
        }
        load()
    }, [supabase])

    const sortedProducts = [...products].sort((a, b) => {
        if (sortBy === 'A-Z') return a.name.localeCompare(b.name)
        if (sortBy === 'Stock') return a.stock - b.stock
        if (sortBy === 'Recientes') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return 0
    })

    const productsToShow = sortedProducts.filter(p =>
        searchQuery === '' ? true : (
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.reference && p.reference.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    ).slice(0, searchQuery ? 20 : 10)

    const toggleExpand = (productId: string) => {
        setExpandedInPicker(prev => {
            const next = new Set(prev)
            next.has(productId) ? next.delete(productId) : next.add(productId)
            return next
        })
    }

    const addItem = (product: Product, variantId?: string, variantName?: string) => {
        const itemKey = `${product.id}:${variantId ?? ''}`
        if (selectedItems.find(i => i.itemKey === itemKey)) return
        const defaultCost = variantId
            ? (variantsByProduct[product.id]?.find(v => v.id === variantId)?.cpp ?? product.cpp)
            : (product.cpp || product.cost_price || 0)
        setSelectedItems(prev => [...prev, { itemKey, product, variantId, variantName, quantity: '1', cost: String(defaultCost) }])
        setSearchQuery('')
    }

    const updateItem = (itemKey: string, field: 'quantity' | 'cost', value: string) => {
        setSelectedItems(items => items.map(item =>
            item.itemKey === itemKey ? { ...item, [field]: value } : item
        ))
    }

    const removeItem = (itemKey: string) => {
        setSelectedItems(items => items.filter(i => i.itemKey !== itemKey))
    }

    const subtotal = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.cost)), 0)
    const total = subtotal

    const handleSubmit = async () => {
        setSaving(true)
        try {
            const paymentsPayload: any[] = []

            if (paymentMethod === 'cash') {
                const wallet = cashWallets.find(w => w.id === selectedCashWallet)
                paymentsPayload.push({ methodId: selectedCashWallet, methodName: wallet?.name || '', amount: total, isCapital: false })
            } else if (paymentMethod === 'capital') {
                paymentsPayload.push({ methodId: null, methodName: 'Capital Propio', amount: total, isCapital: true })
            } else if (paymentMethod === 'credit') {
                const initialAmt = Number(initialPayment)
                if (initialAmt > 0) {
                    const wallet = cashWallets.find(w => w.id === selectedCashWallet)
                    paymentsPayload.push({
                        methodId: initialPaymentMethod === 'cash' ? selectedCashWallet : null,
                        methodName: initialPaymentMethod === 'cash' ? wallet?.name : 'Capital Propio',
                        amount: initialAmt,
                        isCapital: initialPaymentMethod === 'capital'
                    })
                }
            }

            const response = await fetch('/api/purchases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId: selectedProviderId,
                    subtotal,
                    total,
                    isCredit: paymentMethod === 'credit',
                    dueDate: dueDate ? new Date(dueDate).toISOString() : null,
                    payments: paymentsPayload,
                    items: selectedItems.map(item => ({
                        productId: item.product.id,
                        variantId: item.variantId ?? null,
                        quantity: Number(item.quantity),
                        unitCost: Number(item.cost)
                    }))
                })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Error al procesar la compra')

            toast.success('Compra registrada con éxito!')
            router.push('/inventory')
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al registrar la compra')
            setSaving(false)
        }
    }

    if (!isMobile) {
        if (loading) return (
            <div className="px-8 pt-6 pb-8 max-w-6xl mx-auto animate-pulse space-y-6">
                <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                <div className="grid gap-8" style={{ gridTemplateColumns: '1fr 380px' }}>
                    <div className="space-y-4">
                        <div className="h-12 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                        <div className="h-72 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                    </div>
                    <div className="h-80 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                </div>
            </div>
        )
        return (
            <DesktopPurchase
                products={products}
                variantsByProduct={variantsByProduct}
                providers={providers}
                cashWallets={cashWallets}
                selectedItems={selectedItems}
                addItem={addItem}
                updateItem={updateItem}
                removeItem={removeItem}
                expandedInPicker={expandedInPicker}
                toggleExpand={toggleExpand}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortBy={sortBy}
                setSortBy={setSortBy}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                selectedCashWallet={selectedCashWallet}
                setSelectedCashWallet={setSelectedCashWallet}
                initialPayment={initialPayment}
                setInitialPayment={setInitialPayment}
                initialPaymentMethod={initialPaymentMethod}
                setInitialPaymentMethod={setInitialPaymentMethod}
                selectedProviderId={selectedProviderId}
                setSelectedProviderId={setSelectedProviderId}
                dueDate={dueDate}
                setDueDate={setDueDate}
                subtotal={subtotal}
                total={total}
                saving={saving}
                onSubmit={handleSubmit}
            />
        )
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6" style={{ position: 'relative' }}>
                <button onClick={() => step > 1 ? setStep(step - 1 as 1 | 2) : router.push('/inventory')}
                    className="flex items-center justify-center transition-all active:scale-90"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                        border: 'none',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </button>
                <div className="flex-1">
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px 0' }}>
                        Paso {step} de 3
                    </p>
                    <h1 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>
                        {step === 1 ? 'Seleccionar productos' : step === 2 ? 'Pago y proveedor' : 'Resumen de compra'}
                    </h1>
                </div>
            </motion.div>

            {loading ? (
                <div className="animate-pulse space-y-4">
                    <div className="h-12 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                    <div className="h-32 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                </div>
            ) : (
                <AnimatePresence mode="wait">

                    {/* ── STEP 1: SELECT ITEMS ─────────────────────────────── */}
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            {/* Search and Sort */}
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
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    <span className="text-xs font-semibold whitespace-nowrap pl-1" style={{ color: 'var(--toul-text-subtle)' }}>Ordenar por:</span>
                                    {(['A-Z', 'Stock', 'Recientes'] as const).map(opt => (
                                        <button key={opt}
                                            onClick={() => setSortBy(opt)}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all"
                                            style={{
                                                background: sortBy === opt ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
                                                color: sortBy === opt ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                            }}>
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Product List */}
                            <div className="toul-card overflow-hidden max-h-[400px] overflow-y-auto">
                                {productsToShow.map(product => {
                                    const productVariants = variantsByProduct[product.id]
                                    const hasVariants = productVariants && productVariants.length > 0
                                    const isExpanded = expandedInPicker.has(product.id)

                                    return (
                                        <div key={product.id} className="border-b last:border-0" style={{ borderColor: 'var(--toul-border)' }}>
                                            {/* Product row */}
                                            <button
                                                onClick={() => hasVariants ? toggleExpand(product.id) : addItem(product)}
                                                className="w-full p-3 text-left flex items-center gap-3 transition-all active:scale-[0.99]">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                                    style={{ background: 'var(--toul-surface-2)' }}>
                                                    {(product.images?.[0] || product.image_url)
                                                        ? <img src={product.images?.[0] ?? product.image_url!} alt="" className="w-full h-full object-cover" />
                                                        : <Package size={16} style={{ color: 'var(--toul-text-muted)' }} />
                                                    }
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <p className="text-sm font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                                        {hasVariants && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                                                                style={{ background: 'rgba(50,215,75,0.12)', color: 'var(--toul-accent)' }}>
                                                                <Layers size={10} className="inline mr-0.5" />
                                                                {productVariants.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs flex gap-2" style={{ color: 'var(--toul-text-subtle)' }}>
                                                        <span>Stock: {product.stock}</span>
                                                        <span className="opacity-40">•</span>
                                                        <span>Costo: {formatCOP(product.cpp)}</span>
                                                    </p>
                                                </div>
                                                {hasVariants ? (
                                                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                        <ChevronRight size={18} style={{ color: 'var(--toul-text-muted)' }} />
                                                    </motion.div>
                                                ) : (
                                                    <Plus size={18} style={{ color: 'var(--toul-accent)' }} />
                                                )}
                                            </button>

                                            {/* Variant sub-rows */}
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
                                                                        className="w-full px-4 py-2.5 flex items-center gap-3 transition-all active:scale-[0.99]"
                                                                        style={{ opacity: alreadyAdded ? 0.45 : 1 }}>
                                                                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--toul-text-muted)' }} />
                                                                        <div className="flex-1 min-w-0 text-left">
                                                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--toul-text)' }}>{v.name}</p>
                                                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Costo: {formatCOP(v.cpp)}</p>
                                                                        </div>
                                                                        {alreadyAdded
                                                                            ? <CheckCircle2 size={16} style={{ color: 'var(--toul-accent)' }} />
                                                                            : <Plus size={16} style={{ color: 'var(--toul-accent)' }} />
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
                                    <div className="p-8 flex flex-col items-center text-center">
                                        <Package size={32} className="mb-2 opacity-20" />
                                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text-muted)' }}>No hay resultados</p>
                                    </div>
                                )}
                            </div>

                            {/* Selected Items */}
                            <div className="space-y-3">
                                {selectedItems.map(item => (
                                    <div key={item.itemKey} className="toul-card p-3">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                                    style={{ background: 'var(--toul-surface-2)' }}>
                                                    {(item.product.images?.[0] || item.product.image_url)
                                                        ? <img src={item.product.images?.[0] ?? item.product.image_url!} alt="" className="w-full h-full object-cover" />
                                                        : <Package size={16} style={{ color: 'var(--toul-text-muted)' }} />
                                                    }
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>{item.product.name}</p>
                                                    {item.variantName && (
                                                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--toul-accent)' }}>{item.variantName}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => removeItem(item.itemKey)} className="p-1 rounded-md" style={{ color: 'var(--toul-error)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Cantidad</label>
                                                <input type="number" min="1" value={item.quantity}
                                                    onChange={e => updateItem(item.itemKey, 'quantity', e.target.value)}
                                                    className="toul-input w-full py-1.5 min-h-[36px] text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Costo unitario</label>
                                                <input type="number" min="0" value={item.cost}
                                                    onChange={e => updateItem(item.itemKey, 'cost', e.target.value)}
                                                    className="toul-input w-full py-1.5 min-h-[36px] text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Subtotal */}
                            {selectedItems.length > 0 && (
                                <div className="toul-card p-4 mt-6">
                                    <div className="flex justify-between items-center">
                                        <span className="font-medium text-sm" style={{ color: 'var(--toul-text)' }}>Total a Pagar</span>
                                        <span className="font-bold text-xl" style={{ color: 'var(--toul-accent)' }}>{formatCOP(total)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Next Button */}
                            <button
                                disabled={selectedItems.length === 0}
                                onClick={() => setStep(2)}
                                className="toul-btn-primary w-full mt-6 flex items-center justify-center gap-2">
                                Siguiente paso <Navigation size={18} />
                            </button>
                        </motion.div>
                    )}

                    {/* ── STEP 2: PAYMENT & PROVIDER ───────────────────────── */}
                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            <div className="space-y-3">
                                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>¿De dónde saldrá el dinero?</label>

                                <div className="space-y-2">
                                    <button onClick={() => setPaymentMethod('cash')}
                                        className={`w-full toul-card p-4 flex items-center justify-between transition-all ${paymentMethod === 'cash' ? 'ring-2' : ''}`}
                                        style={{ borderColor: paymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-border)', '--tw-ring-color': 'var(--toul-accent)' } as any}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                                                <CreditCard size={20} />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>Billetera del Negocio</p>
                                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Bancolombia, Nequi, Efectivo...</p>
                                            </div>
                                        </div>
                                        {paymentMethod === 'cash' && <CheckCircle2 size={20} style={{ color: 'var(--toul-accent)' }} />}
                                    </button>

                                    {paymentMethod === 'cash' && (
                                        <div className="pl-4 border-l-2 ml-4 mb-4" style={{ borderColor: 'var(--toul-accent)' }}>
                                            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                                                Seleccionar cartera específica:
                                            </label>
                                            <select
                                                className="toul-input w-full"
                                                value={selectedCashWallet}
                                                onChange={(e) => setSelectedCashWallet(e.target.value)}>
                                                {cashWallets.map(wallet => (
                                                    <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                                                ))}
                                                {cashWallets.length === 0 && (
                                                    <option value="" disabled>No hay carteras (crea una en Caja)</option>
                                                )}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <button onClick={() => setPaymentMethod('capital')}
                                    className={`w-full toul-card p-4 flex items-center justify-between transition-all ${paymentMethod === 'capital' ? 'ring-2' : ''}`}
                                    style={{ borderColor: paymentMethod === 'capital' ? 'var(--toul-info)' : 'var(--toul-border)', '--tw-ring-color': 'var(--toul-info)' } as any}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--toul-info)' }}>
                                            <CreditCard size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>Capital Propio</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Dinero de tu bolsillo, no del negocio</p>
                                        </div>
                                    </div>
                                    {paymentMethod === 'capital' && <CheckCircle2 size={20} style={{ color: 'var(--toul-info)' }} />}
                                </button>

                                <button onClick={() => setPaymentMethod('credit')}
                                    className={`w-full toul-card p-4 flex items-center justify-between transition-all ${paymentMethod === 'credit' ? 'ring-2' : ''}`}
                                    style={{ borderColor: paymentMethod === 'credit' ? 'var(--toul-warning)' : 'var(--toul-border)', '--tw-ring-color': 'var(--toul-warning)' } as any}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-warning-dim)', color: 'var(--toul-warning)' }}>
                                            <Package size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>A Crédito</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Genera deuda con un proveedor</p>
                                        </div>
                                    </div>
                                    {paymentMethod === 'credit' && <CheckCircle2 size={20} style={{ color: 'var(--toul-warning)' }} />}
                                </button>
                            </div>

                            <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                        Proveedor {paymentMethod === 'credit' && <span style={{ color: 'var(--toul-error)' }}>*</span>}
                                    </label>
                                    <select
                                        className="toul-input w-full"
                                        value={selectedProviderId}
                                        onChange={(e) => setSelectedProviderId(e.target.value)}
                                        required={paymentMethod === 'credit'}>
                                        <option value="">Selecciona un proveedor (opcional)</option>
                                        {providers.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {paymentMethod === 'credit' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                                Abono Inicial <span className="text-xs font-normal" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                className="toul-input w-full"
                                                placeholder="Ej. 50000"
                                                value={initialPayment}
                                                onChange={(e) => setInitialPayment(e.target.value)}
                                            />
                                        </div>
                                        {Number(initialPayment) > 0 && (
                                            <div>
                                                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                                    ¿De dónde sale el abono?
                                                </label>
                                                <div className="flex gap-2 mb-3">
                                                    <button onClick={() => setInitialPaymentMethod('cash')}
                                                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border"
                                                        style={{
                                                            background: initialPaymentMethod === 'cash' ? 'var(--toul-accent-dim)' : 'transparent',
                                                            color: initialPaymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                                            borderColor: initialPaymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-border)',
                                                        }}>
                                                        Billetera Negocio
                                                    </button>
                                                    <button onClick={() => setInitialPaymentMethod('capital')}
                                                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border"
                                                        style={{
                                                            background: initialPaymentMethod === 'capital' ? 'rgba(59,130,246,0.12)' : 'transparent',
                                                            color: initialPaymentMethod === 'capital' ? 'var(--toul-info)' : 'var(--toul-text-muted)',
                                                            borderColor: initialPaymentMethod === 'capital' ? 'var(--toul-info)' : 'var(--toul-border)',
                                                        }}>
                                                        Capital Propio
                                                    </button>
                                                </div>
                                                {initialPaymentMethod === 'cash' && (
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                                                            Seleccionar cartera específica:
                                                        </label>
                                                        <select
                                                            className="toul-input w-full"
                                                            value={selectedCashWallet}
                                                            onChange={(e) => setSelectedCashWallet(e.target.value)}>
                                                            {cashWallets.map(wallet => (
                                                                <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                                                            ))}
                                                            {cashWallets.length === 0 && (
                                                                <option value="" disabled>No hay carteras</option>
                                                            )}
                                                        </select>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div>
                                            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                                Fecha de Vencimiento <span style={{ color: 'var(--toul-error)' }}>*</span>
                                            </label>
                                            <input
                                                type="date"
                                                className="toul-input w-full"
                                                value={dueDate}
                                                onChange={(e) => setDueDate(e.target.value)}
                                                min={new Date().toISOString().split('T')[0]}
                                                required
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            <button
                                disabled={paymentMethod === 'credit' && (!selectedProviderId || !dueDate)}
                                onClick={() => setStep(3)}
                                className="toul-btn-primary w-full mt-6 flex items-center justify-center gap-2">
                                Revisar resumen <Navigation size={18} />
                            </button>
                        </motion.div>
                    )}

                    {/* ── STEP 3: SUMMARY & CONFIRM ────────────────────────── */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            <div className="toul-card overflow-hidden">
                                <div className="p-4 border-b flex justify-between items-center"
                                    style={{ background: 'var(--toul-bg)', borderColor: 'var(--toul-border)' }}>
                                    <span className="font-medium text-sm" style={{ color: 'var(--toul-text-muted)' }}>Monto de la compra</span>
                                    <span className="font-bold text-xl" style={{ color: 'var(--toul-text)' }}>{formatCOP(total)}</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Método</span>
                                        <span className="font-medium text-right" style={{ color: 'var(--toul-text)' }}>
                                            {paymentMethod === 'cash'
                                                ? `Billetera (${cashWallets.find(w => w.id === selectedCashWallet)?.name || 'Sin nombre'})`
                                                : paymentMethod === 'credit' ? 'A Crédito' : 'Capital Propio'
                                            }
                                        </span>
                                    </div>
                                    {selectedProviderId && (
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--toul-text-muted)' }}>Proveedor</span>
                                            <span className="font-medium" style={{ color: 'var(--toul-text)' }}>
                                                {providers.find(p => p.id === selectedProviderId)?.name}
                                            </span>
                                        </div>
                                    )}
                                    {paymentMethod === 'credit' && Number(initialPayment) > 0 && (
                                        <>
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: 'var(--toul-text-muted)' }}>
                                                    Abono Inicial ({initialPaymentMethod === 'cash'
                                                        ? `Billetera (${cashWallets.find(w => w.id === selectedCashWallet)?.name || 'Sin nombre'})`
                                                        : 'Capital'})
                                                </span>
                                                <span className="font-medium" style={{ color: 'var(--toul-accent)' }}>
                                                    {formatCOP(Number(initialPayment))}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm font-bold pt-2 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                                <span style={{ color: 'var(--toul-text-muted)' }}>Saldo Pendiente</span>
                                                <span style={{ color: 'var(--toul-error)' }}>
                                                    {formatCOP(total - Number(initialPayment))}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {paymentMethod === 'credit' && dueDate && (
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--toul-text-muted)' }}>Vence</span>
                                            <span className="font-medium" style={{ color: 'var(--toul-error)' }}>
                                                {new Date(dueDate).toLocaleDateString('es-CO')}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm pt-2 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Productos</span>
                                        <span className="font-medium" style={{ color: 'var(--toul-text)' }}>
                                            {selectedItems.length} {selectedItems.length === 1 ? 'ítem' : 'ítems'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {paymentMethod === 'cash' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                    Confirmar esta compra registrará un <strong>egreso</strong> en la caja de {formatCOP(total)}.
                                </div>
                            )}
                            {paymentMethod === 'capital' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--toul-info)' }}>
                                    Se registrará una <strong>inyección de capital propio</strong>. El saldo de tu caja no se verá afectado.
                                </div>
                            )}
                            {paymentMethod === 'credit' && Number(initialPayment) > 0 && initialPaymentMethod === 'cash' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                    El abono inicial registrará un <strong>egreso</strong> en la caja de {formatCOP(Number(initialPayment))}.
                                </div>
                            )}

                            <button
                                disabled={saving}
                                onClick={handleSubmit}
                                className="toul-btn-primary w-full flex items-center justify-center gap-2"
                                style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}>
                                {saving ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Registrando...
                                    </span>
                                ) : (
                                    <>Finalizar Compra <CheckCircle2 size={18} /></>
                                )}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    )
}
