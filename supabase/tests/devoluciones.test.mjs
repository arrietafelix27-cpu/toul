// Devoluciones parciales: cada regla que pidió el dueño, probada como
// usuarios reales (administrador y vendedora) con RLS activo.
const O = '11111111-1111-1111-1111-111111111111'
const S = '22222222-2222-2222-2222-222222222222'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
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
  const stock = async (id) => Number((await one(`SELECT stock FROM products WHERE id=$1`, [id])).stock)

  // ── Negocio, vendedora, productos y métodos de pago ──
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com')`, [O, S])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Tienda')`, [STORE, O])
  const [p1] = await q(`INSERT INTO products(store_id,name,sale_price,cpp) VALUES ($1,'Perfume',100000,60000) RETURNING id`, [STORE])
  const [p2] = await q(`INSERT INTO products(store_id,name,sale_price,cpp) VALUES ($1,'Crema',20000,8000) RETURNING id`, [STORE])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [neq] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial'),($1,$3,10,'initial')`, [STORE, p1.id, p2.id])
  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  const sess = await as(S, async () => (await one(`SELECT toul_open_cash_session(100000) r`)).r.id)

  // ── Venta de 3 perfumes con 10% de descuento, en efectivo ──
  const cart = (n) => [{ product: { id: p1.id, name: 'Perfume' }, quantity: n, unitPrice: 100000 }]
  const sale = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    cart: cart(3), payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 270000 }],
    subtotal: 300000, discount: 30000, total: 270000,
  })])).r.saleId)
  const item = (await one(`SELECT id FROM sale_items WHERE sale_id=$1`, [sale])).id
  ok(await stock(p1.id) === 7, 'la venta baja el inventario a 7')
  const items = (n) => JSON.stringify([{ saleItemId: item, quantity: n }])

  // ── El administrador devuelve 1 ──
  const r1 = await as(O, async () => (await one(`SELECT toul_return_sale($1,$2::jsonb,NULL,'No le gustó') r`, [sale, items(1)])).r)
  ok(Number(r1.total) === 90000 && Number(r1.refunded) === 90000, 'devuelve en proporción al descuento: $90.000')
  ok(r1.method === 'Efectivo', 'por defecto, por el mismo medio en que pagó')
  ok(await stock(p1.id) === 8, 'el perfume vuelve al inventario')
  const pay = await one(`SELECT amount, cash_session_id FROM payments WHERE reference_id=$1 AND type='sale_refund'`, [sale])
  ok(Number(pay.amount) === -90000 && pay.cash_session_id === sess, 'la plata sale del turno abierto')
  ok((await q(`SELECT id FROM sales WHERE id=$1`, [sale])).length === 1, 'la venta no se borra')
  const ret = await one(`SELECT cost_total FROM sale_returns WHERE sale_id=$1`, [sale])
  ok(Number(ret.cost_total) === 60000, 'guarda lo que costó lo devuelto, para corregir la ganancia')

  // ── Nunca más de lo que queda ──
  ok((await as(O, () => err(() => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'x')`, [sale, items(3)]))))?.includes('solo quedan 2'), 'no deja devolver más de lo que queda')
  ok((await as(O, () => err(() => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,' ')`, [sale, items(1)]))))?.includes('motivo'), 'pide el motivo')

  // ── La vendedora necesita aprobación ──
  ok((await as(S, () => err(() => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'x')`, [sale, items(1)]))))?.includes('aprobación'), 'la vendedora no puede devolver sola')
  const req = await as(S, async () => (await one(`SELECT toul_request_approval('return_sale',$1,NULL,'Talla equivocada',$2::jsonb) r`,
    [sale, JSON.stringify({ items: [{ saleItemId: item, quantity: 1 }], methodId: neq.id })])).r.id)
  ok(Number((await one(`SELECT amount FROM approval_requests WHERE id=$1`, [req])).amount) === 90000, 'la solicitud dice cuánto se devolvería')
  const res = await as(O, async () => (await one(`SELECT toul_resolve_approval($1,true,NULL) r`, [req])).r)
  ok(res.status === 'used' && res.method === 'Nequi', 'el admin aprueba y la plata sale por el medio elegido')
  ok(await stock(p1.id) === 9, 'el segundo perfume también vuelve')

  // ── Anular después de devolver: no ──
  ok((await as(O, () => err(() => q(`SELECT toul_void_sale($1,'x')`, [sale]))))?.includes('ya tiene devoluciones'), 'no se puede anular una venta con devoluciones')
  ok((await as(S, () => err(() => q(`SELECT toul_request_approval('void_sale',$1,NULL,'x',NULL)`, [sale]))))?.includes('ya tiene devoluciones'), 'ni pedir que la anulen')

  // ── El cierre de caja las cuenta ──
  const live = await as(O, async () => (await one(`SELECT toul_cash_session_summary($1) r`, [sess])).r)
  ok(Number(live.returnCount) === 2 && Number(live.returnTotal) === 180000, 'el turno muestra 2 devoluciones por $180.000')
  ok(Number(live.expectedCash) === 280000, 'el efectivo esperado descuenta solo lo devuelto en efectivo')

  // ── Fiado: baja la deuda en vez de sacar plata ──
  const creq = await as(S, async () => (await one(`SELECT toul_request_approval('credit_sale',NULL,200000,NULL,'{"customerName":"María"}'::jsonb) r`)).r.id)
  await as(O, () => q(`SELECT toul_resolve_approval($1,true,NULL)`, [creq]))
  const csale = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    cart: cart(2), payments: [], subtotal: 200000, total: 200000, isCredit: true, customerName: 'María', dueDate: '2026-12-01', approvalId: creq,
  })])).r.saleId)
  const citem = (await one(`SELECT id FROM sale_items WHERE sale_id=$1`, [csale])).id
  const r3 = await as(O, async () => (await one(`SELECT toul_return_sale($1,$2::jsonb,NULL,'Devolvió uno') r`, [csale, JSON.stringify([{ saleItemId: citem, quantity: 1 }])])).r)
  ok(Number(r3.debtReduced) === 100000 && Number(r3.refunded) === 0, 'en un fiado baja la deuda y no saca plata')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE name='María'`)).total_debt) === 100000, 'María queda debiendo $100.000')

  // ── Combo: vuelven sus productos ──
  const [combo] = await q(`INSERT INTO combos(store_id,name,sale_price) VALUES ($1,'Kit',35000) RETURNING id`, [STORE])
  await q(`INSERT INTO combo_items(combo_id,product_id,quantity) VALUES ($1,$2,2)`, [combo.id, p2.id])
  const ksale = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    cart: [{ isCombo: true, comboId: combo.id, product: { name: 'Kit' }, quantity: 1, unitPrice: 35000 }],
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 35000 }], subtotal: 35000, total: 35000,
  })])).r.saleId)
  ok(await stock(p2.id) === 8, 'el combo saca 2 cremas')
  const kitem = (await one(`SELECT id FROM sale_items WHERE sale_id=$1`, [ksale])).id
  await as(O, () => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'Regalo repetido')`, [ksale, JSON.stringify([{ saleItemId: kitem, quantity: 1 }])]))
  ok(await stock(p2.id) === 10, 'al devolver el combo vuelven las 2 cremas')

  // ── Más de 30 días: no ──
  await q(`UPDATE sales SET created_at = now() - interval '31 days' WHERE id=$1`, [csale])
  ok((await as(O, () => err(() => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'x')`, [csale, JSON.stringify([{ saleItemId: citem, quantity: 1 }])]))))?.includes('30 días'), 'después de 30 días no se puede devolver')

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
