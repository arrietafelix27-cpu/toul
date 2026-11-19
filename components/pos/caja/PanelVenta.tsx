'use client'

import type { ReactNode } from 'react'
import type { CartItem } from '@/lib/types'
import type { POSCartState } from '@/lib/pos/usePOSCart'
import { formatCOP } from '@/lib/utils'
import s from '@/components/pos/ui/pos.module.css'
import { BotonFantasma, BotonPrincipal, BotonVolver, PasoMini, cx, useMontado, useRebote } from '@/components/pos/ui'
import { Cuenta } from './piezas'
import type { Cambiar } from './Productos'

/* ══════════════════════════════════════════════════════════════
   Lo que lleva la venta (diseno/pos/SPEC.md §4 y §10).
   Celular: la barra de abajo con el total y "Cobrar".
   PC: el panel "Venta" a la derecha; "Cobrar" desliza el pago encima.
   ══════════════════════════════════════════════════════════════ */

/** La línea del carrito ('producto', 'producto:presentación' o 'combo:id') */
export const claveDe = (it: CartItem) =>
    it.isCombo ? `combo:${it.comboId}` : it.variantId ? `${it.product.id}:${it.variantId}` : it.product.id

const fotoDe = (it: CartItem) => ((it.product.images?.[0] || it.product.image_url) as string | null | undefined) ?? null
const nombreDe = (it: CartItem) => it.variantName ? `${it.product.name} · ${it.variantName}` : it.product.name
const unidades = (n: number) => `${n} ${n === 1 ? 'producto' : 'productos'}`

/* ── Celular: la barra del carrito ─────────────────────────────── */
export function BarraCobro({ cart, total, enviando, onCobrar }: {
    cart: POSCartState
    total: number
    enviando: boolean
    onCobrar: () => void
}) {
    const hay = cart.totalUnits > 0
    // Cada producto que entra hace saltar la barra
    const rebote = useRebote(cart.totalUnits)
    return (
        <div className={s.barra} data-on={hay ? '1' : undefined} aria-hidden={!hay}>
            <div className={cx(s.barraDentro, hay && rebote === 0 && s.pasoA, hay && rebote === 1 && s.pasoB)}>
                <span className={s.minis} aria-hidden="true">
                    {cart.cartItems.slice(0, 3).map(it => {
                        const foto = fotoDe(it)
                        return (
                            <span key={claveDe(it)} className={s.mini}>
                                {foto ? <img src={foto} alt="" draggable={false} /> : it.product.name.trim().charAt(0).toUpperCase()}
                            </span>
                        )
                    })}
                </span>
                <span className={s.barraTexto}>
                    <Cuenta valor={total} className={s.barraTotal} />
                    <span className={s.barraUnidades} style={{ display: 'block' }}>{unidades(cart.totalUnits)}</span>
                </span>
                <BotonPrincipal flecha onClick={onCobrar} disabled={!hay || enviando} tabIndex={hay ? 0 : -1}>
                    {enviando ? 'Registrando…' : 'Cobrar'}
                </BotonPrincipal>
            </div>
        </div>
    )
}

/* ── PC: el panel "Venta" ──────────────────────────────────────── */
export function PanelVenta({ cart, total, pagando, enviando, base, onCambiar, onVaciar, onCobrar, onVolver, onVerVentas, pago, volver }: {
    cart: POSCartState
    total: number
    /** El pago está encima (o la venta registrada) */
    pagando: boolean
    enviando: boolean
    /** Al abrir la caja el panel entra después del zoom (ms) */
    base: number
    onCambiar: Cambiar
    onVaciar: () => void
    onCobrar: () => void
    onVolver: () => void
    onVerVentas: () => void
    /** El cobro o la venta registrada */
    pago: ReactNode
    /** Con el pago encima, ¿hay a dónde volver? (no con la venta ya registrada) */
    volver: boolean
}) {
    const hay = cart.totalUnits > 0
    // El pago sigue montado mientras se desliza afuera
    const { montado } = useMontado(pagando, 460)
    return (
        <aside aria-label="Venta" className={cx(s.panel, s.panelEntra)} style={{ ['--base' as string]: `${base}ms` }}>
            <div className={s.panelVista} data-estado={pagando ? 'fuera' : undefined} aria-hidden={pagando}>
                <div className={s.panelCabeza}>
                    <span>Venta</span>
                    <span className={s.panelAcciones}>
                        <button type="button" className={s.verVentas} onClick={onVerVentas} tabIndex={pagando ? -1 : 0}>Ver ventas de hoy</button>
                        {hay && <BotonFantasma onClick={onVaciar} tabIndex={pagando ? -1 : 0}>Vaciar</BotonFantasma>}
                    </span>
                </div>
                <div className={s.panelLista}>
                    {hay ? cart.cartItems.map(it => {
                        const key = claveDe(it)
                        const precio = Math.round(it.unitPrice ?? it.product.sale_price)
                        const nombre = nombreDe(it)
                        return (
                            <div key={key} className={s.linea}>
                                <div className={s.lineaTexto}>
                                    <div className={s.lineaNombre}>{nombre}</div>
                                    <div className={s.lineaSub}>{formatCOP(Math.round(precio * it.quantity))}</div>
                                </div>
                                <span className={s.pasoMiniGrande}>
                                    <PasoMini cantidad={it.quantity} nombre={nombre} onCambiar={n => onCambiar(key, n, nombre)} />
                                </span>
                            </div>
                        )
                    }) : (
                        <div className={s.vacioVenta}>
                            <span className={s.vacioIcono} aria-hidden="true">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
                                </svg>
                            </span>
                            <p className={s.vacioTitulo} style={{ marginTop: 16 }}>Agrega productos</p>
                            <p className={s.vacioTexto}>Toca un producto o búscalo con /</p>
                        </div>
                    )}
                </div>
                <div className={s.panelPie}>
                    <div className={s.panelEtiqueta}>Total{hay && ` · ${unidades(cart.totalUnits)}`}</div>
                    <Cuenta valor={total} className={s.totalGrande} />
                    <button type="button" className={s.cobrarPc} onClick={onCobrar} disabled={!hay || enviando} tabIndex={pagando ? -1 : 0}>
                        Cobrar<kbd className={cx(s.tecla, s.teclaOscura)}>Enter</kbd>
                    </button>
                </div>
            </div>

            <div className={cx(s.panelVista, s.panelCobro)} data-estado={pagando ? 'dentro' : undefined} aria-hidden={!pagando}>
                {montado && (
                    <>
                        {volver && (
                            <div className={s.panelVolver}>
                                <BotonVolver onClick={onVolver} aria-label="Volver a la venta" disabled={enviando} />
                            </div>
                        )}
                        <div style={{ flex: 1, minHeight: 0 }}>{pago}</div>
                    </>
                )}
            </div>
        </aside>
    )
}
