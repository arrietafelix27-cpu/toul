'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import s from './pos.module.css'
import { cx } from './movimiento'
import { IcoCerrar, IcoFlecha, IcoIzquierda } from './Iconos'

type Base = ButtonHTMLAttributes<HTMLButtonElement> & { ref?: React.Ref<HTMLButtonElement> }

/** Verde, la acción principal ("Cobrar →", "Listo", "Nueva venta") */
export function BotonPrincipal({ ancho, flecha, className, children, type = 'button', ...rest }: Base & {
    /** Ocupa todo el ancho (pie de las hojas) */
    ancho?: boolean
    /** Con la flecha que se corre al tocar */
    flecha?: boolean
}) {
    return (
        <button type={type} className={cx(s.principal, ancho && s.ancho, className)} {...rest}>
            {children}
            {flecha && <IcoFlecha />}
        </button>
    )
}

/** Gris, al lado del principal ("Enviar comprobante", "Salir") */
export function BotonSecundario({ className, type = 'button', ...rest }: Base) {
    return <button type={type} className={cx(s.secundario, className)} {...rest} />
}

/** Chico y discreto ("Vaciar", "Quitar") */
export function BotonFantasma({ className, type = 'button', ...rest }: Base) {
    return <button type={type} className={cx(s.fantasma, className)} {...rest} />
}

/** Cuadrado de 50 px (Filtrar, Ordenar). Verde con punto cuando hay algo elegido */
export function BotonIcono({ activo, punto, className, children, type = 'button', ...rest }: Base & {
    activo?: boolean
    punto?: boolean
    children: ReactNode
}) {
    return (
        <button type={type} className={cx(s.icono, className)} data-on={activo ? '1' : undefined} {...rest}>
            {children}
            {punto && <span className={s.punto} />}
        </button>
    )
}

/** Redondo de 42 px: volver */
export function BotonVolver({ className, type = 'button', 'aria-label': etiqueta = 'Volver', ...rest }: Base) {
    return (
        <button type={type} className={cx(s.redondo, className)} aria-label={etiqueta} {...rest}>
            <IcoIzquierda />
        </button>
    )
}

/** Redondo de 34 px: la X de las hojas y de la caja */
export function BotonCerrar({ className, type = 'button', 'aria-label': etiqueta = 'Cerrar', grande, ...rest }: Base & {
    /** 42 px, como la X de la caja */
    grande?: boolean
}) {
    return (
        <button type={type} className={cx(grande ? s.redondo : s.cerrar, className)} aria-label={etiqueta} {...rest}>
            <IcoCerrar size={grande ? 16 : 14} />
        </button>
    )
}
