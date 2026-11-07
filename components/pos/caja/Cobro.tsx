'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X, Banknote, Wallet, Landmark, CreditCard, ShoppingBag, AlertTriangle, Check, ShieldCheck } from 'lucide-react'
import { usePOSFlow } from '@/components/pos/POSFlowProvider'
import { useCaja } from '@/components/isla/CajaContext'
import type { CobroState } from '@/lib/pos/useCobro'
import { sugerenciasEfectivo, tipoDeMetodo } from '@/lib/pos/pagos'
import { descuentoPermitido } from '@/lib/pos/permisos'
import { nombreMetodo, onlyDigits } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import { Foto, Cantidad, Segmentado, Cuenta, CampoPesos, EASE_HOJA } from './piezas'
import { Cliente } from './Cliente'

const ICONO = { efectivo: Banknote, billetera: Wallet, banco: Landmark, tarjeta: CreditCard }

/** Fecha local (la del equipo) dentro de n días, como la guarda el fiado */
function enDias(n: number) {
    const d = new Date()
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
    return (
        <section style={{ marginTop: 26 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <h3 className="cj-titulo">{titulo}</h3>
                {extra}
            </div>
            {children}
        </section>
    )
}

export function Cobro({ cobro, narrow }: { cobro: CobroState; narrow: boolean }) {
    const { data, cart, payment } = usePOSFlow()
    const { ctx, permisos, offline } = useCaja()
    const esAdmin = ctx.role === 'admin'
    const esFiado = payment.saleType === 'credito'
    const online = offline.online
    const sinFiar = !esAdmin && permisos.fiar === 'no'

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* layoutScroll: las líneas se acomodan bien aunque el panel tenga scroll */}
            <motion.div layoutScroll className="cj-scroll-y" style={{ flex: 1, minHeight: 0, padding: narrow ? '4px 20px 24px' : '22px 24px 24px' }}>
                {/* ── Tu venta ─────────────────────────────────── */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Tu venta</h2>
                    {!cart.isEmpty && (
                        <span style={{ fontSize: 13, color: 'var(--toul-text-subtle)' }}>
                            {cart.totalUnits} {cart.totalUnits === 1 ? 'producto' : 'productos'}
                        </span>
                    )}
                </div>

                {cart.isEmpty ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '22px 0 6px', color: 'var(--toul-text-subtle)' }}>
                        <ShoppingBag size={20} strokeWidth={1.7} />
                        <span style={{ fontSize: 14.5 }}>Toca un producto para empezar</span>
                    </div>
                ) : (
                    <div style={{ marginTop: 8 }}>
                        <AnimatePresence initial={false} mode="popLayout">
                            {cart.cartItems.map(item => {
                                const key = item.isCombo ? `combo:${item.comboId}` : item.variantId ? `${item.product.id}:${item.variantId}` : item.product.id
                                const precio = item.unitPrice ?? item.product.sale_price
                                const foto = (item.product.images?.[0] || item.product.image_url) as string | null
                                return (
                                    <motion.div key={key} layout
                                        initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 28 }}
                                        transition={{ duration: 0.28, ease: EASE_HOJA }}
                                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--toul-divider)' }}>
                                        <Foto src={foto} combo={item.isCombo} tamaño={44} radio={12} />
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 550, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.product.name}</span>
                                            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--toul-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.variantName ?? (item.isCombo ? 'Combo' : formatCOP(precio))}
                                            </span>
                                        </span>
                                        <Cantidad n={item.quantity} etiqueta={item.product.name}
                                            onMenos={() => cart.decrementItem(key)} onMas={() => cart.addItem(key)} puedeMas={cart.canAdd(key)} />
                                        <span className="cj-num" style={{ minWidth: 78, textAlign: 'right', fontSize: 15, fontWeight: 650, color: 'var(--toul-text)' }}>
                                            {formatCOP(precio * item.quantity)}
                                        </span>
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                        <Descuento />
                    </div>
                )}

                {!cart.isEmpty && (<>
                    {/* ── Contado o crédito ─────────────────────────── */}
                    <section style={{ marginTop: 24 }}>
                        <Segmentado id="tipo" valor={payment.saleType} onChange={payment.setSaleType}
                            opciones={[
                                { valor: 'contado', label: 'Contado' },
                                { valor: 'credito', label: 'Crédito', deshabilitado: (!online && !esFiado) || (sinFiar && !esFiado) },
                            ]} />
                        {!online && <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: '8px 2px 0' }}>Sin internet solo se vende de contado.</p>}
                        {online && sinFiar && <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: '8px 2px 0' }}>No tienes permiso para fiar.</p>}
                    </section>

                    <Seccion titulo="Cliente" extra={
                        <span style={{ fontSize: 12.5, color: esFiado ? 'var(--toul-warning)' : 'var(--toul-text-subtle)' }}>
                            {esFiado ? 'obligatorio' : 'opcional'}
                        </span>
                    }>
                        <Cliente data={data} payment={payment} esFiado={esFiado}
                            puedeCrear={esAdmin || permisos.crear_clientes === 'solo'} />
                    </Seccion>

                    {esFiado && <Credito />}

                    {payment.paymentTarget > 0 && <Metodos />}

                    {payment.paymentTarget > 0 && payment.cashDue > 0 && <Efectivo />}

                    <Aprobacion cobro={cobro} />

                    {cobro.error && (
                        <div role="alert" style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                            <AlertTriangle size={18} style={{ color: 'var(--toul-error)', flexShrink: 0, marginTop: 1 }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-error)' }}>{cobro.error}</span>
                                <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-subtle)', marginTop: 2 }}>Tu venta sigue aquí.</span>
                            </span>
                            <button type="button" onClick={cobro.limpiarError} aria-label="Cerrar aviso" className="cj-btn"
                                style={{ background: 'transparent', color: 'var(--toul-text-subtle)', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </>)}
            </motion.div>

            <Pie cobro={cobro} narrow={narrow} />
        </div>
    )
}

