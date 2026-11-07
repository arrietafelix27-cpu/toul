'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatCOP } from '@/lib/utils'
import type { ReceiptData } from './types'
import { ZONA_COLOMBIA } from '@/lib/periodos'

const escape = (value: string) =>
    value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function receiptHtml(r: ReceiptData): string {
    const date = new Date(r.createdAt).toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA,
    })
    const line = (left: string, right: string, strong = false) =>
        `<div class="row${strong ? ' strong' : ''}"><span>${left}</span><span>${right}</span></div>`

    const items = r.items.map(i => `
        <div class="item">
            <div class="item-name">${escape(i.name)}</div>
            ${line(`${i.quantity} x ${formatCOP(i.unitPrice)}`, formatCOP(i.quantity * i.unitPrice))}
        </div>`).join('')

    const payments = r.payments.filter(p => p.amount > 0).map(p => line(escape(p.method), formatCOP(p.amount))).join('')
    const pending = r.isCredit ? Math.max(0, r.total - (r.initialPayment ?? r.payments.reduce((s, p) => s + p.amount, 0))) : 0

    return `<!doctype html><html><head><meta charset="utf-8"><title>Tirilla</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; width: 80mm; padding: 4mm 5mm 8mm; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.35; color: #000; background: #fff; }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .muted { font-size: 11px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row span:last-child { white-space: nowrap; }
  .strong { font-weight: 700; font-size: 15px; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: 700; }
  .legal { font-size: 10px; margin-top: 8px; }
</style></head><body>
  <div class="center">
    <div class="store">${escape(r.storeName)}</div>
    ${r.nit ? `<div class="muted">NIT ${escape(r.nit)}</div>` : ''}
    ${r.address ? `<div class="muted">${escape(r.address)}</div>` : ''}
    ${r.phone ? `<div class="muted">Tel. ${escape(r.phone)}</div>` : ''}
  </div>
  <div class="sep"></div>
  ${line('Fecha', date)}
  ${line('Venta', '#' + r.saleId.slice(0, 8).toUpperCase())}
  ${r.sellerName ? line('Vendedor', escape(r.sellerName)) : ''}
  ${r.customerName ? line('Cliente', escape(r.customerName)) : ''}
  <div class="sep"></div>
  ${items}
  <div class="sep"></div>
  ${line('Subtotal', formatCOP(r.subtotal))}
  ${r.discount > 0 ? line('Descuento', '-' + formatCOP(r.discount)) : ''}
  ${line('TOTAL', formatCOP(r.total), true)}
  <div class="sep"></div>
  ${r.isCredit ? line('Venta a crédito', '') : ''}
  ${payments}
  ${r.change && r.change > 0 && r.cashReceived ? line('Recibido en efectivo', formatCOP(r.cashReceived)) + line('Vuelto', formatCOP(r.change)) : ''}
  ${r.isCredit ? line('Saldo pendiente', formatCOP(pending), true) : ''}
  <div class="sep"></div>
  <div class="center">${escape(r.footer || '¡Gracias por tu compra!')}</div>
  <div class="center legal">Este documento no es una factura electrónica.<br>Si la necesitas, solicítala al vendedor.</div>
</body></html>`
}

/* ── Imprimir sin trabar la caja ─────────────────────────────────
   La tirilla se arma en un iframe fuera de la pantalla y se imprime
   cuando terminó de cargar. Tiene tamaño real: oculto o en 0×0, hay
   navegadores que la imprimen en blanco o dejan la página quieta.
   Al cerrar el cuadro de imprimir, el teclado vuelve a la caja (si no,
   Enter le llega a la tirilla). El iframe no se quita al terminar: en
   algunos navegadores "terminó" llega con el cuadro todavía abierto, y
   quitarlo ahí lo traba. Se cambia por el de la siguiente tirilla. */

let tirillaAnterior: HTMLIFrameElement | null = null

/** Imprime la tirilla sin tocar la pantalla de la caja */
export function printReceipt(data: ReceiptData) {
    imprimirHtml(receiptHtml(data), 'Tirilla')
}

function imprimirHtml(html: string, titulo: string) {
    if (typeof document === 'undefined') return
    // Una tirilla a la vez: la anterior ya se imprimió o se canceló
    tirillaAnterior?.remove()

    const iframe = document.createElement('iframe')
    tirillaAnterior = iframe
    iframe.setAttribute('aria-hidden', 'true')
    iframe.tabIndex = -1
    iframe.title = titulo
    iframe.style.cssText = 'position:fixed;top:0;left:-10000px;width:80mm;height:600px;border:0;pointer-events:none;'

    const devolverControl = () => {
        if (document.activeElement === iframe) iframe.blur()
        try { window.focus() } catch { /* sin foco */ }
    }

    let impresa = false
    const imprimir = () => {
        if (impresa || !iframe.isConnected) return
        impresa = true
        const w = iframe.contentWindow
        if (!w) return
        w.addEventListener('afterprint', devolverControl)
        try {
            w.focus()
            w.print()
        } catch { /* el navegador no dejó imprimir: la caja sigue igual */ }
        devolverControl()
        // Donde el cuadro no detiene la página, el foco vuelve a la tirilla al cerrarlo
        w.addEventListener('focus', () => setTimeout(devolverControl, 0))
    }

    iframe.addEventListener('load', () => setTimeout(imprimir, 30), { once: true })
    iframe.srcdoc = html
    document.body.appendChild(iframe)
    // Por si "cargó" nunca llega
    setTimeout(imprimir, 2500)
}

