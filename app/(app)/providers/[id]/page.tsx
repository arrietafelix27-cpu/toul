'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Users, Receipt, CreditCard, Calendar, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Provider } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import toast from 'react-hot-toast'
import { ProviderPaymentModal } from '@/components/providers/ProviderPaymentModal'

export default function ProviderDetailsPage({ params }: { params: { id: string } }) {
    const supabase = createClient()
    const router = useRouter()

    const [provider, setProvider] = useState<Provider | null>(null)
    const [history, setHistory] = useState<any[]>([]) // Debts & Payments
    const [loading, setLoading] = useState(true)
    const [storeId, setStoreId] = useState<string | null>(null)
    const [showPaymentModal, setShowPaymentModal] = useState(false)

    const loadData = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (store) setStoreId(store.id)

        // Load Provider
        const { data: prov } = await supabase
            .from('providers')
            .select('*')
            .eq('id', params.id)
            .single()

        if (prov) setProvider(prov)

        // Load Debts (Purchases)
        const { data: debts } = await supabase
            .from('provider_debts')
            .select('*, purchases(subtotal, total)')
            .eq('provider_id', params.id)
            .order('created_at', { ascending: false })
            .limit(20)

        setHistory(debts || [])
        setLoading(false)
    }

    useEffect(() => {
        loadData()
    }, [supabase, params.id])

    if (loading) return (
        <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto space-y-6">
            <div className="flex gap-4 items-center">
                <div className="skeleton w-10 h-10 rounded-full" />
                <div className="skeleton h-8 w-48" />
            </div>
            <div className="skeleton h-32 w-full rounded-3xl" />
            <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
    )

    if (!provider) return (
        <div className="px-4 py-12 text-center text-gray-500">Proveedor no encontrado</div>
    )

    const totalDebt = Number(provider.total_debt)

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6">
                <button onClick={() => router.push('/providers')}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Proveedor</p>
                    <h1 className="text-xl font-bold truncate" style={{ color: 'var(--toul-text)' }}>{provider.name}</h1>
                </div>
            </motion.div>

            {/* Main Stats Card */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                className="toul-card p-6 mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-red-500/10 to-transparent rounded-bl-full pointer-events-none" />

                <div className="flex items-start justify-between mb-6">
                    <div>
                        <p className="text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>Deuda Actual</p>
                        <h2 className="text-3xl font-black tracking-tight" style={{ color: totalDebt > 0 ? 'var(--toul-error)' : 'var(--toul-text)' }}>
                            {formatCOP(totalDebt)}
                        </h2>
                    </div>
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                        <Users size={24} />
                    </div>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => setShowPaymentModal(true)}
                        disabled={totalDebt <= 0}
                        className="flex-1 toul-btn-primary py-2.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                        <CreditCard size={18} /> Abonar
                    </button>
                    <button className="flex-1 toul-btn-secondary py-2.5 flex items-center justify-center gap-2 text-sm">
                        Editar Info
                    </button>
                </div>
            </motion.div>

            {/* History Section */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible">
                <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--toul-text)' }}>Historial de Créditos</h3>

                <div className="space-y-3">
                    {history.length === 0 ? (
                        <div className="toul-card p-6 text-center">
                            <Receipt size={24} className="mx-auto mb-2 opacity-20" />
                            <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>No hay deudas registradas aún.</p>
                        </div>
                    ) : (
                        history.map(item => (
                            <div key={item.id} className="toul-card p-4 flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                    <Receipt size={18} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm mb-0.5 leading-tight" style={{ color: 'var(--toul-text)' }}>
                                        Compra a crédito
                                    </h4>
                                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                        <Calendar size={12} />
                                        <span>{new Date(item.created_at).toLocaleDateString('es-CO')}</span>
                                        <span>•</span>
                                        <Clock size={12} />
                                        <span style={{ color: new Date(item.due_date) < new Date() && item.status !== 'paid' ? 'var(--toul-error)' : 'inherit' }}>
                                            Vence {new Date(item.due_date).toLocaleDateString('es-CO')}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="font-bold text-sm" style={{ color: 'var(--toul-error)' }}>+{formatCOP(Number(item.amount))}</p>
                                    {item.status === 'paid' ? (
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Pagado</span>
                                    ) : (
                                        <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Saldo: {formatCOP(Number(item.remaining_amount))}</p>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </motion.div>

            {/* Modals */}
            <AnimatePresence>
                {showPaymentModal && storeId && provider && (
                    <ProviderPaymentModal
                        storeId={storeId}
                        providerId={provider.id}
                        providerName={provider.name}
                        totalDebt={totalDebt}
                        onClose={() => setShowPaymentModal(false)}
                        onSuccess={() => loadData()}
                    />
                )}
            </AnimatePresence>
        </div>
    )
}
