'use client'

import { BotonPrincipal, Chip, Chips, EtiquetaHoja, Hoja, MontoCampo, MontoGrande, useRebote } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import type { PaymentMethodConfig } from '@/lib/types'
import type { POSPaymentState } from '@/lib/pos/usePOSPayment'
import { sugerenciasEfectivo } from '@/lib/pos/pagos'
import { nombreMetodo } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'

/**
 * Recibido · Cambio / Falta (SPEC §5): lo que entregó en efectivo.
 * Vacío es "Exacto". Si no alcanza, dice cuánto falta en ámbar y el
 * botón de confirmar no deja seguir. Lo usan el pago de contado y el
 * abono de una venta a crédito.
 */
export function BloqueRecibido({ payment }: { payment: POSPaymentState }) {
    const { cashDue, cashReceived, change, setCashReceived } = payment
    const sugeridos = sugerenciasEfectivo(cashDue)
    const falta = cashReceived !== null && cashReceived < cashDue ? Math.round(cashDue - cashReceived) : 0
    const mixto = payment.paymentSplits.filter(p => p.amount > 0).length > 1
    const valor = falta > 0 ? falta : Math.round(change)
    const rebote = useRebote(`${falta > 0 ? 'f' : 'c'}${valor}`)

    return (
        <div className={s.recibido}>
            <div className={s.recibidoArriba}>
                <span>{mixto ? 'Recibido en efectivo' : 'Recibido'}</span>
                <MontoCampo etiqueta="Monto recibido" valor={cashReceived} sugerido={cashDue} onCambiar={setCashReceived} />
            </div>
            <Chips>
                <Chip activo={cashReceived === null} onClick={() => setCashReceived(null)}>Exacto</Chip>
                {sugeridos.map(v => (
                    <Chip key={v} activo={cashReceived === v} onClick={() => setCashReceived(v)}>{formatCOP(v)}</Chip>
                ))}
            </Chips>
            <div className={s.recibidoAbajo}>
                <span>{falta > 0 ? 'Falta' : 'Cambio'}</span>
                <span className={s.recibidoMonto} data-tono={falta > 0 ? 'ambar' : valor > 0 ? 'verde' : undefined}
                    data-rebote={rebote ?? undefined} aria-live="polite">
                    {formatCOP(valor)}
                </span>
            </div>
        </div>
    )
}

/**
 * Abono inicial de una venta a crédito (SPEC §6): nunca más que el total.
 * Con abono se elige con qué lo pagó; si fue en efectivo, el mismo
 * bloque de Recibido y Cambio del contado.
 */
export function HojaAbono({ abierta, onCerrar, payment, methods, cargandoMetodos }: {
    abierta: boolean
    onCerrar: () => void
    payment: POSPaymentState
    methods: PaymentMethodConfig[]
    cargandoMetodos: boolean
}) {
    const { total, abonoMode, setAbonoMode, setInitialPayment } = payment
    const abono = abonoMode === 'sin' ? 0 : Math.round(payment.paymentTarget)
    const elegido = payment.selectedMethodIds[0] ?? null

    const escribir = (v: number | null) => {
        if (!v) { setAbonoMode('sin'); setInitialPayment(''); return }
        setAbonoMode('otro')
        setInitialPayment(String(Math.min(Math.round(v), total)))
    }

    return (
        <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Abono inicial"
            pie={<BotonPrincipal ancho onClick={onCerrar} style={{ marginTop: 18 }}>Listo</BotonPrincipal>}>
            <MontoGrande etiqueta="Valor del abono" valor={abonoMode === 'sin' ? null : abono} onCambiar={escribir} />
            <div className={s.hojaPista}>
                {abono > 0 ? `Saldo pendiente ${formatCOP(total - abono)}` : `Total de la venta ${formatCOP(total)}`}
            </div>
            <Chips centrado style={{ marginTop: 14 }}>
                <Chip activo={abonoMode === 'sin'} onClick={() => { setAbonoMode('sin'); setInitialPayment('') }}>Sin abono</Chip>
                <Chip activo={abonoMode === 'mitad'} onClick={() => setAbonoMode('mitad')}>La mitad</Chip>
            </Chips>

            {abono > 0 && (
                <div className={s.cambia}>
                    <EtiquetaHoja>Método del abono</EtiquetaHoja>
                    {methods.length === 0 ? (
                        <div className={s.hojaPista} style={{ textAlign: 'left' }}>
                            {cargandoMetodos ? 'Cargando métodos de pago…' : 'No hay métodos de pago. El administrador los agrega en Ajustes.'}
                        </div>
                    ) : (
                        <Chips>
                            {methods.map(m => (
                                <Chip key={m.id} activo={elegido === m.id} onClick={() => payment.chooseMethod(m)}>{nombreMetodo(m.name)}</Chip>
                            ))}
                        </Chips>
                    )}
                    {payment.cashDue > 0 && <div style={{ marginTop: 16 }}><BloqueRecibido payment={payment} /></div>}
                </div>
            )}
        </Hoja>
    )
}
