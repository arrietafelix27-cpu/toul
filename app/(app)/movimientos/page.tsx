'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { EASE_OUT_EMIL } from '@/components/ui'

const supabase = createClient()

const CSS = `
.mv-fila { display: flex; align-items: center; gap: 13px; padding: 11px 10px; border-radius: 14px;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1); }
@media (hover: hover) and (pointer: fine) { .mv-fila:hover { background: rgba(255,255,255,0.035); } }

/* PC: tabla, como Ventas y Compras. En una columna angosta en medio de
   la pantalla quedaba mucho espacio sin usar */
.mv-pc, .mv-cabeza { display: none; }
@media (min-width: 1024px) {
    .mv-movil { display: none !important; }
    .mv-pc, .mv-cabeza { display: grid; grid-template-columns: 160px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) 140px; gap: 16px; align-items: center; }
    .mv-cabeza { padding: 0 10px 9px; border-bottom: 1px solid var(--toul-divider); margin-bottom: 4px;
        font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--toul-text-faint); }
    .mv-pc { padding: 11px 10px; border-radius: 12px; }
    .mv-pc > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mv-num { text-align: right; font-variant-numeric: tabular-nums; }
}
@media (hover: hover) and (pointer: fine) { .mv-pc:hover { background: rgba(255,255,255,0.035); } }
`

/** Salidas de plata. Todo lo demás cuenta como entrada. */
const OUT_TYPES = ['expense', 'purchase', 'provider_payment', 'transfer_out']

/** Nombre en español de cada movimiento. */
const LABELS: Record<string, string> = {
    sale: 'Venta',
    sale_payment: 'Abono de cliente',
    sale_refund: 'Devolución a un cliente',
    expense: 'Gasto',
    purchase: 'Compra de inventario',
    provider_payment: 'Pago a proveedor',
    transfer_in: 'Traslado recibido',
    transfer_out: 'Traslado enviado',
    capital: 'Capital propio',
}

/** "Compra #2cb1" y "Compra de inventario" empiezan igual: no se repite */
const primeraPalabra = (texto: string) => texto.trim().split(/[\s:#]+/)[0]?.toLowerCase() ?? ''

type Period = 'today' | 'week' | 'month' | 'total'
type Flow = 'all' | 'in' | 'out'

const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'total', label: 'Todo' },
]

const FLOWS: { value: Flow; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'in', label: 'Entradas' },
    { value: 'out', label: 'Salidas' },
]

function since(period: Period): string | null {
    const now = new Date()
    if (period === 'total') return null
    if (period === 'today') { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.toISOString() }
    if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.toISOString() }
    const d = new Date(now.getFullYear(), now.getMonth(), 1)
    return d.toISOString()
}

interface Movement {
    id: string
    created_at: string
    type: string
    method: string
    amount: number
    notes: string | null
}

const PAGE_SIZE = 60

export default function MovimientosPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null
    const [period, setPeriod] = useState<Period>('week')
    const [flow, setFlow] = useState<Flow>('all')
    const [limit, setLimit] = useState(PAGE_SIZE)

    const { data, isLoading } = useSWR(storeId ? ['movimientos', storeId, period, limit] : null, async () => {
        let q = supabase.from('payments')
            .select('id, created_at, type, method, amount, notes')
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })
            .limit(limit + 1)
        const from = since(period)
        if (from) q = q.gte('created_at', from)
        const { data, error } = await q
        if (error) throw error
        const rows = (data ?? []) as Movement[]
        return { rows: rows.slice(0, limit), hasMore: rows.length > limit }
    }, { revalidateOnFocus: false })

    const movements = useMemo(() => {
        const rows = data?.rows ?? []
        return rows
            .map(m => {
                // Un monto negativo ya viene firmado (anulaciones); el resto se firma por tipo
                const signed = Number(m.amount) < 0 ? Number(m.amount) : (OUT_TYPES.includes(m.type) ? -Number(m.amount) : Number(m.amount))
                return { ...m, signed }
            })
            .filter(m => flow === 'all' || (flow === 'in' ? m.signed >= 0 : m.signed < 0))
    }, [data, flow])

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 max-w-2xl lg:max-w-[1040px] mx-auto" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <div>
                    <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>Movimientos</h1>
                </div>
            </div>

            <div className="flex gap-1.5 flex-wrap mb-3">
                {PERIODS.map(p => {
                    const active = period === p.value
                    return (
                        <button key={p.value} onClick={() => { setPeriod(p.value); setLimit(PAGE_SIZE) }}
                            style={{
                                padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {p.label}
                        </button>
                    )
                })}
            </div>

            <div className="flex gap-1.5 mb-5">
                {FLOWS.map(f => {
                    const active = flow === f.value
                    return (
                        <button key={f.value} onClick={() => setFlow(f.value)}
                            style={{
                                padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                border: '1px solid transparent',
                                background: active ? 'var(--toul-surface-2)' : 'transparent',
                                color: active ? 'var(--toul-text)' : 'var(--toul-text-dim)',
                                transition: 'background var(--toul-transition), color var(--toul-transition)',
                            }}>
                            {f.label}
                        </button>
                    )
                })}
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 66, borderRadius: 16 }} />)}</div>
            ) : movements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                    <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Sin movimientos en este período</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>Cambia el filtro o registra un gasto.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div className="mv-cabeza" aria-hidden>
                        <span>Fecha</span><span>Concepto</span><span>Tipo</span><span>Método</span><span className="mv-num">Monto</span>
                    </div>
                    {movements.map((m, idx) => {
                        const isOut = m.signed < 0
                        return (
                            <div key={m.id} style={{ display: 'contents' }}>
                            {/* PC */}
                            <div className="mv-pc">
                                <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>
                                    {new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{m.notes || LABELS[m.type] || 'Movimiento'}</span>
                                <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>{LABELS[m.type] || 'Movimiento'}</span>
                                <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>{m.method}</span>
                                <span className="mv-num" style={{ fontSize: 14.5, fontWeight: 700, color: isOut ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                    {isOut ? '−' : '+'}{formatCOP(Math.abs(m.signed))}
                                </span>
                            </div>
                            <motion.div
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, ease: EASE_OUT_EMIL, delay: Math.min(idx, 10) * 0.02 }}
                                className="mv-fila mv-movil">
                                <span style={{
                                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isOut ? 'var(--toul-error-dim)' : 'var(--toul-accent-dim)',
                                }}>
                                    {isOut
                                        ? <ArrowUpRight size={17} style={{ color: 'var(--toul-error)' }} />
                                        : <ArrowDownLeft size={17} style={{ color: 'var(--toul-accent)' }} />}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {m.notes || LABELS[m.type] || 'Movimiento'}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                        {/* "Venta #ba77…" y abajo otra vez "Venta": el tipo solo va si el título no lo dice ya */}
                                        {LABELS[m.type] && primeraPalabra(m.notes || '') === primeraPalabra(LABELS[m.type]) ? '' : `${LABELS[m.type] || 'Movimiento'} · `}
                                        {m.method} · {new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </span>
                                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0, color: isOut ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                    {isOut ? '−' : '+'}{formatCOP(Math.abs(m.signed))}
                                </span>
                            </motion.div>
                            </div>
                        )
                    })}

                    {data?.hasMore && (
                        <button onClick={() => setLimit(l => l + PAGE_SIZE)}
                            className="w-full py-4 mt-2 rounded-2xl border border-dashed font-semibold text-xs"
                            style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Ver más movimientos
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}
