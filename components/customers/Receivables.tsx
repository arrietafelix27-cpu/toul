'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, CalendarClock, Check, MessageCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { onlyDigits, withThousands } from '@/lib/format/text'
import { Sheet } from '@/components/isla/Sheet'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { MetodoAbono } from '@/components/customers/MetodoAbono'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Cuentas por cobrar.

   No es la lista de todos los que te deben: es el orden en que
   hay que cobrarles. Tres grupos y nada más —

     hoy    le toca. Se le venció y no le has escrito, quedó de
            pagar hoy, o prometió y no cumplió.
     espera ya le escribiste, o prometió un día que no llega aún.
     plazo  está dentro del plazo. A este no se le cobra.

   Cada vez que le escribes queda anotado. Sin eso le escribes
   dos veces al mismo y nunca al que sí tocaba.
   ══════════════════════════════════════════════════════════════ */

interface Fila {
    id: string
    nombre: string
    telefono: string | null
    saldo: number
    vence: string | null
    diasVencido: number | null
    diasFiado: number | null
    fiados: number
    ultimoContacto: string | null
    diasContacto: number | null
    promesa: string | null
    promesaMonto: number | null
    grupo: 'hoy' | 'espera' | 'plazo'
    motivo: string
}

interface Cartera {
    total: number
    hoy: number
    diasMasVieja: number
    fiadoMes: number
    recuperadoMes: number
    clientes: Fila[]
}

const GRUPOS = [
    { key: 'hoy' as const, titulo: 'Por cobrar hoy', vacio: 'Hoy no hay a quién cobrarle.' },
    { key: 'espera' as const, titulo: 'En espera', vacio: '' },
    { key: 'plazo' as const, titulo: 'Dentro del plazo', vacio: '' },
]

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** El porqué de cada fila, en una línea */
function motivoTexto(f: Fila): string {
    switch (f.motivo) {
        case 'vencida': return `venció hace ${dias(f.diasVencido ?? 0)}`
        case 'vence_hoy': return 'se vence hoy'
        case 'promesa_hoy': return 'quedó de pagar hoy'
        case 'promesa_rota': return 'prometió y no pagó'
        case 'promesa': return `quedó de pagar el ${fechaCorta(f.promesa)}`
        case 'escrito': return `le escribiste hace ${dias(f.diasContacto ?? 0)}`
        default: return f.vence ? `se vence el ${fechaCorta(f.vence)}` : 'sin plazo'
    }
}

/** Rojo es lo que ya se pasó. Lo de hoy avisa, pero no es una falla. */
function colorMotivo(f: Fila) {
    if (f.motivo === 'vencida' || f.motivo === 'promesa_rota') return 'var(--toul-error)'
    if (f.grupo === 'hoy') return 'var(--toul-warning)'
    return 'var(--toul-text-dim)'
}

