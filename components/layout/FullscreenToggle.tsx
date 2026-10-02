'use client'

import { useCallback, useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import toast from 'react-hot-toast'

/* ══════════════════════════════════════════════════════════════
   Pantalla completa.
   Pensado para el computador del mostrador: la isla trabaja todo
   el día en la misma pantalla y la barra del navegador no aporta.
   ══════════════════════════════════════════════════════════════ */

type FullscreenDoc = Document & {
    webkitFullscreenElement?: Element | null
    webkitExitFullscreen?: () => Promise<void>
}
type FullscreenEl = HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>
}

export function FullscreenToggle() {
    const [active, setActive] = useState(false)
    const [supported, setSupported] = useState(false)

    useEffect(() => {
        const doc = document as FullscreenDoc
        const root = document.documentElement as FullscreenEl
        setSupported(!!(root.requestFullscreen || root.webkitRequestFullscreen))

        const sync = () => setActive(!!(document.fullscreenElement || doc.webkitFullscreenElement))
        sync()
        document.addEventListener('fullscreenchange', sync)
        document.addEventListener('webkitfullscreenchange', sync)
        return () => {
            document.removeEventListener('fullscreenchange', sync)
            document.removeEventListener('webkitfullscreenchange', sync)
        }
    }, [])

    const toggle = useCallback(async () => {
        const doc = document as FullscreenDoc
        const root = document.documentElement as FullscreenEl
        try {
            if (document.fullscreenElement || doc.webkitFullscreenElement) {
                await (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
            } else {
                await (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.())
            }
        } catch {
            // Dentro de algunos navegadores incrustados está bloqueado:
            // sin aviso, el botón parecería roto
            toast('Tu navegador no permite pantalla completa aquí.')
        }
    }, [])

    if (!supported) return null
    const Icon = active ? Minimize2 : Maximize2

    return (
        <button
            type="button"
            onClick={toggle}
            className="fs-toggle"
            aria-label={active ? 'Salir de pantalla completa' : 'Pantalla completa'}
            title={active ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            <style>{`
                .fs-toggle { width: 30px; height: 30px; border-radius: 9px; border: none; flex-shrink: 0;
                    background: transparent; color: var(--toul-text-faint); cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
                .fs-toggle:active { transform: scale(0.92); }
                @media (hover: hover) and (pointer: fine) {
                    .fs-toggle:hover { background: rgba(255,255,255,0.07); color: var(--toul-text-muted); }
                }
                @media (prefers-reduced-motion: reduce) { .fs-toggle:active { transform: none; } }
            `}</style>
            <Icon size={15} strokeWidth={2.1} />
        </button>
    )
}
