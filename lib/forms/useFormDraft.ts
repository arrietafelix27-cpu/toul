'use client'

import { useEffect, useRef, useState } from 'react'

/* ══════════════════════════════════════════════════════════════
   Borrador de formulario.
   Si te sales a mirar algo en otra pestaña —o se cierra el
   navegador— lo que llevabas escrito sigue ahí al volver.
   La foto no se puede guardar: es un archivo del computador, hay
   que volver a escogerla.
   ══════════════════════════════════════════════════════════════ */

const PREFIX = 'toul-borrador-'
/** Un borrador de hace días ya no sirve de nada */
const TTL_MS = 24 * 60 * 60 * 1000

function isEmpty(data: unknown): boolean {
    if (data === null || data === undefined || data === '') return true
    if (Array.isArray(data)) return data.every(isEmpty)
    if (typeof data === 'object') return Object.values(data as Record<string, unknown>).every(isEmpty)
    return false
}

export function useFormDraft<T extends Record<string, unknown>>(
    key: string,
    data: T,
    restore: (draft: T) => void,
) {
    const storageKey = PREFIX + key
    const [restored, setRestored] = useState(false)
    // La primera pasada se salta: si no, el formulario vacío del
    // arranque borraría el borrador que se acaba de recuperar
    const firstRun = useRef(true)

    // Al entrar: si hay algo guardado, se devuelve
    useEffect(() => {
        try {
            const raw = localStorage.getItem(storageKey)
            if (raw) {
                const parsed = JSON.parse(raw) as { data: T; savedAt: number }
                if (parsed?.data && Date.now() - parsed.savedAt < TTL_MS && !isEmpty(parsed.data)) {
                    restore(parsed.data)
                    setRestored(true)
                } else {
                    localStorage.removeItem(storageKey)
                }
            }
        } catch {
            // Modo privado o guardado corrupto: se arranca en blanco
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [storageKey])

    // Mientras escribe, se va guardando
    const serialized = JSON.stringify(data)
    useEffect(() => {
        if (firstRun.current) { firstRun.current = false; return }
        try {
            if (isEmpty(JSON.parse(serialized))) localStorage.removeItem(storageKey)
            else localStorage.setItem(storageKey, JSON.stringify({ data: JSON.parse(serialized), savedAt: Date.now() }))
        } catch {
            // Sin espacio o sin permiso: el formulario sigue funcionando igual
        }
    }, [serialized, storageKey])

    /** Al guardar de verdad, el borrador deja de tener sentido */
    const clearDraft = () => {
        try { localStorage.removeItem(storageKey) } catch { /* nada que hacer */ }
        setRestored(false)
    }

    /** Si el dueño prefiere empezar de cero */
    const discardDraft = () => {
        clearDraft()
        restore({} as T)
    }

    return { restored, clearDraft, discardDraft }
}
