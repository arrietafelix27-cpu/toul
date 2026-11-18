'use client'

import type { ReactNode } from 'react'
import s from './pos.module.css'
import { cx } from './movimiento'
import { IcoCandado } from './Iconos'

export type OpcionSegmento<T extends string> = {
    valor: T
    texto: ReactNode
    /** Se ve con candado; tocarla llama a onBloqueada en vez de elegirla */
    bloqueada?: boolean
}

/**
 * Contado | A crédito. La píldora blanca se desliza a la opción elegida.
 * Una opción bloqueada (sin conexión) muestra el candado y no se elige.
 */
export function Segmentado<T extends string>({ opciones, valor, onCambiar, onBloqueada, etiqueta, className, style }: {
    opciones: OpcionSegmento<T>[]
    valor: T
    onCambiar: (v: T) => void
    onBloqueada?: (v: T) => void
    etiqueta?: string
    className?: string
    style?: React.CSSProperties
}) {
    const i = Math.max(0, opciones.findIndex(o => o.valor === valor))
    return (
        <div className={cx(s.seg, className)} role="radiogroup" aria-label={etiqueta}
            style={{ ...style, ['--n' as string]: opciones.length, ['--i' as string]: i }}>
            <span className={s.segPildora} aria-hidden="true" />
            {opciones.map(o => {
                const on = o.valor === valor
                return (
                    <button key={o.valor} type="button" role="radio" aria-checked={on}
                        className={s.segBoton} data-on={on ? '1' : undefined} data-bloq={o.bloqueada ? '1' : undefined}
                        onClick={() => (o.bloqueada ? onBloqueada?.(o.valor) : !on && onCambiar(o.valor))}>
                        {o.texto}
                        {o.bloqueada && <IcoCandado />}
                    </button>
                )
            })}
        </div>
    )
}

/** El interruptor chico de la hoja de descuento: $ | % */
export function SegmentadoMini<T extends string>({ opciones, valor, onCambiar, etiqueta }: {
    opciones: { valor: T; texto: ReactNode }[]
    valor: T
    onCambiar: (v: T) => void
    etiqueta?: string
}) {
    const i = Math.max(0, opciones.findIndex(o => o.valor === valor))
    return (
        <div className={s.mini2} role="radiogroup" aria-label={etiqueta} style={{ ['--i' as string]: i }}>
            <span className={s.mini2Pildora} aria-hidden="true" />
            {opciones.map(o => {
                const on = o.valor === valor
                return (
                    <button key={o.valor} type="button" role="radio" aria-checked={on}
                        className={s.mini2Boton} data-on={on ? '1' : undefined}
                        onClick={() => !on && onCambiar(o.valor)}>
                        {o.texto}
                    </button>
                )
            })}
        </div>
    )
}
