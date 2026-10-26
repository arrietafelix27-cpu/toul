'use client'
/**
 * AnimatedNumber — un monto que cuenta desde cero.
 *
 * Cuenta al aparecer si `cuenta` lo pide, y cada vez que cambia `clave`
 * (el periodo que se está viendo). Si solo cambia el valor —entró una
 * venta, se recargaron los datos— salta directo: un número que vuelve a
 * contar en cada actualización distrae y no deja leerlo.
 *
 * Mientras cuenta guarda el ancho del valor final, para que lo que está
 * al lado no se mueva. Respeta prefers-reduced-motion.
 */
import React, { useLayoutEffect, useRef } from 'react'
import { useReducedMotion, animate } from 'framer-motion'
import { ease, inicio } from '@/lib/motion'

interface Props {
    value: number
    formatter?: (v: number) => string
    className?: string
    style?: React.CSSProperties
    /** Contar desde cero al aparecer */
    cuenta?: boolean
    /** Cuando cambia, vuelve a contar desde cero */
    clave?: string
    duration?: number
}

const formatear = (v: number, formatter?: (v: number) => string) =>
    formatter ? formatter(v) : String(Math.round(v))

export default function AnimatedNumber({ value, formatter, className, style, cuenta = false, clave = '', duration = inicio.cuenta }: Props) {
    const ref = useRef<HTMLSpanElement>(null)
    const reduce = useReducedMotion()
    // La clave con la que ya se contó (o se decidió no contar). null: todavía nada
    const contada = useRef<string | null>(null)

    useLayoutEffect(() => {
        const node = ref.current
        if (!node) return
        const formato = (v: number) => formatear(v, formatter)
        const anterior = contada.current
        const esPrimera = anterior === null
        if (anterior === clave || reduce || (esPrimera && !cuenta)) {
            contada.current = clave
            node.textContent = formato(value)
            return
        }

        contada.current = clave
        node.textContent = formato(0)
        let terminada = false
        const controls = animate(0, value, {
            duration,
            ease: ease.out,
            onUpdate: v => { node.textContent = formato(v) },
            onComplete: () => { terminada = true },
        })
        return () => {
            if (terminada) return
            controls.stop()
            // Se cortó antes de terminar (un valor nuevo, o React montando dos
            // veces en desarrollo): la próxima vez vuelve a contar
            contada.current = anterior
            node.textContent = formato(value)
        }
    }, [value, clave, reduce, cuenta, duration, formatter])

    return (
        <span className={className} style={{ display: 'inline-grid', ...style }}>
            {/* Reserva el ancho del valor final */}
            <span aria-hidden style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{formatear(value, formatter)}</span>
            <span ref={ref} style={{ gridArea: '1 / 1' }}>{formatear(value, formatter)}</span>
        </span>
    )
}
