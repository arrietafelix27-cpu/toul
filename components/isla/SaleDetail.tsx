'use client'

import { useCallback, useState } from 'react'
import { Printer, Ban, Clock, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { loadReceiptData, printReceipt } from '@/lib/isla/receipt'
import { Sheet } from './Sheet'
import { VoidSaleDialog } from './VoidSaleDialog'
import { DevolucionSheet, useDevolucionesDeVenta, DIAS_PARA_DEVOLVER } from '@/components/ventas/DevolucionSheet'
import { saleItemName } from '@/lib/types'

export interface SaleListRow {
    id: string
    created_at: string
    subtotal: number
    discount: number
    total: number
    is_credit: boolean
    customer_name: string | null
    seller_name: string | null
    sale_items: {
        quantity: number
        unit_price: number
        products: { name: string } | null
        product_variants: { name: string } | null
        combos: { name: string } | null
    }[]
    sale_payments: { amount: number; payment_methods: { name: string } | null }[]
}

export const SALE_LIST_SELECT = `id, created_at, subtotal, discount, total, is_credit, customer_name, seller_name,
    sale_items(quantity, unit_price, products(name), product_variants(name), combos(name)),
    sale_payments(amount, payment_methods(name))`

export const itemName = (i: SaleListRow['sale_items'][number]) =>
    i.combos?.name ?? [i.products?.name ?? 'Producto', i.product_variants?.name].filter(Boolean).join(' · ')

/** Detalle de una venta con acciones: reimprimir tirilla, devolver una parte
 *  y anular. El vendedor pide la devolución o la anulación; el administrador
 *  las hace de una. Una venta con devoluciones ya no se anula. */
export function SaleDetail({ sale, onClose, isAdmin, voidPending, returnPending = false, onChanged }: {
    sale: SaleListRow | null
    onClose: () => void
    isAdmin: boolean
    voidPending: boolean
    returnPending?: boolean
    onChanged: () => void
}) {
    const [voidOpen, setVoidOpen] = useState(false)
    const [devolverOpen, setDevolverOpen] = useState(false)
    const [printing, setPrinting] = useState(false)

    // null: las devoluciones todavía no están activas en este negocio
    const { data: devoluciones } = useDevolucionesDeVenta(sale?.id ?? null)
    const unidadesDevueltas = (devoluciones ?? []).reduce((s, d) => s + d.sale_return_items.reduce((n, i) => n + Number(i.quantity), 0), 0)
    const unidades = (sale?.sale_items ?? []).reduce((s, i) => s + Number(i.quantity), 0)
    const dentroDelPlazo = !!sale && Date.now() - new Date(sale.created_at).getTime() <= DIAS_PARA_DEVOLVER * 86_400_000
    const puedeDevolver = devoluciones !== null && dentroDelPlazo && unidadesDevueltas < unidades
    const conDevoluciones = (devoluciones?.length ?? 0) > 0

    const cerrarDevolucion = useCallback(() => setDevolverOpen(false), [])
    const devolucionHecha = useCallback(() => { setDevolverOpen(false); onClose(); onChanged() }, [onClose, onChanged])

    async function reprint() {
        if (!sale) return
        setPrinting(true)
        try {
            printReceipt(await loadReceiptData(createClient(), sale.id))
        } catch {
            toast.error('No se pudo preparar la tirilla')
        } finally {
            setPrinting(false)
        }
    }

    const time = sale ? new Date(sale.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

    return (
        <>
            <Sheet
                open={!!sale && !voidOpen && !devolverOpen}
                onClose={onClose}
                title={sale ? formatCOP(sale.total) : ''}
                subtitle={sale ? `${time} · Venta #${sale.id.slice(0, 8).toUpperCase()}${sale.seller_name ? ` · ${sale.seller_name}` : ''}` : ''}
                footer={sale && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {returnPending ? (
                            <button className="toul-btn-secondary" disabled style={{ color: 'var(--toul-warning)' }}>
                                <Clock size={17} /> Devolución pendiente
                            </button>
                        ) : puedeDevolver && !voidPending && (
                            <button className="toul-btn-secondary" onClick={() => setDevolverOpen(true)} style={{ color: 'var(--toul-text)' }}>
                                <Undo2 size={17} /> {isAdmin ? 'Devolver productos' : 'Pedir devolución'}
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button className="toul-btn-secondary" onClick={reprint} disabled={printing} style={{ color: 'var(--toul-text)' }}>
                                <Printer size={17} /> {printing ? 'Preparando…' : 'Tirilla'}
                            </button>
                            {voidPending ? (
                                <button className="toul-btn-secondary" disabled style={{ color: 'var(--toul-warning)' }}>
                                    <Clock size={17} /> Anulación pendiente
                                </button>
                            ) : !conDevoluciones && !returnPending && (
                                <button className="toul-btn-secondary" onClick={() => setVoidOpen(true)} style={{ color: 'var(--toul-error)' }}>
                                    <Ban size={17} /> {isAdmin ? 'Anular' : 'Pedir anulación'}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            >
                {sale && (
                    <div>
                        {sale.sale_items.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--toul-divider)' }}>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{itemName(item)}</p>
                                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>{item.quantity} × {formatCOP(item.unit_price)}</p>
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)' }}>{formatCOP(item.quantity * item.unit_price)}</span>
                            </div>
                        ))}
                        <div style={{ padding: '12px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {sale.discount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-text-muted)' }}>Subtotal</span>
                                    <span style={{ color: 'var(--toul-text)' }}>{formatCOP(sale.subtotal)}</span>
                                </div>
                            )}
                            {sale.discount > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-warning)' }}>Descuento</span>
                                    <span style={{ color: 'var(--toul-warning)' }}>−{formatCOP(sale.discount)}</span>
                                </div>
                            )}
                            {sale.sale_payments.map((p, idx) => (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-text-muted)' }}>{p.payment_methods?.name ?? 'Pago'}</span>
                                    <span style={{ color: 'var(--toul-text)' }}>{formatCOP(p.amount)}</span>
                                </div>
                            ))}
                            {sale.is_credit && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-info)' }}>Crédito{sale.customer_name ? ` — ${sale.customer_name}` : ''}</span>
                                    <span style={{ color: 'var(--toul-info)' }}>
                                        {formatCOP(Math.max(0, sale.total - sale.sale_payments.reduce((s, p) => s + Number(p.amount), 0)))} pendiente
                                    </span>
                                </div>
                            )}
                            {(devoluciones ?? []).map(d => (
                                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
                                    <span style={{ color: 'var(--toul-text-muted)', minWidth: 0 }}>
                                        Devolvió {d.sale_return_items.map(i => `${i.quantity}× ${i.sale_items ? saleItemName(i.sale_items) : 'Producto'}`).join(', ')}
                                    </span>
                                    <span style={{ color: 'var(--toul-warning)', flexShrink: 0 }}>−{formatCOP(d.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Sheet>

            {sale && (
                <VoidSaleDialog
                    open={voidOpen}
                    onClose={() => setVoidOpen(false)}
                    saleId={sale.id}
                    total={sale.total}
                    isAdmin={isAdmin}
                    onDone={() => { setVoidOpen(false); onClose(); onChanged() }}
                />
            )}

            <DevolucionSheet
                open={devolverOpen}
                onClose={cerrarDevolucion}
                saleId={sale?.id ?? null}
                isAdmin={isAdmin}
                onDone={devolucionHecha}
            />
        </>
    )
}
