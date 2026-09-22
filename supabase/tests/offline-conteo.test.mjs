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
  const [p1] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  const [p2] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',380000,240000,240000) RETURNING id`, [STORE])
  const [v1] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp) VALUES ($1,$2,'100ml',400000,250000) RETURNING id`, [STORE, p2.id])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial')`, [STORE, p1.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,6,'initial')`, [STORE, p2.id, v1.id])

  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  const sess = await as(S, async () => (await one(`SELECT toul_open_cash_session(50000) r`)).r.id)

  console.log('\n— Venta hecha sin internet y enviada después')
  const soldAt = new Date(Date.now() - 45 * 60000).toISOString()
  const body = (clientId) => JSON.stringify({
    clientSaleId: clientId, soldAt, cashSessionId: sess,
    cart: [{ product: { id: p1.id, name: 'Sauvage' }, quantity: 2, unitPrice: 400000 }],
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 800000 }],
    subtotal: 800000, total: 800000,
  })
  const first = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [body('offline-1')])).r)
  ok(first.success && !first.duplicate, 'la venta guardada en el computador entra al sincronizar')
  const saved = await one(`SELECT created_at, cash_session_id, client_sale_id FROM sales WHERE id=$1`, [first.saleId])
  ok(Math.abs(new Date(saved.created_at) - new Date(soldAt)) < 2000, 'queda con la hora real de la venta, no la del envío')
  ok(saved.cash_session_id === sess, 'y dentro del turno en que se hizo')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 8, 'descuenta el inventario (10 − 2 = 8)')

  const retry = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [body('offline-1')])).r)
  ok(retry.duplicate === true && retry.saleId === first.saleId, 'si se reintenta el envío NO se duplica la venta')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 8, 'y el inventario no se descuenta dos veces')
  ok((await one(`SELECT count(*)::int c FROM sales`)).c === 1, 'sigue habiendo una sola venta')

  console.log('\n— Enviada después de cerrar el turno')
  await as(S, () => q(`SELECT toul_close_cash_session($1, 850000, NULL)`, [sess]))
  const late = await as(S, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    clientSaleId: 'offline-2', soldAt, cashSessionId: sess,
    cart: [{ product: { id: p1.id, name: 'Sauvage' }, quantity: 1, unitPrice: 400000 }],
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 400000 }], subtotal: 400000, total: 400000,
  })])).r)
  ok(late.success, 'una venta pendiente entra aunque el turno ya se haya cerrado')
  ok((await one(`SELECT cash_session_id FROM sales WHERE id=$1`, [late.saleId])).cash_session_id === sess, 'y se registra en el turno correcto')
  ok((await as(S, () => err(() => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify({
    cart: [{ product: { id: p1.id }, quantity: 1, unitPrice: 400000 }], payments: [], subtotal: 400000, total: 400000 })]))))?.includes('Abre tu turno'),
    'pero una venta nueva sí exige turno abierto')

  console.log('\n— Conteo de inventario')
  const sellerCount = await as(S, () => err(() => q(`INSERT INTO inventory_counts(store_id,started_by,started_by_name) VALUES ($1,$2,'Laura')`, [STORE, S])))
  ok(sellerCount !== null, 'el vendedor NO puede crear un conteo')

  const count = await as(O, async () => one(`INSERT INTO inventory_counts(store_id,started_by,started_by_name) VALUES ($1,$2,'Administrador') RETURNING id`, [STORE, O]))
  // stock real: Sauvage 7 (10-2-1), variante 100ml 6. Se cuentan 6 y 7 → falta 1 / sobra 1
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 7, 'stock antes del conteo: 7')
  await as(O, () => q(`INSERT INTO inventory_count_items(count_id,store_id,product_id,counted_qty) VALUES ($1,$2,$3,6)`, [count.id, STORE, p1.id]))
  await as(O, () => q(`INSERT INTO inventory_count_items(count_id,store_id,product_id,variant_id,counted_qty) VALUES ($1,$2,$3,$4,7)`, [count.id, STORE, p2.id, v1.id]))
  const res = await as(O, async () => (await one(`SELECT toul_apply_inventory_count($1,'Conteo mensual') r`, [count.id])).r)
  ok(res.countedItems === 2 && Number(res.diffUnits) === 0, 'aplica el conteo: 2 productos, falta 1 y sobra 1')
  ok(Number(res.diffValue) === 0, `valor de la diferencia: ${res.diffValue}`)
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [p1.id])).stock === 6, 'el inventario queda en lo que se contó (6)')
  ok(Number((await one(`SELECT COALESCE(SUM(quantity),0) s FROM inventory_adjustments WHERE variant_id=$1`, [v1.id])).s) === 7, 'la variante queda en 7')
  const items = await one(`SELECT expected_qty, difference FROM inventory_count_items WHERE product_id=$1 AND variant_id IS NULL`, [p1.id])
  ok(Number(items.expected_qty) === 7 && Number(items.difference) === -1, 'guarda lo esperado y la diferencia de cada producto')
  ok((await as(O, () => err(() => q(`SELECT toul_apply_inventory_count($1,NULL)`, [count.id]))))?.includes('ya fue cerrado'), 'un conteo no se puede aplicar dos veces')
  const uncounted = await one(`SELECT stock FROM products WHERE id=$1`, [p2.id])
  ok(uncounted.stock === 7, 'los productos no contados no se tocan (padre de variante intacto)')

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
