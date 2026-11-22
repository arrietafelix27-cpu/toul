'use client'

import { memo, useCallback, useState } from 'react'
import { usePOSFlow } from '@/components/pos/POSFlowProvider'
import { useCaja } from '@/components/isla/CajaContext'
import { SIN_INTERNET_CREDITO, type CobroState } from '@/lib/pos/useCobro'
import type { POSCartState } from '@/lib/pos/usePOSCart'
import type { POSDataState } from '@/lib/pos/usePOSData'
import type { POSPaymentState } from '@/lib/pos/usePOSPayment'
import { descuentoPermitido } from '@/lib/pos/permisos'
import { nombreMetodo } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import {
    BotonConfirmar, BotonFantasma, BotonPrincipal, BotonVolver, Chip, Chips, Desplegable, Fila, GrupoFilas, MontoCampo, Nota,
    PasoMini, Segmentado, avisar, cx, useRebote,
    IcoAbajo, IcoCalendario, IcoBillete, IcoCheck, IcoCliente, IcoDescuento, IcoDividir, type EstadoConfirmar,
} from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import type { Cambiar } from './Productos'
import { claveDe } from './PanelVenta'
import { HojaCliente } from './Cliente'
import { HojaFecha, fechaCorta } from './HojaFecha'
import { HojaAbono, BloqueRecibido } from './HojaAbono'
import { HojaDescuento } from './HojaDescuento'

type QueHoja = 'cliente' | 'fecha' | 'abono' | 'descuento'

const unidades = (n: number) => `${n} ${n === 1 ? 'producto' : 'productos'}`

/**
 * El pago (diseno/pos/SPEC.md §5).
 * Celular: pantalla completa que entra desde la derecha, con su flecha.
 * PC: dentro del panel "Venta" (la flecha la pone el panel).
 *
 * Al confirmar, el botón se encoge a un círculo con tres puntos y estalla;
 * mientras tanto el pago se queda quieto mostrando la venta que se
 * registró (la caja ya vació el carrito por debajo). Al terminar el
 * estallido avisa con onRegistrada y entra "Venta registrada".
 * Registrar, el tiempo de espera y la cola sin internet siguen en useCobro.
 */
