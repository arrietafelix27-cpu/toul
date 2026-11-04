// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conOtros, deCada100, formatoCorto, lineaVentas, porcentajeTendencia, proyeccion, resumir, textoPorcentaje, tramoEn, vistasInicio, type Vista } from './calculos.ts'

/** Una fecha y hora de Colombia (UTC−5), sin depender de la zona del equipo que corre la prueba */
const co = (ano: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0) => new Date(Date.UTC(ano, mes, dia, hora, minuto, segundo) + 5 * 3_600_000)

test('De cada $100 suma exactamente 100', () => {
    const casos = [
        { ventas: 3_000_000, costo: 1_320_000, gastos: 60_000 },
        { ventas: 100, costo: 33.3, gastos: 33.3 },
        { ventas: 7, costo: 1, gastos: 1 },
        { ventas: 999_999, costo: 333_333, gastos: 333_333 },
        { ventas: 500_000, costo: 0, gastos: 0 },
    ]
    for (const c of casos) {
        const r = deCada100(c)
        assert.ok(r)
        assert.equal(r.mercancia + r.gastos + r.quedo, 100, JSON.stringify(c))
        assert.equal(r.barra.mercancia + r.barra.gastos + r.barra.quedo, 100)
    }
    const r = deCada100({ ventas: 3_000_000, costo: 1_320_000, gastos: 60_000 })
    assert.deepEqual([r?.mercancia, r?.gastos, r?.quedo], [44, 2, 54])
})

test('Con pérdida: te quedó $0 y la barra igual suma 100', () => {
    const r = deCada100({ ventas: 100_000, costo: 70_000, gastos: 45_000 })
    assert.ok(r)
    assert.equal(r.perdida, true)
    assert.equal(r.quedo, 0)
    assert.deepEqual([r.mercancia, r.gastos], [70, 45])
    assert.equal(r.barra.mercancia + r.barra.gastos + r.barra.quedo, 100)
})

test('Sin ventas no hay De cada $100', () => {
    assert.equal(deCada100({ ventas: 0, costo: 0, gastos: 50_000 }), null)
})

/** Lo que devuelve toul_reporte, con solo lo que cambia en cada caso */
const reporte = ({ ventas, contado = ventas, costo, gastos = 0, devuelto = 0, reembolsado = 0, costoDevuelto = 0 }: {
    ventas: number; contado?: number; costo: number; gastos?: number; devuelto?: number; reembolsado?: number; costoDevuelto?: number
}) => resumir({
    ventas: { total: ventas, cantidad: ventas > 0 ? 3 : 0, contado, credito: ventas - contado, costo },
    devoluciones: { total: devuelto, costo: costoDevuelto, reembolsado },
    abonos: 0, gastos, mercanciaPagada: 0,
})
const suma = (v: Vista) => v.barra.reduce((s, p) => s + p.monto, 0)
const fila = (v: Vista, clave: string) => v.filas.find(f => f.clave === clave)

test('Inicio, pagado y fiado: Te pagaron + Quedó fiado = Vendiste, también con devoluciones', () => {
    const casos = [
        reporte({ ventas: 150_500, costo: 69_800 }),
        reporte({ ventas: 640_000, contado: 410_000, costo: 330_000, gastos: 40_000 }),
        // Devolvió 30.000: 20.000 en plata y 10.000 que se le bajaron de la deuda
        reporte({ ventas: 640_000, contado: 410_000, costo: 330_000, devuelto: 30_000, reembolsado: 20_000, costoDevuelto: 12_000 }),
    ]
    for (const r of casos) {
        const [pagado] = vistasInicio(r, [])
        const pagaron = fila(pagado, 'pagado')!.monto
        const fiado = fila(pagado, 'fiado')!.monto
        assert.equal(pagaron + fiado, r.vendiste, JSON.stringify(r))
        assert.equal(suma(pagado), r.vendiste)
    }
    const [conDevolucion] = vistasInicio(casos[2], [])
    assert.equal(fila(conDevolucion, 'pagado')!.monto, 390_000)
    assert.equal(fila(conDevolucion, 'fiado')!.monto, 220_000)
})

