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

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com')`, [O])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Ropa Félix')`, [STORE, O])

  // Camiseta con tallas: el costo vive en las tallas, no en la referencia
  const [camiseta] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp)
      VALUES ($1,'Camiseta oversize negra',0,0,0) RETURNING id`, [STORE])
  const [tallaS] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp)
      VALUES ($1,$2,'S',60000,25000) RETURNING id`, [STORE, camiseta.id])
  const [tallaM] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp)
      VALUES ($1,$2,'M',60000,25000) RETURNING id`, [STORE, camiseta.id])

  // Producto simple, sin tallas
  const [gorra] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp)
      VALUES ($1,'Gorra',40000,18000,18000) RETURNING id`, [STORE])

  console.log('\n— Cada talla guarda su propio stock')
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES
      ($1,$2,$3,20,'initial'),($1,$2,$4,4,'initial')`, [STORE, camiseta.id, tallaS.id, tallaM.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial')`, [STORE, gorra.id])

  ok((await one(`SELECT stock FROM product_variants WHERE id=$1`, [tallaS.id])).stock === 20, 'la talla S queda en 20')
  ok((await one(`SELECT stock FROM product_variants WHERE id=$1`, [tallaM.id])).stock === 4, 'la talla M queda en 4')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [camiseta.id])).stock === 24, 'la referencia suma 24')

  console.log('\n— El valor de la bodega cuenta las tallas')
  const esperado = 20 * 25000 + 4 * 25000 + 10 * 18000
  const overview = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(Number(overview.value) === esperado, `la bodega vale ${esperado.toLocaleString('es-CO')} (antes daba casi cero)`)
  ok(Number(overview.units) === 34, 'cuenta 34 unidades en total')

  console.log('\n— La alerta es por talla, no por referencia')
  // Se vendieron 30 de la S en el mes: a 7 días de respaldo necesita 7
  const [venta] = await q(`INSERT INTO sales(store_id,total) VALUES ($1,1800000) RETURNING id`, [STORE])
  await q(`INSERT INTO sale_items(store_id,sale_id,product_id,variant_id,quantity,unit_price,unit_cost,subtotal)
      VALUES ($1,$2,$3,$4,30,60000,25000,1800000)`, [STORE, venta.id, camiseta.id, tallaS.id])

  const conVentas = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(!conVentas.alerts.some(a => a.variant_name === 'S'), 'con 20 en bodega la talla S no molesta')
  // La M no se vende: su mínimo es 1 y tiene 4, así que tampoco alerta
  ok(!conVentas.alerts.some(a => a.variant_name === 'M'), 'la talla M, que no se vende, tampoco molesta')

  // Bajando la S a 5, el mínimo automático sí la saca
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,-15,'sale')`,
    [STORE, camiseta.id, tallaS.id])
  const bajaS = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  const alertaS = bajaS.alerts.find(a => a.variant_name === 'S')
  ok(!!alertaS, 'con 5 en bodega la talla S sí aparece')
  ok(alertaS && alertaS.min_stock === 7, 'su mínimo se calculó solo: 30 vendidas en 30 días × 7 de respaldo = 7')

  console.log('\n— Lo que de verdad se acabó')
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,-4,'sale')`,
    [STORE, camiseta.id, tallaM.id])
  const agotado = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  ok(Number(agotado.outOfStock) === 1, 'cuenta una unidad agotada')
  const alertaM = agotado.alerts.find(a => a.variant_name === 'M')
  ok(alertaM && Number(alertaM.stock) === 0, 'y dice que la que se acabó es la M')
  ok((await one(`SELECT stock FROM products WHERE id=$1`, [camiseta.id])).stock === 5,
     'la referencia muestra 5 sin decir que una talla está en cero — por eso la alerta va por talla')

  console.log('\n— El mínimo que pone el dueño manda sobre el automático')
  await q(`UPDATE product_variants SET low_stock_threshold = 15 WHERE id=$1`, [tallaS.id])
  const manual = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  const sManual = manual.alerts.find(a => a.variant_name === 'S')
  ok(sManual && sManual.min_stock === 15, 'si el dueño dice 15, el mínimo es 15 y no el automático')

  console.log('\n— Los días de respaldo los decide la tienda')
  await q(`UPDATE stores SET stock_coverage_days = 30 WHERE id=$1`, [STORE])
  await q(`UPDATE product_variants SET low_stock_threshold = NULL WHERE id=$1`, [tallaS.id])
  const mes = await as(O, async () => (await one(`SELECT toul_inventory_overview() r`)).r)
  const sMes = mes.alerts.find(a => a.variant_name === 'S')
  ok(Number(mes.coverageDays) === 30, 'la tienda pide 30 días de respaldo')
  ok(sMes && sMes.min_stock === 30, 'y el mínimo de la S sube de 7 a 30')

  return { fails }
}
