'use client'

import { use, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowLeft, Check, MessageCircle, Receipt, Share2, Trash2, Undo2, Wrench } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { capitalizeFirst, onlyDigits, withThousands } from '@/lib/format/text'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { SaleDetail } from '@/components/ventas/SaleDetail'
import { SALE_DETAIL_SELECT } from '@/lib/types'
import type { SaleDetailData } from '@/lib/types'
import { explainError } from '@/lib/errors'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Ficha del cliente.
   La deuda vive en un campo aparte; los movimientos son la verdad.
   Cuando los dos no coinciden, la pantalla lo dice en vez de
   mostrar un número y callarse.
   ══════════════════════════════════════════════════════════════ */

interface Movimiento {
    id: string
    type: 'debt' | 'payment' | 'void' | string
    amount: number
    notes: string | null
    sale_id: string | null
    created_at: string
}

interface Perfil {
    compras: number
    gastado: number
    ticket: number
    primera: string | null
    ultima: string | null
    dias: number | null
    favoritos: { nombre: string; unidades: number; monto: number }[]
    contactos: { id: string; tipo: string; canal: string | null; promesa: string | null; nota: string | null; cerrado: string | null; cuando: string }[]
    plazoDias: number
}

const LABEL: Record<string, string> = {
    debt: 'Fiado',
    payment: 'Abono',
    void: 'Venta anulada',
}

