'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Plus, Receipt, Megaphone, Truck, ShoppingBag, Zap, Package, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, getDateRange } from '@/lib/utils'
import { ZONA_COLOMBIA, diasEntre, instanteDeDia, periodoDeDireccion, textoRango, tramoDeDias, type Tramo } from '@/lib/periodos'
import { useStore } from '@/lib/hooks/useData'
import { EXPENSE_CATEGORIES, nombreCategoria } from '@/lib/types'
import { explainError } from '@/lib/errors'
import { Field, PriceField, EASE_OUT_EMIL } from '@/components/ui'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'

const supabase = createClient()

const CSS = `
.gt-cat { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; font: inherit; cursor: pointer;
    background: var(--toul-surface); border: 1px solid var(--toul-border); -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.gt-cat:active { transform: scale(0.97); }
.gt-cat[data-activa="true"] { background: var(--toul-surface-2); border-color: var(--toul-border-2); }
@media (prefers-reduced-motion: reduce) { .gt-cat:active { transform: none; } }
.gt-fila { display: flex; align-items: center; gap: 13px; width: 100%; padding: 11px 10px;
    border-radius: 14px; border: none; background: none; font: inherit; color: inherit;
    text-align: left; cursor: pointer;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.gt-fila:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) { .gt-fila:hover { background: rgba(255,255,255,0.038); } }
@media (prefers-reduced-motion: reduce) { .gt-fila:active { transform: none; } }
`

/** Cada categoría con su ícono, para reconocerla de un vistazo. Todas
 *  en el mismo gris: el color se reserva para lo que significa algo
 *  (el monto ya va en rojo porque es plata que sale). Antes cada una
 *  tenía un color y "Otros" en rojo parecía un error. */
const NEUTRO = { color: 'var(--toul-text-muted)', dim: 'var(--toul-surface-2)' }
const CATEGORY_STYLE: Record<string, { Icon: typeof Receipt; color: string; dim: string }> = {
    publicidad: { Icon: Megaphone, ...NEUTRO },
    transporte: { Icon: Truck, ...NEUTRO },
    compras: { Icon: ShoppingBag, ...NEUTRO },
    servicios: { Icon: Zap, ...NEUTRO },
    otros: { Icon: Receipt, ...NEUTRO },
}

type Period = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom'

const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Año' },
    { value: 'all', label: 'Todo' },
]

/** Los mismos periodos del Inicio y Reportes, en hora de Colombia */
function tramoDe(period: Period, dias: { desde: string; hasta: string }): Tramo {
    if (period === 'all') return { from: null, to: null }
    if (period === 'custom') return tramoDeDias(dias.desde, dias.hasta)
    return getDateRange(period)
}

interface ExpenseRow {
    id: string
    category: string
    description: string | null
    amount: number
    created_at: string
}

/** El día de cada gasto, en hora de Colombia */
const dayLabel = (iso: string) => {
    const atras = diasEntre(iso, new Date())
    if (atras === 0) return 'Hoy'
    if (atras === 1) return 'Ayer'
    return new Date(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA_COLOMBIA })
}

export default function ExpensesPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <Gastos />
        </Suspense>
    )
}

