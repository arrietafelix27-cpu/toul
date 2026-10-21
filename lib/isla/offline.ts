'use client'

import type { ReceiptData } from './types'

/**
 * Ventas sin internet.
 *
 * Si la caja se queda sin señal, la venta se guarda en el computador y se
 * envía sola cuando vuelve. El servidor identifica cada venta por
 * `clientSaleId`, así que reintentar NUNCA duplica una venta.
 */

/* Cada tienda tiene su propia cola. Antes había una sola para todo el
   equipo: si una tienda dejaba ventas sin cargar y entraba otra, la
   segunda las veía —con clientes y totales— e intentaba cargarlas. */
const QUEUE_PREFIX = 'toul-pending-sales:'
const STORE_PREFIX = 'toul-store-info:'

/** Las llaves de antes, sin dueño */
const LEGACY_QUEUE = 'toul-pending-sales'
const LEGACY_STORE = 'toul-store-info'

export interface PendingSale {
    clientSaleId: string
    soldAt: string
    total: number
    body: Record<string, unknown>
    receipt: ReceiptData
    status: 'pending' | 'failed'
    error?: string
    attempts: number
}

export interface CachedStoreInfo {
    name: string
    nit: string | null
    address: string | null
    phone: string | null
    receipt_footer: string | null
}

// ─── Almacenamiento local ─────────────────────────────────────
function readRaw(storeId: string): PendingSale[] {
    try {
        const raw = localStorage.getItem(QUEUE_PREFIX + storeId)
        return raw ? (JSON.parse(raw) as PendingSale[]) : []
    } catch {
        return []
    }
}

function write(storeId: string | null | undefined, sales: PendingSale[]): boolean {
    if (!storeId) return false // sin tienda no hay dónde guardarla: la caja avisa
    try {
        localStorage.setItem(QUEUE_PREFIX + storeId, JSON.stringify(sales))
        return true
    } catch {
        return false // almacenamiento lleno o bloqueado
    }
}

/**
 * Las ventas que quedaron guardadas antes de que la cola tuviera
 * dueño las adopta la primera tienda que abre la caja en este
 * equipo: es la misma que las habría cargado antes de este cambio.
 * Solo se borran de la llave vieja si quedaron guardadas en la nueva.
 */
function adoptarLasDeAntes(storeId: string) {
    try {
        const raw = localStorage.getItem(LEGACY_QUEUE)
        if (raw) {
            const viejas = JSON.parse(raw) as PendingSale[]
            if (Array.isArray(viejas) && viejas.length > 0) {
                const actuales = readRaw(storeId)
                const ya = new Set(actuales.map(s => s.clientSaleId))
                const juntas = [...actuales, ...viejas.filter(s => !ya.has(s.clientSaleId))]
                if (!write(storeId, juntas)) return
            }
            localStorage.removeItem(LEGACY_QUEUE)
        }
        // El encabezado de la tirilla se vuelve a guardar al abrir la caja
        localStorage.removeItem(LEGACY_STORE)
    } catch { /* almacenamiento bloqueado */ }
}

function read(storeId: string | null | undefined): PendingSale[] {
    if (!storeId) return []
    adoptarLasDeAntes(storeId)
    return readRaw(storeId)
}

export function listPendingSales(storeId: string | null | undefined): PendingSale[] {
    return read(storeId)
}

/**
 * Guarda la venta en el computador. Devuelve false si NO se pudo guardar:
 * en ese caso la caja debe avisar, nunca dar la venta por hecha.
 */
export function queueSale(storeId: string | null | undefined, sale: Omit<PendingSale, 'status' | 'attempts'>): boolean {
    if (!storeId) return false
    const sales = read(storeId)
    if (sales.some(s => s.clientSaleId === sale.clientSaleId)) return true
    sales.push({ ...sale, status: 'pending', attempts: 0 })
    if (!write(storeId, sales)) return false
    // Se confirma leyendo de vuelta: si el navegador no guardó, no hay venta
    return read(storeId).some(s => s.clientSaleId === sale.clientSaleId)
}

export function removePendingSale(storeId: string | null | undefined, clientSaleId: string): void {
    if (!storeId) return
    write(storeId, read(storeId).filter(s => s.clientSaleId !== clientSaleId))
}

export function cacheStoreInfo(storeId: string | null | undefined, info: CachedStoreInfo): void {
    if (!storeId) return
    try { localStorage.setItem(STORE_PREFIX + storeId, JSON.stringify(info)) } catch { /* noop */ }
}

export function getCachedStoreInfo(storeId: string | null | undefined): CachedStoreInfo | null {
    if (!storeId) return null
    try {
        const raw = localStorage.getItem(STORE_PREFIX + storeId)
        return raw ? (JSON.parse(raw) as CachedStoreInfo) : null
    } catch {
        return null
    }
}

// ─── Envío ────────────────────────────────────────────────────
let syncing = false

export interface SyncResult {
    sent: number
    failed: number
    remaining: number
}

/**
 * Envía las ventas guardadas. Se detiene al primer problema de red
 * (sigue sin internet) y deja el resto para el próximo intento.
 * `includeFailed` reintenta también las que el servidor rechazó.
 */
export async function syncPendingSales(storeId: string | null | undefined, includeFailed = false): Promise<SyncResult> {
    if (!storeId) return { sent: 0, failed: 0, remaining: 0 }
    if (syncing) return { sent: 0, failed: 0, remaining: read(storeId).length }
    syncing = true
    let sent = 0
    let failed = 0

    try {
        for (const sale of read(storeId)) {
            if (sale.status === 'failed' && !includeFailed) continue

            let response: Response
            try {
                response = await fetch('/api/sales', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sale.body),
                })
            } catch {
                break // sigue sin internet: se reintenta luego
            }

            if (response.ok) {
                removePendingSale(storeId, sale.clientSaleId)
                sent++
                continue
            }

            if (response.status >= 500) break // problema del servidor: reintentar luego

            // El servidor la rechazó (por ejemplo, sin stock): queda para revisar
            let message = 'El servidor rechazó la venta'
            try {
                const data = await response.json()
                message = data.error || message
            } catch { /* respuesta sin cuerpo */ }

            write(storeId, read(storeId).map(s => s.clientSaleId === sale.clientSaleId
                ? { ...s, status: 'failed' as const, error: message, attempts: s.attempts + 1 }
                : s))
            failed++
        }
    } finally {
        syncing = false
    }

    return { sent, failed, remaining: read(storeId).length }
}
