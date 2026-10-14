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
  const [caribe] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Distribuidora Caribe') RETURNING id`, [STORE])
  const [mayor] = await q(`INSERT INTO providers(store_id,name) VALUES ($1,'Perfumes al por mayor') RETURNING id`, [STORE])

  console.log('\n— Compra de contado: cambiar el proveedor no mueve plata')
  const [contado] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
      VALUES ($1,$2,300000,300000,'cash',false) RETURNING id`, [STORE, caribe.id])
  await as(O, () => q(`SELECT toul_change_purchase_provider($1,$2)`, [contado.id, mayor.id]))
  ok((await one(`SELECT provider_id FROM purchases WHERE id=$1`, [contado.id])).provider_id === mayor.id,
     'la compra queda con el proveedor correcto')
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [mayor.id])).total_debt) === 0,
     'y nadie quedó debiendo nada')

  console.log('\n— Compra a crédito: la deuda se muda con la compra')
  const [credito] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
      VALUES ($1,$2,500000,500000,'credit',true) RETURNING id`, [STORE, caribe.id])
  await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount)
      VALUES ($1,$2,$3,500000,500000)`, [STORE, caribe.id, credito.id])
  await q(`UPDATE providers SET total_debt = 500000 WHERE id=$1`, [caribe.id])

  await as(O, () => q(`SELECT toul_change_purchase_provider($1,$2)`, [credito.id, mayor.id]))
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [caribe.id])).total_debt) === 0,
     'a Caribe ya no le debes nada')
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [mayor.id])).total_debt) === 500000,
     'la deuda de $500.000 pasó al proveedor correcto')
  ok((await one(`SELECT provider_id FROM provider_debts WHERE purchase_id=$1`, [credito.id])).provider_id === mayor.id,
     'el registro de la deuda también cambió de dueño')

  console.log('\n— Lo que no se puede hacer')
  const sinProveedor = await err(() => as(O, () => q(`SELECT toul_change_purchase_provider($1,NULL)`, [credito.id])))
  ok(sinProveedor !== null, 'una compra a crédito no se puede dejar sin proveedor')

  const otro = await err(() => as(O, () => q(`SELECT toul_change_purchase_provider($1,$2)`,
    [credito.id, '99999999-9999-9999-9999-999999999999'])))
  ok(otro !== null, 'no se puede pasar a un proveedor que no es tuyo')

  console.log('\n— Si ya está abonada, solo se mueve lo que falta')
  const [parcial] = await q(`INSERT INTO purchases(store_id,provider_id,subtotal,total,payment_method,is_credit)
      VALUES ($1,$2,400000,400000,'credit',true) RETURNING id`, [STORE, caribe.id])
  await q(`INSERT INTO provider_debts(store_id,provider_id,purchase_id,amount,remaining_amount)
      VALUES ($1,$2,$3,400000,150000)`, [STORE, caribe.id, parcial.id])
  await q(`UPDATE providers SET total_debt = 150000 WHERE id=$1`, [caribe.id])

  await as(O, () => q(`SELECT toul_change_purchase_provider($1,$2)`, [parcial.id, mayor.id]))
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [caribe.id])).total_debt) === 0,
     'a Caribe se le quitan solo los $150.000 que faltaban')
  ok(Number((await one(`SELECT total_debt FROM providers WHERE id=$1`, [mayor.id])).total_debt) === 650000,
     'y al otro le suman esos $150.000, no los $400.000 originales')

  return { fails }
}
