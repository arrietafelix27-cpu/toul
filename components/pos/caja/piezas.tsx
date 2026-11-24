'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { animate, PresenceContext, useReducedMotion } from 'framer-motion'
import { formatCOP } from '@/lib/utils'
import type { OfflineState } from '@/lib/isla/useOffline'
import { cerrarCaja } from '@/components/pos/ui/gota'
import { soltarVendidoEnCaja } from '@/lib/pos/comprobante'
import { IcoCerrar } from '@/components/pos/ui/Iconos'
import ui from '@/components/pos/ui/pos.module.css'

/* ══════════════════════════════════════════════════════════════
   Piezas de la caja. El lenguaje: nada metido en cajas, sin
   mayúsculas sostenidas, los montos en blanco y el verde solo
   para lo importante (el botón de cobrar, el turno, lo elegido).
   ══════════════════════════════════════════════════════════════ */

export const CAJA_CSS = `
.cj-num { font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
`

/* ── Lo de adentro de una hoja no frena su cierre ─────────────────
   Con framer-motion 11, un selector con layoutId que desaparece con la
   hoja abierta (el cobro que se cambia por "Venta registrada") deja un
   registro que nunca termina: la hoja se ve cerrada, pero su capa
   transparente se queda encima y bloquea toda la pantalla. */
export function SinPresencia({ children }: { children: ReactNode }) {
    return <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
}

/* ── Un monto que cuenta hasta el valor nuevo cada vez que cambia ── */
export function Cuenta({ valor, style, className }: { valor: number; style?: React.CSSProperties; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null)
    const mostrado = useRef(Math.round(valor))
    const reducir = useReducedMotion()

    useLayoutEffect(() => {
        const node = ref.current
        if (!node) return
        const destino = Math.round(valor)
        if (reducir || mostrado.current === destino) {
            mostrado.current = destino
            node.textContent = formatCOP(destino)
            return
        }
        const controls = animate(mostrado.current, destino, {
            duration: 0.35,
            ease: [0.23, 1, 0.32, 1],
            onUpdate: v => { mostrado.current = v; node.textContent = formatCOP(v) },
        })
        return () => controls.stop()
    }, [valor, reducir])

    return <span ref={ref} className={`cj-num ${className ?? ''}`} style={style}>{formatCOP(valor)}</span>
}


/* ── La conexión ───────────────────────────────────────────────────
   Solo cuando aplica: "Sin conexión" (ámbar), "Enviando N" (azul,
   tocar reintenta) o "N no se pudieron enviar" (rojo, lleva a revisarlas). */
export function Conexion({ offline, className }: { offline: OfflineState; className?: string }) {
    const { online, pendingCount, failedCount, syncing, sync } = offline
    const estado = failedCount > 0 && online ? 'fallo' : !online ? 'sin' : pendingCount > 0 || syncing ? 'enviando' : null
    if (!estado) return null
    if (estado === 'sin') {
        return (
            <span className={`${ui.sinConexion} ${className ?? ''}`} role="status"
                title="Puedes seguir vendiendo de contado. Las ventas se envían solas cuando vuelva la conexión">
                <i aria-hidden="true" />Sin conexión{pendingCount > 0 ? ` · ${pendingCount} ${pendingCount === 1 ? 'guardada' : 'guardadas'}` : ''}
            </span>
        )
    }
    if (estado === 'enviando') {
        return (
            <button type="button" className={`${ui.pildora} ${className ?? ''}`} data-tono="enviando" onClick={() => sync(true)} disabled={syncing}>
                Enviando {pendingCount}…
            </button>
        )
    }
    return (
        <Link href="/caja/ventas" className={`${ui.pildora} ${className ?? ''}`} data-tono="fallo">
            {failedCount} no se {failedCount === 1 ? 'pudo' : 'pudieron'} enviar
        </Link>
    )
}

/* ── La X: vuelve a Inicio con la gota (o el zoom en PC) al revés ── */
/** Salir de la caja a Inicio: la gota se recoge en el "+" (la X y "Salir" del logro) */
export function useSalirDeCaja() {
    const router = useRouter()
    // Inicio queda listo de antemano: la gota se recoge sin esperar
    useEffect(() => { router.prefetch('/') }, [router])
    return useCallback(() => {
        // Lo vendido aquí queda listo para que Inicio lo cuente
        soltarVendidoEnCaja()
        void cerrarCaja(() => router.push('/'))
    }, [router])
}

export function SalirDeCaja({ className }: { className?: string }) {
    const salir = useSalirDeCaja()
    return (
        <button type="button" aria-label="Salir de la caja" title="Salir de la caja" className={`${ui.xCaja} ${className ?? ''}`}
            onClick={salir}>
            <IcoCerrar size={18} grosor={2.2} />
        </button>
    )
}
