'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, Ban, Package, Printer, UserRound, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { loadReceiptData, printReceipt } from '@/lib/isla/receipt'
import { panelVariants, backdropVariants } from '@/lib/motion'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { saleItemName } from '@/lib/types'
import type { SaleDetailData } from '@/lib/types'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   El resumen de una venta.

   Vive aquí y no dentro de Ventas porque se abre desde dos lados:
   el historial de ventas y la ficha del cliente. Una sola copia
   quiere decir que una venta se ve igual en toda la app.

   Lo que cambia entre un lado y otro son las acciones: anular solo
   se puede desde Ventas, porque mueve inventario, caja y deuda.
   ══════════════════════════════════════════════════════════════ */

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function SaleDetail({ sale, onClose, onChangeCustomer, onVoid, mostrarCliente = true, verEnVentas = false }: {
    sale: SaleDetailData | null
    onClose: () => void
    /** Solo donde se puede corregir a quién fue la venta */
    onChangeCustomer?: (sale: SaleDetailData) => void
    /** Solo en Ventas: anular mueve inventario, caja y deuda */
    onVoid?: () => void
    /** En la ficha del cliente sobra: ya sabes de quién es */
    mostrarCliente?: boolean
    verEnVentas?: boolean
}) {
    const [printing, setPrinting] = useState(false)

    // Nombres reales de los métodos de pago del negocio (Datáfono, Addi, etc.)
    const { data: methodNames } = useSWR('method-names', async () => {
        const res = await fetch('/api/payment-methods')
        const data = await res.json()
        const map: Record<string, string> = {}
        for (const m of data.methods ?? []) map[String(m.name).toLowerCase()] = m.name
        return map
    }, { revalidateOnFocus: false })

    const methodLabel = (raw: string) =>
        methodNames?.[raw?.toLowerCase()] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Pago')

    async function imprimir(saleId: string) {
        setPrinting(true)
        try {
            printReceipt(await loadReceiptData(supabase, saleId))
        } catch {
            toast.error('No se pudo preparar la tirilla')
        } finally {
            setPrinting(false)
        }
    }

    return (
        <AnimatePresence>
            {sale && (
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                    <style>{PANEL_CSS}</style>
                    <motion.div className="absolute inset-0" onClick={onClose}
                        variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
                        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
                    <motion.div
                        variants={panelVariants} initial="hidden" animate="visible" exit="exit"
                        className="relative w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl"
                        style={{ background: 'var(--toul-bg)', border: '1px solid var(--toul-border)', maxHeight: '88dvh', overflowY: 'auto' }}>
                        <div className="flex justify-center pt-3 pb-0 md:hidden">
                            <div className="w-10 h-1 rounded-full" style={{ background: 'var(--toul-border)' }} />
                        </div>
                        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                            <div>
                                <p className="text-xs font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Detalle de venta</p>
                                <p className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatDateTime(sale.created_at)}</p>
                            </div>
                            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                                style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* A quién fue: se puede corregir después */}
                        {mostrarCliente && (
                            <div className="px-5 pt-4" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 11.5, color: 'var(--toul-text-dim)', margin: 0 }}>Cliente</p>
                                    <p style={{ fontSize: 14.5, fontWeight: 600, color: sale.customer_name ? 'var(--toul-text)' : 'var(--toul-text-dim)', margin: 0 }}>
                                        {sale.customer_name || 'Sin cliente'}
                                    </p>
                                    {sale.customer_id && (
                                        <Link href={`/customers/${sale.customer_id}`}
                                            style={{ fontSize: 11.5, color: 'var(--toul-accent)', textDecoration: 'none' }}>
                                            Ver su ficha →
                                        </Link>
                                    )}
                                </div>
                                {onChangeCustomer && (
                                    <button onClick={() => onChangeCustomer(sale)} className="pnl-pill">
                                        <UserRound size={13} /> Cambiar
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="px-5 py-4 flex flex-col gap-2">
                            {sale.sale_items.map((item, i) => (
                                <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface)' }}>
                                        {item.products?.image_url ? (
                                            <img src={item.products.image_url} className="w-full h-full object-cover" alt="" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center"><Package size={17} style={{ color: 'var(--toul-text-faint)' }} /></div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{saleItemName(item)}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{item.quantity} × {formatCOP(item.unit_price)}</p>
                                    </div>
                                    <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(item.unit_price * item.quantity)}</p>
                                </div>
                            ))}
                        </div>

                        <div className="px-5 pb-6 flex flex-col gap-2">
                            {sale.discount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span style={{ color: 'var(--toul-text-muted)' }}>Descuento</span>
                                    <span style={{ color: 'var(--toul-warning)' }}>−{formatCOP(sale.discount)}</span>
                                </div>
                            )}
                            {(sale.sale_payments?.length ?? 0) > 0 ? (
                                sale.sale_payments!.map((pay, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                                            {pay.payment_methods?.name || 'Pago'}
                                        </span>
                                        <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{formatCOP(pay.amount)}</span>
                                    </div>
                                ))
                            ) : (
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Método</span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>
                                        {methodLabel(sale.payment_method)}
                                    </span>
                                </div>
                            )}
                            {sale.is_credit && (
                                /* Dice lo que quedó fiado en el momento de la venta, no el
                                   saldo de hoy: los abonos posteriores van contra el
                                   cliente, no contra esta venta. El saldo vivo está en
                                   la ficha del cliente. */
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-info)' }}>
                                        Quedó fiado{sale.customer_name ? ` a ${sale.customer_name}` : ''}
                                    </span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-info)' }}>
                                        {formatCOP(Math.max(0, sale.total - (sale.sale_payments ?? []).reduce((s, p) => s + Number(p.amount), 0)))}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--toul-border)' }}>
                                <span className="font-bold" style={{ color: 'var(--toul-text)' }}>Total</span>
                                <span className="text-xl font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(sale.total)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Utilidad estimada</span>
                                <span className="font-semibold text-sm" style={{ color: 'var(--toul-accent)' }}>
                                    {formatCOP(sale.sale_items.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0))}
                                </span>
                            </div>
                            {sale.seller_name && (
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Vendió</span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>
                                        {sale.seller_name}{sale.cash_session_id ? ' · en la caja' : ''}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>N° de venta</span>
                                <span className="text-sm font-medium" style={{ color: 'var(--toul-text-muted)' }}>#{sale.id.slice(0, 8).toUpperCase()}</span>
                            </div>

                            <div className="flex gap-2 pt-3">
                                <button className="toul-btn-secondary" style={{ height: 48, fontSize: 14, color: 'var(--toul-text)' }}
                                    disabled={printing} onClick={() => imprimir(sale.id)}>
                                    <Printer size={16} /> {printing ? 'Preparando…' : 'Tirilla'}
                                </button>
                                {onVoid && (
                                    <button className="toul-btn-secondary" style={{ height: 48, fontSize: 14, color: 'var(--toul-error)' }}
                                        onClick={onVoid}>
                                        <Ban size={16} /> Anular
                                    </button>
                                )}
                                {verEnVentas && (
                                    <Link href={`/ventas?venta=${sale.id}`} className="toul-btn-secondary"
                                        style={{ height: 48, fontSize: 14, color: 'var(--toul-text)', textDecoration: 'none' }}>
                                        <ArrowUpRight size={16} /> Abrir en Ventas
                                    </Link>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
