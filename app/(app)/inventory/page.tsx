'use client'

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { animate, useReducedMotion } from 'framer-motion'
import { ArrowUpDown, Check, ChevronRight, ClipboardCheck, ListFilter, Search, ShoppingBag, SlidersHorizontal, X } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { ease } from '@/lib/motion'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { Thumb } from '@/components/ui/Thumb'
import { SinInternet } from '@/components/ui/SinInternet'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { InventoryRow, ROW_CSS } from '@/components/inventory/InventoryRow'
import { ETIQUETA_MOSTRAR, HojaCompraSugerida, HojaFiltrar, HojaOrdenar, PanelCompraSugerida } from '@/components/inventory/HojasInventario'
import { useInventario } from '@/lib/inventory/useInventario'
import { cuantosEnLista, textoCosto, verLista, type Mostrar, type Orden, type VistaDeLista } from '@/lib/inventory/calculos'

/* ══════════════════════════════════════════════════════════════
   Inventario.
   Menos letras, los números hablan: cuánto tienes en mercancía, qué
   te toca comprar y cada producto con su número de color. Lo demás
   vive en el detalle de cada producto.
   Ningún número se calcula aquí: salen de la base y de
   lib/inventory/calculos.ts.
   ══════════════════════════════════════════════════════════════ */

const POR_PAGINA = 40

const VISTA_INICIAL: VistaDeLista = { orden: 'nombre', mostrar: 'todos', categoria: null, busqueda: '' }

