'use client'

import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import {
    diasQueAguanta, filasDeFiltro, limpiarBusqueda, paraReponer, presentacionesPorProducto, textoContar,
    type Filtro, type PresentacionEstante, type ProductoEstante, type ResumenInventario,
} from './calculos'

/* ══════════════════════════════════════════════════════════════
   Los datos de la pantalla de Inventario.
   Valor, mínimos y lo que falta los calcula la base; aquí solo se
   traen, se arma la lista y se cuentan los días que aguanta.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()
const PAGE_SIZE = 40
const VACIAS: PresentacionEstante[] = []

export function useInventario(storeId: string | null) {
    const [search, setSearchState] = useState('')
    const [filtro, setFiltro] = useState<Filtro>('todo')
    const [limit, setLimit] = useState(PAGE_SIZE)

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

    // Cuánto dura la bodega al ritmo al que sale la mercancía
    const daysLeft = useMemo(
        () => overview ? diasQueAguanta(overview.units, overview.soldUnits30) : null,
        [overview],
    )

    const { data: lastCount } = useSWR(
        storeId ? ['last-count', storeId] : null,
        async () => {
            const { data } = await supabase.from('inventory_counts')
                .select('applied_at').eq('store_id', storeId!).eq('status', 'applied')
                .order('applied_at', { ascending: false }).limit(1).maybeSingle()
            return data?.applied_at as string | undefined
        },
        { revalidateOnFocus: false },
    )

    // ── La bodega ──
    const { data: shelf, error: shelfError, isLoading, mutate: refreshShelf } = useSWR(
        storeId ? ['inventory-shelf', storeId, search, limit] : null,
        async () => {
            let query = supabase.from('products')
                .select('id, name, reference, image_url, images, stock, cpp')
                .eq('store_id', storeId!).eq('is_active', true).order('name').limit(limit + 1)
            // Busca por nombre, referencia o presentación ("XL" trae la camisa que la tiene).
            // Se limpian las comas, paréntesis y comodines que rompen el filtro
            const texto = limpiarBusqueda(search)
            if (texto) {
                const { data: conTalla, error: errorTalla } = await supabase.from('product_variants')
                    .select('product_id').eq('store_id', storeId!).eq('is_active', true).ilike('name', `%${texto}%`).limit(200)
                if (errorTalla) throw errorTalla
                const ids = [...new Set((conTalla ?? []).map(v => v.product_id as string))]
                query = query.or([
                    `name.ilike.%${texto}%`,
                    `reference.ilike.%${texto}%`,
                    ...(ids.length > 0 ? [`id.in.(${ids.join(',')})`] : []),
                ].join(','))
            }

            const [productsRes, variantsRes] = await Promise.all([
                query,
                supabase.from('product_variants')
                    .select('id, product_id, name, stock, cpp')
                    .eq('store_id', storeId!).eq('is_active', true).order('name'),
            ])
            // Sin internet o con un error, la lista no se muestra vacía como si no hubiera nada
            if (productsRes.error) throw productsRes.error
            if (variantsRes.error) throw variantsRes.error
            const rows = (productsRes.data ?? []) as ProductoEstante[]
            return {
                products: rows.slice(0, limit),
                hasMore: rows.length > limit,
                variants: (variantsRes.data ?? []) as PresentacionEstante[],
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const refresh = useCallback(() => { refreshOverview(); refreshShelf() }, [refreshOverview, refreshShelf])

    // Buscar vuelve a empezar la lista desde los primeros 40
    const setSearch = useCallback((texto: string) => { setSearchState(texto); setLimit(PAGE_SIZE) }, [])
    const verMas = useCallback(() => setLimit(l => l + PAGE_SIZE), [])

    // ── Lo que hay que pedir ──
    const reorder = useMemo(() => paraReponer(overview?.alerts ?? []), [overview])

    // ── La lista, según el filtro ──
    const filtered = useMemo(() => filasDeFiltro(overview, filtro, search, formatCOP), [filtro, overview, search])

    const porProducto = useMemo(() => presentacionesPorProducto(shelf?.variants ?? []), [shelf])
    const variantsOf = useCallback((productId: string) => porProducto.get(productId) ?? VACIAS, [porProducto])

    return {
        overview,
        overviewError,
        daysLeft,
        textoContar: textoContar(lastCount),
        shelf,
        shelfError,
        isLoading,
        reorder,
        filtered,
        variantsOf,
        search,
        setSearch,
        filtro,
        setFiltro,
        verMas,
        refresh,
    }
}