test('Inicio, pagado y fiado: "Gastos" solo si hubo gastos', () => {
    assert.equal(fila(vistasInicio(reporte({ ventas: 150_500, costo: 69_800 }))[0], 'gastos'), undefined)
    assert.equal(fila(vistasInicio(reporte({ ventas: 150_500, costo: 69_800, gastos: 5_000 }))[0], 'gastos')!.monto, 5_000)
})

test('Inicio, ganancia y gastos: Se fue en gastos + Ganaste = Ganancia en ventas', () => {
    const r = reporte({ ventas: 640_000, contado: 410_000, costo: 330_000, gastos: 40_000 })
    const [, ganancia] = vistasInicio(r)
    assert.equal(suma(ganancia), r.gananciaVentas)
    assert.equal(fila(ganancia, 'gastos')!.monto + fila(ganancia, 'ganaste')!.monto, r.gananciaVentas)
    assert.equal(ganancia.gananciaVentas, 310_000)
    // Sin gastos, "ganancia en ventas" sería el mismo número de Ganaste
    assert.equal(vistasInicio(reporte({ ventas: 150_500, costo: 69_800 }))[1].gananciaVentas, null)
})

test('Inicio, ganancia y gastos con pérdida: toda la barra es gastos y dice Perdiste', () => {
    const r = reporte({ ventas: 100_000, costo: 70_000, gastos: 45_000 })
    const [pagado, ganancia, metodos] = vistasInicio(r, [{ nombre: 'Efectivo', monto: 100_000 }])
    assert.deepEqual(ganancia.barra.map(p => p.clave), ['gastos'])
    for (const v of [pagado, ganancia, metodos]) {
        const ultima = v.filas[v.filas.length - 1]
        assert.deepEqual([ultima.rotulo, ultima.monto, ultima.color], ['Perdiste', 15_000, 'rojo'])
    }
})

test('Inicio, cómo te pagaron: los métodos + Fiado = Vendiste', () => {
    const r = reporte({ ventas: 640_000, contado: 410_000, costo: 330_000, devuelto: 30_000, reembolsado: 20_000 })
    // Pagado al vender 410.000, menos 20.000 que se devolvieron en efectivo
    const [, , metodos] = vistasInicio(r, [{ nombre: 'Nequi', monto: 250_000 }, { nombre: 'Efectivo', monto: 140_000 }])
    assert.equal(suma(metodos), r.vendiste)
    assert.deepEqual(metodos.filas.map(f => f.rotulo), ['Nequi', 'Efectivo', 'Fiado', 'Ganaste'])
    assert.equal(metodos.barra[0].tono, 'verde')
    assert.equal(metodos.linea, 3)
})

test('Inicio, cómo te pagaron: máximo 4 métodos contando "Otros", y el peso redondeado no descuadra', () => {
    const r = reporte({ ventas: 1_000_000, costo: 500_000 })
    const [, , metodos] = vistasInicio(r, [
        { nombre: 'Nequi', monto: 400_000 }, { nombre: 'Efectivo', monto: 300_000 }, { nombre: 'Daviplata', monto: 150_000 },
        { nombre: 'Bancolombia', monto: 100_000 }, { nombre: 'Otros', monto: 30_000 }, { nombre: 'Tarjeta', monto: 19_999 },
    ])
    assert.deepEqual(metodos.filas.map(f => [f.rotulo, f.monto]), [
        ['Nequi', 400_001], ['Efectivo', 300_000], ['Daviplata', 150_000], ['Otros', 149_999], ['Ganaste', 500_000],
    ])
    assert.equal(suma(metodos), r.vendiste)
})

