'use client'

import { useEffect, useRef } from 'react'
import { animate, useReducedMotion } from 'framer-motion'
import { ArrowLeftRight } from 'lucide-react'
import { formatCOP } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════
   Cuánto aguanta el inventario.

   De todo lo que se puede decir de una bodega, el número que de
   verdad mueve una decisión es cuántos días te dura al ritmo al
   que estás vendiendo. La plata que tienes guardada es un dato;
   los días son un aviso.

   La barra se mide contra un mes, que es como se piensa un
   negocio, y lleva una marca en tu umbral de respaldo: si el
   relleno no llega a la marca, vas tarde.
   ══════════════════════════════════════════════════════════════ */

const HORIZONTE = 30

const CSS = `
.gauge-pista { display: block; position: relative; height: 10px; border-radius: 999px;
    overflow: hidden; background: rgba(255,255,255,0.055); }

.gauge-relleno { display: block; position: absolute; inset: 0 auto 0 0; width: 100%; border-radius: 999px;
    transform-origin: left center; transform: scaleX(0);
    transition: transform 760ms cubic-bezier(0.23, 1, 0.32, 1), background-color 300ms ease; }

/* La luz en la punta: la barra no termina en un corte seco */
.gauge-punta { display: block; position: absolute; top: 50%; width: 22px; height: 22px; border-radius: 999px;
    transform: translate(-50%, -50%); pointer-events: none; filter: blur(7px); opacity: 0.55;
    transition: left 760ms cubic-bezier(0.23, 1, 0.32, 1), background-color 300ms ease; }

/* Tu umbral de respaldo */
.gauge-marca { display: block; position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 2px;
    background: rgba(255,255,255,0.5); box-shadow: 0 0 0 2px var(--toul-bg); }

.gauge-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 0;
    font-size: 12.5px; color: var(--toul-text-dim); margin: 11px 0 0; }
.gauge-meta > span + span::before { content: '·'; margin: 0 7px; color: var(--toul-text-faint); }

.gauge-valor { display: inline-flex; align-items: center; gap: 5px; padding: 0;
    background: none; border: none; cursor: pointer; font-family: inherit;
    font-size: 12.5px; color: var(--toul-text-dim);
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
@media (hover: hover) and (pointer: fine) { .gauge-valor:hover { color: var(--toul-text); } }

@media (prefers-reduced-motion: reduce) {
    .gauge-relleno, .gauge-punta { transition: none; }
}
`

export function StockGauge({
    days, coverageDays, value, retailValue, verVenta, onToggleValue,
    references, items, units,
}: {
    /** Días que aguanta. null cuando todavía no hay ventas con qué medir */
    days: number | null
    coverageDays: number
    value: number
    retailValue: number
    verVenta: boolean
    onToggleValue: () => void
    references: number
    items: number
    units: number
}) {
    const sinMovimiento = days === null
    const dias = days ?? 0

    const color = sinMovimiento ? 'var(--toul-text-faint)'
        : dias < coverageDays ? 'var(--toul-error)'
            : dias < coverageDays * 2 ? 'var(--toul-warning)'
                : 'var(--toul-accent)'

    const pct = Math.min(Math.max(dias / HORIZONTE, 0), 1)
    const marca = Math.min(Math.max(coverageDays / HORIZONTE, 0), 1)

    const numero = useRef<HTMLSpanElement>(null)
    const relleno = useRef<HTMLSpanElement>(null)
    const punta = useRef<HTMLSpanElement>(null)
    const quieto = useReducedMotion()

    // El número sube contando y la barra se llena: es lo que hace que
    // se sienta un medidor y no una etiqueta
    useEffect(() => {
        if (sinMovimiento) return
        const pintar = () => {
            if (relleno.current) relleno.current.style.transform = `scaleX(${pct})`
            if (punta.current) punta.current.style.left = `${pct * 100}%`
        }
        if (quieto) {
            if (numero.current) numero.current.textContent = String(dias)
            pintar()
            return
        }
        const t = requestAnimationFrame(pintar)
        const cuenta = animate(0, dias, {
            duration: 0.85,
            ease: [0.23, 1, 0.32, 1],
            onUpdate: v => { if (numero.current) numero.current.textContent = String(Math.round(v)) },
        })
        return () => { cancelAnimationFrame(t); cuenta.stop() }
    }, [dias, pct, sinMovimiento, quieto])

    return (
        <section style={{ position: 'relative' }}>
            <style>{CSS}</style>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
                <div style={{ minWidth: 0 }}>
                    <p className="pnl-label">Tu inventario aguanta</p>
                    {sinMovimiento ? (
                        <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.1,
                            margin: '6px 0 0', color: 'var(--toul-text-dim)' }}>
                            Sin ventas aún
                        </p>
                    ) : (
                        <p style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1.05,
                            margin: '6px 0 0', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                            <span ref={numero}>{quieto ? dias : 0}</span>
                            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em',
                                color: 'var(--toul-text-dim)', marginLeft: 8 }}>
                                {dias === 1 ? 'día' : 'días'}
                            </span>
                        </p>
                    )}
                </div>

                {/* La plata guardada acompaña: es un dato, no el titular */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)',
                        margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(verVenta ? retailValue : value)}
                    </p>
                    <button className="gauge-valor" onClick={onToggleValue} style={{ marginTop: 2 }}>
                        {verVenta ? 'a precio de venta' : 'a lo que te costó'}
                        <ArrowLeftRight size={11} />
                    </button>
                    {verVenta && retailValue > value && (
                        <p style={{ fontSize: 12, color: 'var(--toul-accent)', margin: '2px 0 0' }}>
                            +{formatCOP(retailValue - value)} si lo vendes todo
                        </p>
                    )}
                </div>
            </div>

            <div style={{ marginTop: 16 }}>
                <span style={{ display: 'block', position: 'relative' }}>
                    <span className="gauge-pista">
                        <span ref={relleno} className="gauge-relleno" style={{ background: color }} />
                    </span>
                    {!sinMovimiento && marca > 0 && marca < 1 && (
                        <span className="gauge-marca" style={{ left: `${marca * 100}%` }}
                            title={`Tu respaldo: ${coverageDays} días`} />
                    )}
                </span>
                {!sinMovimiento && (
                    <span style={{ position: 'relative', display: 'block', height: 0 }}>
                        <span ref={punta} className="gauge-punta" style={{ background: color, left: 0, top: -5 }} />
                    </span>
                )}
            </div>

            <p className="gauge-meta">
                <span>{references} {references === 1 ? 'referencia' : 'referencias'}</span>
                {items > references && <span>{items} presentaciones</span>}
                <span>{units} {units === 1 ? 'unidad' : 'unidades'}</span>
                {!sinMovimiento && dias < coverageDays && (
                    <span style={{ color: 'var(--toul-error)' }}>
                        menos de tus {coverageDays} días de respaldo
                    </span>
                )}
            </p>
        </section>
    )
}