/* ── Agregar descuento: en pesos o en porcentaje ─────────────────── */
function Descuento() {
    const { cart, payment } = usePOSFlow()
    const { ctx, permisos } = useCaja()
    const abierto = payment.showDiscount || payment.discountAmount > 0
    const limite = descuentoPermitido(cart.subtotal, permisos.descuento_max)
    const pasa = ctx.role !== 'admin' && payment.discountAmount > limite

    if (!abierto) {
        return (
            <button type="button" onClick={() => payment.setShowDiscount(true)} className="cj-btn cj-link" style={{ marginTop: 14 }}>
                <Plus size={15} /> Agregar descuento
            </button>
        )
    }

    const valor = payment.discountValue ? Number(payment.discountValue) : null
    return (
        <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 104, flexShrink: 0 }}>
                    <Segmentado id="descuento" alto={48} valor={payment.discountType}
                        onChange={t => { payment.setDiscountType(t); payment.setDiscountValue('') }}
                        opciones={[{ valor: '$', label: '$' }, { valor: '%', label: '%' }]} />
                </span>
                {payment.discountType === '$' ? (
                    <CampoPesos etiqueta="Descuento en pesos" valor={valor} autoFocus
                        onChange={v => payment.setDiscountValue(v === null ? '' : String(Math.min(v, cart.subtotal)))} />
                ) : (
                    <span style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <input type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" aria-label="Descuento en porcentaje" autoFocus
                            className="cj-campo cj-num" placeholder="0" value={payment.discountValue}
                            onChange={e => { const d = onlyDigits(e.target.value); payment.setDiscountValue(d ? String(Math.min(100, Number(d))) : '') }}
                            style={{ paddingRight: 34, fontWeight: 600 }} />
                        <span aria-hidden style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }}>%</span>
                    </span>
                )}
                <button type="button" aria-label="Quitar descuento" className="cj-btn cj-press"
                    onClick={() => { payment.setDiscountValue(''); payment.setShowDiscount(false) }}
                    style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={16} />
                </button>
            </div>
            {payment.discountAmount > 0 && (
                <p style={{ fontSize: 13, margin: '8px 2px 0', color: pasa ? 'var(--toul-warning)' : 'var(--toul-text-subtle)' }}>
                    {pasa
                        ? `Más del ${permisos.descuento_max}% necesita aprobación del administrador`
                        : `Descuento de ${formatCOP(payment.discountAmount)} · ${Math.round(payment.discountAmount / Math.max(1, cart.subtotal) * 100)}%`}
                </p>
            )}
        </div>
    )
}

