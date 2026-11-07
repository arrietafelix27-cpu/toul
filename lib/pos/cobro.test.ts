// npm run test:calculos
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { repartir, sugerenciasEfectivo, vuelto, esEfectivo, tipoDeMetodo, type MetodoElegido } from './pagos.ts'
import { leerPermisos, revisarVenta, descuentoPermitido, permisosDe, PERMISOS_POR_DEFECTO, PERMISOS_ADMIN } from './permisos.ts'
import { mensajeComprobante, enlaceWhatsApp, telefonoWhatsApp, textoBotonWhatsApp, tirillaAutomaticaInicial, cuandoSeVea } from './comprobante.ts'

const efectivo: MetodoElegido = { methodId: 'e', methodName: 'Efectivo', methodColor: '', escrito: null }
const nequi = (escrito: number | null): MetodoElegido => ({ methodId: 'n', methodName: 'Nequi', methodColor: '', escrito })
const banco = (escrito: number | null): MetodoElegido => ({ methodId: 'b', methodName: 'Bancolombia', methodColor: '', escrito })

test('El primer método es siempre el resto', () => {
    assert.deepEqual(repartir([efectivo], 100000).splits.map(s => s.amount), [100000])
    assert.deepEqual(repartir([efectivo, nequi(30000)], 100000).splits.map(s => s.amount), [70000, 30000])
    assert.deepEqual(repartir([efectivo, nequi(30000), banco(20000)], 100000).splits.map(s => s.amount), [50000, 30000, 20000])
    assert.deepEqual(repartir([efectivo, nequi(null)], 100000).splits.map(s => s.amount), [100000, 0], 'vacío cuenta como cero')
    assert.deepEqual(repartir([], 100000).splits, [])
})

test('Si cambia el total, lo escrito se queda y solo cambia el resto', () => {
    const elegidos = [efectivo, nequi(30000)]
    assert.deepEqual(repartir(elegidos, 80000).splits.map(s => s.amount), [50000, 30000])
    assert.deepEqual(repartir(elegidos, 30000).splits.map(s => s.amount), [0, 30000])
})

test('Si lo escrito pasa el total, avisa cuánto', () => {
    const r = repartir([efectivo, nequi(120000)], 100000)
    assert.equal(r.exceso, 20000)
    assert.equal(r.splits[0].amount, 0)
    assert.equal(repartir([efectivo, nequi(100000)], 100000).exceso, 0)
})

test('Billetes sugeridos: el siguiente de $10.000, $50.000 y $100.000', () => {
    assert.deepEqual(sugerenciasEfectivo(43500), [50000, 100000])
    assert.deepEqual(sugerenciasEfectivo(120000), [130000, 150000, 200000])
    assert.deepEqual(sugerenciasEfectivo(100000), [110000, 150000, 200000], 'lo exacto ya es "Exacto"')
    assert.deepEqual(sugerenciasEfectivo(7000), [10000, 50000, 100000])
    assert.deepEqual(sugerenciasEfectivo(0), [])
})

test('Vuelto', () => {
    assert.equal(vuelto(50000, 43500), 6500)
    assert.equal(vuelto(40000, 43500), 0, 'nunca negativo')
    assert.equal(esEfectivo({ name: 'Efectivo' }), true)
    assert.equal(esEfectivo({ name: 'Caja menor', is_cash: true }), true)
    assert.equal(esEfectivo({ name: 'Nequi' }), false)
    assert.equal(tipoDeMetodo('Datáfono'), 'tarjeta')
    assert.equal(tipoDeMetodo('Bancolombia'), 'banco')
    assert.equal(tipoDeMetodo('Nequi'), 'billetera')
})

test('Permisos: lo que no está guardado queda como siempre', () => {
    assert.deepEqual(leerPermisos(null), PERMISOS_POR_DEFECTO)
    assert.deepEqual(leerPermisos({ fiar: 'solo', descuento_max: '25' }), { ...PERMISOS_POR_DEFECTO, fiar: 'solo', descuento_max: 25 })
    assert.equal(leerPermisos({ fiar: 'cuando quiera' }).fiar, 'aprobacion', 'un valor raro no da permiso')
    assert.equal(leerPermisos({ descuento_max: 500 }).descuento_max, 100)
    assert.deepEqual(permisosDe('admin', { fiar: 'no' }), PERMISOS_ADMIN, 'el administrador puede todo')
    assert.equal(permisosDe('seller', undefined).descuento_max, 100, 'sin la columna, el descuento sigue libre como antes')
    assert.equal(permisosDe('seller', undefined).fiar, 'aprobacion')
    assert.equal(permisosDe('seller', {}).descuento_max, 10)
})

test('Un descuento en pesos se mide como porcentaje de la venta', () => {
    const p = { ...PERMISOS_POR_DEFECTO }
    assert.equal(descuentoPermitido(99999, 10), 10000)
    assert.equal(revisarVenta({ permisos: p, esFiado: false, subtotal: 100000, descuento: 10000 }).descuento, false)
    assert.equal(revisarVenta({ permisos: p, esFiado: false, subtotal: 100000, descuento: 10001 }).descuento, true)
    // El 10% de $99.999 redondeado son $10.000: no pide aprobación por un peso
    assert.equal(revisarVenta({ permisos: p, esFiado: false, subtotal: 99999, descuento: 10000 }).descuento, false)
    assert.equal(revisarVenta({ permisos: p, esFiado: true, subtotal: 100000, descuento: 0 }).fiado, true)
    assert.equal(revisarVenta({ permisos: { ...p, fiar: 'no' }, esFiado: true, subtotal: 1, descuento: 0 }).bloqueo, 'No tienes permiso para fiar')
})

