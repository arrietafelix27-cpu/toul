'use client'
import { useState } from 'react'
import { formatCOP } from '@/lib/utils'
import { Plus, Users, Search, X } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import type { Customer } from '@/lib/types'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToulData, useStore } from '@/lib/hooks/useData'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

export default function CustomersPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const { data: customers, isLoading, mutate } = useToulData<Customer>(
        'customers',
        storeId,
        { order: { column: 'name' } }
    )

    const [search, setSearch] = useState('')
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

    const filtered = (customers || []).filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    const totalDebt = (customers || []).reduce((s, c) => s + c.total_debt, 0)

    return (
        <div className="px-4 md:px-8 pt-6 pb-4">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center justify-between mb-5">
                <div>
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Clientes</p>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Tu cartera</h1>
                </div>
                <button onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95 text-white"
                    style={{ background: 'var(--toul-accent)' }}>
                    {showForm ? <X size={16} /> : <Plus size={16} />}
                    {showForm ? 'Cancelar' : 'Nuevo'}
                </button>
            </motion.div>

            {/* Total debt banner */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="rounded-2xl p-4 mb-4 border" style={{ background: 'var(--toul-surface)', borderColor: '#EF444422' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Total cartera pendiente</p>
                {isLoading ? <Skeleton height="2rem" width="120px" className="rounded-lg mb-1" /> : (
                    <p className="text-3xl font-bold" style={{ color: totalDebt > 0 ? '#EF4444' : 'var(--toul-text)' }}>{formatCOP(totalDebt)}</p>
                )}
                <p className="text-xs mt-0.5" style={{ color: 'var(--toul-text-subtle)' }}>{(customers || []).filter(c => c.total_debt > 0).length} clientes con saldo pendiente</p>
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
                            <input className="toul-input" placeholder="Nombre del cliente *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                            <input className="toul-input" placeholder="WhatsApp / teléfono (opcional)" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            <button onClick={handleCreate} disabled={saving} className="toul-btn-primary">{saving ? 'Creando...' : 'Crear cliente'}</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-4">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                <input className="toul-input pl-9 text-sm" placeholder="Buscar cliente..." value={search} onChange={e => setSearch(e.target.value)} />
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
                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Agrega tu primer cliente para empezar</p>
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
