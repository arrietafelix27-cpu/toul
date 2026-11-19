'use client'

import { useMemo, useState } from 'react'
import type { POSDataState } from './usePOSData'
import type { POSCartState } from './usePOSCart'
import { normalizar } from './clientes'
import { unidadesDeLinea } from './stock'

/* ══════════════════════════════════════════════════════════════
   Lo que se ve en Nueva venta: productos y combos juntos, por
   categoría, con lo que más se vende primero y lo agotado siempre
   al final (diseno/pos/SPEC.md §4).
   Agregar al carrito no cambia el orden: así nadie pierde de vista
   lo que está tocando. Vender tampoco: "Más vendidos" se fija al
   entrar a la caja y no se reacomoda hasta la próxima vez que entres
   (un producto que se agota se queda en su sitio).
   ══════════════════════════════════════════════════════════════ */

export type Orden = 'vendidos' | 'recientes' | 'az' | 'precio-menor' | 'precio-mayor'
export type Filtro = 'todos' | 'individuales' | 'presentaciones' | 'combos'

export const ORDENES: { valor: Orden; texto: string }[] = [
    { valor: 'vendidos', texto: 'Más vendidos' },
    { valor: 'recientes', texto: 'Más recientes' },
    { valor: 'az', texto: 'Nombre (A–Z)' },
    { valor: 'precio-menor', texto: 'Menor precio' },
    { valor: 'precio-mayor', texto: 'Mayor precio' },
]

export const FILTROS: { valor: Filtro; texto: string }[] = [
    { valor: 'todos', texto: 'Todos los productos' },
    { valor: 'individuales', texto: 'Productos individuales' },
    { valor: 'presentaciones', texto: 'Con presentaciones' },
    { valor: 'combos', texto: 'Combos' },
]

export interface PresentacionCaja {
    id: string
    /** La línea del carrito: 'producto:presentación' */
    key: string
    nombre: string
    precio: number
    stock: number
    /** Su propio mínimo (null: no se sabe, no se avisa "Quedan N") */
    minimo: number | null
    enCarrito: number
}

export interface Entrada {
    tipo: 'producto' | 'combo'
    /** La línea del carrito: 'producto' o 'combo:id' (los de presentaciones van por presentación) */
    key: string
    id: string
    nombre: string
    referencia: string | null
    foto: string | null
    /** Con presentaciones: el más barato y el más caro */
    precio: number
    precioMax: number
    /** Lo que queda (combos: cuántos alcanzan a armarse) */
    stock: number
    /** El mínimo del producto (sin presentaciones). Combos y desconocidos: null */
    minimo: number | null
    agotado: boolean
    conPresentaciones: boolean
    presentaciones: PresentacionCaja[]
    /** Cuántos lleva el carrito (sumando presentaciones) */
    enCarrito: number
    categoriaId: string | null
    vendidos: number
    /** Cuándo se creó (para "Más recientes") */
    creado: number
    /** Lo buscado nombra una presentación ("carneguey 100"): se abre sola */
    abrePorBusqueda: boolean
}

export interface CategoriaCaja {
    id: string
    nombre: string
    tipo: 'todos' | 'categoria'
    foto: string | null
}

export const TODOS = 'todos'

type Base = Omit<Entrada, 'enCarrito' | 'presentaciones' | 'abrePorBusqueda'> & {
    presentaciones: Omit<PresentacionCaja, 'enCarrito'>[]
    /** Nombre, referencia y presentaciones, listos para buscar */
    buscable: string
}

const fecha = (v: unknown) => {
    const t = typeof v === 'string' ? Date.parse(v) : NaN
    return Number.isFinite(t) ? t : 0
}

