const O = '11111111-1111-1111-1111-111111111111'
const S = '22222222-2222-2222-2222-222222222222'
const B = '33333333-3333-3333-3333-333333333333'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BASICO = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
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
  const vender = (uid, body) => as(uid, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify(body)])).r)
  const rechazo = (uid, body) => as(uid, () => err(() => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify(body)])))
  const stock = async (id) => (await one(`SELECT stock FROM products WHERE id=$1`, [id])).stock
  const stockVar = async (id) => Number((await one(`SELECT COALESCE(SUM(quantity),0) s FROM inventory_adjustments WHERE variant_id=$1`, [id])).s)

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com'),($3,'b@x.com')`, [O, S, B])
  await q(`INSERT INTO stores(id,owner_id,name,plan) VALUES ($1,$2,'Isla','pro'),($3,$4,'Básica','basico')`, [STORE, O, BASICO, B])
  const [sauvage] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])
  const [bleu] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',0,0,0) RETURNING id`, [STORE])
  const [otro] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Eros',300000,180000,180000) RETURNING id`, [STORE])
  const [v100] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp) VALUES ($1,$2,'100ml',380000,240000) RETURNING id`, [STORE, bleu.id])
  const [v50] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cpp) VALUES ($1,$2,'50ml',220000,140000) RETURNING id`, [STORE, bleu.id])
  const [combo] = await q(`INSERT INTO combos(store_id,name,sale_price) VALUES ($1,'Dúo',550000) RETURNING id`, [STORE])
  await q(`INSERT INTO combo_items(combo_id,product_id,quantity) VALUES ($1,$2,1)`, [combo.id, sauvage.id])
  await q(`INSERT INTO combo_items(combo_id,variant_id,quantity) VALUES ($1,$2,1)`, [combo.id, v50.id])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [ajeno] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [BASICO])
  const [basicoProd] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Gorra',50000,20000,20000) RETURNING id`, [BASICO])
  const [basicoEfe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [BASICO])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial'),($1,$3,10,'initial')`, [STORE, sauvage.id, otro.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,5,'initial'),($1,$2,$4,1,'initial')`, [STORE, bleu.id, v100.id, v50.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,10,'initial')`, [BASICO, basicoProd.id])

  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))

  const linea = (id, name, quantity, unitPrice) => ({ product: { id, name }, quantity, unitPrice })
  const contado = (cart, total, extra = {}) => ({
    cart, subtotal: total, total,
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: total }], ...extra,
  })

  console.log('\n— El precio lo pone TOUL, no la caja')
  let msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 1, 1000)], 1000))
  ok(msg?.includes('El precio de Sauvage cambió a $400.000'), 'una venta con internet a $1.000 de un perfume de $400.000 se rechaza')
  ok(await stock(sauvage.id) === 10, 'y no descuenta nada')
  ok((await one(`SELECT count(*)::int c FROM sales`)).c === 0, 'ni deja una venta a medias')

  msg = await rechazo(O, contado([{ product: { id: bleu.id, name: 'Bleu' }, variantId: v100.id, quantity: 1, unitPrice: 300000 }], 300000))
  ok(msg?.includes('El precio de Bleu · 100ml cambió a $380.000'), 'lo mismo con una presentación')
  msg = await rechazo(O, contado([{ product: { id: combo.id, name: 'Dúo' }, isCombo: true, comboId: combo.id, quantity: 1, unitPrice: 100000 }], 100000))
  ok(msg?.includes('El precio de Dúo cambió a $550.000'), 'y con un combo')

  const sinPrecio = await vender(O, contado([{ product: { id: sauvage.id, name: 'Sauvage' }, quantity: 1 }], 400000))
  const item = await one(`SELECT unit_price, subtotal FROM sale_items WHERE sale_id=$1`, [sinPrecio.saleId])
  ok(Number(item.unit_price) === 400000 && Number(item.subtotal) === 400000, 'si la caja no manda precio, la venta usa el de la base')
  ok(await stock(sauvage.id) === 9, 'y descuenta el inventario')

  console.log('\n— Huecos cerrados')
  msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage', -5, 400000)], -2000000))
  ok(msg?.includes('Cantidad no válida para Sauvage'), 'una cantidad negativa se rechaza')
  ok(await stock(sauvage.id) === 9, 'y no suma stock')
  ok((await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 1.5, 400000)], 600000)))?.includes('Cantidad no válida'), 'una cantidad con decimales se rechaza')
  ok((await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 0, 400000)], 0)))?.includes('Cantidad no válida'), 'una cantidad en cero se rechaza')
  ok((await rechazo(O, { cart: [], payments: [], subtotal: 0, total: 0 }))?.includes('no tiene productos'), 'una venta sin productos se rechaza')

  msg = await rechazo(O, { ...contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 400000), payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 1000 }] })
  ok(msg?.includes('Los pagos ($1.000) no suman el total de la venta ($400.000)'), 'una venta de contado cuyos pagos no suman el total se rechaza')
  msg = await rechazo(O, { ...contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 400000), payments: [] })
  ok(msg?.includes('no suman el total'), 'y una de contado sin ningún pago también')
  msg = await rechazo(O, { ...contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 400000), payments: [
    { methodId: efe.id, methodName: 'Efectivo', amount: 500000 }, { methodId: efe.id, methodName: 'Efectivo', amount: -100000 }] })
  ok(msg?.includes('no puede ser negativo'), 'un pago negativo se rechaza')
  msg = await rechazo(O, { ...contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 400000), payments: [{ methodId: ajeno.id, methodName: 'Efectivo', amount: 400000 }] })
  ok(msg?.includes('El método de pago Efectivo no existe'), 'un método de pago de otra tienda se rechaza')

  msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 1, 400000)], -100000, { discount: 500000 }))
  ok(msg?.includes('El descuento no puede ser mayor que la venta'), 'un descuento mayor que la venta se rechaza')
  msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 450000, { discount: -50000 }))
  ok(msg?.includes('El descuento no es válido'), 'un descuento negativo se rechaza')
  msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 350000))
  ok(msg?.includes('no cuadra'), 'un total que no sale de los productos se rechaza')

  msg = await rechazo(O, contado([{ product: { id: otro.id, name: 'Eros' }, variantId: v100.id, quantity: 1, unitPrice: 380000 }], 380000))
  ok(msg?.includes('Esa presentación no es de Eros'), 'una presentación de otro producto se rechaza')
  ok(await stockVar(v100.id) === 5, 'y no descuenta la presentación')

  msg = await rechazo(O, { cart: [linea(sauvage.id, 'Sauvage', 1, 400000)], subtotal: 400000, total: 400000, isCredit: true,
    customerName: 'Carla', payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 500000 }] })
  ok(msg?.includes('El abono no puede ser mayor que la venta'), 'un abono mayor que la venta se rechaza')

  const conDescuento = await vender(O, contado([linea(sauvage.id, 'Sauvage', 1, 400000)], 390000, { discount: 10000, subtotal: 1 }))
  const fila = await one(`SELECT subtotal, discount, total, initial_payment FROM sales WHERE id=$1`, [conDescuento.saleId])
  ok(Number(fila.subtotal) === 400000 && Number(fila.discount) === 10000 && Number(fila.total) === 390000,
    'el subtotal lo calcula TOUL aunque la caja mande otro')
  ok(Number(fila.initial_payment) === 390000, 'y lo pagado sale de los pagos')

  console.log('\n— Combos')
  msg = await rechazo(O, contado([{ product: { id: combo.id, name: 'Dúo' }, isCombo: true, comboId: combo.id, quantity: 2, unitPrice: 550000 }], 1100000))
  ok(msg?.includes('Stock insuficiente en el combo Dúo: falta Bleu · 50ml'), 'el combo dice qué producto le falta')
  const duo = await vender(O, contado([{ product: { id: combo.id, name: 'Dúo' }, isCombo: true, comboId: combo.id, quantity: 1, unitPrice: 550000 }], 550000))
  ok(duo.success && await stockVar(v50.id) === 0 && await stock(sauvage.id) === 7, 'el combo descuenta cada producto que lleva')

  console.log('\n— Historial de precios')
  // Lo anotado al crear los productos queda "hace dos horas"
  await q(`UPDATE price_history SET valid_from = now() - interval '2 hours'`)
  await as(O, () => q(`UPDATE products SET sale_price = 420000 WHERE id = $1`, [sauvage.id]))
  await as(O, () => q(`UPDATE products SET name = 'Sauvage EDP' WHERE id = $1`, [sauvage.id]))
  const historia = await q(`SELECT sale_price FROM price_history WHERE item_id=$1 ORDER BY valid_from`, [sauvage.id])
  ok(historia.length === 2 && Number(historia[1].sale_price) === 420000, 'cada cambio de precio queda anotado (y cambiar el nombre no)')
  const antes = new Date(Date.now() - 60 * 60000).toISOString()
  ok(Number((await one(`SELECT toul_price_at('product',$1,$2) p`, [sauvage.id, antes])).p) === 400000, 'se sabe cuánto costaba hace una hora')

  console.log('\n— Venta sin internet a un precio que ya cambió')
  const offA = await vender(O, contado([linea(sauvage.id, 'Sauvage EDP', 1, 400000)], 400000, { offline: true, soldAt: antes, clientSaleId: 'off-a' }))
  let venta = await one(`SELECT total, price_review FROM sales WHERE id=$1`, [offA.saleId])
  ok(offA.success && Number(venta.total) === 400000, 'si cobró el precio que tenía a esa hora, entra con lo cobrado')
  ok(venta.price_review === null && offA.priceReview === false, 'y no queda para revisar')

  const ahora = new Date().toISOString()
  const offB = await vender(O, contado([linea(sauvage.id, 'Sauvage EDP', 1, 1000)], 1000, { offline: true, soldAt: ahora, clientSaleId: 'off-b' }))
  ok(offB.success === true, 'una venta sin internet a otro precio entra igual (la plata ya se recibió)')
  venta = await one(`SELECT total, price_review, price_reviewed_at FROM sales WHERE id=$1`, [offB.saleId])
  const r0 = venta.price_review?.[0]
  ok(offB.priceReview === true && Number(venta.total) === 1000, 'queda con lo cobrado y marcada para revisar')
  ok(r0?.name === 'Sauvage EDP' && r0.quantity === 1 && Number(r0.charged) === 1000 && Number(r0.price) === 420000,
    'con el producto, lo cobrado y el precio real')

  const tarde = new Date(Date.now() - 10 * 60000).toISOString()
  const offC = await vender(O, contado([linea(sauvage.id, 'Sauvage EDP', 1, 400000)], 400000, { soldAt: tarde, clientSaleId: 'off-c' }))
  venta = await one(`SELECT total, price_review FROM sales WHERE id=$1`, [offC.saleId])
  ok(offC.success && Number(venta.total) === 400000 && venta.price_review === null,
    'una venta guardada antes de esta versión (sin la marca) que llega tarde se trata como sin internet: entra con el precio de esa hora')

  msg = await rechazo(O, contado([linea(sauvage.id, 'Sauvage EDP', 1, -1000)], -1000, { offline: true }))
  ok(msg?.includes('Precio no válido'), 'sin internet tampoco se acepta un precio negativo')

  ok((await as(S, () => err(() => q(`SELECT toul_mark_sale_reviewed($1)`, [offB.saleId]))))?.includes('Solo el administrador'), 'la vendedora no puede marcarla como vista')
  ok((await as(S, () => err(() => q(`UPDATE sales SET price_review = NULL WHERE id=$1`, [offB.saleId])))) !== null
    || (await one(`SELECT price_review FROM sales WHERE id=$1`, [offB.saleId])).price_review !== null, 'ni borrarle la marca')
  await as(O, () => q(`SELECT toul_mark_sale_reviewed($1)`, [offB.saleId]))
  venta = await one(`SELECT price_reviewed_at, price_reviewed_by_name FROM sales WHERE id=$1`, [offB.saleId])
  ok(venta.price_reviewed_at !== null && venta.price_reviewed_by_name === 'Administrador', 'el administrador la marca como vista')
  ok((await as(O, () => err(() => q(`SELECT toul_mark_sale_reviewed($1)`, [offB.saleId]))))?.includes('ya no está para revisar'), 'y no se marca dos veces')

  console.log('\n— El número de la venta sin internet')
  const numero = '5f2b7c1e-9a4d-4e8b-b3c6-2d1f0e9a8b7c'
  const conNumero = await vender(O, contado([linea(otro.id, 'Eros', 1, 300000)], 300000, { offline: true, clientSaleId: numero }))
  ok(conNumero.saleId === numero, 'la venta entra con el mismo número que salió en su tirilla')
  const repetida = await vender(O, contado([linea(otro.id, 'Eros', 1, 300000)], 300000, { offline: true, clientSaleId: numero }))
  ok(repetida.duplicate === true && repetida.saleId === numero && await stock(otro.id) === 9, 'reenviarla no la duplica')
  const viejoId = await vender(O, contado([linea(otro.id, 'Eros', 1, 300000)], 300000, { clientSaleId: '1730000000000-abc12345' }))
  ok(viejoId.success && viejoId.saleId !== '1730000000000-abc12345', 'con un identificador de los de antes recibe un número nuevo')

  console.log('\n— Turnos')
  const sess = await as(S, async () => (await one(`SELECT toul_open_cash_session(50000) r`)).r.id)
  const admin = await vender(O, contado([linea(otro.id, 'Eros', 1, 300000)], 300000, { cashSessionId: sess }))
  ok((await one(`SELECT cash_session_id FROM sales WHERE id=$1`, [admin.saleId])).cash_session_id === null,
    'lo que vende el administrador con el turno de Laura abierto no entra a ese turno')
  const suya = await vender(S, contado([linea(otro.id, 'Eros', 1, 300000)], 300000))
  ok((await one(`SELECT cash_session_id FROM sales WHERE id=$1`, [suya.saleId])).cash_session_id === sess, 'lo de Laura sí')

  ok((await as(B, () => err(() => q(`SELECT toul_open_cash_session(0)`)))) === 'Los turnos de caja son del plan Pro', 'en el plan Básico no se abren turnos')
  await q(`INSERT INTO cash_sessions(store_id,opened_by,opened_by_name,opening_cash) VALUES ($1,$2,'Administrador',0)`, [BASICO, B])
  const basica = await vender(B, { cart: [linea(basicoProd.id, 'Gorra', 1, 50000)], subtotal: 50000, total: 50000,
    payments: [{ methodId: basicoEfe.id, methodName: 'Efectivo', amount: 50000 }] })
  ok((await one(`SELECT cash_session_id FROM sales WHERE id=$1`, [basica.saleId])).cash_session_id === null,
    'y una venta del Básico no entra a un turno que hubiera quedado abierto')

  console.log('\n— Crédito con aprobación')
  const req = await as(S, async () => (await one(`SELECT toul_request_approval('credit_sale',NULL,300000,NULL,'{"customerName":"Carla"}'::jsonb) r`)).r.id)
  await as(O, () => q(`SELECT toul_resolve_approval($1,true,NULL)`, [req]))
  const fiado = { cart: [linea(otro.id, 'Eros', 1, 300000)], subtotal: 300000, total: 300000, isCredit: true, customerName: 'Carla',
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 100000 }], approvalId: req }
  const fiadoOk = await vender(S, fiado)
  const deuda = await one(`SELECT total_debt FROM customers WHERE name='Carla'`)
  const vf = await one(`SELECT initial_payment, total FROM sales WHERE id=$1`, [fiadoOk.saleId])
  ok(Number(deuda.total_debt) === 200000 && Number(vf.initial_payment) === 100000, 'el fiado aprobado guarda el abono y la deuda')

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