test('Inicio: "Ganaste" es el mismo en las tres vistas y en Reportes', () => {
    const r = reporte({ ventas: 640_000, contado: 410_000, costo: 330_000, gastos: 40_000, devuelto: 30_000, reembolsado: 20_000, costoDevuelto: 12_000 })
    const vistas = vistasInicio(r, [{ nombre: 'Efectivo', monto: 390_000 }])
    assert.equal(vistas.length, 3)
    for (const v of vistas) assert.equal(fila(v, 'ganaste')!.monto, r.ganaste)
})

test('Inicio: sin lo vendido por método no hay "Cómo te pagaron"', () => {
    assert.deepEqual(vistasInicio(reporte({ ventas: 150_500, costo: 69_800 })).map(v => v.id), ['pagado', 'ganancia'])
})

test('La tendencia se esconde cuando antes no hubo ganancia', () => {
    assert.equal(porcentajeTendencia({ ahora: 500_000, antes: 0, ventasAntes: 4 }), null)
    assert.equal(porcentajeTendencia({ ahora: 500_000, antes: -80_000, ventasAntes: 4 }), null)
})

test('La tendencia se esconde cuando antes no hubo ventas', () => {
    assert.equal(porcentajeTendencia({ ahora: 500_000, antes: 20_000, ventasAntes: 0 }), null)
})

test('La tendencia se esconde cuando lo de antes es menos de la décima parte', () => {
    assert.equal(porcentajeTendencia({ ahora: 2_905_000, antes: 100_000, ventasAntes: 2 }), null)
    assert.equal(porcentajeTendencia({ ahora: 1_000_000, antes: 100_000, ventasAntes: 2 }), 900)
})

test('La tendencia normal sube y baja', () => {
    assert.equal(porcentajeTendencia({ ahora: 1_180_000, antes: 1_000_000, ventasAntes: 9 }), 18)
    assert.equal(porcentajeTendencia({ ahora: 700_000, antes: 1_000_000, ventasAntes: 9 }), -30)
    assert.equal(porcentajeTendencia({ ahora: -50_000, antes: 1_000_000, ventasAntes: 9 }), -105)
})

test('La proyección no aparece para Hoy ni para fechas pasadas', () => {
    const ahora = co(2026, 9, 27, 15)
    assert.equal(proyeccion({ periodo: 'today', desde: co(2026, 9, 27), ahora, ganado: 500_000 }), null)
    assert.equal(proyeccion({ periodo: 'custom', desde: co(2026, 8, 1), ahora, ganado: 500_000 }), null)
    assert.equal(proyeccion({ periodo: 'total', desde: co(2025, 0, 1), ahora, ganado: 500_000 }), null)
})

test('La proyección necesita 3 días andados', () => {
    assert.equal(proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 9, 2, 20), ganado: 100_000 }), null)
    assert.equal(proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 9, 3, 9), ganado: 300_000 }), 3_100_000)
})

test('La proyección del mes, la semana y el año', () => {
    // 27 días de octubre (31) con $1.626.700 → cerca de $1,9 M
    const mes = proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 9, 27, 18), ganado: 1_626_700 })
    assert.equal(mes, Math.round((1_626_700 / 27) * 31))
    assert.equal(formatoCorto(mes ?? 0), '$1,9 M')
    // Lunes 26 a miércoles 28: 3 días
    assert.equal(proyeccion({ periodo: 'week', desde: co(2026, 9, 26), ahora: co(2026, 9, 28, 10), ganado: 300_000 }), 700_000)
    assert.equal(proyeccion({ periodo: 'year', desde: co(2026, 0, 1), ahora: co(2026, 0, 3, 10), ganado: 30_000 }), 3_650_000)
    assert.equal(proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 9, 27), ganado: -10_000 }), null)
})

