'use client'

import type { ReactNode } from 'react'
import s from './pos.module.css'
import { cx, useRebote } from './movimiento'
import { IcoDerecha } from './Iconos'

export type TonoValor = 'normal' | 'apagado' | 'pide' | 'verde' | 'ambar'

/**
 * Fila de 60 px del cobro: ícono, título, valor a la derecha y chevron.
 * El valor entra deslizándose cada vez que cambia `clave` (por defecto,
 * el texto del valor).
 */
export function Fila({ icono, titulo, valor, tono = 'normal', clave, onClick, chevron = true, deshabilitada }: {
    icono: ReactNode
    titulo: ReactNode
    valor?: ReactNode
    tono?: TonoValor
    /** Qué cuenta como "cambió" para animar el valor */
    clave?: string | number
    onClick?: () => void
    chevron?: boolean
    deshabilitada?: boolean
}) {
    const rebote = useRebote(clave ?? (typeof valor === 'string' || typeof valor === 'number' ? valor : null))
    return (
        <button type="button" className={s.fila} onClick={onClick} disabled={deshabilitada}>
            <span className={s.filaIcono}>{icono}</span>
            <span className={s.filaTitulo}>{titulo}</span>
            {valor != null && (
                <span className={cx(s.filaValor, tono !== 'apagado' && tono !== 'pide' && rebote === 0 && s.entraA, tono !== 'apagado' && tono !== 'pide' && rebote === 1 && s.entraB)}
                    data-tono={tono === 'normal' ? undefined : tono}>
                    {valor}
                </span>
            )}
            {chevron && <IcoDerecha className={s.filaChevron} />}
        </button>
    )
}

/** Varias filas seguidas, separadas por una línea fina */
export function GrupoFilas({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
    return <div className={cx(s.grupo, className)} style={style}>{children}</div>
}
