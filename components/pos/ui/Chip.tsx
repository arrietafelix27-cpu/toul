'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import s from './pos.module.css'
import { cx } from './movimiento'

/** Píldora elegible: blanca cuando está elegida ("Exacto", "15 días", "La mitad") */
export function Chip({ activo, className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { activo?: boolean }) {
    return (
        <button type={type} className={cx(s.chip, className)} data-on={activo ? '1' : undefined}
            aria-pressed={activo ?? undefined} {...rest} />
    )
}

/** Fila de chips que salta de línea si no caben */
export function Chips({ centrado, className, style, children }: {
    centrado?: boolean
    className?: string
    style?: React.CSSProperties
    children: ReactNode
}) {
    return <div className={cx(s.chips, centrado && s.chipsCentro, className)} style={style}>{children}</div>
}