interface SaleRow {
    id: string
    created_at: string
    subtotal: number
    discount: number
    total: number
    is_credit: boolean
    initial_payment: number | null
    cash_received?: number | null
    change_given?: number | null
    customer_name: string | null
    seller_name: string | null
    sale_items: {
        quantity: number
        unit_price: number
        products: { name: string } | null
        product_variants: { name: string } | null
        combos: { name: string } | null
    }[]
    sale_payments: { amount: number; payment_methods: { name: string } | null }[]
}

/** Arma los datos de la tirilla desde la base de datos (para reimprimir). */
export async function loadReceiptData(supabase: SupabaseClient, saleId: string): Promise<ReceiptData> {
    const { data: sale, error } = await supabase
        .from('sales')
        // Con * entran también lo recibido y el vuelto cuando la base ya los tiene
        .select(`*,
            sale_items(quantity, unit_price, products(name), product_variants(name), combos(name)),
            sale_payments(amount, payment_methods(name))`)
        .eq('id', saleId)
        .single()
    if (error || !sale) throw new Error('No se encontró la venta')

    const { data: store } = await supabase.from('stores').select('*').eq('id', (sale as { store_id: string }).store_id).single()
    const row = sale as unknown as SaleRow

    return {
        saleId: row.id,
        createdAt: row.created_at,
        storeName: store?.name ?? 'TOUL',
        nit: store?.nit ?? null,
        address: store?.address ?? null,
        phone: store?.phone ?? null,
        footer: store?.receipt_footer ?? null,
        sellerName: row.seller_name,
        customerName: row.customer_name,
        items: row.sale_items.map(i => ({
            name: i.combos?.name
                ?? [i.products?.name ?? 'Producto', i.product_variants?.name].filter(Boolean).join(' · '),
            quantity: Number(i.quantity),
            unitPrice: Number(i.unit_price),
        })),
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        total: Number(row.total),
        payments: row.sale_payments.map(p => ({ method: p.payment_methods?.name ?? 'Pago', amount: Number(p.amount) })),
        isCredit: row.is_credit,
        initialPayment: Number(row.initial_payment ?? 0),
        cashReceived: row.cash_received == null ? null : Number(row.cash_received),
        change: row.change_given == null ? null : Number(row.change_given),
    }
}

/** Imprime el cierre de turno (comprobante físico para el administrador). */
export function printCashClose(meta: { storeName: string; openedBy: string; openedAt: string; closedAt: string }, s: import('./types').CashSessionSummary) {
    const fmt = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA })
    const line = (l: string, r: string, strong = false) => `<div class="row${strong ? ' strong' : ''}"><span>${l}</span><span>${r}</span></div>`
    const diff = Math.round(s.difference ?? 0)
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Cierre</title><style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; width: 80mm; padding: 4mm 5mm 8mm; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.35; color: #000; }
  .center { text-align: center; } .title { font-size: 15px; font-weight: 700; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; } .strong { font-weight: 700; font-size: 14px; }
  .sign { margin-top: 28px; border-top: 1px solid #000; padding-top: 2px; text-align: center; font-size: 11px; }
</style></head><body>
  <div class="center title">${escape(meta.storeName)}</div>
  <div class="center">CIERRE DE TURNO</div>
  <div class="sep"></div>
  ${line('Responsable', escape(meta.openedBy))}
  ${line('Apertura', fmt(meta.openedAt))}
  ${line('Cierre', fmt(meta.closedAt))}
  <div class="sep"></div>
  ${line('Base', formatCOP(s.openingCash))}
  ${line('Esperado', formatCOP(s.expectedCash))}
  ${line('Contado', formatCOP(s.countedCash ?? 0))}
  ${line(diff === 0 ? 'Cuadra' : diff < 0 ? 'FALTANTE' : 'SOBRANTE', formatCOP(Math.abs(diff)), true)}
  <div class="sep"></div>
  ${s.byMethod.map(m => line(escape(m.method), formatCOP(m.net))).join('')}
  <div class="sep"></div>
  ${line(`Ventas (${s.salesCount})`, formatCOP(s.salesTotal), true)}
  ${s.discountCount ? line(`Descuentos (${s.discountCount})`, '-' + formatCOP(s.discountTotal)) : ''}
  ${s.creditCount ? line('A crédito', String(s.creditCount)) : ''}
  ${s.voidCount ? line(`Anuladas (${s.voidCount})`, formatCOP(s.voidTotal)) : ''}
  ${s.returnCount ? line(`Devoluciones (${s.returnCount})`, `-${formatCOP(s.returnTotal ?? 0)}`) : ''}
  ${s.changeCount ? line(`Vueltos entregados (${s.changeCount})`, formatCOP(s.changeTotal ?? 0)) : ''}
  <div class="sign">Firma responsable</div>
</body></html>`
    imprimirHtml(html, 'Cierre de caja')
}
