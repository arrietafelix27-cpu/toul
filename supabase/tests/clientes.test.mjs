const O = '11111111-1111-1111-1111-111111111111'
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

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com')`, [O])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes')`, [STORE, O])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [prod] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,20,'initial')`, [STORE, prod.id])

  const fiar = (nombre, monto) => JSON.stringify({
    cart: [{ product: { id: prod.id, name: 'Sauvage' }, quantity: 1, unitPrice: monto }],
    payments: [], subtotal: monto, total: monto,
    isCredit: true, customerName: nombre, initialPayment: 0,
  })

  console.log('\n— Escribir el nombre tres veces NO crea tres clientes')
  await as(O, () => q(`SELECT process_sale($1::jsonb)`, [fiar('Juan Pérez', 400000)]))
  await as(O, () => q(`SELECT process_sale($1::jsonb)`, [fiar('juan pérez', 300000)]))
  await as(O, () => q(`SELECT process_sale($1::jsonb)`, [fiar('  Juan   Pérez ', 200000)]))

  const clientes = await q(`SELECT id, name, total_debt FROM customers WHERE store_id=$1`, [STORE])
  ok(clientes.length === 1, `queda un solo cliente, no tres (quedaron ${clientes.length})`)
  ok(Number(clientes[0].total_debt) === 900000, 'y su deuda es la suma de las tres: $900.000')
  const ventas = await q(`SELECT id FROM sales WHERE customer_id=$1`, [clientes[0].id])
  ok(ventas.length === 3, 'las tres ventas quedan bajo el mismo cliente')
  const creditos = await q(`SELECT id FROM credits WHERE customer_id=$1 AND type='debt'`, [clientes[0].id])
  ok(creditos.length === 3, 'y los tres fiados aparecen en su historial')

  console.log('\n— Unir los que ya quedaron repetidos')
  const [a] = await q(`INSERT INTO customers(store_id,name,total_debt) VALUES ($1,'María',100000) RETURNING id`, [STORE])
  const [b] = await q(`INSERT INTO customers(store_id,name,total_debt,phone) VALUES ($1,'maria',250000,'3001112233') RETURNING id`, [STORE])
  const [v2] = await q(`INSERT INTO sales(store_id,customer_id,total,is_credit) VALUES ($1,$2,250000,true) RETURNING id`, [STORE, b.id])
  await q(`INSERT INTO credits(store_id,customer_id,sale_id,type,amount) VALUES ($1,$2,$3,'debt',250000)`, [STORE, b.id, v2.id])

  const merged = await as(O, async () => (await one(`SELECT toul_merge_customers($1,$2) r`, [a.id, b.id])).r)
  ok(merged.success === true && Number(merged.movedDebt) === 250000, 'la deuda del repetido se pasa al que se queda')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [a.id])).total_debt) === 350000, 'el cliente queda con los $350.000 juntos')
  ok((await one(`SELECT customer_id FROM sales WHERE id=$1`, [v2.id])).customer_id === a.id, 'su venta también se mudó')
  ok((await q(`SELECT 1 FROM customers WHERE id=$1`, [b.id])).length === 0, 'y el repetido desaparece')
  ok((await one(`SELECT phone FROM customers WHERE id=$1`, [a.id])).phone === '3001112233', 'se conserva el teléfono que tenía el repetido')

  console.log('\n— Cambiarle el cliente a una venta ya hecha')
  const [otro] = await q(`INSERT INTO customers(store_id,name) VALUES ($1,'Carlos') RETURNING id`, [STORE])
  const r = await as(O, async () => (await one(`SELECT toul_change_sale_customer($1,$2) r`, [v2.id, otro.id])).r)
  ok(r.changed === true && Number(r.movedDebt) === 250000, 'la deuda de esa venta se muda al cliente correcto')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [a.id])).total_debt) === 100000, 'al anterior le queda solo lo suyo')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [otro.id])).total_debt) === 250000, 'y al nuevo le llegan los $250.000')
  ok((await one(`SELECT customer_name FROM sales WHERE id=$1`, [v2.id])).customer_name === 'Carlos', 'el nombre en la venta también cambia')

  const sinCliente = await err(() => as(O, () => q(`SELECT toul_change_sale_customer($1,NULL)`, [v2.id])))
  ok(sinCliente !== null, 'una venta a crédito no se puede dejar sin cliente')

  return { fails }
}