const CSS = ROW_CSS + `
.inv { position: relative; max-width: 760px; margin: 0 auto; padding: 24px 16px 96px; }
.inv-titulo { font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--toul-text); margin: 0; position: relative; }

/* ── La cifra y su interruptor ── */
.inv-top { margin-top: 22px; position: relative; }
.inv-etiqueta { font-size: 13px; color: var(--toul-text-subtle); margin: 0; }
.inv-cifra { font-size: 46px; font-weight: 700; letter-spacing: -2px; line-height: 1.05; margin: 4px 0 0;
    color: var(--toul-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.inv-seg { position: relative; display: inline-grid; grid-template-columns: 1fr 1fr; margin-top: 14px; padding: 3px;
    border-radius: 999px; background: var(--toul-surface); }
.inv-seg-pildora { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px); border-radius: 999px;
    background: var(--toul-accent); box-shadow: 0 2px 12px var(--toul-accent-glow);
    transition: transform 350ms cubic-bezier(0.23, 1, 0.32, 1); }
.inv-seg[data-venta="true"] .inv-seg-pildora { transform: translateX(100%); }
.inv-seg button { position: relative; z-index: 1; border: none; background: none; font: inherit; font-size: 12.5px;
    padding: 6px 13px; color: var(--toul-text-subtle); cursor: pointer; white-space: nowrap;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: color 200ms ease; }
.inv-seg button[aria-pressed="true"] { color: var(--toul-bg); font-weight: 600; }
.inv-seg button:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 999px; }

/* ── Tres acciones ── */
.inv-acciones { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 30px; }
.inv-accion { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0; border: none; background: none;
    font: inherit; font-size: 12px; color: color-mix(in srgb, var(--toul-text) 72%, transparent); text-decoration: none; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
.inv-circulo { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: color-mix(in srgb, var(--toul-text) 92%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--toul-text) 8.5%, transparent), color-mix(in srgb, var(--toul-text) 3.5%, transparent));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--toul-text) 7%, transparent);
    transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 200ms ease; }
.inv-accion:active .inv-circulo { transform: scale(0.92); }
.inv-accion:focus-visible { outline: none; }
.inv-accion:focus-visible .inv-circulo { box-shadow: inset 0 0 0 2px var(--toul-accent); }
@media (hover: hover) and (pointer: fine) {
    .inv-accion:hover .inv-circulo { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--toul-text) 14%, transparent); }
}

.inv-hr { height: 1px; background: var(--toul-divider); margin: 26px 0; border: none; }

/* ── Compra sugerida ── */
.inv-sug { display: flex; align-items: center; gap: 13px; width: 100%; padding: 0; border: none; background: none;
    font: inherit; color: var(--toul-text); text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: opacity 150ms ease; }
.inv-sug:active { opacity: 0.6; }
.inv-sug:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 4px; border-radius: 12px; }
.inv-pila { display: flex; flex-shrink: 0; }
.inv-pila > span { padding: 2px; border-radius: 12px; background: var(--toul-bg); margin-left: -10px; }
.inv-pila > span:first-child { margin-left: 0; }
.inv-sug-titulo { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
.inv-sug-linea { display: block; font-size: 12px; color: var(--toul-text-subtle); margin-top: 2px; font-variant-numeric: tabular-nums; }
.inv-ok { display: flex; align-items: center; gap: 9px; font-size: 14px; color: var(--toul-text-muted); margin: 0; }

/* ── Tus productos ── */
.inv-sub { font-size: 19px; font-weight: 700; letter-spacing: -0.4px; color: var(--toul-text); margin: 0 0 12px; }
.inv-tools { display: flex; gap: 8px; align-items: center; }
.inv-buscar { position: relative; flex: 1; min-width: 0; }
.inv-buscar svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--toul-text-dim); pointer-events: none; }
.inv-buscar input { width: 100%; height: 44px; border-radius: 14px; border: none; background: var(--toul-surface);
    color: var(--toul-text); font-family: inherit; font-size: 16px; padding: 0 14px 0 40px; outline: none;
    transition: box-shadow 200ms ease; }
.inv-buscar input:focus { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--toul-accent) 50%, transparent); }
.inv-buscar input::placeholder { color: var(--toul-text-dim); }
.inv-ib { width: 44px; height: 44px; border-radius: 14px; border: none; flex-shrink: 0; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    background: var(--toul-surface); color: color-mix(in srgb, var(--toul-text) 82%, transparent);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 200ms ease, color 200ms ease, box-shadow 200ms ease, transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.inv-ib:active { transform: scale(0.94); }
.inv-ib:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; }
.inv-ib[data-on="true"] { background: var(--toul-accent-dim); color: var(--toul-accent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--toul-accent) 40%, transparent); }
.inv-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.inv-chip { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; font-weight: 600;
    padding: 6px 9px 6px 12px; border-radius: 999px; border: none; cursor: pointer;
    background: var(--toul-accent-dim); color: var(--toul-accent);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.inv-chip:active { transform: scale(0.96); }
.inv-lista { margin-top: 6px; }
.inv-vacio { font-size: 14px; color: var(--toul-text-dim); text-align: center; padding: 36px 0; margin: 0; }
.inv-mas { width: 100%; margin-top: 12px; height: 44px; border-radius: 14px; cursor: pointer; font-family: inherit;
    background: transparent; border: 1px dashed var(--toul-border); color: var(--toul-text-dim); font-size: 13px; font-weight: 500; }

/* Pantallas medianas: una sola columna centrada; arriba la cifra a la izquierda y las acciones a la derecha */
@media (min-width: 768px) {
    .inv { padding: 36px 40px 64px; }
    .inv-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
    .inv-acciones { display: flex; gap: 28px; margin: 0 0 4px; }
}

/* ── PC (desde 1240px: Inventario tiene 1000px al lado del menú) ──
   Dos columnas. A la izquierda la cifra, las acciones y Compra
   sugerida abierta; a la derecha "Tus productos" como tabla */
.inv-sug-pc, .inv-th { display: none; }
@media (min-width: 1240px) {
    .inv { max-width: 1164px; padding: 36px 32px 64px; }
    .inv-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 40px; align-items: start; }
    .inv-top { display: block; }
    .inv-acciones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 28px 0 0; }
    .inv-sug-movil, .inv-hr-movil { display: none; }
    .inv-sug-pc { display: block; }
    .inv-der { padding-top: 10px; }

    .inv-th { display: grid; grid-template-columns: minmax(0, 1fr) 76px 150px 124px; gap: 12px; align-items: end;
        padding: 16px 0 8px; margin-bottom: 4px; border-bottom: 1px solid var(--toul-divider);
        font-size: 12px; color: var(--toul-text-subtle); }
    .inv-th span:not(:first-child) { text-align: right; }
    .inv-tabla .ivr { display: grid; grid-template-columns: minmax(0, 1fr) 76px 150px 124px; gap: 12px;
        padding-top: 7px; padding-bottom: 7px; border-radius: 12px; }
    .inv-tabla .ivr-num { justify-content: flex-end; margin-left: 0; }
    .inv-tabla .ivr-dato { display: block; }
    /* Las presentaciones, metidas bajo su producto; los números siguen en su columna */
    .inv-tabla .ivr-hijos { margin: 0 0 4px 31px; padding-left: 0; }
    .inv-tabla .ivr-hijos .ivr { width: calc(100% + 10px); margin-left: 0; padding-top: 7px; padding-bottom: 7px;
        border-radius: 0 12px 12px 0; }
}
/* La columna izquierda se queda fija al bajar solo si cabe entera
   (mide unos 740px con 5 productos y "Ver los N"): en una pantalla
   bajita, el botón verde quedaría escondido */
@media (min-width: 1240px) and (min-height: 800px) {
    .inv-izq { position: sticky; top: 24px; }
}

@media (prefers-reduced-motion: reduce) {
    .inv-seg-pildora, .inv-circulo, .inv-ib, .inv-chip { transition: none; }
}
`

