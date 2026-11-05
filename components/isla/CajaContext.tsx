'use client'

import { createContext, useContext } from 'react'
import type { KeyedMutator } from 'swr'
import type { CashSession, SessionContext } from '@/lib/isla/types'
import type { OfflineState } from '@/lib/isla/useOffline'
import type { CachedStoreInfo } from '@/lib/isla/offline'
import type { PermisosVendedor } from '@/lib/pos/permisos'

export type BotonesComprobante = 'whatsapp' | 'tirilla' | 'ambos'

export interface CajaContextValue {
    ctx: SessionContext
    /** El turno abierto de la tienda. En el plan Básico no hay turnos: siempre null */
    session: CashSession | null
    sessionLoading: boolean
    refreshSession: KeyedMutator<CashSession | null>
    autoPrint: boolean
    /** Plan Pro: turnos de caja, equipo y aprobaciones */
    isPro: boolean
    /** Lo que puede hacer quien vende (el administrador, todo) */
    permisos: PermisosVendedor
    /** Qué botones salen al terminar la venta */
    comprobante: BotonesComprobante
    /** Datos del negocio para el comprobante (también sin internet) */
    tienda: CachedStoreInfo | null
    /** Ventas guardadas sin internet y estado de la conexión */
    offline: OfflineState
    /** Abre la hoja para abrir el turno */
    abrirTurno: () => void
}

export const CajaContext = createContext<CajaContextValue | null>(null)

export function useCaja(): CajaContextValue {
    const value = useContext(CajaContext)
    if (!value) throw new Error('useCaja must be used inside the /caja layout')
    return value
}
