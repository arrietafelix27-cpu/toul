'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from './panelStyles'

/* ══════════════════════════════════════════════════════════════
   Plata pendiente.
   Antes solo informaba un total. Ahora cada renglón se puede
   resolver sin salir del inicio: cobrar por WhatsApp o abrir al
   cliente para registrar el abono.
   ══════════════════════════════════════════════════════════════ */

export interface PendingParty {
    id: string
    name: string
    amount: number
    phone: string | null
    /** Días desde que quedó debiendo. null si no se sabe. */
    days: number | null
}

export interface PendingData {
    customerDebts: PendingParty[]
    providerDebts: PendingParty[]
}

type Side = 'cobrar' | 'pagar'

const CSS = PANEL_CSS + `
.pp-tab { position: relative; flex: 1; min-width: 0; text-align: left; cursor: pointer; font-family: inherit;
    padding: 10px 12px; border-radius: 14px; border: 1px solid transparent; background: transparent;
    transition: transform 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1); }
.pp-tab > * { position: relative; z-index: 1; }
.pp-tab:active { transform: scale(0.98); }

.pp-wa { width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0; border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.055); color: var(--toul-text-dim); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pp-wa:active { transform: scale(0.94); }

.pp-item { opacity: 0; transform: translateY(6px); animation: pp-in 260ms cubic-bezier(0.23,1,0.32,1) forwards; }
@keyframes pp-in { to { opacity: 1; transform: translateY(0); } }

@media (hover: hover) and (pointer: fine) {
    .pp-wa:hover { background: var(--toul-accent-dim); color: var(--toul-accent); border-color: var(--toul-accent-dim); }
}
@media (prefers-reduced-motion: reduce) {
    .pp-item { animation: none; opacity: 1; transform: none; }
    .pp-tab:active, .pp-wa:active { transform: none; }
}
`

/** 3002223344 → 573002223344 (Colombia) */
function whatsappLink(phone: string, message: string) {
    const digits = phone.replace(/\D/g, '')
    const withCountry = digits.length === 10 ? `57${digits}` : digits
    return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

const initialsOf = (name: string) =>
    name.trim().split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 2)

