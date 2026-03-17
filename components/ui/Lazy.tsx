'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from './Skeleton'

/**
 * Lazy — simplifies next/dynamic usage with a standard skeleton fallback.
 */
export function createLazyComponent(importFn: () => Promise<any>, height: string = '200px') {
    return dynamic(importFn, {
        loading: () => <Skeleton height={height} className="rounded-2xl" />,
        ssr: false, // Components with browser-only logic (like Framer Motion or Supabase)
    })
}