test('La proyección cuenta los días en hora de Colombia', () => {
    // 31 oct 23:30 en Colombia ya es 1 nov en UTC: igual va el día 31 de 31
    assert.equal(proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 9, 31, 23, 30), ganado: 310_000 }), 310_000)
    // 1 nov 00:15: octubre ya cerró, no hay nada que proyectar
    assert.equal(proyeccion({ periodo: 'month', desde: co(2026, 9, 1), ahora: co(2026, 10, 1, 0, 15), ganado: 310_000 }), null)
})

test('Formato corto', () => {
    assert.equal(formatoCorto(3_000_000), '$3,0 M')
    assert.equal(formatoCorto(2_440_000), '$2,4 M')
    assert.equal(formatoCorto(850_400), '$850 mil')
    assert.equal(formatoCorto(4_500), '$5 mil')
    assert.equal(formatoCorto(900), '$900')
    assert.equal(formatoCorto(-1_200_000), '−$1,2 M')
})

test('Más de 5 se agrupan en Otros', () => {
    const filas = [6, 5, 4, 3, 2, 1].map(n => ({ nombre: `m${n}`, monto: n }))
    const r = conOtros(filas, 5, monto => ({ nombre: 'Otros', monto }))
    assert.equal(r.length, 5)
    assert.deepEqual(r[4], { nombre: 'Otros', monto: 3 })
    assert.equal(conOtros(filas.slice(0, 5), 5, monto => ({ nombre: 'Otros', monto })).length, 5)
})

test('El resumen: Ganaste, Plata que entró y Plata que salió', () => {
    const r = resumir({
        ventas: { total: 500_000, cantidad: 2, contado: 300_000, credito: 200_000, costo: 300_000 },
        devoluciones: { total: 100_000, costo: 60_000, reembolsado: 100_000 },
        abonos: 60_000, gastos: 80_000, mercanciaPagada: 300_000,
    })
    assert.equal(r.contado + r.credito, r.ventasAntes)
    // Vendiste siempre es después de devoluciones
    assert.equal(r.vendiste, 400_000)
    assert.equal(r.entro, 360_000)
    assert.equal(r.salio, 480_000)
    assert.equal(r.gananciaVentas, 160_000)
    assert.equal(r.ganaste, 80_000)
    assert.equal(r.margen, 40)
    assert.equal(r.ticket, 200_000)
    assert.equal(r.pctCredito, 40)
})

test('Los porcentajes de menos de 1% se dicen así, no 0% ni 1%', () => {
    assert.equal(textoPorcentaje(450, 1_743_500), 'menos de 1%')
    assert.equal(textoPorcentaje(9_000, 1_000_000), 'menos de 1%')
    assert.equal(textoPorcentaje(10_000, 1_000_000), '1%')
    assert.equal(textoPorcentaje(370_000, 520_000), '71%')
    assert.equal(textoPorcentaje(0, 520_000), '0%')
})

// ─── La línea del gráfico del Inicio ─────────────────────────────
/** Como lo entrega la base: el momento en que empieza esa hora o ese día */
const tramo = (d: Date, acumulado: number, ventas = 1) => ({ t: d.toISOString().replace('.000Z', '+00:00'), acumulado, ventas })
const iso = (d: Date) => d.toISOString()
const DIA = 86_400_000
/** Lo real de todos los tramos */
const sumaReal = (linea: { tramos: { valor: number }[] }) => linea.tramos.reduce((s, t) => s + t.valor, 0)

test('Lo real de cada día suma exacto Vendiste', () => {
    // "Este mes" el 3 de noviembre a las 2:37 p. m.: $150.000 el 2 y $80.000 el 3
    const linea = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 10, 1)), hasta: iso(co(2026, 10, 3, 14, 37)),
        serie: [tramo(co(2026, 10, 2), 150_000), tramo(co(2026, 10, 3), 230_000)],
    })
    assert.equal(linea.paso, 'dia')
    assert.deepEqual(linea.tramos.map(t => t.valor), [0, 150_000, 80_000])
    assert.equal(sumaReal(linea), 230_000) // = Vendiste
    // Termina ahora, no al final del día
    assert.equal(linea.puntos.at(-1)?.x, (co(2026, 10, 3, 14, 37).getTime() - co(2026, 10, 1).getTime()) / DIA)
})