/* ── Fiado: plazo, abono y lo que queda debiendo ─────────────────── */
function Credito() {
    const { payment } = usePOSFlow()
    const [otraFecha, setOtraFecha] = useState(false)
    const plazo = otraFecha ? 'otra'
        : !payment.dueDate ? 'sin'
        : payment.dueDate === enDias(15) ? '15'
        : payment.dueDate === enDias(30) ? '30'
        : 'otra'
    const elegirPlazo = (p: string) => {
        setOtraFecha(p === 'otra')
        if (p === 'sin') payment.setDueDate('')
        else if (p === '15') payment.setDueDate(enDias(15))
        else if (p === '30') payment.setDueDate(enDias(30))
    }
    const debe = Math.max(0, payment.total - payment.paymentTarget)
    const abonoOtro = payment.initialPayment ? Number(payment.initialPayment) : null

    return (<>
        <Seccion titulo="Plazo">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[['sin', 'Sin plazo'], ['15', '15 días'], ['30', '30 días'], ['otra', 'Otra fecha']].map(([v, l]) => (
                    <button key={v} type="button" data-on={plazo === v ? '1' : '0'} onClick={() => elegirPlazo(v)} className="cj-btn cj-chip cj-press">{l}</button>
                ))}
            </div>
            {plazo === 'otra' && (
                <input type="date" aria-label="Fecha para pagar" className="cj-campo" style={{ marginTop: 10, colorScheme: 'dark' }}
                    min={enDias(1)} value={payment.dueDate} onChange={e => payment.setDueDate(e.target.value)} />
            )}
        </Seccion>

        <Seccion titulo="Abono">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {([['sin', 'Sin abono'], ['mitad', 'La mitad'], ['otro', 'Otro']] as const).map(([v, l]) => (
                    <button key={v} type="button" data-on={payment.abonoMode === v ? '1' : '0'} onClick={() => payment.setAbonoMode(v)} className="cj-btn cj-chip cj-press">{l}</button>
                ))}
            </div>
            {payment.abonoMode === 'otro' && (
                <div style={{ marginTop: 10 }}>
                    <CampoPesos etiqueta="Abono" valor={abonoOtro} autoFocus
                        onChange={v => payment.setInitialPayment(v === null ? '' : String(Math.min(v, payment.total)))} />
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 }}>
                <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-warning)' }}>Queda debiendo</span>
                <Cuenta valor={debe} style={{ fontSize: 18, fontWeight: 700, color: 'var(--toul-warning)' }} />
            </div>
        </Seccion>
    </>)
}

