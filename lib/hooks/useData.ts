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
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        const { data } = await supabase.from('stores').select('id, name, appearance').eq('owner_id', user.id).single()
        return data
    }, { revalidateOnFocus: false, dedupingInterval: 3600000 }) // 1 hour cache
}
