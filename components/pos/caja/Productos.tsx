'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, ArrowUpDown, LayoutGrid, Layers, Plus, AlertTriangle, RefreshCw, X, Check, ChevronRight } from 'lucide-react'
import type { POSDataState } from '@/lib/pos/usePOSData'
import type { POSCartState } from '@/lib/pos/usePOSCart'
import { ORDENES, TODOS, type CategoriaCaja, type Entrada, type Orden } from '@/lib/pos/useListaProductos'
import { EASE_OUT_EMIL } from '@/components/ui'
import { Foto, Contador, Cantidad, precioDe } from './piezas'

/* Al cambiar de categoría los productos entran en cascada (35 ms entre
   uno y otro). Con CSS: cientos de tarjetas con Motion pesan */
const CSS = `
@keyframes cj-entra { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
.cj-cascada > * { animation: cj-entra 320ms var(--toul-ease-emil) both; animation-delay: calc(min(var(--i), 16) * 35ms); }
.cj-grilla { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px 14px; }
@media (max-width: 1240px) { .cj-grilla { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.cj-circulo-anillo { transition: box-shadow 220ms var(--toul-ease-emil); }
@media (prefers-reduced-motion: reduce) {
    @keyframes cj-entra { from { opacity: 0; } to { opacity: 1; } }
}
`

export interface ListaProductos {
    busqueda: string
    setBusqueda: (v: string) => void
    categoria: string
    setCategoria: (v: string) => void
    orden: Orden
    setOrden: (v: Orden) => void
    categorias: CategoriaCaja[]
    entradas: Entrada[]
    titulo: string
    vacio: boolean
}

export function Productos({ lista, data, cart, narrow, onAgregar, onQuitar, buscadorRef, esAdmin }: {
    lista: ListaProductos
    data: POSDataState
    cart: POSCartState
    narrow: boolean
    onAgregar: (e: Entrada) => void
    onQuitar: (key: string) => void
    buscadorRef: RefObject<HTMLInputElement | null>
    esAdmin: boolean
}) {
    const { busqueda, setBusqueda, categoria, setCategoria, categorias, entradas, titulo } = lista

    // En PC se puede escribir de una. En el celular no: abrir el teclado
    // apenas entra tapaba media pantalla
    useEffect(() => {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
        const t = setTimeout(() => buscadorRef.current?.focus(), 300)
        return () => clearTimeout(t)
    }, [buscadorRef])

    const pad = narrow ? 16 : 24

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <style>{CSS}</style>

            {/* ── Buscar y ordenar ─────────────────────────────── */}
            <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: `${narrow ? 12 : 20}px ${pad}px 0` }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Search size={18} strokeWidth={2} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                    <input
                        ref={buscadorRef}
                        type="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
                        aria-label="Buscar por nombre o referencia"
                        placeholder={narrow ? 'Buscar producto' : 'Buscar por nombre o referencia'}
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        onKeyDown={e => {
                            // Enter con algo escrito agrega el primero que aparece (como un lector)
                            if (e.key === 'Enter' && busqueda.trim()) {
                                e.preventDefault()
                                const primero = entradas.find(x => !x.agotado)
                                if (primero) { onAgregar(primero); if (!primero.conPresentaciones) setBusqueda('') }
                            }
                            if (e.key === 'Escape' && busqueda) { e.preventDefault(); e.stopPropagation(); setBusqueda('') }
                        }}
                        className="cj-campo"
                        style={{ height: 50, paddingLeft: 44, paddingRight: busqueda ? 44 : narrow ? 14 : 48, borderRadius: 16 }}
                    />
                    {busqueda ? (
                        <button type="button" onClick={() => { setBusqueda(''); buscadorRef.current?.focus() }} aria-label="Borrar búsqueda" className="cj-btn"
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={15} />
                        </button>
                    ) : !narrow && (
                        <kbd aria-hidden style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: 7,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', fontSize: 13,
                            color: 'var(--toul-text-dim)', background: 'var(--toul-surface-2)',
                        }}>/</kbd>
                    )}
                </div>
                <Ordenar orden={lista.orden} onChange={lista.setOrden} />
            </div>

            {/* ── Categorías ───────────────────────────────────── */}
            {categorias.length > 0 && (
                <div className="cj-scroll-x" role="tablist" aria-label="Categorías"
                    style={{ flexShrink: 0, display: 'flex', gap: 6, padding: `14px ${pad - 6}px 2px` }}>
                    {categorias.map(c => (
                        <Circulo key={c.id} c={c} activo={c.id === categoria} onClick={() => setCategoria(c.id)} />
                    ))}
                </div>
            )}

            {/* ── Productos ────────────────────────────────────── */}
            <div className="cj-scroll-y" style={{ flex: 1, minHeight: 0, padding: `14px ${pad}px ${narrow ? 24 : 32}px` }}>
                {data.failed && <AvisoCarga que={data.failed} onRetry={data.retry} />}
                {data.failed === 'products' ? null : data.isLoading ? <Esqueleto narrow={narrow} /> : lista.vacio ? (
                    <Vacio titulo="Todavía no hay productos" texto={esAdmin ? 'Agrégalos en Productos, en el panel del administrador.' : 'Pídele al administrador que los agregue.'} />
                ) : entradas.length === 0 ? (
                    <Vacio titulo={busqueda ? `No encontramos "${busqueda.trim()}"` : 'Nada en esta categoría'}
                        texto={categoria !== TODOS ? 'Puede estar en otra categoría.' : 'Revisa cómo se escribe o busca por la referencia.'}
                        accion={categoria !== TODOS ? { label: 'Buscar en todas', onClick: () => setCategoria(TODOS) } : undefined} />
                ) : (<>
                    <h2 style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 14px' }}>{titulo}</h2>
                    {narrow ? (
                        <div key={categoria} className="cj-cascada" style={{ display: 'flex', flexDirection: 'column' }}>
                            {entradas.map((e, i) => (
                                <Fila key={e.key} e={e} i={i}
                                    puedeMas={!e.conPresentaciones && cart.canAdd(e.key)}
                                    onAgregar={() => onAgregar(e)} onQuitar={() => onQuitar(e.key)} />
                            ))}
                        </div>
                    ) : (
                        <div key={categoria} className="cj-grilla cj-cascada">
                            {entradas.map((e, i) => <Tarjeta key={e.key} e={e} i={i} onAgregar={() => onAgregar(e)} />)}
                        </div>
                    )}
                </>)}
            </div>
        </div>
    )
}

