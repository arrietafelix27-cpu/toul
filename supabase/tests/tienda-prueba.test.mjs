// Tienda de prueba con resultados calculados a mano (por Félix, 2026-10-28).
//
// Arma la tienda con las funciones reales (ventas, compras, abonos,
// anulación), llama a lo mismo que llaman el Inicio y Reportes con rangos
// explícitos y compara con sus valores exactos.
//
// REGLA: los valores esperados NO se cambian para que la prueba pase. Si
// algo no coincide, hay un error en el código o en las cuentas, y hay que
// decir cuál.
//
// Solo corre en la base de pruebas en memoria (PGlite), nunca en producción.
import { deCada100, lineaVentas, porcentajeTendencia, resumir, tramoEn, vistasInicio } from '../../lib/reports/calculos.ts'
import { instanteDeDia, rangoAnterior, rangoPeriodo } from '../../lib/periodos.ts'

const O = '11111111-1111-1111-1111-111111111111'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
let fails = 0
const peso = (n) => '$' + Math.round(Number(n)).toLocaleString('es-CO')
/** Compara un número con lo que calculó Félix */
const igual = (que, esperado, obtenido, formato = peso) => {
  const ok = Number(esperado) === Number(obtenido)
  console.log(`  ${ok ? '✓' : '✗'} ${que}: esperado ${formato(esperado)}, dio ${formato(obtenido)}`)
  if (!ok) fails++
}
const si = (que, condicion, detalle = '') => {
  console.log(`  ${condicion ? '✓' : '✗'} ${que}${detalle ? ` (${detalle})` : ''}`)
  if (!condicion) fails++
}
const pct = (n) => `${n}%`
const tal = (n) => String(n)

/** Una hora de Colombia */
const co = (texto) => `${texto}-05`