export function Cobro({ cobro, narrow, onCambiar, onVolver, onRegistrada }: {
    cobro: CobroState
    narrow: boolean
    onCambiar: Cambiar
    /** Celular: vuelve a los productos */
    onVolver?: () => void
    onRegistrada: () => void
}) {
    const { data, cart, payment } = usePOSFlow()
    const { ctx, permisos, offline } = useCaja()
    const esAdmin = ctx.role === 'admin'
    const online = offline.online
    const [hoja, setHoja] = useState<QueHoja | null>(null)
    const cerrarHoja = useCallback(() => setHoja(null), [])

    const { boton, venta, enviando, aprobacion, necesita } = cobro
    const limite = descuentoPermitido(cart.subtotal, permisos.descuento_max)
    const pideAprobacion = !esAdmin && payment.discountAmount > limite
        ? `Más del ${permisos.descuento_max}% necesita aprobación del administrador` : null

    // ── El botón ─────────────────────────────────────────────────
    const aprobando = !venta && !enviando && boton.accion !== 'cobrar'
    const estado: EstadoConfirmar = venta ? 'hecho' : enviando ? 'enviando' : boton.deshabilitado ? 'bloqueado' : 'listo'

    const mensaje = venta ? null
        : cobro.error ? { tono: 'error', texto: `${cobro.error} Tu venta sigue aquí.` }
        : necesita && aprobacion.status === 'pending' ? { tono: undefined, texto: 'Esperando que el administrador apruebe…' }
        : necesita && aprobacion.status === 'approved' ? { tono: 'verde', texto: 'Aprobada por el administrador' }
        : aprobacion.message ? { tono: aprobacion.status === 'rejected' ? 'error' : 'ambar', texto: aprobacion.message }
        : necesita ? { tono: 'ambar', texto: necesita === 'fiado' ? 'Vender a crédito necesita aprobación del administrador' : pideAprobacion ?? 'El descuento necesita aprobación del administrador' }
        : null

    return (
        <div className={cx(s.pago, !narrow && s.pagoPc)}>
            {narrow && (
                <div className={s.pagoCabeza}>
                    <BotonVolver onClick={onVolver} aria-label="Volver a los productos" disabled={enviando || !!venta} />
                    {!online && <span className={s.sinConexion} role="status"><i aria-hidden="true" />Sin conexión</span>}
                </div>
            )}

            <Cuerpo congelado={!!venta} narrow={narrow} cart={cart} payment={payment} data={data}
                online={online} sinFiar={!esAdmin && permisos.fiar === 'no'} onCambiar={onCambiar} onAbrir={setHoja} />

            <div className={s.pagoPie}>
                {aprobando ? (
                    <BotonPrincipal ancho onClick={cobro.accionar} disabled={boton.deshabilitado} style={{ height: 58, borderRadius: 20 }}>
                        {boton.deshabilitado && boton.razon ? boton.razon : boton.texto}
                    </BotonPrincipal>
                ) : (
                    <BotonConfirmar estado={estado} texto={boton.texto} razon={boton.razon ?? undefined}
                        onConfirmar={cobro.accionar} onTerminado={onRegistrada} />
                )}
                {mensaje && (
                    <div key={mensaje.texto} className={s.pagoMensaje} data-tono={mensaje.tono} role={mensaje.tono === 'error' ? 'alert' : 'status'}>
                        {mensaje.texto}
                    </div>
                )}
            </div>

            <HojaCliente abierta={hoja === 'cliente'} onCerrar={cerrarHoja} data={data} payment={payment}
                puedeCrear={esAdmin || permisos.crear_clientes === 'solo'} />
            <HojaFecha abierta={hoja === 'fecha'} onCerrar={cerrarHoja} fecha={payment.dueDate} onCambiar={payment.setDueDate} />
            <HojaAbono abierta={hoja === 'abono'} onCerrar={cerrarHoja} payment={payment}
                methods={data.methods} cargandoMetodos={data.methodsLoading} />
            <HojaDescuento abierta={hoja === 'descuento'} onCerrar={cerrarHoja} payment={payment}
                subtotal={cart.subtotal} pideAprobacion={pideAprobacion} />
        </div>
    )
}

type PropsCuerpo = {
    /** Venta registrada: se queda como estaba mientras estalla el botón */
    congelado: boolean
    narrow: boolean
    cart: POSCartState
    payment: POSPaymentState
    data: POSDataState
    online: boolean
    sinFiar: boolean
    onCambiar: Cambiar
    onAbrir: (h: QueHoja) => void
}

/**
 * Todo lo de arriba del botón. Lee solo lo que le llega por props: así,
 * congelado, no se vuelve a pintar con el carrito ya vacío.
 */
