/* ══════════════════════════════════════════════════════════════
   Las cuentas de Reportes que no dependen de la base de datos.

   Sin imports a propósito: así las pruebas corren con node directo
   (npm run test:calculos).
   ══════════════════════════════════════════════════════════════ */

export type PeriodoReporte = 'today' | 'week' | 'month' | 'year' | 'total' | 'custom'

/** "$1,9 M", "$850 mil", "$4.500" */
export function formatoCorto(monto: number): string {
    const n = Math.round(monto)
    const signo = n < 0 ? '−' : ''
    const a = Math.abs(n)
    if (a >= 1_000_000) return `${signo}$${(a / 1_000_000).toFixed(1).replace('.', ',')} M`
    if (a >= 1_000) return `${signo}$${Math.round(a / 1_000)} mil`
    return `${signo}$${a}`
}

/** Cuánto cambió contra el periodo anterior, en %. null cuando la
 *  comparación no dice nada: antes no hubo ventas, antes no se ganó
 *  (crecer desde cero o desde una pérdida no es un porcentaje), o lo de
 *  antes es tan poquito que el número sale absurdo (+2905%). */
export function porcentajeTendencia({ ahora, antes, ventasAntes }: {
    ahora: number
    antes: number
    /** Cuántas ventas hubo en el periodo anterior */
    ventasAntes: number
}): number | null {
    if (ventasAntes <= 0) return null
    if (antes <= 0) return null
    if (ahora > 0 && antes < ahora / 10) return null
    return Math.round(((ahora - antes) / antes) * 100)
}

const DIA = 86_400_000
/* Colombia siempre es UTC−5. Va copiado de lib/periodos porque este
   archivo no puede importar nada (las pruebas lo corren con node) */
const DESFASE_COLOMBIA = 5 * 3_600_000
/** Año, mes y día que marca un reloj en Colombia, como una fecha UTC */
const diaEnColombia = (t: Date) => {
    const x = new Date(t.getTime() - DESFASE_COLOMBIA)
    return { ano: x.getUTCFullYear(), mes: x.getUTCMonth(), dia: x.getUTCDate(), utc: Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) }
}

/** Días del periodo en curso: la semana, el mes o el año completos, en Colombia */
function diasDelPeriodo(periodo: PeriodoReporte, desde: Date): number | null {
    const d = diaEnColombia(desde)
    if (periodo === 'week') return 7
    if (periodo === 'month') return new Date(Date.UTC(d.ano, d.mes + 1, 0)).getUTCDate()
    if (periodo === 'year') {
        const y = d.ano
        return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365
    }
    return null
}

/** A este ritmo, cuánto ganarías al cerrar el periodo: lo ganado ÷ días
 *  que van × días del periodo. Solo para la semana, el mes o el año en
 *  curso, con al menos 3 días andados, y si vas ganando. Los días se
 *  cuentan en hora de Colombia. */
export function proyeccion({ periodo, desde, ahora, ganado }: {
    periodo: PeriodoReporte
    /** Dónde arranca el periodo (lunes, día 1, 1 de enero) */
    desde: Date
    ahora: Date
    ganado: number
}): number | null {
    const total = diasDelPeriodo(periodo, desde)
    if (total === null) return null
    if (ganado <= 0) return null
    // El día de hoy cuenta como andado
    const van = Math.round((diaEnColombia(ahora).utc - diaEnColombia(desde).utc) / DIA) + 1
    if (van < 3 || van > total) return null
    return Math.round((ganado / van) * total)
}

export interface DeCada100 {
    /** Lo que dicen los rótulos: "Se fue en mercancía $44" */
    mercancia: number
    gastos: number
    quedo: number
    /** Gastaste más de lo que te dejaron las ventas */
    perdida: boolean
    /** Los tres tramos de la barra; siempre suman 100 */
    barra: { mercancia: number; gastos: number; quedo: number }
}

/** Reparte 100 entre partes, redondeando sin que la suma se corra:
 *  el que perdió más decimales se lleva lo que falta */
