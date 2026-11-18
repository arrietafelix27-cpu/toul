'use client'

import type { ReactNode } from 'react'
import s from './pos.module.css'

/** Aviso en ámbar dentro de la pantalla, con una acción opcional ("Usar este") */
export function Nota({ children, accion }: {
    children: ReactNode
    accion?: { texto: string; onClick: () => void }
}) {
    return (
        <div className={s.nota} role="status">
            <span className={s.notaTexto}>{children}</span>
            {accion && <button type="button" className={s.notaBoton} onClick={accion.onClick}>{accion.texto}</button>}
        </div>
    )
}

/** "Guardada en el teléfono…": la venta hecha sin internet */
export function NotaGuardada({ children }: { children: ReactNode }) {
    return <div className={s.notaGuardada} role="status"><i aria-hidden="true" />{children}</div>
}

/** La píldora "Sin conexión" de la cabecera */
export function PildoraSinConexion() {
    return <span className={s.sinConexion} role="status"><i aria-hidden="true" />Sin conexión</span>
}
