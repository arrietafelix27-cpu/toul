// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conOtros, deCada100, formatoCorto, lineaAcumulada, porcentajeTendencia, proyeccion, resumir, textoPorcentaje } from './calculos.ts'

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
const tramo = (d: Date, acumulado: number) => ({ t: d.toISOString().replace('.000Z', '+00:00'), acumulado })
const iso = (d: Date) => d.toISOString()

test('La línea termina en Vendiste y la anterior en lo vendido el periodo anterior', () => {
    // "Este mes" el 3 de noviembre a las 2:37 p. m., contra el 1 – 3 de octubre a la misma hora
    const linea = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 10, 1)), hasta: iso(co(2026, 10, 3, 14, 37)),
        serie: [tramo(co(2026, 10, 2), 150_000), tramo(co(2026, 10, 3), 230_000)],
        anterior: {
            desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 3, 14, 37)),
            serie: [tramo(co(2026, 9, 1), 50_000), tramo(co(2026, 9, 3), 90_000)],
        },
    })
    assert.equal(linea.paso, 'dia')
    assert.deepEqual(linea.actual.map(p => p.valor), [0, 150_000, 230_000])
    assert.equal(linea.actual.at(-1)?.valor, 230_000) // = Vendiste
    // Día 1 contra día 1: 1 oct, 2 oct y 3 oct hasta las 2:37 p. m.
    assert.deepEqual(linea.anterior?.map(p => [p.x, p.valor]), [[0, 50_000], [1, 50_000], [2, 90_000]])
    assert.equal(linea.anterior?.at(-1)?.valor, 90_000) // = lo vendido del 1 al 3 de octubre
    assert.equal(linea.actual.at(-1)?.t, co(2026, 10, 3, 14, 37).getTime())
})

test('Una devolución hace bajar la línea ese día', () => {
    const linea = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 10, 1)), hasta: iso(co(2026, 10, 30, 23, 59, 59)),
        serie: [tramo(co(2026, 10, 1), 100_000), tramo(co(2026, 10, 2), 0)],
    })
    assert.deepEqual(linea.actual.slice(0, 3).map(p => p.valor), [0, 100_000, 0])
    assert.equal(linea.actual.at(-1)?.valor, 0)
})

test('Inicio inteligente: una hora antes de la primera venta en Hoy', () => {
    // Primera venta a las 9:15 a. m.; son las 2:37 p. m.
    const linea = lineaAcumulada({
        paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 14, 37)),
        serie: [tramo(co(2026, 10, 3, 9), 40_000), tramo(co(2026, 10, 3, 11), 70_000)],
    })
    assert.equal(linea.actual[0].t, co(2026, 10, 3, 8).getTime())
    assert.deepEqual(linea.actual.map(p => p.valor), [0, 0, 40_000, 40_000, 70_000, 70_000, 70_000, 70_000])
    assert.equal(linea.actual.at(-1)?.t, co(2026, 10, 3, 14, 37).getTime()) // termina ahora
    assert.equal(linea.anterior, null) // Hoy no se compara
    // La primera venta a las 12:20 a. m.: no arranca en el día de ayer
    const temprano = lineaAcumulada({
        paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 1, 5)),
        serie: [tramo(co(2026, 10, 3, 0), 20_000)],
    })
    assert.equal(temprano.actual[0].t, co(2026, 10, 3).getTime())
    assert.equal(temprano.actual.at(-1)?.valor, 20_000)
})

test('Inicio inteligente: un día antes de la primera venta en los demás periodos', () => {
    // Primera venta del mes el 10: la línea arranca el 9 en cero
    const linea = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 9, 10), 80_000)],
    })
    assert.deepEqual([linea.actual[0].x, linea.actual[0].valor, linea.actual[0].fuera], [8, 0, false])
    assert.equal(linea.actual.at(-1)?.x, 30) // termina el 31: el periodo ya pasó
    // Primera venta el día 1: arranca el día antes, que no se lee
    const dia1 = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 5, 12)),
        serie: [tramo(co(2026, 9, 1), 80_000)],
    })
    assert.deepEqual([dia1.actual[0].x, dia1.actual[0].valor, dia1.actual[0].fuera], [-1, 0, true])
})

test('La venta de las 11:30 p. m. del último día cae en ese día', () => {
    // La base la agrupa en el 31 de octubre de Colombia (en UTC ya es 1 de noviembre)
    const delMes = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 45)),
        serie: [tramo(co(2026, 9, 5), 560_000), tramo(co(2026, 9, 31), 640_000)],
    })
    const ultimo = delMes.actual.at(-1)!
    assert.deepEqual([ultimo.x, ultimo.valor], [30, 640_000])
    assert.equal(delMes.actual.at(-2)?.valor, 560_000) // el 30 todavía no estaba
    // En Hoy (31 oct), a las 11:45 p. m.: entra en la hora de las 11 p. m.
    const hoy = lineaAcumulada({
        paso: 'hora', desde: iso(co(2026, 9, 31)), hasta: iso(co(2026, 9, 31, 23, 45)),
        serie: [tramo(co(2026, 9, 31, 23), 80_000)],
    })
    assert.equal(hoy.actual.at(-2)?.t, co(2026, 9, 31, 23).getTime())
    assert.equal(hoy.actual.at(-2)?.valor, 0)
    assert.equal(hoy.actual.at(-1)?.valor, 80_000)
})

test('Más de 120 días va por semana, sin perder un peso', () => {
    const linea = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 0, 1)), hasta: iso(co(2026, 5, 30, 23, 59, 59)),
        serie: [tramo(co(2026, 0, 5), 10_000), tramo(co(2026, 2, 3), 55_000), tramo(co(2026, 5, 30), 99_000)],
    })
    assert.equal(linea.paso, 'semana')
    assert.equal(linea.actual.at(-1)?.valor, 99_000)
    assert.deepEqual([linea.actual[0].x, linea.actual[0].valor], [-1, 0])
    // El 5 de enero cae en la primera semana (1 – 7 ene)
    assert.equal(linea.actual[1].valor, 10_000)
    // Un mes elegido sigue por día
    const mes = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 9, 1)), hasta: iso(co(2026, 9, 31, 23, 59, 59)),
        serie: [tramo(co(2026, 9, 2), 1)],
    })
    assert.equal(mes.paso, 'dia')
})

test('Sin ventas: la base en cero y la línea anterior de referencia', () => {
    const linea = lineaAcumulada({
        paso: 'dia', desde: iso(co(2026, 10, 2)), hasta: iso(co(2026, 10, 4, 18)),
        serie: [],
        anterior: { desde: iso(co(2026, 9, 26)), hasta: iso(co(2026, 9, 28, 18)), serie: [tramo(co(2026, 9, 27), 45_000)] },
    })
    assert.equal(linea.vacia, true)
    assert.ok(linea.actual.every(p => p.valor === 0))
    assert.equal(linea.anterior?.at(-1)?.valor, 45_000)
    assert.equal(linea.actual[0].x, 0) // arranca el día antes de la primera venta de la semana pasada
    // Sin nada en ninguno de los dos: la base desde el inicio
    const nada = lineaAcumulada({ paso: 'hora', desde: iso(co(2026, 10, 3)), hasta: iso(co(2026, 10, 3, 9, 30)), serie: [] })
    assert.equal(nada.actual[0].t, co(2026, 10, 3).getTime())
    assert.ok(nada.actual.every(p => p.valor === 0))
})
