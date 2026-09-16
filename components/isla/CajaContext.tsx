'use client'

import { createContext, useContext } from 'react'
import type { KeyedMutator } from 'swr'
import type { CashSession, SessionContext } from '@/lib/isla/types'

export interface CajaContextValue {
    ctx: SessionContext
    session: CashSession | null
    sessionLoading: boolean
    refreshSession: KeyedMutator<CashSession | null>
    autoPrint: boolean
}

export const CajaContext = createContext<CajaContextValue | null>(null)

export function useCaja(): CajaContextValue {
    const value = useContext(CajaContext)
    if (!value) throw new Error('useCaja must be used inside the /caja layout')
    return value
}