/* ── ¿Cómo te pagaron? El primero se lleva lo que falta ──────────── */
function Metodos() {
    const { data, payment } = usePOSFlow()
    const [dividirAbierto, setDividirAbierto] = useState(false)
    const dividir = dividirAbierto || payment.selectedMethodIds.length > 1
    const esFiado = payment.saleType === 'credito'

    if (data.methods.length === 0) {
        return (
            <Seccion titulo="¿Cómo te pagaron?">
                <p style={{ fontSize: 14, color: 'var(--toul-text-subtle)', margin: 0 }}>No hay métodos de pago. El administrador los agrega en Ajustes.</p>
            </Seccion>
        )
    }

    return (
        <Seccion titulo={esFiado ? '¿Cómo pagó el abono?' : '¿Cómo te pagaron?'}
            extra={data.methods.length > 1 && (
                <button type="button" className="cj-btn cj-link" style={{ fontSize: 13 }}
                    onClick={() => {
                        if (dividir) {
                            const primero = data.methods.find(m => m.id === payment.selectedMethodIds[0])
                            if (primero) payment.chooseMethod(primero)
                            setDividirAbierto(false)
                        } else setDividirAbierto(true)
                    }}>
                    {dividir ? 'Un solo método' : 'Dividir el pago'}
                </button>
            )}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', gap: 8 }}>
                {data.methods.map(m => {
                    const on = payment.selectedMethodIds.includes(m.id)
                    const Icono = ICONO[tipoDeMetodo(m.name)]
                    return (
                        <button key={m.id} type="button" aria-pressed={on} className="cj-btn cj-press"
                            onClick={() => dividir ? payment.toggleMethod(m) : payment.chooseMethod(m)}
                            style={{
                                height: 54, padding: '0 14px', borderRadius: 15, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
                                background: on ? 'var(--toul-surface-2)' : 'var(--toul-surface)',
                                boxShadow: on ? 'inset 0 0 0 1.5px var(--toul-text)' : 'none',
                                color: on ? 'var(--toul-text)' : 'var(--toul-text-muted)', fontSize: 14.5, fontWeight: on ? 600 : 500,
                            }}>
                            <Icono size={18} strokeWidth={1.9} style={{ color: m.color || 'currentColor', flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreMetodo(m.name)}</span>
                        </button>
                    )
                })}
            </div>

            {dividir && payment.paymentSplits.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    {payment.paymentSplits.map((s, i) => (
                        <div key={s.methodId} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, borderBottom: '1px solid var(--toul-divider)' }}>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 550, color: 'var(--toul-text)' }}>{nombreMetodo(s.methodName)}</span>
                                {i === 0 && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--toul-text-subtle)' }}>Lo que falta</span>}
                            </span>
                            {i === 0 ? (
                                <Cuenta valor={s.amount} style={{ fontSize: 15.5, fontWeight: 650, color: 'var(--toul-text)' }} />
                            ) : (
                                <span style={{ width: 150 }}>
                                    <CampoPesos etiqueta={`Monto en ${nombreMetodo(s.methodName)}`} alto={44}
                                        valor={payment.typedAmounts[s.methodId] ?? null}
                                        invalido={payment.overpaid > 0}
                                        onChange={v => payment.setMethodAmount(s.methodId, v)} />
                                </span>
                            )}
                        </div>
                    ))}
                    {payment.overpaid > 0 && (
                        <p role="alert" style={{ fontSize: 13, color: 'var(--toul-error)', margin: '8px 2px 0' }}>
                            Lo escrito pasa el total por {formatCOP(payment.overpaid)}
                        </p>
                    )}
                    {payment.selectedMethodIds.length === 1 && (
                        <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: '8px 2px 0' }}>Elige el otro método con el que te pagaron.</p>
                    )}
                </div>
            )}
        </Seccion>
    )
}

/* ── ¿Con cuánto te pagó? Exacto, billetes sugeridos u otro ──────── */
function Efectivo() {
    const { payment } = usePOSFlow()
    const [otroAbierto, setOtroAbierto] = useState(false)
    const sugeridos = sugerenciasEfectivo(payment.cashDue)
    const recibido = payment.cashReceived
    const esSugerido = recibido !== null && sugeridos.includes(recibido)
    const otro = otroAbierto || (recibido !== null && !esSugerido)
    const falta = recibido !== null && recibido < payment.cashDue ? payment.cashDue - recibido : 0
    const mixto = payment.paymentSplits.filter(s => s.amount > 0).length > 1

    return (
        <Seccion titulo="¿Con cuánto te pagó?" extra={mixto && <span style={{ fontSize: 13, color: 'var(--toul-text-subtle)' }}>Efectivo: {formatCOP(payment.cashDue)}</span>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button type="button" data-on={recibido === null && !otro ? '1' : '0'} className="cj-btn cj-chip cj-press"
                    onClick={() => { setOtroAbierto(false); payment.setCashReceived(null) }}>Exacto</button>
                {sugeridos.map(s => (
                    <button key={s} type="button" data-on={recibido === s && !otroAbierto ? '1' : '0'} className="cj-btn cj-chip cj-press cj-num"
                        onClick={() => { setOtroAbierto(false); payment.setCashReceived(s) }}>{formatCOP(s)}</button>
                ))}
                <button type="button" data-on={otro ? '1' : '0'} className="cj-btn cj-chip cj-press"
                    onClick={() => { setOtroAbierto(true); if (esSugerido) payment.setCashReceived(null) }}>Otro</button>
            </div>
            {otro && (
                <div style={{ marginTop: 10 }}>
                    <CampoPesos etiqueta="Efectivo recibido" valor={recibido} autoFocus={otroAbierto} invalido={falta > 0}
                        onChange={v => payment.setCashReceived(v)} />
                </div>
            )}
            {falta > 0 ? (
                <p role="alert" style={{ fontSize: 13.5, color: 'var(--toul-error)', margin: '10px 2px 0' }}>No alcanza: faltan {formatCOP(falta)}</p>
            ) : payment.change > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 14 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)' }}>Vuelto</span>
                    <Cuenta valor={payment.change} style={{ fontSize: 22, fontWeight: 700, color: 'var(--toul-text)' }} />
                </div>
            )}
        </Seccion>
    )
}

