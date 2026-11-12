/**
 * TOUL — Utility functions
 */

/**
 * Plata en pesos. Siempre redondea, para que no salgan decimales raros.
 *
 * Cuando el dato no llegó —una consulta que falló, un campo que la base
 * todavía no devuelve— antes salía "$ NaN" en pantalla. Ahora sale una
 * raya: decir "no sé" es honesto, decir "$0" sería mentir.
 * Un null sí vale cero: así lo guarda la base cuando no hay plata.
 *
 * Sin espacio después del signo, en toda la app: "$2.497.600", no
 * "$ 2.497.600" (el formato de Colombia mete un espacio que no se parte)
 */
const PESOS = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
})

export function formatCOP(amount: number | null | undefined): string {
    const valor = Number(amount)
    if (!Number.isFinite(valor)) return '—'
    return PESOS.format(Math.round(valor)).replace(/\s/g, '')
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

/** "$200.000": hoy es lo mismo que formatCOP (ya no deja espacio); se queda
 *  porque Inicio, Reportes y Movimientos lo usan */
export function formatPrecio(amount: number | null | undefined): string {
    return formatCOP(amount)
}

/** Desde y hasta de cada periodo, en hora de Colombia: vive en lib/periodos */
export { getDateRange } from '@/lib/periodos'

/** Calculate CPP: (currentStock * currentCpp + newQty * newCost) / (currentStock + newQty) */
export function calculateCPP(currentStock: number, currentCpp: number, newQty: number, newCost: number): number {
    if (currentStock + newQty === 0) return 0
    return (currentStock * currentCpp + newQty * newCost) / (currentStock + newQty)
}

/** Short date format */
export function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' })
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
