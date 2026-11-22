'use client'

import { memo, useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { POSDataState } from '@/lib/pos/usePOSData'
import { FILTROS, ORDENES, TODOS, type CategoriaCaja, type Entrada, type Filtro, type Orden } from '@/lib/pos/useListaProductos'
import { formatCOP } from '@/lib/utils'
import s from '@/components/pos/ui/pos.module.css'
import {
    BotonIcono, CampoBusqueda, Chevron, Desplegable, FilaPresentacion, IcoFiltrar, IcoOrdenar, Menu, Paso,
    avisoStock, cx, useRebote,
} from '@/components/pos/ui'

/* ══════════════════════════════════════════════════════════════
   Nueva venta: los productos (diseno/pos/SPEC.md §4 y §10).
   Celular: renglones; los de presentaciones se abren en su sitio.
   PC: tarjetas; las de presentaciones abren una ventana (la maneja Caja).
   Al abrir la caja entran en cascada; al cambiar de categoría, filtro u
   orden, otra vez (sin esperar).
   ══════════════════════════════════════════════════════════════ */

export interface ListaProductos {
    busqueda: string
    setBusqueda: (v: string) => void
    categoria: string
    setCategoria: (v: string) => void
    orden: Orden
    setOrden: (v: Orden) => void
    filtro: Filtro
    setFiltro: (v: Filtro) => void
    categorias: CategoriaCaja[]
    entradas: Entrada[]
    vacio: boolean
}

/** Cambia la cantidad de una línea del carrito (la caja recorta al stock y avisa) */
export type Cambiar = (key: string, cantidad: number, nombre: string) => void

const inicial = (nombre: string) => nombre.trim().charAt(0).toUpperCase() || '·'

export function Productos({ lista, data, narrow, onCambiar, onTocar, buscadorRef, listaRef, esAdmin, salir, conexion, inicioCascada, enEspera }: {
    lista: ListaProductos
    data: POSDataState
    narrow: boolean
    onCambiar: Cambiar
    /** Tocar la foto (PC) o Enter en el buscador: agrega uno o abre las presentaciones */
    onTocar: (e: Entrada) => void
    buscadorRef: RefObject<HTMLInputElement | null>
    /** La parte que se desplaza: vuelve arriba en cada venta nueva */
    listaRef: RefObject<HTMLDivElement | null>
    esAdmin: boolean
    /** La X (solo el administrador tiene a dónde volver) */
    salir: ReactNode
    /** "Sin conexión" y compañía, cuando aplica */
    conexion: ReactNode
    /** Hora (performance.now) en que empieza la cascada al abrir la caja */
    inicioCascada: number
    /** Mientras corre la gota: solo el marco. La lista entra cuando la gota termina */
    enEspera?: boolean
}) {
    const { busqueda, setBusqueda, categoria, setCategoria, categorias, entradas, orden, setOrden, filtro, setFiltro } = lista
    const [menu, setMenu] = useState<'filtrar' | 'ordenar' | null>(null)
    // Las presentaciones abiertas (celular)
    const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set())

    // En PC se puede escribir de una. En el celular no: abrir el teclado
    // apenas entra tapaba media pantalla
    useEffect(() => {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
        const t = setTimeout(() => buscadorRef.current?.focus({ preventScroll: true }), 300)
        return () => clearTimeout(t)
    }, [buscadorRef])

    const alternar = useCallback((id: string) => {
        setAbiertos(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    // Celular: tocar uno con presentaciones lo abre; lo demás lo decide la caja
    const tocar = useCallback((e: Entrada) => {
        if (e.agotado) return
        if (narrow && e.conPresentaciones) { setAbiertos(prev => new Set(prev).add(e.id)); return }
        onTocar(e)
    }, [narrow, onTocar])

    const cerrarMenu = useCallback(() => setMenu(null), [])
    const elegirCategoria = useCallback((id: string) => { setBusqueda(''); setCategoria(id) }, [setBusqueda, setCategoria])

    const buscador = (
        <div style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: narrow ? undefined : 560 }}>
            <CampoBusqueda
                ref={buscadorRef}
                valor={busqueda}
                onCambiar={setBusqueda}
                etiqueta="Buscar producto"
                alto={narrow ? 50 : 52}
                onKeyDown={e => {
                    // Enter con algo escrito agrega el primero que se puede vender (como un lector)
                    if (e.key === 'Enter' && busqueda.trim()) {
                        e.preventDefault()
                        const primero = entradas.find(x => !x.agotado)
                        if (!primero) return
                        tocar(primero)
                        // Con presentaciones se abren: el teclado sale del buscador
                        if (primero.conPresentaciones) e.currentTarget.blur()
                        else setBusqueda('')
                    }
                    if (e.key === 'Escape' && busqueda) { e.preventDefault(); e.stopPropagation(); setBusqueda('') }
                }}
            />
            {!narrow && !busqueda && <span className={s.tecla} aria-hidden="true" style={{ position: 'absolute', right: 8, top: 14, pointerEvents: 'none' }}>/</span>}
        </div>
    )

    const botones = (
        <>
            <Menu abierto={menu === 'filtrar'} onCerrar={cerrarMenu} titulo="Tipo de producto"
                opciones={FILTROS} elegida={filtro} onElegir={setFiltro}>
                <BotonIcono aria-label="Filtrar productos" aria-expanded={menu === 'filtrar'}
                    activo={menu === 'filtrar' || filtro !== 'todos'} punto={filtro !== 'todos'}
                    onClick={() => setMenu(m => m === 'filtrar' ? null : 'filtrar')}>
                    <IcoFiltrar />
                </BotonIcono>
            </Menu>
            <Menu abierto={menu === 'ordenar'} onCerrar={cerrarMenu} titulo="Ordenar por"
                opciones={ORDENES} elegida={orden} onElegir={setOrden}>
                <BotonIcono aria-label="Ordenar productos" aria-expanded={menu === 'ordenar'}
                    activo={menu === 'ordenar' || orden !== 'vendidos'} punto={orden !== 'vendidos'}
                    onClick={() => setMenu(m => m === 'ordenar' ? null : 'ordenar')}>
                    <IcoOrdenar />
                </BotonIcono>
            </Menu>
        </>
    )

    const cats = categorias.length > 0 && (
        <div className={cx(s.cats, !narrow && s.pcCats)} role="tablist" aria-label="Categorías">
            {categorias.map(c => (
                <Circulo key={c.id} c={c} activo={!busqueda && c.id === categoria} onElegir={elegirCategoria} />
            ))}
        </div>
    )

    // Cada vez que cambia la categoría, el filtro o el orden, la cascada vuelve a empezar
    const grupo = `${categoria}|${filtro}|${orden}`
    const contenido = enEspera || data.failed === 'products' ? null
        : data.isLoading ? <Esqueleto narrow={narrow} />
        : lista.vacio ? (
            <Vacio titulo="Todavía no hay productos" texto={esAdmin ? 'Agrégalos en Inventario.' : 'Pídele al administrador que los agregue.'} />
        ) : entradas.length === 0 ? (
            busqueda.trim()
                ? <p className={s.sinResultados}>Sin resultados para esta búsqueda</p>
                : <Vacio titulo={filtro !== 'todos' ? 'Nada con este filtro' : 'Nada en esta categoría'}
                    texto={filtro !== 'todos' ? 'Elige otro tipo de producto.' : categoria !== TODOS ? 'Elige otra categoría.' : ''} />
        ) : (
            <Cascada key={grupo} inicio={inicioCascada} narrow={narrow}>
                {entradas.map((e, i) => narrow
                    ? <Renglon key={e.key} e={e} i={i} abierto={abiertos.has(e.id) || e.abrePorBusqueda} onAlternar={alternar} onCambiar={onCambiar} />
                    : <Tarjeta key={e.key} e={e} i={i} onTocar={tocar} onCambiar={onCambiar} />)}
            </Cascada>
        )

    // ── Celular ──────────────────────────────────────────────────
    if (narrow) {
        return (
            <div className={s.productos}>
                <div className={s.cabeza}>
                    {salir ?? <span />}
                    {conexion}
                </div>
                <div className={s.buscador}>{buscador}{botones}</div>
                {cats}
                <div ref={listaRef} className={s.lista}>
                    {data.failed && <AvisoCarga que={data.failed} onRetry={data.retry} />}
                    {contenido}
                </div>
            </div>
        )
    }

    // ── PC: toda la columna se desplaza ──────────────────────────
    return (
        <div ref={listaRef} className={s.pcIzq}>
            <div className={s.pcCabeza}>
                {salir}
                {buscador}
                {botones}
                <span className={s.pcConexion}>{conexion}</span>
            </div>
            {cats}
            {data.failed && <div style={{ marginTop: 18 }}><AvisoCarga que={data.failed} onRetry={data.retry} /></div>}
            {contenido}
        </div>
    )
}

/* ── La cascada: cada uno entra 34 ms (28 en PC) después del anterior ── */
function Cascada({ inicio, narrow, children }: { inicio: number; narrow: boolean; children: ReactNode }) {
    // Al abrir la caja espera a la gota (o al zoom); después, ya
    const [base, setBase] = useState(() => Math.max(0, Math.round(inicio - performance.now())))
    // Terminada la cascada, lo que aparece al buscar no espera
    useEffect(() => {
        if (base === 0) return
        const t = setTimeout(() => setBase(0), base + 600)
        return () => clearTimeout(t)
    }, [base])
    return (
        <div className={cx(s.cascada, !narrow && s.rejilla)} style={{ ['--base' as string]: `${base}ms` }}>
            {children}
        </div>
    )
}

/* ── Lo que dice debajo del nombre: precio y stock ─────────────── */
function Precio({ e }: { e: Entrada }) {
    if (e.conPresentaciones) {
        return <>Desde {formatCOP(Math.round(e.precio))}{e.agotado && <span data-tono="agotado"> · Agotado</span>}</>
    }
    // Sin mínimo conocido (combos, o si no llegó) solo se avisa "Agotado"
    const aviso = avisoStock(e.stock, e.minimo ?? -1)
    return <>{formatCOP(Math.round(e.precio))}{aviso && <span data-tono={aviso.tono}> · {aviso.texto}</span>}</>
}

function Ficha({ e, className }: { e: Entrada; className?: string }) {
    return (
        <span className={className ?? s.ficha} aria-hidden="true">
            {e.foto ? <img src={e.foto} alt="" loading="lazy" draggable={false} /> : inicial(e.nombre)}
        </span>
    )
}

/* ── Celular: un renglón ───────────────────────────────────────── */
const Renglon = memo(function Renglon({ e, i, abierto, onAlternar, onCambiar }: {
    e: Entrada
    i: number
    abierto: boolean
    onAlternar: (id: string) => void
    onCambiar: Cambiar
}) {
    const rebote = useRebote(e.enCarrito)
    const agotadoSinNada = e.agotado && e.enCarrito === 0
    return (
        <div className={s.renglon} style={{ ['--i' as string]: i }}>
            <div className={cx(s.renglonCuerpo, agotadoSinNada && s.apagado)}>
                <Ficha e={e} />
                <div className={s.renglonTexto}>
                    <div className={s.renglonNombre}>
                        <span>{e.nombre}</span>
                        {e.tipo === 'combo' && <span className={s.etiqueta}>Combo</span>}
                    </div>
                    <div className={s.renglonSub}><Precio e={e} /></div>
                </div>
                {e.conPresentaciones ? (
                    !e.agotado && (
                        <button type="button" className={s.vbtn} data-on={abierto ? '1' : undefined} data-hay={e.enCarrito > 0 ? '1' : undefined}
                            aria-expanded={abierto} aria-label={`Ver presentaciones de ${e.nombre}`} onClick={() => onAlternar(e.id)}>
                            {e.enCarrito > 0 && <span className={cx(s.vn, rebote === 0 && s.pasoA, rebote === 1 && s.pasoB)}>{e.enCarrito}</span>}
                            <Chevron abierto={abierto} size={16} />
                        </button>
                    )
                ) : !agotadoSinNada && (
                    <Paso cantidad={e.enCarrito} nombre={e.nombre} onCambiar={n => onCambiar(e.key, n, e.nombre)} />
                )}
            </div>
            {e.conPresentaciones && (
                <Desplegable abierto={abierto}>
                    <div className={s.vlist}>
                        {e.presentaciones.map((v, j) => (
                            <FilaPresentacion key={v.id} indice={j} nombre={v.nombre} precio={v.precio} stock={v.stock}
                                minimo={v.minimo ?? -1} cantidad={v.enCarrito}
                                onCambiar={n => onCambiar(v.key, n, `${e.nombre} · ${v.nombre}`)} />
                        ))}
                    </div>
                </Desplegable>
            )}
        </div>
    )
})

/* ── PC: una tarjeta ───────────────────────────────────────────── */
const Tarjeta = memo(function Tarjeta({ e, i, onTocar, onCambiar }: {
    e: Entrada
    i: number
    onTocar: (e: Entrada) => void
    onCambiar: Cambiar
}) {
    const agotadoSinNada = e.agotado && e.enCarrito === 0
    const n = e.presentaciones.length
    return (
        <div className={s.celda} style={{ ['--i' as string]: i }}>
            <div className={cx(s.tarjeta, agotadoSinNada && s.apagado)} data-en={e.enCarrito > 0 ? '1' : undefined}>
                <button type="button" className={s.tarjetaImagen} onClick={() => onTocar(e)} disabled={e.agotado}
                    aria-label={e.conPresentaciones ? `Elegir presentación de ${e.nombre}` : `Agregar ${e.nombre}`}>
                    {e.foto ? <img src={e.foto} alt="" loading="lazy" draggable={false} /> : <span className={s.tarjetaInicial}>{inicial(e.nombre)}</span>}
                    {e.tipo === 'combo' && <span className={s.ctag}>Combo</span>}
                    <Cuenta n={e.enCarrito} />
                    {e.conPresentaciones && <span className={s.cvar}>{n === 1 ? '1 presentación' : `${n} presentaciones`}</span>}
                </button>
                <div className={s.tarjetaCuerpo}>
                    <div className={s.tarjetaNombre}>{e.nombre}</div>
                    <div className={s.tarjetaFila}>
                        <div className={s.tarjetaPrecio}><Precio e={e} /></div>
                        {!e.conPresentaciones && !agotadoSinNada && (
                            <Paso cantidad={e.enCarrito} nombre={e.nombre} onCambiar={c => onCambiar(e.key, c, e.nombre)} />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
})

/** El número verde sobre la foto: aparece con un salto y rebota al cambiar */
function Cuenta({ n }: { n: number }) {
    const r = useRebote(n)
    if (n <= 0) return null
    return <span className={cx(s.cuenta, r === 0 && s.cuentaA, r === 1 && s.cuentaB)} aria-label={`${n} en la venta`}>{n}</span>
}

/* ── Círculo de categoría: foto del más vendido o la inicial ───── */
function Circulo({ c, activo, onElegir }: { c: CategoriaCaja; activo: boolean; onElegir: (id: string) => void }) {
    return (
        <button type="button" role="tab" aria-selected={activo} className={s.cat} data-on={activo ? '1' : undefined} onClick={() => onElegir(c.id)}>
            <span className={s.circ}>
                {c.tipo === 'todos' ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="4" y="4" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
                        <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
                    </svg>
                ) : c.foto ? (
                    <span className={s.circFoto}><img src={c.foto} alt="" loading="lazy" draggable={false} /></span>
                ) : inicial(c.nombre)}
            </span>
            <span className={s.catNombre}>{c.nombre}</span>
        </button>
    )
}

function Vacio({ titulo, texto }: { titulo: string; texto: string }) {
    return (
        <div style={{ padding: '56px 12px', textAlign: 'center' }}>
            <p className={s.vacioTitulo}>{titulo}</p>
            {texto && <p className={s.vacioTexto}>{texto}</p>}
        </div>
    )
}

/* ── Mientras cargan los productos: su forma, no un spinner ──── */
function Esqueleto({ narrow }: { narrow: boolean }) {
    if (narrow) {
        return (
            <div aria-hidden>
                {Array.from({ length: 7 }, (_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 0' }}>
                        <span className="skeleton" style={{ width: 58, height: 58, borderRadius: 18, flexShrink: 0 }} />
                        <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span className="skeleton" style={{ height: 14, width: '58%', borderRadius: 6 }} />
                            <span className="skeleton" style={{ height: 13, width: '32%', borderRadius: 6 }} />
                        </span>
                    </div>
                ))}
            </div>
        )
    }
    return (
        <div className={s.rejilla} aria-hidden>
            {Array.from({ length: 8 }, (_, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span className="skeleton" style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 24 }} />
                    <span className="skeleton" style={{ height: 14, width: '64%', borderRadius: 6 }} />
                    <span className="skeleton" style={{ height: 13, width: '38%', borderRadius: 6 }} />
                </div>
            ))}
        </div>
    )
}

/* ── No cargó la caja y no hay copia guardada en el equipo ───── */
function AvisoCarga({ que, onRetry }: { que: 'products' | 'other'; onRetry: () => void }) {
    return (
        <div role="alert" className={s.nota} style={{ marginTop: 0, marginBottom: 14 }}>
            <span className={s.notaTexto}>
                {que === 'products' ? 'No se pudieron cargar los productos.' : 'No se pudieron cargar los métodos de pago y los clientes.'} Revisa la conexión.
            </span>
            <button type="button" className={s.notaBoton} onClick={onRetry}>Reintentar</button>
        </div>
    )
}
