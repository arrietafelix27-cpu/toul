/* ══════════════════════════════════════════════════════════════
   Pagos de la caja: pago mixto y vuelto.

   Pago mixto: el primer método elegido es siempre el resto. En los
   demás se escribe cuánto. Así siempre cuadra y nadie reparte a mano.
   Si cambia el descuento, el abono o el tipo de venta, lo escrito se
   queda y solo se recalcula el resto.

   Sin dependencias: se prueba con node --test.
   ══════════════════════════════════════════════════════════════ */

export interface MetodoElegido {
    methodId: string
    methodName: string
    methodColor: string
    /** Lo que se escribió (los que no son el primero). null = vacío */
    escrito: number | null
}

export interface Reparto {
    splits: { methodId: string; methodName: string; methodColor: string; amount: number }[]
    /** Cuánto se pasa lo escrito del total: si es más de cero no deja cobrar */
    exceso: number
}

export function repartir(elegidos: MetodoElegido[], objetivo: number): Reparto {
    const meta = Math.max(0, Math.round(objetivo))
    if (elegidos.length === 0) return { splits: [], exceso: 0 }
    const [primero, ...otros] = elegidos
    const escritos = otros.map(m => Math.max(0, Math.round(m.escrito ?? 0)))
    const suma = escritos.reduce((a, b) => a + b, 0)
    const resto = meta - suma
    return {
        splits: [
            { methodId: primero.methodId, methodName: primero.methodName, methodColor: primero.methodColor, amount: Math.max(0, resto) },
            ...otros.map((m, i) => ({ methodId: m.methodId, methodName: m.methodName, methodColor: m.methodColor, amount: escritos[i] })),
        ],
        exceso: Math.max(0, -resto),
    }
}

/** Siguiente múltiplo de cada billete grande, siempre por encima de lo que se debe */
export function sugerenciasEfectivo(monto: number): number[] {
    const m = Math.max(0, Math.round(monto))
    if (m === 0) return []
    const siguiente = (paso: number) => (Math.floor(m / paso) + 1) * paso
    return [...new Set([siguiente(10_000), siguiente(50_000), siguiente(100_000)])].sort((a, b) => a - b)
}

export function vuelto(recibido: number, efectivo: number): number {
    return Math.max(0, Math.round(recibido) - Math.round(efectivo))
}

/** El método es efectivo (por la marca del método o por su nombre) */
export function esEfectivo(metodo: { name: string; is_cash?: boolean | null }): boolean {
    return !!metodo.is_cash || /efectivo|cash/i.test(metodo.name)
}

/** Qué ícono le va a un método según su nombre */
export function tipoDeMetodo(nombre: string): 'efectivo' | 'billetera' | 'banco' | 'tarjeta' {
    const n = nombre.toLowerCase()
    if (/efectivo|cash/.test(n)) return 'efectivo'
    if (/dat[aá]fono|tarjeta|cr[eé]dito|d[eé]bito|visa|master/.test(n)) return 'tarjeta'
    if (/banco|bancolombia|transfer|davivienda|bbva|consignaci|pse/.test(n)) return 'banco'
    return 'billetera'
}