export function useListaProductos(data: POSDataState, cart: POSCartState) {
    const [busqueda, setBusqueda] = useState('')
    const [categoria, setCategoria] = useState<string>(TODOS)
    const [orden, setOrden] = useState<Orden>('vendidos')
    const [filtro, setFiltro] = useState<Filtro>('todos')

    // Sin el carrito: así agregar no recalcula ni reordena la lista
    const base = useMemo<Base[]>(() => {
        const minimoDe = (id: string) => data.minimos?.[id] ?? null
        const productos = data.products.map((p): Base => {
            const vv = data.variantsByProduct[p.id] ?? []
            const con = vv.length > 0
            const precios = con ? vv.map(v => v.sale_price) : [p.sale_price]
            const stock = con ? vv.reduce((s, v) => s + Math.max(0, v.stock), 0) : Math.max(0, p.stock)
            const presentaciones = vv.map(v => ({
                id: v.id,
                key: `${p.id}:${v.id}`,
                nombre: v.name,
                precio: Math.round(v.sale_price),
                stock: Math.max(0, Math.round(v.stock)),
                minimo: minimoDe(v.id),
            }))
            return {
                tipo: 'producto',
                key: p.id,
                id: p.id,
                nombre: p.name,
                referencia: p.reference ?? null,
                foto: ((p.images?.[0] || p.image_url) as string | null) ?? null,
                precio: Math.round(Math.min(...precios)),
                precioMax: Math.round(Math.max(...precios)),
                stock: Math.round(stock),
                minimo: con ? null : minimoDe(p.id),
                agotado: stock <= 0,
                conPresentaciones: con,
                presentaciones,
                categoriaId: p.category_id ?? null,
                vendidos: data.sold[p.id] ?? 0,
                creado: fecha((p as { created_at?: unknown }).created_at),
                buscable: normalizar([p.name, p.reference ?? '', ...vv.map(v => v.name)].join(' ')),
            }
        })
        const combos = data.combos.map((c): Base => {
            const key = `combo:${c.id}`
            const piezas = Object.entries(unidadesDeLinea(key, data.combos))
            const alcanzan = piezas.length === 0 ? 0
                : Math.min(...piezas.map(([u, n]) => n > 0 ? Math.floor((data.stock[u] ?? 0) / n) : Infinity))
            const stock = Number.isFinite(alcanzan) ? Math.max(0, alcanzan) : 0
            return {
                tipo: 'combo',
                key,
                id: c.id,
                nombre: c.name,
                referencia: null,
                foto: c.image_url,
                precio: Math.round(c.sale_price),
                precioMax: Math.round(c.sale_price),
                stock,
                minimo: null,
                agotado: stock <= 0,
                conPresentaciones: false,
                presentaciones: [],
                categoriaId: c.category_id ?? null,
                vendidos: data.sold[key] ?? 0,
                creado: fecha(c.created_at),
                buscable: normalizar(c.name),
            }
        })
        return [...productos, ...combos]
    }, [data.products, data.variantsByProduct, data.combos, data.stock, data.sold, data.minimos])

    // El puesto de cada uno en "Más vendidos", fijado con lo primero que llega
    const [puestos, setPuestos] = useState<Map<string, number> | null>(null)
    if (puestos === null && base.length > 0) {
        const fijo = [...base].sort((a, b) =>
            Number(a.agotado) - Number(b.agotado) || b.vendidos - a.vendidos || a.nombre.localeCompare(b.nombre, 'es'))
        setPuestos(new Map(fijo.map((e, i) => [e.key, i])))
    }

    // Solo las categorías que tienen algo a la venta. La foto es la del más vendido
    const categorias = useMemo<CategoriaCaja[]>(() => {
        const conCosas = data.categories.filter(c => base.some(e => e.categoriaId === c.id))
        if (conCosas.length === 0) return []
        const out: CategoriaCaja[] = [{ id: TODOS, nombre: 'Todos', tipo: 'todos', foto: null }]
        for (const c of conCosas) {
            const foto = base
                .filter(e => e.categoriaId === c.id && e.foto)
                .sort((a, b) => b.vendidos - a.vendidos)[0]?.foto ?? null
            out.push({ id: c.id, nombre: c.name, tipo: 'categoria', foto })
        }
        return out
    }, [data.categories, base])

    // Si la categoría elegida ya no existe (se borró), vuelve a Todos
    const categoriaActiva = categoria === TODOS || categorias.some(c => c.id === categoria) ? categoria : TODOS

    const q = normalizar(busqueda)
    const palabras = useMemo(() => q.split(/\s+/).filter(Boolean), [q])
    const ordenadas = useMemo(() => {
        let lista = base
        // Lo que se escribe se busca en todo: quien busca un nombre no piensa en categorías.
        // Cada palabra tiene que estar (en el nombre, la referencia o una presentación)
        if (palabras.length) lista = lista.filter(e => palabras.every(w => e.buscable.includes(w)))
        else if (categoriaActiva !== TODOS) lista = lista.filter(e => e.categoriaId === categoriaActiva)

        if (filtro === 'individuales') lista = lista.filter(e => e.tipo === 'producto' && !e.conPresentaciones)
        else if (filtro === 'presentaciones') lista = lista.filter(e => e.conPresentaciones)
        else if (filtro === 'combos') lista = lista.filter(e => e.tipo === 'combo')

        const porNombre = (a: Base, b: Base) => a.nombre.localeCompare(b.nombre, 'es')
        const comparar = {
            vendidos: (a: Base, b: Base) => b.vendidos - a.vendidos || porNombre(a, b),
            recientes: (a: Base, b: Base) => b.creado - a.creado || porNombre(a, b),
            az: porNombre,
            'precio-menor': (a: Base, b: Base) => a.precio - b.precio || porNombre(a, b),
            'precio-mayor': (a: Base, b: Base) => b.precioMax - a.precioMax || porNombre(a, b),
        }[orden]
        // Lo agotado siempre al final
        const normal = (a: Base, b: Base) => Number(a.agotado) - Number(b.agotado) || comparar(a, b)
        if (orden !== 'vendidos' || !puestos) return [...lista].sort(normal)
        // "Más vendidos" con el puesto fijo; lo creado con la caja abierta va al final
        return [...lista].sort((a, b) => {
            const pa = puestos.get(a.key)
            const pb = puestos.get(b.key)
            if (pa !== undefined && pb !== undefined) return pa - pb
            if (pa !== undefined) return -1
            if (pb !== undefined) return 1
            return normal(a, b)
        })
    }, [base, categoriaActiva, palabras, filtro, orden, puestos])

    const entradas = useMemo<Entrada[]>(() => ordenadas.map(({ buscable: _b, presentaciones, ...e }) => {
        void _b
        const conCarrito = presentaciones.map(v => ({ ...v, enCarrito: cart.cartMap[v.key] || 0 }))
        const enCarrito = e.conPresentaciones
            ? conCarrito.reduce((s, v) => s + v.enCarrito, 0)
            : cart.cartMap[e.key] || 0
        const abrePorBusqueda = e.conPresentaciones && palabras.length > 0
            && palabras.some(w => presentaciones.some(v => normalizar(v.nombre).includes(w)))
        return { ...e, presentaciones: conCarrito, enCarrito, abrePorBusqueda }
    }), [ordenadas, cart.cartMap, palabras])

    return {
        busqueda, setBusqueda,
        categoria: categoriaActiva, setCategoria,
        orden, setOrden,
        filtro, setFiltro,
        categorias, entradas,
        vacio: base.length === 0,
    }
}
