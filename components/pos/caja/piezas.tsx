'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useReducedMotion } from 'framer-motion'
import { Minus, Plus, Trash2, Package, Layers } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { onlyDigits, withThousands } from '@/lib/format/text'

/* ══════════════════════════════════════════════════════════════
   Piezas de la caja. El lenguaje: nada metido en cajas, sin
   mayúsculas sostenidas, los montos en blanco y el verde solo
   para lo importante (el botón de cobrar, el turno, lo elegido).
   ══════════════════════════════════════════════════════════════ */

/** La curva de las hojas y los selectores (la de iOS) */
export const EASE_HOJA: [number, number, number, number] = [0.32, 0.72, 0, 1]
export const DESLIZA = { duration: 0.35, ease: EASE_HOJA }

export const CAJA_CSS = `
.cj-press { transition: transform 140ms var(--toul-ease-emil), background-color 160ms ease, opacity 160ms ease;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.cj-press:active { transform: scale(0.95); }
.cj-press-suave:active { transform: scale(0.98); }
.cj-btn { border: none; font-family: inherit; cursor: pointer; }
.cj-btn:disabled { cursor: default; }
.cj-scroll-x { overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
.cj-scroll-x::-webkit-scrollbar { display: none; }
.cj-scroll-y { overflow-y: auto; overscroll-behavior: contain; }
.cj-campo { width: 100%; height: 48px; border: none; border-radius: 14px; padding: 0 14px; outline: none;
    background: var(--toul-surface); color: var(--toul-text); font-family: inherit; font-size: 16px;
    transition: background-color 160ms ease, box-shadow 160ms ease; }
.cj-campo::placeholder { color: var(--toul-text-dim); }
.cj-campo:focus { background: var(--toul-surface-2); box-shadow: inset 0 0 0 1px var(--toul-border-2); }
.cj-chip { height: 40px; padding: 0 15px; border-radius: 999px; font-size: 14px; font-weight: 500; white-space: nowrap;
    background: var(--toul-surface); color: var(--toul-text-muted); flex-shrink: 0; }
.cj-chip[data-on="1"] { background: var(--toul-surface-2); color: var(--toul-text); box-shadow: inset 0 0 0 1.5px var(--toul-text); font-weight: 600; }
.cj-link { background: none; padding: 0; font-size: 14px; font-weight: 500; color: var(--toul-text-muted); display: inline-flex; align-items: center; gap: 6px; }
.cj-titulo { font-size: 13px; font-weight: 500; color: var(--toul-text-subtle); margin: 0 0 10px; }
.cj-num { font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.cj-oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (hover: hover) and (pointer: fine) {
    .cj-chip:not([data-on="1"]):not(:disabled):hover { background: var(--toul-surface-2); }
    .cj-link:hover { color: var(--toul-text); }
    .cj-tarjeta:hover .cj-tarjeta-foto { filter: brightness(1.08); }
}
@media (prefers-reduced-motion: reduce) {
    .cj-press, .cj-press:active { transform: none !important; }
}
`

/* ── Foto de un producto, o su forma si no tiene ──────────────── */
export function Foto({ src, combo, tamaño, radio, className }: { src: string | null; combo?: boolean; tamaño: number | string; radio: number; className?: string }) {
    const icono = typeof tamaño === 'number' ? Math.max(14, Math.round(tamaño * 0.36)) : 28
    return (
        <span className={className} style={{
            width: tamaño, height: tamaño, aspectRatio: '1', borderRadius: radio, overflow: 'hidden', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--toul-surface)', transition: 'filter 200ms ease',
        }}>
            {src
                ? <img src={src} alt="" loading="lazy" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : combo
                    ? <Layers size={icono} strokeWidth={1.6} style={{ color: 'var(--toul-text-faint)' }} />
                    : <Package size={icono} strokeWidth={1.6} style={{ color: 'var(--toul-text-faint)' }} />}
        </span>
    )
}

/* ── El contador verde sobre la foto: rebota cada vez que cambia ── */
export function Contador({ n, style }: { n: number; style?: React.CSSProperties }) {
    if (n <= 0) return null
    return (
        <motion.span key={n} aria-label={`${n} en la venta`}
            initial={{ scale: 0.55, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.38, bounce: 0.45 }}
            className="cj-num"
            style={{
                position: 'absolute', minWidth: 26, height: 26, padding: '0 7px', borderRadius: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--toul-accent)', color: 'var(--toul-bg)', fontSize: 13.5, fontWeight: 750,
                boxShadow: '0 0 0 2.5px var(--toul-bg)', pointerEvents: 'none', ...style,
            }}>
            {n}
        </motion.span>
    )
}