function repartir100(partes: number[]): number[] {
    const total = partes.reduce((s, p) => s + p, 0)
    if (total <= 0) return partes.map(() => 0)
    const exactos = partes.map(p => (p / total) * 100)
    const enteros = exactos.map(Math.floor)
    let falta = 100 - enteros.reduce((s, n) => s + n, 0)
    const orden = exactos
        .map((x, i) => ({ i, resto: x - Math.floor(x) }))
        .sort((a, b) => b.resto - a.resto)
    for (const { i } of orden) {
        if (falta <= 0) break
        enteros[i]++
        falta--
    }
    return enteros
}

/** De cada $100 que vendiste: cuánto se fue en mercancía, cuánto en
 *  gastos y cuánto te quedó. Sin ventas no hay nada que repartir. */
export function deCada100({ ventas, costo, gastos }: { ventas: number; costo: number; gastos: number }): DeCada100 | null {
    if (ventas <= 0) return null
    const c = Math.max(costo, 0)
    const g = Math.max(gastos, 0)
    const quedo = ventas - c - g

    if (quedo >= 0) {
        const [mercancia, gastosN, quedoN] = repartir100([c, g, quedo])
        return {
            mercancia, gastos: gastosN, quedo: quedoN, perdida: false,
            barra: { mercancia, gastos: gastosN, quedo: quedoN },
        }
    }

    // Se fue más de lo que entró: los rótulos dicen lo real (pueden pasar
    // de 100) y la barra reparte el 100 entre mercancía y gastos
    const [bm, bg] = repartir100([c, g])
    return {
        mercancia: Math.round((c / ventas) * 100),
        gastos: Math.round((g / ventas) * 100),
        quedo: 0,
        perdida: true,
        barra: { mercancia: bm, gastos: bg, quedo: 0 },
    }
}

/** Agrupa lo que pasa de `max` en "Otros": muestra max − 1 y junta el resto */
export function conOtros<T extends { monto: number }>(filas: T[], max: number, otros: (monto: number) => T): T[] {
    if (filas.length <= max) return filas
    const resto = filas.slice(max - 1).reduce((s, f) => s + f.monto, 0)
    return [...filas.slice(0, max - 1), otros(resto)]
}

/** Lo que muestra Reportes (y el Inicio), sacado de lo que devuelve toul_reporte */
export interface ResumenReporte {
    /** Vendiste: lo vendido menos lo devuelto. Es el mismo en toda la app */
    vendiste: number
    /** Lo vendido antes de devoluciones: De contado + A crédito */
    ventasAntes: number
    contado: number
    credito: number
    /** Lo devuelto, a precio de venta */
    devoluciones: number
    abonos: number
    /** De contado + abonos */
    entro: number
    gastos: number
    mercancia: number
    /** La plata que salió por devoluciones */
    devuelto: number
    /** Gastos + mercancía que pagaste + devoluciones */
    salio: number
    /** Lo que costó la mercancía vendida, menos la devuelta */
    costoNeto: number
    /** Ganancia en ventas: vendiste − costo */
    gananciaVentas: number
    /** Ganancia en ventas − gastos */
    ganaste: number
    cantidad: number
    /** % de lo vendido que te quedó como ganancia en ventas */
    margen: number | null
    /** Vendiste ÷ número de ventas */
    ticket: number | null
    /** % de lo vendido (antes de devoluciones) que quedó fiado */
    pctCredito: number | null
}

