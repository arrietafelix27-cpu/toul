'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Lock, Printer, Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { CashSummary } from '@/components/isla/CashSummary'
import { Sheet } from '@/components/isla/Sheet'
import { PriceField } from '@/components/ui'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { printCashClose } from '@/lib/isla/receipt'
import { fadeUp } from '@/lib/motion'
import type { CashSession, CashSessionSummary } from '@/lib/isla/types'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Turnos de caja.

   La pregunta de esta pantalla es una sola: ¿cuánto efectivo
   debería haber en el cajón ahora mismo? No es ganancia —es
   físico, es la plata que alguien puede contar con la mano— y por
   eso no se presta para confusión.

   El turno abierto manda; los cerrados son historia. Antes el
   turno en curso era una fila más de una lista, con el dato que
   importa escondido adentro de una hoja.
   ══════════════════════════════════════════════════════════════ */

const CSS = PANEL_CSS + `
.tn-sep { height: 1px; margin: 28px 0 0; background: var(--toul-divider); border: none;
    -webkit-mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent);
    mask-image: linear-gradient(to right, transparent, #000 10%, #000 90%, transparent); }

.tn-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 10px;
    border-radius: 14px; border: none; background: none; font: inherit; color: inherit;
    text-align: left; cursor: pointer;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.tn-fila:active { transform: scale(0.99); }

.tn-barra { display: block; position: relative; height: 5px; border-radius: 999px;
    overflow: hidden; background: rgba(255,255,255,0.055); }
.tn-barra > i { display: block; height: 100%; border-radius: 999px;
    transition: width 520ms cubic-bezier(0.23, 1, 0.32, 1); }

@media (hover: hover) and (pointer: fine) { .tn-fila:hover { background: rgba(255,255,255,0.04); } }
@media (prefers-reduced-motion: reduce) {
    .tn-fila:active { transform: none; }
    .tn-barra > i { transition: none; }
}
`

const fmt = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const hace = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
    if (h < 1) return 'hace menos de una hora'
    if (h === 1) return 'hace una hora'
    if (h < 24) return `hace ${h} horas`
    const d = Math.floor(h / 24)
    return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

