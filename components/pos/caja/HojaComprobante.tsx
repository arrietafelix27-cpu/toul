'use client'

import { useCallback, useMemo, useState } from 'react'
import { BotonFantasma, BotonPrincipal, BotonSecundario, Hoja, IcoCompartir, IcoImpresora, avisar } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import type { VentaHecha } from '@/lib/pos/useCobro'
import { codigoVenta, textoEnviarA } from '@/lib/pos/comprobante'
import { nombreMetodo } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import { fechaCorta } from './HojaFecha'

/* ══════════════════════════════════════════════════════════════
   Comprobante de venta (SPEC §8). Nunca se llama "factura": la
   factura electrónica de la DIAN es otro documento.
   En la hoja se ve el papel; para compartirlo se dibuja el mismo
   papel en una imagen (y en PDF), con los colores de TOUL.
   ══════════════════════════════════════════════════════════════ */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const PEQUEÑAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e'])
const PIE = 'Gracias por tu compra · No es factura electrónica · Hecho con'

/** "18 nov 2026 · 9:24 a. m.", en la hora de Colombia (no cambia de horario) */
function fechaHora(iso: string): string {
    const d = new Date(Date.parse(iso) - 5 * 3600_000)
    const h = d.getUTCHours()
    const m = String(d.getUTCMinutes()).padStart(2, '0')
    return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${h % 12 || 12}:${m} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** "Tienda de perfumes" → "TP" */
function iniciales(nombre: string): string {
    const p = nombre.trim().split(/\s+/).filter(w => w && !PEQUEÑAS.has(w.toLowerCase()))
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || 'T'
}

export interface Papel {
    tienda: string
    iniciales: string
    codigo: string
    meta: string
    lineas: { texto: string; valor: string }[]
    filas: { texto: string; valor: string }[]
    total: string
}

/** Lo que dice el papel: lo mismo en la hoja, en la imagen y en el PDF */
export function papelDe(venta: VentaHecha, tienda: string): Papel {
    const pagos = venta.payments.filter(p => p.amount > 0)
    const filas: Papel['filas'] = []
    if (venta.discount > 0) filas.push({ texto: 'Descuento', valor: `−${formatCOP(Math.round(venta.discount))}` })
    if (venta.isCredit) {
        filas.push({ texto: 'Fecha de pago', valor: venta.fechaPago ? fechaCorta(venta.fechaPago) : 'Sin fecha' })
        if (venta.abono > 0) {
            filas.push({
                texto: pagos.length === 1 ? `Abono · ${nombreMetodo(pagos[0].methodName)}` : 'Abono',
                valor: formatCOP(Math.round(venta.abono)),
            })
        }
        filas.push({ texto: 'Saldo pendiente', valor: formatCOP(Math.round(venta.debe)) })
    } else if (Math.round(venta.total) <= 0) {
        filas.push({ texto: 'Método de pago', valor: 'Sin cobro' })
    } else {
        if (pagos.length === 1) filas.push({ texto: 'Método de pago', valor: nombreMetodo(pagos[0].methodName) })
        else pagos.forEach(p => filas.push({ texto: nombreMetodo(p.methodName), valor: formatCOP(Math.round(p.amount)) }))
        if (venta.change > 0 && venta.cashReceived !== null) {
            filas.push({ texto: 'Recibido en efectivo', valor: formatCOP(Math.round(venta.cashReceived)) })
            filas.push({ texto: 'Cambio', valor: formatCOP(Math.round(venta.change)) })
        }
    }
    return {
        tienda,
        iniciales: iniciales(tienda),
        codigo: codigoVenta(venta.saleId ?? venta.clientSaleId),
        meta: fechaHora(venta.soldAt) + (venta.customerName ? ` · Cliente: ${venta.customerName}` : ''),
        lineas: venta.items.map(i => ({
            texto: `${i.quantity} × ${i.product.name}${i.variantName ? ` · ${i.variantName}` : ''}`,
            valor: formatCOP(Math.round((i.unitPrice ?? i.product.sale_price) * i.quantity)),
        })),
        filas,
        total: formatCOP(Math.round(venta.total)),
    }
}

/* ── El papel en una imagen ─────────────────────────────────────
   Dibujado a mano en un canvas (no una foto de la pantalla): sale
   nítido y con los colores de globals.css leídos en vivo. */
const ANCHO = 360
const ESCALA = 3

function token(nombre: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim()
}

/** Recorta un texto con "…" para que quepa */
function recortar(c: CanvasRenderingContext2D, texto: string, max: number): string {
    if (c.measureText(texto).width <= max) return texto
    let t = texto
    while (t.length > 1 && c.measureText(t + '…').width > max) t = t.slice(0, -1)
    return t + '…'
}

async function dibujarPapel(p: Papel): Promise<HTMLCanvasElement> {
    await document.fonts?.ready
    const papel = token('--toul-text') || 'white'
    const tinta = token('--toul-bg') || 'black'
    const verde = token('--toul-accent') || 'green'
    const fuente = getComputedStyle(document.body).fontFamily
    const f = (peso: number, px: number) => `${peso} ${px}px ${fuente}`
    const M = 22
    const dentro = ANCHO - M * 2

    // Alto: cabecera, meta, líneas, filas, total y pie
    const alto = M + 40 + 14 + 18 + 10 + p.lineas.length * 30 + p.filas.length * 24 + 14 + 30 + 18 + 24 + M

    const canvas = document.createElement('canvas')
    canvas.width = ANCHO * ESCALA
    canvas.height = alto * ESCALA
    const c = canvas.getContext('2d')!
    c.scale(ESCALA, ESCALA)
    c.fillStyle = papel
    c.fillRect(0, 0, ANCHO, alto)
    c.textBaseline = 'middle'

    // Cabecera: las iniciales en su cuadro, el nombre y el número
    let y = M
    c.fillStyle = tinta
    c.beginPath()
    c.roundRect(M, y, 40, 40, 12)
    c.fill()
    c.fillStyle = verde
    c.font = f(800, 15)
    c.textAlign = 'center'
    c.fillText(p.iniciales, M + 20, y + 21)
    c.textAlign = 'left'
    c.fillStyle = tinta
    c.font = f(700, 17)
    c.fillText(recortar(c, p.tienda, dentro - 52), M + 52, y + 12)
    c.globalAlpha = 0.58
    c.font = f(400, 12.5)
    c.fillText(`Comprobante de venta · ${p.codigo}`, M + 52, y + 30)
    y += 40 + 14

    c.fillText(recortar(c, p.meta, dentro), M, y + 9)
    c.globalAlpha = 1
    y += 18 + 10

    const par = (izq: string, der: string, alto: number, fIzq: string, fDer: string) => {
        c.font = fDer
        c.textAlign = 'right'
        const anchoDer = c.measureText(der).width
        c.fillText(der, ANCHO - M, y + alto / 2)
        c.font = fIzq
        c.textAlign = 'left'
        c.fillText(recortar(c, izq, dentro - anchoDer - 14), M, y + alto / 2)
    }

    // Los productos, separados por una línea punteada
    for (const l of p.lineas) {
        par(l.texto, l.valor, 30, f(400, 14.5), f(650, 14.5))
        y += 30
        c.save()
        c.globalAlpha = 0.16
        c.strokeStyle = tinta
        c.setLineDash([4, 4])
        c.beginPath()
        c.moveTo(M, y - 0.5)
        c.lineTo(ANCHO - M, y - 0.5)
        c.stroke()
        c.restore()
    }

    // Descuento, método, abono…
    c.globalAlpha = 0.72
    y += 4
    for (const r of p.filas) { par(r.texto, r.valor, 24, f(400, 13.5), f(400, 13.5)); y += 24 }
    c.globalAlpha = 1
    y += 10

    // Total
    c.font = f(800, 19)
    c.fillText('Total', M, y + 15)
    c.textAlign = 'right'
    c.fillText(p.total, ANCHO - M, y + 15)
    c.textAlign = 'center'
    y += 30 + 18

    // Pie, con TOUL en verde
    const marca = ' TOUL'
    c.font = f(700, 10.5)
    const anchoMarca = c.measureText(marca).width
    c.font = f(400, 10.5)
    const anchoPie = c.measureText(PIE).width
    if (anchoPie + anchoMarca <= dentro) {
        const x0 = ANCHO / 2 - (anchoPie + anchoMarca) / 2
        c.textAlign = 'left'
        c.globalAlpha = 0.46
        c.fillText(PIE, x0, y + 8)
        c.globalAlpha = 1
        c.font = f(700, 10.5)
        c.fillStyle = verde
        c.fillText(marca, x0 + anchoPie, y + 8)
    } else {
        c.globalAlpha = 0.46
        c.fillText(PIE, ANCHO / 2, y + 2)
        c.globalAlpha = 1
        c.font = f(700, 10.5)
        c.fillStyle = verde
        c.fillText('TOUL', ANCHO / 2, y + 17)
    }
    return canvas
}

const aBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((ok, mal) => canvas.toBlob(b => (b ? ok(b) : mal(new Error('sin imagen'))), 'image/png'))

/** Lo comparte el menú del equipo; si no puede con archivos, lo descarga */
async function compartirArchivo(archivo: File) {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (typeof nav.share === 'function' && nav.canShare?.({ files: [archivo] })) {
        try {
            await nav.share({ files: [archivo], title: 'Comprobante de venta' })
        } catch (e) {
            // Cerrar el menú no es un error
            if ((e as Error)?.name !== 'AbortError') throw e
        }
        return
    }
    const url = URL.createObjectURL(archivo)
    const a = document.createElement('a')
    a.href = url
    a.download = archivo.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function HojaComprobante({ abierta, onCerrar, venta, tienda, onEnviarWhatsApp, conTirilla, onImprimir, imprimiendo }: {
    abierta: boolean
    onCerrar: () => void
    venta: VentaHecha
    tienda: string
    /** Al chat del cliente (con su celular) */
    onEnviarWhatsApp: () => void
    /** La tienda imprime tirilla */
    conTirilla: boolean
    onImprimir: () => void
    imprimiendo: boolean
}) {
    const p = useMemo(() => papelDe(venta, tienda), [venta, tienda])
    const enviarA = textoEnviarA(venta.customerName, venta.customerPhone)
    const [haciendo, setHaciendo] = useState<'imagen' | 'pdf' | null>(null)
    const nombre = `comprobante-${p.codigo.slice(1)}`

    const imagen = useCallback(async () => {
        if (haciendo) return
        setHaciendo('imagen')
        try {
            const blob = await aBlob(await dibujarPapel(p))
            await compartirArchivo(new File([blob], `${nombre}.png`, { type: 'image/png' }))
        } catch {
            avisar('No se pudo preparar la imagen', 'aviso')
        } finally {
            setHaciendo(null)
        }
    }, [haciendo, p, nombre])

    const pdf = useCallback(async () => {
        if (haciendo) return
        setHaciendo('pdf')
        try {
            const [{ jsPDF }, canvas] = await Promise.all([import('jspdf'), dibujarPapel(p)])
            // En puntos, del tamaño exacto del papel
            const w = (canvas.width / ESCALA) * 0.75
            const h = (canvas.height / ESCALA) * 0.75
            const doc = new jsPDF({ unit: 'pt', format: [w, h], orientation: h >= w ? 'portrait' : 'landscape' })
            // En JPEG: el PDF queda liviano (el PNG sin comprimir pesaba 2,6 MB)
            doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h)
            const blob = doc.output('blob')
            await compartirArchivo(new File([blob], `${nombre}.pdf`, { type: 'application/pdf' }))
        } catch {
            avisar('No se pudo preparar el PDF', 'aviso')
        } finally {
            setHaciendo(null)
        }
    }, [haciendo, p, nombre])

    return (
        <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Comprobante"
            pie={<>
                <div className={s.comprobanteBotones}>
                    <BotonSecundario onClick={() => void pdf()} disabled={!!haciendo}>
                        {haciendo === 'pdf' ? 'Preparando…' : 'PDF'}
                    </BotonSecundario>
                    {enviarA ? (
                        <BotonPrincipal onClick={onEnviarWhatsApp}>{enviarA}</BotonPrincipal>
                    ) : (
                        <BotonPrincipal onClick={() => void imagen()} disabled={!!haciendo}>
                            {haciendo === 'imagen' ? 'Preparando…' : 'Compartir imagen'}
                        </BotonPrincipal>
                    )}
                </div>
                {(enviarA || conTirilla) && (
                    <div className={s.comprobanteOtros}>
                        {enviarA && (
                            <BotonFantasma onClick={() => void imagen()} disabled={!!haciendo}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <IcoCompartir size={14} />{haciendo === 'imagen' ? 'Preparando…' : 'Compartir imagen'}
                                </span>
                            </BotonFantasma>
                        )}
                        {conTirilla && (
                            <BotonFantasma onClick={onImprimir} disabled={imprimiendo}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <IcoImpresora size={14} />{imprimiendo ? 'Preparando la tirilla…' : 'Imprimir tirilla'}
                                </span>
                            </BotonFantasma>
                        )}
                    </div>
                )}
            </>}>
            <div className={s.papel} aria-label={`Comprobante de venta ${p.codigo}`}>
                <div className={s.papelCabeza}>
                    <div className={s.papelLogo} aria-hidden="true">{p.iniciales}</div>
                    <div style={{ minWidth: 0 }}>
                        <div className={s.papelTienda}>{p.tienda}</div>
                        <div className={s.papelGris}>Comprobante de venta · {p.codigo}</div>
                    </div>
                </div>
                <div className={`${s.papelGris} ${s.papelMeta}`}>{p.meta}</div>
                {p.lineas.map((l, i) => (
                    <div key={i} className={s.papelLinea}><span>{l.texto}</span><span>{l.valor}</span></div>
                ))}
                {p.filas.map((r, i) => (
                    <div key={i} className={s.papelFila}><span>{r.texto}</span><span>{r.valor}</span></div>
                ))}
                <div className={s.papelTotal}><span>Total</span><span>{p.total}</span></div>
                <div className={s.papelPie}>{PIE} <b>TOUL</b></div>
            </div>
        </Hoja>
    )
}
