'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CreditCard, X, CheckCircle2, Package, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { formatCOP } from '@/lib/utils'

interface ProviderPaymentModalProps {
    storeId: string
    providerId: string
    providerName: string
    totalDebt: number
    onClose: () => void
    onSuccess: () => void
}

export function ProviderPaymentModal({ storeId, providerId, providerName, totalDebt, onClose, onSuccess }: ProviderPaymentModalProps) {
    const supabase = createClient()

    const [amount, setAmount] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'capital'>('cash')
    const [saving, setSaving] = useState(false)
    const [cashWallets, setCashWallets] = useState<{ id: string, name: string }[]>([])
    const [selectedCashWallet, setSelectedCashWallet] = useState('')

    // Fetch cash wallets on mount
    useEffect(() => {
        const loadCashWallets = async () => {
            const { data } = await supabase.from('payment_methods').select('id, name').eq('store_id', storeId).eq('is_active', true).order('sort_order')
            if (data) {
                setCashWallets(data)
                if (data.length > 0) setSelectedCashWallet(data[0].id)
            }
        }
        loadCashWallets()
    }, [storeId, supabase])

    const maxAmount = totalDebt

    const handleConfirm = async () => {
        const payAmount = Number(amount)
        if (payAmount <= 0 || payAmount > maxAmount) {
            toast.error('Monto inválido')
            return
        }

        setSaving(true)
        try {
            const walletName = cashWallets.find(w => w.id === selectedCashWallet)?.name

            const response = await fetch('/api/providers/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerId,
                    amount: payAmount,
                    paymentMethod,
                    walletId: selectedCashWallet,
                    walletName
                })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Error al registrar el pago')

            toast.success('Pago registrado correctamente')
            onSuccess()
            onClose()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al registrar el pago')
            setSaving(false)
        }
    }

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
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text)' }}>
                            <CreditCard size={16} />
                        </div>
                        <h2 className="font-bold text-lg" style={{ color: 'var(--toul-text)' }}>Abonar a {providerName}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--toul-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="text-center p-4 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }}>
                        <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>Deuda Total</p>
                        <p className="text-2xl font-bold" style={{ color: 'var(--toul-error)' }}>{formatCOP(totalDebt)}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                            Monto a abonar <span style={{ color: 'var(--toul-error)' }}>*</span>
                        </label>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-medium" style={{ color: 'var(--toul-text-muted)' }}>$</span>
                            <input
                                type="number"
                                min="1"
                                max={maxAmount}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="toul-input w-full pl-8 text-lg font-bold"
                                placeholder={`Max: ${maxAmount}`}
                            />
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={() => setAmount(String(Math.floor(maxAmount / 2)))}
                                className="px-3 py-1 text-xs rounded-full font-medium" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                50%
                            </button>
                            <button onClick={() => setAmount(String(maxAmount))}
                                className="px-3 py-1 text-xs rounded-full font-medium" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                                Todo ({formatCOP(maxAmount)})
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>Método de Pago</label>
                        <div className="space-y-3">
                            <button onClick={() => setPaymentMethod('cash')}
                                className={`w-full toul-card p-3 flex items-center justify-between transition-all ${paymentMethod === 'cash' ? 'ring-2' : ''}`}
                                style={{ borderColor: paymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-border)', '--tw-ring-color': 'var(--toul-accent)' } as any}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                                        <CreditCard size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>Efectivo / Banco</p>
                                        <p className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>Se descuenta de la caja</p>
                                    </div>
                                </div>
                                {paymentMethod === 'cash' && <CheckCircle2 size={18} style={{ color: 'var(--toul-accent)' }} />}
                            </button>

                            {paymentMethod === 'cash' && (
                                <div className="pl-4 border-l-2 ml-4" style={{ borderColor: 'var(--toul-accent)' }}>
                                    <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                                        Seleccionar cuenta:
                                    </label>
                                    <select
                                        className="toul-input w-full py-2 text-sm"
                                        value={selectedCashWallet}
                                        onChange={(e) => setSelectedCashWallet(e.target.value)}
                                    >
                                        {cashWallets.map(wallet => (
                                            <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                                        ))}
                                        {cashWallets.length === 0 && (
                                            <option value="" disabled>No hay cuentas de caja</option>
                                        )}
                                    </select>
                                </div>
                            )}

                            <button onClick={() => setPaymentMethod('capital')}
                                className={`w-full toul-card p-3 flex items-center justify-between transition-all ${paymentMethod === 'capital' ? 'ring-2' : ''}`}
                                style={{ borderColor: paymentMethod === 'capital' ? '#6366f1' : 'var(--toul-border)', '--tw-ring-color': '#6366f1' } as any}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                                        <Package size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>Capital Propio</p>
                                        <p className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>Inyección de bolsillo</p>
                                    </div>
                                </div>
                                {paymentMethod === 'capital' && <CheckCircle2 size={18} style={{ color: '#6366f1' }} />}
                            </button>
                        </div>
                    </div>

                    {/* Alerts */}
                    {paymentMethod === 'capital' && (
                        <div className="p-3 rounded-xl flex items-start gap-2 text-xs" style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                            <p>Se registrará una <strong>inyección de capital propio</strong>. El saldo de tu caja no se verá afectado.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 dark:bg-gray-900/50" style={{ borderColor: 'var(--toul-border)' }}>
                    <button
                        disabled={saving || !amount || Number(amount) <= 0 || Number(amount) > maxAmount}
                        onClick={handleConfirm}
                        className="toul-btn-primary w-full flex items-center justify-center gap-2">
                        {saving ? (
                            <span className="flex items-center justify-center gap-2">
                                <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Registrando...
                            </span>
                        ) : `Abonar ${formatCOP(Number(amount) || 0)}`}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
