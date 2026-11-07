'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ChevronRight, Info, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/utils'
import { ZONA_COLOMBIA } from '@/lib/periodos'
import { explainError } from '@/lib/errors'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'

/* ══════════════════════════════════════════════════════════════
   El detalle de un movimiento de Movimientos.

   Gastos, Metí plata y Saqué plata se corrigen o se borran aquí.
   Ventas, compras, abonos y pagos a proveedor llevan a su pantalla:
   ahí es donde se anulan o se corrigen, con todo lo que arrastran.
   ══════════════════════════════════════════════════════════════ */

/** Un movimiento ya listo para mostrar */
export interface Movimiento {
    id: string
    type: string
    created_at: string
    /** Con signo: + entra, − sale */
    signed: number
    amount: number
    method_id: string | null
    own_money: boolean
    notes: string | null
    reference_id: string | null
    linked_payment_id: string | null
    created_by_name: string | null
    titulo: string
    /** "Efectivo", "Plata tuya" o "Sin cuenta" */
    cuenta: string
    Icon: LucideIcon
    /** Metí o Saqué plata: no cuenta en lo que ganaste */
    deTuNegocio: boolean
    turnoCerrado: boolean
    /** Gasto: su categoría y lo que se escribió */
    categoria?: string
    descripcion?: string | null
}

const CSS = `
.dm-monto { margin: 2px 0 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
.dm-etiqueta { display: inline-block; margin-top: 8px; padding: 2px 8px; border-radius: 999px; font-size: 11px;
    color: var(--toul-text-muted); background: color-mix(in srgb, var(--toul-text) 6%, transparent); }
.dm-datos { margin-top: 18px; border-top: 1px solid var(--toul-divider); }
.dm-dato { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 11px 0;
    border-bottom: 1px solid var(--toul-divider); font-size: 14px; }
.dm-dato span:first-child { color: var(--toul-text-subtle); flex-shrink: 0; }
.dm-dato span:last-child { color: var(--toul-text); text-align: right; min-width: 0; overflow-wrap: anywhere; }
.dm-info { display: flex; gap: 8px; margin: 16px 0 0; font-size: 12px; line-height: 1.45; color: var(--toul-text-muted); }
.dm-info svg { flex-shrink: 0; margin-top: 1px; }
.dm-acciones { display: flex; gap: 8px; }
.dm-boton { flex: 1; height: 48px; border-radius: 14px; border: none; cursor: pointer; font: inherit; font-size: 15px; font-weight: 600;
    display: flex; align-items: center; justify-content: center; gap: 6px; text-decoration: none;
    background: color-mix(in srgb, var(--toul-text) 8%, transparent); color: var(--toul-text);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 160ms var(--toul-ease-emil), transform 120ms var(--toul-ease-emil); }
.dm-boton:active { transform: scale(0.98); }
.dm-borrar { color: var(--toul-error); background: var(--toul-error-dim); }
@media (hover: hover) and (pointer: fine) { .dm-boton:hover { background: color-mix(in srgb, var(--toul-text) 11%, transparent); }
    .dm-borrar:hover { background: color-mix(in srgb, var(--toul-error) 18%, transparent); } }
@media (prefers-reduced-motion: reduce) { .dm-boton:active { transform: none; } }
`

const supabase = createClient()

const TURNO_CERRADO = 'Esto quedó en un turno que ya se cerró: solo puedes cambiar la nota o la categoría. Para corregirlo, anota un movimiento nuevo'
const ATADO = 'Esta plata la metiste para pagar algo: corrígelo o bórralo desde ahí'

/** Lo que se puede corregir aquí mismo */
export const SE_CORRIGE_AQUI = (m: Movimiento) =>
    m.type === 'expense' || ((m.type === 'owner_in' || m.type === 'owner_out') && !m.linked_payment_id)