/** Las ventas se identifican por sus 8 primeros caracteres */
const numero = (id: string) => `#${id.slice(0, 8).toUpperCase()}`

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()

    const [payOpen, setPayOpen] = useState(false)
    const [payAmount, setPayAmount] = useState('')
    const [saving, setSaving] = useState(false)
    const [removeOpen, setRemoveOpen] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [fixing, setFixing] = useState(false)
    const [venta, setVenta] = useState<SaleDetailData | null>(null)
    const [abriendo, setAbriendo] = useState<string | null>(null)
    const [deshacer, setDeshacer] = useState<Movimiento | null>(null)
    const [deshaciendo, setDeshaciendo] = useState(false)
    const [nota, setNota] = useState<string | null>(null)
    const [notaSaving, setNotaSaving] = useState(false)

    const { data, isLoading, mutate } = useSWR(['cliente', id], async () => {
        const [storeRes, customerRes, movesRes, salesRes, perfilRes] = await Promise.all([
            supabase.from('stores').select('id, name').limit(1).single(),
            supabase.from('customers').select('*').eq('id', id).single(),
            supabase.from('credits').select('id, type, amount, notes, sale_id, created_at')
                .eq('customer_id', id).order('created_at', { ascending: false }),
            supabase.from('sales').select('id, created_at, total, is_credit')
                .eq('customer_id', id).order('created_at', { ascending: false }),
            supabase.rpc('toul_customer_profile', { p_customer_id: id }),
        ])
        return {
            store: storeRes.data,
            customer: customerRes.data,
            movimientos: (movesRes.data ?? []) as Movimiento[],
            ventas: salesRes.data ?? [],
            perfil: (perfilRes.data ?? null) as Perfil | null,
        }
    }, { revalidateOnFocus: false })

    // Lo que dicen los movimientos, que es lo que de verdad pasó
    const calculada = useMemo(() => {
        const total = (data?.movimientos ?? []).reduce(
            (sum, m) => sum + (m.type === 'debt' ? Number(m.amount) : -Number(m.amount)), 0)
        return Math.max(Math.round(total), 0)
    }, [data?.movimientos])

    // Una venta a crédito siempre deja su fiado. Si falta, hay que
    // decirlo: es la única forma de que no se pierda de vista.
    const ventasSinMovimiento = useMemo(() => {
        const conMovimiento = new Set((data?.movimientos ?? []).filter(m => m.sale_id).map(m => m.sale_id as string))
        return (data?.ventas ?? []).filter(v => v.is_credit && !conMovimiento.has(v.id))
    }, [data?.movimientos, data?.ventas])

    if (isLoading || !data) {
        return <div className="px-4 pt-6 max-w-2xl mx-auto"><div className="skeleton" style={{ height: 180, borderRadius: 20 }} /></div>
    }
    if (!data.customer) {
        return <div className="px-4 pt-10 text-center" style={{ color: 'var(--toul-text-muted)' }}>Cliente no encontrado</div>
    }

    const customer = data.customer
    const perfil = data.perfil
    const guardada = Math.round(Number(customer.total_debt) || 0)
    const descuadrada = guardada !== calculada

    async function registrarAbono() {
        const amount = Number(onlyDigits(payAmount))
        if (!amount || amount <= 0) { toast.error('Escribe cuánto abonó'); return }
        if (amount > calculada) { toast.error(`No puede abonar más de ${formatCOP(calculada)}`); return }

        setSaving(true)
        // Por el endpoint, que lo hace todo junto: antes la pantalla
        // escribía el movimiento y la deuda por separado, y si una
        // fallaba el saldo quedaba mal
        const response = await fetch('/api/customers/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: id, amount, notes: `Abono de ${customer.name}` }),
        })
        const result = await response.json().catch(() => ({}))
        setSaving(false)
        if (!response.ok) { toast.error(result?.error || 'No se pudo registrar el abono'); return }

        setPayOpen(false); setPayAmount('')
        await mutate()
        toast.success(`Abono de ${formatCOP(amount)} registrado`)
    }

    async function cuadrar() {
        setFixing(true)
        const { error } = await supabase.rpc('toul_recalc_customer_debt', { p_customer_id: id })
        setFixing(false)
        if (error) { toast.error(explainError(error)); return }
        await mutate()
        toast.success('La deuda quedó igual a los movimientos')
    }

    async function quitar() {
        setRemoving(true)
        const { data: res, error } = await supabase.rpc('toul_remove_customer', { p_customer_id: id })
        setRemoving(false)
        if (error) { toast.error(explainError(error, 'No se pudo quitar el cliente.')); return }
        setRemoveOpen(false)
        toast.success(res?.deleted ? `${res.name} fue borrado` : `${res?.name ?? 'El cliente'} ya no aparece en la lista`)
        router.push('/customers')
    }

    // El resumen se pide cuando lo tocas, no al abrir la ficha: un
    // cliente con cuarenta compras la volvería lenta de entrada
    async function abrirVenta(saleId: string) {
        setAbriendo(saleId)
        const pedir = (select: string) =>
            supabase.from('sales').select(select).eq('id', saleId).single()
        // seller_name existe desde el modo isla; si falta, se reintenta sin él
        let { data, error } = await pedir(`${SALE_DETAIL_SELECT}, seller_name`)
        if (error) ({ data, error } = await pedir(SALE_DETAIL_SELECT))
        setAbriendo(null)
        if (error || !data) { toast.error('No se pudo abrir esa venta'); return }
        setVenta(data as unknown as SaleDetailData)
    }

    // Un abono mal puesto descuadraba al cliente para siempre. Al
    // deshacerlo vuelve la deuda y la plata sale de la caja.
    async function deshacerAbono() {
        if (!deshacer) return
        setDeshaciendo(true)
        const { error } = await supabase.rpc('toul_undo_payment', { p_credit_id: deshacer.id })
        setDeshaciendo(false)
        if (error) { toast.error(explainError(error, 'No se pudo deshacer el abono.')); return }
        setDeshacer(null)
        await mutate()
        toast.success('El abono se deshizo')
    }

    // Lo que no cabe en ningún campo: "la mamá de Juan",
    // "paga los viernes". Se guarda al salir del cuadro.
    async function guardarNota() {
        const texto = (nota ?? '').trim()
        if (texto === (customer.notes ?? '').trim()) return
        setNotaSaving(true)
        const { error } = await supabase.from('customers')
            .update({ notes: texto || null }).eq('id', id)
        setNotaSaving(false)
        if (error) { toast.error('No se pudo guardar la nota'); return }
        await mutate()
        toast.success('Nota guardada')
    }

    function porWhatsApp() {
        if (!customer.phone) return
        const msg = `Hola ${customer.name} 👋\n\nTe envío tu estado de cuenta de *${data!.store?.name ?? ''}*:\n\nSaldo pendiente: *${formatCOP(calculada)}*\n\nGracias por tu confianza 🙏`
        window.open(`https://wa.me/${customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl lg:max-w-[1040px] mx-auto" style={{ position: 'relative' }}>
            <style>{PANEL_CSS}</style>
            <div className="toul-ambient" />

            {/* ── Encabezado ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, position: 'relative' }}>
                <Link href="/customers" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {customer.name}
                    </h1>
                    {customer.phone && (
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: 0 }}>{customer.phone}</p>
                    )}
                </div>
                {customer.phone && (
                    <button onClick={porWhatsApp} className="pnl-pill" aria-label="Enviar estado de cuenta">
                        <Share2 size={13} /> Enviar
                    </button>
                )}
                <button onClick={() => setRemoveOpen(true)} className="pnl-pill" aria-label="Quitar cliente" style={{ padding: '0 10px' }}>
                    <Trash2 size={13} />
                </button>
            </div>

            {/* PC: quién es y cuánto debe a la izquierda; qué ha pasado a la derecha.
                En una sola columna, en pantalla grande, quedaba media pantalla vacía */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 lg:items-start">
            <div>
            {/* ── Lo que debe ── */}
            <div style={{ borderRadius: 20, padding: '20px 22px', background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', textAlign: 'center' }}>
                <p className="pnl-label" style={{ marginBottom: 6 }}>Saldo pendiente</p>
                <p style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.04em', margin: 0, lineHeight: 1.1, color: calculada > 0 ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                    {formatCOP(calculada)}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                    {data.movimientos.length} {data.movimientos.length === 1 ? 'movimiento' : 'movimientos'} · {data.ventas.length} {data.ventas.length === 1 ? 'venta' : 'ventas'}
                </p>

                {calculada > 0 && (
                    <button onClick={() => setPayOpen(true)}
                        style={{
                            marginTop: 14, height: 46, width: '100%', borderRadius: 14, border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
                            background: 'var(--toul-accent)', color: '#000', boxShadow: '0 4px 20px var(--toul-accent-glow)',
                        }}>
                        Registrar abono
                    </button>
                )}
                {calculada > 0 && (
                    <Link href="/customers?ver=cobros" className="pnl-link"
                        style={{ marginTop: 10, justifyContent: 'center', width: '100%' }}>
                        Ver en Cuentas por cobrar →
                    </Link>
                )}
            </div>

            {/* ── Cuando la ficha no coincide con lo que pasó ── */}
            {descuadrada && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, padding: '13px 15px', borderRadius: 16, background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)' }}>
                    <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            La ficha dice {formatCOP(guardada)}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0', lineHeight: 1.45 }}>
                            pero los movimientos suman {formatCOP(calculada)}. Lo que manda son los movimientos.
                        </p>
                    </div>
                    <button onClick={cuadrar} disabled={fixing} className="pnl-pill">
                        <Wrench size={13} /> {fixing ? 'Cuadrando…' : 'Cuadrar'}
                    </button>
                </div>
            )}

            {ventasSinMovimiento.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, padding: '13px 15px', borderRadius: 16, background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)' }}>
                    <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            {ventasSinMovimiento.length} {ventasSinMovimiento.length === 1 ? 'venta a crédito sin fiado' : 'ventas a crédito sin fiado'}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0', lineHeight: 1.45 }}>
                            Está en sus compras pero no sumó a la deuda. Ábrela abajo y avísame.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Qué tan buen cliente es ── */}
            {perfil && perfil.compras > 0 && (
                <section style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
                    borderRadius: 16, overflow: 'hidden', background: 'var(--toul-divider)' }}>
                    {[
                        { label: 'Compras', valor: String(perfil.compras) },
                        { label: 'Te ha comprado', valor: formatCOP(Number(perfil.gastado)) },
                        { label: 'Compra promedio', valor: formatCOP(Number(perfil.ticket)) },
                    ].map(d => (
                        <div key={d.label} style={{ background: 'var(--toul-surface)', padding: '13px 12px', textAlign: 'center' }}>
                            <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--toul-text)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {d.valor}
                            </p>
                            <p className="pnl-label" style={{ marginTop: 3, letterSpacing: '0.06em' }}>{d.label}</p>
                        </div>
                    ))}
                </section>
            )}

            {/* ── Qué le gusta comprar ── */}
            {perfil && perfil.favoritos.length > 0 && (
                <section style={{ marginTop: 22 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Lo que compra</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {perfil.favoritos.map(f => (
                            <div key={f.nombre} className="pnl-row" style={{ cursor: 'default' }}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {f.nombre}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                                        {f.unidades} {Number(f.unidades) === 1 ? 'unidad' : 'unidades'}
                                    </span>
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCOP(Number(f.monto))}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Lo que hay que saber de esta persona ── */}
            <section style={{ marginTop: 22 }}>
                <p className="pnl-label" style={{ marginBottom: 8 }}>Notas</p>
                <textarea
                    value={nota ?? customer.notes ?? ''}
                    onChange={e => setNota(capitalizeFirst(e.target.value))}
                    onBlur={guardarNota}
                    placeholder="La mamá de Juan · paga los viernes · le gustan los dulces"
                    rows={2}
                    className="toul-input"
                    style={{ resize: 'vertical', lineHeight: 1.5, minHeight: 62, paddingTop: 11, paddingBottom: 11 }} />
                {notaSaving && (
                    <p style={{ fontSize: 11.5, color: 'var(--toul-text-dim)', margin: '5px 0 0' }}>Guardando…</p>
                )}
            </section>

            </div>
            <div className="lg:[&>*:first-child]:mt-0!">
            {/* ── Qué le has dicho ── */}
            {perfil && perfil.contactos.length > 0 && (
                <section style={{ marginTop: 22 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Cobros</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {perfil.contactos.slice(0, 6).map(c => (
                            <div key={c.id} className="pnl-row" style={{ cursor: 'default' }}>
                                <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>
                                    <MessageCircle size={14} style={{ color: 'var(--toul-text-dim)' }} />
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)' }}>
                                        {c.tipo === 'compromiso'
                                            ? `Quedó de pagar el ${new Date(String(c.promesa).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}`
                                            : 'Le escribiste'}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                                        {fecha(c.cuando)}{c.tipo === 'compromiso' && c.cerrado ? ' · cumplido' : ''}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ── Todo lo que pasó ── */}
            <section style={{ marginTop: 22 }}>
                <p className="pnl-label" style={{ marginBottom: 8 }}>Movimientos</p>
                {data.movimientos.length === 0 ? (
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '24px 10px', margin: 0 }}>
                        Este cliente no tiene fiados ni abonos.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {data.movimientos.map(m => {
                            const esFiado = m.type === 'debt'
                            const row = (
                                <>
                                    <span style={{
                                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: esFiado ? 'rgba(239,68,68,0.12)' : 'var(--toul-accent-dim)',
                                    }}>
                                        {esFiado ? <Receipt size={15} style={{ color: 'var(--toul-error)' }} />
                                            : <Check size={15} style={{ color: 'var(--toul-accent)' }} />}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>
                                            {LABEL[m.type] ?? 'Movimiento'}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {fecha(m.created_at)}{m.sale_id ? ` · ${numero(m.sale_id)}` : ''}
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 14.5, fontWeight: 700, flexShrink: 0, color: esFiado ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                        {esFiado ? '+' : '−'}{formatCOP(Number(m.amount))}
                                    </span>
                                    {m.type === 'payment' && (
                                        <button className="pnl-pill" style={{ padding: '0 9px', flexShrink: 0 }}
                                            aria-label="Deshacer este abono"
                                            onClick={e => { e.preventDefault(); e.stopPropagation(); setDeshacer(m) }}>
                                            <Undo2 size={13} />
                                        </button>
                                    )}
                                </>
                            )
                            return m.sale_id
                                ? <button key={m.id} className="pnl-row" style={{ border: 'none', background: 'none', font: 'inherit', textAlign: 'left', width: '100%' }}
                                    disabled={abriendo === m.sale_id}
                                    onClick={() => abrirVenta(m.sale_id!)}>{row}</button>
                                : <div key={m.id} className="pnl-row" style={{ cursor: 'default' }}>{row}</div>
                        })}
                    </div>
                )}
            </section>

            {/* ── Sus ventas ── */}
            {data.ventas.length > 0 && (
                <section style={{ marginTop: 22 }}>
                    <p className="pnl-label" style={{ marginBottom: 8 }}>Sus compras</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {data.ventas.map(v => (
                            <button key={v.id} className="pnl-row"
                                style={{ border: 'none', background: 'none', font: 'inherit', textAlign: 'left', width: '100%' }}
                                disabled={abriendo === v.id}
                                onClick={() => abrirVenta(v.id)}>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>
                                        {fecha(v.created_at)}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 11.5, color: v.is_credit ? 'var(--toul-warning)' : 'var(--toul-text-dim)' }}>
                                        {numero(v.id)}{v.is_credit ? ' · a crédito' : ''}
                                    </span>
                                </span>
                                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--toul-text)' }}>
                                    {abriendo === v.id ? '…' : formatCOP(Number(v.total))}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            </div>
            </div>

            {/* ── Abono ── */}
            <Sheet open={payOpen} onClose={() => setPayOpen(false)}
                title="Registrar abono"
                subtitle={`${customer.name} debe ${formatCOP(calculada)}`}
                footer={
                    <button onClick={registrarAbono} disabled={saving} className="w-full"
                        style={{
                            height: 50, borderRadius: 14, border: 'none', fontFamily: 'inherit',
                            fontSize: 15, fontWeight: 600, cursor: 'pointer',
                            background: 'var(--toul-accent)', color: '#000',
                        }}>
                        {saving ? 'Guardando…' : 'Registrar abono'}
                    </button>
                }>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--toul-text-muted)', marginBottom: 7 }}>
                    ¿Cuánto abonó?
                </label>
                <input className="toul-input" type="text" inputMode="numeric" autoFocus placeholder="0"
                    value={withThousands(onlyDigits(payAmount))}
                    onChange={e => setPayAmount(onlyDigits(e.target.value))} />
                <button onClick={() => setPayAmount(String(calculada))}
                    style={{
                        marginTop: 10, height: 34, padding: '0 13px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                        background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--toul-text-muted)', fontSize: 12.5, fontWeight: 600,
                    }}>
                    Abonó todo ({formatCOP(calculada)})
                </button>
            </Sheet>

            {/* El mismo resumen que se abre desde Ventas. Sin el bloque de
                cliente, que aquí sobra, y sin anular: eso mueve inventario,
                caja y deuda, y se queda en Ventas. */}
            <SaleDetail
                sale={venta}
                onClose={() => setVenta(null)}
                mostrarCliente={false}
                verEnVentas
            />

            <ConfirmSheet
                open={!!deshacer}
                onClose={() => setDeshacer(null)}
                onConfirm={deshacerAbono}
                busy={deshaciendo}
                danger
                title="¿Deshacer este abono?"
                message={deshacer
                    ? `${customer.name} volverá a deber ${formatCOP(Number(deshacer.amount))}, y esa plata sale de la caja.`
                    : ''}
                confirmLabel="Deshacer abono"
            />

            <ConfirmSheet
                open={removeOpen}
                onClose={() => setRemoveOpen(false)}
                onConfirm={quitar}
                busy={removing}
                danger
                title={`¿Quitar a ${customer.name}?`}
                message={
                    calculada > 0
                        ? `Todavía te debe ${formatCOP(calculada)}. Registra el abono antes de quitarlo.`
                        : 'Si nunca le has vendido, se borra. Si ya tiene ventas, desaparece de la lista y de la caja, pero su historial se conserva.'
                }
                confirmLabel="Quitar cliente"
            />
        </div>
    )
}