/* ── − n + . En 1, el menos es una caneca roja ─────────────────── */
export function Cantidad({ n, onMenos, onMas, puedeMas, grande = false, etiqueta }: {
    n: number; onMenos: () => void; onMas: () => void; puedeMas: boolean; grande?: boolean; etiqueta: string
}) {
    const t = grande ? 40 : 34
    const boton = (hijo: ReactNode, onClick: () => void, aria: string, deshabilitado = false, peligro = false) => (
        <button type="button" onClick={e => { e.stopPropagation(); onClick() }} aria-label={aria} disabled={deshabilitado}
            className="cj-btn cj-press"
            style={{
                width: t, height: t, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: peligro ? 'var(--toul-error-dim)' : 'var(--toul-surface-2)',
                color: peligro ? 'var(--toul-error)' : 'var(--toul-text)',
                opacity: deshabilitado ? 0.3 : 1,
            }}>
            {hijo}
        </button>
    )
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: grande ? 10 : 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            {n === 1
                ? boton(<Trash2 size={grande ? 16 : 14} />, onMenos, `Quitar ${etiqueta}`, false, true)
                : boton(<Minus size={grande ? 16 : 14} strokeWidth={2.4} />, onMenos, `Una menos de ${etiqueta}`)}
            <span className="cj-num" style={{ minWidth: grande ? 28 : 22, textAlign: 'center', fontSize: grande ? 17 : 15, fontWeight: 650, color: 'var(--toul-text)' }}>{n}</span>
            {boton(<Plus size={grande ? 16 : 14} strokeWidth={2.4} />, onMas, `Una más de ${etiqueta}`, !puedeMas)}
        </span>
    )
}

/* ── Selector con el fondo que se desliza a lo elegido ──────────── */
export function Segmentado<T extends string>({ opciones, valor, onChange, id, alto = 44 }: {
    opciones: { valor: T; label: string; deshabilitado?: boolean }[]
    valor: T
    onChange: (v: T) => void
    /** Único por pantalla: el fondo se desliza entre las opciones de este selector */
    id: string
    alto?: number
}) {
    return (
        <div role="radiogroup" style={{ display: 'flex', padding: 4, gap: 2, borderRadius: 14, background: 'var(--toul-surface)' }}>
            {opciones.map(o => {
                const activo = o.valor === valor
                return (
                    <button key={o.valor} type="button" role="radio" aria-checked={activo} disabled={o.deshabilitado}
                        onClick={() => onChange(o.valor)} className="cj-btn"
                        style={{
                            position: 'relative', flex: 1, height: alto - 8, borderRadius: 11, background: 'transparent',
                            fontSize: 14.5, fontWeight: activo ? 600 : 500,
                            color: o.deshabilitado ? 'var(--toul-text-faint)' : activo ? 'var(--toul-text)' : 'var(--toul-text-subtle)',
                            transition: 'color 200ms ease', WebkitTapHighlightColor: 'transparent',
                        }}>
                        {activo && (
                            <motion.span layoutId={`seg-${id}`} transition={DESLIZA}
                                style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--toul-surface-2)', boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset' }} />
                        )}
                        <span style={{ position: 'relative' }}>{o.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

/* ── Un monto que cuenta hasta el valor nuevo cada vez que cambia ── */
export function Cuenta({ valor, style, className }: { valor: number; style?: React.CSSProperties; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null)
    const mostrado = useRef(Math.round(valor))
    const reducir = useReducedMotion()

    useLayoutEffect(() => {
        const node = ref.current
        if (!node) return
        const destino = Math.round(valor)
        if (reducir || mostrado.current === destino) {
            mostrado.current = destino
            node.textContent = formatCOP(destino)
            return
        }
        const controls = animate(mostrado.current, destino, {
            duration: 0.35,
            ease: [0.23, 1, 0.32, 1],
            onUpdate: v => { mostrado.current = v; node.textContent = formatCOP(v) },
        })
        return () => controls.stop()
    }, [valor, reducir])

    return <span ref={ref} className={`cj-num ${className ?? ''}`} style={style}>{formatCOP(valor)}</span>
}

/* ── Campo de pesos: muestra los miles con punto ────────────────── */
export function CampoPesos({ valor, onChange, placeholder = '0', autoFocus, etiqueta, alto = 48, invalido }: {
    valor: number | null; onChange: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; etiqueta: string; alto?: number; invalido?: boolean
}) {
    return (
        <span style={{ position: 'relative', display: 'block', flex: 1, minWidth: 0 }}>
            <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', fontSize: 16, pointerEvents: 'none' }}>$</span>
            <input
                type="text" inputMode="numeric" enterKeyHint="done" autoComplete="off" aria-label={etiqueta}
                className="cj-campo cj-num" placeholder={placeholder} autoFocus={autoFocus}
                value={valor === null ? '' : withThousands(String(Math.round(valor)))}
                onChange={e => {
                    const d = onlyDigits(e.target.value)
                    onChange(d ? Number(d) : null)
                }}
                style={{ height: alto, paddingLeft: 28, fontWeight: 600, boxShadow: invalido ? 'inset 0 0 0 1px var(--toul-error)' : undefined }}
            />
        </span>
    )
}

/* ── Iniciales para los clientes ────────────────────────────────── */
export function Iniciales({ nombre, tamaño = 40 }: { nombre: string; tamaño?: number }) {
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    const texto = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·'
    return (
        <span aria-hidden style={{
            width: tamaño, height: tamaño, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--toul-surface-2)', color: 'var(--toul-text)', fontSize: Math.round(tamaño * 0.36), fontWeight: 650,
        }}>
            {texto}
        </span>
    )
}

/** El precio de un producto: con presentaciones, el rango */
export function precioDe(min: number, max: number) {
    return min === max ? formatCOP(min) : `${formatCOP(min)} – ${formatCOP(max)}`
}