/* ── El stock, en palabras ───────────────────────────────────────── */
function Stock({ e }: { e: Entrada }) {
    if (e.agotado) return <span style={{ color: 'var(--toul-text-dim)' }}>Agotado</span>
    if (e.stock <= 3) return <span style={{ color: 'var(--toul-warning)' }}>Quedan {e.stock}</span>
    return <span>{e.stock} disponibles</span>
}

/* ── PC: foto cuadrada, nombre, precio y stock ───────────────────── */
function Tarjeta({ e, i, onAgregar }: { e: Entrada; i: number; onAgregar: () => void }) {
    return (
        <button type="button" onClick={onAgregar} disabled={e.agotado} className="cj-btn cj-press cj-tarjeta"
            aria-label={`${e.nombre}, ${precioDe(e.precio, e.precioMax)}${e.enCarrito ? `, ${e.enCarrito} en la venta` : ''}`}
            style={{
                ['--i' as string]: i, display: 'flex', flexDirection: 'column', gap: 0, padding: 0, textAlign: 'left',
                background: 'transparent', color: 'inherit', minWidth: 0, opacity: e.agotado ? 0.32 : 1,
            }}>
            <span style={{ position: 'relative', display: 'block', width: '100%' }}>
                <Foto src={e.foto} combo={e.tipo === 'combo'} tamaño="100%" radio={16} className="cj-tarjeta-foto" />
                <Contador n={e.enCarrito} style={{ top: 8, right: 8 }} />
                {e.tipo === 'combo' && (
                    <span style={{
                        position: 'absolute', left: 8, bottom: 8, height: 24, padding: '0 9px', borderRadius: 999,
                        display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600,
                        background: 'rgba(10,10,10,0.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', color: 'var(--toul-text)',
                    }}>
                        <Layers size={12} /> Combo
                    </span>
                )}
            </span>
            <span style={{
                marginTop: 10, fontSize: 14.5, fontWeight: 550, lineHeight: 1.3, color: 'var(--toul-text)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{e.nombre}</span>
            <span className="cj-num" style={{ marginTop: 4, fontSize: 15, fontWeight: 650, color: 'var(--toul-text)' }}>{precioDe(e.precio, e.precioMax)}</span>
            <span style={{ marginTop: 2, fontSize: 12.5, color: 'var(--toul-text-subtle)' }}><Stock e={e} /></span>
        </button>
    )
}

/* ── Celular: filas con foto de 54px, y − n + cuando ya va en la venta ── */
function Fila({ e, i, puedeMas, onAgregar, onQuitar }: { e: Entrada; i: number; puedeMas: boolean; onAgregar: () => void; onQuitar: () => void }) {
    return (
        <div role="button" tabIndex={e.agotado ? -1 : 0} aria-disabled={e.agotado || undefined}
            onClick={() => { if (!e.agotado && (e.conPresentaciones || e.enCarrito === 0)) onAgregar() }}
            onKeyDown={ev => { if (ev.key === ' ') { ev.preventDefault(); if (!e.agotado) onAgregar() } }}
            className="cj-press-suave"
            style={{
                ['--i' as string]: i, display: 'flex', alignItems: 'center', gap: 14, minHeight: 74, padding: '10px 0',
                borderBottom: '1px solid var(--toul-divider)', opacity: e.agotado ? 0.32 : 1,
                pointerEvents: e.agotado ? 'none' : 'auto', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation',
                transition: 'transform 140ms var(--toul-ease-emil)',
            }}>
            <span style={{ position: 'relative', flexShrink: 0 }}>
                <Foto src={e.foto} combo={e.tipo === 'combo'} tamaño={54} radio={14} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 550, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre}</span>
                    {e.tipo === 'combo' && <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--toul-text-muted)', background: 'var(--toul-surface-2)', borderRadius: 999, padding: '2px 7px' }}>Combo</span>}
                </span>
                <span className="cj-num" style={{ display: 'block', marginTop: 2, fontSize: 15, fontWeight: 650, color: 'var(--toul-text)' }}>{precioDe(e.precio, e.precioMax)}</span>
                <span style={{ display: 'block', marginTop: 1, fontSize: 12.5, color: 'var(--toul-text-subtle)' }}><Stock e={e} /></span>
            </span>
            {e.conPresentaciones ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {e.enCarrito > 0 && <span className="cj-num" style={{ fontSize: 14, fontWeight: 650, color: 'var(--toul-accent)' }}>{e.enCarrito}</span>}
                    <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-surface-2)', color: 'var(--toul-text)' }}>
                        {e.enCarrito > 0 ? <ChevronRight size={18} /> : <Plus size={18} strokeWidth={2.4} />}
                    </span>
                </span>
            ) : e.enCarrito > 0 ? (
                <Cantidad n={e.enCarrito} onMenos={onQuitar} onMas={onAgregar} puedeMas={puedeMas} grande etiqueta={e.nombre} />
            ) : (
                <span aria-hidden style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-surface-2)', color: 'var(--toul-text)' }}>
                    <Plus size={18} strokeWidth={2.4} />
                </span>
            )}
        </div>
    )
}