export default async function (db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  /** Dentro de una transacción: un error esperado no puede tumbar lo que sigue */
  const errTx = async (sql, p, uid = null) => {
    await db.exec('SAVEPOINT intento')
    try {
      if (uid) await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', true); SET LOCAL ROLE authenticated;`)
      await db.query(sql, p)
      await db.exec('RELEASE SAVEPOINT intento')
      if (uid) await db.exec('RESET ROLE')
      return null
    } catch (e) {
      await db.exec('ROLLBACK TO SAVEPOINT intento')
      return e.message
    }
  }
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }
  const comoDueno = (fn) => as(O, fn)
  const r = async (sql, p) => (await comoDueno(() => one(sql, p))).r

  // Pone la hora real a todo lo que dejó una operación
  const fecharVenta = async (id, cuando) => {
    await q(`UPDATE sales SET created_at = $2 WHERE id = $1`, [id, cuando])
    await q(`UPDATE credits SET created_at = $2 WHERE sale_id = $1`, [id, cuando])
    await q(`UPDATE sale_payments SET created_at = $2 WHERE sale_id = $1`, [id, cuando])
    await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1`, [id, cuando])
    await q(`UPDATE inventory_adjustments SET created_at = $2 WHERE reference_id = $1`, [id, cuando])
  }
  const fecharCompra = async (id, cuando) => {
    await q(`UPDATE purchases SET created_at = $2 WHERE id = $1`, [id, cuando])
    await q(`UPDATE purchase_payments SET created_at = $2 WHERE purchase_id = $1`, [id, cuando])
    await q(`UPDATE provider_debts SET created_at = $2 WHERE purchase_id = $1`, [id, cuando])
    await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1`, [id, cuando])
  }

  // ── La tienda ──
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'felix@x.com')`, [O])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Tienda de prueba')`, [STORE, O])
  const [A] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Perfume A',100000,60000,0) RETURNING id`, [STORE])
  const [B] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Perfume B',80000,30000,0) RETURNING id`, [STORE])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [neq] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  const [prov] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Aromas') RETURNING id`, [STORE])

  const vender = async (cuando, producto, cantidad, precio, { credito = false, cliente = null, pagos = [] } = {}) => {
    const total = cantidad * precio
    const id = await r(`SELECT (process_sale($1::jsonb))->>'saleId' r`, [JSON.stringify({
      cart: [{ product: { id: producto.id, name: 'x' }, quantity: cantidad, unitPrice: precio }],
      payments: pagos, subtotal: total, total,
      isCredit: credito, customerName: cliente,
      initialPayment: pagos.reduce((s, p) => s + p.amount, 0),
    })])
    await fecharVenta(id, co(cuando))
    return id
  }
  const efectivo = (amount) => [{ methodId: efe.id, methodName: 'Efectivo', amount }]
  const nequi = (amount) => [{ methodId: neq.id, methodName: 'Nequi', amount }]
  const cliente = async (nombre) => (await one(`SELECT id FROM customers WHERE store_id=$1 AND name=$2`, [STORE, nombre])).id
  const abonar = async (cuando, nombre, monto, metodo) => {
    const res = await r(`SELECT toul_registrar_abono($1,$2,$3,NULL) r`, [await cliente(nombre), monto, metodo.id])
    await q(`UPDATE credits SET created_at = $2 WHERE id = $1`, [res.creditId, co(cuando)])
    await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1`, [res.creditId, co(cuando)])
  }

  console.log('\n— Las 14 operaciones')
  // 1. 15 sep: compra de contado de 10 Perfume A por $600.000
  const c1 = await r(`SELECT (process_purchase($1::jsonb))->>'purchaseId' r`, [JSON.stringify({
    isCredit: false, methodId: efe.id, items: [{ productId: A.id, quantity: 10, unitCost: 60000 }] })])
  await fecharCompra(c1, co('2026-09-15 10:00'))
  // 2. 20 sep: venta a crédito a Carla, 1 A por $100.000, sin abono
  await vender('2026-09-20 10:00', A, 1, 100000, { credito: true, cliente: 'Carla' })
  // 3. 1 oct: compra a crédito de 10 B por $300.000 con pago inicial de $100.000
  const c3 = await r(`SELECT (process_purchase($1::jsonb))->>'purchaseId' r`, [JSON.stringify({
    isCredit: true, providerId: prov.id, paidNow: 100000, methodId: efe.id, items: [{ productId: B.id, quantity: 10, unitCost: 30000 }] })])
  await fecharCompra(c3, co('2026-10-01 10:00'))
  // 4–7. Ventas de octubre
  await vender('2026-10-05 10:00', A, 2, 100000, { pagos: efectivo(200000) })
  await vender('2026-10-06 10:00', B, 1, 80000, { pagos: nequi(80000) })
  await vender('2026-10-10 10:00', A, 2, 100000, { credito: true, cliente: 'Ana', pagos: efectivo(50000) })
  await vender('2026-10-12 10:00', B, 1, 80000, { credito: true, cliente: 'Beto' })
  // 8–9. Abonos
  await abonar('2026-10-15 10:00', 'Ana', 70000, neq)
  await abonar('2026-10-18 10:00', 'Carla', 40000, efe)
  // 10. Gastos, con la misma función que usa /api/expenses
  for (const [cuando, categoria, monto] of [['2026-10-20 10:00', 'transporte', 25000], ['2026-10-21 10:00', 'publicidad', 15000]]) {
    const g = await r(`SELECT toul_registrar_gasto($1::text,$2,$1::text,$3,false) r`, [categoria, monto, efe.id])
    await q(`UPDATE expenses SET created_at = $2 WHERE id = $1`, [g.expenseId, co(cuando)])
    await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1`, [g.expenseId, co(cuando)])
  }
  // 11. Pago al proveedor por $120.000, con la misma función que usa la app
  await r(`SELECT toul_pagar_proveedor($1,120000,NULL,$2) r`, [prov.id, efe.id])
  await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1 AND type = 'provider_payment'`, [prov.id, co('2026-10-22 10:00')])
  // 12. 25 oct: venta de contado de 1 B por $80.000 que se anula el mismo día
  const anulada = await vender('2026-10-25 10:00', B, 1, 80000, { pagos: efectivo(80000) })
  await comoDueno(() => q(`SELECT toul_void_sale($1,'Prueba: se anula el mismo día')`, [anulada]))
  await q(`UPDATE payments SET created_at = $2 WHERE reference_id = $1`, [anulada, co('2026-10-25 11:00')])
  // 13–14. En el borde de los meses
  await vender('2026-10-31 23:30', B, 1, 80000, { pagos: efectivo(80000) })
  await vender('2026-11-01 00:15', A, 1, 100000, { pagos: efectivo(100000) })
  si('las 14 operaciones quedaron registradas', true)

  // ── Octubre completo, con el rango explícito ──
  const octubre = { from: instanteDeDia('2026-10-01').toISOString(), to: instanteDeDia('2026-10-31', true).toISOString() }
  const rep = await r(`SELECT toul_reporte($1,$2) r`, [octubre.from, octubre.to])
  const res = resumir(rep)

  console.log('\n— Octubre completo (1 al 31): lo que vendiste y ganaste')
  igual('Vendiste', 640000, res.vendiste)
  igual('Número de ventas', 5, res.cantidad, tal)
  igual('Ticket promedio', 128000, res.ticket)
  igual('Costo de lo vendido', 330000, res.costoNeto)
  igual('Ganancia en ventas', 310000, res.gananciaVentas)
  igual('Margen promedio', 48, res.margen, pct)
  igual('Gastos', 40000, res.gastos)
  igual('Ganaste', 270000, res.ganaste)

  console.log('\n— Octubre: tu plata')
  igual('De contado', 410000, res.contado)
  igual('A crédito', 230000, res.credito)
  igual('Vendiste a crédito', 36, res.pctCredito, pct)
  igual('Abonos que te hicieron', 110000, res.abonos)
  igual('Plata que entró', 520000, res.entro)
  igual('Mercancía que pagaste', 220000, res.mercancia)
  igual('Plata que salió', 260000, res.salio)

  console.log('\n— Octubre: cómo te pagan')
  const metodo = (nombre) => Number(rep.metodos.find(m => m.nombre === nombre)?.monto ?? 0)
  const totalDona = rep.metodos.reduce((s, m) => s + Number(m.monto), 0)
  // El mismo % que muestra la pantalla
  const pctDe = (nombre) => Math.round((metodo(nombre) / totalDona) * 100)
  igual('Efectivo', 370000, metodo('Efectivo'))
  igual('Efectivo, porcentaje', 71, pctDe('Efectivo'), pct)
  igual('Nequi', 150000, metodo('Nequi'))
  igual('Nequi, porcentaje', 29, pctDe('Nequi'), pct)
  igual('Métodos en la dona', 2, rep.metodos.length, tal)

  console.log('\n— Octubre: de cada $100 que vendiste')
  const cien = deCada100({ ventas: res.vendiste, costo: res.costoNeto, gastos: res.gastos })
  igual('Se fue en mercancía', 52, cien?.mercancia, (n) => `$${n}`)
  igual('Se fue en gastos', 6, cien?.gastos, (n) => `$${n}`)
  igual('Te quedó', 42, cien?.quedo, (n) => `$${n}`)

  console.log('\n— Octubre: en qué gastaste')
  const gasto = (cat) => Number(rep.gastosPorCategoria.find(g => g.categoria === cat)?.monto ?? 0)
  igual('Transporte', 25000, gasto('transporte'))
  igual('Publicidad', 15000, gasto('publicidad'))
  si('Transporte va primero', rep.gastosPorCategoria[0]?.categoria === 'transporte')

  console.log('\n— Octubre: qué te dejó más')
  const prod = (nombre) => rep.productos.find(p => p.nombre === nombre) ?? {}
  igual('Perfume A, ganancia', 160000, prod('Perfume A').ganancia)
  igual('Perfume A, margen', 40, prod('Perfume A').margen, pct)
  igual('Perfume B, ganancia', 150000, prod('Perfume B').ganancia)
  igual('Perfume B, margen', 63, prod('Perfume B').margen, pct)
  si('Perfume A va primero', rep.productos[0]?.nombre === 'Perfume A')

  console.log('\n— Octubre contra septiembre completo')
  const antes = rangoAnterior('custom', octubre)
  si('el periodo anterior es septiembre completo', antes.from === instanteDeDia('2026-09-01').toISOString() && antes.to === instanteDeDia('2026-09-30', true).toISOString(),
    `${antes.from} → ${antes.to}`)
  const sep = resumir(await r(`SELECT toul_reporte($1,$2) r`, [antes.from, antes.to]))
  igual('Septiembre: Ganaste', 40000, sep.ganaste)
  igual('Tendencia', 575, porcentajeTendencia({ ahora: res.ganaste, antes: sep.ganaste, ventasAntes: sep.cantidad }), (n) => `+${n}%`)

  console.log('\n— La anulada y el borde de los meses')
  const voids = await one(`SELECT count(*)::int n FROM sale_voids WHERE store_id=$1`, [STORE])
  si('la venta del 25 oct quedó anulada', voids.n === 1)
  si('y no aparece en ningún número: 5 ventas, no 6', res.cantidad === 5)
  si('ni en la plata: Efectivo $370.000, no $450.000', metodo('Efectivo') === 370000)
  const nov = resumir(await r(`SELECT toul_reporte($1,$2) r`, [instanteDeDia('2026-11-01').toISOString(), instanteDeDia('2026-11-30', true).toISOString()]))
  igual('Noviembre: vendiste (solo la del 1 nov 00:15)', 100000, nov.vendiste)
  // Lo que pide el Inicio en "Este mes" a las 23:45 del 31 y a las 00:20 del 1
  const mesOct = rangoPeriodo('month', null, new Date(co('2026-10-31 23:45')))
  const mesNov = rangoPeriodo('month', null, new Date(co('2026-11-01 00:20')))
  si('"Este mes" a las 23:45 del 31 arranca el 1 de octubre', mesOct.from === octubre.from, mesOct.from)
  si('"Este mes" a las 00:20 del 1 arranca el 1 de noviembre', mesNov.from === instanteDeDia('2026-11-01').toISOString(), mesNov.from)
  const repMesOct = resumir(await r(`SELECT toul_reporte($1,$2) r`, [mesOct.from, mesOct.to]))
  igual('"Este mes" a las 23:45 del 31: incluye la de las 23:30', 640000, repMesOct.vendiste)

  console.log('\n— La línea del gráfico del Inicio')
  const conLinea = await r(`SELECT toul_reporte($1,$2,'dia') r`, [octubre.from, octubre.to])
  const ultimoDe = (serie) => Number(serie.at(-1)?.acumulado ?? 0)
  si('Reportes no cambia: sin paso no trae la línea', rep.serie === undefined)
  si('con paso trae lo mismo de siempre', JSON.stringify({ ...conLinea, serie: undefined, primeraVenta: undefined }) === JSON.stringify(rep))
  igual('Octubre: la línea termina en Vendiste', 640000, ultimoDe(conLinea.serie))
  const lineaOct = lineaVentas({ paso: 'dia', desde: octubre.from, hasta: octubre.to, serie: conLinea.serie })
  igual('lo real de cada día de octubre suma Vendiste', 640000, lineaOct.tramos.reduce((s, t) => s + t.valor, 0))
  si('la línea suavizada nunca baja de cero', lineaOct.puntos.every(p => p.valor >= 0))
  si('la línea arranca el 4 de octubre, el día antes de la primera venta', lineaOct.desde === 3 && lineaOct.tramos[0].valor === 0)
  igual('la etiqueta del 31 dice lo real de ese día (la de las 11:30 p. m.)', 80000, tramoEn(lineaOct, 30.5)?.valor)
  si('la etiqueta del 25 (la anulada) dice sin ventas', tramoEn(lineaOct, 24.5)?.valor === 0 && tramoEn(lineaOct, 24.5)?.ventas === 0)
  const dia = (serie, fecha) => serie.find(t => new Date(t.t).getTime() === instanteDeDia(fecha).getTime())
  si('la venta de las 11:30 p. m. del 31 cae el 31 de octubre', dia(conLinea.serie, '2026-10-31')?.ventas === 1 && Number(dia(conLinea.serie, '2026-10-31')?.acumulado) === 640000)
  si('la anulada del 25 no está en la línea', dia(conLinea.serie, '2026-10-25') === undefined)
  const lineaNov = (await r(`SELECT toul_reporte($1,$2,'dia') r`, [instanteDeDia('2026-11-01').toISOString(), instanteDeDia('2026-11-30', true).toISOString()])).serie
  si('noviembre arranca con la de las 00:15 del 1, no con la del 31', lineaNov.length === 1 && dia(lineaNov, '2026-11-01')?.ventas === 1 && Number(lineaNov[0].acumulado) === 100000)
  const horasDel31 = (await r(`SELECT toul_reporte($1,$2,'hora') r`, [instanteDeDia('2026-10-31').toISOString(), instanteDeDia('2026-10-31', true).toISOString()])).serie
  si('por hora, la del 31 cae a las 11 p. m. de Colombia', horasDel31.length === 1 && new Date(horasDel31[0].t).toISOString() === new Date(co('2026-10-31 23:00')).toISOString(), horasDel31[0]?.t)
  si('la primera venta de la tienda es la del 20 de septiembre', new Date(conLinea.primeraVenta).getTime() === new Date(co('2026-09-20 10:00')).getTime(), conLinea.primeraVenta)
  let pasoMalo = null
  try { await r(`SELECT toul_reporte(now() - interval '1 day', now(), 'mes') r`) } catch (e) { pasoMalo = e.message }
  si('solo va por hora o por día', /por hora o por día/.test(pasoMalo ?? ''), pasoMalo)
  await db.exec(`SET TIME ZONE 'Asia/Tokyo'`)
  const lineaTokio = await r(`SELECT toul_reporte($1,$2,'dia') r`, [octubre.from, octubre.to])
  await db.exec(`SET TIME ZONE 'UTC'`)
  si('con la base en hora de Tokio, la línea cae en los mismos días', JSON.stringify(lineaTokio.serie.map(t => [new Date(t.t).getTime(), t.acumulado])) === JSON.stringify(conLinea.serie.map(t => [new Date(t.t).getTime(), t.acumulado])))

  console.log('\n— Mes a mes')
  const meses = await r(`SELECT toul_reporte_meses(6, '2026-11-01') r`)
  const mes = (iso) => meses.find(m => m.mes === iso) ?? {}
  igual('Septiembre: ventas', 100000, mes('2026-09-01').ventas)
  igual('Septiembre: ganancia', 40000, mes('2026-09-01').ganancia)
  igual('Octubre: ventas', 640000, mes('2026-10-01').ventas)
  igual('Octubre: ganancia', 270000, mes('2026-10-01').ganancia)
  igual('Noviembre: ventas', 100000, mes('2026-11-01').ventas)
  igual('Noviembre: ganancia', 40000, mes('2026-11-01').ganancia)
  igual('Meses', 3, meses.length, tal)
  // La base puede estar en otra zona horaria: el resultado no cambia
  await db.exec(`SET TIME ZONE 'Asia/Tokyo'`)
  const mesesTokio = await r(`SELECT toul_reporte_meses(6, '2026-11-01') r`)
  await db.exec(`SET TIME ZONE 'UTC'`)
  si('con la base en hora de Tokio, el mes a mes da lo mismo', JSON.stringify(mesesTokio) === JSON.stringify(meses))

  console.log('\n— Después de todas las operaciones')
  const cartera = await r(`SELECT toul_receivables() r`)
  const debe = (nombre) => Number(cartera.clientes.find(c => c.nombre === nombre)?.saldo ?? 0)
  igual('Te deben', 220000, cartera.total)
  igual('Clientes que te deben', 3, cartera.clientes.length, tal)
  igual('Ana', 80000, debe('Ana'))
  igual('Beto', 80000, debe('Beto'))
  igual('Carla', 60000, debe('Carla'))
  const guardado = await one(`SELECT COALESCE(SUM(total_debt),0) s FROM customers WHERE store_id=$1`, [STORE])
  igual('Te deben, según lo guardado en cada cliente', 220000, guardado.s)
  // "Debes": el Inicio y Proveedores usan la misma función (toul_payables)
  const debes = await r(`SELECT toul_payables() r`)
  igual('Debes', 80000, debes.total)
  igual('Proveedores a los que les debes', 1, debes.proveedores.length, tal)
  const copiaProveedor = await one(`SELECT COALESCE(SUM(total_debt),0) s FROM providers WHERE store_id=$1`, [STORE])
  igual('Debes, según lo guardado en el proveedor', 80000, copiaProveedor.s)
  const inventario = await r(`SELECT toul_inventory_overview(1) r`)
  igual('Plata en mercancía', 450000, inventario.value)
  const stock = await q(`SELECT name, stock FROM products WHERE store_id=$1 ORDER BY name`, [STORE])
  igual('Perfume A en stock', 4, stock[0].stock, tal)
  igual('Perfume B en stock', 7, stock[1].stock, tal)

  console.log('\n— El Inicio con el periodo octubre')
  // El Inicio pide lo mismo que Reportes (toul_reporte) y lo pasa por resumir
  const inicio = resumir(await r(`SELECT toul_reporte($1,$2) r`, [octubre.from, octubre.to]))
  igual('Inicio: Vendiste', 640000, inicio.vendiste)
  igual('Inicio: Ganancia en ventas', 310000, inicio.gananciaVentas)
  igual('Inicio: Gastos', 40000, inicio.gastos)
  igual('Inicio: Ganancia después de gastos', 270000, inicio.ganaste)

  // Las tres vistas del resumen, con lo que trae la base de datos
  const sumaBarra = (v) => v.barra.reduce((s, p) => s + p.monto, 0)
  const vistasOct = vistasInicio(inicio, rep.metodosVenta)
  si('el Inicio tiene las tres vistas', vistasOct.length === 3)
  igual('lo vendido por método suma De contado menos lo devuelto en plata', inicio.contado - inicio.devuelto,
    rep.metodosVenta.reduce((s, m) => s + Number(m.monto), 0))
  igual('Pagado y fiado: Te pagaron + Quedó fiado = Vendiste', 640000, sumaBarra(vistasOct[0]))
  igual('Ganancia y gastos: Se fue en gastos + Ganaste = Ganancia en ventas', 310000, sumaBarra(vistasOct[1]))
  igual('Cómo te pagaron: los métodos + Fiado = Vendiste', 640000, sumaBarra(vistasOct[2]))
  si('Ganaste es el mismo en las tres vistas y en Reportes', vistasOct.every(v => v.filas.find(f => f.clave === 'ganaste').monto === res.ganaste))

  console.log('\n— La auditoría (A4) sobre esta tienda')
  const auditoria = await comoDueno(() => q(`SELECT * FROM toul_auditoria()`))
  const fallan = auditoria.filter(f => !f.ok)
  si(`la auditoría revisa ${auditoria.length} cosas y todas cuadran`, fallan.length === 0,
    fallan.map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido}`).join(' | '))
  si('revisa septiembre y octubre (noviembre todavía no llega)', ['2026-09', '2026-10'].every(m => auditoria.some(f => f.periodo === m)))

  console.log('\n— La auditoría encuentra lo que está mal')
  await db.exec('BEGIN')
  await q(`UPDATE customers SET total_debt = total_debt + 5000 WHERE store_id=$1 AND name='Ana'`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-9,'ajuste')`, [STORE, B.id])
  await q(`DELETE FROM payments WHERE store_id=$1 AND type='sale_payment' AND amount=70000`, [STORE])
  const mala = await comoDueno(() => q(`SELECT * FROM toul_auditoria()`))
  await db.exec('ROLLBACK')
  const falla = (texto) => mala.find(f => !f.ok && f.chequeo.includes(texto))
  si('ve el cliente descuadrado', !!falla('guardado en cada cliente'), falla('guardado en cada cliente')?.detalle)
  si('ve el stock negativo', !!falla('stock negativo'), falla('stock negativo')?.detalle)
  si('ve el abono que no entró a la caja', !!falla('entraron a la caja'), falla('entraron a la caja')?.periodo)
  si('y nada más', mala.filter(f => !f.ok).length === 3, mala.filter(f => !f.ok).map(f => f.chequeo).join(' | '))

  console.log('\n— Todas las tiendas, solo desde el SQL Editor')
  const O2 = '22222222-2222-2222-2222-222222222222'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otra@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra tienda')`, [O2])
  const negada = await comoDueno(() => q(`SELECT * FROM toul_auditoria_todas()`).then(() => null).catch(e => e.message))
  si('un usuario de la app no puede ver todas las tiendas', negada !== null && /permission|permiso/i.test(negada), negada)
  const todas = await q(`SELECT * FROM toul_auditoria_todas()`)
  const tiendas = [...new Set(todas.map(f => f.tienda))]
  si('desde el SQL Editor revisa las dos tiendas', tiendas.length === 2, tiendas.join(', '))
  si('y todo cuadra en las dos', todas.every(f => f.ok), todas.filter(f => !f.ok).map(f => `${f.tienda}: ${f.chequeo}`).join(' | '))
  const escribir = await q(`SELECT toul_auditoria_todas()`).then(() => null)
  si('no deja rastro: las ventas siguen iguales', (await one(`SELECT count(*)::int n FROM sales WHERE store_id=$1`, [STORE])).n === 7, String(escribir))

  console.log('\n— Casos nuevos (se deshacen al final: tu tienda queda como estaba)')
  await db.exec('BEGIN')
  const noviembre = { from: instanteDeDia('2026-11-01').toISOString(), to: instanteDeDia('2026-11-30', true).toISOString() }

  // La hoja "Ventas" del Excel sale de la misma función del resumen
  const hoja = await r(`SELECT toul_reporte_detalle($1,$2) r`, [octubre.from, octubre.to])
  const sumaHoja = (campo) => hoja.reduce((s, f) => s + Number(f[campo]), 0)
  igual('Excel de octubre: filas', 5, hoja.length, tal)
  igual('Excel: la columna Total suma Ventas antes de devoluciones', 640000, sumaHoja('total'))
  igual('Excel: la columna Costo', 330000, sumaHoja('costo'))
  igual('Excel: De contado', 410000, sumaHoja('contado'))
  igual('Excel: A crédito', 230000, sumaHoja('credito'))
  si('Excel: cada venta dice por dónde pagó', hoja.some(f => f.pagos.some(p => p.metodo === 'Nequi' && Number(p.monto) === 80000)))

  // Un abono de los de antes que quedó como "General" se muestra como "Abonos"
  await db.exec(`ALTER TABLE credits DISABLE TRIGGER trg_toul_abono_con_metodo`)
  // Como lo guardaba la app entre el 29 sep y el 14 oct: el movimiento, la caja y la deuda
  const ana = await cliente('Ana')
  await q(`INSERT INTO credits(store_id,customer_id,type,amount,payment_method,created_at) VALUES ($1,$2,'payment',450,'General',$3)`, [STORE, ana, co('2026-10-20 12:00')])
  await q(`INSERT INTO payments(store_id,type,method,amount,reference_id,notes,created_at) VALUES ($1,'credit_payment','General',450,$2,'Abono cliente: Ana',$3)`, [STORE, ana, co('2026-10-20 12:00')])
  await q(`UPDATE customers SET total_debt = total_debt - 450 WHERE id = $1`, [ana])
  await db.exec(`ALTER TABLE credits ENABLE TRIGGER trg_toul_abono_con_metodo`)
  const conGeneral = await r(`SELECT toul_reporte($1,$2) r`, [octubre.from, octubre.to])
  si('"General" ya no sale en la dona', !conGeneral.metodos.some(m => m.nombre === 'General'))
  igual('sale como "Abonos"', 450, Number(conGeneral.metodos.find(m => m.nombre === 'Abonos')?.monto ?? 0))
  igual('y la dona suma lo que entró', resumir(conGeneral).entro, conGeneral.metodos.reduce((s, m) => s + Number(m.monto), 0))

  // Un abono nuevo sin método ya no se puede guardar, venga de donde venga
  const beto = await cliente('Beto')
  const sinMetodo = await errTx(`INSERT INTO credits(store_id,customer_id,type,amount) VALUES ($1,$2,'payment',1000)`, [STORE, beto])
  si('un abono nuevo sin método se rechaza', /por dónde/.test(sinMetodo ?? ''), sinMetodo)
  const sinMetodoApp = await errTx(`SELECT toul_registrar_abono($1,1000,NULL,NULL)`, [beto], O)
  si('tampoco desde la app', /por dónde/.test(sinMetodoApp ?? ''), sinMetodoApp)

  // Plata en mercancía también cuenta lo escondido que tiene stock
  await q(`UPDATE products SET is_active = false WHERE id = $1`, [B.id])
  const conEscondido = await r(`SELECT toul_inventory_overview(1) r`)
  igual('Plata en mercancía con el Perfume B escondido', 450000, conEscondido.value)
  igual('de eso, escondido', 210000, conEscondido.hiddenValue)
  await q(`UPDATE products SET is_active = true WHERE id = $1`, [B.id])

  // "Menos stock" cuenta las presentaciones
  const [C] = await q(`INSERT INTO products(store_id,name,sale_price,cpp) VALUES ($1,'Perfume C',50000,20000) RETURNING id`, [STORE])
  const [ml50] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp,low_stock_threshold) VALUES ($1,$2,'50ml',50000,20000,3) RETURNING id`, [STORE, C.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,2,'initial')`, [STORE, C.id, ml50.id])
  const conPresentacion = await r(`SELECT toul_inventory_overview(30) r`)
  si('"Menos stock" muestra la presentación de 50ml con 2 unidades', conPresentacion.alerts.some(a => a.kind === 'presentacion' && a.variant_name === '50ml' && Number(a.stock) === 2))
  igual('y la plata en mercancía la cuenta', 490000, conPresentacion.value)

  // Pagarle al proveedor: todo o nada
  const deMas = await errTx(`SELECT toul_pagar_proveedor($1,999999,NULL,$2) r`, [prov.id, efe.id], O)
  si('no deja pagar más de lo que le debes', /no puede ser mayor/.test(deMas ?? ''), deMas)
  igual('y no toca nada', 80000, (await r(`SELECT toul_payables() r`)).total)
  await r(`SELECT toul_pagar_proveedor($1,30000,NULL,$2) r`, [prov.id, efe.id])
  igual('pagas $30.000: ahora le debes', 50000, (await r(`SELECT toul_payables() r`)).total)
  igual('la copia del proveedor queda igual', 50000, (await one(`SELECT total_debt s FROM providers WHERE id=$1`, [prov.id])).s)
  igual('y la caja tiene los dos pagos', 150000, (await one(`SELECT SUM(amount) s FROM payments WHERE store_id=$1 AND type='provider_payment'`, [STORE])).s)

  // Una devolución el 2 de noviembre: "Vendiste" es después de devoluciones.
  // La devolución solo se permite hasta 30 días: se acerca la venta a hoy y luego se le devuelve su hora
  const ventaNov = (await one(`SELECT id FROM sales WHERE store_id=$1 AND created_at >= $2 AND created_at <= $3`, [STORE, noviembre.from, noviembre.to])).id
  const itemNov = (await one(`SELECT id FROM sale_items WHERE sale_id=$1`, [ventaNov])).id
  await q(`UPDATE sales SET created_at = now() WHERE id=$1`, [ventaNov])
  await comoDueno(() => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'No le gustó')`, [ventaNov, JSON.stringify([{ saleItemId: itemNov, quantity: 1 }])]))
  await q(`UPDATE sales SET created_at = $2 WHERE id=$1`, [ventaNov, co('2026-11-01 00:15')])
  await q(`UPDATE sale_returns SET created_at = $2 WHERE sale_id=$1`, [ventaNov, co('2026-11-02 10:00')])
  const conDevolucion = resumir(await r(`SELECT toul_reporte($1,$2) r`, [noviembre.from, noviembre.to]))
  igual('Noviembre con la devolución: Vendiste', 0, conDevolucion.vendiste)
  igual('Ventas antes de devoluciones', 100000, conDevolucion.ventasAntes)
  igual('De contado + A crédito = Ventas antes de devoluciones', 100000, conDevolucion.contado + conDevolucion.credito)
  igual('la devolución sale como plata', 100000, conDevolucion.devuelto)
  igual('Ganaste', 0, conDevolucion.ganaste)
  const repDevolucion = await r(`SELECT toul_reporte($1,$2) r`, [noviembre.from, noviembre.to])
  const vistasDevolucion = vistasInicio(conDevolucion, repDevolucion.metodosVenta)
  si('lo devuelto en plata sale del método por el que se devolvió', repDevolucion.metodosVenta.length === 0,
    JSON.stringify(repDevolucion.metodosVenta))
  si('con la devolución las tres barras quedan en cero', vistasDevolucion.every(v => sumaBarra(v) === 0))
  const lineaDevolucion = (await r(`SELECT toul_reporte($1,$2,'dia') r`, [noviembre.from, noviembre.to])).serie
  si('la línea sube el 1 y baja el 2 con la devolución', JSON.stringify(lineaDevolucion.map(t => Number(t.acumulado))) === JSON.stringify([100000, 0]))
  const mesesConDevolucion = await r(`SELECT toul_reporte_meses(6, '2026-11-01') r`)
  igual('Mes a mes de noviembre: ventas', 0, mesesConDevolucion.find(m => m.mes === '2026-11-01')?.ventas)
  igual('Mes a mes de noviembre: ganancia', 0, mesesConDevolucion.find(m => m.mes === '2026-11-01')?.ganancia)

  // Va después de revisar noviembre: su fecha (hace 2 días) puede caer en cualquier mes
  // Una venta sin internet: la caja, los pagos y el fiado quedan con la hora real
  const hace2 = new Date(Date.now() - 2 * 86_400_000)
  const offline = await r(`SELECT (process_sale($1::jsonb))->>'saleId' r`, [JSON.stringify({
    cart: [{ product: { id: B.id, name: 'x' }, quantity: 1, unitPrice: 80000 }],
    payments: nequi(30000), subtotal: 80000, total: 80000, isCredit: true, customerName: 'Daniel',
    initialPayment: 30000, soldAt: hace2.toISOString(), clientSaleId: 'sin-senal-1',
  })])
  const hora = async (sql) => new Date((await one(sql, [offline])).t).getTime()
  si('la venta quedó con su hora real', await hora(`SELECT created_at t FROM sales WHERE id=$1`) === hace2.getTime())
  si('la entrada de caja también', await hora(`SELECT created_at t FROM payments WHERE reference_id=$1 AND type='sale'`) === hace2.getTime())
  si('el detalle del pago también', await hora(`SELECT created_at t FROM sale_payments WHERE sale_id=$1`) === hace2.getTime())
  si('y el fiado también', await hora(`SELECT created_at t FROM credits WHERE sale_id=$1 AND type='debt'`) === hace2.getTime())

  const auditoriaNueva = await comoDueno(() => q(`SELECT * FROM toul_auditoria()`))
  si('con todos los casos nuevos, la auditoría sigue cuadrando', auditoriaNueva.every(f => f.ok),
    auditoriaNueva.filter(f => !f.ok).map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido}`).join(' | '))
  await db.exec('ROLLBACK')

  // ── Escenario 2 (Félix, 2026-11-07): el 1 más dos operaciones ──
  console.log('\n— Escenario 2: Saqué plata y una compra con "Plata mía"')
  // 15. 20 oct 6:00 p. m.: Saqué plata $50.000 en efectivo
  const saque = await r(`SELECT toul_registrar_movimiento('saque',50000,$1,NULL) r`, [efe.id])
  await q(`UPDATE payments SET created_at = $2 WHERE id = $1`, [saque.id, co('2026-10-20 18:00')])
  // 16. 22 oct 3:00 p. m.: compra de contado de 3 Perfume B por $90.000, pagada con Plata mía
  const c16 = await r(`SELECT (process_purchase($1::jsonb))->>'purchaseId' r`, [JSON.stringify({
    isCredit: false, plataMia: true, items: [{ productId: B.id, quantity: 3, unitCost: 30000 }] })])
  await fecharCompra(c16, co('2026-10-22 15:00'))
  si('las 2 operaciones quedaron registradas', !!saque.id && !!c16)

  const rep2 = await r(`SELECT toul_reporte($1,$2) r`, [octubre.from, octubre.to])
  const res2 = resumir(rep2)
  igual('Ganaste', 270000, res2.ganaste)
  igual('Metiste', 90000, res2.metiste)
  igual('Sacaste para ti', 50000, res2.sacaste)
  igual('Mercancía que pagaste', 310000, res2.mercancia)
  igual('Plata que salió', 350000, res2.salio)
  igual('Plata que entró', 520000, res2.entro)
  igual('Plata en mercancía (4 A + 10 B)', 540000, (await r(`SELECT toul_inventory_overview(1) r`)).value)
  igual('Debes', 80000, (await r(`SELECT toul_payables() r`)).total)
  const stock2 = await q(`SELECT name, stock FROM products WHERE store_id=$1 AND name IN ('Perfume A','Perfume B') ORDER BY name`, [STORE])
  igual('Perfume A en stock', 4, stock2[0].stock, tal)
  igual('Perfume B en stock', 10, stock2[1].stock, tal)
  const salida16 = await one(`SELECT id, amount, own_money, created_at FROM payments WHERE reference_id=$1 AND type='purchase'`, [c16])
  const meti16 = await one(`SELECT amount, created_at FROM payments WHERE linked_payment_id=$1 AND type='owner_in'`, [salida16.id])
  si('la compra con plata mía tiene su Metí plata por el mismo monto y el mismo día', salida16.own_money && Number(meti16?.amount) === 90000
    && new Date(meti16.created_at).getTime() === new Date(co('2026-10-22 15:00')).getTime())
  igual('el Metí plata no cambia lo que ganaste: sigue igual que en el escenario 1', res.ganaste, res2.ganaste)
  const auditoria2 = await comoDueno(() => q(`SELECT * FROM toul_auditoria()`))
  si('la auditoría del escenario 2 cuadra', auditoria2.every(f => f.ok),
    auditoria2.filter(f => !f.ok).map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido}`).join(' | '))
  si('y revisa Metí y Saqué plata de octubre', auditoria2.some(f => f.periodo === '2026-10' && f.chequeo.includes('no cambian Ganaste') && f.ok && /metiste \$90000 y sacaste \$50000/.test(f.detalle ?? '')),
    auditoria2.find(f => f.periodo === '2026-10' && f.chequeo.includes('no cambian Ganaste'))?.detalle)

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
