import type { SupabaseClient } from '@supabase/supabase-js'
import { formatPrecio } from '@/lib/utils'
import { contraQue, textoRango, type Periodo, type Tramo } from '@/lib/periodos'
import { deCada100, formatoCorto, porcentajeTendencia, proyeccion, resumir } from '@/lib/reports/calculos'
import type { MesReporte, ReporteSQL } from '@/lib/reports/types'

/* ══════════════════════════════════════════════════════════════
   Descargar el reporte: Excel (resumen + cada venta, montos como
   números de verdad) y PDF (el resumen, en fondo blanco). Las dos
   librerías se cargan solo al descargar.
   ══════════════════════════════════════════════════════════════ */

interface Base {
    tienda: string
    periodo: Periodo
    tramo: Tramo
    actual: ReporteSQL
    anterior: ReporteSQL | null
    meses: MesReporte[]
    inventario: number | null
}

/** "Reporte octubre 2026", "Reporte semana del 26 oct 2026", "Reporte 2026" */
function titulo(periodo: Periodo, tramo: Tramo): string {
    const desde = tramo.from ? new Date(tramo.from) : new Date()
    const hasta = tramo.to ? new Date(tramo.to) : new Date()
    if (periodo === 'month') return `Reporte ${desde.toLocaleDateString('es-CO', { month: 'long' })} ${desde.getFullYear()}`
    if (periodo === 'year') return `Reporte ${desde.getFullYear()}`
    if (periodo === 'week') return `Reporte semana del ${textoRango(desde, desde)} ${desde.getFullYear()}`
    return `Reporte ${textoRango(desde, hasta)} ${hasta.getFullYear()}`.replace('–', '-')
}

function rangoTexto(tramo: Tramo): string {
    const f = (iso: string | null) => (iso ? new Date(iso) : new Date())
        .toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '')
    return `Del ${f(tramo.from)} al ${f(tramo.to)}`
}

function filasResumen(b: Base): [string, number, 'plata' | 'pct'][] {
    const r = resumir(b.actual)
    const filas: [string, number, 'plata' | 'pct'][] = [
        [r.ganaste < 0 ? 'Perdiste' : 'Ganaste', Math.abs(r.ganaste), 'plata'],
        ['Vendiste', r.vendiste, 'plata'],
        ['De contado', r.contado, 'plata'],
        ['A crédito', r.credito, 'plata'],
        ['Abonos que te hicieron', r.abonos, 'plata'],
        ['Plata que entró', r.entro, 'plata'],
        ['Gastos', r.gastos, 'plata'],
        ['Mercancía que pagaste', r.mercancia, 'plata'],
        ['Devoluciones', r.devuelto, 'plata'],
        ['Plata que salió', r.salio, 'plata'],
        ['Ganancia en ventas', r.gananciaVentas, 'plata'],
        ['Margen promedio', (r.margen ?? 0) / 100, 'pct'],
        ['Ticket promedio', r.ticket ?? 0, 'plata'],
        ['Vendiste a crédito', (r.pctCredito ?? 0) / 100, 'pct'],
    ]
    if (b.inventario !== null) filas.push(['Plata en mercancía (hoy)', b.inventario, 'plata'])
    return filas
}

interface VentaFila {
    created_at: string; total: number; is_credit: boolean; customer_name: string | null; seller_name?: string | null
    sale_items: { quantity: number; unit_cost: number; products: { name: string } | null; combos: { name: string } | null }[]
    sale_payments: { amount: number; payment_methods: { name: string } | null }[]
}

async function ventasDelPeriodo(supabase: SupabaseClient, storeId: string, tramo: Tramo): Promise<VentaFila[]> {
    const base = 'created_at, total, is_credit, customer_name, sale_items(quantity, unit_cost, products(name), combos(name)), sale_payments(amount, payment_methods(name))'
    const filas: VentaFila[] = []
    for (let desde = 0; ; desde += 1000) {
        const pedir = (select: string) => {
            let q = supabase.from('sales').select(select).eq('store_id', storeId).order('created_at')
            if (tramo.from) q = q.gte('created_at', tramo.from)
            if (tramo.to) q = q.lte('created_at', tramo.to)
            return q.range(desde, desde + 999)
        }
        // seller_name existe desde el modo isla; si falta, se pide sin él
        let { data, error } = await pedir(`${base}, seller_name`)
        if (error) ({ data, error } = await pedir(base))
        if (error) throw error
        const pagina = (data ?? []) as unknown as VentaFila[]
        filas.push(...pagina)
        if (pagina.length < 1000) return filas
    }
}

