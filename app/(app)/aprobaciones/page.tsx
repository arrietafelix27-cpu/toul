'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ArrowLeft, Ban, CreditCard, Check, X, Inbox, Undo2, Tag, Percent } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'
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

/** Venta hecha sin internet cobrada a un precio que no era el de esa hora */
interface PriceReview {
    id: string; total: number; created_at: string; seller_name: string | null
    price_review: { name: string; quantity: number; charged: number; price: number }[]
}

interface SaleInfo { id: string; total: number; created_at: string; seller_name: string | null; sale_items: { id: string; quantity: number; products: { name: string } | null; combos: { name: string } | null }[] }

export default function AprobacionesPage() {
    const { data: ctx } = useSessionContext()
    const { mutate: globalMutate } = useSWRConfig()
    const [rejecting, setRejecting] = useState<ApprovalRequest | null>(null)
    const [note, setNote] = useState('')
    const [busyId, setBusyId] = useState<string | null>(null)
    const { methods } = usePaymentMethods()

    const { data, isLoading, mutate } = useSWR(ctx ? ['aprobaciones', ctx.storeId] : null, async () => {
        const [pending, history, review] = await Promise.all([
            supabase.from('approval_requests').select('*').eq('store_id', ctx!.storeId).eq('status', 'pending').order('requested_at'),
            supabase.from('approval_requests').select('*').eq('store_id', ctx!.storeId).neq('status', 'pending').order('requested_at', { ascending: false }).limit(30),
            supabase.from('sales').select('id, total, created_at, seller_name, price_review').eq('store_id', ctx!.storeId)
                .not('price_review', 'is', null).is('price_reviewed_at', null).order('created_at', { ascending: false }).limit(50),
        ])
        const saleIds = (pending.data ?? []).map(r => r.sale_id).filter(Boolean)
        const sales = saleIds.length
            ? (await supabase.from('sales').select('id, total, created_at, seller_name, sale_items(id, quantity, products(name), combos(name))').in('id', saleIds)).data ?? []
            : []
        return {
            pending: (pending.data ?? []) as ApprovalRequest[],
            history: (history.data ?? []) as ApprovalRequest[],
            // Si falla (por ejemplo, la base aún no tiene la revisión de precios) no se muestra nada
            review: (review.error ? [] : review.data ?? []) as unknown as PriceReview[],
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
        else if (req.type === 'return_sale') toast.success('Devolución hecha. Inventario y caja actualizados.')
        else if (req.type === 'discount_sale') toast.success('Descuento aprobado. El vendedor ya puede cobrar.')
        else toast.success('Crédito aprobado. El vendedor ya puede confirmar la venta.')
        setRejecting(null)
        setNote('')
        mutate()
        globalMutate('isla-pending-approvals')
    }

    async function markReviewed(sale: PriceReview) {
        setBusyId(sale.id)
        const { error } = await supabase.rpc('toul_mark_sale_reviewed', { p_sale_id: sale.id })
        setBusyId(null)
        if (error) toast.error(error.message)
        else toast.success('Venta marcada como vista')
        mutate()
        globalMutate('isla-pending-approvals')
    }

    const nada = (data?.pending.length ?? 0) === 0 && (data?.review.length ?? 0) === 0

    return (
        <div className="px-4 md:px-8 pt-6 pb-8" style={{ position: 'relative', maxWidth: 860 }}>
            <div className="toul-ambient" />
            <div className="mb-5 flex items-center gap-3" style={{ position: 'relative' }}>
                <Link href="/punto-fisico" aria-label="Volver a Punto físico"
                    className="flex items-center justify-center shrink-0 active:scale-95 transition-transform"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'color-mix(in srgb, var(--toul-text) 7%, transparent)', color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={18} strokeWidth={2} />
                </Link>
                <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>Aprobaciones</h1>
            </div>

            <PushPrompt compact />

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1].map(i => <div key={i} className="skeleton" style={{ height: 150, borderRadius: 18 }} />)}</div>
            ) : nada ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '44px 20px' }}>
                    <Inbox size={32} strokeWidth={1.5} style={{ color: 'var(--toul-text-faint)', margin: '0 auto 12px' }} />
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Nada pendiente</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>Cuando un vendedor pida anular, devolver, fiar o un descuento, o cobre sin internet un precio distinto, aparece aquí.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <AnimatePresence initial={false}>
                        {data!.pending.map(req => {
                            const isVoid = req.type === 'void_sale'
                            const isReturn = req.type === 'return_sale'
                            const isDiscount = req.type === 'discount_sale'
                            const descuento = Math.round(Number(req.details.discount) || 0)
                            const metodoDevolucion = isReturn ? methods.find(m => m.id === req.details.methodId)?.name : undefined
                            const sale = req.sale_id ? data!.sales.get(req.sale_id) : undefined
                            const busy = busyId === req.id
                            return (
                                <motion.div key={req.id} layout
                                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}
                                    className="toul-card" style={{ padding: 18 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                        <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isVoid ? 'var(--toul-error-dim)' : isReturn ? 'var(--toul-warning-dim)' : 'var(--toul-info-dim)' }}>
                                            {isVoid ? <Ban size={20} style={{ color: 'var(--toul-error)' }} />
                                                : isReturn ? <Undo2 size={20} style={{ color: 'var(--toul-warning)' }} />
                                                    : isDiscount ? <Percent size={20} style={{ color: 'var(--toul-info)' }} />
                                                        : <CreditCard size={20} style={{ color: 'var(--toul-info)' }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                                                {req.requested_by_name ?? 'Vendedor'} · {ago(req.requested_at)}
                                            </p>
                                            <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '2px 0 6px' }}>
                                                {isVoid ? `Anular venta de ${formatCOP(req.amount ?? 0)}`
                                                    : isReturn ? `Devolver ${formatCOP(req.amount ?? 0)} de una venta`
                                                        : isDiscount ? `Descontar ${formatCOP(descuento)} en una venta`
                                                            : `Fiar ${formatCOP(req.amount ?? 0)} a ${req.details.customerName ?? 'cliente'}`}
                                            </p>
                                            {isReturn ? (
                                                <>
                                                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0 }}>
                                                        Devuelve: <span style={{ color: 'var(--toul-text)' }}>
                                                            {(req.details.items ?? []).map(i => {
                                                                const item = sale?.sale_items.find(si => si.id === i.saleItemId)
                                                                return `${i.quantity}× ${item?.combos?.name ?? item?.products?.name ?? 'Producto'}`
                                                            }).join(', ')}
                                                        </span>
                                                    </p>
                                                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '2px 0 0' }}>Motivo: <span style={{ color: 'var(--toul-text)' }}>{req.reason}</span></p>
                                                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                                                        {metodoDevolucion ? `Sale por ${metodoDevolucion}` : 'Sale por el mismo medio de la venta'}
                                                        {sale ? ` · venta de ${formatCOP(sale.total)} del ${new Date(sale.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : ''}
                                                    </p>
                                                </>
                                            ) : isVoid ? (
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
                                                    {descuento > 0 && req.details.subtotal
                                                        ? ` · ${Math.round(descuento * 100 / Number(req.details.subtotal))}% de ${formatCOP(Number(req.details.subtotal))}, queda en ${formatCOP(req.amount ?? 0)}`
                                                        : ''}
                                                    {isDiscount ? '' : req.details.initialPayment ? ` · Abono ${formatCOP(req.details.initialPayment)}` : ' · Sin abono'}
                                                    {req.details.dueDate ? ` · Plazo ${new Date(req.details.dueDate + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}` : ''}
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
                                            <Check size={17} strokeWidth={2.6} /> {busy ? 'Procesando…' : isVoid ? 'Aprobar y anular' : isReturn ? 'Aprobar devolución' : isDiscount ? 'Aprobar descuento' : 'Aprobar crédito'}
                                        </motion.button>
                                    </div>
                                </motion.div>
                            )
                        })}
                    </AnimatePresence>
                </div>
            )}

            {(data?.review.length ?? 0) > 0 && (
                <>
                    <p className="toul-section-label" style={{ marginTop: (data?.pending.length ?? 0) > 0 ? 28 : 0 }}>Para revisar</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <AnimatePresence initial={false}>
                            {data!.review.map(sale => {
                                const lineas = Array.isArray(sale.price_review) ? sale.price_review : []
                                const diferencia = Math.round(lineas.reduce((acc, l) => acc + (Number(l.charged) - Number(l.price)) * Number(l.quantity), 0))
                                const busy = busyId === sale.id
                                return (
                                    <motion.div key={sale.id} layout
                                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
                                        transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}
                                        className="toul-card" style={{ padding: 18 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-warning-dim)' }}>
                                                <Tag size={20} style={{ color: 'var(--toul-warning)' }} />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                                                    {sale.seller_name ?? 'Vendedor'} · {new Date(sale.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · sin internet
                                                </p>
                                                <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '2px 0 6px' }}>
                                                    {diferencia === 0 ? 'Venta con otro precio'
                                                        : diferencia < 0 ? `Se cobraron ${formatCOP(-diferencia)} de menos`
                                                            : `Se cobraron ${formatCOP(diferencia)} de más`}
                                                </p>
                                                {lineas.map((l, i) => (
                                                    <p key={i} style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: i ? '2px 0 0' : 0 }}>
                                                        {Math.round(Number(l.quantity))}× <span style={{ color: 'var(--toul-text)' }}>{l.name}</span>
                                                        {' · '}cobrado {formatCOP(Math.round(Number(l.charged)))}, precio a esa hora {formatCOP(Math.round(Number(l.price)))}
                                                    </p>
                                                ))}
                                                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>Venta de {formatCOP(Math.round(sale.total))}</p>
                                            </div>
                                        </div>
                                        <motion.button whileTap={{ scale: 0.97 }} transition={SPRING_PRESS} disabled={busy}
                                            onClick={() => markReviewed(sale)}
                                            style={{ width: '100%', marginTop: 16, height: 50, borderRadius: 14, border: '1px solid var(--toul-border)', background: 'var(--toul-surface)', color: 'var(--toul-text)', fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'inherit', opacity: busy ? 0.6 : 1 }}>
                                            <Check size={17} /> {busy ? 'Guardando…' : 'Marcar como vista'}
                                        </motion.button>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                </>
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
                                            {req.type === 'void_sale' ? 'Anulación' : req.type === 'return_sale' ? 'Devolución' : req.type === 'discount_sale' ? 'Descuento' : `Crédito a ${req.details.customerName ?? 'cliente'}`} · {formatCOP(req.amount ?? 0)}
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