const Cuerpo = memo(function Cuerpo({ narrow, cart, payment, data, online, sinFiar, onCambiar, onAbrir }: PropsCuerpo) {
    const [detalle, setDetalle] = useState(false)
    const esCredito = payment.saleType === 'credito'
    const rebote = useRebote(payment.total)

    // Al cambiar de tipo no queda método ni recibido de antes (usePOSPayment)
    const elegirTipo = (t: 'contado' | 'credito') => payment.setSaleType(t)

    return (
        <div className={s.pagoScroll}>
            <div className={s.pagoArriba}>
                <div className={s.pagoEtiqueta}>Total</div>
                <span className={s.pagoTotal} data-rebote={rebote ?? undefined}>{formatCOP(payment.total)}</span>
                <div>
                    <button type="button" className={s.detallePildora} aria-expanded={detalle} aria-controls="detalle-cobro"
                        onClick={() => setDetalle(d => !d)}>
                        {unidades(cart.totalUnits)}<IcoAbajo />
                    </button>
                </div>
                {payment.discountAmount > 0 && (
                    <div className={s.tachado}>
                        <s>{formatCOP(cart.subtotal)}</s> <b>−{formatCOP(payment.discountAmount)}</b>
                    </div>
                )}
            </div>

            <Desplegable abierto={detalle} id="detalle-cobro">
                <div style={{ padding: '10px 0 4px' }}>
                    {cart.cartItems.map(it => {
                        const key = claveDe(it)
                        const precio = it.unitPrice ?? it.product.sale_price
                        const nombre = it.variantName ? `${it.product.name} · ${it.variantName}` : it.product.name
                        return (
                            <div key={key} className={s.detalleLinea}>
                                <span className={s.detalleNombre}>{nombre}</span>
                                <PasoMini cantidad={it.quantity} nombre={nombre} onCambiar={n => onCambiar(key, n, nombre)} />
                                <span className={s.detalleValor}>{formatCOP(precio * it.quantity)}</span>
                            </div>
                        )
                    })}
                </div>
            </Desplegable>

            <Segmentado etiqueta="Tipo de venta" style={{ marginTop: 22 }}
                valor={payment.saleType} onCambiar={elegirTipo}
                onBloqueada={() => avisar(!online ? SIN_INTERNET_CREDITO : 'No tienes permiso para vender a crédito', 'aviso')}
                opciones={[
                    { valor: 'contado', texto: 'Contado' },
                    // Si ya estaba en crédito y se fue la señal, se puede volver a contado pero no al revés
                    { valor: 'credito', texto: 'A crédito', bloqueada: !esCredito && (!online || sinFiar) },
                ]} />

            <div key={payment.saleType} className={s.cambia}>
                {esCredito
                    ? <Credito payment={payment} onAbrir={onAbrir} />
                    : <Contado payment={payment} data={data} onAbrir={onAbrir} />}
            </div>

            {!narrow && <div style={{ height: 8 }} />}
        </div>
    )
}, (_antes, ahora) => ahora.congelado)

/* ── Contado: método, recibido y las filas ───────────────────────── */
function Contado({ payment, data, onAbrir }: { payment: POSPaymentState; data: POSDataState; onAbrir: (h: QueHoja) => void }) {
    const [abrirDividir, setAbrirDividir] = useState(false)
    const methods = data.methods
    const primero = payment.selectedMethodIds[0] ?? null
    const segundo = payment.selectedMethodIds[1] ?? null
    const dividiendo = abrirDividir || !!segundo
    const resto = payment.paymentSplits[0]?.amount ?? 0
    const metodoDe = (id: string | null) => methods.find(m => m.id === id)

    return (<>
        {methods.length === 0 ? (
            // Mientras llegan, nunca "no hay métodos": eso sería falso
            <div className={s.metodosNota}>
                {data.methodsLoading ? 'Cargando métodos de pago…' : 'No hay métodos de pago. El administrador los agrega en Ajustes.'}
            </div>
        ) : (
            <div className={s.metodos} role="radiogroup" aria-label="Método de pago">
                {methods.map(m => {
                    const on = primero === m.id
                    return (
                        <button key={m.id} type="button" role="radio" aria-checked={on} className={s.metodo}
                            data-on={on ? '1' : undefined} onClick={() => payment.chooseMethod(m)}>
                            <span className={s.metodoPunto} style={m.color ? { background: m.color } : undefined} aria-hidden="true" />
                            <span className={s.metodoNombre}>{nombreMetodo(m.name)}</span>
                            {on && <span className={s.metodoCheck} aria-hidden="true"><IcoCheck /></span>}
                        </button>
                    )
                })}
            </div>
        )}

        {payment.paymentTarget > 0 && payment.cashDue > 0 && <BloqueRecibido payment={payment} />}

        <GrupoFilas>
            <FilaCliente payment={payment} credito={false} onAbrir={onAbrir} />
            {methods.length > 1 && (dividiendo ? (
                <div className={s.dividir}>
                    <div className={s.dividirCabeza}>
                        <span>Dividir pago</span>
                        <BotonFantasma onClick={() => { payment.setSecondMethod(null); setAbrirDividir(false) }}>Quitar</BotonFantasma>
                    </div>
                    <Chips style={{ marginTop: 12 }}>
                        {methods.filter(m => m.id !== primero).map(m => (
                            <Chip key={m.id} activo={segundo === m.id} onClick={() => payment.setSecondMethod(m)}>{nombreMetodo(m.name)}</Chip>
                        ))}
                    </Chips>
                    {segundo && (<>
                        <div className={s.dividirFila}>
                            <span>{nombreMetodo(metodoDe(segundo)?.name ?? '')}</span>
                            <MontoCampo chico etiqueta={`Monto en ${nombreMetodo(metodoDe(segundo)?.name ?? '')}`}
                                valor={payment.typedAmounts[segundo] ?? null}
                                onCambiar={v => payment.setMethodAmount(segundo, v)} />
                        </div>
                        <div className={s.dividirFila}>
                            <span>{nombreMetodo(metodoDe(primero)?.name ?? '')}</span>
                            <span className={s.dividirResto}>{formatCOP(resto)}</span>
                        </div>
                    </>)}
                    {payment.overpaid > 0 && <Nota>El monto supera el total.</Nota>}
                </div>
            ) : (
                <Fila icono={<IcoDividir />} titulo="Dividir pago"
                    onClick={() => primero ? setAbrirDividir(true) : avisar('Selecciona el método de pago', 'aviso')} />
            ))}
            <FilaDescuento payment={payment} onAbrir={onAbrir} />
        </GrupoFilas>
    </>)
}

