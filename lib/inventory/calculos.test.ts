// npm run test:calculos
// Fijan los números de Inventario tal como salen hoy, incluidos los que
// se van a cambiar a propósito después (por ejemplo "pide N").
// Paso 3 (cambios de regla aprobados por Félix, no ajustes para que pase):
// "por semana" va en enteros ("menos de 1" si no llega a uno), los textos
// de Quietos dicen "lleva N días sin venderse" / "nunca se ha vendido ·
// llegó hace N días", y el periodo de Compras usa los de Reportes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    buscarEnConteo, costoDeProducto, costoDelPedido, costoSugerido, cuantoPedir, cuantosContados, cantidadValida,
    diasDesde, diasQueAguanta, diferenciasDelConteo, enBodega, enlaceDeStock, estadoDelProducto, estadoDelStock, filaDeEstante,
    filaDePresentacion, filasDeFiltro, filasDelConteo, filtrarCompras, fraseRitmo, lineasDeUnBorrador, lineasDeUnPedido, lineasDelPedido, lineasEnCero, limpiarBusqueda, medidor,
    minimoAutomatico, pagoDeCompra, paraReponer, presentacionesPorProducto, productosParaElegir, ritmoSemanal,
    saldoPendiente, soloCantidad, stockDeProducto, stockPorPresentacion, textoContar, textoQuieto, totalDeCompra, unidadesDeCompra, valorQuieto,
    vendidasEn30, yaContado, type Alerta, type Quieto, type ResumenInventario,
    armarLista, coincideUnidad, cuantosEnLista, cuantosPorMostrar, llavesQuietas, ordenarPor, verLista,
    type UnidadDeStock, type VistaDeLista,
    DIAS_QUIETO, diasSinVenderse, plataEnProducto, resumenDelDetalle, textoTeDura, type UnidadDelDetalle,
} from './calculos.ts'

// Igual que formatCOP: "$ 120.000" (es-CO)
const dinero = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(n))

const alerta = (parcial: Partial<Alerta>): Alerta => ({
    id: 'a', kind: 'producto', product_id: 'p', product_name: 'Perfume', variant_name: null, image_url: null,
    stock: 0, cost: 0, min_stock: 1, sold_30d: 0, ...parcial,
})
const quieto = (parcial: Partial<Quieto>): Quieto => ({
    id: 'q', kind: 'producto', product_id: 'p', product_name: 'Perfume', variant_name: null, image_url: null,
    stock: 1, cost: 0, idle_days: 60, never_sold: false, ...parcial,
})
const resumen = (alerts: Alerta[], dormant: Quieto[] = []): ResumenInventario => ({
    coverageDays: 7, idleDays: 60, value: 0, retailValue: 0, units: 0, soldUnits30: 0, items: 0, references: 0,
    outOfStock: 0, lowStock: 0, alerts, dormantValue: 0, dormantCount: 0, dormant,
})

test('Tu inventario aguanta: lo que hay entre lo que sale por día, hacia abajo', () => {
    assert.equal(diasQueAguanta(60, 45), 40)
    assert.equal(diasQueAguanta(2, 7), 8)       // 7/30 por día → 8,57 días
    assert.equal(diasQueAguanta(0, 10), 0)
    assert.equal(diasQueAguanta(100, 0), null)  // sin ventas: "Sin ventas aún"
    assert.equal(diasQueAguanta(5, NaN), null)
    // El detalle usa la misma cuenta: con stock negativo da días negativos
    assert.equal(diasQueAguanta(-3, 15), -6)
})

test('Por semana: en enteros, y "menos de 1" cuando no alcanza a uno', () => {
    // Paso 3: antes daba '2.3' y '7.0' (con decimal). Félix pidió enteros.
    assert.equal(ritmoSemanal(10), '2')         // 2,33 → 2
    assert.equal(ritmoSemanal(30), '7')
    assert.equal(ritmoSemanal(11), '3')         // 2,57 → 3
    assert.equal(ritmoSemanal(4), 'menos de 1') // 0,93: no se muestra "0 por semana"
    assert.equal(ritmoSemanal(0), null)
    // El detalle del producto mira 14 días
    assert.equal(fraseRitmo(1, 14), 'Se vende menos de 1 unidad por semana')
    assert.equal(fraseRitmo(2, 14), 'Se está vendiendo 1 unidad por semana')
    assert.equal(fraseRitmo(9, 14), 'Se están vendiendo 5 unidades por semana') // 4,5 → 5
    assert.equal(fraseRitmo(0, 14), null)
})

test('El medidor: rojo bajo tu respaldo, amarillo bajo el doble, verde arriba', () => {
    assert.equal(medidor(null, 7).nivel, 'sin-ventas')
    assert.equal(medidor(6, 7).nivel, 'corto')
    assert.equal(medidor(7, 7).nivel, 'justo')
    assert.equal(medidor(13, 7).nivel, 'justo')
    assert.equal(medidor(14, 7).nivel, 'bien')
    assert.equal(medidor(15, 7).relleno, 0.5)
    assert.equal(medidor(90, 7).relleno, 1)
    assert.equal(medidor(6, 7).menosDelRespaldo, true)
    assert.equal(medidor(null, 7).menosDelRespaldo, false)
    // La marca de 30 días cae en el borde y no se dibuja
    assert.equal(medidor(10, 7).verMarca, true)
    assert.equal(medidor(10, 30).verMarca, false)
    assert.equal(medidor(null, 7).verMarca, false)
})

