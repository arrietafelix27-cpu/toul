'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

/* ══════════════════════════════════════════════════════════════
   Mantener la app al día.

   Si la app quedaba abierta (Samuel la deja todo el día), seguía con
   la versión vieja aunque ya se hubiera publicado una nueva. Ahora se
   pregunta cada 15 minutos y cada vez que vuelves a la app. Si hay una
   versión nueva, no se recarga en ese momento —podrías estar a mitad de
   una venta—: se actualiza en el siguiente cambio de pantalla, que es
   cuando de todas formas estabas saliendo de lo que hacías. El carrito,
   los borradores y las ventas sin cargar están guardados y no se pierden.
   ══════════════════════════════════════════════════════════════ */

const CADA = 15 * 60 * 1000

export function ActualizarVersion() {
    const pathname = usePathname()
    const anterior = useRef(pathname)
    const hayNueva = useRef(false)
    // La versión con la que se armó esta copia de la app (Vercel la pone al publicar)
    const base = useRef<string | null>(process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null)

    useEffect(() => {
        let vigente = true
        async function revisar() {
            if (hayNueva.current || !navigator.onLine) return
            try {
                const respuesta = await fetch('/api/version', { cache: 'no-store' })
                const { version } = await respuesta.json() as { version?: string }
                if (!vigente || !version || version === 'local') return
                if (!base.current) { base.current = version; return }
                if (version !== base.current) hayNueva.current = true
            } catch { /* sin señal: se vuelve a intentar después */ }
        }
        void revisar()
        const intervalo = setInterval(revisar, CADA)
        const alVolver = () => { if (document.visibilityState === 'visible') void revisar() }
        document.addEventListener('visibilitychange', alVolver)
        return () => {
            vigente = false
            clearInterval(intervalo)
            document.removeEventListener('visibilitychange', alVolver)
        }
    }, [])

    // Cambió de pantalla y hay versión nueva: la pantalla a la que llegó se
    // carga de nuevo, ya con lo último
    useEffect(() => {
        if (pathname === anterior.current) return
        anterior.current = pathname
        if (hayNueva.current) window.location.reload()
    }, [pathname])

    return null
}
