'use client'
import { useState, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { capitalizeFirst } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import { Plus, Users, Search, X, AlertTriangle, Wrench } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { Customer } from '@/lib/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToulData, useStore } from '@/lib/hooks/useData'
import { Sheet } from '@/components/isla/Sheet'
import { explainError } from '@/lib/errors'

const supabase = createClient()

type Filtro = 'todos' | 'deben' | 'alDia' | 'abonaron' | 'sinAbonar'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

export default function CustomersPage() {
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const { data: customers, isLoading, mutate } = useToulData<Customer>(
        'customers',
        storeId,
        { order: { column: 'name' }, eq: { is_active: true } }
    )

    // Quién ha abonado alguna vez: para poder separar al que paga
    // del que te quedó debiendo y nunca volvió
    const { data: abonaron } = useSWR(
        storeId ? ['clientes-abonos', storeId] : null,
        async () => {
            const { data } = await supabase.from('credits')
                .select('customer_id').eq('store_id', storeId!).eq('type', 'payment')
            return new Set((data ?? []).map(row => row.customer_id as string))
        },
        { revalidateOnFocus: false },
    )

    const [search, setSearch] = useState('')
    const [filtro, setFiltro] = useState<Filtro>('todos')
    const [dupOpen, setDupOpen] = useState(false)
    const [merging, setMerging] = useState<string | null>(null)
    const [cuadrando, setCuadrando] = useState(false)

    // Revisa todas las fichas contra sus movimientos y arregla las
    // que no cuadren. Las deudas se escribían a mano desde el
    // navegador y podían quedar desfasadas.
    async function cuadrarTodo() {
        setCuadrando(true)
        const { data, error } = await supabase.rpc('toul_recalc_customer_debt', { p_customer_id: null })
        setCuadrando(false)
        if (error) { toast.error(explainError(error)); return }
        await mutate()
        const fixed = Number(data?.fixed ?? 0)
        toast.success(fixed === 0
            ? 'Todas las deudas ya cuadraban'
            : `${fixed} ${fixed === 1 ? 'deuda quedó al día' : 'deudas quedaron al día'}`)
    }

    // Antes, escribir el nombre en la caja creaba un cliente nuevo
    // cada vez. Esto encuentra los que quedaron partidos.
    const repetidos = useMemo(() => {
        const grupos = new Map<string, Customer[]>()
        for (const c of customers || []) {
            const clave = c.name.trim().toLowerCase().replace(/\s+/g, ' ')
            grupos.set(clave, [...(grupos.get(clave) ?? []), c])
        }
        return [...grupos.values()].filter(g => g.length > 1)
    }, [customers])

    async function unir(grupo: Customer[]) {
        const [quedarse, ...resto] = grupo
        setMerging(quedarse.id)
        for (const otro of resto) {
            const { error } = await supabase.rpc('toul_merge_customers', { p_keep: quedarse.id, p_merge: otro.id })
            if (error) { toast.error(explainError(error, 'No se pudieron unir.')); setMerging(null); return }
        }
        setMerging(null)
        await mutate()
        toast.success(`${quedarse.name} quedó en un solo registro`)
    }

    // Desde el inicio se puede llegar directo a los que deben
    useEffect(() => {
        if (new URLSearchParams(window.location.search).get('ver') === 'deben') setFiltro('deben')
    }, [])
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({ name: '', phone: '' })
    const [saving, setSaving] = useState(false)

    async function handleCreate() {
        if (!form.name.trim()) { toast.error('Ingresa el nombre del cliente'); return }
        if (!storeId) return

        const newCustomer: Partial<Customer> = {
            id: crypto.randomUUID(),
            store_id: storeId,
            name: form.name.trim(),
            phone: form.phone || null,
            total_debt: 0,
            created_at: new Date().toISOString()
        }

        // Optimistic UI
        mutate(async () => {
            const { data, error } = await supabase.from('customers').insert({
                store_id: storeId,
                name: form.name.trim(),
                phone: form.phone || null
            }).select().single()
            if (error) throw error
            return [...(customers || []), data]
        }, {
            optimisticData: [...(customers || []), newCustomer as Customer],
            rollbackOnError: true,
            populateCache: true,
            revalidate: false
        })

        toast.success('Cliente creado ✅')
        setShowForm(false)
        setForm({ name: '', phone: '' })
    }

    const filtered = (customers || []).filter(c => {
        if (!c.name.toLowerCase().includes(search.toLowerCase())) return false
        const debe = Number(c.total_debt) > 0
        switch (filtro) {
            case 'deben': return debe
            case 'alDia': return !debe
            case 'abonaron': return !!abonaron?.has(c.id)
            case 'sinAbonar': return debe && !abonaron?.has(c.id)
            default: return true
        }
    })
    const totalDebt = (customers || []).reduce((s, c) => s + c.total_debt, 0)

    return (
        <div className="px-4 md:px-8 pt-6 pb-4" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between mb-5" style={{ position: 'relative' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px 0' }}>Personas</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Tu cartera</h1>
                </div>
                <button onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-1.5 transition-all active:scale-95"
                    style={{
                        padding: '9px 14px',
                        borderRadius: 12,
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        color: showForm ? 'var(--toul-text)' : '#000',
                        background: showForm ? 'rgba(255,255,255,0.07)' : 'var(--toul-accent)',
                        boxShadow: showForm ? 'none' : '0 4px 16px var(--toul-accent-glow)',
                        border: 'none',
                    }}>
                    {showForm ? <X size={15} strokeWidth={2.4} /> : <Plus size={15} strokeWidth={2.4} />}
                    {showForm ? 'Cancelar' : 'Nuevo'}
                </button>
            </motion.div>

            {/* Total debt banner */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="rounded-2xl p-4 mb-4 border" style={{ background: 'var(--toul-surface)', borderColor: '#EF444422' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Total cartera pendiente</p>
                {isLoading ? <Skeleton height="2rem" width="120px" className="rounded-lg mb-1" /> : (
                    <p className="text-3xl font-bold" style={{ color: totalDebt > 0 ? '#EF4444' : 'var(--toul-text)' }}>{formatCOP(totalDebt)}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 }}>
                    <p className="text-xs" style={{ color: 'var(--toul-text-subtle)', margin: 0 }}>
                        {(customers || []).filter(c => c.total_debt > 0).length} clientes con saldo pendiente
                    </p>
                    <button onClick={cuadrarTodo} disabled={cuadrando}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                            height: 28, padding: '0 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                            background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--toul-text-muted)', fontSize: 11.5, fontWeight: 600,
                        }}>
                        <Wrench size={12} /> {cuadrando ? 'Cuadrando…' : 'Cuadrar deudas'}
                    </button>
                </div>
            </motion.div>

            {/* Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="toul-card overflow-hidden"
                    >
                        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Nuevo cliente</h3>
                        <div className="flex flex-col gap-3">
                            <input className="toul-input" autoCapitalize="sentences" placeholder="Nombre del cliente *" value={form.name} onChange={e => setForm(f => ({ ...f, name: capitalizeFirst(e.target.value) }))} />
                            <input className="toul-input" placeholder="WhatsApp / teléfono (opcional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            <button onClick={handleCreate} disabled={saving} className="toul-btn-primary">{saving ? 'Creando...' : 'Crear cliente'}</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Clientes repetidos */}
            {repetidos.length > 0 && (
                <motion.button variants={fadeUp} initial="hidden" animate="visible"
                    onClick={() => setDupOpen(true)}
                    style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                        padding: '12px 14px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)',
                    }}>
                    <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)' }}>
                            {repetidos.length} {repetidos.length === 1 ? 'cliente está repetido' : 'clientes están repetidos'}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)', lineHeight: 1.45 }}>
                            Su deuda y sus ventas quedaron partidas. Toca para unirlos.
                        </span>
                    </span>
                </motion.button>
            )}

            <Sheet open={dupOpen} onClose={() => setDupOpen(false)}
                title="Clientes repetidos"
                subtitle="Al unirlos, sus ventas y su deuda quedan en un solo registro.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                    {repetidos.map(grupo => (
                        <div key={grupo[0].id} className="toul-card" style={{ padding: '12px 14px' }}>
                            <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{grupo[0].name}</p>
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 10px' }}>
                                {grupo.length} registros · {formatCOP(grupo.reduce((sum, c) => sum + Number(c.total_debt), 0))} en total
                            </p>
                            <button onClick={() => unir(grupo)} disabled={merging === grupo[0].id}
                                style={{
                                    height: 38, padding: '0 14px', borderRadius: 11, border: 'none', cursor: 'pointer',
                                    fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
                                    background: 'var(--toul-accent)', color: '#000',
                                }}>
                                {merging === grupo[0].id ? 'Uniendo…' : 'Unir en uno solo'}
                            </button>
                        </div>
                    ))}
                    {repetidos.length === 0 && (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '20px 10px', margin: 0 }}>
                            Ya no hay clientes repetidos.
                        </p>
                    )}
                </div>
            </Sheet>

            {/* Filtros */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                style={{ display: 'flex', gap: 7, marginBottom: 12, overflowX: 'auto', paddingBottom: 2 }}>
                {([
                    { key: 'todos' as Filtro, label: 'Todos' },
                    { key: 'deben' as Filtro, label: 'Deben' },
                    { key: 'alDia' as Filtro, label: 'Al día' },
                    { key: 'abonaron' as Filtro, label: 'Han abonado' },
                    { key: 'sinAbonar' as Filtro, label: 'Deben y no han abonado' },
                ]).map(chip => {
                    const active = filtro === chip.key
                    return (
                        <button key={chip.key} onClick={() => setFiltro(chip.key)}
                            style={{
                                height: 34, padding: '0 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                                fontSize: 13, whiteSpace: 'nowrap', fontWeight: active ? 600 : 500,
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)',
                            }}>
                            {chip.label}
                        </button>
                    )
                })}
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-4">
                <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                <input className="toul-input" style={{ paddingLeft: 42 }} placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </motion.div>

            {/* List */}
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3, 4, 5].map(n => <Skeleton key={n} height="72px" className="rounded-2xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="toul-card text-center py-12">
                    <Users size={36} className="mx-auto mb-2" style={{ color: 'var(--toul-border-2)' }} />
                    <p className="font-semibold mb-1" style={{ color: 'var(--toul-text)' }}>Sin clientes</p>
                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                        {filtro === 'deben' ? 'Ningún cliente te debe.'
                            : filtro === 'alDia' ? 'Todos tus clientes tienen saldo pendiente.'
                                : filtro === 'abonaron' ? 'Todavía nadie te ha abonado.'
                                    : filtro === 'sinAbonar' ? 'Todos los que te deben ya te han abonado algo.'
                                        : 'Agrega tu primer cliente para empezar'}
                    </p>
                </div>
            ) : (
                <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-2">
                    {filtered.map(customer => (
                        <motion.div key={customer.id} variants={staggerItem}>
                            <Link href={`/customers/${customer.id}`} style={{ textDecoration: 'none' }}>
                                <div className="toul-card flex items-center gap-3 py-3 hover:border-slate-700 transition-colors" >
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold"
                                        style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-accent)' }}>
                                        {customer.name[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold truncate" style={{ color: 'var(--toul-text)' }}>{customer.name}</p>
                                        {customer.phone && <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{customer.phone}</p>}
                                    </div>
                                    {customer.total_debt > 0 && (
                                        <span className="text-sm font-bold flex-shrink-0" style={{ color: '#EF4444' }}>
                                            {formatCOP(customer.total_debt)}
                                        </span>
                                    )}
                                </div>
                            </Link>
                        </motion.div>
                    ))}
                </motion.div>
            )}
        </div>
    )
}
