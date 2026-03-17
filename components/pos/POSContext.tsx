'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface POSContextType {
    isOpen: boolean
    openPOS: () => void
    closePOS: () => void
}

const POSContext = createContext<POSContextType>({
    isOpen: false,
    openPOS: () => { },
    closePOS: () => { },
})

export function POSProvider({ children }: { children: ReactNode }) {
    const [isOpen, setIsOpen] = useState(false)
    const openPOS = useCallback(() => setIsOpen(true), [])
    const closePOS = useCallback(() => setIsOpen(false), [])
    return (
        <POSContext.Provider value={{ isOpen, openPOS, closePOS }}>
            {children}
        </POSContext.Provider>
    )
}

export const usePOS = () => useContext(POSContext)