// Paso 2: Félix cambió la regla. Antes era "lo que falta para el mínimo",
// y con justo el mínimo pedía 1 sin sacar nunca el producto de la lista.
// Ahora es "lo que falta para el doble del mínimo".
test('Compra N: lo que falta para el doble del mínimo y nunca menos de 1', () => {
    assert.equal(cuantoPedir(1, 4), 7)
    assert.equal(cuantoPedir(0, 4), 8)
    // Lo que se debe en negativo también se compra
    assert.equal(cuantoPedir(-2, 4), 10)
    assert.equal(cuantoPedir(4, 4), 4)
    assert.equal(cuantoPedir(0, 1), 2)
    // Con más del doble no hay nada que pedir, pero la regla nunca dice 0
    assert.equal(cuantoPedir(9, 4), 1)
})

test('Comprar lo que dice "Compra N" saca el producto de la lista', () => {
    // La lista muestra lo que está en el mínimo o menos
    for (const minimo of [1, 2, 3, 4, 7, 15]) {
        for (let stock = -3; stock <= minimo; stock++) {
            const despues = stock + cuantoPedir(stock, minimo)
            assert.ok(despues > minimo, `stock ${stock}, mínimo ${minimo}: queda en ${despues}`)
        }
    }
})

test('Hay que reponer: filas, "Te costaría" y las líneas del pedido', () => {
    const items = paraReponer([
        alerta({ id: 'p1', product_id: 'p1', stock: 1, min_stock: 4, cost: 30_000 }),
        alerta({ id: 'v1', kind: 'presentacion', product_id: 'p2', variant_name: 'XL', stock: -2, min_stock: 3, cost: 0 }),
    ])
    // Paso 2: las cantidades cambian con la regla nueva (doble del mínimo)
    assert.deepEqual(items.map(i => [i.stock, i.toOrder, i.cost]), [[1, 7, 30_000], [0, 8, 0]])
    // Lo que no tiene costo suma $0 sin avisar
    assert.equal(costoDelPedido(items), 210_000)
    assert.deepEqual(lineasDelPedido(items), [
        { productId: 'p1', variantId: null, quantity: 7 },
        { productId: 'p2', variantId: 'v1', quantity: 8 },
    ])
})

test('Mínimo automático: lo que se vende en tus días de respaldo, nunca menos de 1', () => {
    assert.equal(minimoAutomatico(9, 7), 3)    // 2,1 → 3
    assert.equal(minimoAutomatico(30, 7), 7)
    assert.equal(minimoAutomatico(30, 15), 15)
    assert.equal(minimoAutomatico(1, 7), 1)
    assert.equal(minimoAutomatico(0, 30), 1)
})

test('Mínimo automático exacto: sin 1 de más por el redondeo', () => {
    // Con 30 días de respaldo, el mínimo es lo mismo que se vendió
    for (let vendidas = 1; vendidas <= 500; vendidas++) {
        assert.equal(minimoAutomatico(vendidas, 30), vendidas, `${vendidas} vendidas`)
    }
    // Los de la tienda real que salían con 1 de más en la base
    assert.equal(minimoAutomatico(5, 30), 5)   // Mym
    assert.equal(minimoAutomatico(8, 30), 8)   // xxx, MacBook
    // Los que salían con 1 de más aquí
    assert.equal(minimoAutomatico(31, 30), 31)
    assert.equal(minimoAutomatico(62, 15), 31)
    assert.equal(minimoAutomatico(31, 15), 16)  // 15,5 → 16
    // Con cualquier respaldo, el mínimo es el entero de arriba de vendidas × días / 30
    for (const dias of [1, 7, 15, 30, 45, 60, 90]) {
        for (let vendidas = 0; vendidas <= 300; vendidas++) {
            const exacto = Math.max(Math.floor((vendidas * dias + 29) / 30), 1)
            assert.equal(minimoAutomatico(vendidas, dias), exacto, `${vendidas} vendidas, ${dias} días`)
        }
    }
})

test('El estado del detalle: agotado, por acabarse o con existencias', () => {
    assert.equal(estadoDelStock(0, 3), 'agotado')
    assert.equal(estadoDelStock(-1, 3), 'agotado')
    assert.equal(estadoDelStock(3, 3), 'pocas')
    assert.equal(estadoDelStock(4, 3), 'bien')
    assert.equal(vendidasEn30([{ quantity: 2 }, { quantity: 5 }]), 7)
})

