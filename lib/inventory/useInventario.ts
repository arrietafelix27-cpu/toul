'use client'

import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import {
    armarLista, costoDelPedido, cuantosPorMostrar, llavesQuietas, paraReponer,
    type FichaDeProducto, type ResumenInventario, type UnidadDeStock,
} from './calculos'

/* ══════════════════════════════════════════════════════════════
   Los datos de la pantalla de Inventario.
   Valor, mínimos, lo que falta y el estado de cada cosa los calcula
   la base (toul_inventory_overview y toul_estado_stock, la misma
   regla del Catálogo y de TOUL AI). Aquí solo se traen y se arman.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()

export interface Categoria { id: string; name: string }

export function useInventario(storeId: string | null) {
    // ── Valor, mínimos y lo que falta: lo calcula la base ──
    const { data: overview, error: overviewError, mutate: refreshOverview } = useSWR(
        storeId ? ['inventory-overview', storeId] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_inventory_overview', { p_limit: 120 })
            if (error) throw error
            return data as ResumenInventario
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    // ── Tus productos: cada cosa con su estado, la foto y la categoría ──
    // Llega entera: para ordenar por unidades o por lo más vendido hay que
    // tenerla toda. La pantalla la muestra de a poco
    const { data: lista, error: listaError, isLoading, mutate: refreshLista } = useSWR(
        storeId ? ['inventory-lista', storeId] : null,
        async () => {
            const [estadoRes, fichasRes, categoriasRes] = await Promise.all([
                supabase.rpc('toul_estado_stock'),
                supabase.from('products').select('id, images, image_url, category_id')
                    .eq('store_id', storeId!).eq('is_active', true),
                supabase.from('product_categories').select('id, name')
                    .eq('store_id', storeId!).order('name'),
            ])
            // Sin internet o con un error, la lista no se muestra vacía como si no hubiera nada
            if (estadoRes.error) throw estadoRes.error
            if (fichasRes.error) throw fichasRes.error
            if (categoriasRes.error) throw categoriasRes.error
            return {
                productos: armarLista((estadoRes.data ?? []) as UnidadDeStock[], (fichasRes.data ?? []) as FichaDeProducto[]),
                categorias: (categoriasRes.data ?? []) as Categoria[],
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const refresh = useCallback(() => { refreshOverview(); refreshLista() }, [refreshOverview, refreshLista])

    // ── Compra sugerida: lo que está en su mínimo o se acabó ──
    const reorder = useMemo(() => paraReponer(overview?.alerts ?? []), [overview])
    const totalSugerido = useMemo(() => costoDelPedido(reorder), [reorder])

    // ── Lo que está quieto, con la llave de la lista ──
    const quietos = useMemo(() => llavesQuietas(overview?.dormant ?? []), [overview])
    const conteos = useMemo(
        () => lista && overview ? cuantosPorMostrar(lista.productos, quietos) : null,
        [lista, overview, quietos],
    )

    return {
        overview,
        overviewError,
        lista,
        listaError,
        isLoading,
        reorder,
        totalSugerido,
        quietos,
        conteos,
        refresh,
    }
}
