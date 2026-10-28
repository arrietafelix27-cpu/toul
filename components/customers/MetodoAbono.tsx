'use client'

import { useEffect } from 'react'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'

/* ══════════════════════════════════════════════════════════════
   "¿Por dónde te pagó?" al registrar un abono. Los mismos métodos
   de la venta, de la tabla de métodos de pago. Si solo hay uno,
   queda elegido.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.ma-rotulo { display: block; font-size: 12.5px; font-weight: 500; color: var(--toul-text-muted); margin: 20px 0 8px; }
.ma-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ma-chip { min-height: 44px; padding: 10px 14px; border-radius: 12px; font: inherit; font-size: 14px; font-weight: 500; cursor: pointer;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil),
        color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.ma-chip:active { transform: scale(0.97); }
.ma-chip[aria-pressed="true"] { background: var(--toul-surface-focused); border-color: var(--toul-border-focused); color: var(--toul-accent); }
@media (prefers-reduced-motion: reduce) { .ma-chip:active { transform: none; } }
`

export function MetodoAbono({ valor, onCambio }: {
    valor: string | null
    onCambio: (id: string) => void
}) {
    const { methods, isLoading } = usePaymentMethods()

    useEffect(() => {
        if (!valor && methods.length === 1) onCambio(methods[0].id)
    }, [valor, methods, onCambio])

    return (
        <div>
            <style>{CSS}</style>
            <span className="ma-rotulo" id="ma-rotulo">¿Por dónde te pagó?</span>
            <div className="ma-chips" role="group" aria-labelledby="ma-rotulo">
                {isLoading && methods.length === 0
                    ? <span style={{ fontSize: 13, color: 'var(--toul-text-subtle)' }}>Cargando…</span>
                    : methods.map(m => (
                        <button key={m.id} type="button" className="ma-chip" aria-pressed={valor === m.id}
                            onClick={() => onCambio(m.id)}>
                            {m.name}
                        </button>
                    ))}
            </div>
        </div>
    )
}