export async function descargarExcel(b: Base & { supabase: SupabaseClient; storeId: string }) {
    const [{ default: writeXlsxFile }, ventas] = await Promise.all([
        import('write-excel-file/browser'),
        ventasDelPeriodo(b.supabase, b.storeId, b.tramo),
    ])
    const nombre = titulo(b.periodo, b.tramo)
    const negrita = { fontWeight: 'bold' as const }
    const plata = '#,##0'

    const resumen = [
        [{ value: `TOUL - ${nombre}`, ...negrita, fontSize: 14 }],
        [{ value: b.tienda }],
        [{ value: rangoTexto(b.tramo) }],
        [],
        ...filasResumen(b).map(([rotulo, valor, tipo]) => [
            { value: rotulo }, { value: valor, type: Number, format: tipo === 'pct' ? '0%' : plata },
        ]),
        [],
        [{ value: 'En qué gastaste', ...negrita }],
        ...b.actual.gastosPorCategoria.map(g => [{ value: g.categoria }, { value: Number(g.monto), type: Number, format: plata }]),
        [],
        [{ value: 'Qué te dejó más', ...negrita }, { value: 'Ganancia', ...negrita }, { value: 'Margen', ...negrita }],
        ...b.actual.productos.map(p => [
            { value: p.nombre }, { value: Number(p.ganancia), type: Number, format: plata },
            { value: Number(p.margen) / 100, type: Number, format: '0%' },
        ]),
        [],
        [{ value: 'Cómo te pagan', ...negrita }],
        ...b.actual.metodos.map(m => [{ value: m.nombre }, { value: Number(m.monto), type: Number, format: plata }]),
    ]

    const cabeza = ['Fecha', 'Cliente', 'Vendedor', 'Productos', 'Total', 'Costo', 'Ganancia', 'De contado', 'A crédito', 'Cómo pagó']
    const detalle = [
        cabeza.map(c => ({ value: c, ...negrita })),
        ...ventas.map(v => {
            const fecha = new Date(v.created_at)
            const costo = Math.round(v.sale_items.reduce((s, i) => s + Number(i.unit_cost) * Number(i.quantity), 0))
            const pagado = v.sale_payments.reduce((s, p) => s + Number(p.amount), 0)
            const contado = v.is_credit ? Math.min(pagado, Number(v.total)) : Number(v.total)
            return [
                // Excel no sabe de zonas horarias: se escribe la hora de aquí
                { value: new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000), type: Date, format: 'dd/mm/yyyy hh:mm' },
                { value: v.customer_name ?? '' },
                { value: v.seller_name ?? '' },
                { value: v.sale_items.map(i => `${i.quantity}× ${i.products?.name ?? i.combos?.name ?? 'Producto'}`).join(', ') },
                { value: Number(v.total), type: Number, format: plata },
                { value: costo, type: Number, format: plata },
                { value: Number(v.total) - costo, type: Number, format: plata },
                { value: Math.round(contado), type: Number, format: plata },
                { value: Math.round(Number(v.total) - contado), type: Number, format: plata },
                { value: v.sale_payments.map(p => `${p.payment_methods?.name ?? 'Pago'} ${formatPrecio(Number(p.amount))}`).join(', ') },
            ]
        }),
    ]

    await writeXlsxFile([
        { sheet: 'Resumen', data: resumen, columns: [{ width: 32 }, { width: 16 }, { width: 10 }] },
        { sheet: 'Ventas', data: detalle, stickyRowsCount: 1,
            columns: [{ width: 17 }, { width: 22 }, { width: 16 }, { width: 44 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 30 }] },
    ] as Parameters<typeof writeXlsxFile>[0]).toFile(`TOUL - ${nombre}.xlsx`)
}