test('Producto con tallas: el stock suma las tallas y el costo es su promedio', () => {
    const tallas = [{ stock: 2, cpp: 30_000 }, { stock: 1, cpp: 45_000 }]
    assert.equal(stockDeProducto(tallas, 99), 3)
    assert.equal(costoDeProducto(tallas, 0), 35_000)
    // Sin tallas manda el producto
    assert.equal(stockDeProducto([], 8), 8)
    assert.equal(costoDeProducto([], 12_500), 12_500)
    assert.equal(stockDeProducto([], null), 0)
    // Todas agotadas: costo 0
    assert.equal(costoDeProducto([{ stock: 0, cpp: 30_000 }], 0), 0)
    // Una talla en negativo resta
    assert.equal(stockDeProducto([{ stock: 3, cpp: 1 }, { stock: -1, cpp: 1 }], 0), 2)
})

test('$X en bodega: lo que hay por lo que costó, redondeado', () => {
    assert.equal(enBodega(3, 33_333.4), 100_000)
    assert.equal(enBodega(2, null), 0)
    assert.equal(valorQuieto(3, 40_000), 120_000)
})

test('Filtros: Agotados, Por acabarse y Quietos, con su búsqueda', () => {
    const r = resumen([
        alerta({ id: 'a1', product_name: 'Sauvage', stock: 0, min_stock: 2 }),
        alerta({ id: 'a2', kind: 'presentacion', product_name: 'Bleu', variant_name: '50 ml', stock: 1, min_stock: 3 }),
        alerta({ id: 'a3', product_name: 'Eros', stock: -1, min_stock: 1 }),
    ], [
        quieto({ id: 'q1', product_name: 'Acqua', stock: 3, cost: 40_000, idle_days: 75, never_sold: true }),
        quieto({ id: 'q2', kind: 'presentacion', product_name: 'Bleu', variant_name: '100 ml', stock: 2, cost: 10_000, idle_days: 61 }),
    ])
    assert.equal(filasDeFiltro(r, 'todo', '', dinero), null)
    assert.equal(filasDeFiltro(undefined, 'agotados', '', dinero), null)

    const agotados = filasDeFiltro(r, 'agotados', '', dinero)!
    assert.deepEqual(agotados.map(f => [f.title, f.subtitle, f.subtitleTone, f.stock, f.target]), [
        ['Sauvage', 'se agotó', 'error', 0, 2],
        ['Eros', 'se agotó', 'error', 0, 1],
    ])
    const pocos = filasDeFiltro(r, 'pocos', '', dinero)!
    assert.deepEqual(pocos.map(f => [f.title, f.subtitle, f.href]), [
        ['Bleu · 50 ml', 'quedan 1, deberías tener 3', '/inventory/variant/a2'],
    ])
    const quietos = filasDeFiltro(r, 'quietos', '', dinero)!
    assert.deepEqual(quietos.map(f => f.subtitle), [
        // Paso 3: antes "nunca se ha vendido hace 75 días" y "sin venderse hace 61 días"
        `nunca se ha vendido · llegó hace 75 días · ${dinero(120_000)} quietos`,
        `lleva 61 días sin venderse · ${dinero(20_000)} quietos`,
    ])
    assert.equal(quietos[0].target, undefined)
    // La búsqueda mira "producto · talla", sin importar mayúsculas
    assert.deepEqual(filasDeFiltro(r, 'quietos', '  BLEU ', dinero)!.map(f => f.key), ['q-presentacion-q2'])
    assert.deepEqual(filasDeFiltro(r, 'agotados', 'xyz', dinero), [])
})

test('Todo lo que tienes: la fila de un producto y la de una talla', () => {
    const producto = { id: 'p', name: 'Bleu', reference: null, image_url: 'a.jpg', images: ['b.jpg'], stock: 9, cpp: 1000 }
    const tallas = [
        { id: 'v1', product_id: 'p', name: '50 ml', stock: 2, cpp: 30_000 },
        { id: 'v2', product_id: 'p', name: '100 ml', stock: 0, cpp: 50_000 },
    ]
    const conTallas = filaDeEstante(producto, tallas, dinero)
    assert.deepEqual([conTallas.conTallas, conTallas.stock, conTallas.subtitle, conTallas.tone, conTallas.image],
        [true, 2, '2 presentaciones · 1 sin existencias', 'error', 'b.jpg'])
    const sinTallas = filaDeEstante({ ...producto, images: [], stock: 3, cpp: 33_333.4 }, [], dinero)
    assert.deepEqual([sinTallas.stock, sinTallas.subtitle, sinTallas.tone, sinTallas.image],
        [3, `${dinero(100_000)} en bodega`, 'dim', 'a.jpg'])
    assert.deepEqual(filaDePresentacion(tallas[0], dinero), { stock: 2, texto: `${dinero(60_000)} en bodega` })
    assert.deepEqual(filaDePresentacion(tallas[1], dinero), { stock: 0, texto: 'se agotó' })

    const mapa = presentacionesPorProducto([...tallas, { id: 'v3', product_id: 'q', name: 'M', stock: 1, cpp: 0 }])
    assert.deepEqual(mapa.get('p')!.map(v => v.id), ['v1', 'v2'])
    assert.equal(mapa.get('x'), undefined)
    assert.equal(enlaceDeStock('producto', 'p'), '/inventory/p')
})

