'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Package, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { PurchaseDetail, type PurchaseDetailData } from '@/components/inventory/PurchaseDetail'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Historial de compras.

   Antes esta pantalla solo servía para corregir el proveedor.
   Ahora responde lo que de verdad se pregunta uno: cuánto llevo
   gastado, qué entró en cada compra, a qué costo, y a quién le
   debo todavía.

   El gasto y el número de compras son del período que estés
   viendo. Lo que le debes a proveedores no: eso es de hoy, sin
   importar cuándo compraste.
   ══════════════════════════════════════════════════════════════ */

interface PurchaseRow {
    id: string
    created_at: string
    total: number
    is_credit: boolean
    provider_id: string | null
    providers: { name: string } | null
    purchase_items: { quantity: number; products: { name: string } | null }[]
}

interface Resumen {
    gastado: number
    compras: number
    aCredito: number
    porPagar: number
    vencidas: number
}

type Periodo = 'semana' | 'mes' | 'anio' | 'todo'
type Filtro = 'todas' | 'contado' | 'credito' | 'debiendo'

const PERIODOS: { key: Periodo; label: string }[] = [
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mes' },
    { key: 'anio', label: 'Año' },
    { key: 'todo', label: 'Todo' },
]

const FILTROS: { key: Filtro; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'contado', label: 'De contado' },
    { key: 'credito', label: 'A crédito' },
    { key: 'debiendo', label: 'Sin pagar' },
]

const PAGINA = 30

function desde(p: Periodo): string | null {
    if (p === 'todo') return null
    const d = new Date()
    if (p === 'semana') d.setDate(d.getDate() - 7)
    if (p === 'mes') d.setMonth(d.getMonth() - 1)
    if (p === 'anio') d.setFullYear(d.getFullYear() - 1)
    return d.toISOString()
}

