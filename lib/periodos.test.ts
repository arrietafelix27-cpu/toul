// npm run test:calculos — corre en tres zonas horarias: el resultado tiene que ser el mismo
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contraQue, diasEntre, diaColombia, enColombia, getDateRange, instanteDeDia, periodoDeDireccion, periodoEnDireccion, rangoAnterior, rangoPeriodo, textoRango, tramoDeDias } from './periodos.ts'

/** Una fecha y hora de Colombia (UTC−5) */
const co = (ano: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0, ms = 0) =>
    new Date(Date.UTC(ano, mes, dia, hora, minuto, segundo, ms) + 5 * 3_600_000)
const iso = (d: Date) => d.toISOString()

const zona = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone

test(`[${zona}] 31 oct 23:30 en Colombia sigue siendo 31 de octubre`, () => {
    const ahora = co(2026, 9, 31, 23, 30)
    assert.equal(iso(ahora), '2026-11-01T04:30:00.000Z') // en UTC ya es noviembre
    assert.equal(diaColombia(ahora), '2026-10-31')
    assert.equal(getDateRange('today', ahora).from, iso(co(2026, 9, 31)))
    assert.equal(getDateRange('month', ahora).from, iso(co(2026, 9, 1)))
    assert.equal(getDateRange('year', ahora).from, iso(co(2026, 0, 1)))
    // Sábado 31: la semana arranca el lunes 26
    assert.equal(getDateRange('week', ahora).from, iso(co(2026, 9, 26)))
    assert.equal(getDateRange('month', ahora).to, iso(ahora))
})

test(`[${zona}] 1 nov 00:15 en Colombia ya es noviembre`, () => {
    const ahora = co(2026, 10, 1, 0, 15)
    assert.equal(diaColombia(ahora), '2026-11-01')
    assert.equal(getDateRange('today', ahora).from, iso(co(2026, 10, 1)))
    assert.equal(getDateRange('month', ahora).from, iso(co(2026, 10, 1)))
    // Domingo: la semana sigue siendo la del lunes 26
    assert.equal(getDateRange('week', ahora).from, iso(co(2026, 9, 26)))
    assert.equal(diasEntre(co(2026, 9, 31, 23, 30), ahora), 1)
})

test(`[${zona}] lunes a la medianoche empieza una semana nueva`, () => {
    assert.equal(getDateRange('week', co(2026, 10, 2, 0, 0)).from, iso(co(2026, 10, 2)))
    assert.equal(getDateRange('week', co(2026, 10, 1, 23, 59)).from, iso(co(2026, 9, 26)))
})

test(`[${zona}] fechas elegidas: del primer al último instante del día en Colombia`, () => {
    assert.equal(iso(instanteDeDia('2026-10-01')), '2026-10-01T05:00:00.000Z')
    assert.equal(iso(instanteDeDia('2026-10-31', true)), '2026-11-01T04:59:59.999Z')
})

test(`[${zona}] el mismo tramo del mes pasado`, () => {
    const actual = rangoPeriodo('month', null, co(2026, 9, 31, 23, 30))
    const antes = rangoAnterior('month', actual)
    assert.equal(antes.from, iso(co(2026, 8, 1)))
    // Septiembre no tiene 31: hasta el 30 a la misma hora
    assert.equal(antes.to, iso(co(2026, 8, 30, 23, 30)))
    assert.match(contraQue('month', actual), /^vs 1 – 30 sept?$/)
})

test(`[${zona}] octubre completo se compara contra septiembre completo`, () => {
    const octubre = { from: iso(instanteDeDia('2026-10-01')), to: iso(instanteDeDia('2026-10-31', true)) }
    const antes = rangoAnterior('custom', octubre)
    assert.equal(antes.from, iso(co(2026, 8, 1)))
    assert.equal(antes.to, iso(co(2026, 8, 30, 23, 59, 59, 999)))
    // También si el hasta llega sin milisegundos (23:59:59)
    const sinMs = rangoAnterior('custom', { from: octubre.from, to: iso(co(2026, 9, 31, 23, 59, 59)) })
    assert.equal(sinMs.from, iso(co(2026, 8, 1)))
})

test(`[${zona}] unas fechas cualquiera se comparan contra los mismos días justo antes`, () => {
    const actual = { from: iso(instanteDeDia('2026-10-10')), to: iso(instanteDeDia('2026-10-16', true)) }
    const antes = rangoAnterior('custom', actual)
    assert.equal(antes.from, iso(co(2026, 9, 3)))
    assert.equal(antes.to, iso(co(2026, 9, 9, 23, 59, 59, 999)))
})

test(`[${zona}] el año contra el mismo tramo del año pasado`, () => {
    const actual = rangoPeriodo('year', null, co(2028, 1, 29, 10, 0))
    const antes = rangoAnterior('year', actual)
    assert.equal(antes.from, iso(co(2027, 0, 1)))
    // 2027 no tiene 29 de febrero: hasta el 28 a la misma hora
    assert.equal(antes.to, iso(co(2027, 1, 28, 10, 0)))
})

test(`[${zona}] hoy contra ayer a la misma hora`, () => {
    const actual = rangoPeriodo('today', null, co(2026, 10, 1, 0, 15))
    const antes = rangoAnterior('today', actual)
    assert.equal(antes.from, iso(co(2026, 9, 31)))
    assert.equal(antes.to, iso(co(2026, 9, 31, 0, 15)))
})

test(`[${zona}] los textos de fechas salen en hora de Colombia`, () => {
    const tarde = co(2026, 9, 31, 23, 30)
    assert.equal(enColombia(tarde).dia, 31)
    assert.match(textoRango(tarde, tarde), /^31 oct$/)
    assert.match(textoRango(co(2026, 9, 1), tarde), /^1 – 31 oct$/)
})

test(`[${zona}] el periodo viaja por la dirección y vuelve igual`, () => {
    const octubre = { from: iso(instanteDeDia('2026-10-01')), to: iso(instanteDeDia('2026-10-31', true)) }
    const texto = periodoEnDireccion('custom', octubre)
    assert.equal(texto, 'periodo=custom&desde=2026-10-01&hasta=2026-10-31')
    const vuelta = periodoDeDireccion(new URLSearchParams(texto))
    assert.deepEqual(vuelta, { periodo: 'custom', desde: '2026-10-01', hasta: '2026-10-31' })
    assert.deepEqual(tramoDeDias('2026-10-01', '2026-10-31'), octubre)
    assert.equal(periodoEnDireccion('year', octubre), 'periodo=year')
    assert.equal(periodoDeDireccion(new URLSearchParams('periodo=nada')), null)
})
