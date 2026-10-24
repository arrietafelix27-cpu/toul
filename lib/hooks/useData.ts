import useSWR, { SWRConfiguration } from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/**
 * fetcher — generic supabase fetcher
 * key is [table, storeId, filters?]
 */
const fetcher = async ([table, storeId, options]: [string, string, any]) => {
    if (!storeId) return null
    let query = supabase.from(table).select(options?.select || '*').eq('store_id', storeId)

    if (options?.eq) {
        Object.entries(options.eq).forEach(([k, v]) => {
            query = query.eq(k, v)
        })
    }

    if (options?.order) {
        query = query.order(options.order.column, { ascending: options.order.ascending ?? true })
    }

    if (options?.limit) {
        query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) throw error
    return data
}

/**
 * useToulData — Standard hook for fetching store-isolated data with caching.
 */
export function useToulData<T>(table: string, storeId: string | null, options?: any, config?: SWRConfiguration) {
    return useSWR<T[]>(
        storeId ? [table, storeId, options] : null,
        fetcher as any,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute cache for nav
            ...config
        }
    )
}

/**
 * useStore — helper to get the current store ID cached
 */
export function useStore() {
    return useSWR('current-store', async () => {
        // Quién es sale de la sesión guardada en el equipo, sin preguntarle a
        // Supabase (getUser tardaba una espera completa al abrir la app). El
        // servidor ya verificó la sesión en el middleware, y las reglas de la
        // base de datos solo devuelven el negocio de quien de verdad es.
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user.id
        if (!userId) return null
        const { data } = await supabase.from('stores').select('id, name, appearance, plan').eq('owner_id', userId).single()
        return data
    // Antes se recordaba una hora sin volver a preguntar: si cambiabas de
    // cuenta dentro de esa hora, la app seguía creyendo que eras la tienda
    // anterior. Ahora se pregunta como todo lo demás.
    }, { revalidateOnFocus: false })
}
