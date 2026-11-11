// Antes y después de quitar "Plata mía" (2026-11-11).
//
// 1. Arma la tienda de prueba completa con las reglas de antes, con sus
//    valores calculados a mano por Félix (tienda-prueba.test.mjs, sin
//    cambiarle nada).
// 2. Toma una foto de todos los números: Ganaste, ventas, valor del
//    inventario, cada reporte por periodo y por mes, la cartera, las
//    compras, los clientes, los turnos, el libro de plata y la auditoría.
// 3. Aplica el cambio (el último SQL de la lista de run.mjs).
// 4. Toma la foto otra vez: tiene que salir idéntica, peso por peso.
// 5. Revisa las reglas nuevas: "Plata mía" ya no se puede elegir y lo
//    viejo sigue igual.
//
// REGLA: si la foto no sale idéntica, el cambio movió un número y hay que
// decir cuál. No se ajusta la prueba para que pase.
//
// Solo corre en la base de pruebas en memoria (PGlite), nunca en producción.
import tiendaPrueba from './tienda-prueba.test.mjs'

// Los mismos de tienda-prueba.test.mjs
const O = '11111111-1111-1111-1111-111111111111'
const STORE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

let fails = 0
const ok = (c, m, detalle = '') => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (detalle && !c ? ` (${detalle})` : '')); if (!c) fails++ }

// Meses de Colombia (UTC-5)
const MES = (m, dias) => [`2026-${m}-01T00:00:00-05:00`, `2026-${m}-${dias}T23:59:59.999-05:00`]