/* ── Círculo de categoría: foto o ícono, y el anillo blanco si está elegida ── */
function Circulo({ c, activo, onClick }: { c: CategoriaCaja; activo: boolean; onClick: () => void }) {
    const Icono = c.tipo === 'todos' ? LayoutGrid : c.tipo === 'combos' ? Layers : null
    return (
        <button type="button" role="tab" aria-selected={activo} onClick={onClick} className="cj-btn cj-press"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 74, flexShrink: 0, padding: '4px 0', background: 'transparent' }}>
            <span className="cj-circulo-anillo" style={{
                width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: activo ? 'var(--toul-surface-2)' : 'var(--toul-surface)',
                color: activo ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                boxShadow: activo ? '0 0 0 2px var(--toul-bg), 0 0 0 4px var(--toul-text)' : '0 0 0 2px var(--toul-bg), 0 0 0 4px transparent',
            }}>
                {Icono ? <Icono size={21} strokeWidth={1.8} />
                    : c.foto ? <img src={c.foto} alt="" loading="lazy" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ fontSize: 19, fontWeight: 650 }}>{c.nombre.trim().charAt(0).toUpperCase()}</span>}
            </span>
            <span style={{
                maxWidth: '100%', fontSize: 12.5, fontWeight: activo ? 600 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: activo ? 'var(--toul-text)' : 'var(--toul-text-subtle)', transition: 'color 200ms ease',
            }}>{c.nombre}</span>
        </button>
    )
}

