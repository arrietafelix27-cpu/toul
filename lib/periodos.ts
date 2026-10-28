import { getDateRange } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════
   Los periodos de toda la app, definidos una sola vez.

   "Esta semana" es de lunes a hoy, "Este mes" del día 1 a hoy y
   "Este año" del 1 de enero a hoy. Para comparar, se usa el mismo
   tramo del periodo anterior: hoy contra ayer hasta esta hora, la
   semana contra la pasada hasta este mismo día, el mes contra el mes
   pasado hasta este mismo día y el año contra el año pasado hasta
   esta misma fecha.
   ══════════════════════════════════════════════════════════════ */

export type Periodo = 'today' | 'week' | 'month' | 'year' | 'total' | 'custom'
export type Rango = { from: string; to: string } | null
export interface Tramo { from: string | null; to: string | null }

/** Desde y hasta del periodo, en la hora del equipo */
export function rangoPeriodo(period: Periodo, rango: Rango): Tramo {
    if (period === 'custom') return rango ?? getDateRange('month')
    return getDateRange(period)
}

/** El mismo día y hora, `meses` atrás. Si ese día no existe, el último
 *  del mes (31 de marzo → 28 de febrero) */
function mesesAtras(d: Date, meses: number): Date {
    const x = new Date(d)
    x.setDate(1)
    x.setMonth(x.getMonth() - meses)
    const ultimo = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
    x.setDate(Math.min(d.getDate(), ultimo))
    return x
}

/** El mismo tramo del periodo anterior, para que la comparación sea justa */
export function rangoAnterior(period: Periodo, actual: Tramo): Tramo {
    if (!actual.from || !actual.to) return { from: null, to: null }

    const start = new Date(actual.from)
    const end = new Date(actual.to)
    const atras = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() - dias); return x }

    if (period === 'today') return { from: atras(start, 1).toISOString(), to: atras(end, 1).toISOString() }
    if (period === 'week') return { from: atras(start, 7).toISOString(), to: atras(end, 7).toISOString() }
    if (period === 'month') {
        const desde = new Date(start.getFullYear(), start.getMonth() - 1, 1)
        return { from: desde.toISOString(), to: mesesAtras(end, 1).toISOString() }
    }
    if (period === 'year') {
        const desde = new Date(start.getFullYear() - 1, 0, 1)
        return { from: desde.toISOString(), to: mesesAtras(end, 12).toISOString() }
    }

    // Unas fechas elegidas: los mismos días, justo antes
    const diff = end.getTime() - start.getTime()
    return { from: new Date(start.getTime() - diff).toISOString(), to: actual.from }
}

const mes = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')

/** "15 – 20 oct", "28 sep – 3 oct" o "26 oct" si es un solo día */
export function textoRango(desde: Date, hasta: Date): string {
    if (desde.toDateString() === hasta.toDateString()) return `${desde.getDate()} ${mes(desde)}`
    return desde.getMonth() === hasta.getMonth() && desde.getFullYear() === hasta.getFullYear()
        ? `${desde.getDate()} – ${hasta.getDate()} ${mes(hasta)}`
        : `${desde.getDate()} ${mes(desde)} – ${hasta.getDate()} ${mes(hasta)}`
}

/** Contra qué se compara: "vs ayer", "vs semana pasada", "vs 1 – 26 sep", "vs 1 ene – 27 oct 2025" */
export function contraQue(period: Periodo, actual: Tramo): string {
    if (period === 'today') return 'vs ayer'
    if (period === 'week') return 'vs semana pasada'
    const prev = rangoAnterior(period, actual)
    if (!prev.from || !prev.to) return ''
    // Unas fechas elegidas terminan justo donde empiezan las de ahora
    const hasta = period === 'custom' ? new Date(new Date(prev.to).getTime() - 1) : new Date(prev.to)
    const texto = textoRango(new Date(prev.from), hasta)
    return period === 'year' ? `vs ${texto} ${hasta.getFullYear()}` : `vs ${texto}`
}

/** Para pasar el periodo por la dirección: /reportes?periodo=month */
export const PERIODOS_URL: Periodo[] = ['today', 'week', 'month', 'year', 'custom']
