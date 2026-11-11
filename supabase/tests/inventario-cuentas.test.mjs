// Paso 2 de Inventario: las cuentas correctas.
//
//   · Combos: su costo en la venta (contado, crédito, mixta y sin internet,
//     del administrador y del vendedor), sus devoluciones y lo que cuentan
//     como vendido en Inventario.
//   · "Compra N" saca el producto de la lista.
//   · Compras anuladas: fuera de "Comprado" y el costo promedio de vuelta.
//   · Contar mientras se vende.
//   · Mercancía perdida y recuperada.
//   · El vendedor solo mueve inventario vendiendo, devolviendo o anulando.
//   · Lo viejo se corrige al correr el SQL, y correrlo otra vez no daña nada.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cuantoPedir, estadoDelProducto } from '../../lib/inventory/calculos.ts'
import { resumir } from '../../lib/reports/calculos.ts'

const O = '11111111-1111-1111-1111-111111111111'
const S = '22222222-2222-2222-2222-222222222222'
const O2 = '33333333-3333-3333-3333-333333333333'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const BODEGA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const DEPLOY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy_inventario_cuentas.sql')
const DEPLOY3 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'deploy_inventario_consistencia.sql')
let fails = 0
const ok = (c, m, detalle = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (detalle && !c ? ` (${detalle})` : '')); if (!c) fails++ }
const igual = (que, esperado, obtenido) => ok(Number(esperado) === Number(obtenido), `${que}: ${esperado}`, `dio ${obtenido}`)

