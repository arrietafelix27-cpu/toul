'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { getSessionContext } from './context'
import type { CashSession } from './types'

const supabase = createClient()

/** Negocio, rol y nombre del usuario actual. */
export function useSessionContext() {
    return useSWR('isla-session-context', () => getSessionContext(supabase), {
        revalidateOnFocus: false,
        dedupingInterval: 300_000,
    })
}

/** Turno de caja abierto del negocio (null si no hay). */
export function useOpenCashSession(storeId: string | null | undefined) {
    return useSWR(storeId ? ['isla-open-session', storeId] : null, async () => {
        const { data, error } = await supabase
            .from('cash_sessions')
            .select('*')
            .eq('store_id', storeId)
            .eq('status', 'open')
            .maybeSingle()
        if (error) throw error
        return (data as CashSession | null) ?? null
    }, { revalidateOnFocus: true, refreshInterval: 60_000 })
}

/** Cantidad de solicitudes pendientes (solo administradores). */
export function usePendingApprovalsCount(enabled: boolean) {
    return useSWR(enabled ? 'isla-pending-approvals' : null, async () => {
        const { count, error } = await supabase
            .from('approval_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        if (error) return 0
        return count ?? 0
    }, { refreshInterval: 15_000, revalidateOnFocus: true })
}
