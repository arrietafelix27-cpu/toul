'use client'

import { Sheet } from './Sheet'

/**
 * Confirmación con el estilo de TOUL (antes se usaba la ventanita gris del navegador).
 * `danger` la pinta en rojo para acciones que no se pueden deshacer.
 */
export function ConfirmSheet({ open, onClose, onConfirm, title, message, confirmLabel = 'Sí, continuar', cancelLabel = 'Cancelar', danger = false, busy = false }: {
    open: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    busy?: boolean
}) {
    return (
        <Sheet
            open={open}
            onClose={() => { if (!busy) onClose() }}
            title={title}
            width={420}
            footer={
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }} onClick={onClose} disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button className="toul-btn-primary" onClick={onConfirm} disabled={busy}
                        style={danger ? { background: 'var(--toul-error)', color: '#fff' } : undefined}>
                        {busy ? 'Un momento…' : confirmLabel}
                    </button>
                </div>
            }
        >
            <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--toul-text-muted)', margin: 0 }}>{message}</p>
        </Sheet>
    )
}
