'use client'

import { useEffect } from 'react'
import { watchErrors } from '@/lib/monitoring/report'

/** Escucha los errores del navegador y los guarda. No pinta nada. */
export function ErrorWatcher() {
    useEffect(() => { watchErrors() }, [])
    return null
}
