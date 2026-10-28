// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conOtros, deCada100, formatoCorto, porcentajeTendencia, proyeccion, resumir } from './calculos.ts'

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
    const ahora = new Date(2026, 9, 27, 15)
    assert.equal(proyeccion({ periodo: 'today', desde: new Date(2026, 9, 27), ahora, ganado: 500_000 }), null)
    assert.equal(proyeccion({ periodo: 'custom', desde: new Date(2026, 8, 1), ahora, ganado: 500_000 }), null)
    assert.equal(proyeccion({ periodo: 'total', desde: new Date(2025, 0, 1), ahora, ganado: 500_000 }), null)
})

test('La proyección necesita 3 días andados', () => {
    assert.equal(proyeccion({ periodo: 'month', desde: new Date(2026, 9, 1), ahora: new Date(2026, 9, 2, 20), ganado: 100_000 }), null)
    assert.equal(proyeccion({ periodo: 'month', desde: new Date(2026, 9, 1), ahora: new Date(2026, 9, 3, 9), ganado: 300_000 }), 3_100_000)
})

test('La proyección del mes, la semana y el año', () => {
    // 27 días de octubre (31) con $1.626.700 → cerca de $1,9 M
    const mes = proyeccion({ periodo: 'month', desde: new Date(2026, 9, 1), ahora: new Date(2026, 9, 27, 18), ganado: 1_626_700 })
    assert.equal(mes, Math.round((1_626_700 / 27) * 31))
    assert.equal(formatoCorto(mes ?? 0), '$1,9 M')
    // Lunes 26 a miércoles 28: 3 días
    assert.equal(proyeccion({ periodo: 'week', desde: new Date(2026, 9, 26), ahora: new Date(2026, 9, 28, 10), ganado: 300_000 }), 700_000)
    assert.equal(proyeccion({ periodo: 'year', desde: new Date(2026, 0, 1), ahora: new Date(2026, 0, 3, 10), ganado: 30_000 }), 3_650_000)
    assert.equal(proyeccion({ periodo: 'month', desde: new Date(2026, 9, 1), ahora: new Date(2026, 9, 27), ganado: -10_000 }), null)
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
    assert.equal(r.contado + r.credito, r.vendiste)
    assert.equal(r.entro, 360_000)
    assert.equal(r.salio, 480_000)
    assert.equal(r.gananciaVentas, 160_000)
    assert.equal(r.ganaste, 80_000)
    assert.equal(r.margen, 40)
    assert.equal(r.ticket, 250_000)
    assert.equal(r.pctCredito, 40)
})
