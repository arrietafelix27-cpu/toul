/**
 * TOUL — Motion Standard v1.0
 * Central source of truth for all animation config.
 * Import from here — never hardcode durations/easings in components.
 */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Variants, Transition } from 'framer-motion'

/* ─────────────────────────────────────────────────────────
   EASING CURVES
───────────────────────────────────────────────────────── */
export const ease = {
    // Salida fuerte (Emil): arranca rápido, que es cuando más se mira
    out: [0.23, 1, 0.32, 1] as [number, number, number, number],
    in: [0.4, 0.0, 1.0, 1.0] as [number, number, number, number],
    inOut: [0.4, 0.0, 0.2, 1.0] as [number, number, number, number],
    spring: { type: 'spring' as const, stiffness: 380, damping: 30, mass: 0.8 },
}

/* ─────────────────────────────────────────────────────────
   BASE TRANSITIONS
───────────────────────────────────────────────────────── */
export const t = {
    fast: { duration: 0.15, ease: ease.out } satisfies Transition,
    base: { duration: 0.20, ease: ease.out } satisfies Transition,
    slow: { duration: 0.28, ease: ease.out } satisfies Transition,
    spring: ease.spring,
    modal: { duration: 0.24, ease: ease.out } satisfies Transition,
    success: { duration: 0.30, ease: ease.out } satisfies Transition,
}

/* ─────────────────────────────────────────────────────────
   PAGE TRANSITION
   Fade + subtle upward slide (8px)
───────────────────────────────────────────────────────── */
export const pageVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: t.base },
    exit: { opacity: 0, y: -6, transition: t.fast },
}

/* ─────────────────────────────────────────────────────────
   FADE VARIANTS (generic)
───────────────────────────────────────────────────────── */
export const fadeIn: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: t.base },
}

export const fadeUp: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: t.base },
    exit: { opacity: 0, y: 6, transition: t.fast },
}

/* ─────────────────────────────────────────────────────────
   STAGGER CONTAINER (for lists)
───────────────────────────────────────────────────────── */
export const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.05, delayChildren: 0.02 },
    },
}

export const staggerItem: Variants = {
    hidden: { opacity: 0, y: 10, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: t.base },
}

/* ─────────────────────────────────────────────────────────
   MODAL / PANEL (slide from right for desktop panel)
───────────────────────────────────────────────────────── */
export const panelVariants: Variants = {
    hidden: { x: '100%', opacity: 0 },
    visible: { x: 0, opacity: 1, transition: t.modal },
    exit: { x: '100%', opacity: 0, transition: t.fast },
}

export const backdropVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: t.modal },
    exit: { opacity: 0, transition: t.fast },
}

/* ─────────────────────────────────────────────────────────
   BOTTOM SHEET (mobile)
───────────────────────────────────────────────────────── */
export const sheetVariants: Variants = {
    hidden: { y: '100%', opacity: 0 },
    visible: { y: 0, opacity: 1, transition: t.modal },
    exit: { y: '100%', opacity: 0, transition: t.fast },
}

/* ─────────────────────────────────────────────────────────
   SUCCESS / DOPAMINE POP
───────────────────────────────────────────────────────── */
export const successPop: Variants = {
    hidden: { scale: 0.6, opacity: 0 },
    visible: {
        scale: 1, opacity: 1,
        transition: { type: 'spring', stiffness: 450, damping: 22, mass: 0.7 },
    },
}

/* ─────────────────────────────────────────────────────────
   SHAKE (error feedback on inputs)
───────────────────────────────────────────────────────── */
export const shakeVariants: Variants = {
    idle: { x: 0 },
    shake: {
        x: [0, -8, 8, -6, 6, -3, 3, 0],
        transition: { duration: 0.4, ease: ease.out },
    },
}

/* ─────────────────────────────────────────────────────────
   INICIO
   Las secciones entran en cascada, la línea de la gráfica se
   dibuja y los montos cuentan desde cero. Pasa completo la
   primera vez que se abre la app; al volver al Inicio aparece de
   una, porque se entra muchas veces al día y repetirlo cada vez
   lo haría sentir lento.
───────────────────────────────────────────────────────── */
export const inicio = {
    /** Cada sección sube 12 px hasta su lugar; 70 ms entre una y otra */
    entrada: { duracion: 0.7, distancia: 12, escalon: 0.07 },
    /** La línea se traza de izquierda a derecha; el relleno sale al final */
    grafica: { trazo: 1.5, relleno: 0.5 },
    /** Lo que tardan los montos en contar */
    cuenta: 1.1,
}

/* CSS y no JavaScript: el Inicio carga muchas cosas a la vez y una
   animación de CSS no se traba mientras el navegador está ocupado.
   "backwards" y no "both": al terminar no queda nada aplicado. Si el
   movimiento quedara puesto, las hojas que se abren desde la sección
   aparecerían pegadas a ella y no a la pantalla. */
export const ENTRADA_INICIO_CSS = `
.in-entra { animation: in-entra ${inicio.entrada.duracion}s cubic-bezier(0.23, 1, 0.32, 1) backwards;
    animation-delay: calc(var(--in-i, 0) * ${Math.round(inicio.entrada.escalon * 1000)}ms); }
@keyframes in-entra { from { opacity: 0; transform: translateY(${inicio.entrada.distancia}px); } }
@keyframes in-aparece { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
    .in-entra { animation-name: in-aparece; animation-duration: 0.2s; }
}
`

/** Lo que necesita una sección para entrar en su turno de la cascada,
 *  sumado a la clase y el estilo que ya tenga */
export function entrada(turno: number, animar: boolean, clase?: string, estilo?: CSSProperties): { className?: string; style?: CSSProperties } {
    if (!animar) return { className: clase, style: estilo }
    return {
        className: clase ? `${clase} in-entra` : 'in-entra',
        style: { ...estilo, '--in-i': turno } as CSSProperties,
    }
}

let inicioYaEntro = false

/** true solo la primera vez que aparece el Inicio desde que se abrió la app */
export function useEntradaInicio(): boolean {
    const [animar] = useState(() => !inicioYaEntro)
    useEffect(() => { inicioYaEntro = true }, [])
    return animar
}

/* ─────────────────────────────────────────────────────────
   PREFERS-REDUCED-MOTION helper
   Use this to conditionally disable animations
───────────────────────────────────────────────────────── */
export function reducedVariants<T extends Variants>(variants: T): T {
    // When called server-side (SSR), return as-is; framer's useReducedMotion handles client.
    return variants
}
