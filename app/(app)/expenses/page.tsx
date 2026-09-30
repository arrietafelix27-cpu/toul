'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, Receipt, Megaphone, Truck, ShoppingBag, Zap, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { explainError } from '@/lib/errors'
import { Field, PriceField, EASE_OUT_EMIL } from '@/components/ui'
import { Sheet } from '@/components/isla/Sheet'

const supabase = createClient()

/** Cada categoría con su cara, para reconocerla de un vistazo. */
const CATEGORY_STYLE: Record<string, { Icon: typeof Receipt; color: string; dim: string }> = {
    publicidad: { Icon: Megaphone, color: '#bf5af2', dim: 'rgba(191,90,242,0.12)' },
    transporte: { Icon: Truck, color: '#0a84ff', dim: 'rgba(10,132,255,0.12)' },
    compras: { Icon: ShoppingBag, color: '#ffd60a', dim: 'rgba(255,214,10,0.12)' },
    servicios: { Icon: Zap, color: '#ff9f0a', dim: 'rgba(255,159,10,0.12)' },
    otros: { Icon: Receipt, color: '#ff453a', dim: 'rgba(255,69,58,0.12)' },
}

type Period = 'week' | 'month' | 'year' | 'all'

const PERIODS: { value: Period; label: string }[] = [
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Año' },
    { value: 'all', label: 'Todo' },
]

function since(period: Period): string | null {
    const now = new Date()
    if (period === 'all') return null
    if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.toISOString() }
    if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString()
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

interface ExpenseRow {
    id: string
    category: string
    description: string | null
    amount: number
    created_at: string
}

