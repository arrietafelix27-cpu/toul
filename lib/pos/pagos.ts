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

/** Siguiente múltiplo de cada billete ($10.000, $20.000, $50.000 y $100.000), siempre por encima de lo que se debe. Máximo 4 */
export function sugerenciasEfectivo(monto: number): number[] {
    const m = Math.max(0, Math.round(monto))
    if (m === 0) return []
    const siguiente = (paso: number) => (Math.floor(m / paso) + 1) * paso
    return [...new Set([10_000, 20_000, 50_000, 100_000].map(siguiente))].sort((a, b) => a - b).slice(0, 4)
}

/* ── Fecha de pago de una venta a crédito ──────────────────────────
   Siempre en la hora del celular (fecha local), como "AAAA-MM-DD".
   Solo sirve de mañana en adelante, o vacía ("Sin fecha"). */

const dosCifras = (n: number) => String(n).padStart(2, '0')

/** La fecha local de hoy más n días, como "AAAA-MM-DD" */
export function fechaEnDias(n: number, hoy: Date = new Date()): string {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n)
    return `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
}

/** "AAAA-MM-DD" a fecha local; null si no existe (31 de febrero, año 0001…) */
export function leerFecha(texto: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
    if (!m) return null
    const [a, me, di] = [Number(m[1]), Number(m[2]), Number(m[3])]
    if (a < 2000) return null
    const d = new Date(a, me - 1, di)
    return d.getFullYear() === a && d.getMonth() === me - 1 && d.getDate() === di ? d : null
}

/** La fecha de pago sirve: vacía (sin fecha) o una fecha real de mañana en adelante */
export function fechaPagoValida(texto: string, hoy: Date = new Date()): boolean {
    if (texto === '') return true
    return leerFecha(texto) !== null && texto >= fechaEnDias(1, hoy)
}

/** Cuántos días faltan de hoy a esa fecha */
export function diasHasta(texto: string, hoy: Date = new Date()): number | null {
    const d = leerFecha(texto)
    if (!d) return null
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    return Math.round((d.getTime() - h.getTime()) / 86_400_000)
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
