'use client'

import { useState } from 'react'
import { onlyDigits } from '@/lib/format/text'
import s from './pos.module.css'
import { cx, useRebote } from './movimiento'
import { IcoBasura, IcoMas, IcoMenos } from './Iconos'

/**
 * Cantidad de un producto en la venta.
 * - En 0 es un "+" redondo; al primer toque crece a la píldora [− N +].
 * - El número se puede escribir (ventas al por mayor): se selecciona todo
 *   al tocarlo. Quien lo usa recorta al stock y avisa.
 * - En 1, el "−" es una caneca roja: quita el producto.
 * - El número rebota cada vez que cambia.
 */
export function Paso({ cantidad, onCambiar, nombre, deshabilitado }: {
    cantidad: number
    onCambiar: (n: number) => void
    /** Para leer en voz alta: "Cantidad de Abanico" */
    nombre?: string
    deshabilitado?: boolean
}) {
    const n = Math.max(0, Math.round(cantidad))
    // Solo guarda lo escrito cuando no es un número válido (vacío o 0),
    // para no quitar el producto mientras la persona borra para escribir otro
    const [borrador, setBorrador] = useState<string | null>(null)
    const rebote = useRebote(n)

    if (n === 0) {
        return (
            <button type="button" className={s.agregar} disabled={deshabilitado}
                aria-label={nombre ? `Agregar ${nombre}` : 'Agregar'} onClick={() => onCambiar(1)}>
                <IcoMas size={18} grosor={2.4} />
            </button>
        )
    }

    return (
        <div className={s.paso}>
            <button type="button" className={cx(s.pasoBoton, n === 1 && s.pasoBorrar)} disabled={deshabilitado}
                aria-label={n === 1 ? 'Quitar de la venta' : 'Quitar uno'} onClick={() => onCambiar(n - 1)}>
                {n === 1 ? <IcoBasura key="basura" /> : <IcoMenos key="menos" />}
            </button>
            <input
                className={cx(s.cantidad, rebote === 0 && s.pasoA, rebote === 1 && s.pasoB)}
                aria-label={nombre ? `Cantidad de ${nombre}` : 'Cantidad'}
                inputMode="numeric" enterKeyHint="done" autoComplete="off" maxLength={5}
                disabled={deshabilitado}
                value={borrador ?? String(n)}
                onFocus={e => e.currentTarget.select()}
                onChange={e => {
                    const d = onlyDigits(e.target.value).slice(0, 5)
                    const v = parseInt(d, 10)
                    if (!d || !v) { setBorrador(d); return }
                    setBorrador(null)
                    onCambiar(v)
                }}
                onBlur={() => setBorrador(null)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            />
            <button type="button" className={s.pasoBoton} disabled={deshabilitado}
                aria-label="Agregar uno" onClick={() => onCambiar(n + 1)}>
                <IcoMas />
            </button>
        </div>
    )
}

/** El paso chico del detalle del cobro: [− N +], sin escribir */
export function PasoMini({ cantidad, onCambiar, nombre }: {
    cantidad: number
    onCambiar: (n: number) => void
    nombre?: string
}) {
    const n = Math.max(0, Math.round(cantidad))
    const rebote = useRebote(n)
    return (
        <span className={s.pasoMini} role="group" aria-label={nombre ? `Cantidad de ${nombre}` : 'Cantidad'}>
            <button type="button" className={cx(s.pasoMiniBoton, n <= 1 && s.pasoMiniBorrar)}
                aria-label={n <= 1 ? 'Quitar de la venta' : 'Quitar uno'} onClick={() => onCambiar(n - 1)}>
                {n <= 1 ? <IcoBasura size={14} /> : <IcoMenos size={14} />}
            </button>
            <span className={cx(s.pasoMiniN, rebote === 0 && s.pasoA, rebote === 1 && s.pasoB)} aria-live="polite">{n}</span>
            <button type="button" className={s.pasoMiniBoton} aria-label="Agregar uno" onClick={() => onCambiar(n + 1)}>
                <IcoMas size={14} />
            </button>
        </span>
    )
}
