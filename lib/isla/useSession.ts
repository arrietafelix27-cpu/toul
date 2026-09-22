'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { getSessionContext } from './context'
import type { CashSession } from './types'

const supabase = createClient()

// La caja tiene que abrir aunque no haya internet: la última respuesta buena
// queda guardada en el computador y se usa mientras vuelve la señal.
function remember<T>(key: string, value: T): T {
    try { localStorage.setItem('toul-cache:' + key, JSON.stringify(value)) } catch { /* sin almacenamiento */ }
    return value
}

function recall<T>(key: string): T | null {
    try {
        const raw = localStorage.getItem('toul-cache:' + key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch {
        return null
    }
}

/** Negocio, rol y nombre del usuario actual. */
export function useSessionContext() {
    return useSWR('isla-session-context', async () => {
        try {
            const ctx = await getSessionContext(supabase)
            return ctx ? remember('session-context', ctx) : ctx
        } catch (err) {
            const cached = recall<Awaited<ReturnType<typeof getSessionContext>>>('session-context')
            if (cached) return cached
            throw err
        }
    }, {
        revalidateOnFocus: false,
        dedupingInterval: 300_000,
    })
}

/** Turno de caja abierto del negocio (null si no hay). */
export function useOpenCashSession(storeId: string | null | undefined) {
    return useSWR(storeId ? ['isla-open-session', storeId] : null, async () => {
        try {
            const { data, error } = await supabase
                .from('cash_sessions')
                .select('*')
                .eq('store_id', storeId)
                .eq('status', 'open')
                .maybeSingle()
            if (error) throw error
            return remember('open-session:' + storeId, (data as CashSession | null) ?? null)
        } catch (err) {
            const cached = recall<CashSession | null>('open-session:' + storeId)
            if (cached !== null) return cached
            throw err
        }
    }, { revalidateOnFocus: true, refreshInterval: 60_000, keepPreviousData: true })
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
