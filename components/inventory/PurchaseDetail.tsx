'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Ban, Check, TrendingDown, TrendingUp, Truck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { explainError } from '@/lib/errors'
import { panelVariants, backdropVariants } from '@/lib/motion'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   El detalle de una compra.

   Lo que de verdad importa aquí no es el total: es a qué costo
   entró cada producto y si ese costo subió desde la última vez.
   Un proveedor que sube los precios de a poco se come la utilidad
   sin que nadie lo note, porque el margen se calcula contra el
   costo nuevo y todo "parece" normal.

   Corregir el proveedor vive aquí adentro, que es donde tiene
   sentido: estás viendo la compra que te quedó mal.
   ══════════════════════════════════════════════════════════════ */

export interface PurchaseDetailData {
    id: string
    fecha: string
    subtotal: number
    total: number
    metodo: string
    credito: boolean
    proveedor: { id: string; nombre: string; telefono: string | null } | null
    deuda: { monto: number; falta: number; vence: string | null; estado: string } | null
    items: {
        id: string
        nombre: string
        imagen: string | null
        cantidad: number
        costo: number
        total: number
        costoAnterior: number | null
        fechaAnterior: string | null
    }[]
}

const METODO: Record<string, string> = {
    cash: 'De contado',
    credit: 'A crédito',
    capital: 'Con capital propio',
}

const fechaLarga = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const fechaCorta = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

/** Días que lleva vencido un plazo. Negativo si todavía no llega. */
function vencidoHace(iso: string) {
    const hoy = new Date(Date.now() - 5 * 3600_000)
    hoy.setHours(0, 0, 0, 0)
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    return Math.round((hoy.getTime() - d.getTime()) / 86400000)
}

const CSS = PANEL_CSS + `
.pd-opt { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; padding: 11px 13px;
    border-radius: 13px; border: 1px solid var(--toul-border); background: var(--toul-surface);
    cursor: pointer; font-family: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1); }
@media (hover: hover) and (pointer: fine) { .pd-opt:hover { background: var(--toul-surface-2); } }

.pd-var { display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
    font-size: 11px; font-weight: 700; letter-spacing: -0.01em; }
`

