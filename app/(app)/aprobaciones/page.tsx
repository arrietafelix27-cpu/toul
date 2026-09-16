'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Ban, CreditCard, Check, X, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { PushPrompt } from '@/components/isla/PushPrompt'
import { Sheet } from '@/components/isla/Sheet'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'
import type { ApprovalRequest } from '@/lib/isla/types'

const supabase = createClient()

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
    approved: { text: 'Aprobada', color: 'var(--toul-accent)' },
    used: { text: 'Aprobada', color: 'var(--toul-accent)' },
    rejected: { text: 'Rechazada', color: 'var(--toul-error)' },
    cancelled: { text: 'Cancelada', color: 'var(--toul-text-dim)' },
    expired: { text: 'Vencida', color: 'var(--toul-text-dim)' },
}

const ago = (iso: string) => {
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (min < 1) return 'ahora'
    if (min < 60) return `hace ${min} min`
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

interface SaleInfo { id: string; total: number; created_at: string; seller_name: string | null; sale_items: { quantity: number; products: { name: string } | null; combos: { name: string } | null }[] }

export default function AprobacionesPage() {
    const { data: ctx } = useSessionContext()
    const { mutate: globalMutate } = useSWRConfig()
    const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null)
    const [note, setNote] = useState('')
    const [busyId, setBusyId] = useState<string | null>(null)

    const { data, isLoading, mutate } = useSWR(ctx ? ['aprobaciones', ctx.storeId] : null, async () => {
        const [pending, history] = await Promise.all([
            supabase.from('approval_requests').select('*').eq('store_id', ctx!.storeId).eq('status', 'pending').order('requested_at'),
            supabase.from('approval_requests').select('*').eq('store_id', ctx!.storeId).neq('status', 'pending').order('requested_at', { ascending: false }).limit(30),
        ])
        const saleIds = (pending.data ?? []).map(r => r.sale_id).filter(Boolean)
        const sales = saleIds.length
            ? (await supabase.from('sales').select('id, total, created_at, seller_name, sale_items(quantity, products(name), combos(name))').in('id', saleIds)).data ?? []
            : []
        return {
            pending: (pending.data ?? []) as ApprovalRequest[],
            history: (history.data ?? []) as ApprovalRequest[],
            sales: new Map((sales as unknown as SaleInfo[]).map(s => [s.id, s])),
        }
    }, { refreshInterval: 8_000, revalidateOnFocus: true })

    async function resolve(req: ApprovalRequest, approve: boolean, resolutionNote?: string) {
        setBusyId(req.id)
        const { data: result, error } = await supabase.rpc('toul_resolve_approval', {
            p_request_id: req.id, p_approve: approve, p_note: resolutionNote ?? null,
        })
        setBusyId(null)
        if (error) { toast.error(error.message); mutate(); return }
        const status = (result as { status: string }).status
        if (status === 'expired') toast.error('La solicitud ya había vencido')
        else if (!approve) toast.success('Solicitud rechazada')
        else if (req.type === 'void_sale') toast.success('Venta anulada. Inventario y caja actualizados.')
        else toast.success('Crédito aprobado. El vendedor ya puede confirmar la venta.')
        setRejecting(null)
        setNote('')
        mutate()
        globalMutate('isla-pending-approvals')
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-8" style={{ position: 'relative', maxWidth: 860 }}>
            <div className="toul-ambient" />
            <div className="mb-5" style={{ position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Modo isla</p>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Aprobaciones</h1>
            </div>

            <PushPrompt compact />

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1].map(i => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 18 }} />)}</div>
            ) : (data?.pending.length ?? 0) === 0 ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '44px 20px' }}>
                    <Inbox size={32} strokeWidth={1.5} style={{ color: 'var(--toul-text-faint)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Nada pendiente</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>Cuando un vendedor pida anular o fiar, aparece aquí.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <AnimatePresence initial={false}>
                        {data!.pending.map(req => {
                            const isVoid = req.type === 'void_sale'
                            const sale = req.sale_id ? data!.sales.get(req.sale_id) : undefined
                            const busy = busyId === req.id
                            return (
                                <motion.div key={req.id} layout
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}
                                    className="toul-card" style={{ padding: 18 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isVoid ? 'var(--toul-error-dim)' : 'var(--toul-info-dim)' }}>
                                            {isVoid ? <Ban size={20} style={{ color: 'var(--toul-error)' }} /> : <CreditCard size={20} style={{ color: 'var(--toul-info)' }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                                                {req.requested_by_name ?? 'Vendedor'} · {ago(req.requested_at)}
                                            </p>
                                            <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '2px 0 6px' }}>
                                                {isVoid ? `Anular venta de ${formatCOP(req.amount ?? 0)}` : `Fiar ${formatCOP(req.amount ?? 0)} a ${req.details.customerName ?? 'cliente'}`}
                                            </p>
                                            {isVoid ? (
                                                <>
                                                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0 }}>Motivo: <span style={{ color: 'var(--toul-text)' }}>{req.reason}</span></p>
                                                    {sale && (
                                                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                                                            {sale.sale_items.map(i => `${i.quantity}× ${i.combos?.name ?? i.products?.name ?? 'Producto'}`).join(', ')}
                                                            {' · '}{new Date(sale.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    )}
                                                </>
                                            ) : (
                                                <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0 }}>
                                                    {req.details.items?.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                                                    {req.details.initialPayment ? ` · Abono ${formatCOP(req.details.initialPayment)}` : ' · Sin abono'}
                                                    {req.details.dueDate ? ` · Vence ${new Date(req.details.dueDate + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                        <motion.button whileTap={{ scale: 0.97 }} transition={SPRING_PRESS} disabled={busy}
                                            onClick={() => { setRejecting(req); setNote('') }}
                                            style={{ flex: 1, height: 50, borderRadius: 14, border: '1px solid var(--toul-border)', background: 'var(--toul-surface)', color: 'var(--toul-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit' }}>
                                            <X size={17} /> Rechazar
                                        </motion.button>
                                        <motion.button whileTap={{ scale: 0.97 }} transition={SPRING_PRESS} disabled={busy}
                                            onClick={() => resolve(req, true)}
                                            style={{ flex: 1, height: 50, borderRadius: 14, border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 20px var(--toul-accent-glow)', fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                                            <Check size={17} strokeWidth={2.6} /> {busy ? 'Procesando…' : isVoid ? 'Aprobar y anular' : 'Aprobar crédito'}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            )}

            {(data?.history.length ?? 0) > 0 && (
                <>
                    <p className="toul-section-label" style={{ marginTop: 28 }}>Historial</p>
                    <div className="toul-card" style={{ padding: '4px 16px' }}>
                        {data!.history.map((req, i) => {
                            const label = STATUS_LABEL[req.status] ?? { text: req.status, color: 'var(--toul-text-dim)' }
                            return (
                                <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                                            {req.type === 'void_sale' ? 'Anulación' : `Crédito a ${req.details.customerName ?? 'cliente'}`} · {formatCOP(req.amount ?? 0)}
                                        </p>
                                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                            {req.requested_by_name} · {ago(req.requested_at)}{req.reason ? ` · ${req.reason}` : ''}{req.resolution_note ? ` · Nota: ${req.resolution_note}` : ''}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: label.color }}>{label.text}</span>
                                </div>
                            )
                        })}
                    </div>
                </>
            )}

            <Sheet open={!!rejecting} onClose={() => setRejecting(null)} title="Rechazar solicitud" subtitle="El vendedor verá tu nota en la caja."
                footer={
                    <button className="toul-btn-primary" disabled={busyId === rejecting?.id}
                        onClick={() => rejecting && resolve(rejecting, false, note)}
                        style={{ background: 'var(--toul-error)', color: '#fff' }}>
                        {busyId === rejecting?.id ? 'Rechazando…' : 'Rechazar'}
                    </button>
                }>
                <textarea className="toul-input" rows={3} placeholder="Nota para el vendedor (opcional)" value={note}
                    onChange={e => setNote(e.target.value)} maxLength={200} style={{ resize: 'none', height: 'auto', paddingTop: 12 }} autoFocus />
            </Sheet>
        </div>
    )
}
