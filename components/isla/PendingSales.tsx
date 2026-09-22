'use client'

import { CloudUpload, AlertTriangle, Printer, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCOP } from '@/lib/utils'
import { printReceipt } from '@/lib/isla/receipt'
import { removePendingSale } from '@/lib/isla/offline'
import type { OfflineState } from '@/lib/isla/useOffline'

/** Ventas guardadas en este computador que todavía no llegan al servidor. */
export function PendingSales({ offline }: { offline: OfflineState }) {
    const { pending, refresh, sync, syncing } = offline
    if (pending.length === 0) return null

    function discard(clientSaleId: string) {
        if (!confirm('¿Borrar esta venta? No quedará registrada en ningún lado.')) return
        removePendingSale(clientSaleId)
        refresh()
        toast.success('Venta descartada')
    }

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '28px 0 10px 4px' }}>
                <p className="toul-section-label" style={{ margin: 0 }}>Guardadas en este computador</p>
                <button onClick={() => sync(true)} disabled={syncing}
                    style={{ background: 'none', border: 'none', color: 'var(--toul-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {syncing ? 'Enviando…' : 'Enviar ahora'}
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pending.map(sale => {
                    const failed = sale.status === 'failed'
                    return (
                        <div key={sale.clientSaleId} className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{
                                width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: failed ? 'var(--toul-error-dim)' : 'var(--toul-info-dim)',
                            }}>
                                {failed
                                    ? <AlertTriangle size={17} style={{ color: 'var(--toul-error)' }} />
                                    : <CloudUpload size={17} style={{ color: 'var(--toul-info)' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                                    {sale.receipt.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                                </p>
                                <p style={{ fontSize: 13, color: failed ? 'var(--toul-error)' : 'var(--toul-text-muted)', margin: '2px 0 0' }}>
                                    {new Date(sale.soldAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                    {' · '}
                                    {failed ? sale.error : 'Esperando internet'}
                                </p>
                            </div>
                            <button onClick={() => printReceipt(sale.receipt)} aria-label="Imprimir tirilla"
                                style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid var(--toul-border)', background: 'transparent', color: 'var(--toul-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Printer size={16} />
                            </button>
                            {failed && (
                                <button onClick={() => discard(sale.clientSaleId)} aria-label="Descartar venta"
                                    style={{ width: 38, height: 38, borderRadius: 11, border: '1px solid var(--toul-border)', background: 'transparent', color: 'var(--toul-error)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', flexShrink: 0 }}>
                                {formatCOP(sale.total)}
                            </span>
                        </div>
                    )
                })}
            </div>
        </>
    )
}
