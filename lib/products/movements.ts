/** Nombres de los movimientos de inventario, en lenguaje del negocio. */
export const REASON_LABEL: Record<string, string> = {
    sale: 'Venta',
    purchase: 'Compra',
    reduction: 'Baja o merma',
    count: 'Conteo de inventario',
    void: 'Anulación de venta',
    initial: 'Stock inicial',
    reconciliation: 'Ajuste del sistema',
    damage: 'Daño o avería',
    loss: 'Pérdida',
    theft: 'Robo',
    expired: 'Vencimiento',
    other: 'Ajuste manual',
}

export const formatMovementDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