export default function InventoryPage() {
    const { data: store, error: storeError, mutate: recargarTienda } = useStore()
    const storeId = store?.id || null
    const {
        overview, overviewError, lista, listaError, isLoading, reorder, totalSugerido, quietos, conteos, refresh,
    } = useInventario(storeId)
    const reintentar = useCallback(() => { recargarTienda(); refresh() }, [recargarTienda, refresh])

    // A costo o a precio de venta: el mismo inventario visto de dos formas
    const [aVenta, setAVenta] = useState(false)
    const [adjustOpen, setAdjustOpen] = useState(false)
    const [vista, setVista] = useState<VistaDeLista>(VISTA_INICIAL)
    const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set())
    const [limite, setLimite] = useState(POR_PAGINA)
    // Las filas entran escalonadas al llegar y al cambiar de filtro u orden;
    // al escribir en el buscador o abrir un producto, no
    const [animar, setAnimar] = useState(true)
    const [ronda, setRonda] = useState(0)
    const [hoja, setHoja] = useState<'ordenar' | 'filtrar' | 'sugerida' | null>(null)
    // Compra sugerida: todo empieza marcado; aquí va lo que se desmarca
    const [fuera, setFuera] = useState<Set<string>>(() => new Set())

    const cambiarVista = useCallback((cambio: Partial<VistaDeLista>) => {
        setVista(v => ({ ...v, ...cambio }))
        setLimite(POR_PAGINA)
        setAnimar(true)
        setRonda(r => r + 1)
    }, [])
    const buscar = useCallback((busqueda: string) => {
        setVista(v => ({ ...v, busqueda }))
        setLimite(POR_PAGINA)
        setAnimar(false)
    }, [])
    const alternar = useCallback((productId: string) => {
        setAnimar(false)
        setAbiertos(prev => {
            const next = new Set(prev)
            if (next.has(productId)) next.delete(productId); else next.add(productId)
            return next
        })
    }, [])
    const cerrarAjuste = useCallback(() => setAdjustOpen(false), [])

    const cerrarHoja = useCallback(() => setHoja(null), [])
    const abrirSugerida = useCallback(() => { setFuera(new Set()); setHoja('sugerida') }, [])
    // En PC la hoja se abre desde el panel con lo mismo que ya se marcó ahí
    const verTodasSugeridas = useCallback(() => setHoja('sugerida'), [])
    const alternarSugerida = useCallback((llave: string) => {
        setFuera(prev => {
            const next = new Set(prev)
            if (next.has(llave)) next.delete(llave); else next.add(llave)
            return next
        })
    }, [])
    // Ordenar se aplica y se cierra; en Filtrar se ve la lista cambiar detrás
    const elegirOrden = useCallback((orden: Orden) => { cambiarVista({ orden }); setHoja(null) }, [cambiarVista])
    const elegirMostrar = useCallback((mostrar: Mostrar) => cambiarVista({ mostrar }), [cambiarVista])
    const elegirCategoria = useCallback((categoria: string | null) => cambiarVista({ categoria }), [cambiarVista])
    const quitarFiltros = useCallback(() => cambiarVista({ mostrar: 'todos', categoria: null }), [cambiarVista])

    const resultado = useMemo(
        () => lista ? verLista(lista.productos, vista, quietos) : null,
        [lista, vista, quietos],
    )

    // Sin los números de la base no se muestra nada que parezca real.
    // Si ya había datos y solo falló una actualización, se siguen viendo
    if ((storeError && !store) || (overviewError && !overview) || (listaError && !lista)) {
        return <SinInternet onRetry={reintentar} que="tu inventario" />
    }

    const conFiltro = vista.mostrar !== 'todos' || vista.categoria !== null
    const nombreCategoria = vista.categoria ? lista?.categorias.find(c => c.id === vista.categoria)?.name ?? 'Categoría' : null

    return (
        <div className="inv">
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="inv-grid">
                <div className="inv-izq">
                    <h1 className="inv-titulo">Inventario</h1>

                    {/* ── Tienes en mercancía ── */}
                    <div className="inv-top">
                        <div>
                            <p className="inv-etiqueta">Tienes en mercancía</p>
                            {overview ? (
                                <>
                                    <p className="inv-cifra">
                                        <Cifra valor={aVenta ? overview.retailValue : overview.value} aVenta={aVenta} />
                                    </p>
                                    <div className="inv-seg" data-venta={aVenta}>
                                        <span className="inv-seg-pildora" aria-hidden />
                                        <button type="button" aria-pressed={!aVenta} onClick={() => setAVenta(false)}>A costo</button>
                                        <button type="button" aria-pressed={aVenta} onClick={() => setAVenta(true)}>A precio de venta</button>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
                                    <Skeleton height="46px" width="230px" className="rounded-xl" />
                                    <Skeleton height="31px" width="200px" className="rounded-full" />
                                </div>
                            )}
                        </div>

                        <div className="inv-acciones">
                            <Link href="/inventory/purchase" className="inv-accion">
                                <span className="inv-circulo"><ShoppingBag size={22} strokeWidth={1.6} /></span>
                                Comprar
                            </Link>
                            <Link href="/inventory/conteo" className="inv-accion">
                                <span className="inv-circulo"><ClipboardCheck size={22} strokeWidth={1.6} /></span>
                                Contar
                            </Link>
                            <button type="button" className="inv-accion" onClick={() => setAdjustOpen(true)}>
                                <span className="inv-circulo"><SlidersHorizontal size={22} strokeWidth={1.6} /></span>
                                Ajustar
                            </button>
                        </div>
                    </div>

                    <hr className="inv-hr" />

                    {/* ── Compra sugerida: en PC abierta; en celular, una fila que abre la hoja ── */}
                    <div className="inv-sug-pc">
                        {!overview ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Skeleton height="26px" width="180px" className="rounded-lg" />
                                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="36px" className="rounded-xl" />)}
                            </div>
                        ) : (
                            <PanelCompraSugerida items={reorder} fuera={fuera} onAlternar={alternarSugerida} onVerTodas={verTodasSugeridas} />
                        )}
                    </div>
                    <div className="inv-sug-movil">
                        {!overview ? (
                            <Skeleton height="36px" className="rounded-xl" />
                        ) : reorder.length === 0 ? (
                            <p className="inv-ok">
                                <Check size={18} strokeWidth={2} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} />
                                No te falta nada
                            </p>
                        ) : (
                            <button type="button" className="inv-sug" onClick={abrirSugerida}>
                                <span className="inv-pila" aria-hidden>
                                    {reorder.slice(0, 3).map(item => (
                                        <span key={`${item.kind}-${item.id}`}><Thumb src={item.image} name={item.title} size={32} radius={10} /></span>
                                    ))}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span className="inv-sug-titulo">Compra sugerida</span>
                                    <span className="inv-sug-linea">
                                        {reorder.length} {reorder.length === 1 ? 'producto' : 'productos'}
                                        {totalSugerido > 0 ? ` · ${formatCOP(Math.round(totalSugerido))}` : ''}
                                    </span>
                                </span>
                                <ChevronRight size={18} strokeWidth={1.8} style={{ color: 'var(--toul-text-dim)', flexShrink: 0 }} />
                            </button>
                        )}
                    </div>
                </div>

                <hr className="inv-hr inv-hr-movil" />

                {/* ── Tus productos: en PC, una tabla ── */}
                <section className="inv-der">
                    <h2 className="inv-sub">Tus productos</h2>
                    <div className="inv-tools">
                        <div className="inv-buscar">
                            <Search size={17} strokeWidth={1.8} />
                            <input type="search" placeholder="¿Lo tienes? Búscalo aquí" value={vista.busqueda}
                                enterKeyHint="search" autoComplete="off" aria-label="Buscar producto"
                                onChange={event => buscar(event.target.value)} />
                        </div>
                        <button type="button" className="inv-ib" aria-label="Ordenar" data-on={vista.orden !== 'nombre'}
                            onClick={() => setHoja('ordenar')}>
                            <ArrowUpDown size={19} strokeWidth={1.8} />
                        </button>
                        <button type="button" className="inv-ib" aria-label="Filtrar" data-on={conFiltro}
                            onClick={() => setHoja('filtrar')}>
                            <ListFilter size={19} strokeWidth={2} />
                        </button>
                    </div>

                    {/* Con un filtro puesto se ve cuál es, para que nadie crea que se le perdieron productos */}
                    {conFiltro && (
                        <div className="inv-chips">
                            {vista.mostrar !== 'todos' && (
                                <button type="button" className="inv-chip" onClick={() => cambiarVista({ mostrar: 'todos' })}
                                    aria-label={`Quitar filtro ${ETIQUETA_MOSTRAR[vista.mostrar]}`}>
                                    {ETIQUETA_MOSTRAR[vista.mostrar]} <X size={13} strokeWidth={2.4} />
                                </button>
                            )}
                            {nombreCategoria && (
                                <button type="button" className="inv-chip" onClick={() => cambiarVista({ categoria: null })}
                                    aria-label={`Quitar filtro ${nombreCategoria}`}>
                                    {nombreCategoria} <X size={13} strokeWidth={2.4} />
                                </button>
                            )}
                        </div>
                    )}

                    {isLoading || !resultado || !lista ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="50px" className="rounded-2xl" />)}
                        </div>
                    ) : lista.productos.length === 0 ? (
                        <p className="inv-vacio">Todavía no tienes productos.</p>
                    ) : cuantosEnLista(resultado) === 0 ? (
                        <p className="inv-vacio">{vista.busqueda.trim() ? 'No encontramos nada con eso.' : 'No hay productos con este filtro.'}</p>
                    ) : (
                        <div className="inv-tabla">
                            <div className="inv-th" aria-hidden>
                                <span>Producto</span><span>Unidades</span><span>Costo c/u</span><span>Plata en el producto</span>
                            </div>
                            <div key={ronda} className={`inv-lista ivr-lista${animar ? ' an' : ''}`}>
                                {resultado.agrupada
                                    ? resultado.productos.slice(0, limite).map((producto, i) => producto.conPresentaciones ? (
                                        <div key={producto.id}>
                                            <InventoryRow onClick={() => alternar(producto.id)} image={producto.imagen} name={producto.nombre}
                                                presentaciones={producto.unidades.length} stock={producto.stock} estado={producto.estado}
                                                abierto={abiertos.has(producto.id)} delay={i}
                                                costo={textoCosto(producto.costoMin, producto.costoMax, formatCOP)} plata={formatCOP(producto.plata)} />
                                            {abiertos.has(producto.id) && (
                                                <div className="ivr-hijos">
                                                    {producto.unidades.map(u => (
                                                        <InventoryRow key={u.key} href={u.href} name={u.presentacion ?? u.nombre}
                                                            stock={u.stock} estado={u.estado} hijo
                                                            costo={formatCOP(u.costo)} plata={formatCOP(u.plata)} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <InventoryRow key={producto.id} href={producto.unidades[0].href} image={producto.imagen}
                                            name={producto.nombre} stock={producto.stock} estado={producto.estado} delay={i}
                                            costo={formatCOP(producto.unidades[0].costo)} plata={formatCOP(producto.plata)} />
                                    ))
                                    : resultado.unidades.slice(0, limite).map((u, i) => (
                                        <InventoryRow key={u.key} href={u.href} image={u.imagen} name={u.nombre}
                                            stock={u.stock} estado={u.estado} delay={i}
                                            costo={formatCOP(u.costo)} plata={formatCOP(u.plata)} />
                                    ))}
                            </div>
                            {cuantosEnLista(resultado) > limite && (
                                <button type="button" className="inv-mas" onClick={() => { setAnimar(false); setLimite(l => l + POR_PAGINA) }}>
                                    Ver más productos
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {storeId && (
                <StockAdjustSheet open={adjustOpen} storeId={storeId} onClose={cerrarAjuste} onDone={refresh} />
            )}

            <HojaOrdenar abierta={hoja === 'ordenar'} orden={vista.orden} onElegir={elegirOrden} onCerrar={cerrarHoja} />
            <HojaFiltrar abierta={hoja === 'filtrar'} mostrar={vista.mostrar} categoria={vista.categoria}
                categorias={lista?.categorias ?? []} conteos={conteos} cuantos={resultado ? cuantosEnLista(resultado) : 0}
                onMostrar={elegirMostrar} onCategoria={elegirCategoria} onQuitar={quitarFiltros} onCerrar={cerrarHoja} />
            <HojaCompraSugerida abierta={hoja === 'sugerida'} items={reorder} fuera={fuera}
                onAlternar={alternarSugerida} onCerrar={cerrarHoja} />
        </div>
    )
}

/** La cifra cuenta desde cero la primera vez y, al cambiar el interruptor,
 *  de un valor al otro en medio segundo. Si solo se recargaron los datos,
 *  salta directo: un número que vuelve a contar en cada recarga distrae */
function Cifra({ valor, aVenta }: { valor: number; aVenta: boolean }) {
    const ref = useRef<HTMLSpanElement>(null)
    const mostrado = useRef<number | null>(null)
    const modo = useRef(aVenta)
    const reduce = useReducedMotion()

    useLayoutEffect(() => {
        const node = ref.current
        if (!node) return
        const pintar = (v: number) => { node.textContent = formatCOP(Math.round(v)); mostrado.current = v }
        const cambioDeModo = modo.current !== aVenta
        modo.current = aVenta
        const desde = mostrado.current
        if (reduce || (desde !== null && !cambioDeModo)) { pintar(valor); return }
        const animacion = animate(desde ?? 0, valor, { duration: 0.5, ease: ease.out, onUpdate: pintar })
        return () => animacion.stop()
    }, [valor, aVenta, reduce])

    return <span ref={ref}>{formatCOP(0)}</span>
}
