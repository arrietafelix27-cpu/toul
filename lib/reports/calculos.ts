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

/** Días del periodo en curso: la semana, el mes o el año completos */
function diasDelPeriodo(periodo: PeriodoReporte, desde: Date): number | null {
    if (periodo === 'week') return 7
    if (periodo === 'month') return new Date(desde.getFullYear(), desde.getMonth() + 1, 0).getDate()
    if (periodo === 'year') {
        const y = desde.getFullYear()
        return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365
    }
    return null
}

/** A este ritmo, cuánto ganarías al cerrar el periodo: lo ganado ÷ días
 *  que van × días del periodo. Solo para la semana, el mes o el año en
 *  curso, con al menos 3 días andados, y si vas ganando. */
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
    const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate())
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    // El día de hoy cuenta como andado
    const van = Math.round((hoy.getTime() - inicio.getTime()) / DIA) + 1
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

/** Lo que muestra Reportes, sacado de lo que devuelve toul_reporte */
export interface ResumenReporte {
    vendiste: number
    contado: number
    credito: number
    abonos: number
    /** De contado + abonos */
    entro: number
    gastos: number
    mercancia: number
    devuelto: number
    /** Gastos + mercancía que pagaste + devoluciones */
    salio: number
    /** Lo vendido menos lo devuelto */
    ventasNetas: number
    costoNeto: number
    /** Ganancia en ventas: ventas netas − costo neto */
    gananciaVentas: number
    /** Ganancia en ventas − gastos */
    ganaste: number
    cantidad: number
    /** % de lo vendido que te quedó como ganancia en ventas */
    margen: number | null
    ticket: number | null
    /** % de lo vendido que quedó fiado */
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
    const vendiste = n(r.ventas.total)
    const contado = n(r.ventas.contado)
    const credito = n(r.ventas.credito)
    const cantidad = n(r.ventas.cantidad)
    const abonos = n(r.abonos)
    const gastos = n(r.gastos)
    const mercancia = n(r.mercanciaPagada)
    const devuelto = n(r.devoluciones.reembolsado)
    const ventasNetas = vendiste - n(r.devoluciones.total)
    const costoNeto = n(r.ventas.costo) - n(r.devoluciones.costo)
    const gananciaVentas = ventasNetas - costoNeto
    return {
        vendiste, contado, credito, abonos,
        entro: contado + abonos,
        gastos, mercancia, devuelto,
        salio: gastos + mercancia + devuelto,
        ventasNetas, costoNeto, gananciaVentas,
        ganaste: gananciaVentas - gastos,
        cantidad,
        margen: ventasNetas > 0 ? Math.round((gananciaVentas / ventasNetas) * 100) : null,
        ticket: cantidad > 0 ? Math.round(vendiste / cantidad) : null,
        pctCredito: vendiste > 0 ? Math.round((credito / vendiste) * 100) : null,
    }
}