test('Hace N días: bloques de 24 horas; "Contar" mientras no hay dato', () => {
    const ahora = Date.UTC(2026, 10, 10, 15)
    assert.equal(diasDesde(new Date(ahora - 23 * 3_600_000).toISOString(), ahora), 0)
    assert.equal(diasDesde(new Date(ahora - 25 * 3_600_000).toISOString(), ahora), 1)
    assert.equal(diasDesde(new Date(ahora - 46 * 86_400_000).toISOString(), ahora), 46)
    assert.equal(textoContar(undefined, ahora), 'Contar')
    assert.equal(textoContar(null, ahora), 'Contar · nunca')
    assert.equal(textoContar(new Date(ahora - 30 * 3_600_000).toISOString(), ahora), 'Contar · hace 1 día')
    assert.equal(textoContar(new Date(ahora - 46 * 86_400_000).toISOString(), ahora), 'Contar · hace 46 días')
})

test('Nueva compra: ordenar y buscar productos', () => {
    const productos = [
        { name: 'Bleu', reference: 'B-50', stock: 5, created_at: '2026-10-01T00:00:00Z' },
        { name: 'acqua', reference: null, stock: -1, created_at: '2026-11-01T00:00:00Z' },
        { name: 'Sauvage', reference: 'S1', stock: 2, created_at: '2026-09-01T00:00:00Z' },
    ]
    assert.deepEqual(productosParaElegir(productos, 'A-Z', '').map(p => p.name), ['acqua', 'Bleu', 'Sauvage'])
    assert.deepEqual(productosParaElegir(productos, 'Stock', '').map(p => p.name), ['acqua', 'Sauvage', 'Bleu'])
    assert.deepEqual(productosParaElegir(productos, 'Recientes', '').map(p => p.name), ['acqua', 'Bleu', 'Sauvage'])
    assert.deepEqual(productosParaElegir(productos, 'A-Z', 'b-5').map(p => p.name), ['Bleu'])
    assert.deepEqual(productosParaElegir(productos, 'A-Z', 'AU').map(p => p.name), ['Sauvage'])
    // La lista original no se reordena
    assert.equal(productos[0].name, 'Bleu')
})

test('Nueva compra: el costo con que arranca cada línea', () => {
    assert.equal(costoSugerido({ cpp: 20_000, cost_price: 15_000 }, null, false), 20_000)
    assert.equal(costoSugerido({ cpp: 0, cost_price: 15_000 }, null, false), 15_000)
    assert.equal(costoSugerido({ cpp: 0, cost_price: 0 }, null, false), 0)
    assert.equal(costoSugerido({ cpp: 20_000 }, { cpp: 0 }, true), 0)       // una talla nueva arranca en 0
    assert.equal(costoSugerido({ cpp: 20_000 }, { cpp: null }, true), 20_000)
})

test('Nueva compra: el pedido de Inventario llega listo y salta lo que ya no está', () => {
    const productos = [{ id: 'p1', cpp: 10_000, cost_price: 0 }, { id: 'p2', cpp: 0, cost_price: 0 }]
    const tallas = [{ id: 'v1', name: 'XL', cpp: 25_000 }]
    const lineas = lineasDeUnPedido([
        { productId: 'p1', variantId: null, quantity: 3 },
        { productId: 'p2', variantId: 'v1', quantity: 0.4 },
        { productId: 'p2', variantId: 'v-borrada', quantity: 2 },
        { productId: 'p-borrado', variantId: null, quantity: 2 },
    ], productos, tallas)
    assert.deepEqual(lineas.map(l => [l.itemKey, l.variantName, l.quantity, l.cost]), [
        ['p1:', undefined, '3', '10000'],
        ['p2:v1', 'XL', '1', '25000'],
    ])
})

test('Nueva compra: al volver de "Compras anteriores" todo sigue como lo dejaste', () => {
    const productos = [{ id: 'p1', cpp: 10_000, cost_price: 0 }, { id: 'p2', cpp: 0, cost_price: 0 }]
    const tallas = [{ id: 'v1', name: 'XL', cpp: 25_000 }]
    const lineas = lineasDeUnBorrador([
        { productId: 'p1', variantId: null, quantity: '12', cost: '9500' },   // el costo que escribió, no el sugerido
        { productId: 'p2', variantId: 'v1', quantity: '', cost: '' },         // a medio escribir: queda igual
        { productId: 'p-borrado', variantId: null, quantity: '2', cost: '1000' },
    ], productos, tallas)
    assert.deepEqual(lineas.map(l => [l.itemKey, l.variantName, l.quantity, l.cost]), [
        ['p1:', undefined, '12', '9500'],
        ['p2:v1', 'XL', '', ''],
    ])
})