test('La etiqueta dice lo real de ese día, no lo suavizado', () => {
    // Un mes con un solo día de ventas: el 18 de octubre, $820.000
    const linea = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 9, 18), 820_000, 3)],
    })
    const el18 = tramoEn(linea, 17.5)
    assert.equal(el18?.inicio, co(2026, 9, 18).getTime())
    assert.equal(el18?.valor, 820_000)
    assert.equal(el18?.ventas, 3)
    // La línea se reparte entre los vecinos: el pico queda por debajo y el 19 no cae a cero
    assert.ok(Math.max(...linea.puntos.map(p => p.valor)) < 820_000)
    assert.ok((linea.puntos.find(p => p.x === 18.5)?.valor ?? 0) > 0)
    // Pero la etiqueta del 19 dice la verdad: sin ventas
    assert.deepEqual([tramoEn(linea, 18.5)?.valor, tramoEn(linea, 18.5)?.ventas], [0, 0])
})

test('Hoy va por hora, con un punto cada 12 minutos', () => {
    // Primera venta a las 9:15 a. m.; son las 2:37 p. m.
    const linea = lineaVentas({
        paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 14, 37)),
        serie: [tramo(co(2026, 10, 3, 9), 40_000), tramo(co(2026, 10, 3, 14), 90_000)],
    })
    assert.equal(linea.paso, 'hora')
    assert.equal(linea.desde, 8) // una hora antes de la primera venta
    assert.equal(linea.tramos[0].inicio, co(2026, 10, 3, 8).getTime())
    assert.ok(Math.abs(linea.puntos[1].x - linea.puntos[0].x - 0.2) < 1e-9)
    assert.equal(linea.puntos.at(-1)?.x, 14 + 37 / 60) // termina ahora
    assert.equal(tramoEn(linea, 14.3)?.valor, 50_000) // de 2 p. m. a 3 p. m.
    assert.equal(tramoEn(linea, 9.5)?.valor, 40_000)
    assert.equal(sumaReal(linea), 90_000)
    // La primera venta a las 12:20 a. m.: no arranca en el día de ayer
    const temprano = lineaVentas({
        paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 1, 5)),
        serie: [tramo(co(2026, 10, 3, 0), 20_000)],
    })
    assert.equal(temprano.tramos[0].inicio, co(2026, 10, 3).getTime())
    assert.equal(sumaReal(temprano), 20_000)
})

test('El suavizado nunca da negativo, ni con un día de solo devoluciones', () => {
    // $100.000 el 1, una devolución de $150.000 el 2 (de una venta de antes) y $30.000 el 3
    const linea = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 9, 1), 100_000), tramo(co(2026, 9, 2), -50_000, 0), tramo(co(2026, 9, 3), -20_000)],
    })
    assert.deepEqual(linea.tramos.slice(0, 3).map(t => t.valor), [100_000, -150_000, 30_000])
    assert.ok(linea.puntos.every(p => p.valor >= 0))
    assert.equal(sumaReal(linea), -20_000) // = Vendiste, aunque quede en negativo
    // Y con cualquier mezcla de ventas y devoluciones, en Hoy, en un mes y en un año
    let semilla = 7
    const azar = () => (semilla = (semilla * 48_271) % 2_147_483_647) / 2_147_483_647
    for (const [paso, desde, hasta, tramos, unidad] of [
        ['hora', co(2026, 10, 3), co(2026, 10, 3, 20, 10), 20, 3_600_000],
        ['dia', co(2026, 9, 1), co(2026, 9, 31, 23, 59, 59), 31, DIA],
        ['dia', co(2026, 0, 1), co(2026, 11, 31, 23, 59, 59), 365, DIA],
    ] as const) {
        let acumulado = 0
        const serie = []
        for (let i = 0; i < tramos; i++) {
            if (azar() < 0.4) continue
            acumulado += Math.round((azar() - 0.3) * 500_000)
            serie.push(tramo(new Date(desde.getTime() + i * unidad), acumulado))
        }
        const linea = lineaVentas({ paso, desde: iso(desde), hasta: iso(hasta), serie })
        assert.ok(linea.puntos.every(p => p.valor >= 0), paso)
        assert.equal(sumaReal(linea), serie.length ? acumulado : 0, paso)
    }
})

