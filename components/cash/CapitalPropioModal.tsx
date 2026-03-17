'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Package, X, ArrowDownRight, Calendar } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

interface CapitalPropioModalProps {
    storeId: string
    onClose: () => void
}

export function CapitalPropioModal({ storeId, onClose }: CapitalPropioModalProps) {
    const supabase = createClient()
    const [injections, setInjections] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from('owner_capital_injections')
                .select('*')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })

            setInjections(data || [])
            setLoading(false)
        }
        load()
    }, [supabase, storeId])

    const totalInvested = injections.reduce((sum, item) => sum + Number(item.amount), 0)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-md bg-white dark:bg-[#111] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white/80 dark:bg-[#111]/80 backdrop-blur-md z-10"
                    style={{ borderColor: 'var(--toul-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                            <Package size={16} />
                        </div>
                        <h2 className="font-bold text-lg" style={{ color: 'var(--toul-text)' }}>Capital Propio</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--toul-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="text-center p-6 rounded-3xl relative overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.02) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/20 to-transparent rounded-bl-full pointer-events-none" />

                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>Total Inyectado</p>
                        {loading ? (
                            <div className="skeleton w-32 h-10 mx-auto rounded-lg" />
                        ) : (
                            <p className="text-4xl font-black tracking-tight" style={{ color: '#6366f1' }}>
                                {formatCOP(totalInvested)}
                            </p>
                        )}
                    </div>

                    <div>
                        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Historial de Uso</h3>

                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-full rounded-2xl" />)}
                            </div>
                        ) : injections.length === 0 ? (
                            <div className="text-center py-8 toul-card">
                                <Package size={24} className="mx-auto mb-2 opacity-20 text-indigo-500" />
                                <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Aún no has usado capital propio.</p>
                                <p className="text-xs mt-1 max-w-[250px] mx-auto" style={{ color: 'var(--toul-text-subtle)' }}>
                                    Aparecerá aquí cuando pagues compras o gastos con dinero de tu bolsillo.
                                </p>
                            </div>
                        ) : (
                            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-2">
                                {injections.map(item => (
                                    <motion.div key={item.id} variants={staggerItem} className="toul-card p-3 flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                            <ArrowDownRight size={16} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate text-indigo-500 dark:text-indigo-400">
                                                {formatCOP(Number(item.amount))}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5 text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                                <Calendar size={12} />
                                                <span>{new Date(item.created_at).toLocaleDateString('es-CO')}</span>
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 text-right max-w-[120px]">
                                            <p className="text-xs truncate" style={{ color: 'var(--toul-text)' }}>
                                                {item.reference_type === 'purchase' ? 'Compra de inv.' :
                                                    item.reference_type === 'provider_payment' ? 'Abono a prov.' : 'Gasto'}
                                            </p>
                                            {item.notes && <p className="text-[10px] truncate" style={{ color: 'var(--toul-text-subtle)' }}>{item.notes}</p>}
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
