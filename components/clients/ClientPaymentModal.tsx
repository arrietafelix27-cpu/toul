'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CreditCard, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { formatCOP } from '@/lib/utils'

interface ClientPaymentModalProps {
    storeId: string
    clientId: string
    clientName: string
    totalDebt: number
    onClose: () => void
    onSuccess: () => void
}

export function ClientPaymentModal({ storeId, clientId, clientName, totalDebt, onClose, onSuccess }: ClientPaymentModalProps) {
    const supabase = createClient()

    const [amount, setAmount] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash') // Example options, could be expanded
    const [saving, setSaving] = useState(false)

    const maxAmount = totalDebt

    const handleConfirm = async () => {
        const payAmount = Number(amount)
        if (payAmount <= 0 || payAmount > maxAmount) {
            toast.error('Monto inválido')
            return
        }

        setSaving(true)
        try {
            // Use the new atomic API
            const response = await fetch('/api/customers/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: clientId,
                    amount: payAmount,
                    methodName: paymentMethod === 'cash' ? 'Efectivo' : 'Transferencia', // Simplified for now
                    notes: `Abono de cliente ${clientName}`
                })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Error al registrar el abono')

            toast.success('Abono registrado correctamente')
            onSuccess()
            onClose()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al registrar el abono')
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
                        <h2 className="font-bold text-lg" style={{ color: 'var(--toul-text)' }}>Recibir abono de {clientName}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--toul-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-6">
                    <div className="text-center p-4 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }}>
                        <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>Deuda Total</p>
                        <p className="text-2xl font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(totalDebt)}</p>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                            Monto del abono <span style={{ color: 'var(--toul-error)' }}>*</span>
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
                        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>Método de Ingreso</label>
                        <div className="space-y-3">
                            <button onClick={() => setPaymentMethod('cash')}
                                className={`w-full toul-card p-3 flex items-center justify-between transition-all ${paymentMethod === 'cash' ? 'ring-2' : ''}`}
                                style={{ borderColor: paymentMethod === 'cash' ? 'var(--toul-accent)' : 'var(--toul-border)', '--tw-ring-color': 'var(--toul-accent)' } as any}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                                        <CreditCard size={16} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>Efectivo / Transferencia</p>
                                        <p className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>Ingresa directo a tu caja</p>
                                    </div>
                                </div>
                                {paymentMethod === 'cash' && <CheckCircle2 size={18} style={{ color: 'var(--toul-accent)' }} />}
                            </button>
                        </div>
                    </div>

                    {/* Alerts */}
                    <div className="p-3 rounded-xl flex items-start gap-2 text-xs" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--toul-accent)' }}>
                        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                        <p>Al confirmar, la deuda del cliente disminuirá y el dinero ingresará a tu módulo de Caja.</p>
                    </div>
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
                        ) : `Recibir ${formatCOP(Number(amount) || 0)}`}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
