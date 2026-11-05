'use client'

import type { POSDataState } from '@/lib/pos/usePOSData'
import type { POSCartState } from '@/lib/pos/usePOSCart'
import { formatCOP } from '@/lib/utils'
import { Hoja } from './Hoja'
import { Cantidad } from './piezas'
import { vibrar } from '@/lib/pos/useCobro'

/** Elegir presentación: una fila por cada una con precio, stock y − +. */
export function Presentaciones({ productId, data, cart, narrow, onClose }: {
    productId: string | null
    data: POSDataState
    cart: POSCartState
    narrow: boolean
    onClose: () => void
}) {
    const producto = productId ? data.products.find(p => p.id === productId) : undefined
    const variantes = productId ? data.variantsByProduct[productId] ?? [] : []

    return (
        <Hoja open={!!producto} onClose={onClose} narrow={narrow} titulo={producto?.name} subtitulo="Elige la presentación"
            pie={
                <button type="button" onClick={onClose} className="cj-btn cj-press-suave"
                    style={{ width: '100%', height: 54, borderRadius: 16, background: 'var(--toul-accent)', color: 'var(--toul-bg)', fontSize: 16, fontWeight: 650 }}>
                    Listo
                </button>
            }>
            <div style={{ padding: '0 20px' }}>
                {variantes.map(v => {
                    const key = `${productId}:${v.id}`
                    const n = cart.cartMap[key] || 0
                    const agotada = v.stock <= 0
                    const puede = cart.canAdd(key)
                    const agregar = () => { if (puede) { cart.addItem(key); vibrar(8) } }
                    return (
                        <div key={v.id} style={{
                            display: 'flex', alignItems: 'center', gap: 12, minHeight: 66, padding: '10px 0',
                            borderBottom: '1px solid var(--toul-divider)', opacity: agotada && n === 0 ? 0.32 : 1,
                        }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 15, fontWeight: 550, color: 'var(--toul-text)' }}>{v.name}</span>
                                <span style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 13 }}>
                                    <span className="cj-num" style={{ fontWeight: 650, color: 'var(--toul-text)' }}>{formatCOP(v.sale_price)}</span>
                                    <span style={{ color: agotada ? 'var(--toul-text-dim)' : v.stock <= 3 ? 'var(--toul-warning)' : 'var(--toul-text-subtle)' }}>
                                        {agotada ? 'Agotada' : v.stock <= 3 ? `Quedan ${Math.round(v.stock)}` : `${Math.round(v.stock)} disponibles`}
                                    </span>
                                </span>
                            </span>
                            {n > 0 ? (
                                <Cantidad n={n} onMenos={() => cart.decrementItem(key)} onMas={agregar} puedeMas={puede} grande etiqueta={v.name} />
                            ) : (
                                <button type="button" onClick={agregar} disabled={!puede} className="cj-btn cj-press cj-chip" aria-label={`Agregar ${v.name}`}>
                                    Agregar
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </Hoja>
    )
}
