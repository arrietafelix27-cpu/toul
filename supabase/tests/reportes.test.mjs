// Reportes y abonos: los números de la pantalla de Reportes, probados con
// ventas, fiados, abonos, compras, gastos y devoluciones reales, con RLS activo.
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
  const reporte = () => as(O, async () => (await one(
    `SELECT toul_reporte(now() - interval '1 day', now() + interval '1 minute') r`)).r)
  const metodo = (rep, nombre) => Number(rep.metodos.find(m => m.nombre === nombre)?.monto ?? 0)

  // ── Negocio, vendedora, producto y métodos de pago ──
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com')`, [O, S])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes')`, [STORE, O])
  const [p1] = await q(`INSERT INTO products(store_id,name,sale_price,cpp) VALUES ($1,'Sauvage',100000,60000) RETURNING id`, [STORE])
  const [prov] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Aroma') RETURNING id`, [STORE])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [neq] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,50,'initial')`, [STORE, p1.id])
  const code = await as(O, async () => (await one(`SELECT toul_create_invite('Laura') r`)).r.code)
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))

  const cart = (n) => [{ product: { id: p1.id, name: 'Sauvage' }, quantity: n, unitPrice: 100000 }]

  // ── Un fiado viejo de Pedro: de hace 40 días, fuera del periodo ──
  const viejo = await as(O, async () => (await one(`SELECT process_sale($1::jsonb) r`, [JSON.stringify({
    cart: cart(1), payments: [], subtotal: 100000, total: 100000,
    isCredit: true, customerName: 'Pedro', initialPayment: 0,
  })])).r.saleId)
  await q(`UPDATE sales SET created_at = now() - interval '40 days' WHERE id=$1`, [viejo])
  await q(`UPDATE credits SET created_at = now() - interval '40 days' WHERE sale_id=$1`, [viejo])
  const pedro = (await one(`SELECT customer_id FROM sales WHERE id=$1`, [viejo])).customer_id

  // ── Hoy: una venta de contado y un fiado con abono inicial ──
  await as(O, () => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify({
    cart: cart(2), payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: 200000 }],
    subtotal: 200000, total: 200000,
  })]))
  await as(O, () => q(`SELECT process_sale($1::jsonb)`, [JSON.stringify({
    cart: cart(3), payments: [{ methodId: neq.id, methodName: 'Nequi', amount: 100000 }],
    subtotal: 300000, total: 300000, isCredit: true, customerName: 'María', initialPayment: 100000,
  })]))

  console.log('\n— De contado + A crédito = Vendiste')
  let rep = await reporte()
  ok(Number(rep.ventas.total) === 500000, `vendiste $500.000 (dio ${rep.ventas.total})`)
  ok(Number(rep.ventas.cantidad) === 2, 'en 2 ventas: el fiado viejo no es de este periodo')
  ok(Number(rep.ventas.contado) === 300000, 'de contado $300.000: la venta completa + el abono inicial del fiado')
  ok(Number(rep.ventas.credito) === 200000, 'a crédito $200.000')
  ok(Number(rep.ventas.contado) + Number(rep.ventas.credito) === Number(rep.ventas.total), 'contado + crédito = vendiste')
  ok(Number(rep.ventas.costo) === 300000, 'la mercancía vendida costó $300.000')

  console.log('\n— Abono a una deuda vieja: entra plata aunque la venta no sea del periodo')
  const abono = await as(O, async () => (await one(`SELECT toul_registrar_abono($1,50000,$2,NULL) r`, [pedro, neq.id])).r)
  ok(abono.success === true && abono.method === 'Nequi' && Number(abono.saldo) === 50000, 'Pedro abona $50.000 por Nequi y le quedan $50.000')
  const cred = await one(`SELECT payment_method FROM credits WHERE id=$1`, [abono.creditId])
  ok(cred.payment_method === 'Nequi', 'el abono guarda por dónde pagó')
  const caja = await one(`SELECT method, amount FROM payments WHERE reference_id=$1 AND type='sale_payment'`, [abono.creditId])
  ok(caja?.method === 'Nequi' && Number(caja.amount) === 50000, 'y la caja lo recibe por Nequi, atado al abono')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [pedro])).total_debt) === 50000, 'la deuda del cliente queda en $50.000')

  // Dos abonos de antes: uno sin método y otro que quedó como "General"
  await q(`INSERT INTO credits(store_id,customer_id,type,amount) VALUES ($1,$2,'payment',6000)`, [STORE, pedro])
  await q(`INSERT INTO credits(store_id,customer_id,type,amount,payment_method) VALUES ($1,$2,'payment',4000,'General')`, [STORE, pedro])

  rep = await reporte()
  ok(Number(rep.abonos) === 60000, `abonos que te hicieron: $60.000 (dio ${rep.abonos})`)
  ok(Number(rep.ventas.contado) + Number(rep.abonos) === 360000, 'plata que entró = de contado + abonos = $360.000')
  ok(metodo(rep, 'Efectivo') === 200000, 'por Efectivo entraron $200.000')
  ok(metodo(rep, 'Nequi') === 150000, 'por Nequi $150.000: el abono inicial del fiado + el abono de Pedro')
  ok(metodo(rep, 'Abonos') === 10000, 'los abonos viejos (sin método o "General") aparecen como "Abonos"')
  ok(metodo(rep, 'General') === 0, 'y "General" no sale como si fuera un método')
  ok(rep.metodos.reduce((s, m) => s + Number(m.monto), 0) === 360000, 'la dona suma lo mismo que la plata que entró')

  console.log('\n— Abonos: todo o nada, y nunca más de lo que debe')
  ok((await err(() => as(O, () => q(`SELECT toul_registrar_abono($1,999999,$2,NULL)`, [pedro, neq.id]))))?.includes('no puede ser mayor'),
    'no deja abonar más de lo que debe')
  ok((await err(() => as(O, () => q(`SELECT toul_registrar_abono($1,1000,NULL,NULL)`, [pedro]))))?.includes('por dónde te pagó'),
    'pide por dónde te pagó')
  ok((await err(() => as(O, () => q(`SELECT toul_registrar_abono($1,0,$2,NULL)`, [pedro, neq.id]))))?.includes('cuánto'),
    'no deja abonar cero')
  ok((await err(() => as(S, () => q(`SELECT toul_registrar_abono($1,1000,$2,NULL)`, [pedro, neq.id])))) !== null,
    'la vendedora no puede registrar abonos')
  const abonosPedro = await q(`SELECT id FROM credits WHERE customer_id=$1 AND type='payment'`, [pedro])
  ok(abonosPedro.length === 3, 'los intentos fallidos no dejan nada guardado')

  console.log('\n— Deshacer el abono nuevo saca justo su entrada de caja')
  await as(O, () => q(`SELECT toul_undo_payment($1)`, [abono.creditId]))
  ok((await q(`SELECT id FROM payments WHERE reference_id=$1`, [abono.creditId])).length === 0, 'la entrada de caja desaparece')
  ok(Number((await one(`SELECT total_debt FROM customers WHERE id=$1`, [pedro])).total_debt) === 90000,
    'la deuda vuelve a $90.000 (100.000 − el abono viejo de 10.000)')
  const otra = await as(O, async () => (await one(`SELECT toul_registrar_abono($1,50000,$2,NULL) r`, [pedro, neq.id])).r)

  console.log('\n— Mercancía que pagaste: compra a crédito y abono posterior al proveedor')
  await as(O, () => q(`SELECT process_purchase($1::jsonb)`, [JSON.stringify({
    isCredit: true, providerId: prov.id, paidNow: 200000,
    items: [{ productId: p1.id, quantity: 10, unitCost: 50000 }],
  })]))
  // Lo mismo que hace /api/providers/payment
  await q(`INSERT INTO payments(store_id,type,method,amount,reference_id,notes) VALUES ($1,'provider_payment','General',100000,$2,'Abono a proveedor')`, [STORE, prov.id])
  rep = await reporte()
  ok(Number(rep.mercanciaPagada) === 300000, `pagaste $300.000 de mercancía: $200.000 al comprar + $100.000 después (dio ${rep.mercanciaPagada})`)

  console.log('\n— Gastos por categoría')
  await q(`INSERT INTO expenses(store_id,category,amount) VALUES ($1,'arriendo',50000),($1,'transporte',20000),($1,'arriendo',10000)`, [STORE])
  rep = await reporte()
  ok(Number(rep.gastos) === 80000, 'gastaste $80.000')
  ok(rep.gastosPorCategoria[0].categoria === 'arriendo' && Number(rep.gastosPorCategoria[0].monto) === 60000, 'arriendo primero, con $60.000')

  console.log('\n— Una devolución resta de la ganancia y sale como plata')
  const contado = (await one(`SELECT id FROM sales WHERE store_id=$1 AND NOT is_credit ORDER BY created_at DESC LIMIT 1`, [STORE])).id
  const item = (await one(`SELECT id FROM sale_items WHERE sale_id=$1`, [contado])).id
  await as(O, () => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'No le gustó')`, [contado, JSON.stringify([{ saleItemId: item, quantity: 1 }])]))
  rep = await reporte()
  ok(Number(rep.devoluciones.total) === 100000 && Number(rep.devoluciones.costo) === 60000, 'devolvieron $100.000 que costaron $60.000')
  ok(Number(rep.devoluciones.reembolsado) === 100000, 'y salieron $100.000 de la caja')
  ok(Number(rep.ventas.total) === 500000, 'vendiste sigue en $500.000: es antes de devoluciones')
  const top = rep.productos[0]
  ok(top?.nombre === 'Sauvage' && Number(top.ganancia) === 160000, `Sauvage te dejó $160.000 (5 vendidos − 1 devuelto) (dio ${top?.ganancia})`)
  ok(Number(top?.margen) === 40, 'con 40% de margen')

  console.log('\n— Mes a mes')
  const meses = await as(O, async () => (await one(`SELECT toul_reporte_meses() r`)).r)
  const actual = meses[meses.length - 1]
  ok(meses.length >= 2 && meses.length <= 3, `arranca en el mes del primer fiado (${meses.length} meses)`)
  ok(Number(actual.ventas) === 400000, `este mes: $400.000 vendidos sin la devolución (dio ${actual.ventas})`)
  // 400.000 − (300.000 − 60.000) − 80.000
  ok(Number(actual.ganancia) === 80000, `y $80.000 de ganancia después de gastos (dio ${actual.ganancia})`)
  ok(Number(meses[0].ventas) === 100000, 'el mes del fiado viejo tiene sus $100.000')

  console.log('\n— Solo el administrador ve los reportes')
  ok((await err(() => as(S, () => q(`SELECT toul_reporte(now() - interval '1 day', now())`)))) !== null, 'la vendedora no puede')
  ok((await err(() => as(S, () => q(`SELECT toul_reporte_meses()`)))) !== null, 'ni el mes a mes')

  console.log('\n— Cada tienda en lo suyo')
  const O2 = '33333333-3333-3333-3333-333333333333'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otro@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra')`, [O2])
  const ajeno = await as(O2, async () => (await one(`SELECT toul_reporte(now() - interval '1 day', now() + interval '1 minute') r`)).r)
  ok(Number(ajeno.ventas.total) === 0 && ajeno.metodos.length === 0, 'otra tienda no ve nada de esta')
  ok((await err(() => as(O2, () => q(`SELECT toul_registrar_abono($1,1000,$2,NULL)`, [pedro, neq.id])))) !== null,
    'ni puede abonarle a un cliente ajeno')
  ok(otra.success === true, 'el abono vuelve a funcionar después de deshacer')

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
