'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Sheet } from './Sheet'

const QUICK_REASONS = ['Devolución del cliente', 'Error al registrar la venta', 'Cambio de producto', 'Pago no recibido']

/**
 * Anular una venta.
 * - Administrador: anula de inmediato (devuelve inventario y dinero).
 * - Vendedor: envía la solicitud y el administrador recibe la notificación.
 */
export function VoidSaleDialog({ open, onClose, saleId, total, isAdmin, onDone }: {
    open: boolean
    onClose: () => void
    saleId: string
    total: number
    isAdmin: boolean
    onDone: (result: 'voided' | 'requested') => void
}) {
    const [reason, setReason] = useState('')
    const [sending, setSending] = useState(false)

    async function submit() {
        if (!reason.trim()) { toast.error('Escribe el motivo'); return }
        setSending(true)
        try {
            if (isAdmin) {
                const { error } = await createClient().rpc('toul_void_sale', { p_sale_id: saleId, p_reason: reason.trim() })
                if (error) throw new Error(error.message)
                toast.success('Venta anulada. Inventario y caja actualizados.')
                onDone('voided')
            } else {
                const res = await fetch('/api/approvals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'void_sale', saleId, reason: reason.trim() }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || 'No se pudo enviar la solicitud')
                toast.success('Solicitud enviada al administrador')
                onDone('requested')
            }
            setReason('')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error inesperado')
        } finally {
            setSending(false)
        }
    }

    return (
        <Sheet
            open={open}
            onClose={() => { if (!sending) onClose() }}
            title={isAdmin ? 'Anular venta' : 'Pedir anulación'}
            subtitle={`Venta de ${formatCOP(total)} · el perfume vuelve al inventario y el dinero sale de caja`}
            footer={
                <button className="toul-btn-primary" onClick={submit} disabled={sending || !reason.trim()}
                    style={isAdmin ? { background: 'var(--toul-error)', color: '#fff' } : undefined}>
                    {sending ? 'Enviando…' : isAdmin ? 'Anular venta' : 'Enviar al administrador'}
                </button>
            }
        >
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-muted)', margin: '4px 0 10px' }}>Motivo</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {QUICK_REASONS.map(r => {
                    const active = reason === r
                    return (
                        <button key={r} onClick={() => setReason(r)}
                            style={{
                                padding: '10px 14px', borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: 'pointer', minHeight: 44,
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {r}
                        </button>
                    )
                })}
            </div>
            <textarea className="toul-input" rows={2} placeholder="O escribe otro motivo…" value={reason}
                onChange={e => setReason(e.target.value)} maxLength={200} style={{ resize: 'none', height: 'auto', paddingTop: 12 }} />
            {!isAdmin && (
                <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '10px 0 0' }}>
                    El administrador recibirá una notificación. La venta se anula cuando la apruebe.
                </p>
            )}
        </Sheet>
    )
}