const fecha = (iso: string) => {
    const d = new Date(iso)
    const esteAnio = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString('es-CO', esteAnio
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Un plazo que ya pasó deja de ser un dato y pasa a ser un aviso */
function estaVencida(iso: string | null) {
    if (!iso) return false
    const hoy = new Date(Date.now() - 5 * 3600_000); hoy.setHours(0, 0, 0, 0)
    const d = new Date(iso); d.setHours(0, 0, 0, 0)
    return d.getTime() < hoy.getTime()
}

const CSS = PANEL_CSS + `
.hc-page, .hc-wrap { container-type: inline-size; }

/* En el celular la línea no alcanza para todo y se perdía justo lo
   que importa: que esa compra sigue sin pagarse. Las unidades se
   guardan para el detalle y la deuda se baja a su propia línea. */
@container (max-width: 430px) {
    .hc-und, .hc-larga { display: none; }
    .hc-debe { display: block; }
}

.hc-chips { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.hc-chips::-webkit-scrollbar { display: none; }

.hc-chip { height: 34px; padding: 0 13px; border-radius: 999px; cursor: pointer; flex-shrink: 0;
    font-family: inherit; font-size: 13px; white-space: nowrap; font-weight: 500;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text-muted);
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1),
                color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 140ms cubic-bezier(0.23,1,0.32,1); }
.hc-chip[data-on="true"] { background: var(--toul-surface-focused);
    border-color: var(--toul-border-focused); color: var(--toul-accent); font-weight: 600; }
.hc-chip:active { transform: scale(0.97); }

.hc-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 10px;
    border-radius: 14px; border: none; background: none; font-family: inherit; text-align: left;
    cursor: pointer; color: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.hc-fila:active { transform: scale(0.99); }

@media (hover: hover) and (pointer: fine) {
    .hc-chip:hover { border-color: rgba(255,255,255,0.18); color: var(--toul-text); }
    .hc-chip[data-on="true"]:hover { color: var(--toul-accent); }
    .hc-fila:hover { background: rgba(255,255,255,0.04); }
}
@media (prefers-reduced-motion: reduce) {
    .hc-chip:active, .hc-fila:active { transform: none; }
}
`

export default function ComprasPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const [periodo, setPeriodo] = useState<Periodo>('mes')
    const [filtro, setFiltro] = useState<Filtro>('todas')
    const [busca, setBusca] = useState('')
    const [limite, setLimite] = useState(PAGINA)
    const [hayMas, setHayMas] = useState(false)
    const [abierta, setAbierta] = useState<PurchaseDetailData | null>(null)
    const [abriendo, setAbriendo] = useState<string | null>(null)
    const sentinela = useRef<HTMLDivElement>(null)

    // Cambiar de período o de filtro vuelve a empezar la lista
    const verPeriodo = (p: Periodo) => { setPeriodo(p); setLimite(PAGINA) }
    const verFiltro = (f: Filtro) => { setFiltro(f); setLimite(PAGINA) }

    // Los totales salen de la base, no de la página que estás viendo:
    // si no, el gasto cambiaría cada vez que bajas por la lista
    const { data: resumen } = useSWR<Resumen>(
        storeId ? ['compras-resumen', storeId, periodo] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_purchases_summary', {
                p_from: desde(periodo), p_to: null,
            })
            if (error) throw error
            return data as Resumen
        },
        { revalidateOnFocus: false },
    )

    const { data: compras, isLoading, isValidating, mutate } = useSWR<PurchaseRow[]>(
        storeId ? ['compras', storeId, periodo, filtro, limite] : null,
        async () => {
            let q = supabase.from('purchases')
                .select('id, created_at, total, is_credit, provider_id, providers(name), purchase_items(quantity, products(name))')
                .eq('store_id', storeId!)
                .order('created_at', { ascending: false })
            const from = desde(periodo)
            if (from) q = q.gte('created_at', from)
            if (filtro === 'contado') q = q.eq('is_credit', false)
            if (filtro === 'credito' || filtro === 'debiendo') q = q.eq('is_credit', true)

            const { data, error } = await q.limit(limite + 1)
            if (error) throw error
            const filas = (data ?? []) as unknown as PurchaseRow[]
            setHayMas(filas.length > limite)
            return filas.slice(0, limite)
        },
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    // Las que siguen sin pagar: la deuda vive aparte de la compra
    const { data: deudas } = useSWR(
        storeId ? ['compras-deudas', storeId] : null,
        async () => {
            const { data } = await supabase.from('provider_debts')
                .select('purchase_id, remaining_amount, due_date, status')
                .eq('store_id', storeId!).neq('status', 'paid').gt('remaining_amount', 0)
            const m = new Map<string, { falta: number; vence: string | null }>()
            for (const d of data ?? []) {
                if (d.purchase_id) m.set(d.purchase_id, { falta: Number(d.remaining_amount), vence: d.due_date })
            }
            return m
        },
        { revalidateOnFocus: false },
    )

    // Al llegar al final se cargan más solas
    useEffect(() => {
        const node = sentinela.current
        if (!node || !hayMas || isValidating) return
        const obs = new IntersectionObserver(e => {
            if (e[0]?.isIntersecting) setLimite(l => l + PAGINA)
        }, { rootMargin: '200px' })
        obs.observe(node)
        return () => obs.disconnect()
    }, [hayMas, isValidating])

    async function abrir(id: string) {
        setAbriendo(id)
        const { data, error } = await supabase.rpc('toul_purchase_detail', { p_purchase_id: id })
        setAbriendo(null)
        if (error || !data) { toast.error('No se pudo abrir esa compra'); return }
        setAbierta(data as PurchaseDetailData)
    }

    // La búsqueda corre sobre lo cargado: por proveedor o por producto
    const lista = useMemo(() => {
        const filas = compras ?? []
        const conDeuda = filtro === 'debiendo'
            ? filas.filter(c => (deudas?.get(c.id)?.falta ?? 0) > 0)
            : filas
        if (!busca.trim()) return conDeuda
        const t = busca.toLowerCase()
        return conDeuda.filter(c =>
            (c.providers?.name ?? '').toLowerCase().includes(t) ||
            (c.purchase_items ?? []).some(i => (i.products?.name ?? '').toLowerCase().includes(t)))
    }, [compras, deudas, filtro, busca])

    return (
        <div className="px-4 md:px-8 py-6 pb-24" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <div className="hc-page" style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <div className="flex items-center gap-3 mb-5">
                    <Link href="/inventory" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <div>
                        <p className="pnl-label" style={{ marginBottom: 2 }}>Inventario</p>
                        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                            Compras
                        </h1>
                    </div>
                </div>

                {/* ── Cuánto has comprado ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    style={{ borderRadius: 22, padding: '18px 20px', marginBottom: 14,
                        background: 'linear-gradient(180deg, var(--toul-surface) 0%, transparent 100%)',
                        border: '1px solid var(--toul-border)', borderBottomColor: 'transparent' }}>
                    <p className="pnl-label">Comprado</p>
                    <p style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.1,
                        margin: '6px 0 0', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(Number(resumen?.gastado ?? 0))}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                        {resumen?.compras ?? 0} {(resumen?.compras ?? 0) === 1 ? 'compra' : 'compras'}
                        {Number(resumen?.aCredito ?? 0) > 0 && <> · {formatCOP(Number(resumen!.aCredito))} a crédito</>}
                    </p>

                    {Number(resumen?.porPagar ?? 0) > 0 && (
                        <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--toul-divider)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--toul-text-dim)' }}>
                                Le debes<span className="hc-larga"> a proveedores</span>
                                {Number(resumen?.vencidas ?? 0) > 0 && (
                                    <span style={{ color: 'var(--toul-error)', fontWeight: 600 }}>
                                        {' · '}{resumen!.vencidas} {resumen!.vencidas === 1 ? 'vencida' : 'vencidas'}
                                    </span>
                                )}
                            </span>
                            <Link href="/providers" style={{ fontSize: 14, fontWeight: 700, color: 'var(--toul-warning)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCOP(Number(resumen!.porPagar))}
                            </Link>
                        </div>
                    )}
                </motion.div>

                {/* ── Filtros ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="hc-chips" style={{ marginBottom: 8 }}>
                    {PERIODOS.map(p => (
                        <button key={p.key} className="hc-chip" data-on={periodo === p.key}
                            onClick={() => verPeriodo(p.key)}>{p.label}</button>
                    ))}
                </motion.div>
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="hc-chips" style={{ marginBottom: 10 }}>
                    {FILTROS.map(f => (
                        <button key={f.key} className="hc-chip" data-on={filtro === f.key}
                            onClick={() => verFiltro(f.key)}>{f.label}</button>
                    ))}
                </motion.div>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                    <input className="toul-input" style={{ paddingLeft: 42 }}
                        placeholder="Buscar proveedor o producto…"
                        value={busca} onChange={e => setBusca(e.target.value)} />
                </motion.div>

                {/* ── La lista ── */}
                {isLoading && !compras ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height="64px" className="rounded-2xl" />)}
                    </div>
                ) : lista.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                        <Package size={30} style={{ color: 'var(--toul-border-2)', margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            {busca ? 'Nada con ese nombre' : 'Sin compras en este período'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                            {busca ? 'Prueba con el proveedor o con otro producto.' : 'Cambia el período o registra una compra nueva.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            className="hc-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {lista.map(c => {
                                const unidades = (c.purchase_items ?? []).reduce((s, i) => s + Number(i.quantity), 0)
                                const refs = (c.purchase_items ?? []).length
                                const deuda = deudas?.get(c.id)
                                return (
                                    <motion.div key={c.id} variants={staggerItem}>
                                        <button className="hc-fila" disabled={abriendo === c.id} onClick={() => abrir(c.id)}>
                                            <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(255,255,255,0.055)' }}>
                                                <Package size={16} style={{ color: 'var(--toul-text-faint)' }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em',
                                                    color: c.providers ? 'var(--toul-text)' : 'var(--toul-text-dim)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.providers?.name ?? 'Sin proveedor'}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {fecha(c.created_at)} · {refs} {refs === 1 ? 'producto' : 'productos'}
                                                    <span className="hc-und"> · {unidades} und</span>
                                                    {deuda && (
                                                        <span className="hc-debe" style={{ color: estaVencida(deuda.vence) ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                                            <span className="hc-und"> · </span>
                                                            debes {formatCOP(deuda.falta)}
                                                            {estaVencida(deuda.vence) && ' · vencida'}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 14.5, fontWeight: 700, flexShrink: 0, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                                {abriendo === c.id ? '…' : formatCOP(Number(c.total))}
                                            </span>
                                        </button>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                        <div ref={sentinela} style={{ height: 1 }} />
                        {isValidating && hayMas && (
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '14px 0 0', margin: 0 }}>
                                Cargando más…
                            </p>
                        )}
                    </>
                )}

                {/* La búsqueda solo ve lo que ya se cargó: decirlo evita que
                    alguien crea que una compra vieja no existe */}
                {busca.trim() !== '' && hayMas && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '11px 13px',
                        borderRadius: 14, background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--toul-text-dim)', lineHeight: 1.45 }}>
                            Buscando entre las compras cargadas. Baja hasta el final o abre el período «Todo» para buscar en todas.
                        </span>
                    </div>
                )}
            </div>

            <PurchaseDetail
                purchase={abierta}
                onClose={() => setAbierta(null)}
                onChanged={() => { setAbierta(null); mutate() }}
            />
        </div>
    )
}
