'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { RotateCw, WifiOff, CloudOff } from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   Cuando una pantalla no pudo cargar sus datos.

   Regla de toda la app: sin internet nunca se muestran ceros ni
   "vacío" como si fueran reales ("Vendiste $0", "Todavía no tienes
   clientes"). Se dice qué pasó con palabras de persona y se ofrece
   reintentar. Nunca un error técnico.

   Si la conexión vuelve sola, se reintenta sin que haya que tocar nada.
   `compacto` es la versión para dentro de una hoja o un panel.
   ══════════════════════════════════════════════════════════════ */

function suscribir(avisar: () => void) {
    window.addEventListener('online', avisar)
    window.addEventListener('offline', avisar)
    return () => {
        window.removeEventListener('online', avisar)
        window.removeEventListener('offline', avisar)
    }
}

const enLinea = () => navigator.onLine
const enElServidor = () => true

/** Si el equipo dice que tiene conexión (cambia solo cuando se cae o vuelve) */
export function useEnLinea(): boolean {
    return useSyncExternalStore(suscribir, enLinea, enElServidor)
}

const CSS = `
.si-wrap { max-width: 400px; margin: 0 auto; padding: 56px 20px 40px; text-align: center; }
.si-wrap.si-compacto { padding: 28px 8px 16px; }
.si-icono { width: 52px; height: 52px; margin: 0 auto 16px; border-radius: 16px;
    display: flex; align-items: center; justify-content: center;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text-muted); }
.si-compacto .si-icono { width: 44px; height: 44px; border-radius: 14px; margin-bottom: 12px; }
.si-titulo { font-size: 19px; font-weight: 700; letter-spacing: -0.02em; color: var(--toul-text); margin: 0 0 6px; }
.si-compacto .si-titulo { font-size: 16px; }
.si-texto { font-size: 14.5px; line-height: 1.55; color: var(--toul-text-muted); margin: 0 0 22px; }
.si-compacto .si-texto { font-size: 13.5px; margin-bottom: 16px; }
.si-boton { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    height: 46px; padding: 0 22px; border-radius: 14px; cursor: pointer; font-family: inherit;
    font-size: 15px; font-weight: 600; color: var(--toul-text);
    background: var(--toul-surface); border: 1px solid var(--toul-border);
    touch-action: manipulation; user-select: none; -webkit-user-select: none;
    transition: transform 140ms cubic-bezier(0.23,1,0.32,1), background-color 160ms ease; }
.si-boton:active { transform: scale(0.97); }
@media (hover: hover) and (pointer: fine) { .si-boton:hover { background: var(--toul-surface-2); } }
`

export function SinInternet({ onRetry, que = 'tu información', compacto = false }: {
    /** Vuelve a pedir los datos */
    onRetry: () => void
    /** Lo que no se pudo ver: "tu inventario", "tus ventas", "este producto"… */
    que?: string
    /** Para dentro de una hoja o un panel */
    compacto?: boolean
}) {
    const online = useEnLinea()

    // Volvió la conexión: se reintenta solo
    const antes = useRef(online)
    useEffect(() => {
        if (online && !antes.current) onRetry()
        antes.current = online
    }, [online, onRetry])

    const Icono = online ? CloudOff : WifiOff
    const Titulo = compacto ? 'p' : 'h1'

    return (
        <div className={compacto ? 'si-wrap si-compacto' : 'si-wrap'} role="alert">
            <style>{CSS}</style>
            <div className="si-icono"><Icono size={compacto ? 19 : 22} strokeWidth={1.8} /></div>
            <Titulo className="si-titulo">{online ? 'No se pudo cargar' : 'Sin internet'}</Titulo>
            <p className="si-texto">
                {online
                    ? `No pudimos traer ${que}. Intenta de nuevo en un momento.`
                    : `Revisa tu conexión para ver ${que}.`}
            </p>
            <button type="button" className="si-boton" onClick={onRetry}>
                <RotateCw size={16} strokeWidth={2} /> Reintentar
            </button>
        </div>
    )
}
