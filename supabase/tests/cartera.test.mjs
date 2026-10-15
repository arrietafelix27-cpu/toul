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
  /** El día de hoy en Colombia, igual que lo calcula la base */
  const hoy = (await one(`SELECT (now() - interval '5 hours')::date d`)).d
  const dia = (n) => {
    const d = new Date(hoy); d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'o@x.com')`, [O])
  await q(`INSERT INTO stores(id,owner_id,name,credit_default_days) VALUES ($1,$2,'Perfumes',30)`, [STORE, O])
  const [prod] = await q(`INSERT INTO products(store_id,name,sale_price,cost_price,cpp) VALUES ($1,'Sauvage',400000,250000,250000) RETURNING id`, [STORE])

  /** Un fiado puesto en el pasado, con o sin plazo */
  const fiar = async (cliente, monto, haceDias, plazo) => {
    const [v] = await q(
      `INSERT INTO sales(store_id,customer_id,total,is_credit,created_at)
       VALUES ($1,$2,$3,true, now() - ($4 || ' days')::interval) RETURNING id`,
      [STORE, cliente, monto, String(haceDias)])
    await q(
      `INSERT INTO credits(store_id,customer_id,sale_id,type,amount,notes,created_at)
       VALUES ($1,$2,$3,'debt',$4,$5, now() - ($6 || ' days')::interval)`,
      [STORE, cliente, v.id, monto,
       plazo ? `Deuda - Venta #ABC - Vence: ${plazo}` : 'Deuda - Venta #ABC', String(haceDias)])
    return v.id
  }
  const abonar = (cliente, monto, haceDias = 0) => q(
    `INSERT INTO credits(store_id,customer_id,type,amount,created_at)
     VALUES ($1,$2,'payment',$3, now() - ($4 || ' days')::interval)`,
    [STORE, cliente, monto, String(haceDias)])
  const cliente = async (nombre) =>
    (await one(`INSERT INTO customers(store_id,name,phone) VALUES ($1,$2,'3001112233') RETURNING id`, [STORE, nombre])).id

  const cartera = () => as(O, async () => (await one(`SELECT toul_receivables() r`)).r)
  const dame = (c, nombre) => (c.clientes || []).find(x => x.nombre === nombre)

  console.log('\n— El plazo escrito en la nota se vuelve una fecha de verdad')
  const maria = await cliente('María')
  await fiar(maria, 180000, 50, dia(-12))
  const mv = await one(`SELECT due_date FROM credits WHERE customer_id=$1`, [maria])
  ok(mv.due_date !== null, 'el fiado quedó con fecha de vencimiento')
  ok(new Date(mv.due_date).toISOString().slice(0, 10) === dia(-12), `y es la del plazo (${dia(-12)})`)

  console.log('\n— Sin plazo, vence a los 30 días de la venta')
  const carlos = await cliente('Carlos')
  await fiar(carlos, 500000, 40, null)
  let c = await cartera()
  const rc = dame(c, 'Carlos')
  ok(rc !== undefined, 'Carlos aparece en la cartera')
  ok(rc.diasVencido === 10, `lleva 10 días vencido: 40 de fiado menos 30 de plazo (dio ${rc.diasVencido})`)
  ok(rc.motivo === 'vencida' && rc.grupo === 'hoy', 'y le toca cobrarle hoy')

  console.log('\n— Dentro del plazo no se le cobra')
  const ana = await cliente('Ana')
  await fiar(ana, 250000, 3, dia(12))
  c = await cartera()
  ok(dame(c, 'Ana').grupo === 'plazo', 'Ana está dentro del plazo')
  ok(dame(c, 'Ana').motivo === 'dentro', 'y el motivo lo dice')

  console.log('\n— Si ya le escribiste, pasa a espera (no le escribes dos veces)')
  await q(`INSERT INTO customer_contacts(store_id,customer_id,kind,channel,created_at)
           VALUES ($1,$2,'contacto','whatsapp', now() - interval '1 day')`, [STORE, carlos])
  c = await cartera()
  ok(dame(c, 'Carlos').grupo === 'espera', 'Carlos sale de la lista de hoy')
  ok(dame(c, 'Carlos').motivo === 'escrito' && dame(c, 'Carlos').diasContacto === 1,
    'y la pantalla puede decir "le escribiste hace 1 día"')

  console.log('\n— Un compromiso a futuro lo saca de la lista hasta ese día')
  await q(`INSERT INTO customer_contacts(store_id,customer_id,kind,promised_date,promised_amount)
           VALUES ($1,$2,'compromiso',$3,100000)`, [STORE, maria, dia(4)])
  c = await cartera()
  ok(dame(c, 'María').grupo === 'espera' && dame(c, 'María').motivo === 'promesa',
    'María queda en espera hasta el día que prometió')

  console.log('\n— El día que prometió, vuelve de primero')
  await q(`UPDATE customer_contacts SET promised_date=$1 WHERE customer_id=$2 AND kind='compromiso'`, [hoy, maria])
  c = await cartera()
  ok(dame(c, 'María').grupo === 'hoy' && dame(c, 'María').motivo === 'promesa_hoy', 'hoy le toca')
  ok(c.clientes[0].nombre === 'María' || c.clientes.findIndex(x => x.nombre === 'María') < c.clientes.findIndex(x => x.nombre === 'Ana'),
    'y va antes que los que están dentro del plazo')

  console.log('\n— Si prometió y no cumplió, la pantalla lo dice')
  await q(`UPDATE customer_contacts SET promised_date=$1 WHERE customer_id=$2 AND kind='compromiso'`, [dia(-3), maria])
  c = await cartera()
  ok(dame(c, 'María').motivo === 'promesa_rota', 'queda marcada como promesa incumplida')
  ok(dame(c, 'María').grupo === 'hoy', 'y vuelve a la lista de hoy')

  console.log('\n— Un compromiso nuevo reemplaza al viejo')
  await q(`INSERT INTO customer_contacts(store_id,customer_id,kind,promised_date)
           VALUES ($1,$2,'compromiso',$3)`, [STORE, maria, dia(6)])
  const abiertos = await q(`SELECT id FROM customer_contacts
    WHERE customer_id=$1 AND kind='compromiso' AND settled_at IS NULL`, [maria])
  ok(abiertos.length === 1, 'solo queda un compromiso abierto, no dos')
  ok(dame(await cartera(), 'María').promesa.toISOString?.().slice(0, 10) === dia(6)
     || String(dame(await cartera(), 'María').promesa).slice(0, 10) === dia(6),
    'y es el nuevo')

  console.log('\n— Los abonos se aplican al fiado más viejo primero')
  const samuel = await cliente('Samuel')
  await fiar(samuel, 450000, 60, dia(-30))   // el viejo
  await fiar(samuel, 250000, 5, dia(25))     // el nuevo, todavía con plazo
  c = await cartera()
  ok(dame(c, 'Samuel').saldo === 700000, 'debe los dos fiados: $700.000')
  ok(dame(c, 'Samuel').diasVencido === 30, 'y corre el plazo del viejo: 30 días vencido')

  await abonar(samuel, 450000)
  c = await cartera()
  ok(dame(c, 'Samuel').saldo === 250000, 'abonó y le queda el segundo fiado')
  ok(dame(c, 'Samuel').grupo === 'plazo',
    'ya no se le cobra: el que quedó abierto todavía está dentro del plazo')

  console.log('\n— Quien queda en cero desaparece de la cartera')
  await abonar(samuel, 250000)
  c = await cartera()
  ok(dame(c, 'Samuel') === undefined, 'Samuel ya no aparece')
  const cerrados = await q(`SELECT id FROM customer_contacts
    WHERE customer_id=$1 AND kind='compromiso' AND settled_at IS NULL`, [samuel])
  ok(cerrados.length === 0, 'y si tenía un compromiso, queda cumplido')

  console.log('\n— Los totales de arriba')
  c = await cartera()
  const suma = c.clientes.reduce((s, x) => s + Number(x.saldo), 0)
  ok(Number(c.total) === suma, `el total es la suma exacta de los saldos (${c.total})`)
  ok(Number(c.hoy) === c.clientes.filter(x => x.grupo === 'hoy').length, 'el contador de "hoy" cuadra con la lista')
  ok(Number(c.recuperadoMes) === 700000, `recuperaste $700.000 este mes (dio ${c.recuperadoMes})`)
  ok(Number(c.fiadoMes) > 0, 'y muestra cuánto fiaste en el mes')

  console.log('\n— Mis clientes: compras, gasto y recencia')
  await q(`INSERT INTO sales(store_id,customer_id,total,created_at)
           VALUES ($1,$2,100000, now() - interval '2 days'),
                  ($1,$2,200000, now() - interval '9 days'),
                  ($1,$2,300000, now() - interval '20 days')`, [STORE, ana])
  const vista = await as(O, async () => (await one(`SELECT toul_customers_overview(60) r`)).r)
  const va = (vista.clientes || []).find(x => x.nombre === 'Ana')
  ok(va.compras === 4, `Ana tiene 4 compras contando la fiada (dio ${va.compras})`)
  ok(Number(va.gastado) === 850000, `ha gastado $850.000 (dio ${va.gastado})`)
  ok(Number(va.ticket) === 212500, `su compra promedio es $212.500 (dio ${va.ticket})`)
  ok(va.dias === 2, 'compró hace 2 días')
  ok(va.etiqueta === 'recurrente', 'y queda marcada como recurrente')
  ok('guardado' in va, 'la lista trae lo que dice la ficha, para poder avisar si no cuadra')

  console.log('\n— Inactivo: llevaba comprando y lleva más de 60 días sin volver')
  const pedro = await cliente('Pedro')
  await q(`INSERT INTO sales(store_id,customer_id,total,created_at)
           VALUES ($1,$2,90000, now() - interval '120 days')`, [STORE, pedro])
  const v2 = await as(O, async () => (await one(`SELECT toul_customers_overview(60) r`)).r)
  const vp = (v2.clientes || []).find(x => x.nombre === 'Pedro')
  ok(vp.etiqueta === 'inactivo', 'Pedro queda marcado como inactivo')
  ok(vp.dias === 120, 'y dice hace cuánto fue: 120 días')
  const v30 = await as(O, async () => (await one(`SELECT toul_customers_overview(200) r`)).r)
  ok((v30.clientes || []).find(x => x.nombre === 'Pedro').etiqueta !== 'inactivo',
    'con el umbral en 200 días ya no es inactivo: el número manda')
  ok(Number(v2.inactivos) >= 1 && Number(v2.recurrentes) >= 1, 'los contadores de arriba cuentan bien')

  console.log('\n— La ficha: qué compra siempre')
  await q(`INSERT INTO sale_items(store_id,sale_id,product_id,quantity,unit_price,unit_cost,subtotal)
           SELECT $1, id, $2, 2, 400000, 250000, 800000 FROM sales WHERE customer_id=$3 LIMIT 1`,
    [STORE, prod.id, ana])
  const ficha = await as(O, async () => (await one(`SELECT toul_customer_profile($1) r`, [ana])).r)
  ok(Number(ficha.compras) === 4, 'la ficha cuenta sus 4 compras')
  ok(Number(ficha.ticket) === 212500, 'y su compra promedio')
  ok(ficha.favoritos.length === 1 && ficha.favoritos[0].nombre === 'Sauvage',
    'muestra lo que compra: Sauvage')
  ok(Number(ficha.favoritos[0].unidades) === 2, 'con las unidades que lleva')
  ok(Number(ficha.plazoDias) === 30, 'y el plazo que usa la tienda')

  console.log('\n— La pantalla anota el contacto sin saber de qué tienda es')
  const anotado = await as(O, async () => (await one(
    `INSERT INTO customer_contacts(customer_id,kind,channel) VALUES ($1,'contacto','whatsapp') RETURNING store_id`,
    [carlos])))
  ok(anotado.store_id === STORE, 'la base le pone la tienda sola, desde el cliente')

  console.log('\n— Cada tienda ve solo su cartera')
  const O2 = '22222222-2222-2222-2222-222222222222'
  await q(`INSERT INTO auth.users(id,email) VALUES ($1,'otro@x.com')`, [O2])
  await q(`INSERT INTO stores(owner_id,name) VALUES ($1,'Otra tienda')`, [O2])
  const ajena = await as(O2, async () => (await one(`SELECT toul_receivables() r`)).r)
  ok(Number(ajena.total) === 0 && ajena.clientes.length === 0, 'el otro dueño no ve nada de esta tienda')

  return { fails }
}
