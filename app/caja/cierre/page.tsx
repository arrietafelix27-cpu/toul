'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { LockKeyhole, Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PriceField, EASE_OUT_EMIL } from '@/components/ui'
import { useCaja } from '@/components/isla/CajaContext'
import { CashSummary } from '@/components/isla/CashSummary'
import { Sheet } from '@/components/isla/Sheet'
import { printCashClose } from '@/lib/isla/receipt'
import type { CashSession, CashSessionSummary } from '@/lib/isla/types'

export default function CajaCierrePage() {
    const router = useRouter()
    const { ctx, session, refreshSession } = useCaja()
    const [counted, setCounted] = useState('')
    const [notes, setNotes] = useState('')
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [closing, setClosing] = useState(false)
    const [result, setResult] = useState<{ summary: CashSessionSummary; session: CashSession; closedAt: string } | null>(null)

    async function close() {
        if (!session) return
        setClosing(true)
        const { data, error } = await createClient().rpc('toul_close_cash_session', {
            p_session_id: session.id,
            p_counted_cash: Math.round(Number(counted) || 0),
            p_notes: notes,
        })
        setClosing(false)
        setConfirmOpen(false)
        if (error) { toast.error(error.message); return }
        setResult({ summary: data as CashSessionSummary, session, closedAt: new Date().toISOString() })
        refreshSession(null, { revalidate: true })
    }

    // ── Resultado del cierre ─────────────────────────────────
    if (result) {
        return (
            <div style={{ height: '100%', overflowY: 'auto' }}>
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE_OUT_EMIL }}
                    style={{ maxWidth: 520, margin: '0 auto', padding: '28px 20px 40px' }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Turno cerrado</p>
                    <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '0 0 20px' }}>Resumen del turno</h1>
                    <CashSummary summary={result.summary} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 24 }}>
                        <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }}
                            onClick={() => printCashClose({
                                storeName: ctx.storeName,
                                openedBy: result.session.opened_by_name ?? ctx.displayName,
                                openedAt: result.session.opened_at,
                                closedAt: result.closedAt,
                            }, result.summary)}>
                            <Printer size={17} /> Imprimir cierre
                        </button>
                        <button className="toul-btn-primary" onClick={() => router.push('/caja')}>Abrir nuevo turno</button>
                        <button className="toul-btn-ghost" onClick={async () => { await createClient().auth.signOut(); router.replace('/login') }}>
                            Cerrar sesión
                        </button>
                    </div>
                </motion.div>
            </div>
        )
    }

    if (!session) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
                <div>
                    <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--toul-text)', margin: '0 0 6px' }}>No hay un turno abierto</p>
                    <Link href="/caja" style={{ color: 'var(--toul-accent)', fontSize: 15, fontWeight: 600 }}>Abrir turno</Link>
                </div>
            </div>
        )
    }

    const canClose = ctx.role === 'admin' || session.opened_by === ctx.userId

    return (
        <div style={{ height: '100%', overflowY: 'auto', position: 'relative' }}>
            <div className="toul-ambient" />
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE_OUT_EMIL }}
                style={{ maxWidth: 460, margin: '0 auto', padding: '40px 20px', position: 'relative' }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--toul-surface-2)', border: '1px solid var(--toul-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <LockKeyhole size={24} style={{ color: 'var(--toul-text-muted)' }} />
                </div>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '0 0 8px' }}>Cerrar turno</h1>
                <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', lineHeight: 1.5, margin: '0 0 24px' }}>
                    Cuenta todo el efectivo que hay en la caja, incluida la base. Al cerrar verás si la caja cuadra.
                </p>

                {canClose ? (
                    <>
                        <PriceField label="Efectivo contado" value={counted} onChange={setCounted} step={1000} />
                        <textarea className="toul-input" rows={2} placeholder="Novedades del turno (opcional)" value={notes}
                            onChange={e => setNotes(e.target.value)} maxLength={300}
                            style={{ resize: 'none', height: 'auto', paddingTop: 12, marginTop: 12 }} />
                        <button className="toul-btn-primary" onClick={() => setConfirmOpen(true)} disabled={counted === ''}
                            style={{ marginTop: 16, height: 58, fontSize: 17 }}>
                            Cerrar turno
                        </button>
                    </>
                ) : (
                    <div className="toul-card" style={{ fontSize: 15, color: 'var(--toul-text-muted)' }}>
                        Este turno lo abrió {session.opened_by_name ?? 'otra persona'}. Solo esa persona o el administrador pueden cerrarlo.
                    </div>
                )}
            </motion.div>

            <Sheet open={confirmOpen} onClose={() => !closing && setConfirmOpen(false)} title="¿Cerrar el turno?"
                subtitle="Después de cerrar no se puede vender hasta abrir un turno nuevo."
                footer={
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }} onClick={() => setConfirmOpen(false)} disabled={closing}>Volver</button>
                        <button className="toul-btn-primary" onClick={close} disabled={closing}>{closing ? 'Cerrando…' : 'Sí, cerrar'}</button>
                    </div>
                }>
                <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', margin: 0 }}>
                    Efectivo contado: <strong style={{ color: 'var(--toul-text)' }}>
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Math.round(Number(counted) || 0))}
                    </strong>
                </p>
            </Sheet>
        </div>
    )
}