test('Inicio inteligente: un día antes de la primera venta, sin salirse del periodo', () => {
    // Primera venta del mes el 10: arranca el 9
    const linea = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 9, 10), 80_000)],
    })
    assert.equal(linea.desde, 8)
    assert.equal(linea.tramos[0].inicio, co(2026, 9, 9).getTime())
    assert.ok(linea.hasta > 30.99) // termina al final de las fechas: el periodo ya pasó
    // Primera venta el día 1: arranca el 1
    const dia1 = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 5, 12)),
        serie: [tramo(co(2026, 9, 1), 80_000)],
    })
    assert.equal(dia1.desde, 0)
})

test('La venta de las 11:30 p. m. del último día cae en ese día', () => {
    // La base la agrupa en el 31 de octubre de Colombia (en UTC ya es 1 de noviembre)
    const delMes = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 45)),
        serie: [tramo(co(2026, 9, 5), 560_000), tramo(co(2026, 9, 31), 640_000)],
    })
    assert.equal(delMes.tramos.at(-1)?.inicio, co(2026, 9, 31).getTime())
    assert.equal(delMes.tramos.at(-1)?.valor, 80_000)
    // En Hoy (31 oct), a las 11:45 p. m.: entra en la hora de las 11 p. m.
    const hoy = lineaVentas({
        paso: 'hora', desde: iso(co(2026, 9, 31)), hasta: iso(co(2026, 9, 31, 23, 45)),
        serie: [tramo(co(2026, 9, 31, 23), 80_000)],
    })
    assert.equal(hoy.tramos.at(-1)?.inicio, co(2026, 9, 31, 23).getTime())
    assert.equal(hoy.tramos.at(-1)?.valor, 80_000)
})

test('Más de 62 días va por semana, sin perder un peso; hasta 62, por día', () => {
    // 1 de enero al 31 de marzo: 90 días
    const linea = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 0, 1)), hasta: iso(co(2026, 2, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 0, 5), 10_000), tramo(co(2026, 1, 3), 55_000), tramo(co(2026, 2, 30), 99_000)],
    })
    assert.equal(linea.paso, 'semana')
    // El 5 de enero cae en la primera semana (1 – 7 ene): arranca ahí
    assert.equal(linea.tramos[0].inicio, co(2026, 0, 1).getTime())
    assert.equal(linea.tramos[0].valor, 10_000)
    assert.equal(sumaReal(linea), 99_000)
    // 1 de enero al 3 de marzo: 62 días, sigue por día
    const dias62 = lineaVentas({
        paso: 'dia', desde: iso(co(2026, 0, 1)), hasta: iso(co(2026, 2, 3, 23, 59, 59)),
        serie: [tramo(co(2026, 0, 2), 1)],
    })
    assert.equal(dias62.paso, 'dia')
})

test('Sin ventas: la base en cero de punta a punta', () => {
    const nada = lineaVentas({ paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 9, 30)), serie: [] })
    assert.equal(nada.vacia, true)
    assert.deepEqual([nada.desde, nada.hasta], [0, 9.5])
    assert.ok(nada.puntos.every(p => p.valor === 0))
    assert.equal(sumaReal(nada), 0)
})
