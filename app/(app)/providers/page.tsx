'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { Plus, Search, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { Thumb } from '@/components/ui/Thumb'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import type { Provider } from '@/lib/types'

const supabase = createClient()
const PAGE_SIZE = 50

const NewProviderModal = dynamic(
    () => import('@/components/providers/NewProviderModal').then(m => m.NewProviderModal),
    { loading: () => <Skeleton height="400px" className="rounded-3xl" /> },
)

/* ══════════════════════════════════════════════════════════════
   Proveedores.

   La pregunta es la misma que en Cuentas por cobrar, al revés:
   ¿a quién le debo y cuánto se me está venciendo? Antes había dos
   tarjetas arriba y una de ellas decía "0 facturas" escrito a
   mano, sin mirar nada. Un número inventado en pantalla es peor
   que no poner nada.
   ══════════════════════════════════════════════════════════════ */

const CSS = PANEL_CSS + `
.pv-fila { display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 11px 10px; border-radius: 14px; text-decoration: none;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pv-fila:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) { .pv-fila:hover { background: rgba(255,255,255,0.04); } }
@media (prefers-reduced-motion: reduce) { .pv-fila:active { transform: none; } }
`

/** Días que lleva vencido un plazo. Negativo si todavía no llega. */
function vencidoHace(iso: string) {
    const hoy = new Date(Date.now() - 5 * 3600_000); hoy.setHours(0, 0, 0, 0)
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    return Math.round((hoy.getTime() - d.getTime()) / 86400000)
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

export default function ProvidersPage() {
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [busca, setBusca] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [limite, setLimite] = useState(PAGE_SIZE)
    const [hayMas, setHayMas] = useState(false)

    const { data, isLoading, isValidating, mutate } = useSWR(
        storeId ? ['proveedores', storeId, busca, limite] : null,
        async () => {
            let q = supabase.from('providers').select('*').eq('store_id', storeId!).order('name')
            if (busca) q = q.ilike('name', `%${busca}%`)

            // Las deudas vivas: de ahí sale cuánto se vence y cuándo
            const [provRes, deudasRes] = await Promise.all([
                q.limit(limite + 1),
                supabase.from('provider_debts')
                    .select('provider_id, remaining_amount, due_date')
                    .eq('store_id', storeId!).neq('status', 'paid').gt('remaining_amount', 0),
            ])
            if (provRes.error) throw provRes.error

            const filas = (provRes.data ?? []) as Provider[]
            setHayMas(filas.length > limite)

            const porProveedor = new Map<string, { falta: number; vence: string | null; vencidas: number }>()
            for (const d of deudasRes.data ?? []) {
                if (!d.provider_id) continue
                const actual = porProveedor.get(d.provider_id) ?? { falta: 0, vence: null, vencidas: 0 }
                actual.falta += Number(d.remaining_amount)
                if (d.due_date) {
                    if (!actual.vence || new Date(d.due_date) < new Date(actual.vence)) actual.vence = d.due_date
                    if (vencidoHace(d.due_date) > 0) actual.vencidas++
                }
                porProveedor.set(d.provider_id, actual)
            }

            return { proveedores: filas.slice(0, limite), deudas: porProveedor }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    const proveedores = useMemo(() => data?.proveedores ?? [], [data])
    const deudas = data?.deudas

    // Todo esto sale de las deudas reales, no de un campo suelto
    const resumen = useMemo(() => {
        let total = 0, conDeuda = 0, vencidas = 0
        for (const [, d] of deudas ?? []) {
            total += d.falta
            if (d.falta > 0) conDeuda++
            vencidas += d.vencidas
        }
        return { total, conDeuda, vencidas }
    }, [deudas])

    const cargando = isLoading || storeLoading

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="flex items-start justify-between gap-3 mb-7">
                    <div>
                        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>
                            Proveedores
                        </h1>
                    </div>
                    <button onClick={() => setShowModal(true)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                            height: 40, padding: '0 16px', borderRadius: 13, border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                            background: 'var(--toul-accent)', color: '#000',
                            boxShadow: '0 4px 20px var(--toul-accent-glow)',
                        }}>
                        <Plus size={15} strokeWidth={2.6} /> Nuevo
                    </button>
                </motion.div>

                {/* ── Lo que le debes a tus proveedores ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible">
                    <p className="pnl-label">Le debes a proveedores</p>
                    {cargando ? (
                        <Skeleton height="2.8rem" width="200px" className="rounded-xl" />
                    ) : (
                        <>
                            <p style={{
                                fontSize: 38, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.05,
                                margin: '6px 0 0', fontVariantNumeric: 'tabular-nums',
                                color: resumen.total > 0 ? 'var(--toul-text)' : 'var(--toul-accent)',
                            }}>
                                {formatCOP(resumen.total)}
                            </p>
                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                                {resumen.total === 0 ? 'No le debes nada a nadie' : (
                                    <>
                                        {resumen.conDeuda} {resumen.conDeuda === 1 ? 'proveedor' : 'proveedores'}
                                        {resumen.vencidas > 0 && (
                                            <span style={{ color: 'var(--toul-error)', fontWeight: 600 }}>
                                                {' · '}{resumen.vencidas} {resumen.vencidas === 1 ? 'vencida' : 'vencidas'}
                                            </span>
                                        )}
                                    </>
                                )}
                            </p>
                        </>
                    )}
                </motion.div>

                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    style={{ position: 'relative', margin: '22px 0 10px' }}>
                    <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                    <input className="toul-input" style={{ paddingLeft: 42 }} placeholder="Buscar proveedor…"
                        value={busca} onChange={e => { setBusca(e.target.value); setLimite(PAGE_SIZE) }} />
                </motion.div>

                {cargando ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height="62px" className="rounded-2xl" />)}
                    </div>
                ) : proveedores.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                        <Truck size={30} style={{ color: 'var(--toul-border-2)', margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            {busca ? 'Nadie con ese nombre' : 'Todavía no tienes proveedores'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                            {busca ? 'Prueba con otra parte del nombre.' : 'Se crean cuando registras una compra, o con el botón de arriba.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {proveedores.map(p => {
                                const d = deudas?.get(p.id)
                                const falta = d?.falta ?? 0
                                const vencido = d?.vence ? vencidoHace(d.vence) : null

                                const detalle = falta <= 0 ? (p.phone ?? 'Sin deuda pendiente')
                                    : vencido === null ? 'sin plazo'
                                        : vencido > 0 ? `vencida hace ${dias(vencido)}`
                                            : vencido === 0 ? 'se vence hoy'
                                                : `vence en ${dias(-vencido)}`

                                const color = falta <= 0 ? 'var(--toul-text-dim)'
                                    : vencido !== null && vencido >= 0 ? 'var(--toul-error)'
                                        : 'var(--toul-warning)'

                                return (
                                    <motion.div key={p.id} variants={staggerItem}>
                                        <Link href={`/providers/${p.id}`} className="pv-fila">
                                            <Thumb name={p.name} size={40} />
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{
                                                    display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em',
                                                    color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {p.name}
                                                </span>
                                                <span style={{
                                                    display: 'block', fontSize: 12, color, marginTop: 1,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {detalle}
                                                </span>
                                            </span>
                                            {falta > 0 && (
                                                <span style={{
                                                    fontSize: 14.5, fontWeight: 700, flexShrink: 0,
                                                    color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {formatCOP(falta)}
                                                </span>
                                            )}
                                        </Link>
                                    </motion.div>
                                )
                            })}
                        </motion.div>

                        {hayMas && (
                            <button onClick={() => setLimite(l => l + PAGE_SIZE)} disabled={isValidating}
                                style={{
                                    width: '100%', marginTop: 12, height: 44, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                                    background: 'transparent', border: '1px dashed var(--toul-border)',
                                    color: 'var(--toul-text-dim)', fontSize: 13, fontWeight: 500,
                                }}>
                                {isValidating ? 'Cargando…' : 'Ver más proveedores'}
                            </button>
                        )}
                    </>
                )}
            </div>

            {showModal && (
                <NewProviderModal onClose={() => setShowModal(false)} onSuccess={() => mutate()} />
            )}
        </div>
    )
}
