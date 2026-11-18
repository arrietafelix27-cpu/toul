'use client'

import { onlyDigits, withThousands } from '@/lib/format/text'
import s from './pos.module.css'
import { cx } from './movimiento'

/** Lo escrito → número (null si está vacío). Nunca decimales. */
function leer(texto: string, maxDigitos: number): number | null {
    const d = onlyDigits(texto).slice(0, maxDigitos)
    return d ? Math.round(Number(d)) : null
}

const mostrar = (v: number | null | undefined) => (v == null ? '' : withThousands(String(Math.max(0, Math.round(v)))))

/**
 * Monto alineado a la derecha con su "$" ("Recibido", segundo método).
 * Vacío muestra el sugerido en gris (por ejemplo el valor exacto).
 */
export function MontoCampo({ valor, onCambiar, sugerido, etiqueta, chico, maxDigitos = 10, autoFocus }: {
    valor: number | null
    onCambiar: (v: number | null) => void
    /** Lo que se ve en gris cuando está vacío */
    sugerido?: number
    etiqueta: string
    chico?: boolean
    maxDigitos?: number
    autoFocus?: boolean
}) {
    return (
        <label className={cx(s.montoCampo, chico && s.montoCampoChico)}>
            <span className={s.montoSigno}>$</span>
            <input aria-label={etiqueta} inputMode="numeric" enterKeyHint="done" autoComplete="off" autoFocus={autoFocus}
                placeholder={sugerido != null ? mostrar(sugerido) : '0'}
                value={mostrar(valor)}
                onFocus={e => e.currentTarget.select()}
                onChange={e => onCambiar(leer(e.target.value, maxDigitos))}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        </label>
    )
}

/**
 * El número grande de las hojas (abono, descuento): centrado y del ancho
 * de lo escrito. Con "$" adelante o "%" atrás.
 */
export function MontoGrande({ valor, onCambiar, unidad = '$', etiqueta, maxDigitos = 10, autoFocus }: {
    valor: number | null
    onCambiar: (v: number | null) => void
    unidad?: '$' | '%'
    etiqueta: string
    maxDigitos?: number
    autoFocus?: boolean
}) {
    const texto = unidad === '%' ? (valor == null ? '' : String(Math.round(valor))) : mostrar(valor)
    // Del ancho de lo escrito (sin animar el ancho: solo transform y opacity se mueven)
    const ancho = `${Math.max(1, (texto || '0').length) + 0.4}ch`
    return (
        <label className={s.montoGrande}>
            {unidad === '$' && <span className={s.montoSigno}>$</span>}
            <input aria-label={etiqueta} inputMode="numeric" enterKeyHint="done" autoComplete="off" autoFocus={autoFocus}
                placeholder="0" value={texto} style={{ width: ancho }}
                onFocus={e => e.currentTarget.select()}
                onChange={e => onCambiar(leer(e.target.value, unidad === '%' ? 3 : maxDigitos))}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            {unidad === '%' && <span className={s.montoSigno}>%</span>}
        </label>
    )
}