export function PurchaseDetail({ purchase, onClose, onChanged }: {
    purchase: PurchaseDetailData | null
    onClose: () => void
    onChanged?: () => void
}) {
    const [cambiar, setCambiar] = useState(false)
    const [anular, setAnular] = useState(false)
    const [saving, setSaving] = useState(false)

    const { data: providers } = useSWR(purchase ? 'providers-list' : null, async () => {
        const { data } = await supabase.from('providers').select('id, name').order('name')
        return data ?? []
    }, { revalidateOnFocus: false })

    async function cambiarProveedor(providerId: string | null) {
        if (!purchase) return
        setSaving(true)
        const { error } = await supabase.rpc('toul_change_purchase_provider', {
            p_purchase_id: purchase.id,
            p_provider_id: providerId,
        })
        setSaving(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar el proveedor.')); return }
        setCambiar(false)
        onChanged?.()
        toast.success('Proveedor actualizado')
    }

    // Saca la mercancía, borra la deuda con el proveedor y devuelve la
    // plata a la caja. La base se niega si ya vendiste lo que entró o
    // si ya le abonaste: eso hay que resolverlo a mano.
    async function anularCompra() {
        if (!purchase) return
        setSaving(true)
        const { error } = await supabase.rpc('toul_void_purchase', {
            p_purchase_id: purchase.id, p_reason: null,
        })
        setSaving(false)
        if (error) { toast.error(explainError(error, 'No se pudo anular la compra.')); return }
        setAnular(false)
        onChanged?.()
        toast.success('Compra anulada')
    }

    return (
        <>
            <AnimatePresence>
                {purchase && !cambiar && (
                    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                        <style>{CSS}</style>
                        <motion.div className="absolute inset-0" onClick={onClose}
                            variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
                            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
                        <motion.div
                            variants={panelVariants} initial="hidden" animate="visible" exit="exit"
                            className="relative w-full md:w-[460px] rounded-t-3xl md:rounded-3xl shadow-2xl"
                            style={{ background: 'var(--toul-bg)', border: '1px solid var(--toul-border)', maxHeight: '88dvh', overflowY: 'auto' }}>

                            <div className="flex justify-center pt-3 pb-0 md:hidden">
                                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--toul-border)' }} />
                            </div>

                            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                <div style={{ minWidth: 0 }}>
                                    <p className="text-xs font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Detalle de compra</p>
                                    <p className="font-bold" style={{ color: 'var(--toul-text)' }}>{fechaLarga(purchase.fecha)}</p>
                                </div>
                                <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                                    <X size={16} />
                                </button>
                            </div>

                            {/* ── A quién le compraste ── */}
                            <div className="px-5 pt-4" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 11.5, color: 'var(--toul-text-dim)', margin: 0 }}>Proveedor</p>
                                    <p style={{ fontSize: 14.5, fontWeight: 600, margin: 0, color: purchase.proveedor ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>
                                        {purchase.proveedor?.nombre ?? 'Sin proveedor'}
                                    </p>
                                    {purchase.proveedor && (
                                        <Link href={`/providers/${purchase.proveedor.id}`}
                                            style={{ fontSize: 11.5, color: 'var(--toul-accent)', textDecoration: 'none' }}>
                                            Ver su ficha →
                                        </Link>
                                    )}
                                </div>
                                <button onClick={() => setCambiar(true)} className="pnl-pill">
                                    <Truck size={13} /> Cambiar
                                </button>
                            </div>

                            {/* ── Qué entró y a qué costo ── */}
                            <div className="px-5 py-4 flex flex-col gap-2">
                                {purchase.items.map(item => {
                                    const antes = item.costoAnterior == null ? null : Number(item.costoAnterior)
                                    const pct = antes && antes > 0
                                        ? Math.round(((Number(item.costo) - antes) / antes) * 100)
                                        : null
                                    return (
                                        <div key={item.id} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface)' }}>
                                                {item.imagen ? (
                                                    <img src={item.imagen} className="w-full h-full object-cover" alt="" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p className="text-sm font-medium" style={{ color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {item.nombre}
                                                </p>
                                                <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                                    {Number(item.cantidad)} × {formatCOP(Number(item.costo))}
                                                </p>
                                                {/* El dato que avisa que te están subiendo el precio */}
                                                {pct !== null && pct !== 0 && (
                                                    <span className="pd-var" style={{ color: pct > 0 ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                                        {pct > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                                        {pct > 0 ? '+' : ''}{pct}% vs {item.fechaAnterior ? fechaCorta(item.fechaAnterior) : 'la anterior'}
                                                    </span>
                                                )}
                                                {pct === 0 && (
                                                    <span className="pd-var" style={{ color: 'var(--toul-text-faint)' }}>
                                                        mismo costo que la vez pasada
                                                    </span>
                                                )}
                                            </div>
                                            <p className="font-bold text-sm flex-shrink-0" style={{ color: 'var(--toul-text)' }}>
                                                {formatCOP(Number(item.total))}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* ── Cómo la pagaste ── */}
                            <div className="px-5 pb-6 flex flex-col gap-2">
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Cómo la pagaste</span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>
                                        {METODO[purchase.metodo] ?? purchase.metodo}
                                    </span>
                                </div>

                                {purchase.deuda && (
                                    <>
                                        <div className="flex justify-between">
                                            <span className="text-sm" style={{ color: Number(purchase.deuda.falta) > 0 ? 'var(--toul-warning)' : 'var(--toul-accent)' }}>
                                                {Number(purchase.deuda.falta) > 0 ? 'Le debes todavía' : 'Ya se la pagaste'}
                                            </span>
                                            <span className="text-sm font-medium" style={{ color: Number(purchase.deuda.falta) > 0 ? 'var(--toul-warning)' : 'var(--toul-accent)' }}>
                                                {formatCOP(Number(purchase.deuda.falta))}
                                            </span>
                                        </div>
                                        {purchase.deuda.vence && Number(purchase.deuda.falta) > 0 && (() => {
                                            const dias = vencidoHace(purchase.deuda!.vence!)
                                            const vencida = dias > 0
                                            return (
                                                <div className="flex justify-between">
                                                    <span className="text-sm" style={{ color: vencida ? 'var(--toul-error)' : 'var(--toul-text-muted)' }}>
                                                        {vencida ? 'Se venció el' : 'Plazo'}
                                                    </span>
                                                    <span className="text-sm font-medium" style={{ color: vencida ? 'var(--toul-error)' : 'var(--toul-text)' }}>
                                                        {fechaCorta(purchase.deuda!.vence!)}
                                                        {vencida && ` · hace ${dias} ${dias === 1 ? 'día' : 'días'}`}
                                                    </span>
                                                </div>
                                            )
                                        })()}
                                    </>
                                )}

                                <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--toul-border)' }}>
                                    <span className="font-bold" style={{ color: 'var(--toul-text)' }}>Total</span>
                                    <span className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(Number(purchase.total))}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>N° de compra</span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-text-muted)' }}>
                                        #{purchase.id.slice(0, 8).toUpperCase()}
                                    </span>
                                </div>

                                <button onClick={() => setAnular(true)} disabled={saving}
                                    style={{
                                        marginTop: 10, height: 46, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        fontSize: 14, fontWeight: 600,
                                        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                        color: 'var(--toul-error)',
                                    }}>
                                    <Ban size={16} /> Anular compra
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <ConfirmSheet
                open={anular}
                onClose={() => setAnular(false)}
                onConfirm={anularCompra}
                busy={saving}
                danger
                title="¿Anular esta compra?"
                message={purchase
                    ? `Sale del inventario lo que entró, se borra la deuda con el proveedor y vuelven ${formatCOP(Number(purchase.total))} a la caja. Si ya vendiste parte de esa mercancía, no se va a poder.`
                    : ''}
                confirmLabel="Anular compra"
            />

            {/* ── Corregir el proveedor ── */}
            <Sheet
                open={cambiar}
                onClose={() => setCambiar(false)}
                title="¿De quién fue esta compra?"
                subtitle={purchase ? `${fechaCorta(purchase.fecha)} · ${formatCOP(Number(purchase.total))}` : undefined}>
                <style>{CSS}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 360, overflowY: 'auto' }}>
                    {!purchase?.credito && (
                        <button className="pd-opt" disabled={saving} onClick={() => cambiarProveedor(null)}>
                            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: 'var(--toul-text-dim)' }}>Sin proveedor</span>
                            {!purchase?.proveedor && <Check size={16} style={{ color: 'var(--toul-accent)' }} />}
                        </button>
                    )}

                    {(providers ?? []).map(p => {
                        const actual = purchase?.proveedor?.id === p.id
                        return (
                            <button key={p.id} className="pd-opt" disabled={saving || actual}
                                onClick={() => cambiarProveedor(p.id)}
                                style={{
                                    background: actual ? 'var(--toul-surface-focused)' : undefined,
                                    borderColor: actual ? 'var(--toul-border-focused)' : undefined,
                                }}>
                                <Truck size={16} style={{ color: actual ? 'var(--toul-accent)' : 'var(--toul-text-faint)', flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: actual ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                                    {p.name}
                                </span>
                                {actual && <Check size={16} style={{ color: 'var(--toul-accent)' }} />}
                            </button>
                        )
                    })}

                    {(providers ?? []).length === 0 && (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '18px 10px', margin: 0 }}>
                            Todavía no tienes proveedores. <Link href="/providers" style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>Crea uno</Link>.
                        </p>
                    )}

                    {purchase?.credito && (
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                            Esta compra quedó a crédito: al cambiar el proveedor, lo que falta por pagar se le pasa al nuevo.
                        </p>
                    )}
                </div>
            </Sheet>
        </>
    )
}
