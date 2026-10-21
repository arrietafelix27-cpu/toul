'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'
import { listPendingSales, syncPendingSales } from '@/lib/isla/offline'
import { borrarSesionDelEquipo, entrarDeCero, limpiarDatosDeCuenta, marcarCuenta } from './limpiarCuenta'

/* ══════════════════════════════════════════════════════════════
   Cerrar sesión.

   Había tres botones de "cerrar sesión" y cada uno hacía lo suyo:
   cerraba la sesión y cambiaba de pantalla, dejando en memoria y en
   el navegador todo lo de la cuenta. El que entraba después lo veía.

   Ahora los tres pasan por aquí, y el orden importa:
     1. Si quedaron ventas sin internet, se intentan cargar primero,
        mientras todavía hay sesión con qué cargarlas.
     2. Si alguna no se pudo cargar, se avisa antes de salir. Si
        sale igual, se quedan guardadas solo para esta tienda.
     3. Se cierra la sesión, se borra todo lo demás y la app arranca
        de cero en la pantalla de entrada.
   ══════════════════════════════════════════════════════════════ */

export function useCerrarSesion(storeId: string | null | undefined) {
    const [sinCargar, setSinCargar] = useState(0)
    const [cerrando, setCerrando] = useState(false)

    const salir = useCallback(async () => {
        setCerrando(true)
        let fallo = false
        try {
            const { error } = await createClient().auth.signOut()
            fallo = !!error
        } catch {
            fallo = true
        }
        // Sin internet, Supabase deja la sesión puesta: se quita a mano
        if (fallo) borrarSesionDelEquipo()
        // Las otras pestañas abiertas se enteran por este cambio y se van también
        marcarCuenta(null)
        await limpiarDatosDeCuenta()
        entrarDeCero('/login')
    }, [])

    const cerrar = useCallback(async () => {
        setCerrando(true)
        if (storeId) {
            if (navigator.onLine) {
                try { await syncPendingSales(storeId) } catch { /* se avisa abajo */ }
            }
            const quedan = listPendingSales(storeId).length
            if (quedan > 0) {
                setSinCargar(quedan)
                setCerrando(false)
                return
            }
        }
        await salir()
    }, [storeId, salir])

    const dialogo = (
        <ConfirmSheet
            open={sinCargar > 0}
            onClose={() => setSinCargar(0)}
            onConfirm={salir}
            busy={cerrando}
            title={sinCargar === 1 ? 'Hay 1 venta sin cargar' : `Hay ${sinCargar} ventas sin cargar`}
            message={'Se hicieron sin internet y todavía no llegan a tu cuenta. Si cierras sesión ahora, se quedan '
                + 'guardadas en este equipo, solo para tu tienda, y se cargan solas la próxima vez que tu tienda '
                + 'entre con internet.'}
            confirmLabel="Cerrar sesión igual"
            cancelLabel="Esperar"
        />
    )

    return { cerrar, cerrando, dialogo }
}
