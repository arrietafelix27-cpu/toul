'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { Sheet } from '@/components/isla/Sheet'
import { Thumb } from '@/components/ui/Thumb'
import { guardarPedido } from '@/lib/inventory/pedido'
import {
    costoDelPedido, lineasDelPedido, nombreCompleto,
    type Mostrar, type Orden, type ParaReponer,
} from '@/lib/inventory/calculos'

/* ══════════════════════════════════════════════════════════════
   Las hojas de Inventario: Ordenar, Filtrar y Compra sugerida.
   Ninguna calcula nada: ordenan, filtran o arman el pedido con lo
   que ya sale de lib/inventory/calculos.ts.
   ══════════════════════════════════════════════════════════════ */

export const ETIQUETA_MOSTRAR: Record<Mostrar, string> = {
    'todos': 'Todos',
    'por-comprar': 'Por comprar',
    'quietos': 'Quietos',
    'con-stock': 'Con stock',
    'sin-stock': 'Sin stock',
}

const ORDENES: { key: Orden; label: string }[] = [
    { key: 'nombre', label: 'Nombre (A–Z)' },
    { key: 'menos', label: 'Menos unidades primero' },
    { key: 'mas', label: 'Más unidades primero' },
    { key: 'vendidos', label: 'Más vendidos' },
]

const MOSTRAR: Mostrar[] = ['todos', 'por-comprar', 'quietos', 'con-stock', 'sin-stock']

export const llaveDeSugerida = (item: ParaReponer) => `${item.kind}-${item.id}`

const CSS = `
.hj-opcion { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
    padding: 13px 0; border: none; border-bottom: 1px solid var(--toul-divider); background: none;
    font: inherit; font-size: 15px; color: var(--toul-text); text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: opacity 150ms ease; }
.hj-opcion:active { opacity: 0.6; }
.hj-opcion:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 8px; }
.hj-cuenta { color: var(--toul-text-dim); margin-left: 6px; font-variant-numeric: tabular-nums; }
.hj-grupo { font-size: 13px; color: var(--toul-text-subtle); margin: 18px 0 2px; }
.hj-grupo:first-child { margin-top: 4px; }
.hj-pildoras { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.hj-pildora { font: inherit; font-size: 14px; padding: 8px 14px; border-radius: 999px; border: none; cursor: pointer;
    background: var(--toul-surface); color: color-mix(in srgb, var(--toul-text) 75%, transparent);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 200ms ease, color 200ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.hj-pildora:active { transform: scale(0.96); }
.hj-pildora[aria-pressed="true"] { background: var(--toul-accent); color: var(--toul-bg); font-weight: 600; }
.hj-pildora:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; }

.hj-cta { width: 100%; height: 50px; border-radius: 14px; border: none; cursor: pointer; font: inherit;
    font-size: 15px; font-weight: 700; background: var(--toul-accent); color: var(--toul-bg);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease; }
.hj-cta:active:not(:disabled) { transform: scale(0.97); }
.hj-cta:disabled { opacity: 0.3; cursor: default; }
.hj-cta:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 3px; }
.hj-texto { width: 100%; height: 44px; margin-top: 4px; border: none; background: none; cursor: pointer; font: inherit;
    font-size: 15px; font-weight: 500; color: var(--toul-text-subtle); -webkit-tap-highlight-color: transparent; }
.hj-texto:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 12px; }

/* Compra sugerida */
.hj-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 0; border: none;
    border-bottom: 1px solid var(--toul-divider); background: none; font: inherit; color: var(--toul-text);
    text-align: left; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    -webkit-user-select: none; user-select: none; }
.hj-fila:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 8px; }
.hj-fila .hj-apaga { transition: opacity 200ms ease; }
.hj-fila[aria-checked="false"] .hj-apaga { opacity: 0.4; }
.hj-check { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    border: 1.5px solid color-mix(in srgb, var(--toul-text) 25%, transparent); color: var(--toul-bg);
    transition: background-color 200ms ease, border-color 200ms ease; }
.hj-check svg { opacity: 0; transform: scale(0.6); transition: opacity 200ms ease, transform 250ms cubic-bezier(0.23, 1, 0.32, 1); }
.hj-fila[aria-checked="true"] .hj-check { background: var(--toul-accent); border-color: var(--toul-accent); }
.hj-fila[aria-checked="true"] .hj-check svg { opacity: 1; transform: none; }
.hj-nombre { flex: 1; min-width: 0; font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hj-cuantas { font-size: 15px; font-weight: 700; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.hj-total { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 14px;
    font-size: 14px; color: var(--toul-text-muted); }
.hj-total b { font-size: 22px; color: var(--toul-text); letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
    .hj-pildora, .hj-cta, .hj-check, .hj-check svg, .hj-fila .hj-apaga { transition: none; }
}
`

const Marca = () => <Check size={18} strokeWidth={2.4} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} aria-hidden />

/* ── Ordenar ─────────────────────────────────────────────────── */

