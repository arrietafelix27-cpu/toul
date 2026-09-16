'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Store, Printer } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { CashSummary } from '@/components/isla/CashSummary'
import { Sheet } from '@/components/isla/Sheet'
import { PriceField, EASE_OUT_EMIL } from '@/components/ui'
import { printCashClose } from '@/lib/isla/receipt'
import type { CashSession, CashSessionSummary } from '@/lib/isla/types'

const supabase = createClient()

const fmt = (iso: string) => new Date(iso).toLocaleString('es-CO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function TurnosPage() {
    const { data: ctx } = useSessionContext()
    const [selected, setSelected] = useState<CashSession | null>(null)
    const [counted, setCounted] = useState('')
    const [closing, setClosing] = useState(false)

    const { data: sessions, isLoading, mutate } = useSWR(ctx ? ['turnos', ctx.storeId] : null, async () => {
        const { data } = await supabase.from('cash_sessions').select('*').eq('store_id', ctx!.storeId).order('opened_at', { ascending: false }).limit(40)
        return (data ?? []) as CashSession[]
    }, { refreshInterval: 30_000 })

    const { data: summary, mutate: mutateSummary } = useSWR(selected ? ['turno-summary', selected.id, selected.status] : null, async () => {
        const { data, error } = await supabase.rpc('toul_cash_session_summary', { p_session_id: selected!.id })
        if (error) throw error
        return data as CashSessionSummary
    }, { refreshInterval: selected?.status === 'open' ? 15_000 : 0 })

    async function closeAsAdmin() {
        if (!selected) return
        setClosing(true)
        const { data, error } = await supabase.rpc('toul_close_cash_session', { p_session_id: selected.id, p_counted_cash: Math.round(Number(counted) || 0), p_notes: 'Cerrado por el administrador' })
        setClosing(false)
        if (error) { toast.error(error.message); return }
        toast.success('Turno cerrado')
        const closed = { ...selected, status: 'closed' as const, closed_at: new Date().toISOString() }
        setSelected(closed)
        mutateSummary(data as CashSessionSummary, { revalidate: false })
        setCounted('')
        mutate()
    }

    const withDiff = (sessions ?? []).filter(s => s.status === 'closed')
    const totalDiff = withDiff.reduce((sum, s) => sum + Number(s.difference ?? 0), 0)

    return (
        <div className="px-4 md:px-8 pt-6 pb-8" style={{ position: 'relative', maxWidth: 860 }}>
            <div className="toul-ambient" />
            <div className="mb-5 flex items-end justify-between gap-3" style={{ position: 'relative' }}>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Modo isla</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Turnos de caja</h1>
                </div>
                <Link href="/caja" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 42, padding: '0 16px', borderRadius: 12, background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, textDecoration: 'none', boxShadow: '0 4px 20px var(--toul-accent-glow)' }}>
                    <Store size={16} /> Abrir caja
                </Link>
            </div>

            {withDiff.length > 0 && (
                <div className="toul-card mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: 'var(--toul-text-muted)' }}>Diferencia acumulada ({withDiff.length} turnos)</span>
                    <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: totalDiff === 0 ? 'var(--toul-accent)' : totalDiff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                        {totalDiff < 0 ? '−' : totalDiff > 0 ? '+' : ''}{formatCOP(Math.abs(totalDiff))}
                    </span>
                </div>
            )}

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 16 }} />)}</div>
            ) : (sessions?.length ?? 0) === 0 ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '44px 20px' }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Todavía no hay turnos</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>Se crean cuando alguien abre la caja en la isla.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sessions!.map((s, idx) => {
                        const diff = Math.round(Number(s.difference ?? 0))
                        const open = s.status === 'open'
                        return (
                            <motion.button key={s.id} onClick={() => setSelected(s)}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, ease: EASE_OUT_EMIL, delay: Math.min(idx, 8) * 0.025 }}
                                whileTap={{ scale: 0.99 }}
                                className="toul-card toul-card-interactive"
                                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', fontFamily: 'inherit' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: open ? 'var(--toul-accent)' : 'var(--toul-text-faint)', boxShadow: open ? '0 0 10px var(--toul-accent-glow)' : 'none' }} />
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)' }}>{s.opened_by_name ?? 'Turno'}</span>
                                    <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                        {fmt(s.opened_at)}{s.closed_at ? ` → ${new Date(s.closed_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ' · abierto'}
                                    </span>
                                </span>
                                {open ? (
                                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-accent)' }}>En curso</span>
                                ) : (
                                    <span style={{ fontSize: 15, fontWeight: 700, color: diff === 0 ? 'var(--toul-accent)' : diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                        {diff === 0 ? 'Cuadra' : `${diff < 0 ? '−' : '+'}${formatCOP(Math.abs(diff))}`}
                                    </span>
                                )}
                            </motion.button>
                        )
                    })}
                </div>
            )}

            <Sheet open={!!selected} onClose={() => setSelected(null)} width={520}
                title={selected?.status === 'open' ? 'Turno en curso' : 'Turno cerrado'}
                subtitle={selected ? `${selected.opened_by_name ?? ''} · ${fmt(selected.opened_at)}` : ''}
                footer={selected && (selected.status === 'open' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <PriceField label="Efectivo contado (cerrar como administrador)" value={counted} onChange={setCounted} step={1000} />
                        <button className="toul-btn-primary" disabled={counted === '' || closing} onClick={closeAsAdmin}>
                            {closing ? 'Cerrando…' : 'Cerrar turno'}
                        </button>
                    </div>
                ) : summary ? (
                    <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }}
                        onClick={() => printCashClose({ storeName: ctx?.storeName ?? 'TOUL', openedBy: selected.opened_by_name ?? '', openedAt: selected.opened_at, closedAt: selected.closed_at ?? new Date().toISOString() }, summary)}>
                        <Printer size={17} /> Imprimir cierre
                    </button>
                ) : null)}>
                {summary ? <CashSummary summary={summary} /> : <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />}
                {selected?.notes && (
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '16px 0 0' }}>Novedades: <span style={{ color: 'var(--toul-text)' }}>{selected.notes}</span></p>
                )}
            </Sheet>
        </div>
    )
}
