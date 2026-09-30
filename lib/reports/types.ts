/** Números que responden: ¿gané o perdí?, ¿dónde se me va la plata? */

export interface ReportTotals {
    /** Lo que vendiste (incluye ventas fiadas) */
    revenue: number
    /** Lo que te costó la mercancía que vendiste */
    cogs: number
    /** Ventas − costo de la mercancía */
    grossProfit: number
    /** Gastos del negocio (arriendo, servicios, domicilios…) */
    expenses: number
    /** Ganancia final: bruta − gastos */
    netProfit: number
    /** Margen bruto sobre las ventas, en % */
    grossMargin: number
    salesCount: number
    unitsSold: number
    avgTicket: number
    /** Plata que metiste en mercancía (no es gasto) */
    inventoryPurchases: number
}

export interface CategoryLine {
    label: string
    amount: number
}

export interface ProductLine {
    id: string
    name: string
    units: number
    revenue: number
    profit: number
    margin: number
}

export interface PendingLine {
    id: string
    name: string
    amount: number
}

export interface InventorySnapshot {
    /** Valor de lo que tienes guardado, al costo */
    value: number
    units: number
    lowStock: number
    /** Productos sin vender en el período */
    stale: { id: string; name: string; stock: number; value: number }[]
}

export interface ReportData {
    current: ReportTotals
    previous: ReportTotals
    expensesByCategory: CategoryLine[]
    topProducts: ProductLine[]
    worstProducts: ProductLine[]
    receivables: { total: number; top: PendingLine[] }
    payables: { total: number; top: PendingLine[] }
    inventory: InventorySnapshot
}

export const EMPTY_TOTALS: ReportTotals = {
    revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0,
    grossMargin: 0, salesCount: 0, unitsSold: 0, avgTicket: 0, inventoryPurchases: 0,
}
