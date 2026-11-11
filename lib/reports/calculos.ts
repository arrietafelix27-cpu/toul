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
    /** Mercancía perdida (dañada, robada, lo que faltó al contar). 0: no se muestra */
    sePerdio: number
    quedo: number
    /** Gastaste más de lo que te dejaron las ventas */
    perdida: boolean
    /** Los tramos de la barra; siempre suman 100 */
    barra: { mercancia: number; gastos: number; sePerdio: number; quedo: number }
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
 *  gastos, cuánto se perdió en mercancía (solo si se perdió más de lo que
 *  se recuperó) y cuánto te quedó. Sin ventas no hay nada que repartir. */
export function deCada100({ ventas, costo, gastos, sePerdio = 0 }: {
    ventas: number; costo: number; gastos: number
    /** Mercancía perdida neta del periodo (perdida − recuperada, si es más que 0) */
    sePerdio?: number
}): DeCada100 | null {
    if (ventas <= 0) return null
    const c = Math.max(costo, 0)
    const g = Math.max(gastos, 0)
    const p = Math.max(sePerdio, 0)
    const quedo = ventas - c - g - p

    if (quedo >= 0) {
        const [mercancia, gastosN, sePerdioN, quedoN] = repartir100([c, g, p, quedo])
        return {
            mercancia, gastos: gastosN, sePerdio: sePerdioN, quedo: quedoN, perdida: false,
            barra: { mercancia, gastos: gastosN, sePerdio: sePerdioN, quedo: quedoN },
        }
    }

    // Se fue más de lo que entró: los rótulos dicen lo real (pueden pasar
    // de 100) y la barra reparte el 100 entre mercancía, gastos y lo perdido
    const [bm, bg, bp] = repartir100([c, g, p])
    return {
        mercancia: Math.round((c / ventas) * 100),
        gastos: Math.round((g / ventas) * 100),
        sePerdio: Math.round((p / ventas) * 100),
        quedo: 0,
        perdida: true,
        barra: { mercancia: bm, gastos: bg, sePerdio: bp, quedo: 0 },
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
    /** Mercancía que salió por daño, pérdida, robo, vencimiento u "Otro", y
     *  lo que faltó al contar, a costo promedio */
    mercanciaPerdida: number
    /** Lo que apareció, el regalo del proveedor, un "Otro" de entrada y lo
     *  que sobró al contar, a costo promedio */
    mercanciaRecuperada: number
    /** Recuperada − perdida. Negativo: "Mercancía perdida"; positivo: "Mercancía recuperada" */
    mercanciaNeta: number
    /** Ganancia en ventas − gastos − mercancía perdida + mercancía recuperada */
    ganaste: number
    cantidad: number
    /** % de lo vendido que te quedó como ganancia en ventas */
    margen: number | null
    /** Vendiste ÷ número de ventas */
    ticket: number | null
    /** % de lo vendido (antes de devoluciones) que quedó fiado */
    pctCredito: number | null
    /** Entre tú y tu negocio: lo que metiste de tu plata. No es ganancia:
     *  no entra en Ganaste ni en la plata que entró */
    metiste: number
    /** Entre tú y tu negocio: lo que sacaste para ti. No es gasto: no entra
     *  en Ganaste ni en la plata que salió */
    sacaste: number
}

export function resumir(r: {
    ventas: { total: number; cantidad: number; contado: number; credito: number; costo: number }
    devoluciones: { total: number; costo: number; reembolsado: number }
    abonos: number
    gastos: number
    mercanciaPagada: number
    /** No vienen si la base todavía no tiene Movimientos */
    metiste?: number
    sacaste?: number
    /** No vienen si la base todavía no tiene la mercancía perdida */
    mercanciaPerdida?: number
    mercanciaRecuperada?: number
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
    const mercanciaPerdida = Math.round(n(r.mercanciaPerdida))
    const mercanciaRecuperada = Math.round(n(r.mercanciaRecuperada))
    const mercanciaNeta = mercanciaRecuperada - mercanciaPerdida
    return {
        vendiste, ventasAntes, contado, credito, devoluciones, abonos,
        entro: contado + abonos,
        gastos, mercancia, devuelto,
        salio: gastos + mercancia + devuelto,
        costoNeto, gananciaVentas,
        mercanciaPerdida, mercanciaRecuperada, mercanciaNeta,
        ganaste: gananciaVentas - gastos + mercanciaNeta,
        cantidad,
        margen: vendiste > 0 ? Math.round((gananciaVentas / vendiste) * 100) : null,
        ticket: cantidad > 0 ? Math.round(vendiste / cantidad) : null,
        pctCredito: ventasAntes > 0 ? Math.round((credito / ventasAntes) * 100) : null,
        metiste: Math.round(n(r.metiste)),
        sacaste: Math.round(n(r.sacaste)),
    }
}

/** "71%", y "menos de 1%" cuando es algo pero no alcanza al 1% (redondeado diría 0%) */
export function textoPorcentaje(parte: number, total: number): string {
    if (total <= 0) return '0%'
    const exacto = (parte / total) * 100
    if (exacto > 0 && exacto < 1) return 'menos de 1%'
    return `${Math.round(exacto)}%`
}

/* ─── El resumen del Inicio ───────────────────────────────────────
   Debajo de "Vendiste": "Ganaste" (el mismo de Reportes) y cuánto es
   de lo que vendiste; los gastos del periodo y lo que quedó fiado.
   Lo devuelto se resta de donde salió: la deuda que se le bajó al
   cliente, de lo fiado. Lo pagado y lo fiado de cada venta (y por
   qué método) viven en Reportes.
   ─────────────────────────────────────────────────────────────── */

export interface ResumenInicio {
    /** Con signo: negativo es "Perdiste" */
    ganaste: number
    /** "42% de lo que vendiste" (sin signo también al perder). null: no hay ventas que dividir */
    deLoVendido: string | null
    gastos: number
    /** Solo se muestra si es más que cero */
    fiado: number
    /** La mercancía perdida menos la recuperada. Solo se muestra si es más que cero */
    sePerdio: number
}

export function resumenInicio(r: ResumenReporte): ResumenInicio {
    // La plata devuelta sale de lo pagado; lo demás de lo devuelto bajó deuda
    const pagado = r.contado - r.devuelto
    return {
        ganaste: Math.round(r.ganaste),
        deLoVendido: r.vendiste > 0 ? `${textoPorcentaje(Math.abs(r.ganaste), r.vendiste)} de lo que vendiste` : null,
        gastos: Math.round(r.gastos),
        fiado: Math.round(r.vendiste - pagado),
        sePerdio: Math.round(Math.max(-r.mercanciaNeta, 0)),
    }
}

/* ─── La línea del gráfico del Inicio ─────────────────────────────
   Lo vendido en cada hora (Hoy), cada día o cada semana: lo vendido
   menos lo devuelto en ese tramo. Sale de toul_reporte(desde, hasta,
   paso), que entrega lo acumulado al terminar cada hora o cada día de
   Colombia en que pasó algo. Lo de cada tramo es la diferencia con el
   anterior, así los tramos suman exacto "Vendiste".

   La línea que se dibuja va SUAVIZADA: cada punto es un promedio
   ponderado de los tramos vecinos (núcleo gaussiano), para que un día
   sin ventas no la tire a cero. Es solo para verla: la etiqueta del
   dedo dice lo REAL de ese tramo. Nunca baja de cero, ni con un día
   de solo devoluciones (ese día la etiqueta sí dice el negativo).

   · Hoy: por hora, suavizado de 0.7 horas, un punto cada 12 minutos.
   · Hasta 7 días: por día, suavizado de 0.55 días.
   · Hasta 62 días: por día, suavizado de 1.4 días.
   · Más de 62 días: por semana, suavizado de 1 semana.
   · Arranca un tramo antes de la primera venta, sin salirse del
     periodo, y termina ahora o al final de las fechas.
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

/** Una hora, un día o una semana, con lo que de verdad se vendió */
export interface TramoVentas {
    /** Dónde empieza y dónde termina en el eje */
    x0: number
    x1: number
    /** Cuándo empieza y cuándo termina (el último, ahora o el final de las fechas) */
    inicio: number
    fin: number
    /** Lo vendido menos lo devuelto en ese tramo. Negativo si solo hubo devoluciones */
    valor: number
    /** Cuántas ventas hubo */
    ventas: number
}

/** Un punto de la línea suavizada */
export interface PuntoSuave {
    x: number
    valor: number
}

export interface LineaInicio {
    paso: PasoLinea
    /** Lo real, tramo por tramo: es lo que dice la etiqueta */
    tramos: TramoVentas[]
    /** Lo que se dibuja */
    puntos: PuntoSuave[]
    /** Dónde empieza y dónde termina el eje: horas desde la medianoche, o días o semanas del periodo */
    desde: number
    hasta: number
    /** El periodo no tuvo ventas ni devoluciones: la línea es la base en cero */
    vacia: boolean
}

const HORA = 3_600_000
const SEMANA = 7 * DIA

/** Cuánto se suaviza, en tramos (sigma del núcleo) */
const SUAVIZADO = { hora: 0.7, corto: 0.55, mes: 1.4, semana: 1 }
/** Cada cuánto va un punto de la línea, en tramos */
const MUESTREO = { hora: 0.2, dia: 0.25, semana: 0.25 }

export function lineaVentas({ paso, desde, hasta, serie }: {
    paso: 'hora' | 'dia'
    /** El inicio del periodo: medianoche en Colombia */
    desde: string
    /** Ahora, o el final de las fechas si ya pasaron */
    hasta: string
    serie: TramoLinea[]
}): LineaInicio {
    const d0 = Date.parse(desde)
    const d1 = Date.parse(hasta)
    // Lo de cada hora o cada día: la diferencia entre dos acumulados
    const movimientos = serie
        .map(s => ({ t: Date.parse(s.t), acumulado: Math.round(Number(s.acumulado) || 0), ventas: Number(s.ventas) || 0 }))
        .sort((a, b) => a.t - b.t)
        .map((s, i, todos) => ({ t: s.t, valor: s.acumulado - (i ? todos[i - 1].acumulado : 0), ventas: s.ventas }))

    const dias = Math.ceil((d1 - d0) / DIA)
    const tipo: PasoLinea = paso === 'hora' ? 'hora' : dias > 62 ? 'semana' : 'dia'
    const unidad = tipo === 'hora' ? HORA : tipo === 'dia' ? DIA : SEMANA
    const sigma = tipo === 'hora' ? SUAVIZADO.hora : tipo === 'semana' ? SUAVIZADO.semana : dias <= 7 ? SUAVIZADO.corto : SUAVIZADO.mes
    const cada = MUESTREO[tipo]

    const fin = Math.max((d1 - d0) / unidad, 0)
    const ultimo = Math.max(Math.ceil(fin) - 1, 0)
    const indice = (t: number) => Math.min(Math.max(Math.floor((t - d0) / unidad), 0), ultimo)
    // Un tramo antes de la primera venta, sin salirse del periodo
    const origen = movimientos.length ? Math.max(indice(movimientos[0].t) - 1, 0) : 0
    // A la medianoche en punto todavía no hay nada que mostrar: un pedacito
    const hastaX = Math.max(fin, origen + cada)

    const tramos: TramoVentas[] = []
    for (let i = origen; i <= ultimo; i++) {
        tramos.push({
            x0: i, x1: Math.min(i + 1, hastaX),
            inicio: d0 + i * unidad, fin: Math.min(d0 + (i + 1) * unidad, d1),
            valor: 0, ventas: 0,
        })
    }
    for (const m of movimientos) {
        const tramo = tramos[indice(m.t) - origen]
        tramo.valor += m.valor
        tramo.ventas += m.ventas
    }

    // El promedio ponderado de los vecinos, alrededor del centro de cada tramo
    const centros = tramos.map(t => (t.x0 + t.x1) / 2)
    const suave = (x: number) => {
        let peso = 0
        let suma = 0
        for (let i = 0; i < tramos.length; i++) {
            const d = (x - centros[i]) / sigma
            if (Math.abs(d) > 4) continue
            const w = Math.exp(-0.5 * d * d)
            peso += w
            suma += w * tramos[i].valor
        }
        return peso > 0 ? Math.max(0, suma / peso) : 0
    }
    const puntos: PuntoSuave[] = []
    for (let k = 0; origen + k * cada < hastaX - cada / 4; k++) puntos.push({ x: origen + k * cada, valor: suave(origen + k * cada) })
    puntos.push({ x: hastaX, valor: suave(hastaX) })

    return { paso: tipo, tramos, puntos, desde: origen, hasta: hastaX, vacia: movimientos.length === 0 }
}

/** El tramo que queda debajo del dedo, por su posición en el eje */
export function tramoEn(linea: LineaInicio, x: number): TramoVentas | null {
    for (const tramo of linea.tramos) if (x < tramo.x1) return tramo
    return linea.tramos.at(-1) ?? null
}
