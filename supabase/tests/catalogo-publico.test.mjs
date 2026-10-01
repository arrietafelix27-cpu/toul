const O = '11111111-1111-1111-1111-111111111111'
const OTRO = '33333333-3333-3333-3333-333333333333'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
let fails = 0
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++ }

export default async function (db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  const anon = async (fn) => {
    await db.exec(`SET ROLE anon;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }
  const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'otro@x.com')`, [O, OTRO])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes Félix')`, [STORE, O])
  const [cat] = await q(`INSERT INTO product_categories(store_id,name) VALUES ($1,'Perfumes') RETURNING id`, [STORE])

  const [pub] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,category_id,is_public)
      VALUES ($1,'Sauvage',400000,250000,250000,$2,true) RETURNING id`, [STORE, cat.id])
  await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Secreto',999000,1,1)`, [STORE])
  const [conPres] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,is_public)
      VALUES ($1,'Bleu',0,0,0,true) RETURNING id`, [STORE])
  await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp) VALUES
      ($1,$2,'30 ml',120000,70000),($1,$2,'100 ml',380000,240000)`, [STORE, conPres.id])
  await q(`INSERT INTO combos(store_id,name,sale_price,is_public) VALUES ($1,'Combo pareja',600000,true)`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,7,'initial')`, [STORE, pub.id])

  console.log('\n— El link apagado no muestra nada')
  await q(`UPDATE stores SET public_slug='perfumes-felix' WHERE id=$1`, [STORE])
  ok(await anon(async () => (await one(`SELECT toul_public_catalog('perfumes-felix') r`)).r) === null,
     'con el catálogo apagado el link no existe')

  console.log('\n— El link prendido muestra solo lo marcado')
  await q(`UPDATE stores SET catalog_public=true, catalog_note='Envíos a todo el país' WHERE id=$1`, [STORE])
  const data = await anon(async () => (await one(`SELECT toul_public_catalog('perfumes-felix') r`)).r)
  ok(data !== null, 'el link abre sin cuenta')
  ok(data.store.name === 'Perfumes Félix' && data.store.note === 'Envíos a todo el país', 'muestra el nombre y la frase de la tienda')

  const nombres = data.items.map(i => i.name).sort()
  ok(JSON.stringify(nombres) === JSON.stringify(['Bleu', 'Combo pareja', 'Sauvage']), 'salen los 3 marcados, incluido el combo')
  ok(!nombres.includes('Secreto'), 'lo que NO está marcado no aparece')

  const texto = JSON.stringify(data)
  ok(!texto.includes('250000') && !texto.includes('cpp') && !texto.includes('cost'), 'no se filtra ningún costo')
  ok(!texto.includes('"stock"'), 'no se muestra el stock')

  const bleu = data.items.find(i => i.name === 'Bleu')
  ok(Number(bleu.priceMin) === 120000 && Number(bleu.priceMax) === 380000, 'con presentaciones muestra el rango de precio')
  ok(bleu.presentations.length === 2 && bleu.presentations[0].name === '30 ml', 'lista las presentaciones con su precio')

  const sauvage = data.items.find(i => i.name === 'Sauvage')
  ok(sauvage.category === 'Perfumes', 'trae la categoría para poder filtrar')

  console.log('\n— Nadie puede entrar por la puerta de atrás')
  ok(await anon(async () => (await one(`SELECT toul_public_catalog('otra-tienda') r`)).r) === null,
     'una dirección que no existe no devuelve nada')
  const leer = await anon(() => err(() => q(`SELECT name FROM products`)))
  ok(leer !== null || (await anon(() => q(`SELECT name FROM products`))).length === 0,
     'un visitante no puede leer la tabla de productos directamente')

  console.log('\n— La dirección del link no se puede repetir ni inventar')
  await q(`INSERT INTO stores(id,owner_id,name) VALUES (gen_random_uuid(),$1,'Otra')`, [OTRO])
  const repetida = await err(() => q(`UPDATE stores SET public_slug='PERFUMES-FELIX' WHERE owner_id=$1`, [OTRO]))
  ok(repetida !== null, 'dos tiendas no pueden tener la misma dirección')
  const invalida = await err(() => q(`UPDATE stores SET public_slug='Mi Tienda!' WHERE owner_id=$1`, [OTRO]))
  ok(invalida !== null, 'una dirección con espacios o símbolos se rechaza')

  return { fails }
}
