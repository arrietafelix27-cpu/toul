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
