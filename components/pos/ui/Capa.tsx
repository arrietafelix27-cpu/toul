'use client'

import type { ReactNode } from 'react'
import s from './pos.module.css'
import { cx } from './movimiento'

/**
 * Las capas de la caja, una encima de otra:
 * - base (productos): al cobrar se corre a la izquierda y se oscurece.
 * - lateral (cobro): entra desde la derecha; al registrar se achica y se va.
 * - encima (venta registrada): aparece sobre todo.
 * Lo que no se ve no se puede tocar ni enfocar.
 */
export function Capa({ tipo = 'base', estado, children, etiqueta, className, style }: {
    tipo?: 'base' | 'lateral' | 'encima'
    estado: 'normal' | 'empujada' | 'fuera' | 'dentro' | 'ida'
    children: ReactNode
    etiqueta?: string
    className?: string
    style?: React.CSSProperties
}) {
    const activa = tipo === 'base' ? estado === 'normal' : estado === 'dentro'
    return (
        <section aria-label={etiqueta} aria-hidden={!activa} inert={!activa}
            className={cx(s.capa, tipo === 'lateral' && s.capaLateral, tipo === 'encima' && s.capaEncima, className)}
            data-estado={estado} style={style}>
            {children}
        </section>
    )
}
