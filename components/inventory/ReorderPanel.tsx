'use client'

import { useRouter } from 'next/navigation'
import { ArrowRight, Check } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { InventoryRow, ROW_CSS } from '@/components/inventory/InventoryRow'
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

const CSS = PANEL_CSS + ROW_CSS + `
.rp-head { display: flex; align-items: center; justify-content: space-between;
    gap: 14px; flex-wrap: wrap; margin-bottom: 10px; }

.rp-armar { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;
    height: 40px; padding: 0 16px; border-radius: 13px; border: none; cursor: pointer;
    font-family: inherit; font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
    background: var(--toul-accent); color: #000;
    box-shadow: 0 4px 20px var(--toul-accent-glow);
    transition: transform 140ms cubic-bezier(0.23,1,0.32,1), box-shadow 200ms ease; }
.rp-armar:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) {
    .rp-armar:hover { box-shadow: 0 6px 26px var(--toul-accent-glow); }
}
@media (prefers-reduced-motion: reduce) { .rp-armar:active { transform: none; } }
`

const MOSTRADAS = 5

export function ReorderPanel({ items }: { items: ReorderItem[] }) {
    const router = useRouter()

    if (items.length === 0) {
        return (
            <section>
                <style>{CSS}</style>
                <p className="pnl-label" style={{ marginBottom: 10 }}>Hay que reponer</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px' }}>
                    <Check size={17} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                        No te falta nada. Todo tiene existencias para el tiempo que pediste.
                    </p>
                </div>
            </section>
        )
    }

    const total = items.reduce((sum, item) => sum + item.toOrder * item.cost, 0)
    const mostradas = items.slice(0, MOSTRADAS)
    const resto = items.length - mostradas.length

    function armar() {
        const lineas: PedidoLinea[] = items.map(item => ({
            productId: item.productId,
            variantId: item.kind === 'presentacion' ? item.id : null,
            quantity: item.toOrder,
        }))
        router.push(guardarPedido(lineas))
    }

    return (
        <section>
            <style>{CSS}</style>

            <div className="rp-head">
                <div style={{ minWidth: 0 }}>
                    <p className="pnl-label">
                        Hay que reponer · {items.length}
                    </p>
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                        {total > 0 ? <>Te costaría unos <strong style={{ color: 'var(--toul-text)', fontWeight: 600 }}>{formatCOP(total)}</strong></>
                            : 'Aún no sabemos cuánto cuestan'}
                    </p>
                </div>
                <button className="rp-armar" onClick={armar}>
                    Armar pedido <ArrowRight size={16} />
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {mostradas.map((item, index) => (
                    <InventoryRow
                        key={`${item.kind}-${item.id}`}
                        href={item.kind === 'presentacion' ? `/inventory/variant/${item.id}` : `/inventory/${item.id}`}
                        image={item.image}
                        name={item.title}
                        title={item.subtitle ? `${item.title} · ${item.subtitle}` : item.title}
                        subtitle={item.stock <= 0 ? 'se agotó' : `quedan ${item.stock}`}
                        tone={item.stock <= 0 ? 'error' : 'warn'}
                        stock={item.stock}
                        target={item.stock + item.toOrder}
                        delay={index * 40}
                        trailing={
                            <span style={{ flexShrink: 0, textAlign: 'right' }}>
                                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--toul-text-muted)', whiteSpace: 'nowrap' }}>
                                    pide {item.toOrder}
                                </span>
                                {item.stock > 0 && (
                                    <span className="ivr-nivel">
                                        <i style={{
                                            background: 'var(--toul-warning)',
                                            ['--nivel' as string]: Math.min(item.stock / (item.stock + item.toOrder), 1),
                                            animationDelay: `${index * 40}ms`,
                                        }} />
                                    </span>
                                )}
                            </span>
                        }
                    />
                ))}
            </div>

            {resto > 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '9px 0 0 10px' }}>
                    y {resto} {resto === 1 ? 'más, incluida' : 'más, incluidas'} en el pedido
                </p>
            )}
        </section>
    )
}