export function DetalleMovimiento({ movimiento, onCerrar, onEditar, onBorrado, onVerPadre }: {
    movimiento: Movimiento | null
    onCerrar: () => void
    onEditar: (m: Movimiento) => void
    onBorrado: () => void
    /** Un Metí plata de "Plata mía": abrir lo que se pagó con ella */
    onVerPadre?: (m: Movimiento) => void
}) {
    const [confirmar, setConfirmar] = useState(false)
    const [borrando, setBorrando] = useState(false)
    const [cliente, setCliente] = useState<{ ref: string; id: string } | null>(null)
    const m = movimiento

    // Un abono lleva a la ficha de su cliente
    const esAbono = m?.type === 'sale_payment' || m?.type === 'credit_payment'
    const refAbono = esAbono ? m?.reference_id ?? null : null
    useEffect(() => {
        if (!refAbono) return
        let vivo = true
        supabase.from('credits').select('customer_id').eq('id', refAbono).maybeSingle()
            .then(({ data }) => { if (vivo && data?.customer_id) setCliente({ ref: refAbono, id: data.customer_id as string }) })
        return () => { vivo = false }
    }, [refAbono])

    async function borrar() {
        if (!m) return
        setBorrando(true)
        const { error } = m.type === 'expense'
            ? await supabase.rpc('toul_delete_expense', { p_expense_id: m.reference_id })
            : await supabase.rpc('toul_borrar_movimiento', { p_id: m.id })
        setBorrando(false)
        if (error) { toast.error(explainError(error, 'No se pudo borrar.')); return }
        setConfirmar(false)
        toast.success('Movimiento borrado')
        onBorrado()
    }

    const corrige = !!m && SE_CORRIGE_AQUI(m)
    const entra = !!m && m.signed > 0
    const enlace = !m ? null
        : (m.type === 'sale' || m.type === 'sale_refund') && m.reference_id ? { href: `/ventas?venta=${m.reference_id}`, texto: 'Ver la venta' }
        : m.type === 'purchase' && m.reference_id ? { href: `/inventory/compras?compra=${m.reference_id}`, texto: 'Ver la compra' }
        : m.type === 'provider_payment' && m.reference_id ? { href: `/providers/${m.reference_id}`, texto: 'Ver el proveedor' }
        : esAbono && cliente && cliente.ref === m.reference_id ? { href: `/customers/${cliente.id}`, texto: 'Ver el cliente' }
        : null

    const nota = m?.type === 'expense' ? m.descripcion
        : m?.type === 'owner_in' || m?.type === 'owner_out' ? (m.linked_payment_id ? null : m.notes)
        : null

    return (
        <>
            <style>{CSS}</style>
            <Sheet open={!!m && !confirmar} onClose={onCerrar} title={m?.titulo ?? ''}
                footer={m && (corrige || enlace || (m.linked_payment_id && onVerPadre)) ? (
                    <div className="dm-acciones">
                        {corrige && (
                            <button type="button" className="dm-boton" onClick={() => onEditar(m)}>Editar</button>
                        )}
                        {corrige && !m.turnoCerrado && (
                            <button type="button" className="dm-boton dm-borrar" onClick={() => setConfirmar(true)}>Borrar</button>
                        )}
                        {enlace && (
                            <Link href={enlace.href} className="dm-boton">{enlace.texto} <ChevronRight size={16} /></Link>
                        )}
                        {m.linked_payment_id && onVerPadre && (
                            <button type="button" className="dm-boton" onClick={() => onVerPadre(m)}>
                                Ver lo que pagaste <ChevronRight size={16} />
                            </button>
                        )}
                    </div>
                ) : undefined}>
                {m && <Contenido m={m} entra={entra} nota={nota ?? null} />}
            </Sheet>

            <ConfirmSheet open={confirmar} onClose={() => setConfirmar(false)} onConfirm={borrar} busy={borrando} danger
                title="¿Borrar este movimiento?"
                message={m ? `Se borra ${m.type === 'expense' ? 'este gasto' : `este "${m.type === 'owner_in' ? 'Metí plata' : 'Saqué plata'}"`} de ${formatPrecio(Math.round(m.amount))}. Esto no se puede deshacer.` : ''}
                confirmLabel="Borrar" />
        </>
    )
}

function Contenido({ m, entra, nota }: { m: Movimiento; entra: boolean; nota: string | null }) {
    const fecha = new Date(m.created_at).toLocaleString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ZONA_COLOMBIA,
    })
    return (
        <div>
            <p className="dm-monto" style={{ color: entra ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                {entra ? '+' : '−'}{formatPrecio(Math.round(Math.abs(m.signed)))}
            </p>
            {m.deTuNegocio && <span className="dm-etiqueta">No cuenta en lo que ganaste</span>}

            <div className="dm-datos">
                <div className="dm-dato"><span>Cuenta</span><span>{m.cuenta}</span></div>
                <div className="dm-dato"><span>Fecha</span><span style={{ textTransform: 'capitalize' }}>{fecha}</span></div>
                {m.type === 'expense' && m.categoria && (
                    <div className="dm-dato"><span>Categoría</span><span>{m.categoria}</span></div>
                )}
                {nota && <div className="dm-dato"><span>Nota</span><span>{nota}</span></div>}
                {m.created_by_name && <div className="dm-dato"><span>Lo anotó</span><span>{m.created_by_name}</span></div>}
            </div>

            {m.linked_payment_id && (
                <p className="dm-info"><Info size={15} aria-hidden /><span>{ATADO}</span></p>
            )}
            {m.turnoCerrado && SE_CORRIGE_AQUI(m) && (
                <p className="dm-info"><Info size={15} aria-hidden />
                    <span>{m.type === 'expense' ? TURNO_CERRADO : TURNO_CERRADO.replace('la nota o la categoría', 'la nota')}</span>
                </p>
            )}
        </div>
    )
}