export default async function (db, { aplicarCambio }) {
  const q = async (sql, p) => (await db.query(sql, p)).rows
  const one = async (sql, p) => (await q(sql, p))[0]
  const as = async (uid, fn) => {
    await db.exec(`SELECT set_config('request.jwt.claim.sub', '${uid}', false); SET ROLE authenticated;`)
    try { return await fn() } finally { await db.exec(`RESET ROLE;`) }
  }
  const err = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
  const r = (sql, p) => as(O, async () => (await one(sql, p)).r)
  const intento = (sql, p) => as(O, () => err(() => q(sql, p)))

  // ── 1. La tienda de prueba, con las reglas de antes ──
  const tienda = await tiendaPrueba(db)
  fails += tienda?.fails ?? 0

  const efectivo = (await one(`SELECT id FROM payment_methods WHERE store_id=$1 AND name='Efectivo'`, [STORE])).id
  const producto = (await one(`SELECT id FROM products WHERE store_id=$1 ORDER BY name LIMIT 1`, [STORE])).id
  const proveedor = (await one(`SELECT id FROM providers WHERE store_id=$1 ORDER BY name LIMIT 1`, [STORE])).id

  // Un gasto pagado con "Plata mía" antes del cambio, para ver que lo viejo sigue
  const gastoViejo = (await r(`SELECT toul_registrar_gasto('empaques',15000,'Bolsas de antes',NULL,true) r`)).expenseId
  const pagoDe = (id) => one(`SELECT * FROM payments WHERE reference_id=$1 AND type='expense'`, [id])
  const atado = (pagoId) => one(`SELECT * FROM payments WHERE linked_payment_id=$1`, [pagoId])

  // ── 2. La foto ──
  const foto = async () => {
    const f = {}
    for (const [nombre, [desde, hasta]] of Object.entries({
      septiembre: MES('09', 30), octubre: MES('10', 31), noviembre: MES('11', 30), diciembre: MES('12', 31),
      ano: ['2026-01-01T00:00:00-05:00', '2026-12-31T23:59:59.999-05:00'],
    })) {
      f[`reporte ${nombre}`] = await r(`SELECT toul_reporte($1,$2) r`, [desde, hasta])
      f[`reporte ${nombre} por día`] = await r(`SELECT toul_reporte($1,$2,'dia') r`, [desde, hasta])
      f[`detalle ${nombre}`] = await r(`SELECT toul_reporte_detalle($1,$2) r`, [desde, hasta])
      f[`compras ${nombre}`] = await r(`SELECT toul_purchases_summary($1,$2) r`, [desde, hasta])
    }
    f['reporte de todo'] = await r(`SELECT toul_reporte(NULL,NULL) r`)
    f['31 de octubre por hora'] = await r(`SELECT toul_reporte($1,$2,'hora') r`, ['2026-10-31T00:00:00-05:00', '2026-10-31T23:59:59.999-05:00'])
    f['mes a mes'] = await r(`SELECT toul_reporte_meses(6, '2026-11-01') r`)
    f['mes a mes del año'] = await r(`SELECT toul_reporte_meses(12, '2026-12-01') r`)
    f['cartera'] = await r(`SELECT toul_receivables() r`)
    f['clientes'] = await r(`SELECT toul_customers_overview(30) r`)
    f['inventario'] = await r(`SELECT toul_inventory_overview(1) r`)
    f['inventario 30 días'] = await r(`SELECT toul_inventory_overview(30) r`)
    f['estado del stock'] = await as(O, () => q(`SELECT * FROM toul_estado_stock() ORDER BY 1, 2`))
    f['turnos'] = await as(O, () => q(`SELECT id, toul_cash_session_totals(id) t FROM cash_sessions WHERE store_id=$1 ORDER BY opened_at`, [STORE]))
    f['libro de plata'] = await q(`SELECT type, own_money, method, count(*)::int n, round(sum(amount)) total
                                     FROM payments WHERE store_id=$1 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`, [STORE])
    f['auditoría'] = await as(O, () => q(`SELECT periodo, chequeo, esperado, obtenido, ok, detalle FROM toul_auditoria()`))
    return f
  }

  console.log('\n— La foto antes del cambio')
  const antes = await foto()
  ok(antes['auditoría'].length > 0 && antes['auditoría'].every(f => f.ok), 'antes del cambio la auditoría sale toda bien',
    antes['auditoría'].filter(f => !f.ok).map(f => f.chequeo).join(' | '))
  ok(antes['libro de plata'].some(x => x.own_money), 'y hay registros viejos con "Plata mía"')

  // ── 3. El cambio ──
  await aplicarCambio()

  // ── 4. La misma foto ──
  console.log('\n— La foto después del cambio: idéntica')
  const despues = await foto()
  for (const que of Object.keys(antes)) {
    const igual = JSON.stringify(antes[que]) === JSON.stringify(despues[que])
    ok(igual, que, igual ? '' : `antes ${JSON.stringify(antes[que]).slice(0, 300)} · después ${JSON.stringify(despues[que]).slice(0, 300)}`)
  }

  // ── 5. Las reglas nuevas ──
  console.log('\n— "Plata mía" ya no se puede elegir')
  const gastosAntes = Number((await one(`SELECT count(*) n FROM expenses WHERE store_id=$1`, [STORE])).n)
  let msg = await intento(`SELECT toul_registrar_gasto('transporte',5000,'Taxi',NULL,true)`)
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? ''), 'un gasto nuevo con "Plata mía" se rechaza', msg)
  ok(Number((await one(`SELECT count(*) n FROM expenses WHERE store_id=$1`, [STORE])).n) === gastosAntes, 'y no queda guardado a medias')

  const comprasAntes = Number((await one(`SELECT count(*) n FROM purchases WHERE store_id=$1`, [STORE])).n)
  msg = await intento(`SELECT process_purchase($1::jsonb)`, [JSON.stringify({ isCredit: false, plataMia: true, items: [{ productId: producto, quantity: 1, unitCost: 1000 }] })])
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? ''), 'una compra con "Plata mía" se rechaza', msg)
  ok(Number((await one(`SELECT count(*) n FROM purchases WHERE store_id=$1`, [STORE])).n) === comprasAntes, 'y no entra ni la compra ni la mercancía')

  await r(`SELECT process_purchase($1::jsonb) r`, [JSON.stringify({ isCredit: true, providerId: proveedor, paidNow: 0, items: [{ productId: producto, quantity: 1, unitCost: 20000 }] })])
  const deuda = Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [proveedor])).total_debt)
  msg = await intento(`SELECT toul_pagar_proveedor($1,10000,NULL,NULL,true)`, [proveedor])
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? ''), 'un pago al proveedor con "Plata mía" se rechaza', msg)
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [proveedor])).total_debt) === deuda, 'y la deuda con el proveedor no baja')
  const pago = await r(`SELECT toul_pagar_proveedor($1,10000,NULL,$2,false) r`, [proveedor, efectivo])
  ok(pago.success && Number(pago.saldo) === deuda - 10000, 'con una cuenta del negocio sí se le paga')

  const gastoNuevo = (await r(`SELECT toul_registrar_gasto('transporte',5000,'Taxi',$1,false) r`, [efectivo])).expenseId
  ok(!!gastoNuevo && !(await pagoDe(gastoNuevo)).own_money, 'un gasto con cuenta se anota como siempre')
  msg = await intento(`SELECT toul_update_expense($1,'transporte','Taxi',5000,NULL,true)`, [gastoNuevo])
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? ''), 'y no se puede pasar a "Plata mía"', msg)
  msg = await intento(`SELECT toul_registrar_gasto('transporte',5000,'Taxi',NULL,false)`)
  ok(/Elige con qué pagaste/.test(msg ?? ''), 'sin cuenta sigue sin guardarse', msg)
  ok(!(await atado((await pagoDe(gastoNuevo)).id)), 'y nada nuevo crea un "Metí plata" solo')

  console.log('\n— Lo viejo con "Plata mía" sigue igual')
  const pagoViejo = await pagoDe(gastoViejo)
  ok(pagoViejo.own_money && pagoViejo.method === 'Plata mía' && Number((await atado(pagoViejo.id))?.amount) === 15000, 'el gasto viejo sigue con "Plata mía" y su Metí plata de $15.000')
  await r(`SELECT toul_update_expense($1,'empaques','Bolsas de antes',18000,NULL,NULL) r`, [gastoViejo])
  ok(Number((await atado(pagoViejo.id))?.amount) === 18000 && (await pagoDe(gastoViejo)).own_money, 'si se corrige a $18.000, su Metí plata también')
  await r(`SELECT toul_update_expense($1,'empaques','Bolsas de antes',18000,$2,NULL) r`, [gastoViejo, efectivo])
  ok(!(await atado(pagoViejo.id)) && (await pagoDe(gastoViejo)).method === 'Efectivo', 'si se pasa a una cuenta, su Metí plata desaparece')
  msg = await intento(`SELECT toul_update_expense($1,'empaques','Bolsas de antes',18000,NULL,true)`, [gastoViejo])
  ok(/Elige con qué cuenta del negocio pagaste/.test(msg ?? ''), 'pero ya no vuelve a "Plata mía"', msg)

  console.log('\n— Metí plata y Saqué plata siguen igual')
  const meti = await r(`SELECT toul_registrar_movimiento('meti',30000,$1,'Para el cambio') r`, [efectivo])
  const saque = await r(`SELECT toul_registrar_movimiento('saque',10000,$1,NULL) r`, [efectivo])
  ok(!!meti?.id && !!saque?.id, 'se anotan a mano con su cuenta')

  console.log('\n— La auditoría después de todo')
  const final = await as(O, () => q(`SELECT * FROM toul_auditoria()`))
  ok(final.every(f => f.ok), 'todo cuadra', final.filter(f => !f.ok).map(f => `${f.periodo} ${f.chequeo}: ${f.esperado} vs ${f.obtenido} ${f.detalle ?? ''}`).join(' | '))

  console.log(fails === 0 ? '  TODO OK' : `  ${fails} FALLOS`)
  return { fails }
}
