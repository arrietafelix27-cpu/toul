'use client'

import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, getDateRange } from '@/lib/utils'
import { ZONA_COLOMBIA, instanteDeDia, periodoDeDireccion, textoRango, tramoDeDias } from '@/lib/periodos'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'
import { nombreMetodo } from '@/lib/format/text'
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

.mv-chips { display: flex; gap: 6px; overflow-x: auto; margin-left: -16px; margin-right: -16px; padding: 0 16px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.mv-chips::-webkit-scrollbar { display: none; }
@media (min-width: 768px) { .mv-chips { flex-wrap: wrap; overflow: visible; margin-left: 0; margin-right: 0; padding: 0; } }
.mv-totales { display: flex; align-items: flex-end; gap: 20px; flex-wrap: wrap; margin-bottom: 20px; }
.mv-rotulo { margin: 0; font-size: 13px; color: var(--toul-text-subtle); }
.mv-total { margin: 4px 0 0; font-size: 24px; font-weight: 700; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; }
.mv-linea { width: 1px; align-self: stretch; background: var(--toul-border); }
.mv-cuenta { margin: 0 0 4px auto; font-size: 13px; color: var(--toul-text-dim); }
`

/** Salidas de plata. Todo lo demás cuenta como entrada. */
const OUT_TYPES = ['expense', 'purchase', 'provider_payment', 'transfer_out', 'owner_out']

/** Plata entre el dueño y su negocio: no es ganancia ni gasto, así que no
 *  suma en "Entró" ni en "Salió" (lo de antes del dueño, tampoco) */
const ENTRE_TU_Y_TU_NEGOCIO = ['owner_in', 'owner_out', 'transfer_in', 'transfer_out', 'capital']

/** Nombre en español de cada movimiento. */
const LABELS: Record<string, string> = {
    sale: 'Venta',
    sale_payment: 'Abono de cliente',
    // Hasta el 14 oct de 2026 los abonos entraban con este nombre
    credit_payment: 'Abono de cliente',
    sale_refund: 'Devolución a un cliente',
    expense: 'Gasto',
    purchase: 'Compra de inventario',
    provider_payment: 'Pago a proveedor',
    owner_in: 'Metí plata',
    owner_out: 'Saqué plata',
    // Los traslados de antes: solo se ven
    transfer_in: 'Traslado',
    transfer_out: 'Traslado',
    capital: 'Capital propio',
}

/** "Compra #2cb1" y "Compra de inventario" empiezan igual: no se repite */
const primeraPalabra = (texto: string) => texto.trim().split(/[\s:#]+/)[0]?.toLowerCase() ?? ''

type Period = 'today' | 'week' | 'month' | 'year' | 'total' | 'custom'
/** Qué movimientos se ven. Los de Reportes ("ventas", "abonos", "mercancia",
 *  "cobros", "devoluciones") suman exactamente lo mismo que allá */
type Tipo = 'todos' | 'entradas' | 'salidas' | 'cobros' | 'ventas' | 'abonos' | 'mercancia' | 'gastos' | 'devoluciones'

const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Año' },
    { value: 'total', label: 'Todo' },
]

const TIPOS: { value: Tipo; label: string }[] = [
    { value: 'todos', label: 'Todos' },
    { value: 'entradas', label: 'Entradas' },
    { value: 'salidas', label: 'Salidas' },
    { value: 'cobros', label: 'Ventas y abonos' },
    { value: 'ventas', label: 'Ventas' },
    { value: 'abonos', label: 'Abonos' },
    { value: 'mercancia', label: 'Mercancía' },
    { value: 'gastos', label: 'Gastos' },
    { value: 'devoluciones', label: 'Devoluciones' },
]
const ES_TIPO = (v: string | null): v is Tipo => TIPOS.some(t => t.value === v)

/** "Sin método": lo que se guardó como "General" (gastos, compras, abonos viejos) */
const SIN_METODO = 'sin'

interface Movement {
    id: string
    created_at: string
    type: string
    method: string
    amount: number
    notes: string | null
    reference_id: string | null
}

const PAGE_SIZE = 60

const fila = {
    padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
    transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
} as const
const chipPeriodo = (active: boolean) => ({
    ...fila,
    background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
    border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
    color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
})
const chipFiltro = (active: boolean) => ({
    ...fila, padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, border: '1px solid transparent',
    background: active ? 'var(--toul-surface-2)' : 'transparent',
    color: active ? 'var(--toul-text)' : 'var(--toul-text-dim)',
})

export default function MovimientosPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <Movimientos />
        </Suspense>
    )
}

function Movimientos() {
    const { data: store } = useStore()
    const storeId = store?.id || null
    const { methods } = usePaymentMethods()

    // Desde Reportes se llega con el periodo, el tipo y el método puestos:
    // /movimientos?periodo=month&tipo=cobros&metodo=Nequi
    const params = useSearchParams()
    const [inicial] = useState(() => {
        const p = periodoDeDireccion(params)
        const tipo = params.get('tipo')
        return {
            period: (p?.periodo ?? 'week') as Period,
            desde: p?.desde ?? '', hasta: p?.hasta ?? '',
            tipo: ES_TIPO(tipo) ? tipo : 'todos' as Tipo,
            metodo: params.get('metodo') ?? '',
        }
    })
    const [period, setPeriod] = useState<Period>(inicial.period)
    const [dias] = useState({ desde: inicial.desde, hasta: inicial.hasta })
    const [tipo, setTipo] = useState<Tipo>(inicial.tipo)
    const [metodo, setMetodo] = useState(inicial.metodo)
    const [limit, setLimit] = useState(PAGE_SIZE)

    const tramo = useMemo(() => {
        if (period === 'custom') return tramoDeDias(dias.desde, dias.hasta)
        if (period === 'total') return { from: null, to: null }
        return getDateRange(period)
    }, [period, dias])

    // Todo el periodo, de a 1.000: los totales tienen que sumar todo, no solo lo que se ve
    const { data, isLoading } = useSWR(storeId ? ['movimientos', storeId, tramo.from, period === 'custom' ? tramo.to : 'ahora'] : null, async () => {
        const filas: Movement[] = []
        for (let desde = 0; ; desde += 1000) {
            let q = supabase.from('payments')
                .select('id, created_at, type, method, amount, notes, reference_id')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .order('id')
                .range(desde, desde + 999)
            if (tramo.from) q = q.gte('created_at', tramo.from)
            if (tramo.to && period === 'custom') q = q.lte('created_at', tramo.to)
            const { data, error } = await q
            if (error) throw error
            filas.push(...((data ?? []) as Movement[]))
            if ((data ?? []).length < 1000) return filas
        }
    }, { revalidateOnFocus: false })

    const movements = useMemo(() => {
        const rows = data ?? []
        // Una venta anulada deja su entrada y su devolución: se anulan entre
        // sí y no cuentan como venta, igual que en Reportes
        const anuladas = new Set(rows
            .filter(m => m.type === 'sale_refund' && (m.notes ?? '').startsWith('Anulación') && m.reference_id)
            .map(m => m.reference_id as string))
        const esVenta = (m: Movement) => m.type === 'sale' && !(m.reference_id && anuladas.has(m.reference_id))
        const esAbono = (m: Movement) => m.type === 'sale_payment' || m.type === 'credit_payment'
        const sinMetodo = (m: Movement) => !m.method?.trim() || m.method.trim().toLowerCase() === 'general'

        return rows
            .map(m => {
                // Un monto negativo ya viene firmado (anulaciones); el resto se firma por tipo
                const signed = Number(m.amount) < 0 ? Number(m.amount) : (OUT_TYPES.includes(m.type) ? -Number(m.amount) : Number(m.amount))
                return { ...m, signed }
            })
            .filter(m => {
                switch (tipo) {
                    case 'entradas': return m.signed >= 0
                    case 'salidas': return m.signed < 0
                    case 'cobros': return esVenta(m) || esAbono(m)
                    case 'ventas': return esVenta(m)
                    case 'abonos': return esAbono(m)
                    case 'mercancia': return m.type === 'purchase' || m.type === 'provider_payment'
                    case 'gastos': return m.type === 'expense'
                    case 'devoluciones': return m.type === 'sale_refund' && !(m.notes ?? '').startsWith('Anulación')
                    default: return true
                }
            })
            .filter(m => !metodo || (metodo === SIN_METODO ? sinMetodo(m) : m.method?.trim().toLowerCase() === metodo.trim().toLowerCase()))
    }, [data, tipo, metodo])

    const totales = useMemo(() => {
        const cuentan = movements.filter(m => !ENTRE_TU_Y_TU_NEGOCIO.includes(m.type))
        return {
            entro: Math.round(cuentan.filter(m => m.signed > 0).reduce((s, m) => s + m.signed, 0)),
            salio: Math.round(cuentan.filter(m => m.signed < 0).reduce((s, m) => s - m.signed, 0)),
        }
    }, [movements])
    const visibles = movements.slice(0, limit)

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
                {PERIODS.map(p => (
                    <button key={p.value} onClick={() => { setPeriod(p.value); setLimit(PAGE_SIZE) }} style={chipPeriodo(period === p.value)}>
                        {p.label}
                    </button>
                ))}
                {/* Unas fechas elegidas en Reportes */}
                {period === 'custom' && (
                    <span style={chipPeriodo(true)}>{textoRango(instanteDeDia(dias.desde), instanteDeDia(dias.hasta))}</span>
                )}
            </div>

            {/* Tipo y método: se deslizan si no caben */}
            <div className="mv-chips" style={{ marginBottom: 6 }} role="group" aria-label="Tipo de movimiento">
                {TIPOS.map(t => (
                    <button key={t.value} onClick={() => { setTipo(t.value); setLimit(PAGE_SIZE) }} style={chipFiltro(tipo === t.value)} aria-pressed={tipo === t.value}>
                        {t.label}
                    </button>
                ))}
            </div>
            <div className="mv-chips" style={{ marginBottom: 18 }} role="group" aria-label="Método de pago">
                <button onClick={() => { setMetodo(''); setLimit(PAGE_SIZE) }} style={chipFiltro(!metodo)} aria-pressed={!metodo}>Todos los métodos</button>
                {methods.map(m => (
                    <button key={m.id} onClick={() => { setMetodo(m.name); setLimit(PAGE_SIZE) }}
                        style={chipFiltro(metodo.toLowerCase() === m.name.toLowerCase())} aria-pressed={metodo.toLowerCase() === m.name.toLowerCase()}>
                        {nombreMetodo(m.name)}
                    </button>
                ))}
                <button onClick={() => { setMetodo(SIN_METODO); setLimit(PAGE_SIZE) }} style={chipFiltro(metodo === SIN_METODO)} aria-pressed={metodo === SIN_METODO}>
                    Sin método
                </button>
            </div>

            {/* Lo que entró y salió con estos filtros */}
            {!isLoading && (
                <div className="mv-totales">
                    <div>
                        <p className="mv-rotulo">Entró</p>
                        <p className="mv-total" style={{ color: totales.entro > 0 ? 'var(--toul-accent)' : 'var(--toul-text-dim)' }}>{formatCOP(totales.entro)}</p>
                    </div>
                    <span className="mv-linea" aria-hidden />
                    <div>
                        <p className="mv-rotulo">Salió</p>
                        <p className="mv-total" style={{ color: totales.salio > 0 ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>{formatCOP(totales.salio)}</p>
                    </div>
                    <p className="mv-cuenta">{movements.length} {movements.length === 1 ? 'movimiento' : 'movimientos'}</p>
                </div>
            )}

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
                    {visibles.map((m, idx) => {
                        const isOut = m.signed < 0
                        return (
                            <div key={m.id} style={{ display: 'contents' }}>
                            {/* PC */}
                            <div className="mv-pc">
                                <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>
                                    {new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA })}
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{m.notes || LABELS[m.type] || 'Movimiento'}</span>
                                <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>{LABELS[m.type] || 'Movimiento'}</span>
                                <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>{nombreMetodo(m.method)}</span>
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
                                        {nombreMetodo(m.method)} · {new Date(m.created_at).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA })}
                                    </span>
                                </span>
                                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', flexShrink: 0, color: isOut ? 'var(--toul-error)' : 'var(--toul-accent)' }}>
                                    {isOut ? '−' : '+'}{formatCOP(Math.abs(m.signed))}
                                </span>
                            </motion.div>
                            </div>
                        )
                    })}

                    {movements.length > limit && (
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
