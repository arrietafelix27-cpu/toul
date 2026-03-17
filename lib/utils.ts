/**
 * TOUL — Utility functions
 */

/** Format number as Colombian Peso */
export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount)
}

/** Format percentage change */
export function formatPct(value: number): string {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
}

/** Format date range label */
export function getPeriodLabel(period: 'today' | 'week' | 'month' | 'total'): string {
    const map = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', total: 'Siempre' }
    return map[period]
}

/** Get date range for a period */
export function getDateRange(period: 'today' | 'week' | 'month' | 'total'): { from: string | null; to: string | null } {
    const now = new Date()
    if (period === 'total') return { from: null, to: null }
    if (period === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        return { from: start.toISOString(), to: now.toISOString() }
    }
    if (period === 'week') {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1)
        const start = new Date(now.setDate(diff))
        start.setHours(0, 0, 0, 0)
        return { from: start.toISOString(), to: new Date().toISOString() }
    }
    if (period === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        return { from: start.toISOString(), to: new Date().toISOString() }
    }
    return { from: null, to: null }
}

/** Calculate CPP: (currentStock * currentCpp + newQty * newCost) / (currentStock + newQty) */
export function calculateCPP(currentStock: number, currentCpp: number, newQty: number, newCost: number): number {
    if (currentStock + newQty === 0) return 0
    return (currentStock * currentCpp + newQty * newCost) / (currentStock + newQty)
}

/** Short date format */
export function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Truncate text */
export function truncate(str: string, n: number): string {
    return str.length > n ? str.slice(0, n - 1) + '…' : str
}