function Gastos() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    // Desde Reportes se llega con el periodo y la categoría puestos:
    // /expenses?periodo=month&categoria=publicidad
    const params = useSearchParams()
    const [inicial] = useState(() => {
        const p = periodoDeDireccion(params)
        const periodo = p?.periodo === 'total' ? 'all' : (p?.periodo ?? 'month')
        return { period: periodo as Period, desde: p?.desde ?? '', hasta: p?.hasta ?? '', categoria: params.get('categoria') ?? '' }
    })
    const [period, setPeriod] = useState<Period>(inicial.period)
    const [dias] = useState({ desde: inicial.desde, hasta: inicial.hasta })
    const [categoria, setCategoria] = useState(inicial.categoria)
    const [adding, setAdding] = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ category: 'otros', description: '', amount: '' })
    // Un gasto mal digitado dañaba la utilidad para siempre: ahora se corrige
    const [editing, setEditing] = useState<ExpenseRow | null>(null)
    const [removing, setRemoving] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)

    function abrirNuevo() {
        setEditing(null)
        setForm({ category: 'otros', description: '', amount: '' })
        setAdding(true)
    }

    // Desde el inicio ("Gasto") se llega con ?nuevo=1: el formulario abre de una
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('nuevo') !== '1') return
        const t = setTimeout(() => {
            window.history.replaceState(null, '', '/expenses')
            abrirNuevo()
        }, 0)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function abrirEdicion(expense: ExpenseRow) {
        setEditing(expense)
        setForm({
            category: expense.category,
            description: expense.description ?? '',
            amount: String(Math.round(Number(expense.amount))),
        })
        setAdding(true)
    }

    const tramo = useMemo(() => tramoDe(period, dias), [period, dias])

    // Todos los del periodo, de a 1.000: el total tiene que dar lo mismo que Reportes
    const { data: expenses, isLoading, mutate } = useSWR<ExpenseRow[]>(
        storeId ? ['gastos', storeId, period, tramo.from, period === 'custom' ? tramo.to : 'ahora'] : null,
        async () => {
            const filas: ExpenseRow[] = []
            for (let desde = 0; ; desde += 1000) {
                let query = supabase.from('expenses')
                    .select('id, category, description, amount, created_at')
                    .eq('store_id', storeId)
                    .order('created_at', { ascending: false })
                    .order('id')
                    .range(desde, desde + 999)
                if (tramo.from) query = query.gte('created_at', tramo.from)
                if (tramo.to && period === 'custom') query = query.lte('created_at', tramo.to)
                const { data, error } = await query
                if (error) throw error
                filas.push(...((data ?? []) as ExpenseRow[]))
                if ((data ?? []).length < 1000) return filas
            }
        },
        { revalidateOnFocus: false },
    )

    async function borrar() {
        if (!editing) return
        setRemoving(true)
        const { error } = await supabase.rpc('toul_delete_expense', { p_expense_id: editing.id })
        setRemoving(false)
        if (error) { toast.error(explainError(error, 'No se pudo borrar el gasto.')); return }
        setConfirmOpen(false); setAdding(false); setEditing(null)
        mutate()
        toast.success('Gasto borrado')
    }

    const todos = useMemo(() => expenses ?? [], [expenses])
    // Las categorías salen de todo el periodo; la lista y el total, de la elegida
    const byCategory = useMemo(() => {
        const map = new Map<string, number>()
        for (const row of todos) {
            const clave = row.category || 'otros'
            map.set(clave, (map.get(clave) ?? 0) + Number(row.amount))
        }
        return [...map.entries()]
            .map(([value, amount]) => ({ value, label: nombreCategoria(value), amount: Math.round(amount) }))
            .sort((a, b) => b.amount - a.amount)
    }, [todos])
    const rows = useMemo(() => categoria ? todos.filter(e => (e.category || 'otros') === categoria) : todos, [todos, categoria])
    const total = useMemo(() => Math.round(rows.reduce((sum, e) => sum + Number(e.amount), 0)), [rows])

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

        // Corregir uno que ya existe: el gasto y su salida de caja se
        // arreglan juntos, para que la caja no quede descuadrada
        if (editing) {
            setSaving(true)
            const { error } = await supabase.rpc('toul_update_expense', {
                p_expense_id: editing.id,
                p_category: form.category,
                p_description: form.description,
                p_amount: amount,
            })
            setSaving(false)
            if (error) { toast.error(explainError(error, 'No se pudo corregir el gasto.')); return }
            setAdding(false); setEditing(null)
            mutate()
            toast.success('Gasto corregido')
            return
        }

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
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl lg:max-w-[1040px] mx-auto" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />

            {/* Encabezado */}
            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>Gastos</h1>
                </div>
                <button onClick={abrirNuevo}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 12,
                        border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, boxShadow: '0 4px 20px var(--toul-accent-glow)',
                    }}>
                    <Plus size={16} strokeWidth={2.6} /> Nuevo
                </button>
            </div>

            {/* PC: cuánto y en qué a la izquierda, el detalle día por día a la derecha */}
            <div className="lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-x-12 lg:items-start">
            <div>
            {/* Período */}
            <div className="flex gap-1.5 flex-wrap mb-4">
                {PERIODS.map(p => {
                    const active = period === p.value
                    return (
                        <button key={p.value} onClick={() => setPeriod(p.value)} aria-pressed={active}
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
                {/* Unas fechas elegidas en Reportes */}
                {period === 'custom' && (
                    <span style={{
                        padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500,
                        background: 'var(--toul-surface-focused)', border: '1px solid var(--toul-border-focused)', color: 'var(--toul-accent)',
                    }}>
                        {textoRango(instanteDeDia(dias.desde), instanteDeDia(dias.hasta))}
                    </span>
                )}
            </div>

            {/* Total del período */}
            <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE_OUT_EMIL }}
                style={{ marginBottom: 18 }}>
                <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: 0 }}>
                    Gastaste{categoria ? ` en ${nombreCategoria(categoria).toLowerCase()}` : ''}{' '}
                    {period === 'all' ? 'en total'
                        : period === 'custom' ? `del ${textoRango(instanteDeDia(dias.desde), instanteDeDia(dias.hasta))}`
                        : ({ today: 'hoy', week: 'esta semana', month: 'este mes', year: 'este año' } as Record<string, string>)[period]}
                </p>
                <p style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.045em', color: 'var(--toul-text)', margin: '6px 0 0', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCOP(total)}
                </p>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                    {rows.length} {rows.length === 1 ? 'gasto' : 'gastos'}
                </p>
            </motion.div>

            {/* Reparto por categoría: tocar una muestra solo esa */}
            {byCategory.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }} role="group" aria-label="Categoría">
                    {categoria && (
                        <button type="button" className="gt-cat" onClick={() => setCategoria('')}>
                            <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>Todas</span>
                        </button>
                    )}
                    {byCategory.map(cat => {
                        const style = CATEGORY_STYLE[cat.value] ?? CATEGORY_STYLE.otros
                        const activa = categoria === cat.value
                        return (
                            <button key={cat.value} type="button" className="gt-cat" data-activa={activa} aria-pressed={activa}
                                onClick={() => setCategoria(activa ? '' : cat.value)}>
                                <style.Icon size={14} style={{ color: style.color }} />
                                <span style={{ fontSize: 13, color: activa ? 'var(--toul-text)' : 'var(--toul-text-muted)' }}>{cat.label}</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)' }}>{formatCOP(cat.amount)}</span>
                            </button>
                        )
                    })}
                </div>
            )}

            </div>
            <div>
            {/* Lista por día */}
            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 16 }} />)}</div>
            ) : rows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {items.map(expense => {
                                    const style = CATEGORY_STYLE[expense.category] ?? CATEGORY_STYLE.otros
                                    const label = EXPENSE_CATEGORIES.find(c => c.value === expense.category)?.label ?? 'Otros'
                                    return (
                                        <button key={expense.id} className="gt-fila"
                                            onClick={() => abrirEdicion(expense)}>
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
                                                    {label} · {new Date(expense.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA })}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-error)', whiteSpace: 'nowrap' }}>
                                                −{formatCOP(expense.amount)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            </div>
            </div>

            {/* Nuevo gasto */}
            <Sheet open={adding} onClose={() => !saving && (setAdding(false), setEditing(null))}
                title={editing ? 'Corregir gasto' : 'Nuevo gasto'}
                subtitle={editing
                    ? 'Se corrige el gasto y su salida de caja al mismo tiempo.'
                    : 'Lo que sale del negocio y no es mercancía.'}
                footer={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="toul-btn-primary" style={{ flex: 1 }}
                            onClick={save} disabled={saving || !form.amount}>
                            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Guardar gasto'}
                        </button>
                        {editing && (
                            <button onClick={() => setConfirmOpen(true)} disabled={saving}
                                aria-label="Borrar gasto"
                                style={{
                                    width: 52, height: 52, borderRadius: 14, cursor: 'pointer', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)',
                                    color: 'var(--toul-error)',
                                }}>
                                <Trash2 size={17} />
                            </button>
                        )}
                    </div>
                }>
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

                <PriceField label="Monto" required value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} />
                <div style={{ height: 10 }} />
                <Field label="¿En qué exactamente?" hint="opcional" capitalize value={form.description}
                    onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Ej: domicilio del pedido de María" maxLength={60} />
            </Sheet>

            <ConfirmSheet
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={borrar}
                busy={removing}
                danger
                title="¿Borrar este gasto?"
                message={editing
                    ? `Se van ${formatCOP(Number(editing.amount))} de tus gastos y de la caja. Esto no se puede deshacer.`
                    : ''}
                confirmLabel="Borrar gasto"
            />
        </div>
    )
}
