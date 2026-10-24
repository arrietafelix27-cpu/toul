'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ArrowLeft, MessageCircle, Receipt } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Thumb } from '@/components/ui/Thumb'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { PurchaseDetail, type PurchaseDetailData } from '@/components/inventory/PurchaseDetail'
import { ProviderPaymentModal } from '@/components/providers/ProviderPaymentModal'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import toast from 'react-hot-toast'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Un proveedor.

   La deuda sale de las compras que siguen sin pagarse, no de un
   campo suelto que se puede desfasar. Cada renglón abre la compra
   que lo originó: si algo no cuadra, ahí está qué entró y a qué
   costo.
   ══════════════════════════════════════════════════════════════ */

interface Compra {
    id: string
    created_at: string
    total: number
    is_credit: boolean
    purchase_items: { quantity: number }[]
}

/** Cuántas compras se traen; si hay más, el total lo dice */
const TOPE_COMPRAS = 100

interface Deuda {
    id: string
    purchase_id: string | null
    amount: number
    remaining_amount: number
    due_date: string | null
    status: string
    created_at: string
}

const CSS = PANEL_CSS + `
.pd-fila { display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 11px 10px; border-radius: 14px; border: none; background: none;
    font: inherit; color: inherit; text-align: left; cursor: pointer;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pd-fila:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) { .pd-fila:hover { background: rgba(255,255,255,0.04); } }
@media (prefers-reduced-motion: reduce) { .pd-fila:active { transform: none; } }
/* PC: lo que le debes a la izquierda, sus compras a la derecha */
@media (min-width: 1024px) {
    .pd-wrap { max-width: 1040px !important; }
    .pd-cols { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr); gap: 48px; align-items: start; }
    .pd-izq { position: sticky; top: 24px; }
    .pd-cols > section { margin-top: 0 !important; }
}
`

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