function fechaCorta(iso: string | null) {
    if (!iso) return ''
    return new Date(String(iso).slice(0, 10) + 'T12:00:00')
        .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Un día en formato de input, en hora de Colombia */
function diaISO(sumar = 0) {
    const d = new Date(Date.now() - 5 * 3600_000)
    d.setDate(d.getDate() + sumar)
    return d.toISOString().slice(0, 10)
}

const CSS = `
.cob-wrap { container-type: inline-size; }

/* En el celular la fila no da para nombre + plata + dos botones: el
   nombre se cortaba casi entero. La plata baja a la segunda línea y
   WhatsApp se queda en la hoja del cobro, a un toque. */
.cob-monto-sm { display: none; }
@container (max-width: 430px) {
    .cob-monto-sm { display: inline; font-weight: 700; color: var(--toul-text); }
    .cob-monto-lg, .cob-wa { display: none !important; }
}

.cob-hero { border-radius: 22px; padding: 20px 22px;
    background: linear-gradient(180deg, var(--toul-surface) 0%, transparent 100%);
    border: 1px solid var(--toul-border); border-bottom-color: transparent; }

.cob-grupo { display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
    padding: 0 10px; margin: 22px 0 6px; }

.cob-fila { display: flex; align-items: center; gap: 11px; width: 100%;
    padding: 10px; border-radius: 14px; border: none; background: none;
    font-family: inherit; text-align: left; cursor: pointer; color: inherit;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.cob-fila:active { transform: scale(0.99); }

.cob-ini { width: 38px; height: 38px; border-radius: 13px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 600; letter-spacing: -0.02em;
    background: var(--toul-surface-2); color: var(--toul-text-muted); }

.cob-acc { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 32px; flex-shrink: 0; border-radius: 10px; cursor: pointer; font-family: inherit;
    font-size: 12px; font-weight: 600; letter-spacing: -0.01em;
    border: 1px solid var(--toul-border); background: var(--toul-surface);
    color: var(--toul-text-muted);
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 140ms cubic-bezier(0.23,1,0.32,1); }
.cob-acc:active { transform: scale(0.96); }

.cob-barra { display: block; position: relative; height: 4px; border-radius: 999px;
    overflow: hidden; background: rgba(255,255,255,0.07); }
.cob-barra > i { position: absolute; inset: 0 auto 0 0; border-radius: 999px;
    transition: transform 420ms cubic-bezier(0.23,1,0.32,1); transform-origin: left center; }

@media (hover: hover) and (pointer: fine) {
    .cob-fila:hover { background: rgba(255,255,255,0.04); }
    .cob-acc:hover { background: rgba(255,255,255,0.1); color: var(--toul-text);
        border-color: rgba(255,255,255,0.18); }
}
@media (prefers-reduced-motion: reduce) {
    .cob-fila:active, .cob-acc:active { transform: none; }
    .cob-barra > i { transition: none; }
}
`

export function Receivables() {
    const { data, isLoading, error, mutate } = useSWR<Cartera>('cartera', async () => {
        const { data, error } = await supabase.rpc('toul_receivables')
        if (error) throw error
        return data as Cartera
    }, { revalidateOnFocus: true })

    const [abierta, _setAbierta] = useState<Fila | null>(null)
    const setAbierta = (f: Fila | null) => {
        if (f) setFecha(diaISO(3))   // cada cobro arranca con su propia sugerencia
        _setAbierta(f)
    }
    const [abonoDe, setAbonoDe] = useState<Fila | null>(null)
    const [monto, setMonto] = useState('')
    const [metodo, setMetodo] = useState<string | null>(null)
    const [fecha, setFecha] = useState(diaISO(3))
    const [guardando, setGuardando] = useState(false)

    const porGrupo = useMemo(() => {
        const m: Record<string, Fila[]> = { hoy: [], espera: [], plazo: [] }
        for (const f of data?.clientes ?? []) m[f.grupo]?.push(f)
        return m
    }, [data?.clientes])

    /** Deja constancia de que le escribiste y abre el chat */
    async function escribir(f: Fila) {
        const texto = `Hola ${f.nombre} 👋\n\nTe recuerdo tu saldo pendiente: *${formatCOP(f.saldo)}*.\n\n¿Me confirmas cuándo puedes abonar?`
        if (f.telefono) {
            window.open(`https://wa.me/${f.telefono.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`, '_blank')
        } else {
            toast.error(`${f.nombre} no tiene teléfono guardado`)
            return
        }
        // La tienda la deduce la base desde el cliente. Si esto falla,
        // el chat ya se abrió: lo único que se pierde es la constancia
        const { error } = await supabase.from('customer_contacts')
            .insert({ customer_id: f.id, kind: 'contacto', channel: 'whatsapp' })
        if (!error) mutate()
    }

    async function registrarAbono() {
        if (!abonoDe) return
        const amount = Number(onlyDigits(monto))
        if (!amount || amount <= 0) { toast.error('Escribe cuánto abonó'); return }
        if (amount > abonoDe.saldo) { toast.error(`No puede abonar más de ${formatCOP(abonoDe.saldo)}`); return }
        if (!metodo) { toast.error('Elige por dónde te pagó'); return }

        setGuardando(true)
        const res = await fetch('/api/customers/payment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: abonoDe.id, amount, methodId: metodo, notes: `Abono de ${abonoDe.nombre}` }),
        })
        const out = await res.json().catch(() => ({}))
        setGuardando(false)
        if (!res.ok) { toast.error(out?.error || 'No se pudo registrar el abono'); return }

        toast.success(`Abono de ${formatCOP(amount)} registrado`)
        setAbonoDe(null); setMonto(''); setMetodo(null); setAbierta(null)
        mutate()
    }

    async function guardarCompromiso() {
        if (!abierta) return
        setGuardando(true)
        const { error } = await supabase.from('customer_contacts')
            .insert({ customer_id: abierta.id, kind: 'compromiso', promised_date: fecha })
        setGuardando(false)
        if (error) { toast.error('No se pudo guardar el compromiso'); return }
        toast.success(`${abierta.nombre} queda para el ${fechaCorta(fecha)}`)
        setAbierta(null)
        mutate()
    }

    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Skeleton height="150px" className="rounded-2xl" />
                {[1, 2, 3].map(n => <Skeleton key={n} height="58px" className="rounded-2xl" />)}
            </div>
        )
    }

    // Sin esto, un error se vería igual que una cartera en cero: la
    // pantalla diría que nadie te debe cuando lo que pasó es que no
    // se pudo leer
    if (error || !data) {
        return (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '15px 16px', borderRadius: 18, background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)' }}>
                <style>{CSS}</style>
                <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        No se pudo leer tu cartera
                    </p>
                    <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '3px 0 10px', lineHeight: 1.5 }}>
                        No te mostramos un cero para que no creas que nadie te debe.
                    </p>
                    <button className="cob-acc" style={{ padding: '0 13px' }} onClick={() => mutate()}>
                        Volver a intentar
                    </button>
                </div>
            </div>
        )
    }

    const c = data ?? { total: 0, hoy: 0, diasMasVieja: 0, fiadoMes: 0, recuperadoMes: 0, clientes: [] }
    const cuantos = c.clientes.length
    const huboMes = Number(c.fiadoMes) > 0 || Number(c.recuperadoMes) > 0
    const sano = Number(c.recuperadoMes) >= Number(c.fiadoMes)
    const tope = Math.max(Number(c.fiadoMes), Number(c.recuperadoMes), 1)

    return (
        <>
            <style>{PANEL_CSS + CSS}</style>

            {/* ── Cuánta plata está afuera ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="cob-hero">
                <p className="pnl-label">Por cobrar</p>
                <p style={{
                    fontSize: 38, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05,
                    margin: '6px 0 0', color: cuantos > 0 ? 'var(--toul-text)' : 'var(--toul-accent)',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {formatCOP(Number(c.total))}
                </p>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                    {cuantos === 0 ? 'Nadie te debe nada' : (
                        <>
                            {cuantos} {cuantos === 1 ? 'cliente' : 'clientes'}
                            {c.diasMasVieja > 0 && <> · la más vieja lleva {dias(c.diasMasVieja)}</>}
                        </>
                    )}
                </p>

                {/* ── ¿Fías más de lo que recuperas? ── */}
                <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--toul-divider)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 9 }}>
                        <p className="pnl-label">Este mes</p>
                        {/* Sin movimiento no hay veredicto: decir "recuperas más
                            de lo que fías" con todo en cero sería mentira */}
                        {huboMes && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: 11.5, fontWeight: 600, letterSpacing: '-0.01em',
                                color: sano ? 'var(--toul-accent)' : 'var(--toul-warning)',
                            }}>
                                {sano ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                {sano ? 'Recuperas más de lo que fías' : 'Fías más de lo que recuperas'}
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {[
                            { label: 'Fiaste', valor: Number(c.fiadoMes), color: 'var(--toul-text-muted)' },
                            { label: 'Recuperaste', valor: Number(c.recuperadoMes), color: 'var(--toul-accent)' },
                        ].map(l => (
                            <div key={l.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                    <span style={{ fontSize: 12.5, color: 'var(--toul-text-dim)' }}>{l.label}</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCOP(l.valor)}
                                    </span>
                                </div>
                                <span className="cob-barra">
                                    <i style={{ background: l.color, width: '100%', transform: `scaleX(${l.valor / tope})` }} />
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* ── Los tres grupos ── */}
            <div className="cob-wrap">
            {cuantos === 0 ? (
                <div style={{ textAlign: 'center', padding: '42px 16px' }}>
                    <Check size={30} style={{ color: 'var(--toul-accent)', margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        Tu cartera está en cero
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                        Nadie te debe plata. Así se trabaja.
                    </p>
                </div>
            ) : GRUPOS.map(g => {
                const filas = porGrupo[g.key] ?? []
                if (filas.length === 0 && !g.vacio) return null
                const suma = filas.reduce((s, f) => s + Number(f.saldo), 0)

                return (
                    <section key={g.key}>
                        <div className="cob-grupo">
                            <p className="pnl-label">
                                {g.titulo}{filas.length > 0 && <> · {filas.length}</>}
                            </p>
                            {suma > 0 && (
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--toul-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCOP(suma)}
                                </span>
                            )}
                        </div>

                        {filas.length === 0 ? (
                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', padding: '10px 10px 2px', margin: 0 }}>
                                {g.vacio}
                            </p>
                        ) : (
                            <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                                style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                {filas.map(f => (
                                    <motion.div key={f.id} variants={staggerItem}>
                                        <div className="cob-fila" role="button" tabIndex={0}
                                            onClick={() => setAbierta(f)}
                                            onKeyDown={e => { if (e.key === 'Enter') setAbierta(f) }}>
                                            <span className="cob-ini">{f.nombre[0]?.toUpperCase()}</span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {f.nombre}
                                                </span>
                                                <span style={{
                                                    display: 'block', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    color: colorMotivo(f),
                                                }}>
                                                    <span className="cob-monto-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatCOP(Number(f.saldo))} ·{' '}
                                                    </span>
                                                    {motivoTexto(f)}
                                                </span>
                                            </span>
                                            <span className="cob-monto-lg" style={{ fontSize: 14.5, fontWeight: 700, flexShrink: 0, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                {formatCOP(Number(f.saldo))}
                                            </span>
                                            {/* El hueco se reserva aunque no haya teléfono: si no,
                                                esa fila corre la plata y se pierde la columna */}
                                            <span className="cob-wa" style={{ width: 32, flexShrink: 0 }}>
                                                {f.telefono && (
                                                    <button className="cob-acc" style={{ width: 32 }}
                                                        aria-label={`Escribirle a ${f.nombre}`}
                                                        onClick={e => { e.stopPropagation(); escribir(f) }}>
                                                        <MessageCircle size={14} />
                                                    </button>
                                                )}
                                            </span>
                                            <button className="cob-acc" style={{ padding: '0 11px' }}
                                                onClick={e => { e.stopPropagation(); setAbonoDe(f); setMonto('') }}>
                                                Abonar
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </section>
                )
            })}
            </div>

            {/* ── El cobro de una persona ── */}
            <Sheet open={!!abierta} onClose={() => setAbierta(null)}
                title={abierta?.nombre ?? ''}
                subtitle={abierta ? `Debe ${formatCOP(Number(abierta.saldo))} · ${motivoTexto(abierta)}` : ''}>
                {abierta && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Dato label="Fiados sin pagar" valor={`${abierta.fiados}`} />
                            {abierta.diasFiado != null && <Dato label="El más viejo lleva" valor={dias(abierta.diasFiado)} />}
                            {abierta.vence && (
                                <Dato
                                    label={(abierta.diasVencido ?? 0) >= 0 ? 'Se venció el' : 'Se vence el'}
                                    valor={fechaCorta(abierta.vence)} />
                            )}
                            <Dato label="Última vez que le escribiste"
                                valor={abierta.diasContacto == null ? 'Nunca' : `hace ${dias(abierta.diasContacto)}`} />
                            {abierta.promesa && <Dato label="Quedó de pagar el" valor={fechaCorta(abierta.promesa)} />}
                        </div>

                        <div>
                            <p className="pnl-label" style={{ marginBottom: 8 }}>Quedó de pagar</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input type="date" className="toul-input" value={fecha}
                                    min={diaISO(0)} onChange={e => setFecha(e.target.value)}
                                    style={{ flex: 1 }} />
                                <button className="cob-acc" disabled={guardando}
                                    style={{ padding: '0 14px', height: 'auto' }}
                                    onClick={guardarCompromiso}>
                                    <CalendarClock size={14} /> {guardando ? 'Guardando…' : 'Anotar'}
                                </button>
                            </div>
                            <p style={{ fontSize: 11.5, color: 'var(--toul-text-dim)', margin: '7px 0 0', lineHeight: 1.45 }}>
                                Sale de la lista de hoy y vuelve de primero ese día.
                            </p>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { setAbonoDe(abierta); setMonto(''); setAbierta(null) }}
                                style={{
                                    flex: 1, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer',
                                    fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
                                    background: 'var(--toul-accent)', color: '#000',
                                }}>
                                Registrar abono
                            </button>
                            {abierta.telefono && (
                                <button className="cob-acc" style={{ height: 46, padding: '0 15px' }}
                                    onClick={() => escribir(abierta)}>
                                    <MessageCircle size={15} /> Escribirle
                                </button>
                            )}
                        </div>

                        <Link href={`/customers/${abierta.id}`} className="pnl-link" style={{ alignSelf: 'flex-start' }}>
                            Ver su ficha <ArrowRight size={13} />
                        </Link>
                    </div>
                )}
            </Sheet>

            {/* ── Abono ── */}
            <Sheet open={!!abonoDe} onClose={() => setAbonoDe(null)}
                title="Registrar abono"
                subtitle={abonoDe ? `${abonoDe.nombre} debe ${formatCOP(Number(abonoDe.saldo))}` : ''}
                footer={
                    <button onClick={registrarAbono} disabled={guardando} className="w-full"
                        style={{
                            height: 50, borderRadius: 14, border: 'none', fontFamily: 'inherit',
                            fontSize: 15, fontWeight: 600, cursor: 'pointer',
                            background: 'var(--toul-accent)', color: '#000',
                        }}>
                        {guardando ? 'Guardando…' : 'Registrar abono'}
                    </button>
                }>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--toul-text-muted)', marginBottom: 7 }}>
                    ¿Cuánto abonó?
                </label>
                <input className="toul-input" type="text" inputMode="numeric" autoFocus placeholder="0"
                    value={withThousands(onlyDigits(monto))}
                    onChange={e => setMonto(onlyDigits(e.target.value))} />
                {abonoDe && (
                    <button className="cob-acc" style={{ marginTop: 10, padding: '0 13px' }}
                        onClick={() => setMonto(String(Math.round(Number(abonoDe.saldo))))}>
                        Abonó todo ({formatCOP(Number(abonoDe.saldo))})
                    </button>
                )}
                <MetodoAbono valor={metodo} onCambio={setMetodo} />
            </Sheet>
        </>
    )
}

function Dato({ label, valor }: { label: string; valor: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 2px', borderBottom: '1px solid var(--toul-divider)' }}>
            <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>{label}</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)' }}>{valor}</span>
        </div>
    )
}
