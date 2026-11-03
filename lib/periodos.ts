/* ══════════════════════════════════════════════════════════════
   Los periodos de toda la app, definidos una sola vez y siempre en
   hora de Colombia, sin importar la zona horaria del celular, del
   computador o del servidor.

   "Esta semana" es de lunes a hoy, "Este mes" del día 1 a hoy y
   "Este año" del 1 de enero a hoy. Para comparar, se usa el mismo
   tramo del periodo anterior: hoy contra ayer hasta esta hora, la
   semana contra la pasada hasta este mismo día, el mes contra el mes
   pasado hasta este mismo día y el año contra el año pasado hasta
   esta misma fecha. Unas fechas elegidas que son meses completos se
   comparan contra los meses completos de antes.

   Sin imports a propósito: así las pruebas corren con node directo.
   ══════════════════════════════════════════════════════════════ */

export type Periodo = 'today' | 'week' | 'month' | 'year' | 'total' | 'custom'
export type Rango = { from: string; to: string } | null
export interface Tramo { from: string | null; to: string | null }

/* ── La hora de Colombia ─────────────────────────────────────── */

/** Colombia no cambia la hora en el año: siempre es UTC−5 */
export const ZONA_COLOMBIA = 'America/Bogota'
const DESFASE = 5 * 3_600_000
const DIA = 86_400_000

export interface PartesColombia {
    ano: number
    /** 0 = enero */
    mes: number
    dia: number
    hora: number
    minuto: number
    /** 0 = domingo */
    semana: number
}

/** La fecha y la hora que marca un reloj en Colombia en ese instante */
export function enColombia(t: Date | number | string): PartesColombia {
    const x = new Date(new Date(t).getTime() - DESFASE)
    return {
        ano: x.getUTCFullYear(), mes: x.getUTCMonth(), dia: x.getUTCDate(),
        hora: x.getUTCHours(), minuto: x.getUTCMinutes(), semana: x.getUTCDay(),
    }
}

/** El instante en que un reloj de Colombia marca esa fecha y hora.
 *  Acepta días y meses por fuera de rango (día 0 = último del mes anterior) */
export function instanteColombia(ano: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0, ms = 0): Date {
    return new Date(Date.UTC(ano, mes, dia, hora, minuto, segundo, ms) + DESFASE)
}

/** Medianoche en Colombia del día de ese instante */
export function inicioDiaColombia(t: Date | number | string): Date {
    const p = enColombia(t)
    return instanteColombia(p.ano, p.mes, p.dia)
}

