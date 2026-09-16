'use client'

import { Check, Package } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import type { CartItem, PaymentSplit } from '@/lib/types'

export interface SaleSnapshot {
    items: CartItem[]
    discount: number
    total: number
    subtotal?: number
    payments: PaymentSplit[]
    isCredit: boolean
    customerName: string | null
}

interface Props {
    sale: SaleSnapshot
    onNewSale: () => void
    onViewHistory: () => void
}

export default function Step3Confirmation({ sale, onNewSale, onViewHistory }: Props) {
    const subtotal = Math.round(sale.subtotal || sale.items.reduce((s, i) => s + (i.unitPrice ?? i.product.sale_price) * i.quantity, 0))

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%', padding: '12px 0',
        }}>
            {/* ── Compact header: icon + title inline ─── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 16, flexShrink: 0,
                    background: 'var(--toul-pos-green-mint)', border: '1.5px solid var(--toul-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Check size={24} style={{ color: 'var(--toul-primary)' }} />
                </div>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--toul-pos-text-main)', margin: 0 }}>
                        ¡Venta lista!
                    </h2>
                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        Inventario y caja actualizados
                    </p>
                </div>
            </div>

            {/* ── Summary card ────────────────────────── */}
            <div style={{
                background: 'var(--toul-pos-bg-card)', border: '1px solid var(--toul-pos-border)',
                borderRadius: 14, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
                marginBottom: 16,
            }}>
                {/* Card header */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderBottom: '1px solid var(--toul-pos-border)',
                }}>
                    <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Resumen de venta
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 600 }}>
                        {sale.isCredit
                            ? `Crédito${sale.customerName ? ` — ${sale.customerName}` : ''}`
                            : sale.payments.map(p => p.methodName).join(', ') || 'N/A'
                        }
                    </span>
                </div>

                {/* Items list — scrollable if > 4 */}
                <div style={{
                    maxHeight: sale.items.length > 4 ? 200 : 'none',
                    overflowY: sale.items.length > 4 ? 'auto' : 'visible',
                    padding: '0 14px',
                }}>
                    {sale.items.map(item => {
                        const img = (item.product.images?.[0] || item.product.image_url) as string | null
                        return (
                            <div key={item.variantId ? `${item.product.id}:${item.variantId}` : item.product.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                                borderBottom: '1px solid var(--toul-pos-border)',
                            }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 6, overflow: 'hidden',
                                    background: 'var(--toul-pos-bg-main)', flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {img ? (
                                        <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <Package size={14} style={{ color: 'var(--toul-pos-text-inactive)' }} />
                                    )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.product.name}{item.variantName ? ` · ${item.variantName}` : ''}
                                    </p>
                                    <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: 0 }}>×{item.quantity}</p>
                                </div>
                                <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600, fontFamily: 'monospace', flexShrink: 0 }}>
                                    {formatCOP((item.unitPrice ?? item.product.sale_price) * item.quantity)}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Totals section */}
                <div style={{ padding: '0 14px', marginTop: 'auto' }}>
                    {/* Separator */}
                    <div style={{ borderTop: '1px solid var(--toul-pos-border)' }} />

                    {/* Subtotal */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--toul-pos-border)' }}>
                        <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)' }}>Subtotal</span>
                        <span style={{ fontSize: 11, color: 'var(--toul-pos-text-main)', fontFamily: 'monospace' }}>{formatCOP(subtotal)}</span>
                    </div>

                    {/* Discount */}
                    {sale.discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--toul-pos-border)' }}>
                            <span style={{ fontSize: 11, color: 'var(--toul-primary)' }}>Descuento</span>
                            <span style={{ fontSize: 11, color: 'var(--toul-primary)', fontFamily: 'monospace' }}>−{formatCOP(sale.discount)}</span>
                        </div>
                    )}

                    {/* Total row — prominent */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '12px', margin: '8px -14px 0', borderRadius: '0 0 14px 14px',
                        background: 'var(--toul-pos-green-surface)',
                    }}>
                        <span style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 700 }}>Total cobrado</span>
                        <span style={{ fontSize: 20, color: 'var(--toul-primary)', fontWeight: 800, fontFamily: 'monospace' }}>
                            {formatCOP(sale.total)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Buttons ─────────────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                <button
                    onClick={onNewSale}
                    style={{
                        width: '100%', background: 'var(--toul-primary)', color: 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 12, padding: '14px 0',
                        fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    OK
                </button>
                <button
                    onClick={onViewHistory}
                    style={{
                        width: '100%', background: 'transparent',
                        border: '1.5px solid var(--toul-pos-border)', color: 'var(--toul-primary)',
                        borderRadius: 12, padding: '14px 0',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                >
                    Ver historial
                </button>
            </div>
        </div>
    )
}
