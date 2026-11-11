// Movimientos: Gasto, Metí plata y Saqué plata (deploy_movimientos.sql).
//
// Permisos en el servidor, el turno, "Plata mía", el turno cerrado, las
// cuentas por número, Reportes, el capital viejo y la auditoría.
// Solo corre en la base de pruebas en memoria (PGlite).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const O = '11111111-1111-1111-1111-111111111111'
const S = '22222222-2222-2222-2222-222222222222'
const O2 = '44444444-4444-4444-4444-444444444444'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OTRA = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
const DEPLOY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy_movimientos.sql')
let fails = 0
const ok = (c, m, detalle = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (detalle && !c ? ` (${detalle})` : '')); if (!c) fails++ }

export default async function (db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  /** Como un usuario de la app. Al salir, la base vuelve a no tener usuario (SQL Editor) */
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub', '', false);`) }
  }
  const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
  const r = (uid, sql, p) => as(uid, async () => (await one(sql, p)).r)
  const intento = (uid, sql, p) => as(uid, () => err(() => q(sql, p)))
  // Así se anotaba "Plata mía" antes del 11 de noviembre (ya no se puede
  // elegir): para probar que lo viejo sigue funcionando igual
  const comoAntes = async (fn) => {
    await db.exec('ALTER TABLE payments DISABLE TRIGGER trg_payments_cuenta_obligatoria')
    try { return await fn() } finally { await db.exec('ALTER TABLE payments ENABLE TRIGGER trg_payments_cuenta_obligatoria') }
  }

  const gasto = (uid, monto, { metodo = null, plataMia = false, categoria = 'transporte', desc = null } = {}) =>
    r(uid, `SELECT toul_registrar_gasto($1,$2,$3,$4,$5) r`, [categoria, monto, desc, metodo, plataMia])
  const meti = (monto, metodo, nota = null) => r(O, `SELECT toul_registrar_movimiento('meti',$1,$2,$3) r`, [monto, metodo, nota])
  const saque = (monto, metodo, nota = null) => r(O, `SELECT toul_registrar_movimiento('saque',$1,$2,$3) r`, [monto, metodo, nota])
  const totales = (id) => q(`SELECT toul_cash_session_totals($1) r`, [id]).then(x => x[0].r)
  const esperado = async (id) => Number((await totales(id)).expectedCash)
  const pagoDeGasto = (id) => one(`SELECT * FROM payments WHERE reference_id=$1 AND type='expense'`, [id])
  const atado = (pagoId) => one(`SELECT * FROM payments WHERE linked_payment_id=$1`, [pagoId])

  // ── La tienda ──
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com'),($3,'o2@x.com')`, [O, S, O2])
  await q(`INSERT INTO stores(id,owner_id,name,plan) VALUES ($1,$2,'Isla','pro'),($3,$4,'Otra','pro')`, [STORE, O, OTRA, O2])
  const [perfume] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Perfume',100000,40000,40000) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,20,'initial')`, [STORE, perfume.id])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [nequi] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  const [davi] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Daviplata') RETURNING id`, [STORE])
  const [ajena] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [OTRA])
  const [prov] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Aromas') RETURNING id`, [STORE])
  const code = await r(O, `SELECT toul_create_invite('Laura') r`).then(x => x.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  // Una venta antes de abrir el turno: la auditoría revisa desde el mes de la primera venta
  await r(O, `SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    cart: [{ product: { id: perfume.id, name: 'Perfume' }, quantity: 1, unitPrice: 100000 }],
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 100000 }], subtotal: 100000, total: 100000, isCredit: false })])

  console.log('\n— El vendedor, por defecto, no anota gastos')
  let msg = await intento(S, `SELECT toul_registrar_gasto('transporte',10000,NULL,$1,false)`, [efe.id])
  ok(/No tienes permiso para anotar gastos/.test(msg ?? ''), 'sin el permiso, el servidor lo rechaza', msg)
  msg = await intento(S, `SELECT toul_registrar_movimiento('saque',10000,$1,NULL)`, [efe.id])
  ok(/Solo el administrador/.test(msg ?? ''), 'nunca anota Saqué plata', msg)
  msg = await intento(S, `SELECT toul_registrar_movimiento('meti',10000,$1,NULL)`, [efe.id])
  ok(/Solo el administrador/.test(msg ?? ''), 'ni Metí plata', msg)
  msg = await intento(S, `INSERT INTO payments(store_id,type,method,method_id,amount) VALUES ($1,'owner_out','Efectivo',$2,10000)`, [STORE, efe.id])
  ok(msg !== null, 'tampoco saltándose la pantalla', msg)
  msg = await intento(S, `INSERT INTO payments(store_id,type,method,amount) VALUES ($1,'expense','Efectivo',10000)`, [STORE])
  ok(msg !== null, 'ni un gasto directo al libro', msg)

  console.log('\n— El administrador le da el permiso "Registrar gastos"')
  msg = await intento(O, `SELECT toul_set_seller_permissions('{"registrar_gastos":"aprobacion"}'::jsonb)`)
  ok(/Permiso no válido/.test(msg ?? ''), 'solo es sí o no', msg)
  const guardados = await r(O, `SELECT toul_set_seller_permissions('{"registrar_gastos":"solo"}'::jsonb) r`)
  ok(guardados.registrar_gastos === 'solo' && guardados.fiar === 'aprobacion', 'queda guardado y lo demás igual')
  msg = await intento(S, `SELECT toul_set_seller_permissions('{"registrar_gastos":"solo"}'::jsonb)`)
  ok(/Solo el administrador/.test(msg ?? ''), 'el vendedor no se lo da solo', msg)
  msg = await intento(S, `SELECT toul_registrar_gasto('transporte',10000,NULL,NULL,false)`)
  ok(/Elige con qué pagaste/.test(msg ?? ''), 'el vendedor tiene que decir con qué pagó', msg)
  msg = await intento(S, `SELECT toul_registrar_gasto('transporte',10000,NULL,NULL,true)`)
  ok(/plata suya/.test(msg ?? ''), 'y nunca con "Plata mía"', msg)
  msg = await intento(S, `SELECT toul_registrar_gasto('transporte',0,NULL,$1,false)`, [efe.id])
  ok(/cuánto gastaste/.test(msg ?? ''), 'un gasto de $0 no se guarda', msg)

  console.log('\n— El turno: lo que entra y sale en efectivo cuenta')
  const turno = await r(S, `SELECT toul_open_cash_session(50000) r`).then(x => x.id)
  ok(await esperado(turno) === 50000, 'abre con $50.000')
  const m1 = await meti(30000, efe.id, 'Para el cambio')
  ok(await esperado(turno) === 80000, 'Metí plata $30.000 en efectivo: debería haber $80.000')
  const s1 = await saque(20000, efe.id)
  ok(await esperado(turno) === 60000, 'Saqué plata $20.000 en efectivo: $60.000')
  const gv = await gasto(S, 10000, { metodo: efe.id, desc: 'Domicilio' })
  ok(gv.success && await esperado(turno) === 50000, 'el vendedor anota un gasto de $10.000 en efectivo: $50.000')
  const pgv = await pagoDeGasto(gv.expenseId)
  ok(pgv.created_by === S && pgv.created_by_name === 'Laura', 'el gasto queda firmado por quien lo anotó', `${pgv.created_by} ${pgv.created_by_name}`)
  ok(pgv.method_id === efe.id && pgv.method === 'Efectivo', 'y con la cuenta por número')
  await meti(40000, nequi.id)
  const gn = await gasto(O, 5000, { metodo: nequi.id })
  ok(await esperado(turno) === 50000, 'lo que entra o sale por Nequi no cambia el efectivo')
  const gpm = await comoAntes(() => gasto(O, 15000, { plataMia: true, desc: 'Bolsas' }))
  ok(await esperado(turno) === 50000, 'ni un gasto pagado con plata mía')
  const compra = await r(O, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: false, methodId: efe.id, items: [{ productId: perfume.id, quantity: 1, unitCost: 25000 }] })])
  ok(await esperado(turno) === 25000, 'una compra de $25.000 pagada en efectivo sale del turno')
  let t = await totales(turno)
  ok(Number(t.ownerInCash) === 30000 && Number(t.ownerOutCash) === 20000 && Number(t.expenseCash) === 10000 && Number(t.merchandiseCash) === 25000,
    'el resumen del turno separa Metí, Saqué, gastos y mercancía en efectivo', JSON.stringify(t))
  ok(t.byMethod.length === 1 && t.byMethod[0].method === 'Efectivo' && Number(t.byMethod[0].net) === -25000, 'solo el efectivo está en el turno', JSON.stringify(t.byMethod))

  console.log('\n— Con el turno abierto se puede corregir')
  await as(O, () => q(`SELECT toul_update_expense($1,'transporte','Domicilio',10000,$2,NULL)`, [gv.expenseId, nequi.id]))
  ok(await esperado(turno) === 35000 && (await pagoDeGasto(gv.expenseId)).cash_session_id === null, 'pasar el gasto a Nequi lo saca del turno')
  await as(O, () => q(`SELECT toul_update_expense($1,'transporte','Domicilio',10000,$2,NULL)`, [gv.expenseId, efe.id]))
  ok(await esperado(turno) === 25000 && (await pagoDeGasto(gv.expenseId)).cash_session_id === turno, 'y volverlo a efectivo lo devuelve')
  msg = await intento(S, `SELECT toul_update_expense($1,'transporte','Domicilio',1,NULL,NULL)`, [gv.expenseId])
  ok(/Solo el administrador/.test(msg ?? '') || /no existe/.test(msg ?? ''), 'el vendedor no corrige gastos', msg)
  msg = await intento(S, `SELECT toul_delete_expense($1)`, [gv.expenseId])
  ok(msg !== null, 'ni los borra', msg)
  msg = await intento(S, `SELECT toul_editar_movimiento($1,1,NULL,NULL)`, [m1.id])
  ok(/Solo el administrador/.test(msg ?? ''), 'ni toca Metí o Saqué plata', msg)

  console.log('\n— Se cierra el turno: ya no cambia')
  const cierre = await r(S, `SELECT toul_close_cash_session($1,25000,NULL) r`, [turno])
  ok(Number(cierre.difference) === 0, 'cierra cuadrado en $25.000')
  msg = await intento(O, `SELECT toul_editar_movimiento($1,35000,NULL,'Para el cambio')`, [m1.id])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'el monto de un Metí plata de un turno cerrado no cambia', msg)
  msg = await intento(O, `SELECT toul_editar_movimiento($1,30000,$2,'Para el cambio')`, [m1.id, nequi.id])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'ni su cuenta', msg)
  await as(O, () => q(`SELECT toul_editar_movimiento($1,30000,NULL,'Cambio para el fin de semana')`, [m1.id]))
  ok((await one(`SELECT notes FROM payments WHERE id=$1`, [m1.id])).notes === 'Cambio para el fin de semana', 'la nota sí se puede cambiar')
  msg = await intento(O, `SELECT toul_borrar_movimiento($1)`, [s1.id])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'un Saqué plata de un turno cerrado no se borra', msg)
  await as(O, () => q(`SELECT toul_update_expense($1,'servicios','Domicilio del lunes',10000,NULL,NULL)`, [gv.expenseId]))
  const gvc = await one(`SELECT category, description FROM expenses WHERE id=$1`, [gv.expenseId])
  ok(gvc.category === 'servicios' && gvc.description === 'Domicilio del lunes', 'del gasto se puede cambiar la categoría y la nota')
  msg = await intento(O, `SELECT toul_update_expense($1,'servicios','Domicilio',12000,NULL,NULL)`, [gv.expenseId])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'pero no el monto', msg)
  ok(Number((await one(`SELECT amount FROM expenses WHERE id=$1`, [gv.expenseId])).amount) === 10000, 'y no quedó a medias: el gasto sigue en $10.000')
  msg = await intento(O, `SELECT toul_update_expense($1,'servicios','Domicilio',10000,$2,NULL)`, [gv.expenseId, nequi.id])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'ni la cuenta', msg)
  msg = await intento(O, `SELECT toul_delete_expense($1)`, [gv.expenseId])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'ni se borra', msg)
  msg = await intento(O, `SELECT toul_void_purchase($1,NULL)`, [compra.purchaseId])
  ok(/turno que ya se cerró/.test(msg ?? ''), 'una compra pagada en efectivo en ese turno no se anula', msg)
  ok((await one(`SELECT status FROM purchases WHERE id=$1`, [compra.purchaseId])).status === 'completed', 'y la compra sigue igual')
  msg = await intento(O, `SELECT toul_update_expense($1,'transporte',NULL,5000,$2,NULL)`, [gn.expenseId, efe.id])
  ok(/no se puede pasar a efectivo/.test(msg ?? ''), 'un gasto por Nequi de ese turno no se puede pasar a efectivo', msg)
  await as(O, () => q(`SELECT toul_update_expense($1,'transporte',NULL,6000,NULL,NULL)`, [gn.expenseId]))
  ok(Number((await pagoDeGasto(gn.expenseId)).amount) === 6000, 'pero sí corregir su monto: no estaba en el turno')
  ok(await esperado(turno) === 25000, 'el turno cerrado sigue dando $25.000')
  const m2 = await meti(10000, efe.id)
  ok((await one(`SELECT cash_session_id FROM payments WHERE id=$1`, [m2.id])).cash_session_id === null, 'sin turno abierto, Metí plata no va a ningún turno')

  console.log('\n— Plata mía: su Metí plata va atado')
  const ppm = await pagoDeGasto(gpm.expenseId)
  let at = await atado(ppm.id)
  ok(ppm.own_money && ppm.method === 'Plata mía' && ppm.method_id === null, 'el gasto queda pagado con "Plata mía"')
  ok(at && at.type === 'owner_in' && Number(at.amount) === 15000 && at.own_money, 'y tiene su Metí plata de $15.000')
  ok(at && new Date(at.created_at).getTime() === new Date(ppm.created_at).getTime() && at.reference_id === gpm.expenseId, 'con la misma fecha y el mismo gasto')
  msg = await intento(O, `SELECT toul_editar_movimiento($1,1000,NULL,NULL)`, [at.id])
  ok(/corrígelo o bórralo desde ahí/.test(msg ?? ''), 'el Metí plata atado no se corrige por su lado', msg)
  msg = await intento(O, `SELECT toul_borrar_movimiento($1)`, [at.id])
  ok(/corrígelo o bórralo desde ahí/.test(msg ?? ''), 'ni se borra por su lado', msg)
  msg = await intento(O, `UPDATE payments SET amount = 1000 WHERE id = $1`, [at.id])
  ok(/corrígelo o bórralo desde ahí/.test(msg ?? ''), 'ni saltándose la pantalla', msg)
  await as(O, () => q(`SELECT toul_update_expense($1,'empaques','Bolsas',18000,NULL,NULL)`, [gpm.expenseId]))
  ok(Number((await atado(ppm.id)).amount) === 18000, 'si el gasto pasa a $18.000, su Metí plata también')
  await as(O, () => q(`SELECT toul_update_expense($1,'empaques','Bolsas',18000,$2,NULL)`, [gpm.expenseId, nequi.id]))
  ok(!(await atado(ppm.id)) && (await pagoDeGasto(gpm.expenseId)).method === 'Nequi', 'si se paga con Nequi, el Metí plata desaparece')
  // Cambio de regla (11 nov): "Plata mía" ya no se puede elegir, tampoco para volver a ella
  msg = await intento(O, `SELECT toul_update_expense($1,'empaques','Bolsas',18000,NULL,true)`, [gpm.expenseId])
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? '') && !(await atado(ppm.id)), 'ya no vuelve a "Plata mía"', msg)
  await comoAntes(() => as(O, () => q(`SELECT toul_update_expense($1,'empaques','Bolsas',18000,NULL,true)`, [gpm.expenseId])))
  ok(Number((await atado(ppm.id))?.amount) === 18000, 'si vuelve a "Plata mía", vuelve')
  await as(O, () => q(`SELECT toul_delete_expense($1)`, [gpm.expenseId]))
  ok(!(await atado(ppm.id)) && !(await pagoDeGasto(gpm.expenseId)), 'si se borra el gasto, se va con su Metí plata')

  const compraPM = await comoAntes(() => r(O, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: false, plataMia: true, items: [{ productId: perfume.id, quantity: 2, unitCost: 30000 }] })]))
  const pcm = await one(`SELECT * FROM payments WHERE reference_id=$1 AND type='purchase'`, [compraPM.purchaseId])
  ok(pcm.own_money && Number((await atado(pcm.id))?.amount) === 60000, 'una compra con plata mía: su Metí plata de $60.000')
  ok((await one(`SELECT payment_method FROM purchase_payments WHERE purchase_id=$1`, [compraPM.purchaseId])).payment_method === 'Plata mía', 'y el pago de la compra dice "Plata mía"')
  await as(O, () => q(`SELECT toul_void_purchase($1,NULL)`, [compraPM.purchaseId]))
  ok(!(await one(`SELECT 1 x FROM payments WHERE reference_id=$1`, [compraPM.purchaseId])), 'anulada la compra, no queda ni la salida ni el Metí plata')

  const credito = await r(O, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: true, providerId: prov.id, paidNow: 0, items: [{ productId: perfume.id, quantity: 2, unitCost: 40000 }] })])
  const pagoProv = await comoAntes(() => r(O, `SELECT toul_pagar_proveedor($1,30000,NULL,NULL,true) r`, [prov.id]))
  const ppp = await one(`SELECT * FROM payments WHERE reference_id=$1 AND type='provider_payment'`, [prov.id])
  ok(Number(pagoProv.saldo) === 50000 && ppp.own_money && Number((await atado(ppp.id))?.amount) === 30000, 'un pago al proveedor con plata mía baja la deuda y tiene su Metí plata')
  ok(credito.success, 'la compra a crédito quedó')

  msg = await intento(O, `SELECT process_purchase($1::jsonb)`, [JSON.stringify({ isCredit: false, plataMia: true, items: [{ productId: perfume.id, quantity: 1, unitCost: 1000 }, { productId: '99999999-9999-9999-9999-999999999999', quantity: 1, unitCost: 1000 }] })])
  ok(/Producto no encontrado/.test(msg ?? ''), 'una compra con plata mía que falla a la mitad')
  ok(Number((await one(`SELECT count(*) n FROM payments WHERE store_id=$1 AND amount=2000`, [STORE])).n) === 0, 'no deja ni la salida ni el Metí plata: todo o nada')

  console.log('\n— Las cuentas van por número')
  await q(`UPDATE payment_methods SET is_active = false WHERE id = $1`, [davi.id])
  msg = await intento(O, `SELECT toul_registrar_movimiento('meti',1000,$1,NULL)`, [davi.id])
  ok(/ya no se usa/.test(msg ?? ''), 'una cuenta quitada no se usa para algo nuevo', msg)
  msg = await intento(O, `SELECT toul_registrar_gasto('transporte',1000,NULL,$1,false)`, [davi.id])
  ok(/ya no se usa/.test(msg ?? ''), 'ni para un gasto', msg)
  ok(Number((await one(`SELECT count(*) n FROM expenses WHERE store_id=$1 AND amount=1000`, [STORE])).n) === 0, 'y el gasto rechazado no quedó guardado a medias')
  msg = await intento(O, `SELECT toul_registrar_movimiento('saque',1000,$1,NULL)`, [ajena.id])
  ok(/no es de tu negocio/.test(msg ?? ''), 'una cuenta de otra tienda se rechaza', msg)
  msg = await intento(O, `SELECT toul_registrar_movimiento('saque',1000,NULL,NULL)`)
  ok(/de dónde la sacaste/.test(msg ?? ''), 'Saqué plata pide de dónde', msg)
  await q(`UPDATE payment_methods SET name = 'Caja' WHERE id = $1`, [efe.id])
  t = await totales(turno)
  ok(t.byMethod[0]?.method === 'Caja' && Number(t.expectedCash) === 25000, 'renombrar Efectivo a "Caja": el turno lo muestra con el nombre nuevo y da lo mismo', JSON.stringify(t.byMethod))
  ok((await one(`SELECT method_id FROM payments WHERE id=$1`, [m1.id])).method_id === efe.id, 'y el movimiento sigue en la misma cuenta')
  await q(`UPDATE payment_methods SET name = 'Efectivo' WHERE id = $1`, [efe.id])
  msg = await err(() => q(`INSERT INTO payments(store_id,type,method,amount) VALUES ($1,'transfer_in','Nequi',1000)`, [STORE]))
  ok(/ya no existe/.test(msg ?? ''), 'no se pueden anotar traslados nuevos', msg)

  console.log('\n— Reportes: Metí y Saqué plata van aparte')
  const desde = new Date(Date.now() - 86_400_000).toISOString()
  const hasta = new Date(Date.now() + 86_400_000).toISOString()
  const antes = await r(O, `SELECT toul_reporte($1,$2) r`, [desde, hasta])
  await meti(500000, nequi.id)
  await saque(200000, efe.id)
  const despues = await r(O, `SELECT toul_reporte($1,$2) r`, [desde, hasta])
  ok(Number(despues.metiste) - Number(antes.metiste) === 500000 && Number(despues.sacaste) - Number(antes.sacaste) === 200000, 'Metiste y Sacaste para ti suben')
  const sinDueno = (x) => JSON.stringify({ ...x, metiste: undefined, sacaste: undefined })
  ok(sinDueno(antes) === sinDueno(despues), 'y nada más cambia: ni Ganaste, ni gastos, ni la plata que entró o salió')
  const todo = await r(O, `SELECT toul_reporte(NULL,NULL) r`)
  const directo = await one(`SELECT SUM(amount) FILTER (WHERE type='owner_in') mi, SUM(amount) FILTER (WHERE type='owner_out') sa FROM payments WHERE store_id=$1`, [STORE])
  ok(Number(todo.metiste) === Number(directo.mi) && Number(todo.sacaste) === Number(directo.sa), 'el total da lo mismo que sumar el libro', `${todo.metiste}/${directo.mi} ${todo.sacaste}/${directo.sa}`)
  const deOtro = await r(O2, `SELECT toul_reporte(NULL,NULL) r`)
  ok(Number(deOtro.metiste) === 0 && Number(deOtro.sacaste) === 0, 'cada tienda ve solo lo suyo')

  console.log('\n— El capital propio de antes')
  const [cv] = await q(`INSERT INTO purchases(store_id,subtotal,total,payment_method,is_credit,status,created_at) VALUES ($1,50000,50000,'capital',false,'completed','2026-08-10 15:00Z') RETURNING id`, [STORE])
  const [cva] = await q(`INSERT INTO purchases(store_id,subtotal,total,payment_method,is_credit,status,created_at) VALUES ($1,8000,8000,'capital',false,'voided','2026-08-11 15:00Z') RETURNING id`, [STORE])
  const [ev] = await q(`INSERT INTO expenses(store_id,category,amount,payment_method,created_at) VALUES ($1,'arriendo',7000,'Capital Propio','2026-08-12 15:00Z') RETURNING id`, [STORE])
  // Una compra a crédito de antes que se le pagó al proveedor con capital propio
  const [prov2] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Esencias') RETURNING id`, [STORE])
  const [cc] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit,status,created_at) VALUES ($1,$2,9000,9000,'credit',true,'completed','2026-08-05 15:00Z') RETURNING id`, [STORE, prov2.id])
  await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount,status) VALUES ($1,$2,$3,9000,0,'paid')`, [STORE, prov2.id, cc.id])
  await q(`INSERT INTO owner_capital_injections(store_id,amount,reference_type,reference_id,notes,created_at) VALUES
      ($1,50000,'purchase',$2,'Compra con capital','2026-08-10 15:00Z'),
      ($1,8000,'purchase',$3,NULL,'2026-08-11 15:00Z'),
      ($1,7000,'expense',$4,NULL,'2026-08-12 15:00Z'),
      ($1,3000,'expense','99999999-9999-9999-9999-999999999999',NULL,'2026-08-13 15:00Z'),
      ($1,9000,'provider_payment',$5,NULL,'2026-08-14 15:00Z'),
      ($1,11000,NULL,NULL,'Arranqué el negocio','2026-08-01 15:00Z')`, [STORE, cv.id, cva.id, ev.id, prov2.id])
  const agosto = [new Date('2026-08-01T05:00:00Z').toISOString(), new Date('2026-09-01T04:59:59Z').toISOString()]
  const agostoAntes = await r(O, `SELECT toul_reporte($1,$2) r`, agosto)
  await db.exec(fs.readFileSync(DEPLOY, 'utf8'))
  await db.exec(fs.readFileSync(DEPLOY, 'utf8'))
  const migrados = await q(`SELECT type, amount, own_money, linked_payment_id, legacy_capital_id, created_by FROM payments WHERE store_id=$1 AND created_at < '2026-09-01' ORDER BY created_at, type`, [STORE])
  const de = (tipo, monto) => migrados.filter(m => m.type === tipo && Number(m.amount) === monto)
  ok(de('purchase', 50000).length === 1 && de('purchase', 50000)[0].own_money, 'la compra pagada con capital queda como salida con "Plata mía"')
  ok(de('owner_in', 50000).length === 1 && de('owner_in', 50000)[0].linked_payment_id, 'con su Metí plata atado')
  ok(de('expense', 7000).length === 1 && de('owner_in', 7000).length === 1, 'el gasto pagado con capital, igual')
  ok(de('provider_payment', 9000).length === 1 && de('owner_in', 9000).length === 1, 'y el pago al proveedor, igual')
  ok(de('owner_in', 11000).length === 1 && !de('owner_in', 11000)[0].linked_payment_id, 'el capital suelto queda como Metí plata suelto')
  ok(de('purchase', 8000).length === 0 && de('owner_in', 8000).length === 0, 'lo de una compra anulada no entra')
  ok(de('owner_in', 3000).length === 0, 'ni lo de un gasto que ya se borró')
  ok(migrados.length === 7, 'correrlo dos veces no copia nada dos veces', String(migrados.length))
  ok(migrados.every(m => m.created_by === null), 'lo copiado no queda firmado por nadie')
  const agostoDespues = await r(O, `SELECT toul_reporte($1,$2) r`, agosto)
  ok(Number(agostoDespues.metiste) === 77000, 'agosto: Metiste $77.000', String(agostoDespues.metiste))
  ok(Number(agostoDespues.mercanciaPagada) - Number(agostoAntes.mercanciaPagada) === 59000, 'y "Mercancía que pagaste" ahora cuenta la compra y el pago con capital')
  ok(Number(agostoDespues.gastos) === Number(agostoAntes.gastos), 'los gastos ya contaban el de capital: no cambian')
  msg = await intento(O, `INSERT INTO owner_capital_injections(store_id,amount) VALUES ($1,1000)`, [STORE])
  ok(/permission denied|permiso/i.test(msg ?? ''), 'nadie escribe más en la tabla vieja', msg)

  console.log('\n— Paso 3: siempre se dice con qué se pagó')
  msg = await intento(O, `SELECT toul_registrar_gasto('transporte',12345,'sin cuenta',NULL,false)`)
  ok(/Elige con qué pagaste/.test(msg ?? ''), 'un gasto sin cuenta no se guarda', msg)
  ok(Number((await one(`SELECT count(*) n FROM expenses WHERE store_id=$1 AND description='sin cuenta'`, [STORE])).n) === 0, 'y no queda el gasto a medias')
  msg = await intento(O, `SELECT process_purchase($1::jsonb)`, [JSON.stringify({ isCredit: false, items: [{ productId: perfume.id, quantity: 1, unitCost: 40000 }] })])
  ok(/Elige con qué pagaste/.test(msg ?? ''), 'una compra pagada sin cuenta no se guarda', msg)
  const fiada = await r(O, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: true, providerId: prov.id, paidNow: 0,
    items: [{ productId: perfume.id, quantity: 1, unitCost: 40000 }] })])
  ok(fiada.success, 'a crédito sin pagar nada no hay nada que preguntar')
  const debiaAntes = Number((await one(`SELECT total_debt d FROM providers WHERE id=$1`, [prov.id])).d)
  msg = await intento(O, `SELECT toul_pagar_proveedor($1,10000,NULL,NULL,false)`, [prov.id])
  ok(/Elige con qué pagaste/.test(msg ?? ''), 'un pago a proveedor sin cuenta no se guarda', msg)
  ok(Number((await one(`SELECT total_debt d FROM providers WHERE id=$1`, [prov.id])).d) === debiaAntes, 'y la deuda queda igual')
  const conCuenta = await r(O, `SELECT toul_pagar_proveedor($1,10000,NULL,$2,false) r`, [prov.id, nequi.id])
  ok(conCuenta.success, 'con su cuenta sí se paga')
  // Lo de antes sin cuenta se sigue corrigiendo sin elegirle una
  const [viejo] = await q(`INSERT INTO expenses(store_id,category,description,amount,payment_method) VALUES ($1,'otros','viejo',5000,'General') RETURNING id`, [STORE])
  await q(`INSERT INTO payments(store_id,type,method,amount,reference_id,notes) VALUES ($1,'expense','General',5000,$2,'Gasto: viejo')`, [STORE, viejo.id])
  await r(O, `SELECT toul_update_expense($1,'transporte','viejo',6000) r`, [viejo.id])
  const pagoViejo = await pagoDeGasto(viejo.id)
  ok(Number(pagoViejo.amount) === 6000 && pagoViejo.method_id === null && pagoViejo.method === 'General', 'un gasto viejo sin cuenta se corrige y sigue "Sin cuenta"')
  await r(O, `SELECT toul_delete_expense($1) r`, [viejo.id])

  console.log('\n— La auditoría')
  let aud =await as(O, () => q(`SELECT * FROM toul_auditoria()`))
  const nuevos = ['Metiste (Entre tú y tu negocio)', 'Sacaste para ti', 'no cambian Ganaste', '"Plata mía"', 'efectivo que se movió', 'turnos cerrados']
  ok(nuevos.every(n => aud.some(f => f.chequeo.includes(n))), 'revisa Metí y Saqué plata, Plata mía y los turnos')
  ok(aud.every(f => f.ok), 'y todo cuadra', aud.filter(f => !f.ok).map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido} ${f.detalle ?? ''}`).join(' | '))

  await db.exec('BEGIN')
  // Desde el SQL Editor se puede romper a propósito: la auditoría lo ve
  await q(`DELETE FROM payments WHERE linked_payment_id = $1`, [ppp.id])
  await q(`UPDATE payments SET amount = amount + 1000 WHERE id = $1`, [s1.id])
  await q(`INSERT INTO payments(store_id,type,method,method_id,amount,created_by) VALUES ($1,'owner_out','Efectivo',$2,1000,$3)`, [STORE, efe.id, O])
  await r(S, `SELECT toul_open_cash_session(0) r`)
  await q(`UPDATE payments SET cash_session_id = NULL WHERE store_id = $1 AND type = 'owner_out' AND amount = 1000`, [STORE])
  await q(`UPDATE payments SET created_at = now() + interval '1 minute' WHERE store_id = $1 AND type = 'owner_out' AND amount = 1000`, [STORE])
  aud = await as(O, () => q(`SELECT * FROM toul_auditoria()`))
  await db.exec('ROLLBACK')
  const falla = (texto) => aud.find(f => !f.ok && f.chequeo.includes(texto))
  ok(!!falla('"Plata mía"'), 've un pago con plata mía sin su Metí plata', falla('"Plata mía"')?.detalle)
  ok(!!falla('turnos cerrados'), 've un turno cerrado que cambió', falla('turnos cerrados')?.detalle)
  ok(!!falla('efectivo que se movió'), 've un Saqué plata en efectivo fuera de su turno', falla('efectivo que se movió')?.detalle)

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
