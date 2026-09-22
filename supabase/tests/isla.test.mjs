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

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com')`, [O, S])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Isla')`, [STORE, O])
  ok((await one(`SELECT role FROM store_members WHERE user_id=$1`, [O])).role === 'admin', 'el dueño queda como administrador')
  const [p1] = await q(`INSERT INTO products(store_id,name,sale_price,cpp) VALUES ($1,'Sauvage',400000,250000) RETURNING id`, [STORE])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial')`, [STORE, p1.id])

  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  ok((await as(S, async () => (await one(`SELECT toul_session_context() r`)).r)).role === 'seller', 'la vendedora entra con su cuenta')
  ok((await as(S, () => q(`SELECT id FROM payments`))).length === 0, 'no ve la caja')

  const cart = (n) => [{ product: { id: p1.id, name: 'S' }, quantity: n, unitPrice: 400000 }]
  ok((await as(S, () => err(() => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify({ cart: cart(1), payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 400000 }], subtotal: 400000, total: 400000 })]))))?.includes('Abre tu turno'), 'sin turno no vende')
  const sess = await as(S, async () => (await one(`SELECT toul_open_cash_session(100000) r`)).r.id)
  const sale = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({ cart: cart(1), payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 390000 }], subtotal: 400000, discount: 10000, total: 390000 })])).r.saleId)
  const srow = await one(`SELECT seller_name, cash_session_id FROM sales WHERE id=$1`, [sale])
  ok(srow.seller_name === 'Laura' && srow.cash_session_id === sess, 'la venta guarda vendedora y turno')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 9, 'baja el inventario')

  const credit = { cart: cart(1), payments: [], subtotal: 400000, total: 400000, isCredit: true, customerName: 'María', dueDate: '2026-12-01' }
  ok((await as(S, () => err(() => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify(credit)]))))?.includes('aprobación'), 'crédito sin aprobación se rechaza')
  const req = await as(S, async () => (await one(`SELECT toul_request_approval('credit_sale',NULL,400000,NULL,'{"customerName":"María"}'::jsonb) r`)).r.id)
  await as(O, () => q(`SELECT toul_resolve_approval($1,true,NULL)`, [req]))
  const csale = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({ ...credit, approvalId: req })])).r.saleId)
  ok(!!csale && Number((await one(`SELECT total_debt FROM customers WHERE name='María'`)).total_debt) === 400000, 'crédito aprobado queda como deuda')

  const vreq = await as(S, async () => (await one(`SELECT toul_request_approval('void_sale',$1,NULL,'Devolución',NULL) r`, [sale])).r.id)
  const vres = await as(O, async () => (await one(`SELECT toul_resolve_approval($1,true,NULL) r`, [vreq])).r)
  ok(vres.status === 'used' && Number(vres.refunded) === 390000, 'el admin aprueba la anulación y devuelve la plata')
  ok((await q(`SELECT id FROM sales WHERE id=$1`, [sale])).length === 0, 'la venta anulada sale de los reportes')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 9, 'el perfume vuelve al inventario')

  const live = await as(O, async () => (await one(`SELECT toul_cash_session_summary($1) r`, [sess])).r)
  ok(Number(live.expectedCash) === 100000, 'la caja esperada queda en la base')
  const close = await as(S, async () => (await one(`SELECT toul_close_cash_session($1,95000,NULL) r`, [sess])).r)
  ok(Number(close.difference) === -5000, 'el cierre detecta el faltante de $5.000')
  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
