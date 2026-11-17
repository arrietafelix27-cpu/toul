'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Sheet } from './Sheet'

const QUICK_REASONS = ['Devolución del cliente', 'Error al registrar la venta', 'Cambio de producto', 'Pago no recibido']

/** Lo que hace falta de la venta para decir qué pasa al anularla */
export interface VentaParaAnular {
    total: number
    is_credit: boolean
    customer_name: string | null
    sale_items: {
        quantity: number
        products: { name: string } | null
        product_variants: { name: string } | null
        combos: { name: string } | null
    }[]
    sale_payments?: { amount: number; payment_methods: { name: string } | null }[]
}

const nombreItem = (i: VentaParaAnular['sale_items'][number]) =>
    i.combos?.name ?? [i.products?.name ?? 'Producto', i.product_variants?.name].filter(Boolean).join(' · ')

/** "Abanico", "Control y Mym", "Abanico, Control, Mym y 2 más" */
function unir(nombres: string[]): string {
    if (nombres.length <= 1) return nombres[0] ?? ''
    if (nombres.length > 3) return `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más`
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/**
 * Lo que pasa al anular, con los productos y la plata de esa venta:
 * contado devuelve la plata; fiado borra la deuda (y devuelve lo que abonó).
 * Es lo mismo que hace toul_void_sale.
 */
function queHaceAnular(v: VentaParaAnular): { cabeza: string; cuerpo: string; aviso: string } {
    const items = v.sale_items ?? []
    const nombres = items.map(i => `${Math.round(i.quantity) > 1 ? `${Math.round(i.quantity)}× ` : ''}${nombreItem(i)}`)
    const uno = items.length === 1 && Math.round(items[0].quantity) === 1
    const vuelve = nombres.length > 0 ? `${unir(nombres)} ${uno ? 'vuelve' : 'vuelven'} al inventario` : ''

    const total = Math.round(v.total)
    const pagos = v.sale_payments ?? []
    const pagado = Math.round(pagos.reduce((s, p) => s + Number(p.amount), 0))
    const metodos = [...new Set(pagos.map(p => p.payment_methods?.name).filter(Boolean))]
    const metodo = metodos.length === 1 ? ` (${metodos[0]})` : ''
    // El nombre del producto va tal como lo escribió el dueño; solo se pone
    // mayúscula si la frase empieza con algo nuestro
    const juntar = (partes: string[]) => {
        const p = partes.filter(Boolean)
        const texto = p.length <= 1 ? (p[0] ?? '') : `${p.slice(0, -1).join(', ')} y ${p[p.length - 1]}`
        return vuelve ? texto : texto.charAt(0).toUpperCase() + texto.slice(1)
    }

    if (!v.is_credit) {
        return {
            cabeza: `Venta de ${formatCOP(total)}`,
            cuerpo: juntar([vuelve, pagado > 0 ? `se devuelven ${formatCOP(pagado)}${metodo}` : '']),
            aviso: 'Inventario y caja al día.',
        }
    }

    const quien = v.customer_name?.trim() || 'el cliente'
    const debe = Math.max(0, total - pagado)
    return {
        cabeza: `Venta fiada de ${formatCOP(total)} a ${quien}`,
        cuerpo: pagado > 0
            ? juntar([vuelve, `le devuelves los ${formatCOP(pagado)} que abonó${metodo}`, debe > 0 ? `ya no te debe los ${formatCOP(debe)}` : ''])
            : juntar([vuelve, `${quien} ya no te debe esos ${formatCOP(debe)}`]),
        aviso: pagado > 0 ? 'Inventario, caja y deuda al día.' : 'Inventario y deuda al día.',
    }
}

/**
 * Anular una venta.
 * - Administrador: anula de inmediato (devuelve inventario y dinero).
 * - Vendedor: envía la solicitud y el administrador recibe la notificación.
 */
export function VoidSaleDialog({ open, onClose, saleId, venta, isAdmin, onDone }: {
    open: boolean
    onClose: () => void
    saleId: string
    venta: VentaParaAnular
    isAdmin: boolean
    onDone: (result: 'voided' | 'requested') => void
}) {
    const efecto = queHaceAnular(venta)
    const [reason, setReason] = useState('')
    const [sending, setSending] = useState(false)

    async function submit() {
        if (!reason.trim()) { toast.error('Escribe el motivo'); return }
        setSending(true)
        try {
            if (isAdmin) {
                const { error } = await createClient().rpc('toul_void_sale', { p_sale_id: saleId, p_reason: reason.trim() })
                if (error) throw new Error(error.message)
                toast.success(`Venta anulada. ${efecto.aviso}`)
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
            subtitle={`${efecto.cabeza} · ${isAdmin ? '' : 'Si lo aprueban: '}${efecto.cuerpo}`}
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
