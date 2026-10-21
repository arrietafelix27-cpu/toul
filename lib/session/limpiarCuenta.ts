'use client'

import { mutate } from 'swr'

/* ══════════════════════════════════════════════════════════════
   Limpiar lo que dejó una cuenta.

   Al entrar con otra cuenta se veían, por un momento, los datos de
   la anterior. La causa: entrar y salir solo cambiaban de pantalla,
   así que todo lo guardado en memoria y en el navegador seguía ahí.

   Este archivo es el único lugar que sabe qué es de la cuenta y qué
   es del equipo. La regla es al revés de lo normal: TODO lo de TOUL
   se borra, salvo lo que esté explícitamente en la lista de lo que
   se queda. Así, cualquier cosa que se guarde en el futuro queda
   cubierta sin tener que acordarse de agregarla aquí.
   ══════════════════════════════════════════════════════════════ */

/** Qué cuenta usó este equipo por última vez. Sirve para darse
 *  cuenta cuando cambió sin pasar por "cerrar sesión". */
export const ULTIMA_CUENTA = 'toul-ultima-cuenta'

/** Preferencias del equipo, no de la cuenta: se quedan. */
const DEL_EQUIPO = new Set([
    'toul-utilidad',        // bruta o neta en el inicio
    'toul-caja-autoprint',  // si la impresora de la caja imprime sola
    ULTIMA_CUENTA,
])

/** Ventas hechas sin internet que todavía no se cargan. Son plata:
 *  nunca se borran. Cada una lleva su tienda y ninguna otra la ve. */
const VENTAS_SIN_CARGAR = 'toul-pending-sales'

const esDeTOUL = (llave: string) => llave.startsWith('toul')

function limpiarAlmacen(almacen: Storage, conservarVentas: boolean) {
    const llaves: string[] = []
    for (let i = 0; i < almacen.length; i++) {
        const llave = almacen.key(i)
        if (llave) llaves.push(llave)
    }
    for (const llave of llaves) {
        if (!esDeTOUL(llave)) continue
        if (DEL_EQUIPO.has(llave)) continue
        if (conservarVentas && llave.startsWith(VENTAS_SIN_CARGAR)) continue
        almacen.removeItem(llave)
    }
}

/**
 * Borra todo lo que la cuenta dejó en este equipo:
 *  - lo que la app tenía en memoria
 *  - lo guardado en el navegador (carrito, borradores, copias para
 *    trabajar sin internet, el pedido a medio armar…)
 *  - la copia de datos del service worker
 *
 * Lo único que sobrevive son las preferencias del equipo y las
 * ventas sin cargar, que quedan atadas a su tienda.
 */
export async function limpiarDatosDeCuenta(): Promise<void> {
    // 1. Memoria: todo lo que la app había pedido al servidor
    try {
        await mutate(() => true, undefined, { revalidate: false })
    } catch { /* si no hay nada en memoria, no hay nada que borrar */ }

    // 2. Navegador
    try { limpiarAlmacen(localStorage, true) } catch { /* almacenamiento bloqueado */ }
    try { limpiarAlmacen(sessionStorage, false) } catch { /* almacenamiento bloqueado */ }

    // 3. La copia de datos del service worker. Las pantallas y los
    //    archivos de la app se quedan: no tienen nada de nadie.
    try {
        if ('caches' in window) {
            const nombres = await caches.keys()
            await Promise.all(nombres.filter(n => n.startsWith('toul-data')).map(n => caches.delete(n)))
        }
    } catch { /* sin soporte */ }
}

/** Deja anotado qué cuenta está usando este equipo. */
export function marcarCuenta(userId: string | null): void {
    try {
        if (userId) localStorage.setItem(ULTIMA_CUENTA, userId)
        else localStorage.removeItem(ULTIMA_CUENTA)
    } catch { /* almacenamiento bloqueado */ }
}

/** Qué cuenta usó este equipo por última vez. */
export function ultimaCuenta(): string | null {
    try { return localStorage.getItem(ULTIMA_CUENTA) } catch { return null }
}

/**
 * Entra a la app de cero. Una navegación normal conserva todo lo que
 * hay en memoria; esta no: el navegador arranca la app desde el
 * principio, sin nada de la cuenta anterior.
 */
export function entrarDeCero(ruta: string): void {
    window.location.replace(ruta)
}