export default function TurnosPage() {
    const { data: ctx } = useSessionContext()
    const [selected, setSelected] = useState<CashSession | null>(null)
    const [counted, setCounted] = useState('')
    const [closing, setClosing] = useState(false)

    const { data: sessions, isLoading, mutate } = useSWR(ctx ? ['turnos', ctx.storeId] : null, async () => {
        const { data } = await supabase.from('cash_sessions').select('*')
            .eq('store_id', ctx!.storeId).order('opened_at', { ascending: false }).limit(40)
        return (data ?? []) as CashSession[]
    }, { refreshInterval: 30_000 })

    const abierto = useMemo(() => (sessions ?? []).find(s => s.status === 'open') ?? null, [sessions])

    // El turno en curso se refresca solo: el efectivo esperado cambia
    // con cada venta que entra por la caja
    const { data: enCurso } = useSWR(abierto ? ['turno-vivo', abierto.id] : null, async () => {
        const { data, error } = await supabase.rpc('toul_cash_session_summary', { p_session_id: abierto!.id })
        if (error) throw error
        return data as CashSessionSummary
    }, { refreshInterval: 15_000 })

    const { data: summary, mutate: mutateSummary } = useSWR(selected ? ['turno-summary', selected.id, selected.status] : null, async () => {
        const { data, error } = await supabase.rpc('toul_cash_session_summary', { p_session_id: selected!.id })
        if (error) throw error
        return data as CashSessionSummary
    }, { refreshInterval: selected?.status === 'open' ? 15_000 : 0 })

    async function cerrarComoAdmin() {
        if (!selected) return
        setClosing(true)
        const { data, error } = await supabase.rpc('toul_close_cash_session', {
            p_session_id: selected.id,
            p_counted_cash: Math.round(Number(counted) || 0),
            p_notes: 'Cerrado por el administrador',
        })
        setClosing(false)
        if (error) { toast.error(error.message); return }
        toast.success('Turno cerrado')
        setSelected({ ...selected, status: 'closed', closed_at: new Date().toISOString() })
        mutateSummary(data as CashSessionSummary, { revalidate: false })
        setCounted('')
        mutate()
    }

    const cerrados = (sessions ?? []).filter(s => s.status === 'closed')
    const totalDiff = cerrados.reduce((sum, s) => sum + Number(s.difference ?? 0), 0)

    // Lo que entró por cada método, para saber qué parte es efectivo
    const metodos = (enCurso?.byMethod ?? []).filter(m => Math.round(m.net) !== 0)
    const tope = Math.max(...metodos.map(m => Math.abs(m.net)), 1)

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <div style={{ position: 'relative', maxWidth: 820, margin: '0 auto' }}>

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="flex items-start justify-between gap-3 mb-7">
                    <div>
                        <p className="pnl-label" style={{ marginBottom: 3 }}>Punto físico</p>
                        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>
                            Turnos de caja
                        </h1>
                    </div>
                    <Link href="/caja"
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                            height: 40, padding: '0 16px', borderRadius: 13,
                            background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                            letterSpacing: '-0.01em', textDecoration: 'none', whiteSpace: 'nowrap',
                            boxShadow: '0 4px 20px var(--toul-accent-glow)',
                        }}>
                        <Store size={15} /> {abierto ? 'Ir a la caja' : 'Abrir caja'}
                    </Link>
                </motion.div>

                {/* ── El turno en curso manda ── */}
                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Skeleton height="3rem" width="220px" className="rounded-xl" />
                        <Skeleton height="5px" className="rounded-full" />
                    </div>
                ) : !abierto ? (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible"
                        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '4px 2px' }}>
                        <Lock size={18} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>
                                La caja está cerrada
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                {cerrados.length > 0
                                    ? `El último turno lo cerró ${cerrados[0].closed_by_name ?? cerrados[0].opened_by_name ?? 'alguien'} ${hace(cerrados[0].closed_at ?? cerrados[0].opened_at)}.`
                                    : 'Se abre desde la caja, en el punto de venta.'}
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div variants={fadeUp} initial="hidden" animate="visible">
                        <p className="pnl-label">Debería haber en efectivo</p>
                        <p style={{
                            fontSize: 44, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 1.05,
                            margin: '6px 0 0', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums',
                        }}>
                            {enCurso ? formatCOP(enCurso.expectedCash) : '—'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '5px 0 0' }}>
                            {abierto.opened_by_name ?? 'Alguien'} abrió {hace(abierto.opened_at)}
                            {enCurso ? <> con {formatCOP(enCurso.openingCash)}</> : null}
                        </p>

                        {enCurso && (
                            <>
                                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '14px 0 0' }}>
                                    {enCurso.salesCount} {enCurso.salesCount === 1 ? 'venta' : 'ventas'} ·{' '}
                                    <strong style={{ color: 'var(--toul-text)', fontWeight: 600 }}>{formatCOP(enCurso.salesTotal)}</strong>
                                    {enCurso.creditCount > 0 && <> · {enCurso.creditCount} a crédito</>}
                                    {enCurso.voidCount > 0 && <span style={{ color: 'var(--toul-warning)' }}> · {enCurso.voidCount} anuladas</span>}
                                </p>

                                {metodos.length > 0 && (
                                    <section style={{ marginTop: 22 }}>
                                        <p className="pnl-label" style={{ marginBottom: 10 }}>Con qué le pagaron</p>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                                            {metodos.map(m => (
                                                <div key={m.method}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                                                        <span style={{ fontSize: 13, color: m.isCash ? 'var(--toul-text)' : 'var(--toul-text-dim)', fontWeight: m.isCash ? 600 : 400 }}>
                                                            {m.method}
                                                        </span>
                                                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                            {formatCOP(m.net)}
                                                        </span>
                                                    </div>
                                                    <span className="tn-barra">
                                                        <i style={{
                                                            width: `${(Math.abs(m.net) / tope) * 100}%`,
                                                            background: m.isCash ? 'var(--toul-accent)' : 'var(--toul-text-faint)',
                                                        }} />
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <p style={{ fontSize: 11.5, color: 'var(--toul-text-faint)', margin: '11px 0 0', lineHeight: 1.5 }}>
                                            Solo el efectivo se cuenta al cerrar. Lo demás ya está en tus cuentas.
                                        </p>
                                    </section>
                                )}

                                <button onClick={() => setSelected(abierto)} className="pnl-pill" style={{ marginTop: 18, height: 38 }}>
                                    <Lock size={13} /> Cerrar este turno
                                </button>
                            </>
                        )}
                    </motion.div>
                )}

                {/* ── Lo que ya pasó ── */}
                {cerrados.length > 0 && (
                    <>
                        <hr className="tn-sep" />
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '20px 0 8px' }}>
                            <p className="pnl-label" style={{ margin: 0 }}>Turnos anteriores · {cerrados.length}</p>
                            <span style={{
                                fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                                color: totalDiff === 0 ? 'var(--toul-text-dim)' : totalDiff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)',
                            }}>
                                {totalDiff === 0 ? 'Todos cuadraron'
                                    : `${totalDiff < 0 ? 'Faltaron ' : 'Sobraron '}${formatCOP(Math.abs(totalDiff))} en total`}
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {cerrados.map(s => {
                                const diff = Math.round(Number(s.difference ?? 0))
                                return (
                                    <button key={s.id} className="tn-fila" onClick={() => setSelected(s)}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--toul-text)' }}>
                                                {s.opened_by_name ?? 'Turno'}
                                            </span>
                                            <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)' }}>
                                                {fmt(s.opened_at)}
                                                {s.closed_at ? ` → ${new Date(s.closed_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                            </span>
                                        </span>
                                        <span style={{
                                            fontSize: 13.5, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                                            color: diff === 0 ? 'var(--toul-accent)' : diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)',
                                        }}>
                                            {diff === 0 ? 'Cuadró' : `${diff < 0 ? '−' : '+'}${formatCOP(Math.abs(diff))}`}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}

                {!isLoading && (sessions?.length ?? 0) === 0 && (
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: '28px 2px 0', lineHeight: 1.55 }}>
                        Todavía no hay turnos. Se crean cuando alguien abre la caja en el punto de venta.
                    </p>
                )}
            </div>

            <Sheet open={!!selected} onClose={() => setSelected(null)} width={520}
                title={selected?.status === 'open' ? 'Cerrar el turno' : 'Turno cerrado'}
                subtitle={selected ? `${selected.opened_by_name ?? ''} · ${fmt(selected.opened_at)}` : ''}
                footer={selected && (selected.status === 'open' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <PriceField label="¿Cuánto efectivo contaste?" value={counted} onChange={setCounted} />
                        <button className="toul-btn-primary" disabled={counted === '' || closing} onClick={cerrarComoAdmin}>
                            {closing ? 'Cerrando…' : 'Cerrar turno'}
                        </button>
                    </div>
                ) : summary ? (
                    <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }}
                        onClick={() => printCashClose({
                            storeName: ctx?.storeName ?? 'TOUL',
                            openedBy: selected.opened_by_name ?? '',
                            openedAt: selected.opened_at,
                            closedAt: selected.closed_at ?? new Date().toISOString(),
                        }, summary)}>
                        <Printer size={17} /> Imprimir cierre
                    </button>
                ) : null)}>
                {summary ? <CashSummary summary={summary} /> : <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />}
                {selected?.notes && (
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-muted)', margin: '16px 0 0' }}>
                        Novedades: <span style={{ color: 'var(--toul-text)' }}>{selected.notes}</span>
                    </p>
                )}
            </Sheet>
        </div>
    )
}
