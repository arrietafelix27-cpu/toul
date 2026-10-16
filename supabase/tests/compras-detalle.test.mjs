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
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes')`, [STORE, O])
  const [prov] = await q(`INSERT INTO providers(store_id,name,phone) VALUES ($1,'Distribuidora Aroma','3001112233') RETURNING id`, [STORE])
  const [sauvage] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  const [bleu] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',380000,220000,220000) RETURNING id`, [STORE])

  /** Una compra puesta en el pasado */
  const comprar = async (haceDias, items, { credito = false, vence = null } = {}) => {
    const total = items.reduce((s, i) => s + i.cant * i.costo, 0)
    const [c] = await q(
      `INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit,created_at)
       VALUES ($1,$2,$3,$3,$4,$5, now() - ($6 || ' days')::interval) RETURNING id`,
      [STORE, prov.id, total, credito ? 'credit' : 'cash', credito, String(haceDias)])
    for (const i of items) {
      await q(`INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,total_cost)
               VALUES ($1,$2,$3,$4,$5)`, [c.id, i.prod, i.cant, i.costo, i.cant * i.costo])
    }
    if (credito) {
      await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount,due_date,status)
               VALUES ($1,$2,$3,$4,$4,$5,'pending')`, [STORE, prov.id, c.id, total, vence])
    }
    return c.id
  }

  const detalle = (id) => as(O, async () => (await one(`SELECT toul_purchase_detail($1) r`, [id])).r)
  const resumen = (from, to) => as(O, async () => (await one(`SELECT toul_purchases_summary($1,$2) r`, [from, to])).r)

  console.log('\n— El detalle trae lo que entró y a qué costo')
  const vieja = await comprar(40, [{ prod: sauvage.id, cant: 6, costo: 220000 }])
  const nueva = await comprar(2, [
    { prod: sauvage.id, cant: 4, costo: 250000 },
    { prod: bleu.id, cant: 2, costo: 200000 },
  ], { credito: true, vence: new Date(Date.now() + 8 * 86400000).toISOString() })

  const d = await detalle(nueva)
  ok(d.items.length === 2, 'trae los dos productos de la compra')
  ok(d.proveedor.nombre === 'Distribuidora Aroma', 'y de qué proveedor fue')
  ok(Number(d.total) === 1400000, `el total son $1.400.000 (dio ${d.total})`)
  const sv = d.items.find(i => i.nombre === 'Sauvage')
  ok(Number(sv.cantidad) === 4 && Number(sv.costo) === 250000, 'Sauvage: 4 unidades a $250.000')
  ok(Number(sv.total) === 1000000, 'y su renglón suma $1.000.000')

  console.log('\n— Y cuánto costaba ese producto la vez anterior')
  ok(Number(sv.costoAnterior) === 220000, `Sauvage costaba $220.000 antes (dio ${sv.costoAnterior})`)
  ok(sv.fechaAnterior !== null, 'y dice de cuándo era esa compra')
  const bl = d.items.find(i => i.nombre === 'Bleu')
  ok(bl.costoAnterior === null, 'el producto que nunca habías comprado no inventa un costo anterior')

  console.log('\n— La primera compra de todas no tiene con qué compararse')
  const dv = await detalle(vieja)
  ok(dv.items[0].costoAnterior === null, 'la compra más vieja no mira hacia adelante')

  console.log('\n— La deuda de la compra a crédito')
  ok(d.credito === true, 'la compra quedó marcada a crédito')
  ok(Number(d.deuda.falta) === 1400000, 'falta pagar todo')
  ok(d.deuda.vence !== null, 'y tiene fecha de vencimiento')
  ok(dv.deuda === null, 'la que se pagó de contado no tiene deuda')

  console.log('\n— Si abonas, el detalle lo refleja')
  await q(`UPDATE provider_debts SET remaining_amount = 400000 WHERE purchase_id = $1`, [nueva])
  ok(Number((await detalle(nueva)).deuda.falta) === 400000, 'ahora solo faltan $400.000')

  console.log('\n— Los totales de arriba')
  const todo = await resumen(null, null)
  ok(Number(todo.compras) === 2, 'cuenta las dos compras')
  ok(Number(todo.gastado) === 2720000, `gastaste $2.720.000 en total (dio ${todo.gastado})`)
  ok(Number(todo.aCredito) === 1400000, 'y $1.400.000 fueron a crédito')
  ok(Number(todo.porPagar) === 400000, 'por pagar queda lo que falta de verdad, no el total fiado')

  console.log('\n— El período filtra el gasto, pero no lo que debes')
  const mes = await resumen(new Date(Date.now() - 7 * 86400000).toISOString(), null)
  ok(Number(mes.compras) === 1, 'en los últimos 7 días hubo una sola compra')
  ok(Number(mes.gastado) === 1400000, 'y el gasto es solo el de ese período')
  ok(Number(mes.porPagar) === 400000, 'pero lo que le debes al proveedor sigue siendo lo mismo: es de hoy, no del período')

  console.log('\n— Una deuda vencida se cuenta')
  await q(`UPDATE provider_debts SET due_date = now() - interval '3 days' WHERE purchase_id = $1`, [nueva])
  ok(Number((await resumen(null, null)).vencidas) === 1, 'avisa que hay una deuda vencida con un proveedor')

  console.log('\n— Cada tienda ve solo sus compras')
  const O2 = '22222222-2222-2222-2222-222222222222'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otro@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra')`, [O2])
  const ajeno = await as(O2, async () => (await one(`SELECT toul_purchases_summary(NULL,NULL) r`)).r)
  ok(Number(ajeno.gastado) === 0 && Number(ajeno.compras) === 0, 'el otro dueño no ve nada de esta tienda')
  const detAjeno = await as(O2, async () => (await one(`SELECT toul_purchase_detail($1) r`, [nueva])).r)
  ok(detAjeno === null || detAjeno.items.length === 0, 'ni puede abrir el detalle de una compra ajena')

  return { fails }
}
