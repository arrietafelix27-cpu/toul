'use client'

import type { ReceiptData } from './types'

/**
 * Ventas sin internet.
 *
 * Si la caja se queda sin señal, la venta se guarda en el computador y se
 * envía sola cuando vuelve. El servidor identifica cada venta por
 * `clientSaleId`, así que reintentar NUNCA duplica una venta.
 */

const QUEUE_KEY = 'toul-pending-sales'
const STORE_KEY = 'toul-store-info'

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
function read(): PendingSale[] {
    try {
        const raw = localStorage.getItem(QUEUE_KEY)
        return raw ? (JSON.parse(raw) as PendingSale[]) : []
    } catch {
        return []
    }
}

function write(sales: PendingSale[]): boolean {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(sales))
        return true
    } catch {
        return false // almacenamiento lleno o bloqueado
    }
}

export function listPendingSales(): PendingSale[] {
    return read()
}

/**
 * Guarda la venta en el computador. Devuelve false si NO se pudo guardar:
 * en ese caso la caja debe avisar, nunca dar la venta por hecha.
 */
export function queueSale(sale: Omit<PendingSale, 'status' | 'attempts'>): boolean {
    const sales = read()
    if (sales.some(s => s.clientSaleId === sale.clientSaleId)) return true
    sales.push({ ...sale, status: 'pending', attempts: 0 })
    if (!write(sales)) return false
    // Se confirma leyendo de vuelta: si el navegador no guardó, no hay venta
    return read().some(s => s.clientSaleId === sale.clientSaleId)
}

export function removePendingSale(clientSaleId: string): void {
    write(read().filter(s => s.clientSaleId !== clientSaleId))
}

export function cacheStoreInfo(info: CachedStoreInfo): void {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(info)) } catch { /* noop */ }
}

export function getCachedStoreInfo(): CachedStoreInfo | null {
    try {
        const raw = localStorage.getItem(STORE_KEY)
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
export async function syncPendingSales(includeFailed = false): Promise<SyncResult> {
    if (syncing) return { sent: 0, failed: 0, remaining: read().length }
    syncing = true
    let sent = 0
    let failed = 0

    try {
        for (const sale of read()) {
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
                removePendingSale(sale.clientSaleId)
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

            write(read().map(s => s.clientSaleId === sale.clientSaleId
                ? { ...s, status: 'failed' as const, error: message, attempts: s.attempts + 1 }
                : s))
            failed++
        }
    } finally {
        syncing = false
    }

    return { sent, failed, remaining: read().length }
}
