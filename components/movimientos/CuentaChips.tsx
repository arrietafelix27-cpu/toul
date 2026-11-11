'use client'

import { useEffect, useRef } from 'react'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'
import { nombreMetodo } from '@/lib/format/text'

/* ══════════════════════════════════════════════════════════════
   "¿Con qué pagaste?": las cuentas del negocio (de payment_methods,
   nunca escritas a mano).

   "Plata mía" ya no se puede elegir (desde el 11 de noviembre de 2026).
   Solo sale, marcada, al corregir algo viejo que se pagó así; se puede
   pasar a una cuenta del negocio, pero no volver a "Plata mía".

   La que usaste la última vez para eso mismo (un gasto, una compra,
   un pago a proveedor…) sale ya marcada. Se recuerda en este equipo
   solo cuando se guarda, no al tocar.
   ══════════════════════════════════════════════════════════════ */

/** "Plata mía": no sale de ninguna cuenta del negocio (solo lo viejo) */
export const PLATA_MIA = 'plata-mia'

/** Lo que va al servidor: la cuenta por su número, o plata mía */
export function cuentaParaGuardar(cuenta: string | null): { methodId: string | null; plataMia: boolean } {
    return { methodId: cuenta && cuenta !== PLATA_MIA ? cuenta : null, plataMia: cuenta === PLATA_MIA }
}

const clave = (para: string) => `toul:ultima-cuenta:${para}`

/** Guardar la cuenta que se usó, para marcarla la próxima vez */
export function recordarCuenta(para: string, cuenta: string | null) {
    if (!cuenta) return
    try { localStorage.setItem(clave(para), cuenta) } catch { /* sin almacenamiento: no pasa nada */ }
}

function ultimaCuenta(para: string): string | null {
    try { return localStorage.getItem(clave(para)) } catch { return null }
}

const CSS = `
.cc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-chip { padding: 7px 12px; border-radius: 999px; font: inherit; font-size: 13px; cursor: pointer;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); border: 1px solid transparent;
    color: var(--toul-text-muted); -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    -webkit-user-select: none; user-select: none;
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil),
        color 160ms var(--toul-ease-emil), transform 120ms var(--toul-ease-emil); }
.cc-chip:active { transform: scale(0.96); }
.cc-chip[aria-checked="true"] { background: color-mix(in srgb, var(--toul-text) 12%, transparent);
    border-color: color-mix(in srgb, var(--toul-text) 45%, transparent); color: var(--toul-text); }
.cc-chip:disabled { cursor: default; opacity: 0.45; }
.cc-chip:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 2px; }
.cc-cargando { width: 78px; height: 33px; border-radius: 999px; background: color-mix(in srgb, var(--toul-text) 6%, transparent); }
@media (hover: hover) and (pointer: fine) {
    .cc-chip:not(:disabled):not([aria-checked="true"]):hover { background: color-mix(in srgb, var(--toul-text) 9%, transparent); }
}
@media (prefers-reduced-motion: reduce) { .cc-chip:active { transform: none; } }
`

export function CuentaChips({ valor, onChange, recordar, preseleccionar = true, bloqueada = false, etiqueta = '¿Con qué pagaste?' }: {
    /** El número de la cuenta, PLATA_MIA (algo viejo) o nada */
    valor: string | null
    onChange: (cuenta: string) => void
    /** Para qué es: la última de cada cosa se recuerda aparte */
    recordar?: string
    /** Marcar la última usada si no hay ninguna (no al corregir algo que ya tiene la suya) */
    preseleccionar?: boolean
    /** No se puede cambiar (un turno ya cerrado) */
    bloqueada?: boolean
    /** Para lectores de pantalla: la pregunta que va encima */
    etiqueta?: string
}) {
    const { methods, isLoading } = usePaymentMethods()
    const yaMarco = useRef(false)

    // La última que usaste, si sigue activa (nunca "Plata mía": ya no se elige)
    useEffect(() => {
        if (yaMarco.current || !preseleccionar || valor || isLoading || !recordar) return
        yaMarco.current = true
        const ultima = ultimaCuenta(recordar)
        if (ultima && methods.some(m => m.id === ultima)) onChange(ultima)
    }, [preseleccionar, valor, isLoading, recordar, methods, onChange])

    return (
        <>
            <style>{CSS}</style>
            <div className="cc-chips" role="radiogroup" aria-label={etiqueta}>
                {isLoading && methods.length === 0
                    ? [0, 1, 2].map(i => <span key={i} className="cc-cargando skeleton" aria-hidden />)
                    : <>
                        {methods.map(m => (
                            <button key={m.id} type="button" role="radio" className="cc-chip" aria-checked={valor === m.id}
                                disabled={bloqueada} onClick={() => onChange(m.id)}>
                                {nombreMetodo(m.name)}
                            </button>
                        ))}
                        {/* Lo viejo que se pagó con "Plata mía" la muestra marcada */}
                        {valor === PLATA_MIA && (
                            <button type="button" role="radio" className="cc-chip" aria-checked disabled={bloqueada}>
                                Plata mía
                            </button>
                        )}
                    </>}
            </div>
        </>
    )
}