export function resumir(r: {
    ventas: { total: number; cantidad: number; contado: number; credito: number; costo: number }
    devoluciones: { total: number; costo: number; reembolsado: number }
    abonos: number
    gastos: number
    mercanciaPagada: number
}): ResumenReporte {
    const n = (v: unknown) => Number(v) || 0
    const ventasAntes = n(r.ventas.total)
    const contado = n(r.ventas.contado)
    const credito = n(r.ventas.credito)
    const cantidad = n(r.ventas.cantidad)
    const abonos = n(r.abonos)
    const gastos = n(r.gastos)
    const mercancia = n(r.mercanciaPagada)
    const devuelto = n(r.devoluciones.reembolsado)
    const devoluciones = n(r.devoluciones.total)
    const vendiste = ventasAntes - devoluciones
    const costoNeto = n(r.ventas.costo) - n(r.devoluciones.costo)
    const gananciaVentas = vendiste - costoNeto
    return {
        vendiste, ventasAntes, contado, credito, devoluciones, abonos,
        entro: contado + abonos,
        gastos, mercancia, devuelto,
        salio: gastos + mercancia + devuelto,
        costoNeto, gananciaVentas,
        ganaste: gananciaVentas - gastos,
        cantidad,
        margen: vendiste > 0 ? Math.round((gananciaVentas / vendiste) * 100) : null,
        ticket: cantidad > 0 ? Math.round(vendiste / cantidad) : null,
        pctCredito: ventasAntes > 0 ? Math.round((credito / ventasAntes) * 100) : null,
    }
}

/** "71%", y "menos de 1%" cuando es algo pero no alcanza al 1% (redondeado diría 0%) */
export function textoPorcentaje(parte: number, total: number): string {
    if (total <= 0) return '0%'
    const exacto = (parte / total) * 100
    if (exacto > 0 && exacto < 1) return 'menos de 1%'
    return `${Math.round(exacto)}%`
}

/* ─── La línea del gráfico del Inicio ─────────────────────────────
   Lo vendido acumulado: sube con cada venta y baja con cada devolución,
   así termina exacto en "Vendiste". Sale de toul_reporte(desde, hasta,
   paso), que entrega lo acumulado al terminar cada hora o cada día de
   Colombia en que pasó algo.

   · Hoy va por hora y el eje es el reloj: un punto en cada hora en
     punto y el último, ahora. Arranca una hora antes de la primera venta.
   · Los demás periodos van por día (por semana si pasan de 120 días):
     cada punto es lo que llevabas al terminar ese día, y el último,
     hasta ahora o hasta el final de las fechas. Arranca el día antes de
     la primera venta.
   · La línea del periodo anterior va por posición: el día 1 contra el
     día 1. Termina en lo vendido en el periodo anterior equivalente.
   ─────────────────────────────────────────────────────────────── */

/** Una hora o un día de toul_reporte(..., paso).serie */
export interface TramoLinea {
    /** Cuándo empieza esa hora o ese día */
    t: string
    /** Lo vendido menos lo devuelto, desde el inicio del periodo hasta el final de este tramo */
    acumulado: number
    ventas?: number
}

export type PasoLinea = 'hora' | 'dia' | 'semana'

export interface PuntoLinea {
    /** Posición en el eje: horas desde la medianoche (Hoy) o número del día o de la semana del periodo */
    x: number
    /** Lo que llevabas en ese punto */
    valor: number
    /** El momento que cuenta: la hora en punto (Hoy), el final del día o de la semana, o el último momento */
    t: number
    /** Cae antes del periodo: se dibuja, pero no se lee */
    fuera: boolean
}

export interface LineaInicio {
    paso: PasoLinea
    actual: PuntoLinea[]
    /** null en Hoy: no se compara */
    anterior: PuntoLinea[] | null
    /** Dónde empieza y dónde termina el eje */
    desde: number
    hasta: number
    /** El periodo no tuvo ventas ni devoluciones: la línea es la base en cero */
    vacia: boolean
}

const HORA = 3_600_000

type Tramo = { t: number; acumulado: number }
const ordenar = (serie: TramoLinea[]): Tramo[] =>
    serie.map(s => ({ t: Date.parse(s.t), acumulado: Math.round(Number(s.acumulado) || 0) })).sort((a, b) => a.t - b.t)
