'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import s from './pos.module.css'
import { DURACION, useMontado } from './movimiento'
import { IcoCheck } from './Iconos'

export type OpcionMenu<T extends string> = { valor: T; texto: string }

/**
 * El menú chico de Filtrar y Ordenar. Crece desde la esquina del botón
 * que lo abrió, con un velo detrás. Se cierra eligiendo, tocando afuera
 * o con Escape. Las flechas recorren las opciones.
 */
export function Menu<T extends string>({ abierto, onCerrar, titulo, opciones, elegida, onElegir, alinear = 'derecha', children }: {
    abierto: boolean
    onCerrar: () => void
    titulo: string
    opciones: OpcionMenu<T>[]
    elegida: T
    onElegir: (v: T) => void
    /** De qué lado del botón se abre */
    alinear?: 'derecha' | 'izquierda'
    /** El botón que lo abre */
    children: ReactNode
}) {
    const { montado, visible } = useMontado(abierto, DURACION.menu)
    const caja = useRef<HTMLDivElement>(null)
    const cerrar = useRef(onCerrar)
    useEffect(() => { cerrar.current = onCerrar }, [onCerrar])

    useEffect(() => {
        if (!abierto) return
        // El foco va a la opción elegida, para seguir con el teclado
        const t = setTimeout(() => caja.current?.querySelector<HTMLButtonElement>('[data-on="1"]')?.focus({ preventScroll: true }), 40)
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar.current(); return }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            const botones = Array.from(caja.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
            const i = botones.indexOf(document.activeElement as HTMLButtonElement)
            const j = (i + (e.key === 'ArrowDown' ? 1 : -1) + botones.length) % botones.length
            botones[j]?.focus()
            e.preventDefault()
        }
        // En captura: si el menú está dentro de una hoja, Escape cierra solo el menú
        window.addEventListener('keydown', onKey, true)
        return () => { clearTimeout(t); window.removeEventListener('keydown', onKey, true) }
    }, [abierto])

    const derecha = alinear === 'derecha'
    return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
            {children}
            {montado && (
                <>
                    <div className={s.menuVelo} data-on={visible ? '1' : undefined} onClick={onCerrar} aria-hidden="true" />
                    <div ref={caja} className={s.menu} data-on={visible ? '1' : undefined} role="menu" aria-label={titulo}
                        style={{
                            top: 'calc(100% + 8px)',
                            ...(derecha ? { right: 0 } : { left: 0 }),
                            position: 'absolute',
                            ['--origen' as string]: derecha ? '90% 0%' : '10% 0%',
                        }}>
                        <div className={s.menuTitulo}>{titulo}</div>
                        {opciones.map(o => {
                            const on = o.valor === elegida
                            return (
                                <button key={o.valor} type="button" role="menuitemradio" aria-checked={on}
                                    className={s.opcion} data-on={on ? '1' : undefined}
                                    onClick={() => { onElegir(o.valor); onCerrar() }}>
                                    {o.texto}
                                    {on && <span className={s.check}><IcoCheck /></span>}
                                </button>
                            )
                        })}
                    </div>
                </>
            )}
        </div>
    )
}
