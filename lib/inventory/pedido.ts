/* ══════════════════════════════════════════════════════════════
   El pedido que se arma en Inventario y se abre en Nueva compra.
   Viaja por sessionStorage y no por la dirección, porque un
   pedido de veinte cosas no cabe en un link.
   ══════════════════════════════════════════════════════════════ */

const KEY = 'toul-pedido'

export interface PedidoLinea {
    productId: string
    variantId: string | null
    quantity: number
}

/** Guarda el pedido y devuelve la dirección a donde hay que ir. */
export function guardarPedido(lineas: PedidoLinea[]): string {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(lineas))
    } catch {
        // Modo privado: la compra abrirá vacía, que es lo que pasaba antes
    }
    return '/inventory/purchase?pedido=1'
}

/** Lo lee una sola vez: al volver a entrar, la compra arranca limpia. */
export function tomarPedido(): PedidoLinea[] {
    try {
        const raw = sessionStorage.getItem(KEY)
        sessionStorage.removeItem(KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/* ── La compra que se deja a medias para ver "Compras anteriores" ──
   Al volver, Nueva compra abre igual: los productos, las cantidades
   y los costos como el dueño los dejó, y lo que haya elegido del pago. */

const KEY_BORRADOR = 'toul-compra-borrador'

export interface BorradorCompra {
    lineas: { productId: string; variantId: string | null; quantity: string; cost: string }[]
    paymentMethod: string
    initialPayment: string
    selectedProviderId: string
    dueDate: string
    cuenta: string | null
}

/** Guarda la compra como va y deja la página marcada para encontrarla al volver. */
export function guardarBorrador(borrador: BorradorCompra) {
    try {
        sessionStorage.setItem(KEY_BORRADOR, JSON.stringify(borrador))
        window.history.replaceState(window.history.state, '', '/inventory/purchase?borrador=1')
    } catch {
        // Modo privado: al volver, la compra abrirá vacía
    }
}

/** Lo lee una sola vez, como el pedido. */
export function tomarBorrador(): BorradorCompra | null {
    try {
        const raw = sessionStorage.getItem(KEY_BORRADOR)
        sessionStorage.removeItem(KEY_BORRADOR)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return parsed && Array.isArray(parsed.lineas) ? parsed as BorradorCompra : null
    } catch {
        return null
    }
}

/** Ya se guardó la compra: no queda nada a medias. */
export function olvidarBorrador() {
    try { sessionStorage.removeItem(KEY_BORRADOR) } catch { /* nada que borrar */ }
}