/** Lo que llevabas justo antes de `t`: el acumulado del último tramo que ya terminó */
const llevabasAntesDe = (tramos: Tramo[], t: number) => {
    let valor = 0
    for (const tramo of tramos) {
        if (tramo.t >= t) break
        valor = tramo.acumulado
    }
    return valor
}
/** Todo el periodo: el acumulado del último tramo */
const total = (tramos: Tramo[]) => tramos.length ? tramos[tramos.length - 1].acumulado : 0

export function lineaAcumulada({ paso, desde, hasta, serie, anterior = null }: {
    paso: 'hora' | 'dia'
    /** El inicio del periodo: medianoche en Colombia */
    desde: string
    /** Ahora, o el final de las fechas si ya pasaron */
    hasta: string
    serie: TramoLinea[]
    /** El periodo anterior equivalente (no aplica en Hoy) */
    anterior?: { desde: string; hasta: string; serie: TramoLinea[] } | null
}): LineaInicio {
    const d0 = Date.parse(desde)
    const d1 = Date.parse(hasta)
    const tramos = ordenar(serie)

    if (paso === 'hora') {
        // Una hora antes de la primera venta, sin salirse del día
        const origen = tramos.length ? Math.max(d0, tramos[0].t - HORA) : d0
        const actual: PuntoLinea[] = []
        for (let t = origen; t < d1; t += HORA) {
            actual.push({ x: (t - d0) / HORA, valor: llevabasAntesDe(tramos, t), t, fuera: false })
        }
        actual.push({ x: (d1 - d0) / HORA, valor: total(tramos), t: d1, fuera: false })
        // A la medianoche en punto todavía no hay una hora que mostrar
        if (actual.length === 1) actual.unshift({ x: actual[0].x - 1, valor: 0, t: d1 - HORA, fuera: true })
        return { paso: 'hora', actual, anterior: null, desde: actual[0].x, hasta: actual[actual.length - 1].x, vacia: tramos.length === 0 }
    }

    const antes = anterior ? { d0: Date.parse(anterior.desde), d1: Date.parse(anterior.hasta), tramos: ordenar(anterior.serie) } : null
    const diaDe = (t: number, base: number) => Math.floor((t - base) / DIA)
    const ultimoDia = diaDe(d1, d0)
    // Arranca el día antes de la primera venta. Sin ventas, donde arranca
    // la línea anterior, que queda de referencia
    const primerDia = tramos.length ? diaDe(tramos[0].t, d0)
        : antes?.tramos.length ? diaDe(antes.tramos[0].t, antes.d0) : null
    const porSemana = ultimoDia - (primerDia === null ? 0 : primerDia - 1) > 120
    const dias = porSemana ? 7 : 1

    const ultimo = Math.floor(ultimoDia / dias)
    let origen = primerDia === null ? 0 : Math.floor(primerDia / dias) - 1
    if (origen >= ultimo) origen = ultimo - 1

    /** Los puntos de una línea: el acumulado al terminar cada día (o semana) */
    const puntos = (base: number, fin: number, lista: Tramo[]): PuntoLinea[] => {
        const hastaI = Math.floor(diaDe(fin, base) / dias)
        const res: PuntoLinea[] = []
        for (let i = origen; i <= hastaI; i++) {
            const termina = base + (i + 1) * dias * DIA
            res.push(i === hastaI
                ? { x: i, valor: total(lista), t: fin, fuera: i < 0 }
                : { x: i, valor: llevabasAntesDe(lista, termina), t: termina - 1, fuera: i < 0 })
        }
        return res
    }

    const actual = puntos(d0, d1, tramos)
    const lineaAntes = antes ? puntos(antes.d0, antes.d1, antes.tramos) : null
    const fin = Math.max(ultimo, lineaAntes?.length ? lineaAntes[lineaAntes.length - 1].x : ultimo)
    return {
        paso: porSemana ? 'semana' : 'dia',
        actual,
        anterior: lineaAntes && lineaAntes.length ? lineaAntes : null,
        desde: origen,
        hasta: fin,
        vacia: tramos.length === 0,
    }
}