const dayLabel = (iso: string) => {
    const date = new Date(iso)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
    const day = new Date(date); day.setHours(0, 0, 0, 0)
    if (day.getTime() === today.getTime()) return 'Hoy'
    if (day.getTime() === yesterday.getTime()) return 'Ayer'
    return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ExpensesPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const [period, setPeriod] = useState<Period>('month')
    const [adding, setAdding] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ category: 'otros', description: '', amount: '' })

    const { data: expenses, isLoading, mutate } = useSWR<ExpenseRow[]>(
        storeId ? ['gastos', storeId, period] : null,
        async () => {
            let query = supabase.from('expenses')
                .select('id, category, description, amount, created_at')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .limit(200)
            const from = since(period)
            if (from) query = query.gte('created_at', from)
            const { data, error } = await query
            if (error) throw error
            return (data ?? []) as ExpenseRow[]
        },
        { revalidateOnFocus: false },
    )

    const rows = expenses ?? []
    const total = useMemo(() => Math.round(rows.reduce((sum, e) => sum + Number(e.amount), 0)), [rows])

    const byCategory = useMemo(() => {
        const map = new Map<string, number>()
        for (const row of rows) map.set(row.category, (map.get(row.category) ?? 0) + Number(row.amount))
        return [...map.entries()]
            .map(([value, amount]) => ({
                value,
                label: EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? 'Otros',
                amount: Math.round(amount),
            }))
            .sort((a, b) => b.amount - a.amount)
    }, [rows])

    const grouped = useMemo(() => {
        const map = new Map<string, ExpenseRow[]>()
        for (const row of rows) {
            const key = dayLabel(row.created_at)
            const list = map.get(key) ?? []
            list.push(row)
            map.set(key, list)
        }
        return [...map.entries()]
    }, [rows])

    async function save() {
        const amount = Number(form.amount)
        if (!amount || amount <= 0) { toast.error('Escribe cuánto gastaste'); return }
        setSaving(true)
        try {
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: form.category, description: form.description, amount }),
            })
            const result = await res.json()
            if (!res.ok) throw new Error(result.error)
            toast.success('Gasto registrado')
            setForm({ category: 'otros', description: '', amount: '' })
            setAdding(false)
            mutate()
        } catch (err) {
            toast.error(explainError(err, 'No se pudo registrar el gasto.'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Encabezado */}
            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <Link href="/cash" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Caja</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Gastos</h1>
                </div>
                <button onClick={() => setAdding(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 12,
                        border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 4px 20px var(--toul-accent-glow)',
                    }}>
                    <Plus size={16} strokeWidth={2.6} /> Nuevo
                </button>
            </div>

            {/* Período */}
            <div className="flex gap-1.5 flex-wrap mb-4">
                {PERIODS.map(p => {
                    const active = period === p.value
                    return (
                        <button key={p.value} onClick={() => setPeriod(p.value)}
                            style={{
                                padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {p.label}
                        </button>
                    )
                })}
            </div>

            {/* Total del período */}
            <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE_OUT_EMIL }}
                className="toul-card" style={{ padding: '20px 22px', marginBottom: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                    Gastaste {period === 'all' ? 'en total' : `en ${PERIODS.find(p => p.value === period)?.label.toLowerCase()}`}
                </p>
                <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: '2px 0 0' }}>
                    {formatCOP(total)}
                </p>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                    {rows.length} {rows.length === 1 ? 'gasto' : 'gastos'}
                </p>
            </motion.div>

            {/* Reparto por categoría */}
            {byCategory.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                    {byCategory.map(cat => {
                        const style = CATEGORY_STYLE[cat.value] ?? CATEGORY_STYLE.otros
                        return (
                            <span key={cat.value} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12,
                                background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                            }}>
                                <style.Icon size={14} style={{ color: style.color }} />
                                <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>{cat.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)' }}>{formatCOP(cat.amount)}</span>
                            </span>
                        )
                    })}
                </div>
            )}

            {/* Lista por día */}
            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 16 }} />)}</div>
            ) : rows.length === 0 ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '44px 20px' }}>
                    <Package size={30} strokeWidth={1.5} style={{ color: 'var(--toul-text-faint)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Sin gastos en este período</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                        Registra el arriendo, los domicilios o las bolsas para saber de verdad cuánto te queda.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {grouped.map(([day, items]) => (
                        <div key={day}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 8px' }}>
                                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: 0, textTransform: 'capitalize' }}>{day}</p>
                                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text-muted)', margin: 0 }}>
                                    {formatCOP(items.reduce((sum, e) => sum + Number(e.amount), 0))}
                                </p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {items.map(expense => {
                                    const style = CATEGORY_STYLE[expense.category] ?? CATEGORY_STYLE.otros
                                    const label = EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label ?? 'Otros'
                                    return (
                                        <div key={expense.id} className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                            <span style={{
                                                width: 40, height: 40, borderRadius: 13, flexShrink: 0,
                                                background: style.dim, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <style.Icon size={18} style={{ color: style.color }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)' }}>
                                                    {expense.description || label}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                                    {label} · {new Date(expense.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-error)', whiteSpace: 'nowrap' }}>
                                                −{formatCOP(expense.amount)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Nuevo gasto */}
            <Sheet open={adding} onClose={() => !saving && setAdding(false)}
                title="Nuevo gasto" subtitle="Lo que sale del negocio y no es mercancía."
                footer={<button className="toul-btn-primary" onClick={save} disabled={saving || !form.amount}>
                    {saving ? 'Guardando…' : 'Guardar gasto'}
                </button>}>
                <p className="toul-section-label" style={{ margin: '0 0 8px 2px' }}>¿En qué gastaste?</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                    {EXPENSE_CATEGORIES.map(category => {
                        const style = CATEGORY_STYLE[category.value] ?? CATEGORY_STYLE.otros
                        const active = form.category === category.value
                        return (
                            <button key={category.value} onClick={() => setForm(f => ({ ...f, category: category.value }))}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 14px', borderRadius: 13,
                                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
                                    background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                    border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                    color: active ? 'var(--toul-accent)' : 'var(--toul-text)',
                                    transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                                }}>
                                <style.Icon size={15} style={{ color: active ? 'var(--toul-accent)' : style.color }} />
                                {category.label}
                            </button>
                        )
                    })}
                </div>

                <PriceField label="Monto" required value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} step={1000} />
                <div style={{ height: 10 }} />
                <Field label="¿En qué exactamente?" hint="opcional" value={form.description}
                    onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Ej: domicilio del pedido de María" maxLength={60} />
            </Sheet>
        </div>
    )
}
