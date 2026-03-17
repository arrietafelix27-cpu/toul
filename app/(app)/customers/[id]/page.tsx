'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, formatDate } from '@/lib/utils'
import { ArrowLeft, Share2, Plus, Check } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/types'
import type { Customer, Credit } from '@/lib/types'

export default function CustomerDetailPage() {
    const { id } = useParams<{ id: string }>()
    const supabase = createClient()
    const [customer, setCustomer] = useState<Customer | null>(null)
    const [credits, setCredits] = useState<Credit[]>([])
    const [storeId, setStoreId] = useState('')
    const [storeName, setStoreName] = useState('')
    const [loading, setLoading] = useState(true)
    const [showPayment, setShowPayment] = useState(false)
    const [payAmount, setPayAmount] = useState('')
    const [payMethod, setPayMethod] = useState<PaymentMethod>('efectivo')
    const [saving, setSaving] = useState(false)

    useEffect(() => { loadData() }, [id])

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: store } = await supabase.from('stores').select('id, name').eq('owner_id', user.id).single()
        if (store) { setStoreId(store.id); setStoreName(store.name) }
        const [{ data: cust }, { data: creditData }] = await Promise.all([
            supabase.from('customers').select('*').eq('id', id).single(),
            supabase.from('credits').select('*').eq('customer_id', id).order('created_at', { ascending: false }),
        ])
        setCustomer(cust); setCredits(creditData || []); setLoading(false)
    }

    async function handlePayment() {
        const amount = Number(payAmount)
        if (!amount || amount <= 0) { toast.error('Ingresa un monto válido'); return }
        if (amount > (customer?.total_debt || 0)) { toast.error('El abono supera la deuda'); return }
        setSaving(true)
        await supabase.from('credits').insert({ store_id: storeId, customer_id: id, type: 'payment', amount, payment_method: payMethod, notes: `Abono de ${customer?.name}` })
        await supabase.from('customers').update({ total_debt: (customer?.total_debt || 0) - amount }).eq('id', id)
        await supabase.from('payments').insert({ store_id: storeId, type: 'credit_payment', method: payMethod, amount, reference_id: id, notes: `Abono cliente: ${customer?.name}` })
        toast.success(`Abono de ${formatCOP(amount)} registrado ✅`)
        setShowPayment(false); setPayAmount(''); loadData(); setSaving(false)
    }

    function shareWhatsApp() {
        if (!customer?.phone || !storeId) return
        const msg = `Hola ${customer.name} 👋\n\nTe enviamos tu estado de cuenta de *${storeName}*:\n\n💰 Saldo pendiente: *${formatCOP(customer.total_debt)}*\n\nGracias por tu confianza 🙏`
        window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    if (loading) return <div className="p-4"><div className="skeleton h-48 rounded-2xl" /></div>
    if (!customer) return <div className="p-4 text-center" style={{ color: 'var(--toul-text-muted)' }}>Cliente no encontrado</div>

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 fade-in">
            <div className="flex items-center gap-3 mb-5">
                <Link href="/customers" className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <h1 className="text-lg font-bold flex-1" style={{ color: 'var(--toul-text)' }}>{customer.name}</h1>
                {customer.phone && (
                    <button onClick={shareWhatsApp} className="w-9 h-9 rounded-full flex items-center justify-center text-white"
                        style={{ background: '#16a34a' }}>
                        <Share2 size={16} />
                    </button>
                )}
            </div>

            {/* Debt hero */}
            <div className="toul-card mb-4 text-center py-6">
                <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>Saldo pendiente</p>
                <p className="text-4xl font-bold" style={{ color: customer.total_debt > 0 ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                    {formatCOP(customer.total_debt)}
                </p>
                {customer.total_debt === 0 && <p className="text-sm mt-1" style={{ color: 'var(--toul-accent)' }}>✅ Al día</p>}
            </div>

            {/* Payment */}
            {customer.total_debt > 0 && (
                <div className="mb-4">
                    {!showPayment ? (
                        <button onClick={() => setShowPayment(true)} className="toul-btn-primary">
                            <Plus size={16} /> Registrar abono
                        </button>
                    ) : (
                        <div className="toul-card fade-in">
                            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text)' }}>Registrar abono</h3>
                            <div className="flex flex-col gap-3">
                                <input className="toul-input" type="number" min={0} max={customer.total_debt} placeholder="Monto del abono" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                                <select className="toul-input" value={payMethod} onChange={e => setPayMethod(e.target.value as PaymentMethod)}>
                                    {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                                </select>
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => setShowPayment(false)} className="toul-btn-secondary">Cancelar</button>
                                    <button onClick={handlePayment} disabled={saving} className="toul-btn-primary">
                                        {saving ? 'Guardando...' : <><Check size={14} /> Confirmar</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {customer.phone && <p className="text-sm mb-3" style={{ color: 'var(--toul-text-muted)' }}>📱 {customer.phone}</p>}
            {customer.notes && <p className="text-sm mb-4" style={{ color: 'var(--toul-text-muted)' }}>📝 {customer.notes}</p>}

            {/* History */}
            <h2 className="text-sm font-bold mb-3" style={{ color: 'var(--toul-text-muted)' }}>Historial</h2>
            {credits.length === 0 ? (
                <div className="toul-card text-center py-6">
                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Sin movimientos</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {credits.map(credit => (
                        <div key={credit.id} className="toul-card flex items-center gap-3 py-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                                style={credit.type === 'debt'
                                    ? { background: 'var(--toul-error-dim)', color: 'var(--toul-error)' }
                                    : { background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                {credit.type === 'debt' ? '−' : '+'}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{credit.type === 'debt' ? 'Venta a crédito' : 'Abono'}</p>
                                <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{formatDate(credit.created_at)}</p>
                                {credit.notes && <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>{credit.notes}</p>}
                            </div>
                            <p className="font-bold text-sm flex-shrink-0"
                                style={{ color: credit.type === 'debt' ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                {credit.type === 'debt' ? '−' : '+'}{formatCOP(credit.amount)}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