/* ── A crédito: cliente, fecha, abono y lo que queda debiendo ────── */
function Credito({ payment, onAbrir }: { payment: POSPaymentState; onAbrir: (h: QueHoja) => void }) {
    const abono = payment.abonoMode === 'sin' ? 0 : Math.round(payment.paymentTarget)
    const anterior = Math.max(0, Math.round(Number(payment.selectedCustomer?.total_debt) || 0))
    const nueva = Math.max(0, Math.round(payment.total - abono))
    const pendiente = anterior + nueva
    const rebote = useRebote(pendiente)

    return (<>
        <GrupoFilas style={{ marginTop: 16 }}>
            <FilaCliente payment={payment} credito onAbrir={onAbrir} />
            <Fila icono={<IcoCalendario />} titulo="Fecha de pago" onClick={() => onAbrir('fecha')}
                valor={payment.dueDateValid ? fechaCorta(payment.dueDate) : 'Seleccionar'}
                tono={!payment.dueDateValid ? 'pide' : payment.dueDate ? 'normal' : 'apagado'} />
            <Fila icono={<IcoBillete />} titulo="Abono" onClick={() => onAbrir('abono')}
                valor={abono > 0 ? formatCOP(abono) : 'Sin abono'} tono={abono > 0 ? 'verde' : 'apagado'} />
            <FilaDescuento payment={payment} onAbrir={onAbrir} />
        </GrupoFilas>
        <div className={s.saldo}>
            {anterior > 0 && <div className={s.saldoLinea}><span>Saldo anterior</span><span>{formatCOP(anterior)}</span></div>}
            <div className={s.saldoPrincipal}>
                <span>Saldo pendiente</span>
                <span className={s.saldoMonto} data-rebote={rebote ?? undefined}>{formatCOP(pendiente)}</span>
            </div>
        </div>
    </>)
}

function FilaCliente({ payment, credito, onAbrir }: { payment: POSPaymentState; credito: boolean; onAbrir: (h: QueHoja) => void }) {
    const c = payment.selectedCustomer
    return (
        <Fila icono={<IcoCliente />} titulo="Cliente" onClick={() => onAbrir('cliente')}
            valor={c ? c.name : credito ? 'Seleccionar' : 'Opcional'}
            tono={c ? 'normal' : credito ? 'pide' : 'apagado'} />
    )
}

function FilaDescuento({ payment, onAbrir }: { payment: POSPaymentState; onAbrir: (h: QueHoja) => void }) {
    const d = payment.discountAmount
    return (
        <Fila icono={<IcoDescuento />} titulo="Descuento" onClick={() => onAbrir('descuento')}
            valor={d > 0 ? `−${formatCOP(d)}` : 'Agregar'} tono={d > 0 ? 'verde' : 'apagado'} />
    )
}
