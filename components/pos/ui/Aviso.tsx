'use client'

import { useSyncExternalStore } from 'react'
import s from './pos.module.css'
import { cx, DURACION } from './movimiento'
import { IcoCheck } from './Iconos'

/* ══════════════════════════════════════════════════════════════
   El aviso de la caja: una píldora abajo que se va sola.
   avisar('Cliente creado') desde cualquier parte; <Avisos /> una
   sola vez en la caja. Un aviso nuevo reemplaza al anterior.
   ══════════════════════════════════════════════════════════════ */

type Estado = { id: number; texto: string } | null

let actual: Estado = null
let siguiente = 0
let reloj: ReturnType<typeof setTimeout> | undefined
const oyentes = new Set<() => void>()
const emitir = () => oyentes.forEach(f => f())

export function avisar(texto: string) {
    actual = { id: ++siguiente, texto }
    emitir()
    clearTimeout(reloj)
    reloj = setTimeout(() => { actual = null; emitir() }, DURACION.aviso)
}

function suscribir(f: () => void) {
    oyentes.add(f)
    return () => { oyentes.delete(f) }
}

export function Avisos() {
    const aviso = useSyncExternalStore(suscribir, () => actual, () => null)
    if (!aviso) return null
    // La clave nueva vuelve a correr la animación aunque el texto se repita
    return (
        <div key={aviso.id} className={cx(s.pos, s.aviso)} role="status" aria-live="polite">
            <IcoCheck size={14} grosor={2.8} />
            {aviso.texto}
        </div>
    )
}
