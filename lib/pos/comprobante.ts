/* ══════════════════════════════════════════════════════════════
   Comprobante por WhatsApp: el mensaje con la venta y el enlace para
   mandarlo. Sin dependencias: se prueba con node --test.
   ══════════════════════════════════════════════════════════════ */

// Sin importar nada: así lo carga igual Next que node --test
const soloDigitos = (texto: string | null | undefined) => (texto ?? '').replace(/\D/g, '')

export interface DatosComprobante {
    tienda: string
    /** Hora de la venta (ISO) */
    fecha: string
    items: { nombre: string; cantidad: number; valor: number }[]
    subtotal: number
    descuento: number
    total: number
    pagos: { metodo: string; monto: number }[]
    /** Efectivo que entregó el cliente y lo que se le devolvió */
    recibido?: number | null
    vuelto?: number | null
    /** Fiado: lo que pagó al llevarse la mercancía y lo que queda */
    fiado?: { abono: number; debe: number } | null
    cliente?: string | null
    mensajeFinal?: string | null
}

const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

/** La hora va en la de Colombia, sin importar dónde esté el equipo */
const fechaLegible = (iso: string) => new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(iso))

export function mensajeComprobante(d: DatosComprobante): string {
    const lineas: string[] = []
    lineas.push(`*${d.tienda}*`)
    lineas.push(`Comprobante de venta · ${fechaLegible(d.fecha)}`)
    if (d.cliente) lineas.push(`Cliente: ${d.cliente}`)
    lineas.push('')
    for (const i of d.items) lineas.push(`${i.cantidad} × ${i.nombre} — ${pesos(i.valor)}`)
    lineas.push('')
    if (d.descuento > 0) {
        lineas.push(`Subtotal: ${pesos(d.subtotal)}`)
        lineas.push(`Descuento: −${pesos(d.descuento)}`)
    }
    lineas.push(`*Total: ${pesos(d.total)}*`)

    const pagos = d.pagos.filter(p => p.monto > 0)
    if (pagos.length > 0) {
        lineas.push(`${d.fiado ? 'Abono con' : 'Pagó con'}: ${pagos.map(p => pagos.length > 1 ? `${p.metodo} ${pesos(p.monto)}` : p.metodo).join(', ')}`)
    }
    if (d.vuelto && d.vuelto > 0 && d.recibido) {
        lineas.push(`Recibido en efectivo: ${pesos(d.recibido)} · Cambio: ${pesos(d.vuelto)}`)
    }
    if (d.fiado) {
        lineas.push(`Abono: ${pesos(d.fiado.abono)}`)
        lineas.push(`*Saldo pendiente: ${pesos(d.fiado.debe)}*`)
    }
    if (d.mensajeFinal?.trim()) {
        lineas.push('')
        lineas.push(d.mensajeFinal.trim())
    }
    return lineas.join('\n')
}

/** Número con indicativo para WhatsApp. Un celular de 10 dígitos es de Colombia */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
    const d = soloDigitos(telefono)
    if (d.length === 10 && d.startsWith('3')) return '57' + d
    if (d.length >= 11 && d.length <= 15) return d
    return null
}

/** Enlace directo al chat del cliente, o null si no tiene un número que sirva */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje: string): string | null {
    const numero = telefonoWhatsApp(telefono)
    return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null
}

/** El primer nombre del cliente ("Andrés Pérez" → "Andrés") */
export function primerNombre(cliente: string | null | undefined): string {
    return cliente?.trim().split(/\s+/)[0] ?? ''
}

/** El botón principal del comprobante: con el celular del cliente va
 *  directo a su chat y lo dice con su primer nombre; si no, null */
export function textoEnviarA(cliente: string | null | undefined, telefono: string | null | undefined): string | null {
    const nombre = primerNombre(cliente)
    return nombre && telefonoWhatsApp(telefono) ? `Enviar a ${nombre}` : null
}

/** "#FD4F7E4C": el mismo número corto que muestra Ventas */
export function codigoVenta(id: string): string {
    return '#' + id.replace(/-/g, '').slice(0, 8).toUpperCase()
}

/* ── Lo vendido en la caja, para Inicio ───────────────────────────
   Al salir de la caja, "Vendiste" sube desde lo que había hasta lo
   nuevo, con un "+$X" al lado. La caja suma cada venta que entró al
   servidor (y resta la que se deshace); Inicio lo toma una vez.
   Solo vale un rato: si se vuelve a Inicio mucho después, no se anima. */
const CLAVE_RECIENTE = 'toul:vendido-en-caja'
const VIGENCIA_RECIENTE_MS = 30 * 60_000

interface VendidoEnCaja { storeId: string; monto: number; hasta: number }

function leerReciente(): VendidoEnCaja | null {
    try {
        const v = JSON.parse(sessionStorage.getItem(CLAVE_RECIENTE) ?? 'null') as VendidoEnCaja | null
        return v && typeof v.monto === 'number' && typeof v.storeId === 'string' ? v : null
    } catch { return null }
}

/** La caja suma una venta (o resta, con un monto negativo, la que se deshizo) */
export function sumarVendidoEnCaja(storeId: string, monto: number, ahora = Date.now()) {
    const previo = leerReciente()
    const vigente = previo && previo.storeId === storeId && previo.hasta > ahora ? previo.monto : 0
    const total = Math.max(0, Math.round(vigente + monto))
    try {
        if (total > 0) sessionStorage.setItem(CLAVE_RECIENTE, JSON.stringify({ storeId, monto: total, hasta: ahora + VIGENCIA_RECIENTE_MS }))
        else sessionStorage.removeItem(CLAVE_RECIENTE)
    } catch { /* sin almacenamiento: Inicio no anima, nada más */ }
}

/** Inicio: lo vendido en la caja desde la última vez (0 si nada). No lo borra */
export function verVendidoEnCaja(storeId: string, ahora = Date.now()): number {
    const v = leerReciente()
    return v && v.storeId === storeId && v.hasta > ahora ? v.monto : 0
}

/** Inicio ya lo mostró */
export function olvidarVendidoEnCaja() {
    try { sessionStorage.removeItem(CLAVE_RECIENTE) } catch { /* nada */ }
}

/* ── Tirilla automática ────────────────────────────────────────────
   Cada equipo decide en el menú de la caja. Si nunca eligió: prendida
   en el computador, apagada en el celular (ahí casi nunca hay
   impresora). En el plan Básico no hay tirilla: eso lo decide la caja. */
export function tirillaAutomaticaInicial(guardado: string | null, esCelular: boolean): boolean {
    return guardado !== null ? guardado === '1' : !esCelular
}

/* La tirilla automática sale cuando "Venta registrada" ya terminó de
   aparecer. El cuadro de imprimir detiene la página: si llega a mitad
   de la animación, la caja se queda a medias hasta cambiar de pestaña.
   Con la caja en otra pestaña, espera a que vuelva a verse. */
export const ESPERA_TIRILLA_MS = 900

interface Pagina {
    visibilityState: string
    addEventListener(tipo: 'visibilitychange', fn: () => void): void
    removeEventListener(tipo: 'visibilitychange', fn: () => void): void
}

export function cuandoSeVea(ms = ESPERA_TIRILLA_MS, pagina: Pagina = document): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            if (pagina.visibilityState === 'visible') { resolve(); return }
            const alVolver = () => {
                if (pagina.visibilityState !== 'visible') return
                pagina.removeEventListener('visibilitychange', alVolver)
                setTimeout(resolve, ms)
            }
            pagina.addEventListener('visibilitychange', alVolver)
        }, ms)
    })
}
