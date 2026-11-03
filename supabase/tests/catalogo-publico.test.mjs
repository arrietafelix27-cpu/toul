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
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }

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

  ok((await one(`SELECT catalog_in_stock_only s FROM stores WHERE id=$1`, [STORE])).s === true,
     'una tienda que nunca tocó el switch arranca con "Solo productos con stock" encendido')

  console.log('\n— El link prendido muestra solo lo marcado (switch de stock apagado)')
  await q(`UPDATE stores SET catalog_public=true, catalog_note='Envíos a todo el país', catalog_in_stock_only=false WHERE id=$1`, [STORE])
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

  console.log('\n— Solo productos con stock')
  // Bleu: queda stock solo en 100 ml
  const [ml30] = await q(`SELECT id FROM product_variants WHERE product_id=$1 AND name='30 ml'`, [conPres.id])
  const [ml100] = await q(`SELECT id FROM product_variants WHERE product_id=$1 AND name='100 ml'`, [conPres.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,2,'initial')`,
      [STORE, conPres.id, ml100.id])
  // Uno que se vendió todo y uno con todas las presentaciones agotadas
  const [agotado] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,is_public)
      VALUES ($1,'Agotado',90000,50000,50000,true) RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,3,'initial'),($1,$2,-3,'sale')`,
      [STORE, agotado.id])
  const [aqua] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp,is_public)
      VALUES ($1,'Aqua',0,0,0,true) RETURNING id`, [STORE])
  await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp) VALUES ($1,$2,'50 ml',150000,90000)`, [STORE, aqua.id])
  // Combos: pareja pide 2 Sauvage (hay 7); trío pide 4 + 4 Sauvage; mini pide 1 Sauvage y 1 Bleu de 30 ml (no hay)
  const [pareja] = await q(`SELECT id FROM combos WHERE name='Combo pareja'`)
  await q(`INSERT INTO combo_items(combo_id,product_id,quantity) VALUES ($1,$2,2)`, [pareja.id, pub.id])
  const [trio] = await q(`INSERT INTO combos(store_id,name,sale_price,is_public) VALUES ($1,'Combo trío',900000,true) RETURNING id`, [STORE])
  await q(`INSERT INTO combo_items(combo_id,product_id,quantity) VALUES ($1,$2,4),($1,$2,4)`, [trio.id, pub.id])
  const [mini] = await q(`INSERT INTO combos(store_id,name,sale_price,is_public) VALUES ($1,'Combo mini',200000,true) RETURNING id`, [STORE])
  await q(`INSERT INTO combo_items(combo_id,product_id,variant_id,quantity) VALUES ($1,$2,NULL,1),($1,NULL,$3,1)`,
      [mini.id, pub.id, ml30.id])

  await q(`UPDATE stores SET catalog_in_stock_only=true WHERE id=$1`, [STORE])
  const conStock = await anon(async () => (await one(`SELECT toul_public_catalog('perfumes-felix') r`)).r)
  const visibles = conStock.items.map(i => i.name).sort()
  ok(JSON.stringify(visibles) === JSON.stringify(['Bleu', 'Combo pareja', 'Sauvage']), 'encendido, solo sale lo que tiene stock')
  ok(!visibles.includes('Agotado'), 'un producto que se vendió todo no aparece')
  ok(!visibles.includes('Aqua'), 'un producto con todas sus presentaciones agotadas no aparece')
  const bleuConStock = conStock.items.find(i => i.name === 'Bleu')
  ok(bleuConStock.presentations.length === 1 && bleuConStock.presentations[0].name === '100 ml',
     'de Bleu solo sale la presentación que tiene stock')
  ok(Number(bleuConStock.priceMin) === 380000 && Number(bleuConStock.priceMax) === 380000,
     'el precio sale solo de las presentaciones que se muestran')
  ok(visibles.includes('Combo pareja'), 'un combo que se alcanza a armar aparece')
  ok(!visibles.includes('Combo trío'), 'un combo que pide más de lo que hay no aparece, sumando el componente repetido')
  ok(!visibles.includes('Combo mini'), 'un combo con un solo componente agotado no aparece')
  ok(!JSON.stringify(conStock).includes('"stock"'), 'el link sigue sin decir cuántas unidades hay')

  console.log('\n— El conteo de Ajustes sale de la misma regla')
  const delDueno = await as(O, () => q(`SELECT kind, id FROM toul_catalogo_con_stock($1)`, [STORE]))
  const ids = delDueno.map(r => r.id).sort()
  ok(JSON.stringify(ids) === JSON.stringify([pub.id, conPres.id, pareja.id].sort()),
     'el dueño ve con stock lo mismo que muestra el link (más lo no publicado que tenga stock)')
  ok((await as(OTRO, () => q(`SELECT * FROM toul_catalogo_con_stock($1)`, [STORE]))).length === 0,
     'otra cuenta no puede ver qué tiene stock esta tienda')
  ok(await anon(() => err(() => q(`SELECT * FROM toul_catalogo_con_stock($1)`, [STORE]))) !== null,
     'un visitante no puede usar esa función directamente')

  console.log('\n— Apagado, el link vuelve a mostrar todo')
  await q(`UPDATE stores SET catalog_in_stock_only=false WHERE id=$1`, [STORE])
  const sinFiltro = await anon(async () => (await one(`SELECT toul_public_catalog('perfumes-felix') r`)).r)
  ok(JSON.stringify(sinFiltro.items.map(i => i.name).sort()) ===
     JSON.stringify(['Agotado', 'Aqua', 'Bleu', 'Combo mini', 'Combo pareja', 'Combo trío', 'Sauvage']),
     'apagado sale todo lo publicado, con o sin stock')
  ok(sinFiltro.items.find(i => i.name === 'Bleu').presentations.length === 2, 'y todas las presentaciones')

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
