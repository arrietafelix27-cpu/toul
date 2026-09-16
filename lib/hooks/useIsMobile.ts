'use client'

import { useState, useEffect } from 'react'

/**
 * SSR-safe hook to detect mobile viewport (< 1024px).
 * Defaults to `true` (mobile-first) to avoid desktop flash on SSR.
 */
export function useIsMobile(breakpoint = 1024): boolean {
    const [isMobile, setIsMobile] = useState(true)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < breakpoint)
        check() // Initial check
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [breakpoint])

    return isMobile
}
