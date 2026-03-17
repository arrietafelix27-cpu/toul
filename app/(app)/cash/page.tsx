'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowRightLeft, TrendingUp, TrendingDown, Plus, Pencil, Trash2, Check, X, Filter, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import type { PaymentMethodConfig } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem, fadeUp, t } from '@/lib/motion'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { CapitalPropioModal } from '@/components/cash/CapitalPropioModal'

interface Movement {
    id: string
    created_at: string
    type: string
    method: string
    amount: number
    notes: string | null
    sign: 1 | -1
    label: string
    icon: string
}

type MovType = 'all' | 'sale' | 'expense' | 'transfer'

export default function CashPage() {
    const supabase = createClient()
    const [storeId, setStoreId] = useState('')
    const [methods, setMethods] = useState<PaymentMethodConfig[]>([])
    const [balances, setBalances] = useState<Record<string, number>>({})
    const [total, setTotal] = useState(0)
    const [movements, setMovements] = useState<Movement[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Transfer
    const [showTransfer, setShowTransfer] = useState(false)
    const [transfer, setTransfer] = useState({ fromId: '', toId: '', amount: '' })

    // Filter
    const [movType, setMovType] = useState<MovType>('all')

    // New method form
    const [showAddMethod, setShowAddMethod] = useState(false)
    const [newMethodName, setNewMethodName] = useState('')
    const [newMethodColor, setNewMethodColor] = useState('#6366F1')
    const [addingSaving, setAddingSaving] = useState(false)

    // Edit method
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')

    const loadCash = useCallback(async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) return
        setStoreId(store.id)

        // Load payment methods
        const res = await fetch('/api/payment-methods')
        const { methods: pm } = await res.json()
        setMethods(pm || [])

        // Load payments for balance calculation
        const { data: payments } = await supabase
            .from('payments')
            .select('id, created_at, type, method, amount, notes')
            .eq('store_id', store.id)
            .order('created_at', { ascending: false })

        const balMap: Record<string, number> = {}
        const movList: Movement[] = []

        for (const p of (payments || [])) {
            const isOut = p.type === 'transfer_out' || p.type === 'expense' || p.type === 'purchase' || p.type === 'provider_payment'
            const sign: 1 | -1 = isOut ? -1 : 1
            balMap[p.method] = (balMap[p.method] || 0) + p.amount * sign

            let label = p.notes || p.type
            let icon = '💰'
            if (p.type === 'sale') { icon = '🛍️'; label = p.notes || 'Venta' }
            else if (p.type === 'expense') { icon = '💸'; label = p.notes || 'Gasto' }
            else if (p.type === 'purchase') { icon = '📦'; label = p.notes || 'Compra de inventario' }
            else if (p.type === 'provider_payment') { icon = '🏢'; label = p.notes || 'Pago a proveedor' }
            else if (p.type === 'transfer_out') { icon = '↗️'; label = p.notes || 'Transferencia salida' }
            else if (p.type === 'transfer_in') { icon = '↙️'; label = p.notes || 'Transferencia entrada' }
            movList.push({ id: p.id, created_at: p.created_at, type: p.type, method: p.method, amount: p.amount, notes: p.notes, sign, label, icon })
        }

        setBalances(balMap)
        setTotal(Object.values(balMap).reduce((s, v) => s + v, 0))
        setMovements(movList)
        setLoading(false)
    }, [])

    useEffect(() => { loadCash() }, [loadCash])

    // Set default transfer selections when methods load
    useEffect(() => {
        if (methods.length >= 2) {
            setTransfer(t => ({
                fromId: t.fromId || methods[0]?.id || '',
                toId: t.toId || methods[1]?.id || '',
                amount: t.amount
            }))
        }
    }, [methods])

    async function handleTransfer() {
        const amount = Number(transfer.amount)
        if (!amount || amount <= 0) { toast.error('Ingresa un monto válido'); return }
        if (transfer.fromId === transfer.toId) { toast.error('Elige métodos diferentes'); return }
        const fromMethod = methods.find(m => m.id === transfer.fromId)
        if (!fromMethod) return
        if ((balances[fromMethod.name] || 0) < amount) { toast.error('Saldo insuficiente'); return }
        const toMethod = methods.find(m => m.id === transfer.toId)
        if (!toMethod) return
        setSaving(true)
        await supabase.from('payments').insert([
            { store_id: storeId, type: 'transfer_out', method: fromMethod.name, amount, notes: `Transferencia a ${toMethod.name}` },
            { store_id: storeId, type: 'transfer_in', method: toMethod.name, amount, notes: `Transferencia desde ${fromMethod.name}` },
        ])
        toast.success('Transferencia registrada ✅')
        setShowTransfer(false)
        setTransfer(t => ({ ...t, amount: '' }))
        loadCash()
        setSaving(false)
    }

    async function handleAddMethod() {
        if (!newMethodName.trim()) { toast.error('Escribe un nombre'); return }
        setAddingSaving(true)
        const res = await fetch('/api/payment-methods', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newMethodName.trim(), color: newMethodColor })
        })
        if (res.ok) {
            toast.success('Método creado ✅')
            setNewMethodName('')
            setShowAddMethod(false)
            loadCash()
        } else {
            const d = await res.json()
            toast.error(d.error || 'Error')
        }
        setAddingSaving(false)
    }

    async function handleRename(id: string) {
        if (!editingName.trim()) { setEditingId(null); return }
        const res = await fetch('/api/payment-methods', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name: editingName.trim() })
        })
        if (res.ok) { toast.success('Renombrado ✅'); loadCash() }
        else { const d = await res.json(); toast.error(d.error || 'Error') }
        setEditingId(null)
    }

    async function handleDelete(id: string, name: string) {
        const res = await fetch('/api/payment-methods', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        })
        if (res.ok) { toast.success(`"${name}" eliminado`); loadCash() }
        else { const d = await res.json(); toast.error(d.error || 'Error') }
    }

    const filtered = useMemo(() => movements.filter(m => {
        if (movType === 'all') return true
        if (movType === 'transfer') return m.type.includes('transfer')
        return m.type.includes(movType)
    }), [movements, movType])

    const MOV_TYPES: { value: MovType; label: string }[] = [
        { value: 'all', label: 'Todos' },
        { value: 'sale', label: 'Ventas' },
        { value: 'expense', label: 'Gastos' },
        { value: 'transfer', label: 'Transferencias' },
    ]

    function formatDate(iso: string) {
        return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    }

    // Capital Propio Modal
    const [showCapitalModal, setShowCapitalModal] = useState(false)

    return (
        <div className="px-4 md:px-8 pt-6 pb-8">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Caja</p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Tu dinero</h1>
                </div>
                <button onClick={() => setShowCapitalModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95"
                    style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                    <Package size={14} /> Capital Propio
                </button>
            </motion.div>

            {/* Total hero */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.04 }}
                className="rounded-3xl p-6 mb-5 text-center relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #1a1f35 0%, #1e293b 100%)', border: '1px solid #1e3a5f' }}>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #6366f1 0%, transparent 60%)' }} />
                <p className="text-sm mb-1 relative" style={{ color: 'var(--toul-text-muted)' }}>Total disponible</p>
                {loading ? (
                    <div className="skeleton h-12 w-44 rounded mx-auto mb-3" />
                ) : (
                    <AnimatedNumber value={total} formatter={formatCOP}
                        className="text-5xl font-bold text-white tracking-tight relative block mb-3" duration={0.6} />
                )}
                <button onClick={() => setShowTransfer(v => !v)}
                    className="inline-flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-all relative"
                    style={{ background: showTransfer ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)' }}>
                    <ArrowRightLeft size={12} /> Transferir entre cuentas
                </button>
            </motion.div>

            {/* Transfer form */}
            <AnimatePresence>
                {showTransfer && (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" exit={{ opacity: 0, height: 0 }}
                        className="toul-card mb-4">
                        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Transferir entre cuentas</h3>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                                <select className="toul-input text-sm" value={transfer.fromId}
                                    onChange={e => setTransfer(p => ({ ...p, fromId: e.target.value }))}>
                                    {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Hacia</label>
                                <select className="toul-input text-sm" value={transfer.toId}
                                    onChange={e => setTransfer(p => ({ ...p, toId: e.target.value }))}>
                                    {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <input className="toul-input mb-3" type="number" min={0} placeholder="Monto"
                            value={transfer.amount} onChange={e => setTransfer(p => ({ ...p, amount: e.target.value }))} />
                        <motion.button onClick={handleTransfer} disabled={saving} whileTap={{ scale: 0.98 }} className="toul-btn-primary">
                            {saving ? 'Registrando...' : 'Confirmar transferencia'}
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Method cards */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 mb-4">
                {loading
                    ? [1, 2, 3, 4].map(n => <div key={n} className="skeleton h-24 rounded-2xl" />)
                    : methods.map(m => (
                        <motion.div key={m.id} variants={staggerItem}
                            className="rounded-2xl p-4 border relative group"
                            style={{ background: `${m.color}0D`, borderColor: `${m.color}30` }}>
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                                        style={{ backgroundColor: `${m.color}25`, color: m.color }}>
                                        {m.name[0]}
                                    </div>
                                    {editingId === m.id ? (
                                        <input
                                            autoFocus
                                            className="toul-input text-xs py-1 px-2 h-7"
                                            style={{ width: 90 }}
                                            value={editingName}
                                            onChange={e => setEditingName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleRename(m.id); if (e.key === 'Escape') setEditingId(null) }}
                                        />
                                    ) : (
                                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>{m.name}</p>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {editingId === m.id ? (
                                        <>
                                            <button onClick={() => handleRename(m.id)} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--toul-accent)', color: '#fff' }}><Check size={11} /></button>
                                            <button onClick={() => setEditingId(null)} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'var(--toul-border-2)', color: 'var(--toul-text-muted)' }}><X size={11} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => { setEditingId(m.id); setEditingName(m.name) }}
                                                className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                                                style={{ background: 'var(--toul-border)', color: 'var(--toul-text-muted)' }}>
                                                <Pencil size={11} />
                                            </button>
                                            <button onClick={() => handleDelete(m.id, m.name)}
                                                className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                                                style={{ background: 'var(--toul-border)', color: 'var(--toul-error)' }}>
                                                <Trash2 size={11} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <AnimatedNumber value={balances[m.name] || 0} formatter={formatCOP}
                                className="text-xl font-bold" style={{ color: m.color } as React.CSSProperties} duration={0.5} />
                        </motion.div>
                    ))
                }
            </motion.div>

            {/* Add method */}
            <AnimatePresence>
                {showAddMethod ? (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" exit={{ opacity: 0, height: 0 }}
                        className="toul-card mb-4">
                        <p className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Nuevo método de pago</p>
                        <div className="flex gap-2 mb-3">
                            <input className="toul-input text-sm flex-1" placeholder="Nombre (ej. Tarjeta)" autoFocus
                                value={newMethodName} onChange={e => setNewMethodName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleAddMethod()} />
                            <div className="flex items-center gap-2">
                                <label className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>Color</label>
                                <input type="color" value={newMethodColor} onChange={e => setNewMethodColor(e.target.value)}
                                    className="w-9 h-9 rounded-lg cursor-pointer border-0 bg-transparent" />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <motion.button whileTap={{ scale: 0.97 }} onClick={handleAddMethod} disabled={addingSaving}
                                className="toul-btn-primary flex-1" style={{ padding: '0.6rem 1rem', fontSize: '0.875rem' }}>
                                {addingSaving ? 'Guardando...' : 'Guardar'}
                            </motion.button>
                            <button onClick={() => { setShowAddMethod(false); setNewMethodName('') }}
                                className="toul-btn-ghost">Cancelar</button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.button variants={fadeUp} initial="hidden" animate="visible"
                        onClick={() => setShowAddMethod(true)} whileTap={{ scale: 0.97 }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm font-medium mb-5 border transition-colors"
                        style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', borderStyle: 'dashed', background: 'transparent' }}>
                        <Plus size={15} /> Agregar método de pago
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Movements */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>Movimientos</h2>
                    <div className="flex gap-1.5">
                        {MOV_TYPES.map(mt => (
                            <button key={mt.value} onClick={() => setMovType(mt.value)}
                                className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                                style={movType === mt.value
                                    ? { background: 'var(--toul-accent)', color: '#fff', borderColor: 'var(--toul-accent)' }
                                    : { color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'transparent' }}>
                                {mt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col gap-2">{[1, 2, 3].map(n => <div key={n} className="skeleton h-14 rounded-2xl" />)}</div>
                ) : filtered.length === 0 ? (
                    <div className="toul-card text-center py-8">
                        <ArrowRightLeft size={26} className="mx-auto mb-2" style={{ color: 'var(--toul-border-2)' }} />
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Sin movimientos</p>
                    </div>
                ) : (
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-1.5">
                        {filtered.map(mov => {
                            const matchedMethod = methods.find(m => m.name === mov.method)
                            return (
                                <motion.div key={mov.id} variants={staggerItem}
                                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                                    style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                                        style={{ background: mov.sign === 1 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                                        {mov.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" style={{ color: 'var(--toul-text)' }}>{mov.label}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                            {formatDate(mov.created_at)}
                                            {matchedMethod && <span style={{ color: matchedMethod.color }}> · {matchedMethod.name}</span>}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {mov.sign === 1 ? <TrendingUp size={13} style={{ color: 'var(--toul-accent)' }} /> : <TrendingDown size={13} style={{ color: 'var(--toul-error)' }} />}
                                        <p className="font-bold text-sm"
                                            style={{ color: mov.sign === 1 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                            {mov.sign === 1 ? '+' : '−'}{formatCOP(mov.amount)}
                                        </p>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </motion.div>
                )}
            </div>

            {/* Modals */}
            <AnimatePresence>
                {showCapitalModal && storeId && (
                    <CapitalPropioModal
                        storeId={storeId}
                        onClose={() => setShowCapitalModal(false)}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
