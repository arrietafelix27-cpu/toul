'use client'

import type { InputHTMLAttributes } from 'react'
import s from './pos.module.css'
import { cx } from './movimiento'
import { IcoCerrar, IcoLupa } from './Iconos'

type Entrada = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { ref?: React.Ref<HTMLInputElement> }

/** Buscar producto / Buscar cliente: lupa, texto y una X que aparece al escribir */
export function CampoBusqueda({ valor, onCambiar, etiqueta, alto = 52, className, style, ...rest }: Entrada & {
    valor: string
    onCambiar: (v: string) => void
    etiqueta: string
    alto?: number
}) {
    return (
        <label className={cx(s.campo, className)} style={{ height: alto, ...style }}>
            <IcoLupa className={s.campoLupa} />
            <input type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" spellCheck={false}
                aria-label={etiqueta} placeholder={etiqueta} value={valor}
                onChange={e => onCambiar(e.target.value)} {...rest} />
            {valor && (
                <button type="button" className={s.borrar} aria-label="Borrar búsqueda" onClick={() => onCambiar('')}>
                    <IcoCerrar size={12} grosor={3} />
                </button>
            )}
        </label>
    )
}

/** Campo con su etiqueta a la izquierda ("Nombre", "WhatsApp") */
export function CampoTexto({ etiqueta, valor, onCambiar, className, ...rest }: Entrada & {
    etiqueta: string
    valor: string
    onCambiar: (v: string) => void
}) {
    return (
        <label className={cx(s.campo, className)}>
            <span className={s.campoEtiqueta}>{etiqueta}</span>
            <input aria-label={etiqueta} value={valor} onChange={e => onCambiar(e.target.value)} {...rest} />
        </label>
    )
}