export function HojaOrdenar({ abierta, orden, onElegir, onCerrar }: {
    abierta: boolean
    orden: Orden
    onElegir: (orden: Orden) => void
    onCerrar: () => void
}) {
    return (
        <Sheet open={abierta} onClose={onCerrar} title="Ordenar por" width={420} subir>
            <style>{CSS}</style>
            <div role="radiogroup" aria-label="Ordenar por">
                {ORDENES.map(o => (
                    <button key={o.key} type="button" role="radio" aria-checked={orden === o.key} className="hj-opcion"
                        onClick={() => onElegir(o.key)}>
                        <span>{o.label}</span>
                        {orden === o.key && <Marca />}
                    </button>
                ))}
            </div>
        </Sheet>
    )
}

/* ── Filtrar ─────────────────────────────────────────────────── */

export function HojaFiltrar({
    abierta, mostrar, categoria, categorias, conteos, cuantos, onMostrar, onCategoria, onQuitar, onCerrar,
}: {
    abierta: boolean
    mostrar: Mostrar
    categoria: string | null
    categorias: { id: string; name: string }[]
    /** Cuántas cosas hay en cada opción de "Mostrar"; null mientras carga */
    conteos: Record<Mostrar, number> | null
    /** Cuántos productos quedan en la lista con lo elegido */
    cuantos: number
    onMostrar: (mostrar: Mostrar) => void
    onCategoria: (categoria: string | null) => void
    onQuitar: () => void
    onCerrar: () => void
}) {
    const conFiltro = mostrar !== 'todos' || categoria !== null
    return (
        <Sheet open={abierta} onClose={onCerrar} title="Filtrar" width={420} subir
            footer={
                <>
                    <button type="button" className="hj-cta" onClick={onCerrar}>
                        Ver {cuantos} {cuantos === 1 ? 'producto' : 'productos'}
                    </button>
                    {conFiltro && <button type="button" className="hj-texto" onClick={onQuitar}>Quitar filtros</button>}
                </>
            }>
            <style>{CSS}</style>
            <p className="hj-grupo">Mostrar</p>
            <div role="radiogroup" aria-label="Mostrar">
                {MOSTRAR.map(m => (
                    <button key={m} type="button" role="radio" aria-checked={mostrar === m} className="hj-opcion"
                        onClick={() => onMostrar(m)}>
                        <span>
                            {ETIQUETA_MOSTRAR[m]}
                            {m !== 'todos' && conteos && <span className="hj-cuenta">{conteos[m]}</span>}
                        </span>
                        {mostrar === m && <Marca />}
                    </button>
                ))}
            </div>

            {categorias.length > 0 && (
                <>
                    <p className="hj-grupo">Categoría</p>
                    <div className="hj-pildoras">
                        <button type="button" className="hj-pildora" aria-pressed={categoria === null} onClick={() => onCategoria(null)}>
                            Todas
                        </button>
                        {categorias.map(c => (
                            <button key={c.id} type="button" className="hj-pildora" aria-pressed={categoria === c.id}
                                onClick={() => onCategoria(c.id)}>
                                {c.name}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </Sheet>
    )
}

/* ── Compra sugerida ─────────────────────────────────────────── */

export function HojaCompraSugerida({ abierta, items, fuera, onAlternar, onCerrar }: {
    abierta: boolean
    /** Lo que está en su mínimo o se acabó, de menos a más stock */
    items: ParaReponer[]
    /** Lo que el dueño desmarcó (todo empieza marcado) */
    fuera: ReadonlySet<string>
    onAlternar: (llave: string) => void
    onCerrar: () => void
}) {
    const router = useRouter()
    const marcados = items.filter(item => !fuera.has(llaveDeSugerida(item)))
    const total = costoDelPedido(marcados)

    function irACompra() {
        if (marcados.length === 0) return
        router.push(guardarPedido(lineasDelPedido(marcados)))
    }

    return (
        <Sheet open={abierta} onClose={onCerrar} title="Compra sugerida" width={420} subir
            footer={
                <>
                    <div className="hj-total">
                        {marcados.length > 0 && total === 0
                            ? <span>Aún no sabemos cuánto cuestan</span>
                            : <><span>Te costaría unos</span><b>{formatCOP(Math.round(total))}</b></>}
                    </div>
                    <button type="button" className="hj-cta" disabled={marcados.length === 0} onClick={irACompra}>
                        Ir a nueva compra{marcados.length > 0 ? ` · ${marcados.length}` : ''}
                    </button>
                    <button type="button" className="hj-texto" onClick={onCerrar}>Cerrar</button>
                </>
            }>
            <style>{CSS}</style>
            <div>
                {items.map(item => {
                    const llave = llaveDeSugerida(item)
                    const marcado = !fuera.has(llave)
                    const nombre = nombreCompleto(item.title, item.subtitle)
                    return (
                        <button key={llave} type="button" role="checkbox" aria-checked={marcado} className="hj-fila"
                            onClick={() => onAlternar(llave)}>
                            <span className="hj-check"><Check size={13} strokeWidth={3} aria-hidden /></span>
                            <span className="hj-apaga" style={{ display: 'flex' }}><Thumb src={item.image} name={item.title} size={36} radius={10} /></span>
                            <span className="hj-nombre hj-apaga">{nombre}</span>
                            <span className="hj-cuantas hj-apaga">× {item.toOrder}</span>
                        </button>
                    )
                })}
            </div>
        </Sheet>
    )
}