test('Nueva compra: total, abono y lo que se paga hoy', () => {
    const lineas = [{ quantity: '2', cost: '30000' }, { quantity: '1', cost: '45000' }, { quantity: '', cost: '9000' }]
    assert.equal(totalDeCompra(lineas), 105_000)
    assert.deepEqual(pagoDeCompra('cash', 0, 105_000, null), { abonoDemasiado: false, pagado: 105_000, faltaCuenta: true })
    assert.deepEqual(pagoDeCompra('cash', 0, 105_000, 'efectivo'), { abonoDemasiado: false, pagado: 105_000, faltaCuenta: false })
    assert.deepEqual(pagoDeCompra('credit', 0, 105_000, null), { abonoDemasiado: false, pagado: 0, faltaCuenta: false })
    assert.deepEqual(pagoDeCompra('credit', 50_000, 105_000, null), { abonoDemasiado: false, pagado: 50_000, faltaCuenta: true })
    assert.equal(pagoDeCompra('credit', 105_001, 105_000, 'x').abonoDemasiado, true)
    assert.equal(saldoPendiente(105_000, 50_000), 55_000)
    assert.equal(saldoPendiente(105_000, 200_000), 0)
})

// Paso 3: se quitó desdeCuando ("últimos 7/30/365 días"). Compras usa ahora
// los periodos de Reportes (lib/periodos), que ya tienen sus propias pruebas.

test('Compras: unidades, "Sin pagar" y la búsqueda por proveedor o producto', () => {
    const compras = [
        { id: 'c1', providers: { name: 'Distribuidora Andina' }, purchase_items: [{ quantity: 3, products: { name: 'Bleu' } }, { quantity: 2, products: null }] },
        { id: 'c2', providers: null, purchase_items: [{ quantity: 1, products: { name: 'Sauvage' } }] },
    ]
    assert.equal(unidadesDeCompra(compras[0].purchase_items), 5)
    assert.equal(unidadesDeCompra(null), 0)
    const deudas = new Map([['c2', { falta: 40_000 }], ['c1', { falta: 0 }]])
    assert.deepEqual(filtrarCompras(compras, 'debiendo', deudas, '').map(c => c.id), ['c2'])
    assert.deepEqual(filtrarCompras(compras, 'todas', deudas, 'andina').map(c => c.id), ['c1'])
    assert.deepEqual(filtrarCompras(compras, 'todas', deudas, 'SAUV').map(c => c.id), ['c2'])
    assert.deepEqual(filtrarCompras(compras, 'todas', deudas, '   ').map(c => c.id), ['c1', 'c2'])
    assert.deepEqual(filtrarCompras(undefined, 'todas', undefined, ''), [])
})

test('Conteo: casillas, lo que dice el sistema y lo ya contado', () => {
    const stock = stockPorPresentacion([
        { variant_id: 'v1', quantity: 5 }, { variant_id: 'v1', quantity: -2 },
        { variant_id: 'v2', quantity: -1 }, { variant_id: null, quantity: 9 },
    ])
    assert.deepEqual(stock, { v1: 3, v2: -1 })
    const filas = filasDelConteo(
        [{ id: 'p1', name: 'Bleu', reference: 'B', stock: 0, cpp: 0 }, { id: 'p2', name: 'Eros', reference: null, stock: -2, cpp: 8000 }],
        [{ id: 'v1', product_id: 'p1', name: '50 ml', cpp: 30_000 }, { id: 'v2', product_id: 'p1', name: '100 ml', cpp: null }],
        stock,
    )
    assert.deepEqual(filas.map(f => [f.key, f.name, f.expected, f.cost]), [
        ['p1:v1', 'Bleu · 50 ml', 3, 30_000],
        ['p1:v2', 'Bleu · 100 ml', 0, 0],     // la talla en negativo cuenta como 0
        ['p2', 'Eros', -2, 8000],             // el producto sin tallas, tal cual
    ])
    assert.deepEqual(buscarEnConteo(filas, 'b').map(f => f.key), ['p1:v1', 'p1:v2'])
    assert.deepEqual(buscarEnConteo(filas, ' eros ').map(f => f.key), ['p2'])

    const { valores, ids } = yaContado([
        { id: 'i1', product_id: 'p1', variant_id: 'v1', counted_qty: 4.6 },
        { id: 'i2', product_id: 'p2', variant_id: null, counted_qty: 0 },
    ])
    assert.deepEqual(valores, { 'p1:v1': '5', p2: '0' })
    assert.deepEqual(ids, { 'p1:v1': 'i1', p2: 'i2' })
    assert.equal(cuantosContados({ ...valores, 'p1:v2': '' }), 2)

    assert.deepEqual(diferenciasDelConteo([
        { id: 'a', difference: -1 }, { id: 'b', difference: 0 }, { id: 'c', difference: 4 }, { id: 'd', difference: null },
    ]).map(d => d.id), ['c', 'a'])
})

test('Quietos: el texto según si se vendió alguna vez', () => {
    assert.equal(textoQuieto(61, false), 'lleva 61 días sin venderse')
    assert.equal(textoQuieto(1, false), 'lleva 1 día sin venderse')
    assert.equal(textoQuieto(75, true), 'nunca se ha vendido · llegó hace 75 días')
})

