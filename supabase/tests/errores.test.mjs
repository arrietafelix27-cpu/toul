const O = '11111111-1111-1111-1111-111111111111'
const O2 = '22222222-2222-2222-2222-222222222222'
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

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com'),($2,'otro@x.com')`, [O, O2])
  await q(`INSERT INTO stores(id,owner_id,name) VALUES ($1,$2,'Perfumes')`, [STORE, O])
  const [store2] = await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra') RETURNING id`, [O2])

  console.log('\n— La pantalla solo manda el error; el resto lo pone la base')
  const fila = await as(O, async () => (await one(
    `INSERT INTO app_errors(message, url) VALUES ('No se pudo cargar el inventario','/inventory') RETURNING store_id, user_id`)))
  ok(fila.store_id === STORE, 'le pone la tienda sola')
  ok(fila.user_id === O, 'y quién lo sufrió')

  console.log('\n— Un stack gigante no llena la tabla')
  const largo = await as(O, async () => (await one(
    `INSERT INTO app_errors(message, stack) VALUES ($1,$2) RETURNING length(message) m, length(stack) s`,
    ['x'.repeat(2000), 'y'.repeat(99000)])))
  ok(Number(largo.m) === 500, `el mensaje se recorta a 500 (dio ${largo.m})`)
  ok(Number(largo.s) === 4000, `el stack se recorta a 4000 (dio ${largo.s})`)

  console.log('\n— El mismo error repetido se agrupa')
  await as(O, () => q(`INSERT INTO app_errors(message, url) VALUES ('No se pudo cargar el inventario','/inventory')`))
  await as(O, () => q(`INSERT INTO app_errors(message, url) VALUES ('No se pudo cargar el inventario','/inventory')`))
  const vista = await as(O, async () => (await one(`SELECT toul_recent_errors(50) r`)).r)
  const inv = vista.errores.find(e => e.mensaje === 'No se pudo cargar el inventario')
  ok(inv !== undefined, 'el error aparece en la lista')
  ok(Number(inv.veces) === 3, `dice que pasó 3 veces, no lo repite 3 veces (dio ${inv.veces})`)
  ok(Number(vista.total) === 4, `y el total cuenta todos los eventos (dio ${vista.total})`)

  console.log('\n— Cada quien ve los errores de su tienda')
  await as(O2, () => q(`INSERT INTO app_errors(message) VALUES ('Error de la otra tienda')`))
  const mios = await as(O, async () => (await one(`SELECT toul_recent_errors(50) r`)).r)
  ok(!mios.errores.some(e => e.mensaje === 'Error de la otra tienda'), 'no veo los errores ajenos')
  const suyos = await as(O2, async () => (await one(`SELECT toul_recent_errors(50) r`)).r)
  ok(suyos.errores.length === 1 && suyos.errores[0].mensaje === 'Error de la otra tienda', 'y él ve solo el suyo')
  ok((await as(O, () => q(`SELECT id FROM app_errors WHERE store_id=$1`, [store2.id]))).length === 0,
    'la tabla tampoco deja leerlos directo')

  console.log('\n— Los errores viejos se borran solos')
  await q(`INSERT INTO app_errors(store_id, message, created_at) VALUES ($1,'Viejo', now() - interval '100 days')`, [STORE])
  const borrados = await one(`SELECT toul_prune_errors() n`)
  ok(Number(borrados.n) === 1, 'se va el de hace 100 días')
  ok((await q(`SELECT id FROM app_errors WHERE message='Viejo'`)).length === 0, 'y ya no está')
  ok((await q(`SELECT id FROM app_errors WHERE store_id=$1`, [STORE])).length === 4, 'los recientes se quedan')

  return { fails }
}