/* ── Ordenar: el botón pequeño junto al buscador ─────────────────── */
function Ordenar({ orden, onChange }: { orden: Orden; onChange: (o: Orden) => void }) {
    const [abierto, setAbierto] = useState(false)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!abierto) return
        const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) } }
        window.addEventListener('pointerdown', fuera)
        window.addEventListener('keydown', tecla, true)
        return () => { window.removeEventListener('pointerdown', fuera); window.removeEventListener('keydown', tecla, true) }
    }, [abierto])

    const cambiado = orden !== 'vendidos'
    return (
        <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
            <button type="button" onClick={() => setAbierto(a => !a)} aria-label="Ordenar productos" aria-expanded={abierto} className="cj-btn cj-press"
                style={{
                    width: 50, height: 50, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: abierto ? 'var(--toul-surface-2)' : 'var(--toul-surface)',
                    color: cambiado ? 'var(--toul-text)' : 'var(--toul-text-muted)', position: 'relative',
                }}>
                <ArrowUpDown size={18} />
                {cambiado && <span aria-hidden style={{ position: 'absolute', top: 11, right: 11, width: 6, height: 6, borderRadius: '50%', background: 'var(--toul-accent)' }} />}
            </button>
            <AnimatePresence>
                {abierto && (
                    <motion.div role="menu"
                        initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.16, ease: EASE_OUT_EMIL }}
                        style={{
                            position: 'absolute', right: 0, top: 58, zIndex: 30, width: 200, padding: 6, borderRadius: 16, transformOrigin: 'top right',
                            background: 'var(--toul-surface-overlay)', border: '1px solid var(--toul-border)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                        }}>
                        {ORDENES.map(o => (
                            <button key={o.key} type="button" role="menuitemradio" aria-checked={o.key === orden} className="cj-btn"
                                onClick={() => { onChange(o.key); setAbierto(false) }}
                                style={{
                                    width: '100%', height: 42, padding: '0 12px', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: o.key === orden ? 'var(--toul-surface-2)' : 'transparent', color: 'var(--toul-text)', fontSize: 14, fontWeight: o.key === orden ? 600 : 500,
                                }}>
                                {o.label}
                                {o.key === orden && <Check size={15} />}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion?: { label: string; onClick: () => void } }) {
    return (
        <div style={{ padding: '56px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{titulo}</p>
            <p style={{ fontSize: 14, color: 'var(--toul-text-subtle)', margin: '6px 0 0' }}>{texto}</p>
            {accion && (
                <button type="button" onClick={accion.onClick} className="cj-btn cj-chip" style={{ marginTop: 16 }}>{accion.label}</button>
            )}
        </div>
    )
}

/* ── Mientras cargan los productos: su forma, no un spinner ──── */
function Esqueleto({ narrow }: { narrow: boolean }) {
    if (narrow) {
        return (
            <div aria-hidden style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="skeleton" style={{ height: 16, width: 150, borderRadius: 6, marginBottom: 18 }} />
                {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 74 }}>
                        <span className="skeleton" style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0 }} />
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span className="skeleton" style={{ height: 13, width: '62%', borderRadius: 6 }} />
                            <span className="skeleton" style={{ height: 12, width: '34%', borderRadius: 6 }} />
                        </span>
                    </div>
                ))}
            </div>
        )
    }
    return (
        <div aria-hidden>
            <span className="skeleton" style={{ display: 'block', height: 16, width: 170, borderRadius: 6, marginBottom: 18 }} />
            <div className="cj-grilla">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <span className="skeleton" style={{ width: '100%', aspectRatio: '1', borderRadius: 16 }} />
                        <span className="skeleton" style={{ height: 13, width: '70%', borderRadius: 6 }} />
                        <span className="skeleton" style={{ height: 13, width: '40%', borderRadius: 6 }} />
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ── No cargó la caja y no hay copia guardada en el equipo ───── */
function AvisoCarga({ que, onRetry }: { que: 'products' | 'other'; onRetry: () => void }) {
    return (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0 18px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--toul-error)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-error)' }}>
                    {que === 'products' ? 'No se pudieron cargar los productos' : 'No se pudieron cargar los métodos de pago y los clientes'}
                </span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-subtle)', marginTop: 2 }}>Revisa el internet y vuelve a intentar.</span>
            </span>
            <button type="button" onClick={onRetry} className="cj-btn cj-chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={14} /> Reintentar
            </button>
        </div>
    )
}