test('El estado de un producto sale de sus presentaciones', () => {
    // "Sin stock" solo si todas se acabaron; "Pocas unidades" si alguna está en su mínimo o agotada
    assert.equal(estadoDelProducto(['agotado', 'agotado']), 'agotado')
    assert.equal(estadoDelProducto(['bien', 'agotado']), 'pocas')
    assert.equal(estadoDelProducto(['bien', 'pocas']), 'pocas')
    assert.equal(estadoDelProducto(['bien', 'bien']), 'bien')
    assert.equal(estadoDelProducto([]), null)
})

test('Filtros: la búsqueda también mira la referencia', () => {
    const r = resumen([
        alerta({ id: 'a1', product_name: 'Sauvage', reference: 'SV-100', stock: 0, min_stock: 2 }),
        alerta({ id: 'a2', product_name: 'Bleu', reference: null, stock: 0, min_stock: 2 }),
    ], [
        quieto({ id: 'q1', product_name: 'Acqua', reference: 'ACQ-7' }),
        quieto({ id: 'q2', product_name: 'Eros', reference: null }),
    ])
    assert.deepEqual(filasDeFiltro(r, 'agotados', 'sv-1', dinero)!.map(f => f.title), ['Sauvage'])
    assert.deepEqual(filasDeFiltro(r, 'quietos', 'acq', dinero)!.map(f => f.title), ['Acqua'])
    // Sin referencia no se cae
    assert.deepEqual(filasDeFiltro(r, 'agotados', 'bleu', dinero)!.map(f => f.title), ['Bleu'])
})

test('Nueva compra: cantidades enteras desde 1 y aviso de costo $0', () => {
    assert.equal(cantidadValida('3'), true)
    assert.equal(cantidadValida('1'), true)
    assert.equal(cantidadValida('0'), false)
    assert.equal(cantidadValida(''), false)
    assert.equal(cantidadValida('2.5'), false)
    assert.equal(cantidadValida('-1'), false)
    // Lo que se puede escribir: dígitos sin ceros adelante. El decimal se ve
    // y queda inválido (borrarlo convertiría "2.5" en 25)
    assert.equal(soloCantidad('2.5'), '2.5')
    assert.equal(cantidadValida(soloCantidad('2,5')), false)
    assert.equal(soloCantidad('007'), '7')
    assert.equal(soloCantidad('0'), '0')
    assert.equal(soloCantidad('-3'), '3')
    assert.equal(soloCantidad('abc'), '')
    assert.equal(soloCantidad('123456789'), '1234567')
    const lineas = [{ id: 'a', cost: '0' }, { id: 'b', cost: '15000' }, { id: 'c', cost: '' }]
    assert.deepEqual(lineasEnCero(lineas).map(l => l.id), ['a', 'c'])
})

test('El buscador: sin lo que rompe el filtro de la base', () => {
    assert.equal(limpiarBusqueda('  XL '), 'XL')
    assert.equal(limpiarBusqueda('camisa, (azul)'), 'camisa azul')
    assert.equal(limpiarBusqueda('100%*'), '100')
    assert.equal(limpiarBusqueda('"Bleu"'), 'Bleu')
    assert.equal(limpiarBusqueda('ref\\01'), 'ref 01')
    assert.equal(limpiarBusqueda('50 ml'), '50 ml')
    assert.equal(limpiarBusqueda(',,,'), '')
})

// ── Parte 2: "Tus productos" con la regla única ──
const unidad = (parcial: Partial<UnidadDeStock>): UnidadDeStock => ({
    kind: 'producto', id: 'u', product_id: 'p', variant_id: null, product_name: 'Perfume', variant_name: null,
    reference: null, image_url: null, stock: 0, sold_30d: 0, estado: 'bien', ...parcial,
})
// Como el prototipo: carneguey con dos presentaciones, y productos sueltos
const bodega = () => armarLista([
    unidad({ kind: 'presentacion', id: 'c200', product_id: 'carne', variant_id: 'c200', product_name: 'carneguey', variant_name: '200ml', stock: 5, sold_30d: 4, estado: 'bien' }),
    unidad({ kind: 'presentacion', id: 'c100', product_id: 'carne', variant_id: 'c100', product_name: 'carneguey', variant_name: '100ml', stock: 0, sold_30d: 6, estado: 'agotado' }),
    unidad({ id: 'aban', product_id: 'aban', product_name: 'Abanico', stock: 0, sold_30d: 22, estado: 'agotado' }),
    unidad({ id: 'body', product_id: 'body', product_name: 'Body splash coco', reference: 'BS-01', stock: 9, sold_30d: 5, estado: 'bien' }),
    unidad({ id: 'xxx', product_id: 'xxx', product_name: 'xxx', stock: 2, sold_30d: 8, estado: 'pocas' }),
    unidad({ id: 'ctrl', product_id: 'ctrl', product_name: 'Control', stock: 6, sold_30d: 0, estado: 'bien' }),
], [
    { id: 'carne', images: ['foto-carne.jpg'], image_url: 'vieja.jpg', category_id: 'perfumes' },
    { id: 'aban', images: null, image_url: 'abanico.jpg', category_id: 'accesorios' },
    { id: 'body', images: [], image_url: null, category_id: null },
    { id: 'xxx', images: null, image_url: null, category_id: 'perfumes' },
    { id: 'ctrl', images: null, image_url: null, category_id: 'accesorios' },
])
const vista = (parcial: Partial<VistaDeLista> = {}): VistaDeLista => ({ orden: 'nombre', mostrar: 'todos', categoria: null, busqueda: '', ...parcial })

