'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Package, PartyPopper } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { guardarPedido, type PedidoLinea } from '@/lib/inventory/pedido'

/* ══════════════════════════════════════════════════════════════
   Hay que reponer.
   No es una lista de alertas: es un pedido. Por eso hay una sola
   acción —armarlo— y no un botón por renglón.
   ══════════════════════════════════════════════════════════════ */

export interface ReorderItem {
    id: string
    kind: 'producto' | 'presentacion'
    productId: string
    title: string
    subtitle: string | null
    image: string | null
    stock: number
    /** Cuántas sugiere pedir */
    toOrder: number
    /** Lo que cuesta cada una */
    cost: number
}

const CSS = PANEL_CSS + `
.rp-item { opacity: 0; transform: translateY(5px); animation: rp-in 240ms cubic-bezier(0.23,1,0.32,1) forwards; }
@keyframes rp-in { to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .rp-item { animation: none; opacity: 1; transform: none; } }
`

const SHOWN = 5

export function ReorderPanel({ items }: { items: ReorderItem[] }) {
    const router = useRouter()

    if (items.length === 0) {
        return (
            <div className="pnl">
                <style>{CSS}</style>
                <p className="pnl-label" style={{ marginBottom: 10 }}>Hay que reponer</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 2px' }}>
                    <PartyPopper size={18} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        No te falta nada. Todo tiene existencias para el tiempo que pediste.
                    </p>
                </div>
            </div>
        )
    }

    const total = items.reduce((sum, item) => sum + item.toOrder * item.cost, 0)
    const shown = items.slice(0, SHOWN)
    const rest = items.length - shown.length

    function armar() {
        const lineas: PedidoLinea[] = items.map(item => ({
            productId: item.productId,
            variantId: item.kind === 'presentacion' ? item.id : null,
            quantity: item.toOrder,
        }))
        router.push(guardarPedido(lineas))
    }

    return (
        <div className="pnl">
            <style>{CSS}</style>
            <p className="pnl-label" style={{ marginBottom: 8 }}>Hay que reponer</p>

            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.2 }}>
                {items.length} {items.length === 1 ? 'cosa' : 'cosas'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                {total > 0 ? `Te costaría unos ${formatCOP(total)}` : 'Aún no sabemos cuánto cuestan'}
            </p>

            <button onClick={armar}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
                    marginTop: 12, height: 42, padding: '0 17px', borderRadius: 13, border: 'none',
                    background: 'var(--toul-accent)', color: '#000', fontFamily: 'inherit',
                    fontSize: 14.5, fontWeight: 600, cursor: 'pointer',
                    boxShadow: '0 4px 20px var(--toul-accent-glow)',
                }}>
                Armar pedido <ArrowRight size={16} />
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 14 }}>
                {shown.map((item, index) => (
                    <Link key={`${item.kind}-${item.id}`} className="pnl-row rp-item"
                        href={item.kind === 'presentacion' ? `/inventory/variant/${item.id}` : `/inventory/${item.id}`}
                        style={{ animationDelay: `${index * 40}ms` }}>
                        <span style={{
                            width: 32, height: 32, borderRadius: 10, flexShrink: 0, overflow: 'hidden', position: 'relative',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                        }}>
                            {item.image
                                ? <img src={item.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <Package size={14} style={{ color: 'var(--toul-text-faint)' }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.title}{item.subtitle ? ` · ${item.subtitle}` : ''}
                            </span>
                            <span style={{ display: 'block', fontSize: 11.5, color: item.stock <= 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                {item.stock <= 0 ? 'se agotó' : `quedan ${item.stock}`}
                            </span>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text-muted)', flexShrink: 0 }}>
                            pide {item.toOrder}
                        </span>
                    </Link>
                ))}
            </div>

            {rest > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '8px 0 0 10px' }}>
                    y {rest} {rest === 1 ? 'más' : 'más'}, {rest === 1 ? 'incluida' : 'incluidas'} en el pedido
                </p>
            )}
        </div>
    )
}
