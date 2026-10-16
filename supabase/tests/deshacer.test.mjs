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
  const [prod] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  const [prov] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Aroma') RETURNING id`, [STORE])

  console.log('\n— Corregir un gasto mal digitado')
  const [gasto] = await q(`INSERT INTO expenses(store_id,category,description,amount) VALUES ($1,'arriendo','Local',1500000) RETURNING id`, [STORE])
  await q(`INSERT INTO payments(store_id,type,method,amount,reference_id,notes) VALUES ($1,'expense','General',1500000,$2,'Gasto: Local')`, [STORE, gasto.id])

  await as(O, () => q(`SELECT toul_update_expense($1,'arriendo','Local',150000)`, [gasto.id]))
  ok(Number((await one(`SELECT amount FROM expenses WHERE id=$1`, [gasto.id])).amount) === 150000,
    'el gasto queda en $150.000, no en $1.500.000')
  ok(Number((await one(`SELECT amount FROM payments WHERE reference_id=$1`, [gasto.id])).amount) === 150000,
    'y la caja se corrige con él: no queda descuadrada')

  const cero = await err(() => as(O, () => q(`SELECT toul_update_expense($1,'arriendo','Local',0)`, [gasto.id])))
  ok(cero !== null, 'no deja poner un gasto en cero')

  console.log('\n— Borrar un gasto se lleva su salida de caja')
  await as(O, () => q(`SELECT toul_delete_expense($1)`, [gasto.id]))
  ok((await q(`SELECT id FROM expenses WHERE id=$1`, [gasto.id])).length === 0, 'el gasto desaparece')
  ok((await q(`SELECT id FROM payments WHERE reference_id=$1`, [gasto.id])).length === 0, 'y su movimiento de caja también')

  console.log('\n— Deshacer un abono le devuelve la deuda al cliente')
  const [cli] = await q(`INSERT INTO customers(store_id,name,total_debt) VALUES ($1,'María',0) RETURNING id`, [STORE])
  await q(`INSERT INTO credits(store_id,customer_id,type,amount) VALUES ($1,$2,'debt',500000)`, [STORE, cli.id])
  await q(`UPDATE customers SET total_debt=500000 WHERE id=$1`, [cli.id])
  const [abono] = await q(`INSERT INTO credits(store_id,customer_id,type,amount) VALUES ($1,$2,'payment',200000) RETURNING id, created_at`, [STORE, cli.id])
  await q(`UPDATE customers SET total_debt=300000 WHERE id=$1`, [cli.id])
  await q(`INSERT INTO payments(store_id,type,method,amount,notes,created_at)
           VALUES ($1,'sale_payment','General',200000,'Abono del cliente: María',$2)`, [STORE, abono.created_at])

  const des = await as(O, async () => (await one(`SELECT toul_undo_payment($1) r`, [abono.id])).r)
  ok(des.success === true && Number(des.amount) === 200000, 'deshace el abono de $200.000')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [cli.id])).total_debt) === 500000,
    'la deuda vuelve a $500.000')
  ok((await q(`SELECT id FROM credits WHERE id=$1`, [abono.id])).length === 0, 'el movimiento desaparece del historial')
  ok((await q(`SELECT id FROM payments WHERE store_id=$1 AND type='sale_payment'`, [STORE])).length === 0,
    'y la plata sale de la caja')

  console.log('\n— Un fiado no se deshace por aquí')
  const [fiado] = await q(`SELECT id FROM credits WHERE customer_id=$1 AND type='debt'`, [cli.id])
  const noFiado = await err(() => as(O, () => q(`SELECT toul_undo_payment($1)`, [fiado.id])))
  ok(noFiado !== null && /anulando su venta/.test(noFiado), 'dice que eso se hace anulando la venta')

  console.log('\n— Anular una compra saca la mercancía y borra la deuda')
  const [compra] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
                            VALUES ($1,$2,500000,500000,'credit',true) RETURNING id`, [STORE, prov.id])
  await q(`INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,total_cost) VALUES ($1,$2,10,50000,500000)`, [compra.id, prod.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'compra')`, [STORE, prod.id])
  await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount,status)
           VALUES ($1,$2,$3,500000,500000,'pending')`, [STORE, prov.id, compra.id])
  await q(`UPDATE providers SET total_debt=500000 WHERE id=$1`, [prov.id])
  await q(`INSERT INTO payments(store_id,type,method,amount,reference_id) VALUES ($1,'purchase','General',500000,$2)`, [STORE, compra.id])

  const stockAntes = Number((await one(`SELECT stock FROM products WHERE id=$1`, [prod.id])).stock)
  ok(stockAntes === 10, `entraron 10 unidades (hay ${stockAntes})`)

  const anul = await as(O, async () => (await one(`SELECT toul_void_purchase($1,'me equivoqué de proveedor') r`, [compra.id])).r)
  ok(anul.success === true, 'la compra se anula')
  ok(Number((await one(`SELECT stock FROM products WHERE id=$1`, [prod.id])).stock) === 0, 'la mercancía sale del inventario')
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [prov.id])).total_debt) === 0, 'ya no le debes al proveedor')
  ok((await q(`SELECT id FROM provider_debts WHERE purchase_id=$1`, [compra.id])).length === 0, 'la deuda desaparece')
  ok((await q(`SELECT id FROM payments WHERE reference_id=$1`, [compra.id])).length === 0, 'y la plata vuelve a la caja')
  ok((await one(`SELECT status FROM purchases WHERE id=$1`, [compra.id])).status === 'voided', 'la compra queda marcada como anulada')

  const otraVez = await err(() => as(O, () => q(`SELECT toul_void_purchase($1,NULL)`, [compra.id])))
  ok(otraVez !== null, 'no se puede anular dos veces')

  console.log('\n— No se puede anular una compra cuya mercancía ya vendiste')
  const [c2] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
                        VALUES ($1,$2,300000,300000,'cash',false) RETURNING id`, [STORE, prov.id])
  await q(`INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_cost,total_cost) VALUES ($1,$2,6,50000,300000)`, [c2.id, prod.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,6,'compra')`, [STORE, prod.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-4,'venta')`, [STORE, prod.id])
  const vendido = await err(() => as(O, () => q(`SELECT toul_void_purchase($1,NULL)`, [c2.id])))
  ok(vendido !== null && /ya vendiste/.test(vendido), 'avisa que ya vendiste parte de lo que entró')
  ok(Number((await one(`SELECT stock FROM products WHERE id=$1`, [prod.id])).stock) === 2, 'y no toca el inventario')

  console.log('\n— No se puede anular una compra que ya abonaste')
  const [c3] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
                        VALUES ($1,$2,200000,200000,'credit',true) RETURNING id`, [STORE, prov.id])
  await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount,status)
           VALUES ($1,$2,$3,200000,50000,'pending')`, [STORE, prov.id, c3.id])
  const abonada = await err(() => as(O, () => q(`SELECT toul_void_purchase($1,NULL)`, [c3.id])))
  ok(abonada !== null && /abonaste/.test(abonada), 'avisa que ya le abonaste a esa compra')

  console.log('\n— Esconder un producto sin romper sus ventas viejas')
  const [varProd] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',1,1,1) RETURNING id`, [STORE])
  await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price) VALUES ($1,$2,'100ml',1)`, [STORE, varProd.id])
  const esc = await as(O, async () => (await one(`SELECT toul_set_product_active($1,false) r`, [varProd.id])).r)
  ok(esc.success === true && esc.active === false, 'el producto queda escondido')
  ok((await one(`SELECT is_active FROM products WHERE id=$1`, [varProd.id])).is_active === false, 'no aparece en el catálogo')
  ok((await one(`SELECT is_active FROM product_variants WHERE product_id=$1`, [varProd.id])).is_active === false,
    'y sus presentaciones también')
  await as(O, () => q(`SELECT toul_set_product_active($1,true)`, [varProd.id]))
  ok((await one(`SELECT is_active FROM products WHERE id=$1`, [varProd.id])).is_active === true, 'y se puede volver a mostrar')

  console.log('\n— El inventario guarda quién lo movió')
  await as(O, () => q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,5,'ajuste')`, [STORE, prod.id]))
  const autor = await one(`SELECT created_by FROM inventory_adjustments WHERE reason='ajuste' ORDER BY created_at DESC LIMIT 1`)
  ok(autor.created_by === O, 'el ajuste queda firmado con quién lo hizo')

  console.log('\n— Cada tienda en lo suyo')
  const O2 = '22222222-2222-2222-2222-222222222222'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otro@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra')`, [O2])
  const ajeno = await err(() => as(O2, () => q(`SELECT toul_set_product_active($1,false)`, [prod.id])))
  ok(ajeno !== null, 'otro dueño no puede esconder un producto ajeno')

  return { fails }
}
