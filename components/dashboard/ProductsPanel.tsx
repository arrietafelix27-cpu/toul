'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { ENTRADA_INICIO_CSS } from '@/lib/motion'
import { Desplegable, Opciones, type Opcion, type Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   Tus productos.

   Cuatro listas en una píldora: lo que más se vende, lo que más
   margen deja, lo que se está acabando y lo que no se mueve. Cada
   producto es su foto con el puesto encima; debajo, el nombre y el
   único dato que importa en esa lista.

   En el celular se desliza de lado (hasta 10); en el computador son
   los 3 primeros.
   ══════════════════════════════════════════════════════════════ */

export interface ProductRow {
    id: string
    name: string
    image_url: string | null
    /** Lo que mide la lista: unidades, % de margen, stock o días sin venderse */
    value: number
}

export interface ProductsData {
    topUnits: ProductRow[]
    topProfit: ProductRow[]
    lowStock: ProductRow[]
    slowMoving: ProductRow[]
}

type Lista = 'units' | 'profit' | 'low' | 'slow'

const LISTAS: Opcion<Lista>[] = [
    { valor: 'units', etiqueta: 'Más vendidos' },
    { valor: 'profit', etiqueta: 'Más rentables' },
    { valor: 'low', etiqueta: 'Menos stock' },
    { valor: 'slow', etiqueta: 'Menos vendidos' },
]

const VACIA: Record<Lista, string> = {
    units: 'Sin ventas en este periodo',
    profit: 'Sin ventas en este periodo',
    low: 'Nada se está acabando',
    slow: 'Todo se está vendiendo',
}

function metrica(lista: Lista, valor: number): { texto: string; color: string } {
    switch (lista) {
        // Gris claro: el verde queda para lo que de verdad lo necesita
        case 'units': return { texto: `${valor} ${valor === 1 ? 'vendido' : 'vendidos'}`, color: 'var(--toul-text-muted)' }
        case 'profit': return { texto: `${valor}%`, color: 'var(--toul-text-muted)' }
        case 'low': return valor <= 0
            ? { texto: 'Agotado', color: 'var(--toul-error)' }
            : { texto: `Quedan ${valor}`, color: 'var(--toul-warning)' }
        case 'slow': return { texto: `${valor} ${valor === 1 ? 'día' : 'días'} sin venderse`, color: 'var(--toul-text-subtle)' }
    }
}

const CSS = ENTRADA_INICIO_CSS + `
.tp-titulo { font-weight: 700; letter-spacing: -0.5px; line-height: 1.2; color: var(--toul-text); margin: 0 0 12px; }
.tp-titulo[data-variante="movil"] { font-size: 20px; }
.tp-titulo[data-variante="pc"] { font-size: 17px; }

/* Celular: una fila que se desliza de lado, de borde a borde */
.tp-fila[data-variante="movil"] { display: flex; gap: 12px; margin: 16px -16px 0; padding: 0 16px 2px;
    overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: 16px;
    overscroll-behavior-x: contain; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.tp-fila[data-variante="movil"]::-webkit-scrollbar { display: none; }
.tp-fila[data-variante="movil"] .tp-carta { flex: 0 0 128px; scroll-snap-align: start; }
.tp-fila[data-variante="movil"] .tp-foto { height: 164px; }
.tp-fila[data-variante="movil"] .tp-numero { font-size: 60px; left: 11px; }

/* Computador: los 3 primeros, y 4 en pantallas grandes. Las fotos
   crecen con el alto de la pantalla (la medida la pone el Inicio) */
.tp-fila[data-variante="pc"] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; }
.tp-fila[data-variante="pc"] .tp-foto { height: var(--in-pc-foto, clamp(150px, 24vh, 260px)); }
.tp-fila[data-variante="pc"] > :nth-child(4) { display: none; }
@media (min-width: 1440px) {
    .tp-fila[data-variante="pc"] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .tp-fila[data-variante="pc"] > :nth-child(4) { display: flex; }
}
.tp-fila[data-variante="pc"] .tp-numero { font-size: 34px; left: 10px; bottom: 4px; }

.tp-carta { display: flex; flex-direction: column; min-width: 0; text-decoration: none; color: inherit;
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; touch-action: manipulation;
    transition: transform 160ms var(--toul-ease-emil); }
.tp-carta:active { transform: scale(0.97); }
.tp-foto { position: relative; display: block; overflow: hidden; border-radius: 18px;
    background: linear-gradient(155deg, var(--toul-surface-2), var(--toul-surface-3)); }
.tp-foto img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    transition: transform 400ms var(--toul-ease-emil); }
/* Sin foto: la inicial, como en el resto de la app */
.tp-inicial { position: absolute; inset: 0 0 30% 0; display: flex; align-items: center; justify-content: center;
    font-size: 30px; font-weight: 600; letter-spacing: -0.02em; color: var(--toul-text-faint); }
/* El puesto se lee sobre cualquier foto, incluso una blanca: el degradado
   oscurece el 72% de abajo y el número lleva una sombra suave */
.tp-velo { position: absolute; inset: 0;
    background: linear-gradient(180deg, transparent 28%, color-mix(in srgb, var(--toul-bg) 88%, transparent) 100%); }
.tp-numero { position: absolute; bottom: 2px; font-weight: 800; line-height: 1; letter-spacing: -0.04em;
    color: var(--toul-text); font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 12px color-mix(in srgb, var(--toul-bg) 55%, transparent); }
.tp-nombre { margin-top: 9px; font-size: 14px; font-weight: 500; letter-spacing: -0.01em; color: var(--toul-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-metrica { margin-top: 2px; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tp-vacia { margin: 16px 0 0; font-size: 13px; color: var(--toul-text-subtle); }

@media (hover: hover) and (pointer: fine) {
    .tp-carta:hover .tp-foto img { transform: scale(1.04); }
}
@media (prefers-reduced-motion: reduce) {
    .tp-carta:active { transform: none; }
    .tp-carta:hover .tp-foto img { transform: none; }
}
`

export function ProductsPanel({ products, loading, variante, animar }: {
    products: ProductsData
    loading: boolean
    variante: Variante
    /** Las tarjetas entran en cascada al aparecer (la primera vez que se abre la app) */
    animar: boolean
}) {
    const [lista, setLista] = useState<Lista>('units')
    // Al cambiar de lista, las tarjetas vuelven a entrar en cascada
    const [cambiada, setCambiada] = useState(false)

    const filas: Record<Lista, ProductRow[]> = {
        units: products.topUnits,
        profit: products.topProfit,
        low: products.lowStock,
        slow: products.slowMoving,
    }
    const visibles = filas[lista].slice(0, variante === 'movil' ? 10 : 4)
    const cascada = animar || cambiada
    const etiqueta = LISTAS.find(l => l.valor === lista)?.etiqueta ?? ''

    return (
        <section style={{ minWidth: 0 }}>
            <style>{CSS}</style>
            <h2 className="tp-titulo" data-variante={variante}>Tus productos</h2>

            <Desplegable variante={variante} titulo="Tus productos" claseBoton="dz-pildora"
                boton={<>{etiqueta}<ChevronDown size={14} strokeWidth={2.4} className="dz-flecha" /></>}
                contenido={cerrar => (
                    <Opciones variante={variante} opciones={LISTAS} activo={lista}
                        onElegir={valor => {
                            if (valor !== lista) { setLista(valor); setCambiada(true) }
                            cerrar()
                        }} />
                )} />

            {loading ? (
                <div className="tp-fila" data-variante={variante} aria-hidden>
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className="tp-carta">
                            <span className="tp-foto skeleton" />
                            <span className="skeleton" style={{ height: 12, width: '70%', borderRadius: 6, marginTop: 11 }} />
                        </div>
                    ))}
                </div>
            ) : visibles.length === 0 ? (
                <p className="tp-vacia">{VACIA[lista]}</p>
            ) : (
                <div key={lista} className="tp-fila" data-variante={variante}>
                    {visibles.map((producto, i) => {
                        const { texto, color } = metrica(lista, producto.value)
                        return (
                            <Link key={producto.id} href={`/products/${producto.id}`} prefetch={false}
                                className={`tp-carta${cascada ? ' in-entra' : ''}`}
                                style={cascada ? ({ '--in-i': i } as CSSProperties) : undefined}>
                                <span className="tp-foto">
                                    {producto.image_url
                                        ? <img src={producto.image_url} alt="" loading="lazy" />
                                        : <span className="tp-inicial" aria-hidden>{producto.name.trim().charAt(0).toUpperCase() || '·'}</span>}
                                    <span className="tp-velo" aria-hidden />
                                    <span className="tp-numero" aria-hidden>{i + 1}</span>
                                </span>
                                <span className="tp-nombre">{producto.name}</span>
                                <span className="tp-metrica" style={{ color }}>{texto}</span>
                            </Link>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
