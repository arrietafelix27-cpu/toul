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
`

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

function vencidoHace(iso: string) {
    const hoy = new Date(Date.now() - 5 * 3600_000); hoy.setHours(0, 0, 0, 0)
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    return Math.round((hoy.getTime() - d.getTime()) / 86400000)
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

export default function ProviderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [pagar, setPagar] = useState(false)
    const [compra, setCompra] = useState<PurchaseDetailData | null>(null)
    const [abriendo, setAbriendo] = useState<string | null>(null)

    const { data, isLoading, mutate } = useSWR(['proveedor', id], async () => {
        const [storeRes, provRes, deudasRes] = await Promise.all([
            supabase.from('stores').select('id').limit(1).single(),
            supabase.from('providers').select('*').eq('id', id).single(),
            supabase.from('provider_debts').select('id, purchase_id, amount, remaining_amount, due_date, status, created_at')
                .eq('provider_id', id).order('created_at', { ascending: false }).limit(40),
        ])
        return {
            storeId: storeRes.data?.id as string | undefined,
            provider: provRes.data,
            deudas: (deudasRes.data ?? []) as Deuda[],
        }
    }, { revalidateOnFocus: false })

    // Lo que de verdad le debes: lo que falta de cada compra
    const debe = useMemo(
        () => Math.round((data?.deudas ?? []).reduce((s, d) => s + Number(d.remaining_amount), 0)),
        [data?.deudas])

    const vencidas = useMemo(
        () => (data?.deudas ?? []).filter(d => Number(d.remaining_amount) > 0 && d.due_date && vencidoHace(d.due_date) > 0).length,
        [data?.deudas])

    async function abrirCompra(purchaseId: string) {
        setAbriendo(purchaseId)
        const { data: detalle, error } = await supabase.rpc('toul_purchase_detail', { p_purchase_id: purchaseId })
        setAbriendo(null)
        if (error || !detalle) { toast.error('No se pudo abrir esa compra'); return }
        setCompra(detalle as PurchaseDetailData)
    }

    if (isLoading || !data) {
        return <div className="px-4 pt-6" style={{ maxWidth: 760, margin: '0 auto' }}>
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
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

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

                {/* ── Lo que le debes ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible">
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
                </motion.div>

                {/* ── Las compras a crédito ── */}
                <section style={{ marginTop: 28 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Compras a crédito</p>
                    {data.deudas.length === 0 ? (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', padding: '20px 10px', margin: 0 }}>
                            No le has comprado a crédito. Todo lo que le has comprado lo pagaste de una.
                        </p>
                    ) : (
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {data.deudas.map(d => {
                                const falta = Math.round(Number(d.remaining_amount))
                                const pagada = falta <= 0
                                const vencido = d.due_date ? vencidoHace(d.due_date) : null

                                const detalle = pagada ? 'Pagada'
                                    : vencido === null ? 'sin plazo'
                                        : vencido > 0 ? `vencida hace ${dias(vencido)}`
                                            : vencido === 0 ? 'se vence hoy'
                                                : `vence en ${dias(-vencido)}`

                                const color = pagada ? 'var(--toul-accent)'
                                    : vencido !== null && vencido >= 0 ? 'var(--toul-error)'
                                        : 'var(--toul-text-dim)'

                                return (
                                    <motion.div key={d.id} variants={staggerItem}>
                                        <button className="pd-fila"
                                            disabled={!d.purchase_id || abriendo === d.purchase_id}
                                            onClick={() => d.purchase_id && abrirCompra(d.purchase_id)}>
                                            <span style={{
                                                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: pagada ? 'var(--toul-accent-dim)' : 'rgba(255,255,255,0.05)',
                                            }}>
                                                <Receipt size={14} style={{ color: pagada ? 'var(--toul-accent)' : 'var(--toul-text-dim)' }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>
                                                    {fecha(d.created_at)}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 11.5, color }}>
                                                    {detalle}
                                                </span>
                                            </span>
                                            <span style={{ flexShrink: 0, textAlign: 'right' }}>
                                                <span style={{
                                                    display: 'block', fontSize: 14, fontWeight: 700,
                                                    color: pagada ? 'var(--toul-text-dim)' : 'var(--toul-text)',
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {formatCOP(Math.round(Number(d.amount)))}
                                                </span>
                                                {!pagada && falta !== Math.round(Number(d.amount)) && (
                                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--toul-warning)' }}>
                                                        faltan {formatCOP(falta)}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                    )}
                </section>
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
