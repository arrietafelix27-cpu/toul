'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Thumb } from '@/components/ui/Thumb'
import type { EstadoStock } from '@/lib/inventory/calculos'

/* ══════════════════════════════════════════════════════════════
   Una línea de "Tus productos".
   Menos letras: la foto, el nombre y las existencias. El número
   habla con el color que le da la regla única (toul_estado_stock):
   rojo si se acabó, ámbar si llegó a su mínimo, blanco si está bien.
   Lo demás vive en el detalle.
   ══════════════════════════════════════════════════════════════ */

export const colorDeEstado = (estado: EstadoStock) =>
    estado === 'agotado' ? 'var(--toul-error)'
        : estado === 'pocas' ? 'var(--toul-warning)'
            : 'var(--toul-text)'

export const ROW_CSS = `
.ivr { display: flex; align-items: center; gap: 12px; width: calc(100% + 20px); margin: 0 -10px; padding: 9px 10px;
    border-radius: 14px; border: none; background: none; text-decoration: none; text-align: left;
    font: inherit; color: var(--toul-text); cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: opacity 150ms ease, background-color 160ms ease; }
.ivr:active { opacity: 0.6; }
.ivr:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: -2px; }
.ivr-nombre { flex: 1; min-width: 0; }
.ivr-titulo { display: block; font-size: 15px; font-weight: 500; letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ivr-sub { display: block; font-size: 12px; color: var(--toul-text-dim); margin-top: 2px; }
.ivr-num { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    font-size: 17px; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.ivr-caret { color: var(--toul-text-dim); transition: transform 250ms cubic-bezier(0.23, 1, 0.32, 1); }
.ivr-caret[data-open="true"] { transform: rotate(180deg); }

/* Las presentaciones de un producto abierto, colgadas de una línea */
.ivr-hijos { margin: 0 0 4px 21px; padding-left: 21px; border-left: 1px solid var(--toul-divider);
    animation: ivr-entra 350ms cubic-bezier(0.23, 1, 0.32, 1) both; }
.ivr-hijos .ivr { padding-top: 8px; padding-bottom: 8px; }
.ivr-hijos .ivr-titulo { font-size: 14px; }
.ivr-hijos .ivr-num { font-size: 15px; }

/* Al cambiar de filtro u orden, las filas entran escalonadas */
.ivr-lista.an .ivr-fila { animation: ivr-entra 450ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@keyframes ivr-entra { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (hover: hover) and (pointer: fine) {
    .ivr:hover { background: color-mix(in srgb, var(--toul-text) 4%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
    .ivr-lista.an .ivr-fila, .ivr-hijos { animation: none; }
    .ivr-caret { transition: none; }
}
`

export function InventoryRow({
    href, onClick, image, name, presentaciones, stock, estado, abierto, delay = 0, hijo = false,
}: {
    href?: string
    onClick?: () => void
    image?: string | null
    name: string
    /** Solo en productos con presentaciones: "2 presentaciones" y la flecha */
    presentaciones?: number
    stock: number
    estado: EstadoStock
    abierto?: boolean
    delay?: number
    /** Una presentación dentro de un producto abierto: sin foto */
    hijo?: boolean
}) {
    const conPresentaciones = presentaciones !== undefined
    const dentro = (
        <>
            {!hijo && <Thumb src={image} name={name} size={42} radius={12} />}
            <span className="ivr-nombre">
                <span className="ivr-titulo">{name}</span>
                {conPresentaciones && <span className="ivr-sub">{presentaciones} presentaciones</span>}
            </span>
            <span className="ivr-num" style={{ color: colorDeEstado(estado) }}>
                {Math.round(stock)}
                {conPresentaciones && <ChevronDown size={16} strokeWidth={2} className="ivr-caret" data-open={abierto} aria-hidden />}
            </span>
        </>
    )
    const estilo = { animationDelay: `${Math.min(delay, 10) * 30}ms` }

    if (href) return <Link href={href} className="ivr ivr-fila" style={estilo}>{dentro}</Link>
    return (
        <button type="button" onClick={onClick} className="ivr ivr-fila" style={estilo} aria-expanded={abierto}>
            {dentro}
        </button>
    )
}
