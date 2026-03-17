'use client'
/**
 * AnimatedNumber — smooth count-up when value changes.
 * Respects prefers-reduced-motion.
 */
import React, { useEffect, useRef } from 'react'
import { useReducedMotion, animate } from 'framer-motion'

interface Props {
    value: number
    formatter?: (v: number) => string
    className?: string
    style?: React.CSSProperties
    duration?: number
}

export default function AnimatedNumber({ value, formatter, className, style, duration = 0.6 }: Props) {
    const ref = useRef<HTMLSpanElement>(null)
    const prefersReduced = useReducedMotion()
    const prevValue = useRef(value)

    useEffect(() => {
        const node = ref.current
        if (!node) return

        if (prefersReduced) {
            node.textContent = formatter ? formatter(value) : String(value)
            prevValue.current = value
            return
        }

        const from = prevValue.current
        prevValue.current = value

        const controls = animate(from, value, {
            duration,
            ease: [0.0, 0.0, 0.2, 1.0],
            onUpdate(v) {
                if (node) node.textContent = formatter ? formatter(v) : String(Math.round(v))
            },
        })
        return () => controls.stop()
    }, [value])

    return (
        <span ref={ref} className={className} style={style}>
            {formatter ? formatter(value) : String(value)}
        </span>
    )
}
