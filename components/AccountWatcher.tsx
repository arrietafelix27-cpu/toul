'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
    ULTIMA_CUENTA, entrarDeCero, limpiarDatosDeCuenta, marcarCuenta, ultimaCuenta,
} from '@/lib/session/limpiarCuenta'

/* ══════════════════════════════════════════════════════════════
   Vigila que la cuenta no cambie por debajo.

   Entrar y salir ya limpian todo. Pero la cuenta también puede
   cambiar por caminos donde ninguna pantalla se entera:
     - en otra pestaña alguien cerró sesión o entró con otra cuenta
     - vuelves a una pestaña que quedó abierta con la cuenta vieja
     - la sesión venció o se cerró desde el servidor
   En cualquiera de esos casos la pestaña tiene en memoria datos de
   una cuenta que ya no es la suya. Este vigilante lo detecta y la
   hace arrancar de cero.

   No pinta nada. Va en el layout raíz para cubrir toda la app.
   ══════════════════════════════════════════════════════════════ */

/** Pantallas que se ven sin cuenta: ahí no hay nada que proteger */
const PUBLICAS = ['/login', '/register', '/forgot-password', '/reset-password', '/t']

function enPantallaPublica() {
    const ruta = window.location.pathname
    return PUBLICAS.some(p => ruta === p || ruta.startsWith(p + '/'))
}

export function AccountWatcher() {
    useEffect(() => {
        const supabase = createClient()
        /** La cuenta con la que arrancó ESTA pestaña */
        let deEstaPestana: string | null | undefined
        let saliendo = false

        /** La pestaña quedó con datos de otra cuenta: arranca de cero */
        async function reiniciar(nueva: string | null) {
            if (saliendo) return
            saliendo = true
            await limpiarDatosDeCuenta()
            if (nueva) {
                marcarCuenta(nueva)
                window.location.reload()
            } else if (!enPantallaPublica()) {
                entrarDeCero('/login')
            }
        }

        // 1. Al abrir: ¿el equipo cambió de cuenta sin pasar por "cerrar sesión"?
        supabase.auth.getSession().then(({ data }) => {
            const actual = data.session?.user.id ?? null
            deEstaPestana = actual
            const anterior = ultimaCuenta()

            if (actual && anterior && anterior !== actual) {
                // Quedaron cosas de la cuenta anterior en el navegador
                void reiniciar(actual)
                return
            }
            // La primera vez que corre no sabe de quién era lo guardado:
            // lo anota y no borra nada, para no tumbar un carrito a mitad
            // de una venta justo cuando sale esta versión
            if (actual) marcarCuenta(actual)
        })

        // 2. Otra pestaña cerró sesión o entró con otra cuenta
        function alCambiarEnOtraPestana(e: StorageEvent) {
            if (e.key !== ULTIMA_CUENTA) return
            if (deEstaPestana === undefined) return
            if (e.newValue === deEstaPestana) return
            void reiniciar(e.newValue)
        }

        // 3. Vuelves a esta pestaña y la cuenta del navegador ya es otra
        async function alVolver() {
            if (document.visibilityState !== 'visible' || deEstaPestana === undefined) return
            const { data } = await supabase.auth.getSession()
            const actual = data.session?.user.id ?? null
            if (actual !== deEstaPestana) void reiniciar(actual)
        }

        // 4. La sesión venció, la cerró el servidor o entró otra cuenta
        const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, sesion) => {
            if (deEstaPestana === undefined) return
            if (evento === 'SIGNED_OUT') {
                if (deEstaPestana) void reiniciar(null)
                return
            }
            const actual = sesion?.user.id ?? null
            if (actual && deEstaPestana && actual !== deEstaPestana) void reiniciar(actual)
        })

        window.addEventListener('storage', alCambiarEnOtraPestana)
        document.addEventListener('visibilitychange', alVolver)
        return () => {
            window.removeEventListener('storage', alCambiarEnOtraPestana)
            document.removeEventListener('visibilitychange', alVolver)
            suscripcion.subscription.unsubscribe()
        }
    }, [])

    return null
}