/** '2026-10-27': el día en Colombia de ese instante */
export function diaColombia(t: Date | number | string): string {
    const p = enColombia(t)
    return `${p.ano}-${String(p.mes + 1).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/** Un día escrito '2026-10-27': su primer instante, o el último con `fin` */
export function instanteDeDia(dia: string, fin = false): Date {
    const [ano, mes, d] = dia.split('-').map(Number)
    return fin ? instanteColombia(ano, mes - 1, d, 23, 59, 59, 999) : instanteColombia(ano, mes - 1, d)
}

/** Cuántos días de calendario de Colombia van de `a` a `b` (hoy − ayer = 1) */
export function diasEntre(a: Date | number | string, b: Date | number | string): number {
    return Math.round((inicioDiaColombia(b).getTime() - inicioDiaColombia(a).getTime()) / DIA)
}

/** Fecha o mes formateados como en Colombia: { month: 'short' } → "oct" */
export function formatoColombia(t: Date | number | string, opciones: Intl.DateTimeFormatOptions): string {
    return new Date(t).toLocaleDateString('es-CO', { ...opciones, timeZone: ZONA_COLOMBIA }).replace('.', '')
}

/* ── Los periodos ────────────────────────────────────────────── */

/** Desde y hasta de cada periodo, en hora de Colombia. La semana va de lunes a hoy */
export function getDateRange(period: Periodo, ahora: Date = new Date()): Tramo {
    const p = enColombia(ahora)
    const to = ahora.toISOString()
    if (period === 'today') return { from: instanteColombia(p.ano, p.mes, p.dia).toISOString(), to }
    if (period === 'week') {
        const desdeElLunes = (p.semana + 6) % 7
        return { from: instanteColombia(p.ano, p.mes, p.dia - desdeElLunes).toISOString(), to }
    }
    if (period === 'month') return { from: instanteColombia(p.ano, p.mes, 1).toISOString(), to }
    if (period === 'year') return { from: instanteColombia(p.ano, 0, 1).toISOString(), to }
    return { from: null, to: null }
}

/** Desde y hasta del periodo elegido */
export function rangoPeriodo(period: Periodo, rango: Rango, ahora: Date = new Date()): Tramo {
    if (period === 'custom') return rango ?? getDateRange('month', ahora)
    return getDateRange(period, ahora)
}

/** El mismo día y la misma hora de Colombia, `meses` atrás. Si ese día no
 *  existe, el último del mes (31 de marzo → 28 de febrero) */
function mesesAtras(t: Date, meses: number): Date {
    const p = enColombia(t)
    const enElDia = t.getTime() - inicioDiaColombia(t).getTime()
    const ultimo = enColombia(instanteColombia(p.ano, p.mes - meses + 1, 0)).dia
    return new Date(instanteColombia(p.ano, p.mes - meses, Math.min(p.dia, ultimo)).getTime() + enElDia)
}

/** ¿Va del primer instante de un mes al último segundo de otro? Cuántos meses son */
function mesesCompletos(desde: Date, hasta: Date): number | null {
    const d = enColombia(desde)
    if (desde.getTime() !== instanteColombia(d.ano, d.mes, 1).getTime()) return null
    // "Hasta" puede ser 23:59:59 o 23:59:59.999: lo que importa es que el
    // mes siguiente empiece en menos de un segundo
    const h = enColombia(new Date(hasta.getTime() + 1000))
    const siguiente = instanteColombia(h.ano, h.mes, 1).getTime()
    const falta = siguiente - hasta.getTime()
    if (falta <= 0 || falta > 1000) return null
    const meses = (h.ano - d.ano) * 12 + (h.mes - d.mes)
    return meses > 0 ? meses : null
}

/** El mismo tramo del periodo anterior, para que la comparación sea justa */
export function rangoAnterior(period: Periodo, actual: Tramo): Tramo {
    if (!actual.from || !actual.to) return { from: null, to: null }

    const start = new Date(actual.from)
    const end = new Date(actual.to)
    const s = enColombia(start)

    // Colombia no tiene cambio de hora: un día son siempre 24 horas
    if (period === 'today') return { from: new Date(start.getTime() - DIA).toISOString(), to: new Date(end.getTime() - DIA).toISOString() }
    if (period === 'week') return { from: new Date(start.getTime() - 7 * DIA).toISOString(), to: new Date(end.getTime() - 7 * DIA).toISOString() }
    if (period === 'month') {
        return { from: instanteColombia(s.ano, s.mes - 1, 1).toISOString(), to: mesesAtras(end, 1).toISOString() }
    }
    if (period === 'year') {
        return { from: instanteColombia(s.ano - 1, 0, 1).toISOString(), to: mesesAtras(end, 12).toISOString() }
    }

    // Meses completos (1 al 31 de octubre): los mismos meses completos de antes
    const meses = mesesCompletos(start, end)
    if (meses !== null) {
        const desde = instanteColombia(s.ano, s.mes - meses, 1)
        return { from: desde.toISOString(), to: new Date(start.getTime() - 1).toISOString() }
    }

    // Otras fechas elegidas: los mismos días, justo antes
    const diff = end.getTime() - start.getTime()
    return { from: new Date(start.getTime() - diff - 1).toISOString(), to: new Date(start.getTime() - 1).toISOString() }
}

/** "15 – 20 oct", "28 sept – 3 oct" o "26 oct" si es un solo día, en hora de Colombia */
export function textoRango(desde: Date, hasta: Date): string {
    const d = enColombia(desde)
    const h = enColombia(hasta)
    const mes = (t: Date) => formatoColombia(t, { month: 'short' })
    if (d.ano === h.ano && d.mes === h.mes && d.dia === h.dia) return `${d.dia} ${mes(desde)}`
    return d.mes === h.mes && d.ano === h.ano
        ? `${d.dia} – ${h.dia} ${mes(hasta)}`
        : `${d.dia} ${mes(desde)} – ${h.dia} ${mes(hasta)}`
}

/** Contra qué se compara: "vs ayer", "vs semana pasada", "vs 1 – 26 sept", "vs 1 ene – 27 oct 2025" */
export function contraQue(period: Periodo, actual: Tramo): string {
    if (period === 'today') return 'vs ayer'
    if (period === 'week') return 'vs semana pasada'
    const prev = rangoAnterior(period, actual)
    if (!prev.from || !prev.to) return ''
    const hasta = new Date(prev.to)
    const texto = textoRango(new Date(prev.from), hasta)
    return period === 'year' ? `vs ${texto} ${enColombia(hasta).ano}` : `vs ${texto}`
}

/** Para pasar el periodo por la dirección: /reportes?periodo=month */
export const PERIODOS_URL: Periodo[] = ['today', 'week', 'month', 'year', 'custom']

/* ── El periodo en la dirección ──────────────────────────────── */

/** "periodo=month" o "periodo=custom&desde=2026-10-01&hasta=2026-10-31" (días de Colombia).
 *  Así Reportes abre Ventas, Gastos o Movimientos en el mismo periodo */
export function periodoEnDireccion(periodo: Periodo, tramo: Tramo): string {
    if (periodo === 'today' || periodo === 'week' || periodo === 'month' || periodo === 'year' || periodo === 'total') {
        return `periodo=${periodo}`
    }
    const desde = tramo.from ? diaColombia(tramo.from) : diaColombia(new Date())
    const hasta = diaColombia(tramo.to ?? new Date())
    return `periodo=custom&desde=${desde}&hasta=${hasta}`
}

/** Lo contrario: el periodo que trae la dirección, si trae uno válido */
export function periodoDeDireccion(params: { get(nombre: string): string | null }): { periodo: Periodo; desde: string; hasta: string } | null {
    const p = params.get('periodo')
    const dia = /^\d{4}-\d{2}-\d{2}$/
    const desde = params.get('desde') ?? ''
    const hasta = params.get('hasta') ?? ''
    if (p === 'custom') return dia.test(desde) && dia.test(hasta) ? { periodo: 'custom', desde, hasta } : null
    if (p === 'today' || p === 'week' || p === 'month' || p === 'year' || p === 'total') return { periodo: p, desde: '', hasta: '' }
    return null
}

/** Desde y hasta de unas fechas elegidas como días de Colombia */
export function tramoDeDias(desde: string, hasta: string): Tramo {
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde]
    return { from: instanteDeDia(a).toISOString(), to: instanteDeDia(b, true).toISOString() }
}
