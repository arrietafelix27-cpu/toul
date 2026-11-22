'use client'

import { BotonPrincipal, BotonSecundario, Chip, Chips, Hoja, MontoGrande, Nota, SegmentadoMini, useRebote } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import type { POSPaymentState } from '@/lib/pos/usePOSPayment'
import { formatCOP } from '@/lib/utils'

const RAPIDOS = { '%': [5, 10, 15, 20], '$': [5_000, 10_000, 20_000] } as const

/**
 * Descuento (SPEC §6): en pesos o en porcentaje, nunca más que la venta.
 * Se ve al instante en "Nuevo total". Las reglas de aprobación siguen
 * iguales: un vendedor que pasa su máximo pide aprobación al cobrar.
 */
export function HojaDescuento({ abierta, onCerrar, payment, subtotal, pideAprobacion }: {
    abierta: boolean
    onCerrar: () => void
    payment: POSPaymentState
    subtotal: number
    /** El texto de aprobación cuando un vendedor pasa su máximo */
    pideAprobacion: string | null
}) {
    const { discountType, discountValue, setDiscountType, setDiscountValue } = payment
    const valor = discountValue ? Number(discountValue) : null
    const rebote = useRebote(payment.total)

    const escribir = (v: number | null) => {
        if (v === null) { setDiscountValue(''); return }
        setDiscountValue(String(discountType === '%' ? Math.min(100, v) : Math.min(v, Math.round(subtotal))))
    }

    return (
        <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Descuento"
            pie={
                <div className={s.hojaPar}>
                    <BotonSecundario onClick={() => { setDiscountValue(''); onCerrar() }}>Quitar</BotonSecundario>
                    <BotonPrincipal onClick={onCerrar}>Aplicar</BotonPrincipal>
                </div>
            }>
            <div className={s.hojaSuiche}>
                <SegmentadoMini etiqueta="Tipo de descuento" valor={discountType}
                    onCambiar={t => { setDiscountType(t); setDiscountValue('') }}
                    opciones={[{ valor: '$', texto: '$' }, { valor: '%', texto: '%' }]} />
            </div>
            <MontoGrande etiqueta="Valor del descuento" unidad={discountType} valor={valor} onCambiar={escribir} />
            <Chips centrado>
                {RAPIDOS[discountType].map(n => (
                    <Chip key={n} activo={valor === n} disabled={discountType === '$' && n > subtotal}
                        onClick={() => setDiscountValue(String(n))}>
                        {discountType === '%' ? `${n}%` : formatCOP(n)}
                    </Chip>
                ))}
            </Chips>
            <div className={`${s.saldo} ${s.saldoNeutro}`} style={{ marginTop: 18 }}>
                <div className={s.saldoLinea}><span>Subtotal</span><span>{formatCOP(subtotal)}</span></div>
                <div className={s.saldoPrincipal}>
                    <span>Nuevo total</span>
                    <span className={s.saldoMonto} data-rebote={rebote ?? undefined}>{formatCOP(payment.total)}</span>
                </div>
            </div>
            {pideAprobacion && <Nota>{pideAprobacion}</Nota>}
        </Hoja>
    )
}
