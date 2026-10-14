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
  const hace = (dias) => `now() - INTERVAL '${dias} days'`

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com')`, [O])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes')`, [STORE, O])

  console.log('\n— Los días son desde la última venta, no desde que creaste la ficha')
  // Ficha creada hace 160 días, pero se vendió hace 3
  const [viejo] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,created_at)
      VALUES ($1,'Sauvage',400000,250000,250000,${hace(160)}) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason,created_at)
      VALUES ($1,$2,10,'initial',${hace(160)})`, [STORE, viejo.id])
  const [venta] = await q(`INSERT INTO sales(store_id,total,created_at) VALUES ($1,400000,${hace(3)}) RETURNING id`, [STORE])
  await q(`INSERT INTO sale_items(store_id,sale_id,product_id,quantity,unit_price,unit_cost,subtotal)
      VALUES ($1,$2,$3,1,400000,250000,400000)`, [STORE, venta.id, viejo.id])

  let r = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(Number(r.dormantCount) === 0, 'un producto vendido hace 3 días NO aparece como dormido (antes decía 160 días)')

  console.log('\n— Lo que acaba de llegar no está dormido')
  const [nuevo] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,created_at)
      VALUES ($1,'Recién llegado',90000,50000,50000,${hace(5)}) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason,created_at)
      VALUES ($1,$2,8,'purchase',${hace(5)})`, [STORE, nuevo.id])

  r = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(Number(r.dormantCount) === 0, 'algo comprado hace 5 días no se marca como "2 meses sin venderse"')

  console.log('\n— Lo que sí lleva tiempo quieto')
  const [quieto] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,created_at)
      VALUES ($1,'Difusor',95000,40000,40000,${hace(200)}) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason,created_at)
      VALUES ($1,$2,9,'purchase',${hace(120)})`, [STORE, quieto.id])

  r = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(Number(r.dormantCount) === 1, 'solo aparece el que de verdad lleva tiempo quieto')
  ok(Number(r.dormantValue) === 9 * 40000, `la plata dormida son $${(9 * 40000).toLocaleString('es-CO')}, no todo el inventario`)
  const d = r.dormant[0]
  ok(d.never_sold === true, 'dice que nunca se ha vendido')
  ok(d.idle_days >= 119 && d.idle_days <= 121, `cuenta 120 días desde que llegó a la bodega, no 200 desde la ficha (dio ${d.idle_days})`)

  console.log('\n— Quitar un cliente')
  const [sinVentas] = await q(`INSERT INTO customers(store_id,name) VALUES ($1,'Pedro') RETURNING id`, [STORE])
  const [conVentas] = await q(`INSERT INTO customers(store_id,name) VALUES ($1,'María') RETURNING id`, [STORE])
  const [conDeuda] = await q(`INSERT INTO customers(store_id,name,total_debt) VALUES ($1,'Andrés',50000) RETURNING id`, [STORE])
  await q(`INSERT INTO sales(store_id,customer_id,total) VALUES ($1,$2,120000)`, [STORE, conVentas.id])

  const r1 = await as(O, async () => (await one(`SELECT toul_remove_customer($1) r`, [sinVentas.id])).r)
  ok(r1.deleted === true, 'un cliente sin ventas se borra de verdad')
  ok((await q(`SELECT 1 FROM customers WHERE id=$1`, [sinVentas.id])).length === 0, 'y ya no está')

  const r2 = await as(O, async () => (await one(`SELECT toul_remove_customer($1) r`, [conVentas.id])).r)
  ok(r2.deleted === false, 'uno con ventas se archiva, no se borra')
  ok((await one(`SELECT is_active FROM customers WHERE id=$1`, [conVentas.id])).is_active === false, 'queda archivado')
  ok((await q(`SELECT 1 FROM sales WHERE customer_id=$1`, [conVentas.id])).length === 1, 'y su venta sigue intacta en el historial')

  const conDeudaErr = await err(() => as(O, () => q(`SELECT toul_remove_customer($1)`, [conDeuda.id])))
  ok(conDeudaErr !== null, 'un cliente que todavía debe no se puede quitar')

  return { fails }
}
