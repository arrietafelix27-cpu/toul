'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, formatDate } from '@/lib/utils'
import { Plus, Receipt, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { PAYMENT_METHODS, EXPENSE_CATEGORIES, type PaymentMethod } from '@/lib/types'
import type { Expense } from '@/lib/types'

export default function ExpensesPage() {
    const supabase = createClient()
    const [storeId, setStoreId] = useState('')
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ category: 'otros', description: '', amount: '', method: 'efectivo' as PaymentMethod })

    useEffect(() => { loadExpenses() }, [])

    async function loadExpenses() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) return
        setStoreId(store.id)
        const { data } = await supabase.from('expenses').select('*').eq('store_id', store.id).order('created_at', { ascending: false })
        setExpenses(data || [])
        setLoading(false)
    }

    async function handleSave() {
        if (!form.amount || Number(form.amount) <= 0) { toast.error('Ingresa un monto válido'); return }
        setSaving(true)

        try {
            const response = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: form.category,
                    description: form.description,
                    amount: Number(form.amount),
                    method: form.method,
                    isCapital: form.method === 'capital'
                })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Error al registrar el gasto')

            toast.success('Gasto registrado ✅')
            setShowForm(false)
            setForm({ category: 'otros', description: '', amount: '', method: 'efectivo' })
            loadExpenses()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al registrar el gasto')
        } finally {
            setSaving(false)
        }
    }

    // Current month expenses
    const now = new Date()
    const monthExpenses = expenses.filter(e => {
        const d = new Date(e.created_at)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0)
    const totalAll = expenses.reduce((s, e) => s + e.amount, 0)

    return (
        <div className="px-4 md:px-8 pt-6 pb-4 fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-widest font-medium mb-0.5">Gastos</p>
                    <h1 className="text-2xl font-bold text-white">Control de gastos</h1>
                </div>
                <button onClick={() => setShowForm(v => !v)}
                    className="toul-btn-secondary flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold">
                    {showForm ? <X size={16} /> : <Plus size={16} />}
                    {showForm ? 'Cancelar' : 'Nuevo'}
                </button>
            </div>

            {/* ═══ MONTHLY METRIC ═══ */}
            <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="rounded-2xl p-4 border border-red-500/20" style={{ background: '#7f1d1d15' }}>
                    <p className="text-xs text-slate-400 mb-1">Este mes</p>
                    {loading ? <div className="skeleton h-7 w-24 rounded" /> : (
                        <p className="text-2xl font-bold text-red-400">{formatCOP(monthTotal)}</p>
                    )}
                    <p className="text-slate-500 text-xs mt-0.5">{monthExpenses.length} gastos</p>
                </div>
                <div className="rounded-2xl p-4 border border-slate-800" style={{ background: '#1e293b' }}>
                    <p className="text-xs text-slate-400 mb-1">Total histórico</p>
                    {loading ? <div className="skeleton h-7 w-24 rounded" /> : (
                        <p className="text-2xl font-bold text-slate-300">{formatCOP(totalAll)}</p>
                    )}
                    <p className="text-slate-500 text-xs mt-0.5">{expenses.length} gastos</p>
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <div className="toul-card mb-4 fade-in">
                    <h3 className="text-sm font-bold text-white mb-3">Registrar gasto</h3>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Categoría</label>
                            <select className="toul-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 mb-1 block">Descripción (opcional)</label>
                            <input className="toul-input" type="text" placeholder="Ej: Ads de Instagram" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Monto *</label>
                                <input className="toul-input" type="number" min={0} placeholder="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Cómo pagaste</label>
                                <select className="toul-input" value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
                                    {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                                </select>
                            </div>
                        </div>
                        <button onClick={handleSave} disabled={saving} className="toul-btn-primary">{saving ? 'Guardando...' : 'Guardar gasto'}</button>
                    </div>
                </div>
            )}

            {/* List */}
            {loading ? (
                <div className="flex flex-col gap-2">{[1, 2, 3].map(n => <div key={n} className="skeleton h-16 rounded-2xl" />)}</div>
            ) : expenses.length === 0 ? (
                <EmptyState
                    icon={Receipt}
                    title="Sin gastos registrados"
                    description="Toca 'Nuevo' para registrar tu primer gasto y mantener tus cuentas al día."
                />
            ) : (
                <div className="flex flex-col gap-2">
                    {expenses.map(expense => {
                        const cat = EXPENSE_CATEGORIES.find(c => c.value === expense.category)
                        const pm = PAYMENT_METHODS.find(m => m.value === expense.payment_method)
                        return (
                            <div key={expense.id} className="bg-slate-900 border border-slate-800 rounded-2xl flex items-center gap-3 px-4 py-3">
                                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
                                    <Receipt size={16} className="text-red-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-white text-sm">{cat?.label || expense.category}</p>
                                    <p className="text-slate-500 text-xs truncate">{expense.description || '—'} · {formatDate(expense.created_at)}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-bold text-red-400 text-sm">−{formatCOP(expense.amount)}</p>
                                    <p className="text-xs" style={{ color: pm?.color || '#94a3b8' }}>{pm?.label}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
