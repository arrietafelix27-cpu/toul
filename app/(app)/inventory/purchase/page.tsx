'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Package, CreditCard, CheckCircle2, Navigation, Trash2, Plus, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Product, Provider } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, t } from '@/lib/motion'
import toast from 'react-hot-toast'

export default function NewPurchaseFlow() {
    const supabase = createClient()
    const router = useRouter()

    // Global context
    const [storeId, setStoreId] = useState<string | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [providers, setProviders] = useState<Provider[]>([])
    const [cashWallets, setCashWallets] = useState<{ id: string, name: string }[]>([])
    const [loading, setLoading] = useState(true)

    // Flow state
    const [step, setStep] = useState<1 | 2 | 3>(1)

    // Step 1: Items
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'A-Z' | 'Stock' | 'Recientes'>('Recientes')
    const [selectedItems, setSelectedItems] = useState<{ product: Product, quantity: string, cost: string }[]>([])

    // Step 2: Payment
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit' | 'capital'>('cash')
    const [selectedCashWallet, setSelectedCashWallet] = useState<string>('')
    const [initialPayment, setInitialPayment] = useState<string>('')
    const [initialPaymentMethod, setInitialPaymentMethod] = useState<'cash' | 'capital'>('cash')
    const [selectedProviderId, setSelectedProviderId] = useState<string>('')
    const [dueDate, setDueDate] = useState<string>('')

    // Step 3: Confirmation
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return
            setStoreId(store.id)

            const [prodRes, provRes, walletsRes] = await Promise.all([
                supabase.from('products').select('*').eq('store_id', store.id).order('name'),
                supabase.from('providers').select('*').eq('store_id', store.id).order('name'),
                supabase.from('payment_methods').select('id, name').eq('store_id', store.id).eq('is_active', true).order('sort_order')
            ])

            if (prodRes.data) setProducts(prodRes.data)
            if (provRes.data) setProviders(provRes.data)
            if (walletsRes.data) setCashWallets(walletsRes.data)

            // Auto-select first wallet if available
            if (walletsRes.data && walletsRes.data.length > 0) {
                setSelectedCashWallet(walletsRes.data[0].id)
            }

            setLoading(false)
        }
        load()
    }, [supabase])

    const sortedProducts = [...products].sort((a, b) => {
        if (sortBy === 'A-Z') return a.name.localeCompare(b.name)
        if (sortBy === 'Stock') return a.stock - b.stock // Lowest stock first for easy restocking
        if (sortBy === 'Recientes') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        return 0
    })

    const productsToShow = sortedProducts.filter(p =>
        searchQuery === '' ? true : (
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.reference && p.reference.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    ).slice(0, searchQuery ? 20 : 10) // Show top 10 default, or up to 20 when searching

    const addItem = (product: Product) => {
        if (selectedItems.find(i => i.product.id === product.id)) return
        setSelectedItems([...selectedItems, { product, quantity: '1', cost: String(product.cpp || product.cost_price || 0) }])
        setSearchQuery('')
    }

    const updateItem = (id: string, field: 'quantity' | 'cost', value: string) => {
        setSelectedItems(items => items.map(item =>
            item.product.id === id ? { ...item, [field]: value } : item
        ))
    }

    const removeItem = (id: string) => {
        setSelectedItems(items => items.filter(i => i.product.id !== id))
    }

    const subtotal = selectedItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.cost)), 0)
    const total = subtotal // Add tax logic here if needed in future

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6">
                <button onClick={() => step > 1 ? setStep(step - 1 as 1 | 2) : router.push('/inventory')}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1">
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>
                        Paso {step} de 3
                    </p>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>
                        {step === 1 ? 'Seleccionar Productos' : step === 2 ? 'Pago y Proveedor' : 'Resumen de Compra'}
                    </h1>
                </div>
            </motion.div>

            {loading ? (
                <div className="animate-pulse space-y-4">
                    <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded-xl" />
                    <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    {/* STEP 1: SELECT ITEMS */}
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            {/* Search and Sort Options */}
                            <div className="flex flex-col gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--toul-text-muted)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto para agregar..."
                                        className="toul-input w-full pl-10"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    <span className="text-xs font-semibold whitespace-nowrap pl-1" style={{ color: 'var(--toul-text-subtle)' }}>Ordenar por:</span>
                                    {['A-Z', 'Stock', 'Recientes'].map(opt => (
                                        <button key={opt}
                                            onClick={() => setSortBy(opt as any)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${sortBy === opt ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Product List */}
                            <div className="toul-card overflow-hidden max-h-[350px] overflow-y-auto">
                                {productsToShow.map(product => (
                                    <button key={product.id} onClick={() => addItem(product)}
                                        className="w-full p-3 text-left flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900 border-b last:border-0 transition-colors"
                                        style={{ borderColor: 'var(--toul-border)' }}>
                                        <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                            <p className="text-xs truncate flex gap-2" style={{ color: 'var(--toul-text-subtle)' }}>
                                                <span>Stock: {product.stock}</span>
                                                <span className="opacity-50">•</span>
                                                <span>Costo: {formatCOP(product.cpp)}</span>
                                            </p>
                                        </div>
                                        <Plus size={18} style={{ color: 'var(--toul-accent)' }} />
                                    </button>
                                ))}
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
                                    <div key={item.product.id} className="toul-card p-3">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                    {item.product.image_url ? <img src={item.product.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} />}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>{item.product.name}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => removeItem(item.product.id)} className="p-1 rounded-md" style={{ color: 'var(--toul-error)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Cantidad</label>
                                                <input type="number" min="1" value={item.quantity} onChange={e => updateItem(item.product.id, 'quantity', e.target.value)}
                                                    className="toul-input w-full py-1.5 min-h-[36px] text-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Costo Unit. (COP)</label>
                                                <input type="number" min="0" value={item.cost} onChange={e => updateItem(item.product.id, 'cost', e.target.value)}
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

                    {/* STEP 2: PAYMENT & PROVIDER */}
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

                                    {/* Specific Wallet Selection */}
                                    {paymentMethod === 'cash' && (
                                        <div className="pl-4 border-l-2 ml-4 mb-4" style={{ borderColor: 'var(--toul-accent)' }}>
                                            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                                                Seleccionar cartera específica:
                                            </label>
                                            <select
                                                className="toul-input w-full"
                                                value={selectedCashWallet}
                                                onChange={(e) => setSelectedCashWallet(e.target.value)}
                                            >
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
                                    style={{ borderColor: paymentMethod === 'capital' ? '#6366f1' : 'var(--toul-border)', '--tw-ring-color': '#6366f1' } as any}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                                            <CreditCard size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>Capital Propio</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Dinero de tu bolsillo, no del negocio</p>
                                        </div>
                                    </div>
                                    {paymentMethod === 'capital' && <CheckCircle2 size={20} style={{ color: '#6366f1' }} />}
                                </button>

                                <button onClick={() => setPaymentMethod('credit')}
                                    className={`w-full toul-card p-4 flex items-center justify-between transition-all ${paymentMethod === 'credit' ? 'ring-2' : ''}`}
                                    style={{ borderColor: paymentMethod === 'credit' ? '#F59E0B' : 'var(--toul-border)', '--tw-ring-color': '#F59E0B' } as any}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                                            <Package size={20} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>A Crédito</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Genera deuda con un proveedor</p>
                                        </div>
                                    </div>
                                    {paymentMethod === 'credit' && <CheckCircle2 size={20} style={{ color: '#F59E0B' }} />}
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
                                        required={paymentMethod === 'credit'}
                                    >
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
                                                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${initialPaymentMethod === 'cash' ? 'bg-emerald-50 text-emerald-700 border-emerald-500 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-transparent text-gray-500 border-gray-200 dark:border-gray-800'}`}>
                                                        Billetera Negocio
                                                    </button>
                                                    <button onClick={() => setInitialPaymentMethod('capital')}
                                                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all border ${initialPaymentMethod === 'capital' ? 'bg-indigo-50 text-indigo-700 border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-transparent text-gray-500 border-gray-200 dark:border-gray-800'}`}>
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
                                                            onChange={(e) => setSelectedCashWallet(e.target.value)}
                                                        >
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

                            {/* Next Button */}
                            <button
                                disabled={paymentMethod === 'credit' && (!selectedProviderId || !dueDate)}
                                onClick={() => setStep(3)}
                                className="toul-btn-primary w-full mt-6 flex items-center justify-center gap-2">
                                Revisar resumen <Navigation size={18} />
                            </button>
                        </motion.div>
                    )}

                    {/* STEP 3: SUMMARY & CONFIRM */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            <div className="toul-card overflow-hidden">
                                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-b flex justify-between items-center" style={{ borderColor: 'var(--toul-border)' }}>
                                    <span className="font-medium text-sm" style={{ color: 'var(--toul-text-muted)' }}>Monto de la compra</span>
                                    <span className="font-bold text-xl" style={{ color: 'var(--toul-text)' }}>{formatCOP(total)}</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Método</span>
                                        <span className="font-medium text-right" style={{ color: 'var(--toul-text)' }}>
                                            {paymentMethod === 'cash' ?
                                                `Billetera (${cashWallets.find(w => w.id === selectedCashWallet)?.name || 'Sin nombre'})`
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
                                                <span style={{ color: 'var(--toul-text-muted)' }}>Abono Inicial ({initialPaymentMethod === 'cash' ? `Billetera (${cashWallets.find(w => w.id === selectedCashWallet)?.name || 'Sin nombre'})` : 'Capital'})</span>
                                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
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
                                            {selectedItems.length} items
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Informative alerts */}
                            {paymentMethod === 'cash' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                    Confirmar esta compra registrará un <strong>egreso</strong> en la caja de {formatCOP(total)}.
                                </div>
                            )}
                            {paymentMethod === 'capital' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                                    Se registrará una <strong>inyección de capital propio</strong>. El saldo de tu caja no se verá afectado.
                                </div>
                            )}
                            {paymentMethod === 'credit' && Number(initialPayment) > 0 && initialPaymentMethod === 'cash' && (
                                <div className="p-4 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                    El abono inicial registrará un <strong>egreso</strong> en la caja de {formatCOP(Number(initialPayment))}.
                                </div>
                            )}

                            {/* Submit Button */}
                            <button
                                disabled={saving}
                                onClick={async () => {
                                    setSaving(true)
                                    try {
                                        // Prepare payments array based on selected method
                                        const paymentsPayload: any[] = []

                                        if (paymentMethod === 'cash') {
                                            const wallet = cashWallets.find(w => w.id === selectedCashWallet)
                                            paymentsPayload.push({
                                                methodId: selectedCashWallet,
                                                methodName: wallet?.name || '',
                                                amount: total,
                                                isCapital: false
                                            })
                                        } else if (paymentMethod === 'capital') {
                                            paymentsPayload.push({
                                                methodId: null,
                                                methodName: 'Capital Propio',
                                                amount: total,
                                                isCapital: true
                                            })
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
                                }}
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
            )
            }
        </div >
    )
}