test('Comprobante de WhatsApp', () => {
    const texto = mensajeComprobante({
        tienda: 'Tienda de perfumes', fecha: '2026-11-04T20:42:00Z',
        items: [{ nombre: 'Sauvage', cantidad: 2, valor: 800000 }, { nombre: 'Bleu · 50ml', cantidad: 1, valor: 220000 }],
        subtotal: 1020000, descuento: 20000, total: 1000000,
        pagos: [{ metodo: 'Efectivo', monto: 600000 }, { metodo: 'Nequi', monto: 400000 }],
        recibido: 650000, vuelto: 50000, mensajeFinal: '¡Gracias por tu compra!',
    })
    assert.match(texto, /^\*Tienda de perfumes\*/)
    assert.match(texto, /4 de nov de 2026, 3:42/, 'con la fecha y la hora de Colombia')
    assert.match(texto, /2 × Sauvage — \$800\.000/)
    assert.match(texto, /Descuento: −\$20\.000/)
    assert.match(texto, /\*Total: \$1\.000\.000\*/)
    assert.match(texto, /Pagó con: Efectivo \$600\.000, Nequi \$400\.000/)
    assert.match(texto, /Vuelto: \$50\.000/)
    assert.match(texto, /¡Gracias por tu compra!$/)

    const fiado = mensajeComprobante({
        tienda: 'T', fecha: '2026-11-04T20:42:00Z', items: [{ nombre: 'Eros', cantidad: 1, valor: 300000 }],
        subtotal: 300000, descuento: 0, total: 300000, pagos: [{ metodo: 'Nequi', monto: 100000 }],
        fiado: { abono: 100000, debe: 200000 }, cliente: 'Marta',
    })
    assert.match(fiado, /Abono: \$100\.000/)
    assert.match(fiado, /\*Queda debiendo: \$200\.000\*/)
    assert.doesNotMatch(fiado, /Subtotal/, 'sin descuento no repite el subtotal')
})

test('WhatsApp directo al cliente cuando tiene un número que sirve', () => {
    assert.equal(telefonoWhatsApp('300 123 4567'), '573001234567')
    assert.equal(telefonoWhatsApp('+57 300 123 4567'), '573001234567')
    assert.equal(telefonoWhatsApp('6012345'), null, 'un fijo corto no sirve')
    assert.equal(telefonoWhatsApp(null), null)
    assert.equal(enlaceWhatsApp('3001234567', 'Hola'), 'https://wa.me/573001234567?text=Hola')
    assert.equal(enlaceWhatsApp('', 'Hola'), null)
})

test('El botón de WhatsApp dice a quién va', () => {
    assert.equal(textoBotonWhatsApp('Marta Gómez', '300 123 4567'), 'Enviar a Marta por WhatsApp')
    assert.equal(textoBotonWhatsApp('  Ana  ', '3001234567'), 'Enviar a Ana por WhatsApp')
    assert.equal(textoBotonWhatsApp('Marta', null), 'Enviar comprobante por WhatsApp', 'sin celular, al menú de compartir')
    assert.equal(textoBotonWhatsApp('Marta', '6012345'), 'Enviar comprobante por WhatsApp', 'un número que no sirve')
    assert.equal(textoBotonWhatsApp(null, '3001234567'), 'Enviar comprobante por WhatsApp', 'sin nombre')
})

test('Tirilla automática: lo que eligió el equipo; si nunca eligió, solo en el computador', () => {
    assert.equal(tirillaAutomaticaInicial(null, false), true, 'computador: prendida')
    assert.equal(tirillaAutomaticaInicial(null, true), false, 'celular: apagada')
    assert.equal(tirillaAutomaticaInicial('1', true), true, 'el celular la prendió en el menú')
    assert.equal(tirillaAutomaticaInicial('0', false), false, 'el computador la apagó en el menú')
})

function paginaFalsa(visible: boolean) {
    const oyentes = new Set<() => void>()
    return {
        visibilityState: visible ? 'visible' : 'hidden',
        addEventListener: (_: 'visibilitychange', fn: () => void) => { oyentes.add(fn) },
        removeEventListener: (_: 'visibilitychange', fn: () => void) => { oyentes.delete(fn) },
        mostrar() { this.visibilityState = 'visible'; for (const fn of [...oyentes]) fn() },
        oyentes,
    }
}

test('La tirilla automática espera a que "Venta registrada" termine de aparecer', async () => {
    const pagina = paginaFalsa(true)
    let lista = false
    const inicio = Date.now()
    await cuandoSeVea(40, pagina).then(() => { lista = true })
    assert.ok(lista)
    assert.ok(Date.now() - inicio >= 35, 'no sale antes de tiempo')
})

test('Con la caja en otra pestaña, la tirilla espera a que vuelva a verse', async () => {
    const pagina = paginaFalsa(false)
    let lista = false
    const espera = cuandoSeVea(20, pagina).then(() => { lista = true })
    await new Promise(r => setTimeout(r, 60))
    assert.equal(lista, false, 'oculta: no imprime')
    pagina.mostrar()
    assert.equal(pagina.oyentes.size, 0, 'deja de escuchar al volver')
    assert.equal(lista, false, 'al volver todavía espera que se pinte')
    await espera
    assert.ok(lista)
})
