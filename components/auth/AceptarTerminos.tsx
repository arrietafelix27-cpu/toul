import Link from 'next/link'
import { Check } from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   Aceptar los términos y la política de datos.

   La ley colombiana (Ley 1581 de 2012) pide autorización previa,
   expresa e informada para tratar datos personales. Por eso la
   casilla viene sin marcar y no se puede crear la cuenta sin ella.

   Lo aceptado se guarda en la cuenta con la fecha y la versión:
   si mañana cambian los términos, se sabe qué aceptó cada quien.

   Sin 'use client' a propósito: las páginas de términos y privacidad
   (que se arman en el servidor) leen de aquí la fecha de vigencia.
   La casilla igual funciona porque solo la usan pantallas del cliente.
   ══════════════════════════════════════════════════════════════ */

/** Sube cuando cambien los términos o la política. */
export const TERMINOS_VERSION = '2026-10-21'
export const TERMINOS_VIGENCIA = '21 de octubre de 2026'

/** Lo que se guarda en la cuenta al aceptar. */
export function datosDeAceptacion() {
    return { terminos_aceptados: new Date().toISOString(), terminos_version: TERMINOS_VERSION }
}

/** ¿Esta cuenta ya aceptó? (las que entran con Google no pasan por el registro) */
export function yaAcepto(metadata: Record<string, unknown> | undefined | null): boolean {
    return typeof metadata?.terminos_aceptados === 'string'
}

const CSS = `
.at-caja { width: 20px; height: 20px; border-radius: 6px; flex-shrink: 0; margin-top: 1px;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--toul-border-2); background: transparent;
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
.at-fila:active .at-caja { transform: scale(0.9); }
.at-fila input:focus-visible + .at-caja { outline: 2px solid var(--toul-border-focused); outline-offset: 2px; }
.at-caja[data-on="1"] { background: var(--toul-accent); border-color: var(--toul-accent); }
.at-caja[data-error="1"] { border-color: var(--toul-error); }
.at-check { opacity: 0; transform: scale(0.6); transition: opacity 140ms var(--toul-ease-emil), transform 180ms var(--toul-ease-emil); }
.at-caja[data-on="1"] .at-check { opacity: 1; transform: scale(1); }
.at-link { color: var(--toul-text); text-decoration: underline; text-decoration-color: var(--toul-border-2); text-underline-offset: 3px; }
@media (hover: hover) and (pointer: fine) { .at-link:hover { text-decoration-color: var(--toul-text-muted); } }
`

export function AceptarTerminos({ aceptado, onCambio, error = false }: {
    aceptado: boolean
    onCambio: (valor: boolean) => void
    error?: boolean
}) {
    return (
        <div>
            <style>{CSS}</style>
            <label className="at-fila" style={{ display: 'flex', gap: 11, alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={aceptado} onChange={e => onCambio(e.target.checked)}
                    style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }} />
                <span className="at-caja" data-on={aceptado ? '1' : '0'} data-error={error && !aceptado ? '1' : '0'} aria-hidden>
                    <Check size={13} strokeWidth={3} className="at-check" style={{ color: 'var(--toul-bg)' }} />
                </span>
                <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--toul-text-muted)' }}>
                    Acepto los{' '}
                    <Link href="/terminos" target="_blank" rel="noopener" className="at-link">Términos de uso</Link>
                    {' '}y autorizo el tratamiento de mis datos según la{' '}
                    <Link href="/privacidad" target="_blank" rel="noopener" className="at-link">Política de datos</Link>.
                </span>
            </label>
            {error && !aceptado && (
                <p role="alert" style={{ fontSize: 12.5, color: 'var(--toul-error)', margin: '8px 0 0 31px' }}>
                    Para seguir tienes que aceptarlos.
                </p>
            )}
        </div>
    )
}
