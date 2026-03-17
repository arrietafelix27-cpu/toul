/**
 * TOUL — Motion Standard v1.0
 * Central source of truth for all animation config.
 * Import from here — never hardcode durations/easings in components.
 */
import type { Variants, Transition } from 'framer-motion'

/* ─────────────────────────────────────────────────────────
   EASING CURVES
───────────────────────────────────────────────────────── */
export const ease = {
    out: [0.0, 0.0, 0.2, 1.0] as [number, number, number, number],
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
   PREFERS-REDUCED-MOTION helper
   Use this to conditionally disable animations
───────────────────────────────────────────────────────── */
export function reducedVariants<T extends Variants>(variants: T): T {
    // When called server-side (SSR), return as-is; framer's useReducedMotion handles client.
    return variants
}
