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
  const [a] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  const [b] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',380000,220000,220000) RETURNING id`, [STORE])

  console.log('\n— Guardar un combo: queda todo o no queda nada')
  const [combo] = await q(`INSERT INTO combos(store_id,name,sale_price) VALUES ($1,'Duo',700000) RETURNING id`, [STORE])
  await q(`INSERT INTO combo_items(combo_id,product_id,quantity) VALUES ($1,$2,1),($1,$3,1)`, [combo.id, a.id, b.id])

  const items = (arr) => JSON.stringify(arr)
  const guardar = (id, nombre, precio, arr) => as(O, async () =>
    (await one(`SELECT toul_save_combo($1,$2,NULL,$3,NULL,$4::jsonb) r`, [id, nombre, precio, items(arr)])).r)

  const r1 = await guardar(combo.id, 'Duo Premium', 750000, [{ productId: a.id, quantity: 2 }])
  ok(r1.success === true && Number(r1.items) === 1, 'el combo se guarda con sus productos nuevos')
  ok((await one(`SELECT name, sale_price FROM combos WHERE id=$1`, [combo.id])).name === 'Duo Premium', 'el nombre cambió')
  const quedaron = await q(`SELECT product_id, quantity FROM combo_items WHERE combo_id=$1`, [combo.id])
  ok(quedaron.length === 1 && Number(quedaron[0].quantity) === 2, 'quedó un solo renglón, con su cantidad')

  console.log('\n— Si los productos nuevos están malos, el combo NO queda vacío')
  const antes = await q(`SELECT product_id FROM combo_items WHERE combo_id=$1`, [combo.id])
  const malo = await err(() => guardar(combo.id, 'Duo Roto', 750000,
    [{ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }]))
  ok(malo !== null, 'la base rechaza un producto que no existe')
  const despues = await q(`SELECT product_id FROM combo_items WHERE combo_id=$1`, [combo.id])
  ok(despues.length === antes.length, `el combo conserva sus ${antes.length} producto(s): no se vació`)
  ok((await one(`SELECT name FROM combos WHERE id=$1`, [combo.id])).name === 'Duo Premium',
    'y tampoco se quedó con el nombre a medias')

  console.log('\n— Un combo no se puede dejar sin nada adentro')
  const vacio = await err(() => guardar(combo.id, 'Duo', 700000, []))
  ok(vacio !== null && /al menos un producto/.test(vacio), 'avisa que necesita al menos un producto')

  console.log('\n— Crear un producto con presentaciones: o entra completo, o no entra')
  const crear = (payload) => as(O, async () =>
    (await one(`SELECT toul_create_variant_product($1::jsonb) r`, [JSON.stringify(payload)])).r)

  const hecho = await crear({
    name: 'Carneguey', reference: 'CG-01',
    attributes: ['Tamaño'],
    variants: [{ name: '100ml', price: 120000, cost: 70000 }, { name: '200ml', price: 180000, cost: 95000 }],
  })
  ok(hecho.success === true && hecho.productId, 'el producto se crea')
  const vars = await q(`SELECT name, sale_price, cpp FROM product_variants WHERE product_id=$1 ORDER BY name`, [hecho.productId])
  ok(vars.length === 2, 'con sus dos presentaciones')
  ok(Number(vars[0].sale_price) === 120000 && Number(vars[0].cpp) === 70000, 'y cada una con su precio y su costo')
  const attrs = await q(`SELECT name FROM product_variant_attributes WHERE product_id=$1`, [hecho.productId])
  ok(attrs.length === 1 && attrs[0].name === 'Tamaño', 'y con sus características')

  console.log('\n— Sin presentaciones no se crea nada: ni el producto huérfano')
  const cuantos = (await q(`SELECT id FROM products WHERE store_id=$1`, [STORE])).length
  const sinVars = await err(() => crear({ name: 'Fantasma', attributes: ['Tamaño'], variants: [] }))
  ok(sinVars !== null && /al menos una presentación/.test(sinVars), 'avisa que faltan las presentaciones')
  ok((await q(`SELECT id FROM products WHERE store_id=$1`, [STORE])).length === cuantos,
    'y NO quedó un producto huérfano en el catálogo')
  ok((await q(`SELECT id FROM products WHERE store_id=$1 AND name='Fantasma'`, [STORE])).length === 0,
    'ese producto no existe en ninguna parte')

  console.log('\n— Sin nombre tampoco')
  const sinNombre = await err(() => crear({ name: '   ', variants: [{ name: '100ml', price: 1000 }] }))
  ok(sinNombre !== null, 'pide el nombre')

  console.log('\n— Cada tienda en lo suyo')
  const O2 = '22222222-2222-2222-2222-222222222222'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otro@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra')`, [O2])
  const ajeno = await err(() => as(O2, () => q(`SELECT toul_save_combo($1,'Robado',NULL,1,NULL,'[]'::jsonb)`, [combo.id])))
  ok(ajeno !== null, 'otro dueño no puede tocar este combo')
  ok((await one(`SELECT name FROM combos WHERE id=$1`, [combo.id])).name === 'Duo Premium', 'y el combo queda intacto')

  return { fails }
}
