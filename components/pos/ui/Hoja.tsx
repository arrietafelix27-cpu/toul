'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import s from './pos.module.css'
import { cx, DURACION, useMontado } from './movimiento'
import { BotonCerrar } from './Botones'

/** El celular arrastra la hoja; en PC es una ventana al centro */
const esCelular = () => typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches

/** Hacia arriba la hoja casi no se mueve: resiste como algo real */
const resiste = (d: number) => (d * 0.55 * 400) / (400 + 0.55 * d)

/**
 * Hoja de la caja (Cliente, Fecha de pago, Abono, Descuento, Comprobante).
 * - Celular: sube desde abajo en 500 ms con la curva de iOS. Se cierra con
 *   la X, tocando afuera, con Escape o arrastrándola hacia abajo.
 * - PC (≥1024 px): ventana de 480 px al centro.
 * - Lo de adentro sigue montado mientras se cierra, y entra 80 ms después
 *   del panel.
 */
export function Hoja({ abierta, onCerrar, titulo, children, pie, alta, llena, cerrable = true }: {
    abierta: boolean
    onCerrar: () => void
    titulo: ReactNode
    children: ReactNode
    /** Abajo, fijo (por ejemplo "Listo" o "Aplicar") */
    pie?: ReactNode
    /** 86 % de la pantalla (la hoja de Cliente) */
    alta?: boolean
    /** El cuerpo llena el alto y su lista hace scroll adentro */
    llena?: boolean
    cerrable?: boolean
}) {
    const { montado, visible } = useMontado(abierta, DURACION.hoja)
    const idTitulo = useId()
    const panel = useRef<HTMLDivElement>(null)
    const arrastre = useRef<{ y0: number; dy: number; yAnt: number; tAnt: number; v: number; id: number } | null>(null)
    const cerrar = useRef(onCerrar)
    useEffect(() => { cerrar.current = onCerrar }, [onCerrar])

    // Escape cierra; al abrir, el foco entra a la hoja y al cerrar vuelve a donde estaba
    useEffect(() => {
        if (!abierta) return
        const antes = document.activeElement as HTMLElement | null
        const t = setTimeout(() => panel.current?.focus({ preventScroll: true }), 60)
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && cerrable && !e.defaultPrevented) { e.preventDefault(); cerrar.current() }
        }
        window.addEventListener('keydown', onKey)
        return () => {
            clearTimeout(t)
            window.removeEventListener('keydown', onKey)
            if (antes && document.contains(antes)) antes.focus({ preventScroll: true })
        }
    }, [abierta, cerrable])

    if (!montado || typeof document === 'undefined') return null

    const empieza = (e: React.PointerEvent) => {
        if (!cerrable || !esCelular() || (e.target as HTMLElement).closest('button')) return
        arrastre.current = { y0: e.clientY, dy: 0, yAnt: e.clientY, tAnt: performance.now(), v: 0, id: e.pointerId }
        e.currentTarget.setPointerCapture(e.pointerId)
        if (panel.current) panel.current.dataset.arrastre = '1'
    }
    const mueve = (e: React.PointerEvent) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId || !panel.current) return
        const crudo = e.clientY - a.y0
        a.dy = crudo >= 0 ? crudo : -resiste(-crudo)
        const ahora = performance.now()
        a.v = (e.clientY - a.yAnt) / Math.max(1, ahora - a.tAnt)
        a.yAnt = e.clientY
        a.tAnt = ahora
        panel.current.style.transform = `translateY(${a.dy}px)`
    }
    const suelta = (e: React.PointerEvent) => {
        const a = arrastre.current
        if (!a || a.id !== e.pointerId) return
        arrastre.current = null
        if (panel.current) {
            delete panel.current.dataset.arrastre
            panel.current.style.transform = ''
        }
        // Un tirón rápido basta, sin tener que llegar lejos
        if (a.dy > 120 || a.v > 0.5) cerrar.current()
    }

    return createPortal(
        <div className={cx(s.pos, s.hoja)} data-on={visible ? '1' : undefined}>
            <div className={s.hojaVelo} onClick={cerrable ? onCerrar : undefined} aria-hidden="true" />
            <div ref={panel} className={cx(s.hojaPanel, alta && s.hojaAlta)} role="dialog" aria-modal="true"
                aria-labelledby={idTitulo} tabIndex={-1} style={{ outline: 'none' }}>
                <div className={s.hojaAgarre} onPointerDown={empieza} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={suelta}>
                    <div className={s.manija} aria-hidden="true" />
                    <div className={s.hojaCabeza}>
                        <span id={idTitulo}>{titulo}</span>
                        {cerrable && <BotonCerrar onClick={onCerrar} />}
                    </div>
                </div>
                <div className={cx(s.hojaCuerpo, llena && s.hojaLlena)}>
                    {children}
                </div>
                {pie}
            </div>
        </div>,
        document.body,
    )
}

/** El subtítulo gris dentro de una hoja ("Método del abono") */
export function EtiquetaHoja({ children }: { children: ReactNode }) {
    return <div className={s.hojaEtiqueta}>{children}</div>
}