function vencidoHace(iso: string) {
    const hoy = new Date(Date.now() - 5 * 3600_000); hoy.setHours(0, 0, 0, 0)
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    return Math.round((hoy.getTime() - d.getTime()) / 86400000)
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** Cómo va el pago de una compra, en palabras y con su color */
function estadoDeuda(d: Deuda | undefined, aCredito: boolean): { texto: string; color: string; pendiente: boolean; falta: number | null } {
    if (!aCredito || !d) {
        return { texto: aCredito ? 'a crédito' : 'de contado', color: 'var(--toul-text-dim)', pendiente: false, falta: null }
    }
    const falta = Math.round(Number(d.remaining_amount))
    if (falta <= 0) return { texto: 'pagada', color: 'var(--toul-accent)', pendiente: false, falta: null }
    const vencido = d.due_date ? vencidoHace(d.due_date) : null
    const texto = vencido === null ? 'sin plazo'
        : vencido > 0 ? `vencida hace ${dias(vencido)}`
            : vencido === 0 ? 'se vence hoy'
                : `vence en ${dias(-vencido)}`
    const color = vencido !== null && vencido >= 0 ? 'var(--toul-error)' : 'var(--toul-warning)'
    return { texto, color, pendiente: true, falta: falta !== Math.round(Number(d.amount)) ? falta : null }
}

export default function ProviderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [pagar, setPagar] = useState(false)
    const [compra, setCompra] = useState<PurchaseDetailData | null>(null)
    const [abriendo, setAbriendo] = useState<string | null>(null)

    const { data, isLoading, mutate } = useSWR(['proveedor', id], async () => {
        const [storeRes, provRes, deudasRes, comprasRes] = await Promise.all([
            supabase.from('stores').select('id').limit(1).single(),
            supabase.from('providers').select('*').eq('id', id).single(),
            supabase.from('provider_debts').select('id, purchase_id, amount, remaining_amount, due_date, status, created_at')
                .eq('provider_id', id).order('created_at', { ascending: false }).limit(TOPE_COMPRAS),
            // Todas las compras a este proveedor, de contado y a crédito
            supabase.from('purchases').select('id, created_at, total, is_credit, purchase_items(quantity)')
                .eq('provider_id', id).order('created_at', { ascending: false }).limit(TOPE_COMPRAS),
        ])
        return {
            storeId: storeRes.data?.id as string | undefined,
            provider: provRes.data,
            deudas: (deudasRes.data ?? []) as Deuda[],
            compras: (comprasRes.data ?? []) as Compra[],
        }
    }, { revalidateOnFocus: false })

    // Lo que de verdad le debes: lo que falta de cada compra
    const debe = useMemo(
        () => Math.round((data?.deudas ?? []).reduce((s, d) => s + Number(d.remaining_amount), 0)),
        [data?.deudas])

    const vencidas = useMemo(
        () => (data?.deudas ?? []).filter(d => Number(d.remaining_amount) > 0 && d.due_date && vencidoHace(d.due_date) > 0).length,
        [data?.deudas])

    // La deuda de cada compra, para decir al lado si ya se pagó o cuánto falta
    const deudaDe = useMemo(() => {
        const mapa = new Map<string, Deuda>()
        for (const d of data?.deudas ?? []) if (d.purchase_id) mapa.set(d.purchase_id, d)
        return mapa
    }, [data?.deudas])

    // Deudas que no vienen de una compra registrada (se ven igual, para no perder ninguna)
    const sueltas = useMemo(() => (data?.deudas ?? []).filter(d => !d.purchase_id), [data?.deudas])

    const comprado = useMemo(
        () => Math.round((data?.compras ?? []).reduce((s, c) => s + Number(c.total), 0)),
        [data?.compras])

    async function abrirCompra(purchaseId: string) {
        setAbriendo(purchaseId)
        const { data: detalle, error } = await supabase.rpc('toul_purchase_detail', { p_purchase_id: purchaseId })
        setAbriendo(null)
        if (error || !detalle) { toast.error('No se pudo abrir esa compra'); return }
        setCompra(detalle as PurchaseDetailData)
    }

    if (isLoading || !data) {
        return <div className="px-4 pt-6 pd-wrap" style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="skeleton" style={{ height: 170, borderRadius: 20 }} />
        </div>
    }
    if (!data.provider) {
        return <div className="px-4 pt-10 text-center" style={{ color: 'var(--toul-text-muted)' }}>Proveedor no encontrado</div>
    }

    const p = data.provider

    function porWhatsApp() {
        if (!p.phone) return
        const msg = `Hola ${p.name} 👋\n\nTe escribo por el saldo pendiente de *${formatCOP(debe)}*.\n\n¿Cómo quedamos?`
        window.open(`https://wa.me/${String(p.phone).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <div className="pd-wrap" style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                    <Link href="/providers" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <Thumb name={p.name} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.name}
                        </h1>
                        {p.phone && <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: 0 }}>{p.phone}</p>}
                    </div>
                    {p.phone && (
                        <button onClick={porWhatsApp} className="pnl-pill" aria-label="Escribirle">
                            <MessageCircle size={13} /> Escribirle
                        </button>
                    )}
                </motion.div>

                <div className="pd-cols">
                {/* ── Lo que le debes ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="pd-izq">
                    <p className="pnl-label">Le debes</p>
                    <p style={{
                        fontSize: 38, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05,
                        margin: '6px 0 0', fontVariantNumeric: 'tabular-nums',
                        color: debe > 0 ? 'var(--toul-text)' : 'var(--toul-accent)',
                    }}>
                        {formatCOP(debe)}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                        {debe === 0 ? 'Estás al día con este proveedor' : (
                            <>
                                {data.deudas.filter(d => Number(d.remaining_amount) > 0).length} compra(s) sin pagar
                                {vencidas > 0 && (
                                    <span style={{ color: 'var(--toul-error)', fontWeight: 600 }}>
                                        {' · '}{vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}
                                    </span>
                                )}
                            </>
                        )}
                    </p>

                    {debe > 0 && (
                        <button onClick={() => setPagar(true)}
                            style={{
                                marginTop: 16, height: 46, padding: '0 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
                                background: 'var(--toul-accent)', color: '#000', boxShadow: '0 4px 20px var(--toul-accent-glow)',
                            }}>
                            Registrar abono
                        </button>
                    )}

                    {data.compras.length > 0 && (
                        <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--toul-divider)' }}>
                            <p className="pnl-label">Le has comprado</p>
                            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCOP(comprado)}
                            </p>
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                {data.compras.length >= TOPE_COMPRAS
                                    ? `en las últimas ${TOPE_COMPRAS} compras`
                                    : `en ${data.compras.length} ${data.compras.length === 1 ? 'compra' : 'compras'} · desde el ${fecha(data.compras[data.compras.length - 1].created_at)}`}
                            </p>
                        </div>
                    )}
                </motion.div>

                {/* ── Todas las compras: de contado y a crédito ── */}
                <section style={{ marginTop: 28 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Compras</p>
                    {data.compras.length === 0 && sueltas.length === 0 ? (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', padding: '20px 10px', margin: 0 }}>
                            Todavía no le has registrado compras a este proveedor.
                        </p>
                    ) : (
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {data.compras.map(c => {
                                const d = deudaDe.get(c.id)
                                const unidades = (c.purchase_items ?? []).reduce((s, i) => s + Number(i.quantity), 0)
                                const refs = (c.purchase_items ?? []).length
                                const estado = estadoDeuda(d, c.is_credit)
                                return (
                                    <motion.div key={c.id} variants={staggerItem}>
                                        <button className="pd-fila" disabled={abriendo === c.id} onClick={() => abrirCompra(c.id)}>
                                            <span style={{
                                                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: estado.pendiente ? 'rgba(255,255,255,0.05)' : 'var(--toul-accent-dim)',
                                            }}>
                                                <Receipt size={14} style={{ color: estado.pendiente ? 'var(--toul-text-dim)' : 'var(--toul-accent)' }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>
                                                    {fecha(c.created_at)}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {refs} {refs === 1 ? 'producto' : 'productos'} · {unidades} und
                                                    {' · '}<span style={{ color: estado.color }}>{estado.texto}</span>
                                                </span>
                                            </span>
                                            <span style={{ flexShrink: 0, textAlign: 'right' }}>
                                                <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                    {abriendo === c.id ? '…' : formatCOP(Math.round(Number(c.total)))}
                                                </span>
                                                {estado.falta !== null && (
                                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--toul-warning)' }}>
                                                        faltan {formatCOP(estado.falta)}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </motion.div>
                                )
                            })}
                            {sueltas.map(d => {
                                const estado = estadoDeuda(d, true)
                                return (
                                    <motion.div key={d.id} variants={staggerItem}>
                                        <div className="pd-fila" style={{ cursor: 'default' }}>
                                            <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                                                <Receipt size={14} style={{ color: 'var(--toul-text-dim)' }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{fecha(d.created_at)}</span>
                                                <span style={{ display: 'block', fontSize: 11.5, color: estado.color }}>Deuda · {estado.texto}</span>
                                            </span>
                                            <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                {formatCOP(Math.round(Number(d.amount)))}
                                            </span>
                                        </div>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                    )}
                </section>
                </div>
            </div>

            <PurchaseDetail
                purchase={compra}
                onClose={() => setCompra(null)}
                onChanged={() => { setCompra(null); mutate() }}
            />

            {pagar && data.storeId && (
                <ProviderPaymentModal
                    storeId={data.storeId}
                    providerId={p.id}
                    providerName={p.name}
                    totalDebt={debe}
                    onClose={() => setPagar(false)}
                    onSuccess={() => mutate()}
                />
            )}
        </div>
    )
}
