'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { TrendingUp, Search, SlidersHorizontal, User, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import toast from 'react-hot-toast'

// Define Client type (using what's likely the existing structure)
interface Client {
    id: string
    name: string
    phone: string
    total_debt: number
    // other fields like last_purchase, etc. might exist
}

export default function ClientsPage() {
    const supabase = createClient()
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return

            // Load Clients, ordering by debt first, then name
            const { data } = await supabase
                .from('clients')
                .select('*')
                .eq('store_id', store.id)
                .order('total_debt', { ascending: false })
                .order('name', { ascending: true })

            setClients(data || [])
            setLoading(false)
        }
        load()
    }, [supabase])

    const filtered = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.phone && c.phone.includes(searchQuery))
    )

    const totalPortfolio = clients.reduce((sum, c) => sum + Number(c.total_debt || 0), 0)

    // Simple AI Insight logic for demo
    const bestClient = clients.length > 0 ? [...clients].sort((a, b) => Number(b.total_debt) - Number(a.total_debt))[0] : null;

    if (loading) return (
        <div className="px-4 py-6">
            <div className="skeleton h-8 w-48 mb-6" />
            <div className="flex gap-3 mb-6">
                <div className="skeleton h-24 flex-1 rounded-2xl" />
                <div className="skeleton h-24 flex-1 rounded-2xl" />
            </div>
            <div className="skeleton h-12 w-full rounded-xl mb-4" />
            <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full rounded-2xl" />)}
            </div>
        </div>
    )

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Clientes</h1>
                </div>
                <button
                    onClick={() => toast.success('Pronto: Añadir cliente')}
                    className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all active:scale-95"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                    Nuevo
                </button>
            </motion.div>

            {/* Top Stats */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 mb-6">
                {/* Cartera Total */}
                <div className="toul-card p-4 flex flex-col justify-center text-center items-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                        <TrendingUp size={16} />
                    </div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Cartera Total A Favor</p>
                    <p className="font-bold text-lg leading-tight" style={{ color: 'var(--toul-accent)' }}>{formatCOP(totalPortfolio)}</p>
                </div>

                {/* AI Insight */}
                <div className="toul-card p-4 flex flex-col justify-center text-center items-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none" />
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                        <Sparkles size={16} />
                    </div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Mayor Deudor</p>
                    <p className="font-bold text-sm truncate w-full px-2" style={{ color: 'var(--toul-text)' }}>
                        {bestClient && Number(bestClient.total_debt) > 0 ? bestClient.name : 'Ninguno'}
                    </p>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--toul-text-muted)' }} />
                <input
                    type="text"
                    placeholder="Buscar cliente por nombre o teléfono..."
                    className="toul-input w-full pl-10 pr-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
                    style={{ color: 'var(--toul-text-subtle)' }}>
                    <SlidersHorizontal size={16} />
                </button>
            </motion.div>

            {/* List */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-3">
                <AnimatePresence>
                    {filtered.map(client => {
                        const debt = Number(client.total_debt || 0)
                        return (
                            <Link href={`/clients/${client.id}`} key={client.id} className="block" style={{ textDecoration: 'none' }}>
                                <motion.div variants={staggerItem} layout
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                    className="toul-card p-3 flex items-center gap-4 transition-all active:scale-[0.98]">

                                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                        <User size={20} />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-sm truncate mb-0.5" style={{ color: 'var(--toul-text)' }}>
                                            {client.name}
                                        </h3>
                                        <p className="text-xs truncate font-mono" style={{ color: 'var(--toul-text-subtle)' }}>
                                            {client.phone || 'Sin teléfono'}
                                        </p>
                                    </div>

                                    <div className="text-right flex-shrink-0">
                                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Deuda</p>
                                        <div className="inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold"
                                            style={{
                                                background: debt > 0 ? 'rgba(16,185,129,0.1)' : 'var(--toul-surface-2)',
                                                color: debt > 0 ? 'var(--toul-accent)' : 'var(--toul-text-muted)'
                                            }}>
                                            {formatCOP(debt)}
                                        </div>
                                    </div>
                                </motion.div>
                            </Link>
                        )
                    })}
                    {filtered.length === 0 && (
                        <motion.div variants={staggerItem} className="py-10 text-center text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                            No encontramos clientes {searchQuery && 'con esa búsqueda'}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </div>
    )
}
