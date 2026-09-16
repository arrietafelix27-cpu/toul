import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionContext } from './types'

/**
 * Resuelve negocio y rol del usuario autenticado (dueño o vendedor).
 *
 * Usa el RPC `toul_session_context` (migration_v10_isla). Si la migración
 * todavía no está aplicada, cae al comportamiento anterior: el dueño del
 * negocio como administrador. Así el código nuevo no rompe producción.
 */
export async function getSessionContext(supabase: SupabaseClient): Promise<SessionContext | null> {
    const { data, error } = await supabase.rpc('toul_session_context')

    if (!error) return (data as SessionContext | null) ?? null

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: store } = await supabase
        .from('stores')
        .select('id, name')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()

    if (!store) return null
    return { userId: user.id, storeId: store.id, storeName: store.name, role: 'admin', displayName: 'Administrador' }
}
