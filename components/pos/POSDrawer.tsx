'use client'

import {
    useState, useEffect, useRef, useCallback, memo, useMemo,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    X, Search, Plus, Minus, ChevronRight, ChevronLeft,
    Check, User, Package, UserPlus, Calendar, Trash2, Wallet, CreditCard, DollarSign, ShoppingCart
} from 'lucide-react'
import type { Product, PaymentMethodConfig, PaymentSplit, Customer } from '@/lib/types'
import { formatCOP } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { usePOS } from './POSContext'

// --- CONSTANTS ---
const TRANSITION_DURATION = 0.18 // 180ms as requested
const slideVariants = {
    enter: (dir: number) => ({ y: dir * 10, opacity: 0 }),
    center: { y: 0, opacity: 1 },
    exit: (dir: number) => ({ y: dir * -10, opacity: 0 }),
}

// --- SUB-COMPONENTS ---

const ProgressIndicator = ({ step }: { step: number }) => (
    <div className="flex items-center justify-between mb-8 px-2 max-w-sm mx-auto">
        {[1, 2, 3].map((s) => (
            <div key={s} className="flex flex-col items-center gap-2 relative flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 z-10 ${step >= s ? 'bg-emerald-500 text-slate-950 scale-110 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-slate-800 text-slate-500'
                    }`}>
                    {step > s ? <Check size={14} strokeWidth={3} /> : s}
                </div>
                <span className={`text-[10px] uppercase tracking-tighter font-bold transition-colors ${step === s ? 'text-emerald-400' : 'text-slate-600'
                    }`}>
                    {s === 1 ? 'Productos' : s === 2 ? 'Pago' : 'Confirmación'}
                </span>
                {s < 3 && (
                    <div className="absolute top-4 left-1/2 w-full h-[2px] bg-slate-800 -z-0">
                        <motion.div
                            className="h-full bg-emerald-500"
                            initial={{ width: '0%' }}
                            animate={{ width: step > s ? '100%' : '0%' }}
                        />
                    </div>
                )}
            </div>
        ))}
    </div>
)

const ProductCard = memo(({ product, qty, onAdd }: { product: Product, qty: number, onAdd: (id: string, max: number) => void }) => {
    const isOutOfStock = product.stock <= 0
    const img = (product.images?.[0] || product.image_url) as string | null

    return (
        <motion.div
            whileTap={{ scale: isOutOfStock ? 1 : 0.98 }}
            onClick={() => !isOutOfStock && onAdd(product.id, product.stock)}
            className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 cursor-pointer ${qty > 0
                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'
                }`}
        >
            <div className="aspect-square w-full bg-slate-800/50 overflow-hidden">
                {img ? (
                    <img
                        src={img}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center opacity-20"><Package size={32} /></div>
                )}
                {qty > 0 && (
                    <div className="absolute top-2 right-2 bg-emerald-500 text-slate-950 font-bold px-2 py-0.5 rounded-lg text-xs shadow-lg">
                        {qty}
                    </div>
                )}
            </div>
            <div className="p-3">
                <h3 className="text-sm font-semibold truncate text-slate-200 mb-0.5">{product.name}</h3>
                <div className="flex justify-between items-end">
                    <p className="text-emerald-400 font-bold text-base">{formatCOP(product.sale_price)}</p>
                    <p className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isOutOfStock ? 'bg-red-500/10 text-red-500' : 'text-slate-500'}`}>
                        {isOutOfStock ? 'Agotado' : `Stock: ${product.stock}`}
                    </p>
                </div>
            </div>
        </motion.div>
    )
})

ProductCard.displayName = 'ProductCard'

// --- MAIN COMPONENT ---

export default function POSDrawer() {
    const { isOpen, closePOS } = usePOS()
    const supabase = createClient()
    const searchRef = useRef<HTMLInputElement>(null)
    const custSearchRef = useRef<HTMLDivElement>(null)

    // Window size for responsive layout
    const [isMobile, setIsMobile] = useState(false)
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    // Data 
    const [products, setProducts] = useState<Product[]>([])
    const [methods, setMethods] = useState<PaymentMethodConfig[]>([])
    const [customersDb, setCustomersDb] = useState<Customer[]>([])
    const [dataReady, setDataReady] = useState(false)

    // Flow State
    const [step, setStep] = useState<1 | 2 | 3>(1)
    const [slideDir, setSlideDir] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [flashGreen, setFlashGreen] = useState(false)
    const [showCreditOverlay, setShowCreditOverlay] = useState(false)

    // Step 1 State: Cart
    const [search, setSearch] = useState('')
    const [cartMap, setCartMap] = useState<Record<string, number>>({})

    // Step 2 State: Sale Conditions
    const [saleType, setSaleType] = useState<'contado' | 'credito'>('contado')
    const [dueDate, setDueDate] = useState('')

    // Step 2 State: Customer
    const [custSearch, setCustSearch] = useState('')
    const [showCustDropdown, setShowCustDropdown] = useState(false)
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [custPhone, setCustPhone] = useState('')

    // Step 2 State: Optional Info
    const [discount, setDiscount] = useState('')
    const [discountType, setDiscountType] = useState<'val' | 'pct'>('val')
    const [saleNote, setSaleNote] = useState('')
    const [initialPayment, setInitialPayment] = useState('')

    // Step 2 State: Multi-wallet Payments
    const [payments, setPayments] = useState<PaymentSplit[]>([])

    // Computed Values
    const cartItems = useMemo(() =>
        Object.entries(cartMap)
            .filter(([, qty]) => qty > 0)
            .map(([id, qty]) => ({ product: products.find(p => p.id === id)!, quantity: qty }))
            .filter(i => i.product),
        [cartMap, products]
    )

    const subtotal = useMemo(() => cartItems.reduce((s, i) => s + i.product.sale_price * i.quantity, 0), [cartItems])

    const discountAmt = useMemo(() => {
        const val = Number(discount) || 0
        if (discountType === 'val') return Math.min(val, subtotal)
        return Math.min(subtotal * (val / 100), subtotal)
    }, [discount, discountType, subtotal])

    const total = Math.max(0, subtotal - discountAmt)
    const paymentsTotal = payments.reduce((s, p) => s + (p.amount || 0), 0)

    const isCredit = saleType === 'credito'
    const abonoTarget = isCredit ? (Number(initialPayment) || 0) : total
    const remaining = abonoTarget - paymentsTotal
    const balanced = Math.abs(remaining) < 1

    // Filters
    const filteredProducts = useMemo(() => {
        const s = search.toLowerCase().trim()
        if (!s) return products
        return products.filter(p => p.name.toLowerCase().includes(s) || p.reference?.toLowerCase().includes(s))
    }, [search, products])

    const filteredCustomers = useMemo(() => {
        if (!custSearch) return customersDb.slice(0, 5)
        return customersDb.filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()))
    }, [custSearch, customersDb])

    const isNewCustomer = custSearch.trim().length > 0 && !selectedCustomer;

    // Load Data
    const loadData = useCallback(async () => {
        if (dataReady) return
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return

            const [{ data: prods }, { data: custs }, methodsRes] = await Promise.all([
                supabase.from('products').select('*').eq('store_id', store.id).eq('is_active', true).order('name'),
                supabase.from('customers').select('*').eq('store_id', store.id).order('name'),
                fetch('/api/payment-methods')
            ])

            const { methods: meths } = await methodsRes.json()
            setProducts((prods || []) as Product[])
            setCustomersDb((custs || []) as Customer[])
            setMethods(meths || [])
            setDataReady(true)
        } catch {
            toast.error('Error cargando inicialización')
        }
    }, [dataReady, supabase])

    // On Open
    useEffect(() => {
        if (isOpen) {
            loadData()
            setTimeout(() => searchRef.current?.focus(), 400)
        } else {
            // Reset everything on close
            setStep(1); setSlideDir(1); setCartMap({}); setSearch(''); setSaleType('contado');
            setCustSearch(''); setSelectedCustomer(null); setCustPhone(''); setInitialPayment('');
            setDiscount(''); setSaleNote(''); setPayments([]); setSuccess(false); setFlashGreen(false);
            setDueDate(''); setShowCreditOverlay(false);
        }
    }, [isOpen, loadData])

    // Sync payments target
    useEffect(() => {
        if (abonoTarget === 0) setPayments([])
        else if (payments.length === 0 && methods.length > 0) {
            setPayments([{ methodId: methods[0].id, methodName: methods[0].name, methodColor: methods[0].color, amount: abonoTarget }])
        } else if (payments.length === 1 && balanced) {
            setPayments([{ ...payments[0], amount: abonoTarget }])
        }
    }, [abonoTarget, methods])

    // Cart Actions
    const onAdd = useCallback((id: string, max: number) => {
        setCartMap(prev => {
            const val = (prev[id] || 0)
            if (val >= max) return prev
            return { ...prev, [id]: val + 1 }
        })
    }, [])

    const onMinus = (id: string) => {
        setCartMap(prev => {
            const next = { ...prev }
            if ((next[id] || 0) <= 1) delete next[id]
            else next[id]--
            return next
        })
    }

    const onRemove = (id: string) => {
        setCartMap(prev => {
            const next = { ...prev }
            delete next[id]
            return next
        })
    }

    // --- POS ACTIONS ---

    async function handleComplete() {
        if (submitting) return
        if (cartItems.length === 0) return toast.error('La venta está vacía')
        if (isCredit) {
            if (!selectedCustomer && !custSearch.trim()) return toast.error('Cliente obligatorio para crédito')
            if (!dueDate) return toast.error('Fecha límite obligatoria')
        }
        if (abonoTarget > 0 && !balanced) return toast.error('Ajusta los montos de pago')

        setSubmitting(true)
        try {
            const payload = {
                cart: cartItems,
                payments: abonoTarget > 0 ? payments : [],
                discount: discountAmt,
                subtotal,
                total,
                isCredit,
                customerId: selectedCustomer?.id || null,
                customerName: isNewCustomer ? custSearch.trim() : (selectedCustomer?.name || null),
                customerPhone: isNewCustomer ? custPhone.trim() : (selectedCustomer?.phone || null),
                dueDate: isCredit ? dueDate : null,
                initialPayment: abonoTarget,
                notes: saleNote.trim() || null
            }

            const res = await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error((await res.json()).error)

            setFlashGreen(true)
            setTimeout(() => setFlashGreen(false), 400)
            setSuccess(true)
        } catch (err: any) {
            toast.error(err.message || 'Error al completar la venta')
        } finally {
            setSubmitting(false)
        }
    }

    // --- SHARED UI MODULES ---

    const TotalsBlock = ({ compact = false }: { compact?: boolean }) => (
        <div className={`space-y-2 ${compact ? '' : 'pt-4 border-t border-slate-800/50'}`}>
            <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span>{formatCOP(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Descuento</span>
                    <button onClick={() => setDiscountType(v => v === 'val' ? 'pct' : 'val')}
                        className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-bold">
                        {discountType === 'val' ? '$' : '%'}
                    </button>
                </div>
                <input type="number" className="bg-transparent text-right font-mono text-emerald-400 outline-none w-20 text-sm"
                    value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            </div>
            <div className="flex justify-between items-end pt-2">
                <span className="font-bold text-slate-400">Total</span>
                <span className={`font-black text-white leading-none ${compact ? 'text-2xl' : 'text-4xl'}`}>
                    {formatCOP(total)}
                </span>
            </div>
        </div>
    )

    const PaymentMethodsSection = () => (
        <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <div className="flex justify-between items-center">
                <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Métodos de pago</label>
                <span className={`text-[10px] font-bold ${balanced ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {balanced ? '✓ Cubierto' : `Restan: ${formatCOP(remaining)}`}
                </span>
            </div>
            <div className="flex flex-wrap gap-2">
                {methods.map(m => {
                    const active = payments.find(p => p.methodId === m.id)
                    return (
                        <button key={m.id}
                            onClick={() => {
                                if (active) {
                                    if (payments.length > 1) setPayments(prev => prev.filter(p => p.methodId !== m.id))
                                } else {
                                    setPayments(prev => [...prev, { methodId: m.id, methodName: m.name, methodColor: m.color, amount: 0 }])
                                }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${active ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700'
                                }`}
                        >
                            {m.name}
                        </button>
                    )
                })}
            </div>
            <div className="space-y-2">
                {payments.map(pay => (
                    <div key={pay.methodId} className="flex items-center gap-3 bg-slate-900/50 border border-slate-800/50 rounded-xl p-2 pr-4">
                        <div className="w-1.5 h-1.5 rounded-full ml-2" style={{ background: pay.methodColor }} />
                        <span className="text-[11px] font-bold text-slate-400 min-w-16">{pay.methodName}</span>
                        <input type="number" className="bg-transparent text-right font-mono text-sm flex-1 outline-none text-white"
                            value={pay.amount || ''} placeholder="0"
                            onChange={e => {
                                const val = Number(e.target.value)
                                setPayments(prev => prev.map(p => p.methodId === pay.methodId ? { ...p, amount: val } : p))
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    )

    // --- WEB LAYOUT (Single Page) ---

    const WebLayout = () => (
        <div className="grid grid-cols-12 h-full gap-8 overflow-hidden">
            {/* LEFT: Product Selection */}
            <div className="col-span-8 flex flex-col h-full overflow-hidden">
                <header className="mb-6">
                    <h2 className="text-3xl font-black text-white tracking-tight">Punto de venta</h2>
                </header>

                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={24} />
                    <input
                        ref={searchRef}
                        className="w-full bg-slate-900 border-2 border-slate-800 focus:border-emerald-500/50 rounded-3xl py-5 pl-14 pr-6 text-xl text-white outline-none transition-all placeholder:text-slate-700 shadow-2xl"
                        placeholder="Buscar producto por nombre o referencia..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 xl:grid-cols-4 lg:grid-cols-3 gap-4 pb-12 hide-scrollbar">
                    {filteredProducts.map(p => (
                        <ProductCard key={p.id} product={p} qty={cartMap[p.id] || 0} onAdd={onAdd} />
                    ))}
                </div>
            </div>

            {/* RIGHT: Live Sale Panel */}
            <div className="col-span-4 bg-slate-900/30 border border-slate-800 rounded-[40px] flex flex-col h-full p-6 shadow-3xl relative overflow-hidden">
                <h4 className="font-black text-white text-lg mb-6 flex items-center gap-2">
                    <ShoppingCart size={20} /> Venta actual
                </h4>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2 hide-scrollbar">
                    {cartItems.map(item => (
                        <div key={item.product.id} className="flex gap-3 group items-center">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold truncate text-slate-200">{item.product.name}</p>
                                <p className="text-[11px] text-slate-500 font-mono">{formatCOP(item.product.sale_price)}</p>
                            </div>
                            <div className="flex items-center gap-2 bg-slate-800/30 rounded-xl p-1 border border-white/5">
                                <button onClick={() => onMinus(item.product.id)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors text-slate-400">
                                    <Minus size={14} />
                                </button>
                                <span className="text-xs font-bold text-white w-5 text-center">{item.quantity}</span>
                                <button onClick={() => onAdd(item.product.id, item.product.stock)}
                                    disabled={item.quantity >= item.product.stock}
                                    className="w-7 h-7 flex items-center justify-center hover:bg-slate-700 rounded-lg transition-colors text-slate-400 disabled:opacity-20">
                                    <Plus size={14} />
                                </button>
                            </div>
                            <button onClick={() => onRemove(item.product.id)} className="w-8 h-8 flex items-center justify-center text-red-500/30 hover:text-red-500 transition-colors">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                    {cartItems.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-4 opacity-40">
                            <Package size={48} />
                            <p className="text-sm italic">Agrega productos para comenzar</p>
                        </div>
                    )}
                </div>

                {/* Footer Inputs and Totals */}
                <div className="mt-auto space-y-4 pt-4 border-white/5">
                    <input className="w-full bg-slate-800/30 border border-slate-800 rounded-xl py-2 px-4 text-xs text-white outline-none placeholder:text-slate-700 transition-all focus:border-slate-600"
                        placeholder="Notas de la venta..." value={saleNote} onChange={e => setSaleNote(e.target.value)} />

                    <TotalsBlock />

                    {/* Type Selector */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800/50 mt-4">
                        <button onClick={() => setSaleType('contado')}
                            className={`py-2 rounded-xl text-xs font-bold transition-all ${saleType === 'contado' ? 'bg-emerald-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                            Contado
                        </button>
                        <button onClick={() => setShowCreditOverlay(true)}
                            className={`py-2 rounded-xl text-xs font-bold transition-all ${saleType === 'credito' ? 'bg-amber-500 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                            {saleType === 'credito' ? '✓ Crédito' : 'Crédito'}
                        </button>
                    </div>

                    {/* Contado Flow Integrated */}
                    {saleType === 'contado' && <PaymentMethodsSection />}

                    {/* Confirm Button */}
                    <button
                        onClick={handleComplete}
                        disabled={cartItems.length === 0 || submitting || (saleType === 'contado' && !balanced)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-20 text-slate-950 font-black tracking-tight py-4 rounded-2xl transition-all shadow-xl flex items-center justify-center gap-2 uppercase text-sm mt-4 active:scale-95"
                    >
                        {submitting ? <div className="w-5 h-5 border-4 border-slate-900/20 border-t-slate-900 rounded-full animate-spin" /> : 'Confirmar venta'}
                    </button>
                </div>

                {/* Credit Overlay Modal */}
                <AnimatePresence>
                    {showCreditOverlay && (
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-slate-950/90 backdrop-blur-md p-6 flex flex-col pt-12"
                        >
                            <button onClick={() => setShowCreditOverlay(false)} className="absolute top-6 right-6 p-2 bg-slate-900 rounded-full text-slate-500"><X size={18} /></button>

                            <h3 className="text-xl font-black text-amber-500 mb-6 flex items-center gap-2">
                                <CreditCard size={20} /> Configurar Crédito
                            </h3>

                            <div className="space-y-6 flex-1 overflow-y-auto hide-scrollbar">
                                {/* Cliente */}
                                <div className="space-y-2" ref={custSearchRef}>
                                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest pl-1">Cliente *</label>
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-white outline-none focus:border-amber-500/50 transition-all text-sm"
                                            placeholder="Buscar o crear cliente..." value={selectedCustomer ? selectedCustomer.name : custSearch}
                                            onChange={e => { setCustSearch(e.target.value); setSelectedCustomer(null); setShowCustDropdown(true); }}
                                            onFocus={() => setShowCustDropdown(true)}
                                        />
                                        <AnimatePresence>
                                            {showCustDropdown && !selectedCustomer && custSearch.trim() && (
                                                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                                    className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl overflow-hidden"
                                                >
                                                    {filteredCustomers.map(c => (
                                                        <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustDropdown(false) }}
                                                            className="w-full text-left px-5 py-3 text-sm hover:bg-slate-800 text-slate-300 flex justify-between items-center border-b border-slate-800/50">
                                                            <span>{c.name}</span>
                                                            <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-500">BD</span>
                                                        </button>
                                                    ))}
                                                    <div className="p-4 bg-amber-500/5 text-amber-400 text-xs font-bold flex items-center gap-2">
                                                        <UserPlus size={14} /> Crear nuevo: "{custSearch}"
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>

                                {/* Fecha */}
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest pl-1">Fecha límite de pago *</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input type="date" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-white outline-none focus:border-amber-500/50 transition-all text-sm"
                                            value={dueDate} onChange={e => setDueDate(e.target.value)} />
                                    </div>
                                </div>

                                {/* Abono */}
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest pl-1">Abono inicial (Opcional)</label>
                                    <input type="number" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 px-5 text-xl font-mono text-white outline-none focus:border-emerald-500/50 transition-all"
                                        placeholder="0" value={initialPayment} onChange={e => setInitialPayment(e.target.value)} />
                                </div>

                                {Number(initialPayment) > 0 && <PaymentMethodsSection />}

                                <div className="pt-4 border-t border-white/5 space-y-2">
                                    <div className="flex justify-between text-xs text-slate-500">
                                        <span>Total:</span> <span>{formatCOP(total)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm font-bold text-amber-400">
                                        <span>Saldo pendiente:</span> <span>{formatCOP(Math.max(0, total - abonoTarget))}</span>
                                    </div>
                                </div>
                            </div>

                            <button onClick={() => { setSaleType('credito'); setShowCreditOverlay(false); }}
                                disabled={(!selectedCustomer && !custSearch.trim()) || !dueDate || (Number(initialPayment) > 0 && !balanced)}
                                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-20 text-slate-950 font-black py-4 rounded-2xl shadow-xl mt-6 uppercase text-sm tracking-tight transition-all active:scale-95"
                            >
                                Confirmar crédito
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )

    // --- MOBILE LAYOUT (Guided Flow) ---

    const MobileLayout = () => {
        const Step1 = () => (
            <div className="flex flex-col h-full overflow-hidden">
                <div className="relative mb-6">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input ref={searchRef} className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-white outline-none"
                        placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-3 pb-24 hide-scrollbar">
                    {filteredProducts.map(p => (
                        <ProductCard key={p.id} product={p} qty={cartMap[p.id] || 0} onAdd={onAdd} />
                    ))}
                </div>
                {cartItems.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950/80 backdrop-blur-md border-t border-white/5 z-50">
                        <button onClick={() => { setSlideDir(1); setStep(2) }} className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl flex items-center justify-between px-6 shadow-2xl">
                            <span className="flex flex-col items-start leading-none">
                                <span className="text-[10px] uppercase opacity-60">Total actual</span>
                                <span className="text-lg">{formatCOP(total)}</span>
                            </span>
                            <span className="flex items-center gap-1 uppercase text-xs">Continuar <ChevronRight size={16} /></span>
                        </button>
                    </div>
                )}
            </div>
        )

        const Step2 = () => (
            <div className="flex flex-col h-full overflow-y-auto hide-scrollbar pb-10 space-y-8">
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900 rounded-2xl border border-slate-800">
                    <button onClick={() => setSaleType('contado')}
                        className={`py-3.5 rounded-xl font-bold text-sm transition-all ${saleType === 'contado' ? 'bg-emerald-500 text-slate-950' : 'text-slate-500'}`}>Contado</button>
                    <button onClick={() => setSaleType('credito')}
                        className={`py-3.5 rounded-xl font-bold text-sm transition-all ${saleType === 'credito' ? 'bg-amber-500 text-slate-950' : 'text-slate-500'}`}>Crédito</button>
                </div>

                <div className="space-y-6">
                    <section className="space-y-4">
                        <label className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Cliente {isCredit && '*'}</label>
                        <div className="relative" ref={custSearchRef}>
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                            <input className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 text-white outline-none"
                                placeholder="..." value={selectedCustomer ? selectedCustomer.name : custSearch}
                                onChange={e => { setCustSearch(e.target.value); setSelectedCustomer(null); setShowCustDropdown(true); }}
                                onFocus={() => setShowCustDropdown(true)}
                            />
                            <AnimatePresence>
                                {showCustDropdown && !selectedCustomer && custSearch.trim() && (
                                    <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl overflow-hidden">
                                        {filteredCustomers.map(c => (
                                            <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustDropdown(false) }}
                                                className="w-full text-left px-5 py-3 text-sm hover:bg-slate-800 text-slate-300 flex justify-between">
                                                <span>{c.name}</span><span className="text-xs opacity-50">BD</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </section>

                    {isCredit && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500">Vence *</label>
                                <input type="date" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3 px-2 text-xs text-white outline-none"
                                    value={dueDate} onChange={e => setDueDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-500">Abono</label>
                                <input type="number" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl py-3 px-2 text-xs text-white outline-none"
                                    value={initialPayment} onChange={e => setInitialPayment(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {(saleType === 'contado' || (isCredit && Number(initialPayment) > 0)) && <PaymentMethodsSection />}
                </div>

                <div className="pt-4 border-t border-white/5">
                    <TotalsBlock compact />
                </div>

                <button onClick={() => { setSlideDir(1); setStep(3) }}
                    disabled={(isCredit && (!selectedCustomer && !custSearch.trim() || !dueDate)) || !balanced}
                    className="w-full bg-emerald-500 text-slate-950 font-black py-4 rounded-2xl uppercase tracking-widest text-sm disabled:opacity-20 transition-all shadow-xl">
                    Continuar resumen
                </button>
            </div>
        )

        const Step3 = () => (
            <div className="flex flex-col h-full overflow-y-auto hide-scrollbar pb-10 space-y-6">
                <header><h2 className="text-xl font-bold text-white tracking-tight">Confirmación</h2></header>

                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-3">
                    {cartItems.map(i => (
                        <div key={i.product.id} className="flex justify-between text-xs">
                            <span className="text-slate-300">{i.quantity}x {i.product.name}</span>
                            <span className="text-slate-500">{formatCOP(i.quantity * i.product.sale_price)}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-emerald-500 rounded-2xl p-6 text-slate-950 shadow-xl">
                    <p className="text-[10px] font-black uppercase opacity-60 mb-1">Monto final</p>
                    <h3 className="text-3xl font-black">{formatCOP(total)}</h3>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500"><span>Cliente:</span><span className="text-white">{selectedCustomer?.name || custSearch || 'Regular'}</span></div>
                    <div className="flex justify-between text-xs text-slate-500"><span>Tipo:</span><span className="text-white capitalize">{saleType}</span></div>
                    {isCredit && <div className="flex justify-between text-xs text-amber-500 font-bold"><span>Vence:</span><span>{dueDate}</span></div>}
                </div>

                <button onClick={handleComplete} disabled={submitting}
                    className="w-full bg-white text-slate-950 font-black py-5 rounded-3xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                    {submitting ? <div className="w-5 h-5 border-4 border-slate-900/20 border-t-slate-900 rounded-full animate-spin" /> : <>Completar venta <Check size={20} /></>}
                </button>
            </div>
        )

        return (
            <div className="h-full flex flex-col pt-2 relative overflow-hidden">
                <ProgressIndicator step={step} />
                <div className="flex-1 relative overflow-hidden">
                    <AnimatePresence mode="wait" custom={slideDir}>
                        <motion.div key={step} custom={slideDir} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: TRANSITION_DURATION }} className="absolute inset-0">
                            {step === 1 ? <Step1 /> : step === 2 ? <Step2 /> : <Step3 />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        )
    }

    // --- MAIN RENDER ---

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center">
                    {/* Phase 2: Context Transition (Dark Overlay) */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.4 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                        onClick={closePOS}
                    />

                    <AnimatePresence>
                        {flashGreen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[110] pointer-events-none bg-emerald-500/20" />}
                    </AnimatePresence>

                    {/* Phase 3: POS Container Appearance ("Born" from bottom) */}
                    <motion.div
                        initial={{ opacity: 0, y: 32, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 32, scale: 0.96 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        style={{ transformOrigin: "bottom center" }}
                        className="relative z-[105] w-full h-[95vh] lg:h-[90vh] lg:max-w-[1240px] bg-slate-950 lg:border border-slate-800 lg:rounded-[40px] rounded-t-[40px] shadow-3xl flex flex-col overflow-hidden"
                    >
                        {/* Drag/Close for mobile */}
                        <div className="lg:hidden h-1.5 w-12 bg-slate-800 rounded-full mx-auto mt-4 mb-2 flex-shrink-0" />

                        {success ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-950">
                                <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                                    className="w-24 h-24 bg-emerald-500 text-slate-950 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl">
                                    <Check size={48} strokeWidth={4} />
                                </motion.div>
                                <h1 className="text-4xl font-black text-white mb-2 tracking-tight">Venta registrada</h1>
                                <p className="text-slate-500 mb-10 max-w-sm">La operación ha sido procesada con éxito.</p>
                                <div className="flex flex-col gap-3 w-full max-w-xs">
                                    <button onClick={() => { setSuccess(false); setStep(1); setCartMap({}); }} className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl shadow-xl hover:scale-[1.02] transition-all">NUEVA VENTA</button>
                                    <button onClick={closePOS} className="w-full bg-slate-900 text-slate-400 font-bold py-4 rounded-2xl">CERRAR</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col px-6 lg:px-10 pb-6 lg:pb-10 overflow-hidden">
                                {/* Phase 4: Staggered Content Entry (Header first) */}
                                <motion.header
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.15, delay: 0.05 }}
                                    className="lg:py-8 py-4 flex justify-between items-center flex-shrink-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg"><DollarSign className="text-slate-950" size={20} /></div>
                                        {isMobile && step > 1 && <button onClick={() => setStep(step - 1 as any)} className="p-2 bg-slate-900 rounded-full text-slate-500"><ChevronLeft size={18} /></button>}
                                    </div>
                                    <button onClick={closePOS} className="p-2 hover:bg-slate-900 rounded-full text-slate-500 transition-colors"><X size={24} /></button>
                                </motion.header>

                                {/* Content Body with slight delay */}
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: 0.12 }}
                                    className="flex-1 overflow-hidden relative"
                                >
                                    {isMobile ? <MobileLayout /> : <WebLayout />}
                                </motion.div>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