test('Tus productos: cada producto con su stock de siempre y el estado de la regla única', () => {
    const lista = bodega()
    const carne = lista.find(p => p.id === 'carne')!
    assert.equal(carne.conPresentaciones, true)
    assert.equal(carne.stock, 5)                                   // la suma de sus presentaciones
    assert.equal(carne.vendidas30, 10)
    assert.equal(carne.estado, 'pocas')                            // una agotada: ámbar, no rojo
    assert.deepEqual(carne.unidades.map(u => u.nombre), ['carneguey · 100ml', 'carneguey · 200ml'])
    assert.equal(carne.unidades[0].href, '/inventory/variant/c100')
    assert.equal(carne.imagen, 'foto-carne.jpg')                   // la primera foto, como antes
    assert.equal(lista.find(p => p.id === 'aban')!.imagen, 'abanico.jpg')
    assert.equal(lista.find(p => p.id === 'aban')!.estado, 'agotado')
    assert.equal(lista.find(p => p.id === 'aban')!.unidades[0].href, '/inventory/aban')
    // Si se acabaron todas las presentaciones, rojo
    const todas = armarLista([
        unidad({ kind: 'presentacion', id: 'a', product_id: 'p', variant_name: 'S', estado: 'agotado' }),
        unidad({ kind: 'presentacion', id: 'b', product_id: 'p', variant_name: 'M', estado: 'agotado', stock: -1 }),
    ], [])
    assert.equal(todas[0].estado, 'agotado')
    assert.equal(todas[0].stock, -1)                               // el número de siempre, sin maquillarlo
})

test('Tus productos: ordenar, filtrar y buscar', () => {
    const lista = bodega()
    const quietos = llavesQuietas([{ kind: 'producto', id: 'ctrl' }])
    const nombres = (r: ReturnType<typeof verLista>) => r.agrupada ? r.productos.map(p => p.nombre) : r.unidades.map(u => u.nombre)

    // Sin filtro: agrupada y por nombre, sin importar mayúsculas
    const todo = verLista(lista, vista(), quietos)
    assert.equal(todo.agrupada, true)
    assert.deepEqual(nombres(todo), ['Abanico', 'Body splash coco', 'carneguey', 'Control', 'xxx'])
    assert.deepEqual(nombres(verLista(lista, vista({ orden: 'menos' }), quietos)), ['Abanico', 'xxx', 'carneguey', 'Control', 'Body splash coco'])
    assert.deepEqual(nombres(verLista(lista, vista({ orden: 'mas' }), quietos)), ['Body splash coco', 'Control', 'carneguey', 'xxx', 'Abanico'])
    assert.deepEqual(nombres(verLista(lista, vista({ orden: 'vendidos' }), quietos)), ['Abanico', 'carneguey', 'xxx', 'Body splash coco', 'Control'])
    // Una categoría sigue agrupada
    assert.deepEqual(nombres(verLista(lista, vista({ categoria: 'perfumes' }), quietos)), ['carneguey', 'xxx'])

    // Con filtro, las presentaciones salen sueltas
    const porComprar = verLista(lista, vista({ mostrar: 'por-comprar' }), quietos)
    assert.equal(porComprar.agrupada, false)
    assert.deepEqual(nombres(porComprar), ['Abanico', 'carneguey · 100ml', 'xxx'])
    assert.deepEqual(nombres(verLista(lista, vista({ mostrar: 'quietos' }), quietos)), ['Control'])
    assert.deepEqual(nombres(verLista(lista, vista({ mostrar: 'sin-stock' }), quietos)), ['Abanico', 'carneguey · 100ml'])
    assert.deepEqual(nombres(verLista(lista, vista({ mostrar: 'con-stock', categoria: 'accesorios' }), quietos)), ['Control'])
    assert.equal(cuantosEnLista(verLista(lista, vista({ mostrar: 'con-stock' }), quietos)), 4)

    // Buscar: por nombre, presentación o referencia
    assert.deepEqual(nombres(verLista(lista, vista({ busqueda: 'carneguey 100' }), quietos)), ['carneguey · 100ml'])
    assert.deepEqual(nombres(verLista(lista, vista({ busqueda: ' 200ML ' }), quietos)), ['carneguey · 200ml'])
    assert.deepEqual(nombres(verLista(lista, vista({ busqueda: 'bs-01' }), quietos)), ['Body splash coco'])
    assert.equal(coincideUnidad(lista[0].unidades[0], ''), true)
    assert.equal(cuantosEnLista(verLista(lista, vista({ busqueda: 'nada' }), quietos)), 0)

    // Cuántos hay en cada opción, en toda la bodega
    assert.deepEqual(cuantosPorMostrar(lista, quietos), { 'todos': 6, 'por-comprar': 3, 'quietos': 1, 'con-stock': 4, 'sin-stock': 2 })
    // Ordenar no cambia la lista original
    const antes = lista.map(p => p.id).join()
    ordenarPor(lista, 'mas')
    assert.equal(lista.map(p => p.id).join(), antes)
})