const sinceLabel = (days: number | null) => {
    if (days === null) return null
    if (days <= 0) return 'hoy'
    if (days === 1) return 'hace 1 día'
    if (days < 30) return `hace ${days} días`
    const months = Math.floor(days / 30)
    return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

export function PendingPanel({ pending, storeName, compact = false }: {
    pending: PendingData
    storeName?: string | null
    compact?: boolean
}) {
    const [side, setSide] = useState<Side>('cobrar')

    const totals = useMemo(() => ({
        cobrar: pending.customerDebts.reduce((sum, row) => sum + row.amount, 0),
        pagar: pending.providerDebts.reduce((sum, row) => sum + row.amount, 0),
    }), [pending])

    const list = side === 'cobrar' ? pending.customerDebts : pending.providerDebts
    const shown = list.slice(0, compact ? 3 : 4)
    const isCobrar = side === 'cobrar'
    // Si alguno tiene WhatsApp, todos reservan ese espacio: los montos
    // quedan alineados en vez de bailar de renglón en renglón
    const reserveAction = isCobrar && shown.some(party => party.phone)
    const tone = isCobrar ? 'var(--toul-accent)' : 'var(--toul-warning)'

    return (
        <div className="pnl">
            <style>{CSS}</style>

            <p className="pnl-label" style={{ marginBottom: 10 }}>Plata pendiente</p>

            {/* Los dos totales son el control: tocar uno cambia la lista */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {([
                    { key: 'cobrar' as Side, label: 'Te deben', value: totals.cobrar, count: pending.customerDebts.length, color: 'var(--toul-accent)' },
                    { key: 'pagar' as Side, label: 'Debes', value: totals.pagar, count: pending.providerDebts.length, color: 'var(--toul-warning)' },
                ]).map(tab => {
                    const active = side === tab.key
                    return (
                        <button key={tab.key} className="pp-tab" onClick={() => setSide(tab.key)}
                            aria-pressed={active}
                            style={{ borderColor: active ? 'var(--toul-border)' : 'transparent' }}>
                            {active && (
                                <motion.span
                                    layoutId="pending-active"
                                    transition={{ type: 'spring', duration: 0.35, bounce: 0.12 }}
                                    style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: 14, background: 'rgba(255,255,255,0.045)' }}
                                />
                            )}
                            <span style={{
                                display: 'block', fontSize: 11, fontWeight: 500,
                                color: active ? 'var(--toul-text-muted)' : 'var(--toul-text-subtle)',
                            }}>
                                {tab.label}
                            </span>
                            <span style={{
                                display: 'block', fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 1,
                                color: tab.value > 0 ? tab.color : 'var(--toul-text-dim)',
                            }}>
                                {formatCOP(tab.value)}
                            </span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--toul-text-subtle)', marginTop: 1 }}>
                                {tab.count === 0
                                    ? '—'
                                    : `${tab.count} ${tab.key === 'cobrar'
                                        ? (tab.count === 1 ? 'cliente' : 'clientes')
                                        : (tab.count === 1 ? 'proveedor' : 'proveedores')}`}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* La lista: cada renglón se puede resolver */}
            {shown.length === 0 ? (
                <div style={{ padding: '18px 10px', textAlign: 'center' }}>
                    <p style={{ fontSize: 12.5, color: 'var(--toul-text-subtle)', margin: 0 }}>
                        {isCobrar ? 'Nadie te debe nada.' : 'No le debes nada a nadie.'}
                    </p>
                </div>
            ) : (
                <div key={side} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {shown.map((party, index) => {
                        const since = sinceLabel(party.days)
                        const href = isCobrar ? `/customers/${party.id}` : `/providers/${party.id}`
                        const message = isCobrar
                            ? `Hola ${party.name.split(' ')[0]}, ¿cómo vas? Te escribo${storeName ? ` de ${storeName}` : ''} para recordarte el saldo pendiente de ${formatCOP(party.amount)}. ¿Cuándo podemos cuadrar?`
                            : ''

                        return (
                            <div key={party.id} className="pp-item"
                                style={{ display: 'flex', alignItems: 'center', gap: 6, animationDelay: `${index * 45}ms` }}>
                                <Link href={href} className="pnl-row" style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{
                                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 10.5, fontWeight: 700, color: tone,
                                        background: isCobrar ? 'var(--toul-accent-dim)' : 'var(--toul-warning-dim)',
                                    }}>
                                        {initialsOf(party.name)}
                                    </span>

                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--toul-text)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {party.name}
                                        </span>
                                        {since && (
                                            <span style={{
                                                display: 'block', fontSize: 11,
                                                color: (party.days ?? 0) >= 30 ? 'var(--toul-error)' : 'var(--toul-text-subtle)',
                                            }}>
                                                {since}
                                            </span>
                                        )}
                                    </span>

                                    <span style={{ fontSize: 13, fontWeight: 700, color: tone, flexShrink: 0 }}>
                                        {formatCOP(party.amount)}
                                    </span>
                                </Link>

                                {reserveAction && (
                                    party.phone ? (
                                        <a className="pp-wa" href={whatsappLink(party.phone, message)}
                                            target="_blank" rel="noopener noreferrer"
                                            aria-label={`Recordarle a ${party.name} por WhatsApp`}
                                            title="Recordar por WhatsApp">
                                            <MessageCircle size={15} />
                                        </a>
                                    ) : (
                                        <span aria-hidden style={{ width: 32, flexShrink: 0 }} />
                                    )
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {list.length > shown.length && (
                <Link href={isCobrar ? '/customers' : '/providers'}
                    className="pnl-row"
                    style={{ justifyContent: 'center', gap: 6, marginTop: 4, fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)' }}>
                    Ver los {list.length} <ArrowRight size={13} />
                </Link>
            )}
        </div>
    )
}
