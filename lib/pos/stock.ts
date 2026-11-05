/* ══════════════════════════════════════════════════════════════
   El stock de la caja: lo que de verdad queda para vender.

   Un mismo perfume sale suelto o dentro de un combo, y las ventas
   guardadas sin internet todavía no se han descontado en TOUL. Todo
   se cuenta en unidades de inventario: 'p:<producto>' o
   'v:<presentación>'. Sin dependencias: se prueba con node --test.
   ══════════════════════════════════════════════════════════════ */

export type Unidad = string
/** Cuántas unidades de inventario pide (o tiene) cada cosa */
export type Cuenta = Record<Unidad, number>

export interface ComponenteCombo {
    product_id: string | null
    variant_id: string | null
    quantity: number
}

export interface ComboConComponentes {
    id: string
    combo_items: ComponenteCombo[]
}

export const unidadProducto = (id: string): Unidad => `p:${id}`
export const unidadVariante = (id: string): Unidad => `v:${id}`

function sumar(a: Cuenta, b: Cuenta, veces = 1): Cuenta {
    const out = { ...a }
    for (const [u, n] of Object.entries(b)) out[u] = (out[u] ?? 0) + n * veces
    return out
}

function delCombo(combo: ComboConComponentes | undefined): Cuenta {
    let out: Cuenta = {}
    for (const ci of combo?.combo_items ?? []) {
        const u = ci.variant_id ? unidadVariante(ci.variant_id) : ci.product_id ? unidadProducto(ci.product_id) : null
        if (u) out = sumar(out, { [u]: Math.max(0, Number(ci.quantity) || 0) })
    }
    return out
}

/** Lo que saca del inventario UNA unidad de una línea del carrito
 *  ('producto', 'producto:presentación' o 'combo:id'). */
export function unidadesDeLinea(llave: string, combos: ComboConComponentes[]): Cuenta {
    if (llave.startsWith('combo:')) {
        const id = llave.slice(6)
        return delCombo(combos.find(c => c.id === id))
    }
    const sep = llave.indexOf(':')
    return sep >= 0 ? { [unidadVariante(llave.slice(sep + 1))]: 1 } : { [unidadProducto(llave)]: 1 }
}

/** Lo que se lleva todo el carrito */
export function demandaDeCarrito(carrito: Record<string, number>, combos: ComboConComponentes[]): Cuenta {
    let out: Cuenta = {}
    for (const [llave, cantidad] of Object.entries(carrito)) {
        if (cantidad > 0) out = sumar(out, unidadesDeLinea(llave, combos), cantidad)
    }
    return out
}

interface LineaGuardada {
    quantity?: unknown
    isCombo?: unknown
    comboId?: unknown
    variantId?: unknown
    product?: { id?: unknown } | null
}

/** Lo que se llevan las ventas guardadas en el equipo, que TOUL todavía no descontó */
export function demandaDeVentasGuardadas(ventas: { body: Record<string, unknown> }[], combos: ComboConComponentes[]): Cuenta {
    let out: Cuenta = {}
    for (const venta of ventas) {
        const lineas = Array.isArray(venta.body?.cart) ? (venta.body.cart as LineaGuardada[]) : []
        for (const linea of lineas) {
            const cantidad = Number(linea.quantity) || 0
            if (cantidad <= 0) continue
            if (linea.isCombo && typeof linea.comboId === 'string') {
                out = sumar(out, unidadesDeLinea(`combo:${linea.comboId}`, combos), cantidad)
            } else if (typeof linea.variantId === 'string' && linea.variantId) {
                out = sumar(out, { [unidadVariante(linea.variantId)]: cantidad })
            } else if (typeof linea.product?.id === 'string') {
                out = sumar(out, { [unidadProducto(linea.product.id)]: cantidad })
            }
        }
    }
    return out
}

/** El stock que queda después de lo ya comprometido. Nunca negativo. */
export function stockRestante(base: Cuenta, comprometido: Cuenta): Cuenta {
    const out = { ...base }
    for (const [u, n] of Object.entries(comprometido)) out[u] = Math.max(0, (out[u] ?? 0) - n)
    return out
}

/** La primera unidad que no alcanza para agregar UNA más de esta línea
 *  al carrito, contando lo que ya lleva (null si alcanza). */
export function loQueFalta(llave: string, carrito: Record<string, number>, combos: ComboConComponentes[], stock: Cuenta): Unidad | null {
    const usado = demandaDeCarrito(carrito, combos)
    for (const [u, n] of Object.entries(unidadesDeLinea(llave, combos))) {
        if ((usado[u] ?? 0) + n > (stock[u] ?? 0)) return u
    }
    return null
}

/** ¿Cabe una más de esta línea en el carrito? */
export function cabeUnaMas(llave: string, carrito: Record<string, number>, combos: ComboConComponentes[], stock: Cuenta): boolean {
    return loQueFalta(llave, carrito, combos, stock) === null
}
