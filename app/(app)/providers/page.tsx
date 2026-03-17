'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Users, Search, TrendingDown, Clock, SearchX, Plus } from 'lucide-react'
import Link from 'next/link'
import type { Provider } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import { Skeleton } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import dynamic from 'next/dynamic'

const PAGE_SIZE = 50

const NewProviderModal = dynamic(() => import('@/components/providers/NewProviderModal').then(m => m.NewProviderModal), {
    loading: () => <Skeleton height="400px" className="rounded-3xl" />
})

export default function ProvidersPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [searchQuery, setSearchQuery] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [hasMore, setHasMore] = useState(true)

    const { data: providers, isLoading, isValidating, mutate } = useSWR<Provider[]>(
        storeId ? ['providers', storeId, searchQuery, limit] : null,
        async () => {
            let q = supabase.from('providers').select('*').eq('store_id', storeId).order('name', { ascending: true })
            if (searchQuery) q = q.ilike('name', `%${searchQuery}%`)
            q = q.limit(limit + 1)
            const { data, error } = await q
            if (error) throw error
            const results = data as Provider[]
            if (results.length > limit) {
                setHasMore(true)
                return results.slice(0, limit)
            } else {
                setHasMore(false)
                return results
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const totalDebt = useMemo(() => (providers || []).reduce((sum, p) => sum + Number(p.total_debt), 0), [providers])

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="flex items-center justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Proveedores</h1>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex justify-center items-center gap-2 toul-btn-primary py-2 px-4 shadow-sm active:scale-95 transition-transform"
                >
                    <Plus size={16} /> <span className="text-sm font-semibold">Nuevo</span>
                </button>
            </motion.div>

            {/* Top Stats */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 mb-6">
                <div className="toul-card p-4 flex flex-col justify-center">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                        <TrendingDown size={16} />
                    </div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Deuda Total</p>
                    {(isLoading || storeLoading) ? (
                        <Skeleton height="1.25rem" width="100px" className="rounded mt-1" />
                    ) : (
                        <p className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(totalDebt)}</p>
                    )}
                </div>

                <div className="toul-card p-4 flex flex-col justify-center" style={{ borderLeft: '3px solid var(--toul-error)' }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center mb-2" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-active)' }}>
                        <Clock size={16} />
                    </div>
                    <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Próximas a vencer</p>
                    <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>0 facturas</p>
                </div>
            </motion.div>

            {/* Search */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="relative mb-6">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--toul-text-muted)' }} />
                <input
                    type="text"
                    placeholder="Buscar proveedor..."
                    className="toul-input w-full pl-10"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setLimit(PAGE_SIZE) }}
                />
            </motion.div>

            {/* List */}
            {(isLoading || storeLoading) ? (
                <div className="flex flex-col gap-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height="80px" className="rounded-2xl" />)}
                </div>
            ) : (
                <>
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-col gap-3">
                        <AnimatePresence>
                            {(providers || []).map(provider => (
                                <Link href={`/providers/${provider.id}`} key={provider.id} className="block" style={{ textDecoration: 'none' }}>
                                    <motion.div variants={staggerItem} layout
                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                        className="toul-card p-4 flex items-center gap-4 transition-all active:scale-[0.98]">
                                        <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                            <Users size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-2">
                                            <h3 className="font-bold text-sm truncate mb-0.5" style={{ color: 'var(--toul-text)' }}>{provider.name}</h3>
                                            {provider.phone && (
                                                <p className="text-xs font-mono truncate" style={{ color: 'var(--toul-text-subtle)' }}>{provider.phone}</p>
                                            )}
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Deuda</p>
                                            <p className="text-sm font-bold" style={{ color: Number(provider.total_debt) > 0 ? 'var(--toul-error)' : 'var(--toul-text)' }}>
                                                {formatCOP(Number(provider.total_debt))}
                                            </p>
                                        </div>
                                    </motion.div>
                                </Link>
                            ))}
                        </AnimatePresence>
                    </motion.div>

                    {hasMore && (
                        <button
                            onClick={() => setLimit(l => l + PAGE_SIZE)}
                            disabled={isValidating}
                            className="w-full py-4 mt-4 rounded-2xl border border-dashed font-semibold text-xs transition-colors hover:bg-slate-900/50"
                            style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)' }}
                        >
                            {isValidating ? 'Cargando...' : 'Cargar más proveedores'}
                        </button>
                    )}

                    {(providers || []).length === 0 && (
                        <motion.div variants={staggerItem} className="py-10 text-center flex flex-col items-center">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-subtle)' }}>
                                <SearchX size={24} />
                            </div>
                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text-muted)' }}>
                                No se encontraron proveedores {searchQuery && 'con esa búsqueda'}
                            </p>
                        </motion.div>
                    )}
                </>
            )}

            <AnimatePresence>
                {showModal && (
                    <NewProviderModal
                        onClose={() => setShowModal(false)}
                        onSuccess={() => mutate()}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
