'use client'

import { useMemo, useState } from 'react'
import type { POSDataState } from './usePOSData'
import type { POSCartState } from './usePOSCart'
import { normalizar } from './clientes'
import { unidadesDeLinea } from './stock'

/* ══════════════════════════════════════════════════════════════
   Lo que se ve en "Vender": productos y combos juntos, por
   categoría, con lo que más se vende primero y lo agotado al final.
   Agregar al carrito no cambia el orden: así nadie pierde de vista
   lo que está tocando.
   ══════════════════════════════════════════════════════════════ */

export type Orden = 'vendidos' | 'az' | 'stock' | 'precio-menor' | 'precio-mayor'

export const ORDENES: { key: Orden; label: string }[] = [
    { key: 'vendidos', label: 'Más vendidos' },
    { key: 'az', label: 'A → Z' },
    { key: 'stock', label: 'Más stock' },
    { key: 'precio-menor', label: 'Precio menor' },
    { key: 'precio-mayor', label: 'Precio mayor' },
]

export interface Entrada {
    tipo: 'producto' | 'combo'
    /** La línea del carrito: 'producto' o 'combo:id' (los de presentaciones abren la hoja) */
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
    agotado: boolean
    conPresentaciones: boolean
    /** Cuántos lleva el carrito (sumando presentaciones) */
    enCarrito: number
    categoriaId: string | null
    vendidos: number
}

export interface CategoriaCaja {
    id: string
    nombre: string
    tipo: 'todos' | 'categoria' | 'combos'
    foto: string | null
}

export const TODOS = 'todos'
export const COMBOS = 'combos'

export function useListaProductos(data: POSDataState, cart: POSCartState) {
    const [busqueda, setBusqueda] = useState('')
    const [categoria, setCategoria] = useState<string>(TODOS)
    const [orden, setOrden] = useState<Orden>('vendidos')

    // Sin el carrito: así agregar no recalcula ni reordena la lista
    const base = useMemo<Omit<Entrada, 'enCarrito'>[]>(() => {
        const productos = data.products.map(p => {
            const vv = data.variantsByProduct[p.id] ?? []
            const con = vv.length > 0
            const precios = con ? vv.map(v => v.sale_price) : [p.sale_price]
            const stock = con ? vv.reduce((s, v) => s + Math.max(0, v.stock), 0) : Math.max(0, p.stock)
            return {
                tipo: 'producto' as const,
                key: p.id,
                id: p.id,
                nombre: p.name,
                referencia: p.reference ?? null,
                foto: ((p.images?.[0] || p.image_url) as string | null) ?? null,
                precio: Math.round(Math.min(...precios)),
                precioMax: Math.round(Math.max(...precios)),
                stock,
                agotado: stock <= 0,
                conPresentaciones: con,
                categoriaId: p.category_id ?? null,
                vendidos: data.sold[p.id] ?? 0,
            }
        })
        const combos = data.combos.map(c => {
            const key = `combo:${c.id}`
            const piezas = Object.entries(unidadesDeLinea(key, data.combos))
            const alcanzan = piezas.length === 0 ? 0
                : Math.min(...piezas.map(([u, n]) => n > 0 ? Math.floor((data.stock[u] ?? 0) / n) : Infinity))
            const stock = Number.isFinite(alcanzan) ? Math.max(0, alcanzan) : 0
            return {
                tipo: 'combo' as const,
                key,
                id: c.id,
                nombre: c.name,
                referencia: null,
                foto: c.image_url,
                precio: Math.round(c.sale_price),
                precioMax: Math.round(c.sale_price),
                stock,
                agotado: stock <= 0,
                conPresentaciones: false,
                categoriaId: c.category_id ?? null,
                vendidos: data.sold[key] ?? 0,
            }
        })
        return [...productos, ...combos]
    }, [data.products, data.variantsByProduct, data.combos, data.stock, data.sold])

    // Solo las categorías que tienen algo a la venta. La foto es la del más vendido
    const categorias = useMemo<CategoriaCaja[]>(() => {
        const out: CategoriaCaja[] = []
        const conCosas = data.categories.filter(c => base.some(e => e.categoriaId === c.id))
        const hayCombos = base.some(e => e.tipo === 'combo')
        if (conCosas.length === 0 && !hayCombos) return out
        out.push({ id: TODOS, nombre: 'Todos', tipo: 'todos', foto: null })
        for (const c of conCosas) {
            const foto = base
                .filter(e => e.categoriaId === c.id && e.foto)
                .sort((a, b) => b.vendidos - a.vendidos)[0]?.foto ?? null
            out.push({ id: c.id, nombre: c.name, tipo: 'categoria', foto })
        }
        if (hayCombos) out.push({ id: COMBOS, nombre: 'Combos', tipo: 'combos', foto: null })
        return out
    }, [data.categories, base])

    // Si la categoría elegida ya no existe (se borró), vuelve a Todos
    const categoriaActiva = categoria === TODOS || categorias.some(c => c.id === categoria) ? categoria : TODOS

    const q = normalizar(busqueda)
    const ordenadas = useMemo(() => {
        let lista = base
        // Lo que se escribe se busca en todo: quien busca un nombre no piensa en categorías
        if (q) lista = lista.filter(e => normalizar(e.nombre).includes(q) || (e.referencia && normalizar(e.referencia).includes(q)))
        else if (categoriaActiva === COMBOS) lista = lista.filter(e => e.tipo === 'combo')
        else if (categoriaActiva !== TODOS) lista = lista.filter(e => e.categoriaId === categoriaActiva)

        const porNombre = (a: typeof lista[number], b: typeof lista[number]) => a.nombre.localeCompare(b.nombre, 'es')
        const comparar = {
            vendidos: (a: typeof lista[number], b: typeof lista[number]) => b.vendidos - a.vendidos || porNombre(a, b),
            az: porNombre,
            stock: (a: typeof lista[number], b: typeof lista[number]) => b.stock - a.stock || porNombre(a, b),
            'precio-menor': (a: typeof lista[number], b: typeof lista[number]) => a.precio - b.precio || porNombre(a, b),
            'precio-mayor': (a: typeof lista[number], b: typeof lista[number]) => b.precioMax - a.precioMax || porNombre(a, b),
        }[orden]
        // Lo agotado siempre al final
        return [...lista].sort((a, b) => Number(a.agotado) - Number(b.agotado) || comparar(a, b))
    }, [base, categoriaActiva, q, orden])

    const entradas = useMemo<Entrada[]>(() => ordenadas.map(e => {
        let enCarrito = 0
        if (e.conPresentaciones) {
            for (const v of data.variantsByProduct[e.id] ?? []) enCarrito += cart.cartMap[`${e.id}:${v.id}`] || 0
        } else {
            enCarrito = cart.cartMap[e.key] || 0
        }
        return { ...e, enCarrito }
    }), [ordenadas, data.variantsByProduct, cart.cartMap])

    const hayVentas = base.some(e => e.vendidos > 0)
    const titulo = q ? `${entradas.length} ${entradas.length === 1 ? 'resultado' : 'resultados'}`
        : categoriaActiva === COMBOS ? 'Combos'
        : categoriaActiva !== TODOS ? (categorias.find(c => c.id === categoriaActiva)?.nombre ?? 'Productos')
        : orden === 'vendidos' && hayVentas ? 'Lo que más vendes'
        : 'Todos los productos'

    return {
        busqueda, setBusqueda,
        categoria: categoriaActiva, setCategoria,
        orden, setOrden,
        categorias, entradas, titulo,
        vacio: base.length === 0,
    }
}
