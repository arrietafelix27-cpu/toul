'use client'

import { useState, useMemo } from 'react'
import { UserPlus, Search, Plus, ChevronRight, Check, AlertTriangle, RefreshCw } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { usePOSFlow } from '../POSFlowProvider'
import type { Customer } from '@/lib/types'

interface Props {
    onBack: () => void
    onConfirm: () => void
    submitting: boolean
    error: string | null
    onClearError: () => void
}

/* ── Section Card ─────────────────────────────────────────── */
function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: 'var(--toul-pos-bg-card)', border: '1px solid var(--toul-pos-border)',
            borderRadius: 12, padding: '10px 12px',
        }}>
            <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px' }}>
                {label}
            </p>
            {children}
        </div>
    )
}

export default function Step2Payment({ onBack, onConfirm, submitting, error, onClearError }: Props) {
    const { data, cart, payment } = usePOSFlow()
    const [showDiscount, setShowDiscount] = useState(false)
    const [discType, setDiscType] = useState<'%' | '$'>('$')
    const [discValue, setDiscValue] = useState('')
    const [customerMode, setCustomerMode] = useState<'display' | 'search'>('search')
    const [createPhone, setCreatePhone] = useState('')
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)

    const isCredit = payment.saleType === 'credito'

    const filteredCustomers = useMemo(() => {
        if (!payment.customerSearch.trim()) return data.customers.slice(0, 5)
        const q = payment.customerSearch.toLowerCase()
        return data.customers.filter(c => c.name.toLowerCase().includes(q))
    }, [payment.customerSearch, data.customers])

    const selectCustomer = (c: Customer) => {
        payment.setSelectedCustomer(c)
        setCustomerMode('display')
    }

    const handleCreateCustomer = async () => {
        if (!payment.customerSearch.trim() || creating) return
        setCreating(true)
        setCreateError(null)
        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: payment.customerSearch.trim(), phone: createPhone.trim() || null }),
            })
            const data = await res.json()
            if (!res.ok) { setCreateError(data.error || 'Error al crear cliente'); return }
            payment.setSelectedCustomer(data.customer)
            setCustomerMode('display')
            setCreatePhone('')
        } catch {
            setCreateError('Error de conexión')
        } finally {
            setCreating(false)
        }
    }

    const handleDiscValue = (val: string) => {
        setDiscValue(val)
        payment.setDiscountValue(val)
    }
    const handleDiscType = () => {
        const next = discType === '$' ? '%' : '$'
        setDiscType(next)
        payment.toggleDiscountType()
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {/* ── Error banner ─────────────────────── */}
                    {error && (
                        <div style={{
                            background: 'var(--toul-pos-error-dim)', border: '1.5px solid var(--toul-pos-error-border)',
                            borderRadius: 12, padding: '12px 14px',
                            display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                            <AlertTriangle size={18} style={{ color: 'var(--toul-pos-error)', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 12, color: 'var(--toul-pos-error)', fontWeight: 600, margin: 0 }}>
                                    {error}
                                </p>
                                <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: '2px 0 0' }}>
                                    Tu carrito está intacto.
                                </p>
                            </div>
                            <button
                                onClick={() => { onClearError(); onConfirm() }}
                                style={{
                                    background: 'var(--toul-pos-error-dim-strong)', border: 'none', borderRadius: 8,
                                    padding: '6px 10px', cursor: 'pointer', color: 'var(--toul-pos-error)',
                                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, flexShrink: 0,
                                }}
                            >
                                <RefreshCw size={12} /> Reintentar
                            </button>
                        </div>
                    )}

                    {/* ── Tipo de venta ────────────────────── */}
                    <Section label="Tipo de venta">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {(['contado', 'credito'] as const).map(type => {
                                const active = (type === 'contado' && !isCredit) || (type === 'credito' && isCredit)
                                return (
                                    <button
                                        key={type}
                                        onClick={() => payment.setSaleType(type)}
                                        style={{
                                            background: active ? 'var(--toul-primary-dim)' : 'transparent',
                                            border: `1.5px solid ${active ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                            borderRadius: 10, padding: '14px 0',
                                            fontSize: 15, fontWeight: 700,
                                            color: active ? 'var(--toul-primary)' : 'var(--toul-pos-text-sec)',
                                            cursor: 'pointer', transition: 'all 120ms ease',
                                        }}
                                    >
                                        {type === 'contado' ? 'Contado' : 'Crédito'}
                                    </button>
                                )
                            })}
                        </div>
                    </Section>

                    {/* ── Cliente ──────────────────────────── */}
                    <Section label={`Cliente${isCredit ? ' *' : ''}`}>
                        {payment.selectedCustomer && customerMode === 'display' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'var(--toul-pos-green-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 13, fontWeight: 700, color: 'var(--toul-primary)', flexShrink: 0,
                                }}>
                                    {payment.selectedCustomer.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 13, color: 'var(--toul-pos-text-main)', fontWeight: 600, margin: 0 }}>{payment.selectedCustomer.name}</p>
                                    {payment.selectedCustomer.phone && (
                                        <p style={{ fontSize: 10, color: 'var(--toul-pos-text-sec)', margin: 0 }}>{payment.selectedCustomer.phone}</p>
                                    )}
                                </div>
                                <button
                                    onClick={() => { payment.setSelectedCustomer(null); payment.setCustomerSearch(''); setCustomerMode('search') }}
                                    style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                                >
                                    cambiar <ChevronRight size={12} />
                                </button>
                            </div>
                        ) : (
                            <div>
                                <div style={{ position: 'relative' }}>
                                    <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-pos-text-sec)' }} />
                                    <input
                                        placeholder="Buscar cliente..."
                                        value={payment.customerSearch}
                                        onChange={e => payment.setCustomerSearch(e.target.value)}
                                        style={{
                                            width: '100%', background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)',
                                            borderRadius: 8, padding: '8px 10px 8px 36px', fontSize: 12,
                                            color: 'var(--toul-pos-text-main)', outline: 'none',
                                        }}
                                    />
                                </div>
                                {payment.customerSearch.trim() && (
                                    <div style={{ marginTop: 6, maxHeight: 130, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--toul-pos-border)', overflow: 'hidden' }}>
                                        {filteredCustomers.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => selectCustomer(c)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                    padding: '7px 10px', background: 'none', border: 'none',
                                                    borderBottom: '1px solid var(--toul-pos-border)', cursor: 'pointer', textAlign: 'left',
                                                }}
                                            >
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--toul-pos-green-mint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--toul-primary)' }}>
                                                    {c.name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                                                </div>
                                                <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)' }}>{c.name}</span>
                                            </button>
                                        ))}
                                        {filteredCustomers.length === 0 && (
                                            <div style={{ padding: '10px', background: 'var(--toul-pos-green-dark)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                <p style={{ fontSize: 11, color: 'var(--toul-primary)', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <UserPlus size={12} /> Crear: &quot;{payment.customerSearch}&quot;
                                                </p>
                                                <input
                                                    placeholder="Teléfono (opcional)"
                                                    value={createPhone}
                                                    onChange={e => setCreatePhone(e.target.value)}
                                                    inputMode="numeric"
                                                    style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--toul-pos-text-main)', outline: 'none' }}
                                                />
                                                {createError && <p style={{ fontSize: 10, color: 'var(--toul-pos-error)', margin: 0 }}>{createError}</p>}
                                                <button
                                                    onClick={handleCreateCustomer}
                                                    disabled={creating}
                                                    style={{ background: creating ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)', color: creating ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)', border: 'none', borderRadius: 6, padding: '7px 0', fontSize: 12, fontWeight: 700, cursor: creating ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                                >
                                                    {creating ? <div style={{ width: 12, height: 12, border: '2px solid var(--toul-pos-bg-main)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} /> : 'Crear y seleccionar'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </Section>

                    {/* ── Campos crédito ───────────────────── */}
                    {isCredit && (
                        <Section label="Crédito">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                <div>
                                    <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Vence *</p>
                                    <input
                                        type="date"
                                        value={payment.dueDate}
                                        onChange={e => payment.setDueDate(e.target.value)}
                                        style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 8, padding: '8px', fontSize: 11, color: 'var(--toul-pos-text-main)', outline: 'none' }}
                                    />
                                </div>
                                <div>
                                    <p style={{ fontSize: 9, color: 'var(--toul-pos-text-sec)', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase' }}>Abono inicial</p>
                                    <input
                                        type="number" inputMode="numeric" placeholder="0"
                                        value={payment.initialPayment}
                                        onChange={e => payment.setInitialPayment(e.target.value)}
                                        style={{ width: '100%', background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 8, padding: '8px', fontSize: 11, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderRadius: 6, background: 'var(--toul-pos-warning-dim)' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--toul-pos-warning)' }}>Pendiente</span>
                                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--toul-pos-warning)' }}>
                                    {formatCOP(Math.max(0, payment.total - (Number(payment.initialPayment) || 0)))}
                                </span>
                            </div>
                        </Section>
                    )}

                    {/* ── Método de pago — 2-col cards ────── */}
                    {(payment.saleType === 'contado' || (isCredit && Number(payment.initialPayment) > 0)) && (
                        <Section label="¿Cómo te pagaron?">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {data.methods.map(m => {
                                    const isActive = payment.selectedMethodIds.includes(m.id)
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => payment.toggleMethod(m)}
                                            style={{
                                                background: isActive ? 'var(--toul-pos-green-surface)' : 'var(--toul-pos-bg-card)',
                                                border: `1.5px solid ${isActive ? 'var(--toul-primary)' : 'var(--toul-pos-border)'}`,
                                                borderRadius: 12, padding: 12, cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                position: 'relative', textAlign: 'left',
                                                transition: 'all 120ms ease',
                                            }}
                                        >
                                            {/* Check badge */}
                                            {isActive && (
                                                <div style={{
                                                    position: 'absolute', top: 6, right: 6,
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: 'var(--toul-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Check size={10} style={{ color: 'var(--toul-pos-bg-main)' }} />
                                                </div>
                                            )}
                                            {/* Icon circle */}
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                                background: `${m.color}20`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: m.color }} />
                                            </div>
                                            {/* Name */}
                                            <span style={{ fontSize: 12, color: 'var(--toul-pos-text-main)', fontWeight: 600 }}>
                                                {m.name}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Split inputs when multiple selected */}
                            {payment.paymentSplits.length > 0 && (
                                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {payment.paymentSplits.map(s => (
                                        <div key={s.methodId} style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            background: 'var(--toul-pos-bg-main)', borderRadius: 8, padding: '6px 10px', border: '1px solid var(--toul-pos-border)',
                                        }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.methodColor, flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', fontWeight: 600, flexShrink: 0 }}>{s.methodName}</span>
                                            <input
                                                type="number" inputMode="numeric" value={s.amount || ''} placeholder="0"
                                                onChange={e => payment.setMethodAmount(s.methodId, Number(e.target.value) || 0)}
                                                style={{ flex: 1, background: 'none', border: 'none', textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace', minWidth: 0 }}
                                            />
                                        </div>
                                    ))}
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: payment.balanced ? 'var(--toul-primary)' : 'var(--toul-pos-error)' }}>
                                            {payment.balanced ? '✓ Cubierto' : `Restan: ${formatCOP(payment.remaining)}`}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </Section>
                    )}

                    {/* ── Descuento ────────────────────────── */}
                    <Section label="Descuento">
                        {!showDiscount ? (
                            <button
                                onClick={() => { setShowDiscount(true); payment.setShowDiscount(true) }}
                                style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
                            >
                                <Plus size={14} /> Añadir descuento
                            </button>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                    onClick={handleDiscType}
                                    style={{ background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--toul-primary)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}
                                >
                                    {discType}<span style={{ fontSize: 9, opacity: 0.6 }}>⌄</span>
                                </button>
                                <input
                                    type="number" inputMode="numeric" placeholder="0" value={discValue}
                                    onChange={e => handleDiscValue(e.target.value)}
                                    style={{ flex: 1, background: 'var(--toul-pos-bg-main)', border: '1px solid var(--toul-pos-border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, color: 'var(--toul-pos-text-main)', outline: 'none', fontFamily: 'monospace', minWidth: 0 }}
                                />
                                <button
                                    onClick={() => { setShowDiscount(false); handleDiscValue('') }}
                                    style={{ background: 'none', border: 'none', color: 'var(--toul-pos-error)', fontSize: 14, cursor: 'pointer', padding: 0 }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </Section>
                </div>
            </div>

            {/* ── Sticky footer ──────────────────────────── */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                background: 'var(--toul-pos-bg-main)', borderTop: '1px solid var(--toul-pos-footer-border)',
                padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <div>
                    <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                        {cart.cartItems.length} prod · {cart.totalUnits} und
                    </p>
                    {payment.discountAmount > 0 && (
                        <p style={{ fontSize: 10, color: 'var(--toul-primary)', margin: 0 }}>−{formatCOP(payment.discountAmount)} desc.</p>
                    )}
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--toul-pos-text-main)', margin: 0 }}>{formatCOP(payment.total)}</p>
                </div>
                <button
                    onClick={onConfirm}
                    disabled={!payment.canConfirm || submitting}
                    style={{
                        background: (!payment.canConfirm || submitting) ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-primary)',
                        color: (!payment.canConfirm || submitting) ? 'var(--toul-pos-text-dim)' : 'var(--toul-pos-bg-main)',
                        border: 'none', borderRadius: 10, padding: '12px 18px',
                        fontSize: 13, fontWeight: 700, cursor: (!payment.canConfirm || submitting) ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    {submitting ? (
                        <div style={{ width: 16, height: 16, border: '2px solid var(--toul-pos-bg-main)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    ) : 'Confirmar venta'}
                </button>
            </div>
        </div>
    )
}
