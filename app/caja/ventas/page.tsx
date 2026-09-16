'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ReceiptText, Clock, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useCaja } from '@/components/isla/CajaContext'
import { SaleDetail, SALE_LIST_SELECT, itemName, type SaleListRow } from '@/components/isla/SaleDetail'
import { EASE_OUT_EMIL } from '@/components/ui'
import type { SaleVoid } from '@/lib/isla/types'

const supabase = createClient()

export default function CajaVentasPage() {
    const { ctx, session } = useCaja()
    const [selected, setSelected] = useState<SaleListRow | null>(null)

    // Con turno abierto: ventas del turno. Sin turno: mis ventas de hoy.
    const key = ['caja-ventas', ctx.storeId, session?.id ?? 'today', ctx.userId]
    const { data, isLoading, mutate } = useSWR(key, async () => {
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)

        let salesQuery = supabase.from('sales').select(SALE_LIST_SELECT).eq('store_id', ctx.storeId).order('created_at', { ascending: false })
        salesQuery = session ? salesQuery.eq('cash_session_id', session.id) : salesQuery.eq('seller_id', ctx.userId).gte('created_at', todayStart.toISOString())

        let voidsQuery = supabase.from('sale_voids').select('*').eq('store_id', ctx.storeId).order('voided_at', { ascending: false })
        voidsQuery = session ? voidsQuery.eq('cash_session_id', session.id) : voidsQuery.gte('voided_at', todayStart.toISOString())

        const [sales, voids, pending] = await Promise.all([
            salesQuery,
            voidsQuery,
            supabase.from('approval_requests').select('sale_id').eq('type', 'void_sale').eq('status', 'pending'),
        ])
        return {
            sales: (sales.data ?? []) as unknown as SaleListRow[],
            voids: (voids.data ?? []) as SaleVoid[],
            pendingVoids: new Set((pending.data ?? []).map(p => p.sale_id as string)),
        }
    }, { refreshInterval: 10_000 })

    const totals = useMemo(() => {
        const sales = data?.sales ?? []
        return {
            count: sales.length,
            total: sales.reduce((s, v) => s + Number(v.total), 0),
            discounts: sales.filter(s => s.discount > 0).length,
        }
    }, [data])

    return (
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
            <div className="toul-ambient" />
            <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 40px', position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>
                    {session ? `Turno de ${session.opened_by_name ?? ctx.displayName}` : 'Hoy'}
                </p>
                <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 18px' }}>Ventas del turno</h1>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                    {[
                        { label: 'Ventas', value: String(totals.count) },
                        { label: 'Vendido', value: formatCOP(totals.total), accent: true },
                        { label: 'Con descuento', value: String(totals.discounts) },
                    ].map(k => (
                        <div key={k.label} className="toul-card" style={{ padding: '14px 16px' }}>
                            <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>{k.label}</p>
                            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', margin: '2px 0 0', color: k.accent ? 'var(--toul-accent)' : 'var(--toul-text)' }}>{k.value}</p>
                        </div>
                    ))}
                </div>

                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />)}
                    </div>
                ) : (data?.sales.length ?? 0) === 0 ? (
                    <div className="toul-card" style={{ textAlign: 'center', padding: '48px 20px' }}>
                        <ReceiptText size={32} strokeWidth={1.5} style={{ color: 'var(--toul-text-faint)', margin: '0 auto 12px' }} />
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Aún no hay ventas</p>
                        <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>Las ventas de este turno aparecen aquí.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {data!.sales.map((sale, idx) => {
                            const pending = data!.pendingVoids.has(sale.id)
                            const summary = sale.sale_items.map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${itemName(i)}`).join(', ')
                            const methods = sale.sale_payments.map(p => p.payment_methods?.name).filter(Boolean).join(' + ')
                            return (
                                <motion.button key={sale.id}
                                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.22, ease: EASE_OUT_EMIL, delay: Math.min(idx, 8) * 0.025 }}
                                    whileTap={{ scale: 0.99 }}
                                    onClick={() => setSelected(sale)}
                                    className="toul-card toul-card-interactive"
                                    style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', minHeight: 72, fontFamily: 'inherit' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text-dim)', width: 48, flexShrink: 0 }}>
                                        {new Date(sale.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>
                                        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--toul-text-muted)', marginTop: 2 }}>
                                            <span>{sale.is_credit ? `Crédito${sale.customer_name ? ` · ${sale.customer_name}` : ''}` : methods}</span>
                                            {sale.discount > 0 && <span style={{ color: 'var(--toul-warning)' }}>Descuento −{formatCOP(sale.discount)}</span>}
                                            {pending && <span style={{ color: 'var(--toul-warning)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Anulación pendiente</span>}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)' }}>{formatCOP(sale.total)}</span>
                                </motion.button>
                            )
                        })}
                    </div>
                )}

                {(data?.voids.length ?? 0) > 0 && (
                    <>
                        <p className="toul-section-label" style={{ margin: '28px 0 10px 4px' }}>Anuladas</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {data!.voids.map(v => (
                                <div key={v.id} className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.75 }}>
                                    <Ban size={18} style={{ color: 'var(--toul-error)', flexShrink: 0 }} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{v.reason}</span>
                                        <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)' }}>
                                            Aprobó {v.approved_by_name ?? 'administrador'} · {new Date(v.voided_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-error)', textDecoration: 'line-through' }}>{formatCOP(v.total)}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <SaleDetail
                sale={selected}
                onClose={() => setSelected(null)}
                isAdmin={ctx.role === 'admin'}
                voidPending={!!selected && !!data?.pendingVoids.has(selected.id)}
                onChanged={() => mutate()}
            />
        </div>
    )
}
