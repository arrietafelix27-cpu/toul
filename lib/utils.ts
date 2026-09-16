/**
 * TOUL — Utility functions
 */

/** Format number as Colombian Peso — always rounds to prevent FP artifacts */
export function formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(Math.round(amount))
}

/** Format percentage change */
export function formatPct(value: number): string {
    const sign = value >= 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
}

/** Format date range label */
export function getPeriodLabel(period: 'today' | 'week' | 'month' | 'total' | 'custom'): string {
    const map = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', total: 'Siempre', custom: 'Personalizado' }
    return map[period]
}

/** Get date range for a period */
export function getDateRange(period: 'today' | 'week' | 'month' | 'total' | 'custom'): { from: string | null; to: string | null } {
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
/** Calculate days between two dates */
export function getDaysDiff(from: string | null, to: string | null): number {
    if (!from || !to) return 30 // Default to 30 if same or null
    const start = new Date(from)
    const end = new Date(to)
    const diffTime = Math.abs(end.getTime() - start.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays || 1
}

/** Get health status based on variation */
export function getHealthStatus(variation: number): 'healthy' | 'neutral' | 'alert' {
    if (variation > 5) return 'healthy'
    if (variation < -5) return 'alert'
    return 'neutral'
}
