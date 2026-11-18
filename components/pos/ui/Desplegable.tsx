'use client'

import type { ReactNode } from 'react'
import s from './pos.module.css'
import { cx, useRebote } from './movimiento'
import { IcoAbajo } from './Iconos'
import { Paso } from './Paso'
import { formatCOP } from '@/lib/utils'

/**
 * Lo que se abre en su sitio (presentaciones, detalle del cobro).
 * La altura se anima con grid-template-rows: el contenido empuja lo de
 * abajo sin saltos. Lo de adentro puede entrar escalonado con <Escalon>.
 */
export function Desplegable({ abierto, children, id }: { abierto: boolean; children: ReactNode; id?: string }) {
    return (
        <div className={s.despliega} data-on={abierto ? '1' : undefined} id={id} aria-hidden={!abierto}
            // Cerrado no se puede tocar ni enfocar lo de adentro
            inert={!abierto}>
            <div className={s.despliegaDentro}>{children}</div>
        </div>
    )
}

/** Un renglón que entra un poco después del anterior (50 ms cada uno) */
export function Escalon({ indice, children, className, style }: {
    indice: number
    children: ReactNode
    className?: string
    style?: React.CSSProperties
}) {
    return <div className={cx(s.escalon, className)} style={{ ...style, ['--j' as string]: indice }}>{children}</div>
}

/** La flechita que gira cuando se abre */
export function Chevron({ abierto, size }: { abierto: boolean; size?: number }) {
    return <span className={s.chevron} data-on={abierto ? '1' : undefined} style={{ display: 'inline-flex' }}><IcoAbajo size={size} /></span>
}

/**
 * Una cifra que rebota al cambiar (el total, el cambio, el saldo).
 * `tipo="barra"` es el rebote más suave de la barra del carrito.
 */
export function Rebota({ valor, children, tipo = 'total', className, style }: {
    valor: unknown
    children: ReactNode
    tipo?: 'total' | 'barra'
    className?: string
    style?: React.CSSProperties
}) {
    const r = useRebote(valor)
    const a = tipo === 'barra' ? s.reboteBarraA : s.reboteTotalA
    const b = tipo === 'barra' ? s.reboteBarraB : s.reboteTotalB
    return <span className={cx(r === 0 && a, r === 1 && b, className)} style={style}>{children}</span>
}

/**
 * Qué decir del stock, como el prototipo:
 * - 0 → "Agotado" (rojo)
 * - en su propio mínimo o por debajo → "Quedan N" (ámbar)
 * - por encima del mínimo → nada
 */
export function avisoStock(stock: number, minimo: number): { texto: string; tono: 'agotado' | 'quedan' } | null {
    const n = Math.max(0, Math.round(stock))
    if (n === 0) return { texto: 'Agotado', tono: 'agotado' }
    if (n <= Math.round(minimo)) return { texto: `Quedan ${n}`, tono: 'quedan' }
    return null
}

/**
 * Un renglón de presentación dentro del desplegable:
 * nombre, "$100.000 · Quedan 2" y la cantidad a la derecha.
 * Agotada y sin nada en la venta: se ve apagada y sin "+".
 */
export function FilaPresentacion({ indice, nombre, precio, stock, minimo, cantidad, onCambiar }: {
    indice: number
    nombre: string
    precio: number
    stock: number
    minimo: number
    cantidad: number
    onCambiar: (n: number) => void
}) {
    const aviso = avisoStock(stock, minimo)
    const agotada = aviso?.tono === 'agotado'
    const sinNada = Math.round(cantidad) <= 0
    return (
        <Escalon indice={indice} className={cx(s.presentacion, agotada && sinNada && s.presentacionApagada)}>
            <div className={s.presentacionTexto}>
                <div className={s.presentacionNombre}>{nombre}</div>
                <div className={s.presentacionPrecio}>
                    {formatCOP(Math.round(precio))}
                    {aviso && <span data-tono={aviso.tono}> · {aviso.texto}</span>}
                </div>
            </div>
            {!(agotada && sinNada) && <Paso cantidad={cantidad} onCambiar={onCambiar} nombre={nombre} />}
        </Escalon>
    )
}
