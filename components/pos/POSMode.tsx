'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { MemberRole } from '@/lib/isla/types'

/**
 * Cómo se está usando el POS:
 * - 'drawer': panel flotante dentro de la app del administrador (comportamiento original)
 * - 'caja':   pantalla completa del modo isla (computador táctil del punto de venta)
 */
export interface POSModeValue {
    mode: 'drawer' | 'caja'
    role: MemberRole
    autoPrint: boolean
    onViewHistory?: () => void
}

const POSModeContext = createContext<POSModeValue>({ mode: 'drawer', role: 'admin', autoPrint: false })

export function POSModeProvider({ value, children }: { value: POSModeValue; children: ReactNode }) {
    return <POSModeContext.Provider value={value}>{children}</POSModeContext.Provider>
}

export const usePOSMode = () => useContext(POSModeContext)
