'use client'

import Link from 'next/link'
import { Gift, Layers, Package } from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   Una tarjeta del catálogo.

   La caja —fondo, borde, sombra— casi no existe: vive al 15%, de
   modo que lo que flota sobre el fondo es la foto con su nombre y
   su precio, no un rectángulo gris con cosas adentro. Al pasar el
   cursor la caja sube al 45% y envuelve el producto: aparece
   cuando la señalas, y se va cuando no.

   Lo que nunca se atenúa es lo que sirve para reconocer el
   producto de un vistazo: la foto, el nombre y el precio.

   Sin foto, el cuadro no queda vacío: lleva la inicial del
   producto. Una grilla pareja se lee de un vistazo; una dentada
   —unas tarjetas altas y otras bajas— parece rota, no diseñada.
   ══════════════════════════════════════════════════════════════ */

export type CatalogKind = 'simple' | 'presentaciones' | 'combo'

export interface CatalogCardData {
    id: string
    kind: CatalogKind
    name: string
    /** Precio o rango, ya formateado */
    priceLabel: string
    image: string | null
    stock: number | null
    presentations?: number
    badge?: { label: string; bg: string; text: string } | null
    href: string
}

export const CATALOG_CARD_CSS = `
.cat {
    position: relative; display: flex; flex-direction: column;
    padding: 8px 8px 11px; border-radius: 20px; text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}

/* La caja. Es solo esto lo que se funde con el fondo. */
.cat::before {
    content: ''; position: absolute; inset: 0; border-radius: 20px;
    background: var(--toul-surface);
    box-shadow: inset 0 0 0 1px var(--toul-border);
    opacity: 0.15;
    transition: opacity 260ms cubic-bezier(0.23, 1, 0.32, 1);
    pointer-events: none;
}

.cat > * { position: relative; }
.cat:active { transform: scale(0.975); }

.cat-foto {
    position: relative; width: 100%; overflow: hidden; flex-shrink: 0;
    border-radius: 14px; aspect-ratio: 1 / 1;
    background: linear-gradient(158deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02));
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
}
.cat-foto[data-sinfoto="true"] { background: linear-gradient(158deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)); }
.cat-foto[data-agotado="true"] > img { opacity: 0.4; }

.cat-foto > img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    transition: transform 420ms cubic-bezier(0.23, 1, 0.32, 1), opacity 260ms ease;
}

.cat-inicial {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 40px; font-weight: 600; letter-spacing: -0.04em; line-height: 1;
    color: rgba(255,255,255,0.1);
}

.cat-chip {
    position: absolute; top: 7px; left: 7px;
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 10px; font-weight: 600; color: var(--toul-text-muted);
    background: rgba(10,10,10,0.7); backdrop-filter: blur(10px);
    border-radius: 999px; padding: 4px 8px;
}

.cat-senal {
    position: absolute; bottom: 7px; right: 7px;
    font-size: 10px; font-weight: 600; border-radius: 999px; padding: 4px 8px;
}

.cat-cuerpo { padding: 9px 4px 0; display: flex; flex-direction: column; gap: 2px; }

.cat-nombre {
    font-size: 13.5px; font-weight: 600; letter-spacing: -0.015em; color: var(--toul-text);
    margin: 0; line-height: 1.3; height: 35px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cat-precio {
    font-size: 14.5px; font-weight: 700; letter-spacing: -0.025em; color: var(--toul-text);
    margin: 0; line-height: 19px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
}
.cat-pie {
    font-size: 11.5px; margin: 0; line-height: 16px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

@media (hover: hover) and (pointer: fine) {
    .cat:hover::before { opacity: 0.45; }
    .cat:hover .cat-foto > img { transform: scale(1.035); }
}
@media (prefers-reduced-motion: reduce) {
    .cat, .cat::before, .cat-foto > img { transition: none; }
    .cat:active { transform: none; }
}

/* Entra escalonado, pero solo las primeras: con un catálogo grande
   no se puede esperar a que aparezcan todas */
.cat-entra { opacity: 0; transform: translateY(8px);
    animation: cat-in 280ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
@keyframes cat-in { to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
    .cat-entra { animation: none; opacity: 1; transform: none; }
}
`

const CHIP: Record<CatalogKind, { label: string; Icon: typeof Package } | null> = {
    simple: null,
    presentaciones: { label: 'Presentaciones', Icon: Layers },
    combo: { label: 'Combo', Icon: Gift },
}

export function CatalogCard({ item, index }: { item: CatalogCardData; index: number }) {
    const chip = CHIP[item.kind]
    const agotado = item.stock === 0
    const poco = typeof item.stock === 'number' && item.stock > 0 && item.stock <= 3

    const pie = item.kind === 'combo' ? 'Combo'
        : item.kind === 'presentaciones' ? `${item.presentations ?? 0} presentaciones`
            : agotado ? 'Se agotó' : `${item.stock ?? 0} und`

    const colorPie = agotado ? 'var(--toul-error)'
        : poco && item.kind === 'simple' ? 'var(--toul-warning)'
            : 'var(--toul-text-dim)'

    return (
        <Link href={item.href} className="cat cat-entra"
            style={{ animationDelay: `${Math.min(index, 11) * 30}ms` }}>
            <span className="cat-foto" data-sinfoto={!item.image} data-agotado={agotado}>
                {item.image
                    ? <img src={item.image} alt={item.name} loading="lazy" />
                    : <span className="cat-inicial">{item.name.trim().charAt(0).toUpperCase() || '·'}</span>}

                {chip && (
                    <span className="cat-chip"><chip.Icon size={11} /> {chip.label}</span>
                )}
                {item.badge && !agotado && (
                    <span className="cat-senal" style={{ background: item.badge.bg, color: item.badge.text }}>
                        {item.badge.label}
                    </span>
                )}
            </span>

            <span className="cat-cuerpo">
                <span className="cat-nombre">{item.name}</span>
                <span className="cat-precio">{item.priceLabel}</span>
                <span className="cat-pie" style={{ color: colorPie }}>{pie}</span>
            </span>
        </Link>
    )
}