/* ── Lo que dice la aprobación del administrador ─────────────────── */
function Aprobacion({ cobro }: { cobro: CobroState }) {
    const { permisos } = useCaja()
    const { necesita, aprobacion } = cobro
    if (!necesita && !aprobacion.message) return null

    const queSePide = necesita === 'fiado' ? 'Fiar' : `Un descuento de más del ${permisos.descuento_max}%`
    const tono = aprobacion.status === 'approved' ? 'var(--toul-accent)'
        : aprobacion.status === 'rejected' ? 'var(--toul-error)'
        : aprobacion.status === 'pending' ? 'var(--toul-info)'
        : 'var(--toul-warning)'
    const texto = aprobacion.status === 'pending' ? 'Esperando que el administrador apruebe…'
        : aprobacion.message ?? `${queSePide} necesita aprobación del administrador`

    return (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22 }}>
            {aprobacion.status === 'pending'
                ? <span aria-hidden style={{ width: 15, height: 15, border: `2px solid ${tono}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                : aprobacion.status === 'approved'
                    ? <Check size={17} style={{ color: tono, flexShrink: 0 }} />
                    : <ShieldCheck size={17} style={{ color: tono, flexShrink: 0 }} />}
            <span style={{ fontSize: 14, fontWeight: 550, color: tono }}>{texto}</span>
        </div>
    )
}

/* ── Pie fijo: total que cuenta y el botón ───────────────────────── */
function Pie({ cobro, narrow }: { cobro: CobroState; narrow: boolean }) {
    const { cart, payment } = usePOSFlow()
    const { boton } = cobro
    const vacio = cart.isEmpty
    const activo = !boton.deshabilitado && !vacio
    const aprobada = !vacio && !!cobro.necesita && cobro.aprobacion.status === 'approved'

    return (
        <div style={{
            flexShrink: 0, padding: `14px ${narrow ? 20 : 24}px calc(${narrow ? 14 : 18}px + env(safe-area-inset-bottom, 0px))`,
            borderTop: '1px solid var(--toul-divider)', background: 'var(--toul-bg)',
        }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <span className="cj-num" style={{ fontSize: 15, color: 'var(--toul-text-muted)', minWidth: 0 }}>
                    {payment.discountAmount > 0 ? `Total · desc. −${formatCOP(payment.discountAmount)}` : 'Total'}
                </span>
                <Cuenta valor={payment.total} style={{ fontSize: 30, fontWeight: 750, color: 'var(--toul-text)', letterSpacing: '-0.035em' }} />
            </div>
            <button type="button" onClick={cobro.accionar} disabled={!activo} className="cj-btn cj-press-suave"
                style={{
                    width: '100%', height: 58, borderRadius: 17, fontSize: 16.5, fontWeight: 650,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    background: !activo ? 'var(--toul-pos-btn-disabled-bg)' : boton.espera ? 'var(--toul-surface-2)' : 'var(--toul-accent)',
                    color: !activo ? 'var(--toul-text-dim)' : boton.espera ? 'var(--toul-text)' : 'var(--toul-bg)',
                    transition: 'background-color 200ms ease, color 200ms ease, transform 140ms var(--toul-ease-emil)',
                }}>
                {boton.espera && <span aria-hidden style={{ width: 16, height: 16, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
                {boton.texto}
            </button>
            {!vacio && boton.razon ? (
                <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: '9px 0 0', textAlign: 'center' }}>{boton.razon}</p>
            ) : aprobada ? (
                <p style={{ fontSize: 13, fontWeight: 550, color: 'var(--toul-accent)', margin: '9px 0 0', textAlign: 'center' }}>Aprobada por el administrador</p>
            ) : !narrow && !boton.razon ? (
                <p style={{ fontSize: 12, color: 'var(--toul-text-faint)', margin: '9px 0 0', textAlign: 'center' }}>Enter para cobrar · / para buscar</p>
            ) : null}
        </div>
    )
}