test('Detalle: la línea de estado y "Comprar N" suman lo mismo que Compra sugerida', () => {
    const u = (parcial: Partial<UnidadDelDetalle>): UnidadDelDetalle =>
        ({ productId: 'p', variantId: null, stock: 10, minimo: 3, estado: 'bien', diasQuieto: 5, ...parcial })

    // Sin presentaciones: una sola cosa
    assert.deepEqual(resumenDelDetalle([u({ stock: 0, minimo: 10, estado: 'agotado' })]),
        { estado: 'agotado', linea: 'Se acabó · compra 20', comprar: 20, pedido: [{ productId: 'p', variantId: null, quantity: 20 }] })
    assert.equal(resumenDelDetalle([u({ stock: -2, minimo: 3, estado: 'agotado' })])?.comprar, 8)   // como paraReponer: con lo negativo
    assert.equal(resumenDelDetalle([u({ stock: 2, minimo: 4, estado: 'pocas' })])?.linea, 'Quedan pocas · compra 6')
    assert.equal(resumenDelDetalle([u({})])?.linea, 'Bien de existencias')
    assert.equal(resumenDelDetalle([u({ diasQuieto: 46 })])?.linea, 'Bien de existencias')            // 46 < 60: todavía no es quieto
    assert.equal(resumenDelDetalle([u({ diasQuieto: DIAS_QUIETO })])?.linea, 'Lleva 60 días sin venderse')
    assert.equal(resumenDelDetalle([]), null)

    // Con presentaciones: como en la lista, y el pedido lleva solo las que faltan
    const tallas = [
        u({ variantId: 'v1', stock: 0, minimo: 3, estado: 'agotado' }),
        u({ variantId: 'v2', stock: 5, minimo: 2, estado: 'bien' }),
        u({ variantId: 'v3', stock: 1, minimo: 2, estado: 'pocas' }),
    ]
    const resumen = resumenDelDetalle(tallas)
    assert.equal(resumen?.estado, 'pocas')
    assert.equal(resumen?.linea, 'Quedan pocas · compra 9')
    assert.deepEqual(resumen?.pedido, [
        { productId: 'p', variantId: 'v1', quantity: 6 },
        { productId: 'p', variantId: 'v3', quantity: 3 },
    ])
    // Lo mismo que daría Compra sugerida con esas dos
    const sugerida = paraReponer([
        { ...alerta({ id: 'v1', kind: 'presentacion', stock: 0, min_stock: 3 }) },
        { ...alerta({ id: 'v3', kind: 'presentacion', stock: 1, min_stock: 2 }) },
    ])
    assert.equal(sugerida.reduce((s, i) => s + i.toOrder, 0), resumen?.comprar)
    assert.equal(resumenDelDetalle(tallas.map(t => ({ ...t, stock: 0, estado: 'agotado' as const })))?.estado, 'agotado')
    // Quieto con presentaciones: solo si todo lo que tiene existencias está quieto (el menor)
    assert.equal(resumenDelDetalle([u({ variantId: 'a', diasQuieto: 90 }), u({ variantId: 'b', diasQuieto: 70 }), u({ variantId: 'c', stock: 0, diasQuieto: 3 })])?.linea,
        'Lleva 70 días sin venderse')
    assert.equal(resumenDelDetalle([u({ variantId: 'a', diasQuieto: 90 }), u({ variantId: 'b', diasQuieto: 10 })])?.linea, 'Bien de existencias')
})

test('Detalle: días sin venderse, plata en el producto y "Te dura"', () => {
    const ahora = Date.parse('2026-11-11T15:00:00Z')
    assert.equal(diasSinVenderse('2026-10-01T15:00:00Z', '2026-01-01T00:00:00Z', ahora), 41)   // manda la última venta
    assert.equal(diasSinVenderse(null, '2026-09-12T16:00:00Z', ahora), 59)                      // nunca vendido: desde que llegó
    assert.equal(diasSinVenderse(null, null, ahora), null)
    assert.equal(diasSinVenderse('2026-11-12T00:00:00Z', null, ahora), 0)

    assert.equal(plataEnProducto([{ stock: 3, cpp: 20_000 }]), 60_000)
    assert.equal(plataEnProducto([{ stock: 2, cpp: 10_000.4 }, { stock: -4, cpp: 9_000 }, { stock: 1, cpp: null }]), 20_001)
    assert.equal(plataEnProducto([]), 0)

    assert.equal(textoTeDura(0, 30), 'Ya se acabó')
    assert.equal(textoTeDura(5, 0), 'Sin ventas en 30 días')
    assert.equal(textoTeDura(12, 30), 'unos 12 días')
    assert.equal(textoTeDura(1, 30), '1 día')
    assert.equal(textoTeDura(1, 90), 'menos de un día')
    assert.equal(textoTeDura(12, 30), `unos ${diasQueAguanta(12, 30)} días`)   // el mismo número de antes
})