export default async function (db) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }
  const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
  const r = (uid, sql, p) => as(uid, async () => (await one(sql, p)).r)
  const vender = (uid, body) => r(uid, `SELECT process_sale($1::jsonb) r`, [JSON.stringify(body)])
  const comprar = (uid, items, metodo) => r(uid, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: false, methodId: metodo, items })])
  const anularCompra = (uid, id) => r(uid, `SELECT toul_void_purchase($1, 'Prueba') r`, [id])
  const permisos = (p) => r(O, `SELECT toul_set_seller_permissions($1::jsonb) r`, [JSON.stringify(p)])
  const pedir = (type, saleId, details, reason) => as(S, async () =>
    (await one(`SELECT toul_request_approval($1, $2, NULL, $3, $4::jsonb) r`, [type, saleId, reason, JSON.stringify(details)])).r.id)
  const aprobar = (id) => as(O, () => q(`SELECT toul_resolve_approval($1, true, NULL)`, [id]))
  const stock = async (id) => Number((await one(`SELECT stock FROM products WHERE id=$1`, [id])).stock)
  const stockVar = async (id) => Number((await one(`SELECT COALESCE(SUM(quantity),0) s FROM inventory_adjustments WHERE variant_id=$1`, [id])).s)
  const cpp = async (id) => Number((await one(`SELECT cpp FROM products WHERE id=$1`, [id])).cpp)
  const cppVar = async (id) => Number((await one(`SELECT cpp FROM product_variants WHERE id=$1`, [id])).cpp)
  const costoCombo = async (saleId) => Number((await one(`SELECT unit_cost FROM sale_items WHERE sale_id=$1 AND combo_id IS NOT NULL`, [saleId])).unit_cost)
  const lineaCombo = async (saleId) => (await one(`SELECT id FROM sale_items WHERE sale_id=$1 AND combo_id IS NOT NULL`, [saleId])).id
  const costoDevuelto = async (saleId) => Number((await one(`SELECT cost_total FROM sale_returns WHERE sale_id=$1 ORDER BY created_at DESC LIMIT 1`, [saleId])).cost_total)
  const resumen = (uid = O) => r(uid, `SELECT toul_inventory_overview(200) r`)
  const fila = (lista, id) => lista.find(x => x.id === id)

  // ── La tienda ──
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'v@x.com'),($3,'o2@x.com')`, [O, S, O2])
  await q(`INSERT INTO stores(id,owner_id,name,plan) VALUES ($1,$2,'Isla','pro'),($3,$4,'Bodega','pro')`, [STORE, O, BODEGA, O2])
  const prod = async (store, name, venta, costo, inicial, extra = '') => {
    const [p] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,$2,$3,$4,$4) RETURNING id`, [store, name, venta, costo])
    if (inicial) await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,$3,'initial')`, [store, p.id, inicial])
    return p
  }
  const perfume = await prod(STORE, 'Perfume', 100000, 60000, 40)
  const [bleu] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Bleu',0,0,0) RETURNING id`, [STORE])
  const [v50] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cost_price,cpp) VALUES ($1,$2,'50ml',150000,40000,40000) RETURNING id`, [STORE, bleu.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,40,'initial')`, [STORE, bleu.id, v50.id])
  const nuevoCombo = async (name, precio, items) => {
    const [c] = await q(`INSERT INTO combos(store_id,name,sale_price) VALUES ($1,$2,$3) RETURNING id`, [STORE, name, precio])
    for (const [col, id, n] of items) await q(`INSERT INTO combo_items(combo_id,${col},quantity) VALUES ($1,$2,$3)`, [c.id, id, n])
    return c
  }
  // Dúo: 1 Perfume ($60.000) + 1 Bleu 50ml ($40.000) = $100.000 de costo
  const duo = await nuevoCombo('Dúo', 150000, [['product_id', perfume.id, 1], ['variant_id', v50.id, 1]])
  // Trío: 2 Perfume + 1 Bleu 50ml = $160.000 de costo
  const trio = await nuevoCombo('Trío', 250000, [['product_id', perfume.id, 2], ['variant_id', v50.id, 1]])
  const [efe] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [STORE])
  const [neq] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Nequi') RETURNING id`, [STORE])
  const [marta] = await q(`INSERT INTO customers(store_id,name,phone) VALUES ($1,'Marta','3001112233') RETURNING id`, [STORE])

  const code = (await r(O, `SELECT toul_create_invite('Laura') r`)).code
  await as(S, () => q(`SELECT toul_accept_invite($1)`, [code]))
  const turno = (await r(S, `SELECT toul_open_cash_session(50000) r`)).id
  await permisos({ fiar: 'solo' })

  const linea = (p, quantity, unitPrice) => ({ product: { id: p.id, name: 'x' }, quantity, unitPrice })
  const lineaDeCombo = (c, quantity, unitPrice) => ({ product: { id: c.id, name: 'combo' }, isCombo: true, comboId: c.id, quantity, unitPrice })
  const contado = (cart, total, extra = {}) => ({ cart, subtotal: total, total, payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: total }], ...extra })
  const credito = (cart, total) => ({ cart, subtotal: total, total, payments: [], isCredit: true, customerId: marta.id, customerName: 'Marta' })
  const mixta = (cart, efectivo, nequi) => ({ cart, subtotal: efectivo + nequi, total: efectivo + nequi,
    payments: [{ methodId: efe.id, methodName: 'Efectivo', amount: efectivo }, { methodId: neq.id, methodName: 'Nequi', amount: nequi }] })
  const sinInternet = (cart, total, numero, extra = {}) => contado(cart, total, { offline: true, soldAt: new Date().toISOString(), clientSaleId: numero, ...extra })

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Lo que sale en un combo cuenta como vendido en Inventario')
  // Crema: solo se vende dentro del Kit, y llegó hace 90 días
  const crema = await prod(STORE, 'Crema', 30000, 10000, 8)
  await q(`UPDATE products SET created_at = now() - interval '90 days' WHERE id=$1`, [crema.id])
  await q(`UPDATE inventory_adjustments SET created_at = now() - interval '90 days' WHERE product_id=$1`, [crema.id])
  const kit = await nuevoCombo('Kit', 50000, [['product_id', crema.id, 3]])

  let inv = await resumen()
  ok(!!fila(inv.dormant, crema.id), 'antes de venderla, la Crema está en Quietos (90 días sin venderse)')
  ok(!fila(inv.alerts, crema.id), 'y no está en "Hay que reponer": 8 en stock, mínimo automático 1')

  await vender(O, contado([linea(perfume, 1, 100000)], 100000))
  await vender(O, contado([lineaDeCombo(duo, 2, 150000)], 300000))
  await vender(O, contado([lineaDeCombo(trio, 1, 250000)], 250000))
  await vender(O, contado([lineaDeCombo(kit, 2, 50000)], 100000))
  const paraAnular = await vender(O, contado([lineaDeCombo(duo, 1, 150000)], 150000))
  await as(O, () => q(`SELECT toul_void_sale($1, 'Prueba')`, [paraAnular.saleId]))

  inv = await resumen()
  // Perfume: 1 suelto + 2 en los Dúo + 2 en el Trío. El Dúo anulado no cuenta
  igual('Perfume vendido en 30 días (1 suelto + 2 en Dúos + 2 en el Trío)', 5, await r(O, `SELECT toul_vendido_30d($1) r`, [perfume.id]))
  igual('Bleu 50ml vendido en 30 días (2 en Dúos + 1 en el Trío)', 3, await r(O, `SELECT toul_vendido_30d($1,$2) r`, [bleu.id, v50.id]))
  igual('Bleu (todas sus presentaciones)', 3, await r(O, `SELECT toul_vendido_30d($1) r`, [bleu.id]))
  igual('el vendedor ve lo mismo en la ficha', 5, await r(S, `SELECT toul_vendido_30d($1) r`, [perfume.id]))
  igual('las unidades vendidas del resumen cuentan los combos (5 + 3 + 6 de Crema)', 14, inv.soldUnits30)
  const filaCrema = fila(inv.alerts, crema.id)
  ok(!fila(inv.dormant, crema.id), 'la Crema sale de Quietos: se vendió hoy dentro del Kit')
  igual('Crema vendida en 30 días (2 Kits × 3)', 6, filaCrema?.sold_30d)
  // 6 vendidas en 30 días con 7 días de respaldo: ceil(6 / 30 × 7) = 2
  igual('el mínimo automático de la Crema sale de lo vendido en combos', 2, filaCrema?.min_stock)
  ok(!!filaCrema && Number(filaCrema.stock) === 2, 'y como le quedan 2, aparece en "Hay que reponer"')

  // ════════════════════════════════════════════════════════════════
  console.log('\n— "Compra N" saca el producto de la lista')
  const jabon = await prod(STORE, 'Jabón', 20000, 5000, 3)
  const vela = await prod(STORE, 'Vela', 20000, 5000, 2)
  await q(`UPDATE products SET low_stock_threshold = 3 WHERE id=$1`, [jabon.id])
  await q(`UPDATE products SET low_stock_threshold = 2 WHERE id=$1`, [vela.id])
  // La Vela quedó en negativo (−1)
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-3,'ajuste')`, [STORE, vela.id])
  inv = await resumen()
  for (const [p, nombre] of [[crema, 'Crema'], [jabon, 'Jabón'], [vela, 'Vela']]) {
    const a = fila(inv.alerts, p.id)
    const n = cuantoPedir(Number(a?.stock), Number(a?.min_stock))
    await comprar(O, [{ productId: p.id, quantity: n, unitCost: 10000 }], efe.id)
    const despues = fila((await resumen()).alerts, p.id)
    ok(!!a && !despues, `${nombre}: con ${a?.stock} y mínimo ${a?.min_stock}, "Compra ${n}" lo saca de la lista`, `quedó en ${await stock(p.id)}`)
  }

  // ════════════════════════════════════════════════════════════════
  console.log('\n— El costo del combo queda en la venta')
  const ventas = {}
  ventas.admContado = await vender(O, contado([lineaDeCombo(duo, 1, 150000)], 150000))
  ventas.admCredito = await vender(O, credito([lineaDeCombo(trio, 1, 250000)], 250000))
  ventas.admMixta = await vender(O, mixta([lineaDeCombo(duo, 2, 150000)], 200000, 100000))
  ventas.admSinInternet = await vender(O, sinInternet([lineaDeCombo(duo, 1, 150000)], 150000, '7a1b2c3d-0000-4000-8000-000000000001'))
  ventas.venContado = await vender(S, contado([lineaDeCombo(duo, 1, 150000)], 150000))
  ventas.venCredito = await vender(S, credito([lineaDeCombo(trio, 1, 250000)], 250000))
  ventas.venMixta = await vender(S, mixta([lineaDeCombo(duo, 2, 150000)], 250000, 50000))
  ventas.venSinInternet = await vender(S, sinInternet([lineaDeCombo(duo, 1, 150000)], 150000, '7a1b2c3d-0000-4000-8000-000000000002', { cashSessionId: turno }))
  const esperado = { Contado: 100000, Credito: 160000, Mixta: 100000, SinInternet: 100000 }
  for (const [quien, nombre] of [['adm', 'el administrador'], ['ven', 'el vendedor']]) {
    for (const [tipo, costo] of Object.entries(esperado)) {
      const v = ventas[quien + tipo]
      ok(v?.success, `${nombre}: venta ${tipo.toLowerCase()} de un combo entra`)
      igual(`  y guarda el costo de lo que trae`, costo, await costoCombo(v.saleId))
    }
  }
  const offline = await one(`SELECT id, created_at FROM sales WHERE id=$1`, [ventas.venSinInternet.saleId])
  ok(offline.id === '7a1b2c3d-0000-4000-8000-000000000002', 'la venta sin internet del vendedor entra con su número')
  const repetida = await vender(S, sinInternet([lineaDeCombo(duo, 1, 150000)], 150000, '7a1b2c3d-0000-4000-8000-000000000002', { cashSessionId: turno }))
  ok(repetida.duplicate === true, 'y reenviarla no la duplica')
  const gananciaDuo = 150000 - await costoCombo(ventas.admContado.saleId)
  igual('un Dúo de $150.000 deja $50.000 de ganancia en ventas (antes salía $150.000)', 50000, gananciaDuo)

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Devolver y anular combos')
  let antesP = await stock(perfume.id), antesB = await stockVar(v50.id)
  const devolverAdm = JSON.stringify([{ saleItemId: await lineaCombo(ventas.admMixta.saleId), quantity: 1 }])
  await as(O, () => q(`SELECT toul_return_sale($1,$2::jsonb,$3,'Cambio')`, [ventas.admMixta.saleId, devolverAdm, efe.id]))
  igual('el administrador devuelve 1 Dúo: lo que costó', 100000, await costoDevuelto(ventas.admMixta.saleId))
  ok(await stock(perfume.id) === antesP + 1 && await stockVar(v50.id) === antesB + 1, 'y vuelven sus productos')

  const pedido = await pedir('return_sale', ventas.venContado.saleId,
    { items: [{ saleItemId: await lineaCombo(ventas.venContado.saleId), quantity: 1 }], methodId: efe.id }, 'Cambio de talla')
  await aprobar(pedido)
  igual('el vendedor devuelve un Dúo con aprobación: lo que costó', 100000, await costoDevuelto(ventas.venContado.saleId))

  await permisos({ devolver: 'solo', anular: 'solo' })
  antesP = await stock(perfume.id)
  const devolverVen = JSON.stringify([{ saleItemId: await lineaCombo(ventas.venCredito.saleId), quantity: 1 }])
  await as(S, () => q(`SELECT toul_return_sale($1,$2::jsonb,NULL,'No le gustó')`, [ventas.venCredito.saleId, devolverVen]))
  igual('el vendedor devuelve solo un Trío fiado: lo que costó', 160000, await costoDevuelto(ventas.venCredito.saleId))
  ok(await stock(perfume.id) === antesP + 2, 'y vuelven los 2 perfumes')

  antesP = await stock(perfume.id)
  await as(S, () => q(`SELECT toul_void_sale($1,'Error al cobrar')`, [ventas.venMixta.saleId]))
  ok(await stock(perfume.id) === antesP + 2, 'el vendedor anula solo una venta de 2 Dúos y vuelven los 2 perfumes')

  await permisos({ anular: 'aprobacion' })
  antesB = await stockVar(v50.id)
  await aprobar(await pedir('void_sale', ventas.venSinInternet.saleId, {}, 'Se repitió'))
  ok(await stockVar(v50.id) === antesB + 1, 'el vendedor anula con aprobación la venta sin internet y vuelve el Bleu')

  // ════════════════════════════════════════════════════════════════
  console.log('\n— El vendedor no mueve inventario por su cuenta')
  let msg = await as(S, () => err(() => q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-1,'damage')`, [STORE, perfume.id])))
  ok(msg?.includes('El inventario solo se mueve vendiendo, devolviendo o anulando una venta'), 'dar de baja directo desde la app se rechaza', msg)
  msg = await as(S, () => err(() => q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason,reference_id) VALUES ($1,$2,5,'sale',$3)`, [STORE, perfume.id, ventas.admContado.saleId])))
  ok(msg?.includes('El inventario solo se mueve'), 'ni haciéndose pasar por una venta', msg)
  msg = await as(S, () => err(() => q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,10,'found')`, [STORE, bleu.id, v50.id])))
  ok(msg?.includes('El inventario solo se mueve'), 'ni metiendo unidades a una presentación', msg)
  const venta = await vender(S, contado([linea(perfume, 1, 100000)], 100000))
  ok(venta.success, 'pero sí vende')
  ok(await as(O, () => err(() => q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-1,'damage')`, [STORE, crema.id]))) === null,
    'el administrador sí ajusta (es lo que hace "Ajustar")')

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Compras anuladas: fuera de "Comprado"')
  const lapiz = await prod(STORE, 'Lápiz', 5000, 1000, 0)
  const antesResumen = await r(O, `SELECT toul_purchases_summary(NULL,NULL) r`)
  const buena = (await comprar(O, [{ productId: lapiz.id, quantity: 2, unitCost: 50000 }], efe.id)).purchaseId
  const mala = (await comprar(O, [{ productId: lapiz.id, quantity: 3, unitCost: 70000 }], efe.id)).purchaseId
  const conLas2 = await r(O, `SELECT toul_purchases_summary(NULL,NULL) r`)
  igual('con las 2 compras, Comprado sube $310.000', 310000, conLas2.gastado - antesResumen.gastado)
  await anularCompra(O, mala)
  const sinLaMala = await r(O, `SELECT toul_purchases_summary(NULL,NULL) r`)
  igual('al anular la de $210.000, Comprado queda en +$100.000', 100000, sinLaMala.gastado - antesResumen.gastado)
  igual('y cuenta 1 compra más, no 2', 1, sinLaMala.compras - antesResumen.compras)
  igual('el costo del Lápiz vuelve a $50.000 (el de la compra que quedó)', 50000, await cpp(lapiz.id))
  const detalle = (compra) => r(O, `SELECT toul_purchase_detail($1) r`, [compra])
  ok((await detalle(mala)).anulada === true, 'el detalle de la compra anulada dice que está anulada')
  ok((await detalle(buena)).anulada === false, 'y el de la otra, que no')
  const otra = (await comprar(O, [{ productId: lapiz.id, quantity: 1, unitCost: 55000 }], efe.id)).purchaseId
  igual('"lo que costaba la vez anterior" salta la compra anulada', 50000, (await detalle(otra)).items[0].costoAnterior)

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Anular una compra: el costo promedio vuelve')
  // Simple: 5 a $10.000, compro 5 a $20.000 → $15.000; anulo → $10.000
  const x = await prod(STORE, 'Producto X', 50000, 10000, 5)
  const cx = (await comprar(O, [{ productId: x.id, quantity: 5, unitCost: 20000 }], efe.id)).purchaseId
  igual('X: después de comprar', 15000, await cpp(x.id))
  await anularCompra(O, cx)
  igual('X: después de anular vuelve a', 10000, await cpp(x.id))
  igual('X: y el stock a', 5, await stock(x.id))

  // Ya vendí parte: la cuenta "al revés" daría −$35.000. Repasando da $10.000
  const y = await prod(STORE, 'Producto Y', 500, 10, 2)
  const cy = (await comprar(O, [{ productId: y.id, quantity: 2, unitCost: 100 }], efe.id)).purchaseId
  igual('Y: 2 a $10 más 2 a $100', 55, await cpp(y.id))
  await vender(O, contado([linea(y, 1, 500)], 500))
  await anularCompra(O, cy)
  igual('Y: vendí 1 y anulo la compra: vuelve a $10, nunca negativo', 10, await cpp(y.id))
  igual('Y: queda 1 en stock', 1, await stock(y.id))

  // Una presentación: su costo y el del producto vuelven
  const z = await prod(STORE, 'Producto Z', 0, 20000, 0)
  const [zv] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cost_price,cpp) VALUES ($1,$2,'Grande',90000,20000,20000) RETURNING id`, [STORE, z.id])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,4,'initial')`, [STORE, z.id, zv.id])
  const cz = (await comprar(O, [{ productId: z.id, variantId: zv.id, quantity: 4, unitCost: 30000 }], efe.id)).purchaseId
  igual('Z Grande: 4 a $20.000 más 4 a $30.000', 25000, await cppVar(zv.id))
  igual('Z (el producto): igual', 25000, await cpp(z.id))
  await anularCompra(O, cz)
  igual('Z Grande: después de anular', 20000, await cppVar(zv.id))
  igual('Z (el producto): después de anular', 20000, await cpp(z.id))

  // Historia incompleta (datos de antes): se saca la compra del promedio
  const w = await prod(STORE, 'Producto W', 90000, 30000, 5)
  await q(`UPDATE products SET cpp = 50000 WHERE id=$1`, [w.id])
  const cw = (await comprar(O, [{ productId: w.id, quantity: 5, unitCost: 70000 }], efe.id)).purchaseId
  igual('W: 5 a $50.000 más 5 a $70.000', 60000, await cpp(w.id))
  await anularCompra(O, cw)
  igual('W: sin historia completa, se saca la compra del promedio', 50000, await cpp(w.id))

  // Historia incompleta y ya vendí parte: el costo se queda, nunca negativo
  const w2 = await prod(STORE, 'Producto W2', 500, 999, 2)
  await q(`UPDATE products SET cpp = 10 WHERE id=$1`, [w2.id])
  const cw2 = (await comprar(O, [{ productId: w2.id, quantity: 2, unitCost: 100 }], efe.id)).purchaseId
  await vender(O, contado([linea(w2, 1, 500)], 500))
  await anularCompra(O, cw2)
  igual('W2: sin historia y con parte vendida, el costo se queda como estaba', 55, await cpp(w2.id))

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Contar mientras se vende')
  const llavero = await prod(STORE, 'Llavero', 20000, 8000, 10)
  const conteo = await as(O, async () => one(`INSERT INTO inventory_counts(store_id,started_by,started_by_name) VALUES ($1,$2,'Administrador') RETURNING id`, [STORE, O]))
  await as(O, () => q(`INSERT INTO inventory_count_items(count_id,store_id,product_id,counted_qty) VALUES ($1,$2,$3,9)`, [conteo.id, STORE, llavero.id]))
  let renglon = await one(`SELECT expected_qty, counted_at FROM inventory_count_items WHERE count_id=$1`, [conteo.id])
  igual('al contar 9, la base anota que el sistema decía', 10, renglon.expected_qty)
  ok(renglon.counted_at !== null, 'y a qué hora se contó')
  // Mientras tanto la vendedora vende 2
  await vender(S, contado([linea(llavero, 2, 20000)], 40000))
  const aplicado = await r(O, `SELECT toul_apply_inventory_count($1,'Conteo') r`, [conteo.id])
  igual('al aplicar, la diferencia es contra lo que decía al contar (9 − 10)', -1, aplicado.diffUnits)
  igual('el stock queda en 7: las 2 vendidas no se deshacen (antes quedaba en 9)', 7, await stock(llavero.id))
  igual('el faltante se valora a lo que costaba', 8000, (await one(`SELECT unit_cost FROM inventory_adjustments WHERE reference_id=$1`, [conteo.id])).unit_cost)

  // Volver a contar un renglón toma la foto otra vez
  const conteo2 = await as(O, async () => one(`INSERT INTO inventory_counts(store_id,started_by,started_by_name) VALUES ($1,$2,'Administrador') RETURNING id`, [STORE, O]))
  await as(O, () => q(`INSERT INTO inventory_count_items(count_id,store_id,product_id,counted_qty) VALUES ($1,$2,$3,7)`, [conteo2.id, STORE, llavero.id]))
  await vender(S, contado([linea(llavero, 1, 20000)], 20000))
  await as(O, () => q(`UPDATE inventory_count_items SET counted_qty = 6 WHERE count_id=$1`, [conteo2.id]))
  renglon = await one(`SELECT expected_qty FROM inventory_count_items WHERE count_id=$1`, [conteo2.id])
  igual('si lo vuelve a contar después de una venta, la foto se actualiza', 6, renglon.expected_qty)

  // Cancelar un conteo abierto
  const cancelado = await as(O, () => q(`UPDATE inventory_counts SET status='cancelled' WHERE id=$1 AND status='open' RETURNING id`, [conteo2.id]))
  ok(cancelado.length === 1, 'el administrador cancela el conteo abierto')
  msg = await as(O, () => err(() => q(`SELECT toul_apply_inventory_count($1,NULL)`, [conteo2.id])))
  ok(msg?.includes('ya fue cerrado'), 'un conteo cancelado no se puede aplicar', msg)
  igual('y el stock no cambia', 6, await stock(llavero.id))
  const otraVez = await as(O, () => q(`UPDATE inventory_counts SET status='cancelled' WHERE id=$1 AND status='open' RETURNING id`, [conteo.id]))
  ok(otraVez.length === 0, 'un conteo ya aplicado no se cancela')

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Mercancía perdida y recuperada (otra tienda, para ver los números limpios)')
  const locion = await prod(BODEGA, 'Loción', 100000, 30000, 20)
  const [efe2] = await q(`INSERT INTO payment_methods(store_id,name) VALUES ($1,'Efectivo') RETURNING id`, [BODEGA])
  await vender(O2, { cart: [linea(locion, 1, 100000)], subtotal: 100000, total: 100000, payments: [{ methodId: efe2.id, methodName: 'Efectivo', amount: 100000 }] })
  const ajustar = (cantidad, motivo) => as(O2, () => q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,$3,$4)`, [BODEGA, locion.id, cantidad, motivo]))
  // Salen 6, una por cada motivo de pérdida (y "Baja o merma", el nombre viejo): 6 × $30.000
  for (const motivo of ['damage', 'loss', 'theft', 'expired', 'other', 'reduction']) await ajustar(-1, motivo)
  // Entran 3: apareció, regalo del proveedor y un "Otro" de entrada: 3 × $30.000
  for (const motivo of ['found', 'gift', 'other']) await ajustar(1, motivo)
  // Un "Un cliente lo devolvió" viejo (desde el SQL Editor): no cuenta
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,1,'return')`, [BODEGA, locion.id])
  // Contar: hay 17 y se cuentan 16 (faltó 1, $30.000); después se cuentan 18 (sobraron 2, $60.000)
  for (const contadas of [16, 18]) {
    const c = await as(O2, async () => one(`INSERT INTO inventory_counts(store_id,started_by,started_by_name) VALUES ($1,$2,'Administrador') RETURNING id`, [BODEGA, O2]))
    await as(O2, () => q(`INSERT INTO inventory_count_items(count_id,store_id,product_id,counted_qty) VALUES ($1,$2,$3,$4)`, [c.id, BODEGA, locion.id, contadas]))
    await r(O2, `SELECT toul_apply_inventory_count($1,NULL) r`, [c.id])
  }
  igual('la Loción queda en 18 (20 − 1 vendida − 6 + 3 + 1 devuelta − 1 + 2)', 18, await stock(locion.id))
  // Una compra cambia el costo promedio: lo de antes no se revalora
  await r(O2, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: false, methodId: efe2.id, items: [{ productId: locion.id, quantity: 10, unitCost: 60000 }] })])
  // (18 × 30.000 + 10 × 60.000) / 28 = 40.714
  igual('el costo promedio sube a', 40714, await cpp(locion.id))
  await ajustar(-1, 'damage')
  const hoy = { desde: new Date(Date.now() - 86400000).toISOString(), hasta: new Date(Date.now() + 86400000).toISOString() }
  const pe = await as(O2, () => one(`SELECT * FROM toul_mercancia_perdida($1,$2,$3)`, [BODEGA, hoy.desde, hoy.hasta]))
  // 6 × 30.000 + 1 del conteo × 30.000 + 1 después de la compra × 40.714
  igual('Mercancía perdida (lo de antes a $30.000, lo de después a $40.714)', 250714, pe.perdida)
  // 3 × 30.000 + 2 del conteo × 30.000
  igual('Mercancía recuperada', 150000, pe.recuperada)
  const rep = await r(O2, `SELECT toul_reporte($1,$2) r`, [hoy.desde, hoy.hasta])
  igual('Reportes trae la mercancía perdida', 250714, rep.mercanciaPerdida)
  igual('y la recuperada', 150000, rep.mercanciaRecuperada)
  const res = resumir(rep)
  igual('Ganancia en ventas (no cambia)', 70000, res.gananciaVentas)
  // 70.000 − 0 − 250.714 + 150.000
  igual('Ganaste = ganancia en ventas − gastos − perdida + recuperada', -30714, res.ganaste)
  const mesAMes = await r(O2, `SELECT toul_reporte_meses(1) r`)
  const mesActual = mesAMes[mesAMes.length - 1]
  const inicioMes = new Date(`${mesActual.mes}T05:00:00.000Z`)
  const finMes = new Date(Date.UTC(inicioMes.getUTCFullYear(), inicioMes.getUTCMonth() + 1, 1, 5) - 1)
  const repMes = resumir(await r(O2, `SELECT toul_reporte($1,$2) r`, [inicioMes.toISOString(), finMes.toISOString()]))
  igual('Mes a mes da el mismo Ganaste que Reportes', repMes.ganaste, mesActual.ganancia)
  igual('  que es', -30714, mesActual.ganancia)

  // ════════════════════════════════════════════════════════════════
  console.log('\n— Lo viejo se corrige al correr el SQL (y correrlo otra vez no daña nada)')
  // Como estaban antes: el combo en $0, su devolución en $0 y los ajustes sin costo
  await q(`UPDATE sale_items SET unit_cost = 0 WHERE sale_id = ANY($1) AND combo_id IS NOT NULL`, [[ventas.admContado.saleId, ventas.admMixta.saleId]])
  await q(`UPDATE sale_return_items SET unit_cost = 0 WHERE return_id IN (SELECT id FROM sale_returns WHERE sale_id=$1)`, [ventas.admMixta.saleId])
  await q(`UPDATE sale_returns SET cost_total = 0 WHERE sale_id=$1`, [ventas.admMixta.saleId])
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason) VALUES ($1,$2,-1,'damage')`, [STORE, perfume.id])
  await q(`UPDATE inventory_adjustments SET unit_cost = NULL WHERE store_id=$1 AND reason IN ('damage','count')`, [STORE])
  // Una compra anulada como se anulaba antes: la mercancía sale, el costo promedio se queda
  const vieja = await prod(STORE, 'Producto V', 50000, 10000, 5)
  const cv = (await comprar(O, [{ productId: vieja.id, quantity: 5, unitCost: 20000 }], efe.id)).purchaseId
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,quantity,reason,notes) VALUES ($1,$2,-5,'compra_anulada','Compra anulada')`, [STORE, vieja.id])
  await q(`UPDATE purchases SET status='voided' WHERE id=$1`, [cv])
  await q(`DELETE FROM payments WHERE reference_id=$1 AND type='purchase'`, [cv])
  igual('V: anulada a la antigua, el costo se quedó en', 15000, await cpp(vieja.id))
  const cppAntes = { x: await cpp(x.id), y: await cpp(y.id), zv: await cppVar(zv.id), z: await cpp(z.id), w: await cpp(w.id), w2: await cpp(w2.id), lapiz: await cpp(lapiz.id) }
  // El costo de hoy del Perfume cambió
  await q(`UPDATE products SET cpp = 63000 WHERE id=$1`, [perfume.id])
  await db.exec(fs.readFileSync(DEPLOY, 'utf8'))
  igual('V: al correr el SQL, su costo vuelve a lo de antes de esa compra', 10000, await cpp(vieja.id))
  igual('el Dúo vendido en $0 queda con el costo de hoy (63.000 + 40.000)', 103000, await costoCombo(ventas.admContado.saleId))
  igual('el Trío que ya tenía costo no se toca', 160000, await costoCombo(ventas.admCredito.saleId))
  igual('la devolución de ese combo también', 103000, await costoDevuelto(ventas.admMixta.saleId))
  igual('una baja vieja queda valorada al costo de hoy', 63000,
    (await one(`SELECT unit_cost FROM inventory_adjustments WHERE store_id=$1 AND product_id=$2 AND reason='damage'`, [STORE, perfume.id])).unit_cost)
  igual('un faltante de conteo viejo queda a lo que costaba al contar (no al de hoy)', 8000,
    (await one(`SELECT unit_cost FROM inventory_adjustments WHERE reference_id=$1`, [conteo.id])).unit_cost)
  const cppDespues = { x: await cpp(x.id), y: await cpp(y.id), zv: await cppVar(zv.id), z: await cpp(z.id), w: await cpp(w.id), w2: await cpp(w2.id), lapiz: await cpp(lapiz.id) }
  ok(JSON.stringify(cppAntes) === JSON.stringify(cppDespues), 'las compras anuladas con la función nueva no se vuelven a tocar', `${JSON.stringify(cppAntes)} → ${JSON.stringify(cppDespues)}`)
  await db.exec(fs.readFileSync(DEPLOY, 'utf8'))
  igual('una tercera vez: V sigue en', 10000, await cpp(vieja.id))
  igual('  y el Dúo sigue en', 103000, await costoCombo(ventas.admContado.saleId))
  ok((await vender(S, contado([lineaDeCombo(duo, 1, 150000)], 150000))).success, 'y se sigue vendiendo igual')

  // ════════════════════════════════════════════════════════════════
  console.log('\n— La auditoría')
  for (const [uid, nombre] of [[O, 'Isla'], [O2, 'Bodega']]) {
    const filas = await as(uid, () => q(`SELECT * FROM toul_auditoria()`))
    const fallan = filas.filter(f => !f.ok)
    ok(fallan.length === 0, `${nombre}: todo cuadra`, fallan.map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido} ${f.detalle ?? ''}`).join(' | '))
    ok(filas.some(f => f.chequeo === 'Mercancía perdida = suma directa de los ajustes'), `${nombre}: revisa la mercancía perdida`)
  }
  const isla = await as(O, () => q(`SELECT * FROM toul_auditoria()`))
  ok(isla.some(f => f.chequeo === 'Cada combo vendido tiene su costo' && f.ok), 'Isla: revisa que cada combo vendido tenga su costo')
  await q(`UPDATE sale_items SET unit_cost = 0 WHERE sale_id=$1 AND combo_id IS NOT NULL`, [ventas.admCredito.saleId])
  const conError = await as(O, () => q(`SELECT * FROM toul_auditoria()`))
  ok(conError.some(f => f.chequeo === 'Cada combo vendido tiene su costo' && !f.ok), 'y ve un combo vendido en $0')

  // ════════════════════════════════════════════════════════════════
  // Paso 3. Correr el SQL de cuentas otra vez dejó las funciones del Paso
  // 2: se corre el del Paso 3 encima (y dos veces, para ver que no daña)
  await db.exec(fs.readFileSync(DEPLOY3, 'utf8'))
  await db.exec(fs.readFileSync(DEPLOY3, 'utf8'))

  console.log('\n— Paso 3: una sola regla para agotado y por acabarse')
  const variante = async (productId, name, inicial, minimo = null) => {
    const [v] = await q(`INSERT INTO product_variants(store_id,product_id,name,sale_price,cost_price,cpp,low_stock_threshold) VALUES ($1,$2,$3,50000,20000,20000,$4) RETURNING id`, [STORE, productId, name, minimo])
    if (inicial) await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,$4,'initial')`, [STORE, productId, v.id, inicial])
    return v
  }
  const [camisa] = await q(`INSERT INTO products(store_id,name,reference,sale_price,cost_price,cpp) VALUES ($1,'Camisa','CAM-01',0,0,0) RETURNING id`, [STORE])
  const cS = await variante(camisa.id, 'S', 5, 2)
  const cM = await variante(camisa.id, 'M', 2, 2)
  const cL = await variante(camisa.id, 'L', 1, 2)
  await q(`INSERT INTO inventory_adjustments(store_id,product_id,variant_id,quantity,reason) VALUES ($1,$2,$3,-2,'damage')`, [STORE, camisa.id, cL.id])
  const cXL = await variante(camisa.id, 'XL', 0, 2)
  const [zapato] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Zapato',0,0,0) RETURNING id`, [STORE])
  await variante(zapato.id, '38', 0)
  await variante(zapato.id, '40', 0)
  const gorra = await prod(STORE, 'Gorra', 30000, 10000, 3)
  await q(`UPDATE products SET low_stock_threshold = 5 WHERE id=$1`, [gorra.id])
  const bufanda = await prod(STORE, 'Bufanda', 30000, 10000, 10)

  const estados = await as(O, () => q(`SELECT * FROM toul_estado_stock()`))
  const estadoDe = (id) => estados.find(e => e.id === id)?.estado
  ok(estadoDe(cS.id) === 'bien', 'Camisa S: 5 con mínimo 2 está bien', estadoDe(cS.id))
  ok(estadoDe(cM.id) === 'pocas', 'Camisa M: 2 con mínimo 2 se está acabando', estadoDe(cM.id))
  ok(estadoDe(cL.id) === 'agotado', 'Camisa L: en −1 cuenta como agotada', estadoDe(cL.id))
  ok(estadoDe(cXL.id) === 'agotado', 'Camisa XL: en 0 está agotada', estadoDe(cXL.id))
  ok(estadoDe(gorra.id) === 'pocas', 'Gorra: 3 con mínimo 5 se está acabando', estadoDe(gorra.id))
  ok(estadoDe(bufanda.id) === 'bien', 'Bufanda: 10 sin ventas (mínimo automático 1) está bien', estadoDe(bufanda.id))
  ok(!estados.some(e => e.id === camisa.id), 'el producto con presentaciones no se cuenta aparte: se cuentan sus presentaciones')
  ok(estados.find(e => e.id === cM.id)?.reference === 'CAM-01', 'trae la referencia del producto')
  const unaFicha = await as(O, () => q(`SELECT * FROM toul_estado_stock($1)`, [camisa.id]))
  ok(unaFicha.length === 4 && unaFicha.every(e => e.product_id === camisa.id), 'con un producto, trae solo sus presentaciones', String(unaFicha.length))

  const porProducto = (id) => estadoDelProducto(estados.filter(e => e.product_id === id).map(e => e.estado))
  ok(porProducto(camisa.id) === 'pocas', 'el Catálogo dice "Pocas unidades" de la Camisa: alguna está en su mínimo o agotada', porProducto(camisa.id))
  ok(porProducto(zapato.id) === 'agotado', 'y "Sin stock" del Zapato: todas sus tallas se agotaron', porProducto(zapato.id))
  ok(porProducto(bufanda.id) === 'bien', 'la Bufanda no lleva aviso', porProducto(bufanda.id))

  // La Bufanda llegó hace 70 días y no se ha vendido: es un quieto
  await q(`UPDATE products SET reference='BUF-9' WHERE id=$1`, [bufanda.id])
  await q(`UPDATE inventory_adjustments SET created_at = now() - interval '70 days' WHERE product_id=$1`, [bufanda.id])
  const res3 = await resumen()
  igual('Inventario cuenta los mismos agotados', estados.filter(e => e.estado === 'agotado').length, res3.outOfStock)
  igual('y los mismos por acabarse', estados.filter(e => e.estado === 'pocas').length, res3.lowStock)
  ok(res3.alerts.length === estados.filter(e => e.estado !== 'bien').length, 'la lista de reponer es exactamente lo que no está bien', `${res3.alerts.length}`)
  ok(fila(res3.alerts, cM.id)?.reference === 'CAM-01', 'las alertas traen la referencia (para buscar por referencia)')
  ok(fila(res3.dormant, bufanda.id)?.reference === 'BUF-9', 'los quietos también', JSON.stringify(fila(res3.dormant, bufanda.id)))

  const ajena = await as(O2, () => q(`SELECT * FROM toul_estado_stock(NULL, $1)`, [STORE]))
  ok(ajena.length === 0, 'otra tienda no ve tu inventario aunque pida tu tienda', String(ajena.length))

  console.log('\n— Paso 3: el detalle de una compra')
  const [pantalon] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Pantalón',0,0,0) RETURNING id`, [STORE])
  const p30 = await variante(pantalon.id, '30', 0)
  const p32 = await variante(pantalon.id, '32', 0)
  const compraEn = async (dia, uid, payload) => {
    const id = (await r(uid, `SELECT process_purchase($1::jsonb) r`, [JSON.stringify(payload)])).purchaseId
    await q(`UPDATE purchases SET created_at=$2 WHERE id=$1`, [id, `2026-09-${dia} 15:00:00+00`])
    return id
  }
  const item = (variantId, quantity, unitCost) => ({ productId: pantalon.id, variantId, quantity, unitCost })
  const c1 = await compraEn('01', O, { isCredit: false, methodId: efe.id, items: [item(p30.id, 2, 20000), item(p32.id, 2, 25000)] })
  await compraEn('05', O, { isCredit: false, plataMia: true, items: [item(p32.id, 1, 26000)] })
  const c3 = await compraEn('09', O, { isCredit: false, methodId: neq.id, items: [item(p30.id, 1, 21000), item(p32.id, 1, 27000)] })
  const det3 = await r(O, `SELECT toul_purchase_detail($1) r`, [c3])
  const talla = (d, talla) => d.items.find(i => i.presentacion === talla)
  ok(!!talla(det3, '30') && !!talla(det3, '32'), 'cada renglón dice su presentación', det3.items.map(i => i.presentacion).join(','))
  igual('la talla 30 se compara con la última compra de la 30 (no con la 32)', 20000, talla(det3, '30').costoAnterior)
  igual('la talla 32 se compara con la última compra de la 32', 26000, talla(det3, '32').costoAnterior)
  ok(det3.cuenta?.nombre === 'Nequi' && det3.cuenta?.plataMia === false, 'dice con qué cuenta se pagó', JSON.stringify(det3.cuenta))
  const det2 = await r(O, `SELECT toul_purchase_detail(id) r FROM purchases WHERE created_at = '2026-09-05 15:00:00+00' AND store_id = $1`, [STORE])
  ok(det2.cuenta?.nombre === 'Plata mía' && det2.cuenta?.plataMia === true, 'o que fue con Plata mía', JSON.stringify(det2.cuenta))
  await q(`UPDATE payment_methods SET name='Efectivo caja' WHERE id=$1`, [efe.id])
  const det1 = await r(O, `SELECT toul_purchase_detail($1) r`, [c1])
  ok(det1.cuenta?.nombre === 'Efectivo caja', 'con el nombre de hoy de la cuenta', JSON.stringify(det1.cuenta))
  await q(`UPDATE payment_methods SET name='Efectivo' WHERE id=$1`, [efe.id])
  const [prov] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Textiles') RETURNING id`, [STORE])
  const fiada = await compraEn('10', O, { isCredit: true, providerId: prov.id, dueDate: '2026-10-10T00:00:00.000Z', items: [item(p30.id, 1, 21000)] })
  const detFiada = await r(O, `SELECT toul_purchase_detail($1) r`, [fiada])
  ok(detFiada.cuenta === null, 'a crédito sin abono: no dice cuenta', JSON.stringify(detFiada.cuenta))
  ok(String(detFiada.deuda?.vence).startsWith('2026-10-10'), 'el plazo se guarda en su día', String(detFiada.deuda?.vence))

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
