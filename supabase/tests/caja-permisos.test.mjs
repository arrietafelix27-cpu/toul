const O = '11111111-1111-1111-1111-111111111111'
const S = '22222222-2222-2222-2222-222222222222'
const B = '33333333-3333-3333-3333-333333333333'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BASICO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

export default async function (db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }
  const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
  const vender = (uid, body) => as(uid, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify(body)])).r)
  const rechazo = (uid, body) => as(uid, () => err(() => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify(body)])))
  const permisos = (uid, p) => as(uid, async () => (await one(`SELECT toul_set_seller_permissions($1::jsonb) r`, [JSON.stringify(p)])).r)
  const pedir = (uid, type, amount, details, saleId = null, reason = null) => as(uid, async () =>
    (await one(`SELECT toul_request_approval($1, $2, $3, $4, $5::jsonb) r`, [type, saleId, amount, reason, JSON.stringify(details)])).r.id)
  const aprobar = (id) => as(O, () => q(`SELECT toul_resolve_approval($1, true, NULL)`, [id]))
  const stock = async (id) => (await one(`SELECT stock FROM products WHERE id=$1`, [id])).stock

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com'),($3,'b@x.com')`, [O, S, B])
  await q(`INSERT INTO stores(id,owner_id,name,plan) VALUES ($1,$2,'Isla','pro'),($3,$4,'Básica','basico')`, [STORE, O, BASICO, B])
  const [sauvage] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',100000,60000,60000) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,50,'initial')`, [STORE, sauvage.id])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [nequi] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  const [marta] = await q(`INSERT INTO customers(store_id,name,phone) VALUES ($1,'Marta','3001112233') RETURNING id`, [STORE])

  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  const turno = await as(S, async () => (await one(`SELECT toul_open_cash_session(50000) r`)).r.id)

  // Una línea de Sauvage; el descuento se resta del total
  const venta = (qty, { discount = 0, pagos, credit = false, ...extra } = {}) => {
    const subtotal = 100000 * qty
    const total = subtotal - discount
    return {
      cart: [{ product: { id: sauvage.id, name: 'Sauvage' }, quantity: qty, unitPrice: 100000 }],
      subtotal, discount, total, isCredit: credit,
      payments: pagos ?? (credit ? [] : [{ methodId: efe.id, methodName: 'Efectivo', amount: total }]),
      ...extra,
    }
  }

  console.log('\n— Permisos por defecto: los de siempre')
  let msg = await rechazo(S, venta(1, { credit: true, customerId: marta.id, customerName: 'Marta' }))
  ok(msg?.includes('necesita aprobación'), 'el vendedor no fía sin aprobación')
  const conDiez = await vender(S, venta(1, { discount: 10000 }))
  ok(conDiez.success, 'puede dar hasta el 10% de descuento solo')
  msg = await rechazo(S, venta(1, { discount: 10001 }))
  ok(msg?.includes('Un descuento de más del 10% necesita aprobación'), 'más del 10% necesita aprobación')
  const adminDesc = await vender(O, venta(1, { discount: 50000 }))
  ok(adminDesc.success, 'el administrador descuenta lo que quiera')
  msg = await as(S, () => err(() => q(`SELECT toul_cash_session_summary($1)`, [turno])))
  ok(msg?.includes('disponible al cerrar'), 'el vendedor cuenta a ciegas')

  console.log('\n— Descuento con aprobación')
  const pedido = await pedir(S, 'discount_sale', 70000, { discount: 30000, subtotal: 100000 })
  msg = await rechazo(S, venta(1, { discount: 30000, approvalId: pedido }))
  ok(msg?.includes('necesita aprobación'), 'sin aprobar todavía, no pasa')
  await aprobar(pedido)
  msg = await rechazo(S, venta(2, { discount: 130000, approvalId: pedido }))
  ok(msg?.includes('El descuento cambió'), 'con el mismo total pero más descuento, no pasa')
  const aprobada = await vender(S, venta(1, { discount: 30000, approvalId: pedido }))
  ok(aprobada.success, 'aprobado, la venta pasa')
  ok((await one(`SELECT status FROM approval_requests WHERE id=$1`, [pedido])).status === 'used', 'y la aprobación queda usada')
  msg = await rechazo(S, venta(1, { discount: 30000, approvalId: pedido }))
  ok(msg?.includes('necesita aprobación'), 'no sirve para una segunda venta')

  console.log('\n— Quién cambia los permisos')
  msg = await as(S, () => err(() => q(`SELECT toul_set_seller_permissions('{"fiar":"solo"}'::jsonb)`)))
  ok(msg?.includes('Solo el administrador'), 'el vendedor no puede cambiarlos')
  msg = await as(B, () => err(() => q(`SELECT toul_set_seller_permissions('{"fiar":"solo"}'::jsonb)`)))
  ok(msg?.includes('plan Pro'), 'en el plan Básico no hay permisos de equipo')
  msg = await as(O, () => err(() => q(`SELECT toul_set_seller_permissions('{"fiar":"siempre"}'::jsonb)`)))
  ok(msg?.includes('Permiso no válido'), 'un valor inventado se rechaza')
  msg = await as(O, () => err(() => q(`SELECT toul_set_seller_permissions('{"descuento_max":"150"}'::jsonb)`)))
  ok(msg?.includes('entre 0 y 100'), 'un descuento máximo de 150% se rechaza')
  const guardados = await permisos(O, { fiar: 'solo', descuento_max: 25 })
  ok(guardados.fiar === 'solo' && guardados.descuento_max === '25' && guardados.anular === 'aprobacion', 'el administrador los guarda y lo demás queda igual')

  console.log('\n— Fiar')
  const fiado = await vender(S, venta(1, { credit: true, customerId: marta.id, customerName: 'Marta' }))
  ok(fiado.success, 'con "puede hacerlo solo" el vendedor fía sin aprobación')
  ok((await vender(S, venta(1, { discount: 25000 }))).success, 'y descuenta hasta su nuevo máximo')
  await permisos(O, { fiar: 'no' })
  msg = await rechazo(S, venta(1, { credit: true, customerId: marta.id, customerName: 'Marta' }))
  ok(msg?.includes('No tienes permiso para fiar'), 'con "no permitido" no puede fiar')
  msg = await as(S, () => err(() => pedir(S, 'credit_sale', 100000, { customerName: 'Marta' })))
  ok(msg?.includes('No tienes permiso para fiar'), 'ni pedir aprobación para hacerlo')
  ok((await vender(O, venta(1, { credit: true, customerId: marta.id, customerName: 'Marta' }))).success, 'el administrador sí')

  console.log('\n— Anular y devolver')
  const paraAnular = await vender(S, venta(1))
  msg = await as(S, () => err(() => q(`SELECT toul_void_sale($1, 'Error')`, [paraAnular.saleId])))
  ok(msg?.includes('Pide aprobación'), 'por defecto el vendedor no anula directo')
  await permisos(O, { anular: 'solo' })
  const antes = await stock(sauvage.id)
  await as(S, () => q(`SELECT toul_void_sale($1, 'Error al registrar')`, [paraAnular.saleId]))
  ok((await one(`SELECT count(*)::int c FROM sales WHERE id=$1`, [paraAnular.saleId])).c === 0, 'con "puede hacerlo solo" anula directo')
  ok(await stock(sauvage.id) === antes + 1, 'y el perfume vuelve al inventario')
  await permisos(O, { anular: 'no', devolver: 'no' })
  const otraVenta = await vender(S, venta(1))
  msg = await as(S, () => err(() => pedir(S, 'void_sale', null, {}, otraVenta.saleId, 'Error')))
  ok(msg?.includes('No tienes permiso para anular'), 'con "no permitido" ni siquiera pide la anulación')
  msg = await as(S, () => err(() => pedir(S, 'return_sale', null, { items: [] }, otraVenta.saleId, 'Cambio')))
  ok(msg?.includes('No tienes permiso para hacer devoluciones'), 'ni la devolución')
  msg = await as(S, () => err(() => q(`SELECT toul_return_sale($1, '[]'::jsonb, NULL, 'Cambio')`, [otraVenta.saleId])))
  ok(msg?.includes('Solo el administrador puede hacer devoluciones'), 'y no devuelve directo')

  console.log('\n— Deshacer (administrador)')
  const deshecha = await vender(O, venta(1))
  const antesDeshacer = await stock(sauvage.id)
  await as(O, () => q(`SELECT toul_void_sale($1, 'Deshecha al registrar')`, [deshecha.saleId]))
  ok((await one(`SELECT reason FROM sale_voids WHERE sale_id=$1`, [deshecha.saleId]))?.reason === 'Deshecha al registrar', 'queda anulada con el motivo "Deshecha al registrar"')
  ok(await stock(sauvage.id) === antesDeshacer + 1, 'y el inventario vuelve')

  console.log('\n— Crear clientes')
  await permisos(O, { fiar: 'solo', crear_clientes: 'no' })
  msg = await as(S, () => err(() => q(`INSERT INTO customers(store_id,name) VALUES ($1,'Nuevo')`, [STORE])))
  ok(msg !== null, 'sin permiso el vendedor no crea clientes')
  msg = await rechazo(S, venta(1, { credit: true, customerName: 'Pedro Nuevo' }))
  ok(msg?.includes('No tienes permiso para crear clientes'), 'ni fiándole a alguien que no existe')
  ok((await vender(S, venta(1, { credit: true, customerName: 'marta' }))).success, 'a una clienta que ya existe sí le fía')
  ok((await vender(S, venta(1, { customerName: 'Juan de paso' }))).success, 'una venta de contado con un nombre nuevo pasa')
  ok((await one(`SELECT count(*)::int c FROM customers WHERE name='Juan de paso'`)).c === 0, 'pero no crea el cliente')
  await permisos(O, { crear_clientes: 'solo' })
  ok((await as(S, () => err(() => q(`INSERT INTO customers(store_id,name) VALUES ($1,'Nuevo')`, [STORE])))) === null, 'con permiso sí lo crea')

  console.log('\n— Efectivo recibido y vuelto')
  const conVuelto = await vender(S, venta(1, { cashReceived: 150000 }))
  let fila = await one(`SELECT cash_received, change_given FROM sales WHERE id=$1`, [conVuelto.saleId])
  ok(Number(fila.cash_received) === 150000 && Number(fila.change_given) === 50000, 'pagó con $150.000 una venta de $100.000: vuelto de $50.000')
  ok(Number(conVuelto.change) === 50000, 'y la venta devuelve el vuelto')
  const exacta = await vender(S, venta(1))
  fila = await one(`SELECT cash_received, change_given FROM sales WHERE id=$1`, [exacta.saleId])
  ok(Number(fila.cash_received) === 100000 && Number(fila.change_given) === 0, 'sin decir con cuánto pagó, cuenta como exacto')
  const mixta = await vender(S, venta(1, { cashReceived: 50000, pagos: [
    { methodId: nequi.id, methodName: 'Nequi', amount: 60000 }, { methodId: efe.id, methodName: 'Efectivo', amount: 40000 }] }))
  fila = await one(`SELECT cash_received, change_given FROM sales WHERE id=$1`, [mixta.saleId])
  ok(Number(fila.change_given) === 10000, 'en un pago mixto el vuelto sale solo de la parte en efectivo')
  msg = await rechazo(S, venta(1, { cashReceived: 90000 }))
  ok(msg?.includes('no alcanza'), 'si lo recibido no alcanza, no deja cobrar')
  const sinEfectivo = await vender(S, venta(1, { cashReceived: 500000, pagos: [{ methodId: nequi.id, methodName: 'Nequi', amount: 100000 }] }))
  fila = await one(`SELECT cash_received, change_given FROM sales WHERE id=$1`, [sinEfectivo.saleId])
  ok(fila.cash_received === null && fila.change_given === null, 'sin efectivo no hay vuelto')

  console.log('\n— Cierre')
  const totales = await as(O, async () => (await one(`SELECT toul_cash_session_summary($1) r`, [turno])).r)
  const efectivoTurno = Number((await one(`SELECT COALESCE(SUM(amount),0) s FROM payments WHERE cash_session_id=$1 AND method='Efectivo'`, [turno])).s)
  ok(Number(totales.expectedCash) === 50000 + efectivoTurno, 'el efectivo esperado cuenta el valor de las ventas, no lo recibido')
  ok(Number(totales.changeTotal) === 60000 && Number(totales.changeCount) === 2, 'el cierre muestra los vueltos del turno')
  await permisos(O, { ver_efectivo: 'solo' })
  const visto = await as(S, async () => (await one(`SELECT toul_cash_session_summary($1) r`, [turno])).r)
  ok(Number(visto.expectedCash) === Number(totales.expectedCash), 'con permiso el vendedor ve cuánto debería haber')

  console.log(fails ? `  ${fails} FALLOS` : '  TODO OK')
  return { fails }
}
