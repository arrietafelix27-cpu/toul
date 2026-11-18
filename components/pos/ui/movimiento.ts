'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

/* ══════════════════════════════════════════════════════════════
   El movimiento de Nueva venta, en un solo lugar.
   Mismas curvas y tiempos que el prototipo aprobado
   (diseno/pos/SPEC.md §2). El CSS las usa desde pos.module.css;
   esto es para lo que se mueve desde JavaScript.
   ══════════════════════════════════════════════════════════════ */

export const CURVA = {
    /** Salida por defecto: rápida al empezar, suave al llegar */
    sale: [0.23, 1, 0.32, 1] as [number, number, number, number],
    /** Capas y hojas (la de iOS) */
    capa: [0.32, 0.72, 0, 1] as [number, number, number, number],
    /** Rebote corto (aparecer, contar) */
    rebote: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
    /** Píldoras que se deslizan */
    pildora: [0.34, 1.3, 0.64, 1] as [number, number, number, number],
}

/** Milisegundos, copiados del prototipo */
export const DURACION = {
    toque: 160,
    hoja: 500,
    capa: 440,
    menu: 300,
    menuSale: 200,
    /** Lo mínimo que se ven los puntos del botón de confirmar */
    confirmarPuntos: 750,
    /** Lo que dura el estallido antes de pasar a "Venta registrada" */
    confirmarEstallido: 360,
    aviso: 2300,
} as const

/* ── ¿La persona pidió menos movimiento? ───────────────────────── */
const consulta = '(prefers-reduced-motion: reduce)'
function suscribir(cb: () => void) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const m = window.matchMedia(consulta)
    m.addEventListener('change', cb)
    return () => m.removeEventListener('change', cb)
}
const leer = () => typeof window !== 'undefined' && !!window.matchMedia?.(consulta).matches

/** true cuando el teléfono tiene activado "reducir movimiento" */
export function useQuieto(): boolean {
    return useSyncExternalStore(suscribir, leer, () => false)
}

/**
 * Para volver a disparar una animación cada vez que cambia un valor.
 * Devuelve 0 o 1 (alterna): el componente usa dos clases con la misma
 * animación (A y B), así el navegador la repite. Al montar no rebota.
 */
export function useRebote(valor: unknown): 0 | 1 | null {
    // Se ajusta durante el render (sin efecto): así lo recomienda React
    // para un estado que depende de que cambie una prop
    const [previo, setPrevio] = useState(valor)
    const [paridad, setParidad] = useState<0 | 1 | null>(null)
    if (!Object.is(previo, valor)) {
        setPrevio(valor)
        setParidad(paridad === 1 ? 0 : 1)
    }
    return paridad
}

/**
 * Montado mientras se cierra: lo que se va termina su animación antes
 * de desaparecer. `visible` llega un cuadro después de montar, para que
 * la entrada también se anime.
 */
export function useMontado(abierto: boolean, msSalida: number): { montado: boolean; visible: boolean } {
    const [montado, setMontado] = useState(abierto)
    const [listo, setListo] = useState(false)
    if (abierto && !montado) setMontado(true)

    useEffect(() => {
        if (abierto) {
            // Dos cuadros: el primero pinta cerrado, el segundo anima a abierto
            let r2 = 0
            const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setListo(true)) })
            return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
        }
        const t = setTimeout(() => { setMontado(false); setListo(false) }, msSalida)
        return () => clearTimeout(t)
    }, [abierto, msSalida])

    return { montado: montado || abierto, visible: abierto && listo }
}

/** Une clases sin dejar espacios ni "undefined" */
export function cx(...clases: (string | false | null | undefined)[]): string {
    return clases.filter(Boolean).join(' ')
}