/* El PDF va en papel blanco: los tokens de la app son para la pantalla
   oscura y no aplican aquí */
const PAPEL = { texto: '#141414', gris: '#6b6b6b', linea: '#e6e6e6', verde: '#1e9e44', rojo: '#d93025' }

/** Las fuentes del PDF no traen guiones largos ni el signo menos */
const limpio = (t: string) => t.replace(/[–—−]/g, '-').replace(/ /g, ' ')

export async function descargarPDF(b: Base) {
    const { jsPDF } = await import('jspdf')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const r = resumir(b.actual)
    const nombre = titulo(b.periodo, b.tramo)
    const ancho = 210, margen = 18, derecha = ancho - margen

    const texto = (t: string, x: number, y: number, tam: number, color: string, negrita = false, alinear: 'left' | 'right' | 'center' = 'left') => {
        doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(tam); doc.setTextColor(color)
        doc.text(limpio(t), x, y, { align: alinear })
    }
    /** Corta el texto con "..." para que quepa en `max` mm */
    const cortar = (t: string, max: number, tam: number) => {
        doc.setFontSize(tam)
        let x = limpio(t)
        if (doc.getTextWidth(x) <= max) return x
        while (x.length > 1 && doc.getTextWidth(x + '...') > max) x = x.slice(0, -1)
        return x + '...'
    }
    const linea = (y: number, x1 = margen, x2 = derecha) => { doc.setDrawColor(PAPEL.linea); doc.setLineWidth(0.3); doc.line(x1, y, x2, y) }
    const caja = (x: number, y: number, w: number, h: number, color: string) => {
        if (w <= 0 || h <= 0) return
        doc.setFillColor(color); doc.roundedRect(x, y, w, h, Math.min(0.8, w / 2, h / 2), Math.min(0.8, w / 2, h / 2), 'F')
    }

    // ── Encabezado ──
    texto('TOUL', margen, 20, 13, PAPEL.texto, true)
    doc.setFillColor(PAPEL.verde); doc.circle(margen + 14, 18.7, 1, 'F')
    texto(b.tienda, derecha, 20, 10, PAPEL.gris, false, 'right')
    texto(nombre, margen, 33, 20, PAPEL.texto, true)
    texto(rangoTexto(b.tramo), margen, 39.5, 10, PAPEL.gris)

    // ── Lo que ganaste ──
    texto(r.ganaste < 0 ? 'Perdiste' : 'Ganaste', margen, 52, 10, PAPEL.gris)
    texto(formatPrecio(Math.abs(r.ganaste)), margen, 63, 28, r.ganaste < 0 ? PAPEL.rojo : PAPEL.verde, true)
    let y = 70
    const antes = b.anterior ? resumir(b.anterior) : null
    const tendencia = antes ? porcentajeTendencia({ ahora: r.ganaste, antes: antes.ganaste, ventasAntes: antes.cantidad }) : null
    if (tendencia !== null) {
        const flecha = tendencia > 0 ? 'Sube' : tendencia < 0 ? 'Baja' : 'Igual'
        texto(`${flecha} ${Math.abs(tendencia)}% ${contraQue(b.periodo, b.tramo)}`, margen, y, 10, tendencia < 0 ? PAPEL.rojo : PAPEL.gris)
        y += 6
    }
    const desde = b.tramo.from ? new Date(b.tramo.from) : null
    const ritmo = desde ? proyeccion({ periodo: b.periodo, desde, ahora: new Date(), ganado: r.ganaste }) : null
    if (ritmo !== null && desde) {
        const cierra = b.periodo === 'week' ? 'la semana' : b.periodo === 'year' ? String(desde.getFullYear()) : desde.toLocaleDateString('es-CO', { month: 'long' })
        texto(`A este ritmo cierras ${cierra} ganando cerca de ${formatoCorto(ritmo)}`, margen, y, 10, PAPEL.gris)
        y += 6
    }

    // ── Los cuatro números ──
    y = Math.max(y, 76) + 2
    linea(y)
    const kpis: [string, string][] = [
        ['Margen promedio', r.margen === null ? '-' : `${r.margen}%`],
        ['Ticket promedio', r.ticket === null ? '-' : formatPrecio(r.ticket)],
        ['Vendiste a crédito', r.pctCredito === null ? '-' : `${r.pctCredito}%`],
        ['Plata en mercancía', b.inventario === null ? '-' : formatPrecio(b.inventario)],
    ]
    const col4 = (derecha - margen) / 4
    kpis.forEach(([rot, val], i) => {
        texto(rot, margen + i * col4, y + 8, 8.5, PAPEL.gris)
        texto(val, margen + i * col4, y + 15, 13, PAPEL.texto, true)
    })
    y += 21
    linea(y)
    const arriba = y + 10

    // ── Tu plata (izquierda) ──
    const izq = margen, anchoIzq = 80, finIzq = izq + anchoIzq
    y = arriba
    texto('Tu plata', izq, y, 13, PAPEL.texto, true); y += 7
    const fila = (rot: string, val: number, o: { sub?: boolean; total?: boolean; color?: string; nota?: string } = {}) => {
        if (o.total) { linea(y - 4.2, izq, finIzq); y += 1 }
        texto(rot, izq + (o.sub ? 4 : 0), y, o.sub ? 9 : 10, o.sub ? PAPEL.gris : PAPEL.texto, !!o.total)
        texto(formatPrecio(val), finIzq, y, 10, o.color ?? PAPEL.texto, !!o.total, 'right')
        if (o.nota) { y += 4; texto(o.nota, izq, y, 7.5, PAPEL.gris) }
        y += 6.2
    }
    texto('Entradas', izq, y, 8.5, PAPEL.gris); y += 5.5
    fila('Vendiste', r.vendiste)
    fila('De contado', r.contado, { sub: true })
    fila('A crédito', r.credito, { sub: true })
    fila('Abonos que te hicieron', r.abonos)
    fila('Plata que entró', r.entro, { total: true, color: PAPEL.verde, nota: 'De contado + abonos' })
    y += 3
    texto('Salidas', izq, y, 8.5, PAPEL.gris); y += 5.5
    fila('Gastos', r.gastos)
    fila('Mercancía que pagaste', r.mercancia)
    if (r.devuelto > 0) fila('Devoluciones', r.devuelto)
    fila('Plata que salió', r.salio, { total: true })
    const finIzquierda = y

    // ── De cada $100 y Mes a mes (derecha) ──
    const der = 112, anchoDer = derecha - der
    y = arriba
    texto('De cada $100 que vendiste', der, y, 13, PAPEL.texto, true); y += 6
    const cien = deCada100({ ventas: r.ventasNetas, costo: r.costoNeto, gastos: r.gastos })
    if (!cien) {
        texto('Sin ventas en este periodo', der, y + 2, 10, PAPEL.gris); y += 10
    } else {
        const tonos = { mercancia: '#d6d6d6', gastos: '#8f8f8f', quedo: PAPEL.verde }
        let x = der
        for (const k of ['mercancia', 'gastos', 'quedo'] as const) {
            const w = (cien.barra[k] / 100) * anchoDer
            caja(x, y, Math.max(w - 0.8, 0), 3, tonos[k])
            x += w
        }
        y += 9
        const leyenda: [string, number, string][] = [
            ['Se fue en mercancía', cien.mercancia, tonos.mercancia],
            ['Se fue en gastos', cien.gastos, tonos.gastos],
            ['Te quedó', cien.quedo, tonos.quedo],
        ]
        for (const [rot, val, color] of leyenda) {
            doc.setFillColor(color); doc.circle(der + 1.2, y - 1.2, 1.1, 'F')
            texto(rot, der + 4.5, y, 10, PAPEL.texto)
            texto(`$${val}`, derecha, y, 10, PAPEL.texto, true, 'right')
            y += 6.2
        }
        if (cien.perdida) { texto('Gastaste más de lo que te dejaron las ventas', der, y, 9.5, PAPEL.rojo); y += 6 }
    }

    y += 6
    texto('Mes a mes', der, y, 13, PAPEL.texto, true)
    doc.setFillColor('#d6d6d6'); doc.circle(derecha - 30, y - 1.3, 1, 'F'); texto('Ventas', derecha - 28, y - 0.2, 8, PAPEL.gris)
    doc.setFillColor(PAPEL.verde); doc.circle(derecha - 14.5, y - 1.3, 1, 'F'); texto('Ganancia', derecha, y - 0.2, 8, PAPEL.gris, false, 'right')
    y += 9
    if (b.meses.length === 0) {
        texto('Aún no hay ventas', der, y + 2, 10, PAPEL.gris); y += 8
    } else {
        const alto = 30
        const mayor = Math.max(...b.meses.map(m => Math.max(m.ventas, m.ganancia, 0)), 1)
        const paso = anchoDer / b.meses.length
        const barra = Math.min(paso * 0.62, 12)
        b.meses.forEach((m, i) => {
            const actual = i === b.meses.length - 1
            const cx = der + paso * i + paso / 2
            const hv = (Math.max(m.ventas, 0) / mayor) * alto
            const hg = (Math.max(m.ganancia, 0) / mayor) * alto
            caja(cx - barra / 2, y + alto - hv, barra, hv, actual ? '#cfcfcf' : '#ececec')
            caja(cx - barra * 0.18, y + alto - hg, barra * 0.36, hg, actual ? PAPEL.verde : '#8fd3a4')
            if (actual) texto(formatoCorto(m.ventas), cx, y + alto - hv - 1.8, 8, PAPEL.texto, true, 'center')
            const [ano, mes] = m.mes.split('-').map(Number)
            const nombreMes = new Date(ano, mes - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
            texto(nombreMes, cx, y + alto + 5, 8, actual ? PAPEL.texto : PAPEL.gris, actual, 'center')
        })
        y += alto + 8
    }

    // ── En qué gastaste, qué te dejó más y cómo te pagan ──
    y = Math.max(finIzquierda, y) + 4
    linea(y)
    y += 10
    const gap = 8, col3 = (derecha - margen - gap * 2) / 3
    const lista = (x: number, tit: string, filas: [string, string, number][]) => {
        let yy = y
        texto(tit, x, yy, 12, PAPEL.texto, true); yy += 7
        if (filas.length === 0) { texto('Nada en este periodo', x, yy, 9.5, PAPEL.gris); return }
        for (const [rot, sub, val] of filas.slice(0, 6)) {
            const monto = formatPrecio(val)
            doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5)
            const anchoMonto = doc.getTextWidth(monto) + 3
            doc.setFont('helvetica', 'normal')
            texto(cortar(rot, col3 - anchoMonto, 9.5), x, yy, 9.5, PAPEL.texto)
            texto(monto, x + col3, yy, 9.5, PAPEL.texto, true, 'right')
            if (sub) { texto(sub, x, yy + 3.8, 7.5, PAPEL.gris); yy += 3.8 }
            yy += 6
        }
    }
    const categoria = (c: string) => c.charAt(0).toUpperCase() + c.slice(1)
    lista(margen, 'En qué gastaste', b.actual.gastosPorCategoria.map(g => [categoria(g.categoria), '', Number(g.monto)]))
    lista(margen + col3 + gap, 'Qué te dejó más',
        b.actual.productos.map(p => [p.nombre, `${Math.round(Number(p.margen))}% de margen`, Number(p.ganancia)]))
    const total = b.actual.metodos.reduce((s, m) => s + Number(m.monto), 0)
    lista(margen + (col3 + gap) * 2, 'Cómo te pagan',
        b.actual.metodos.map(m => [m.nombre, total > 0 ? `${Math.round((Number(m.monto) / total) * 100)}%` : '', Number(m.monto)]))

    const ahora = new Date().toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    texto(`Generado con TOUL el ${ahora}`, margen, 289, 8, PAPEL.gris)
    doc.save(`TOUL - ${nombre}.pdf`)
}
