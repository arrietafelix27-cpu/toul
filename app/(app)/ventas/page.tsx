'use client'
import { Suspense, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCOP, getDateRange } from '@/lib/utils'
import { ZONA_COLOMBIA, instanteDeDia, periodoDeDireccion, periodoEnDireccion } from '@/lib/periodos'
import { nombreMetodo } from '@/lib/format/text'
import { ArrowLeft, Clock, Ban, Search, SlidersHorizontal, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import type { SaleVoid } from '@/lib/isla/types'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem, fadeUp, t } from '@/lib/motion'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import type { SaleDetailData as VentaData } from '@/lib/types'
import { SALE_DETAIL_SELECT } from '@/lib/types'
import { VentaAbierta, cargarVenta } from '@/components/ventas/VentaAbierta'

type Period = 'today' | 'week' | 'month' | 'year' | 'total' | 'custom'

/** Los mismos periodos del Inicio y Reportes, en hora de Colombia. Las
 *  fechas elegidas van del primer al último instante de esos días allá
 *  (antes se leían en UTC y se perdían las ventas de 7 p. m. a medianoche) */
function getRange(period: Period, from: string, to: string) {
    if (period === 'custom') return {
        from: from ? instanteDeDia(from).toISOString() : null,
        to: to ? instanteDeDia(to, true).toISOString() : null,
    }
    if (period === 'total') return { from: null, to: null }
    return getDateRange(period)
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: ZONA_COLOMBIA })
}

/** Lo que dejó una venta: lo que pagaron (ya con el descuento) menos lo que costó la mercancía */
function utilidad(venta: { total: number; sale_items?: { quantity: number; unit_cost: number }[] | null }) {
    return Number(venta.total) - (venta.sale_items ?? []).reduce((a, i) => a + Number(i.unit_cost) * Number(i.quantity), 0)
}

const PAGE_SIZE = 40

/* PC: tabla. En una sola fila de lado a lado lo vendido quedaba a un
   extremo de la pantalla y el total al otro; con columnas se compara
   de un vistazo. El celular sigue con su lista. */
const VT_CSS = `
.vt-tabla { display: none; }
@media (min-width: 1024px) {
    .vt-tabla { display: block; }
    .vt-cabeza, .vt-fila { display: grid; grid-template-columns: 118px minmax(0, 2fr) minmax(0, 1.1fr) minmax(0, 1fr) 120px 110px; gap: 16px; align-items: center; }
    .vt-cabeza { padding: 0 12px 9px; border-bottom: 1px solid var(--toul-divider); margin-bottom: 4px;
        font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--toul-text-faint); }
    .vt-fila { width: 100%; padding: 11px 12px; border-radius: 12px; border: none; background: none; font-family: inherit;
        text-align: left; cursor: pointer; color: inherit; transition: background-color 160ms var(--toul-ease-emil); }
    .vt-fila > span { min-width: 0; }
    .vt-1 { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .vt-2 { display: block; font-size: 12px; color: var(--toul-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
    .vt-num { text-align: right; font-variant-numeric: tabular-nums; }
}
@media (hover: hover) and (pointer: fine) { .vt-fila:hover { background: var(--toul-surface-3); } }
.vt-volver { width: 36px; height: 36px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 7%, transparent); color: var(--toul-text-muted);
    -webkit-tap-highlight-color: transparent; transition: transform 140ms var(--toul-ease-emil), background-color 160ms var(--toul-ease-emil); }
.vt-volver:active { transform: scale(0.94); }
@media (hover: hover) and (pointer: fine) { .vt-volver:hover { background: color-mix(in srgb, var(--toul-text) 10%, transparent); color: var(--toul-text); } }
`

type Kind = 'todas' | 'contado' | 'credito' | 'descuento'

const KINDS: { value: Kind; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'contado', label: 'Contado' },
    { value: 'credito', label: 'Crédito' },
    { value: 'descuento', label: 'Con descuento' },
]

/** El periodo y el tipo que trae la dirección (desde Reportes), o "Hoy" */
function periodoDeLaDireccion(params: URLSearchParams | ReadonlyURLSearchParams): { period: Period; desde: string; hasta: string; kind: Kind } {
    const p = periodoDeDireccion(params)
    const tipo = params.get('tipo')
    const kind: Kind = tipo === 'contado' || tipo === 'credito' || tipo === 'descuento' ? tipo : 'todas'
    return { period: p?.periodo ?? 'today', desde: p?.desde ?? '', hasta: p?.hasta ?? '', kind }
}

export default function VentasPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <Ventas />
        </Suspense>
    )
}

function Ventas() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    // Desde Reportes llega con el mismo periodo:
    // /ventas?periodo=month o /ventas?periodo=custom&desde=2026-10-01&hasta=2026-10-31
    const params = useSearchParams()
    const [inicial] = useState(() => periodoDeLaDireccion(params))
    const [period, setPeriod] = useState<Period>(inicial.period)
    const [fromDate, setFromDate] = useState(inicial.desde)
    const [toDate, setToDate] = useState(inicial.hasta)
    const [selectedSale, setSelectedSale] = useState<VentaData | null>(null)
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [hasMore, setHasMore] = useState(true)
    // Las ventas siguen cargando solas al llegar al final de la lista
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const [view, setView] = useState<'ventas' | 'anuladas'>('ventas')
    const [seller, setSeller] = useState<string>('todos')
    const [kind, setKind] = useState<Kind>(inicial.kind)
    const [query, setQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)

    // Using SWR for caching and consistency
    const { data: sales, isLoading, isValidating, mutate } = useSWR<VentaData[]>(
        storeId ? ['sales', storeId, period, fromDate, toDate, limit, seller, kind] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)
            // seller_name existe desde migration_v10 (modo isla); si falta, se reintenta sin él
            const baseSelect = SALE_DETAIL_SELECT
            const run = (select: string) => {
                let q = supabase.from('sales')
                    .select(select)
                    .eq('store_id', storeId)
                    .order('created_at', { ascending: false })
                    .gte('created_at', range.from || '1970-01-01')
                    .lte('created_at', range.to || '9999-12-31')
                if (seller !== 'todos') q = q.eq('seller_name', seller)
                if (kind === 'contado') q = q.eq('is_credit', false)
                if (kind === 'credito') q = q.eq('is_credit', true)
                if (kind === 'descuento') q = q.gt('discount', 0)
                return q.limit(limit + 1)
            }

            let { data, error } = await run(`${baseSelect}, seller_name`)
            if (error) ({ data, error } = await run(baseSelect))
            if (error) throw error

            const results = (data || []) as unknown as VentaData[]
            if (results.length > limit) {
                setHasMore(true)
                return results.slice(0, limit)
            } else {
                setHasMore(false)
                return results
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const cerrarVenta = useCallback(() => setSelectedSale(null), [])
    const ventaCambio = useCallback(() => { mutate() }, [mutate])

    // Nombres reales de los métodos de pago del negocio (Datáfono, Addi, etc.)
    const { data: methodNames } = useSWR(storeId ? ['method-names', storeId] : null, async () => {
        const res = await fetch('/api/payment-methods')
        const data = await res.json()
        const map: Record<string, string> = {}
        for (const m of data.methods ?? []) map[String(m.name).toLowerCase()] = m.name
        return map
    }, { revalidateOnFocus: false })

    // El nombre como está en Ajustes, con mayúscula inicial al mostrarlo
    const methodLabel = (raw: string) => nombreMetodo(methodNames?.[raw?.toLowerCase()] ?? raw)

    // Desde la ficha del cliente ("Abrir en Ventas") se llega con ?venta=<id>:
    // abre de una. La dirección se limpia solo cuando la venta ya abrió: si
    // la pantalla se vuelve a montar mientras carga, lo intenta otra vez
    useEffect(() => {
        if (!storeId) return
        const id = new URLSearchParams(window.location.search).get('venta')
        if (!id) return
        let vivo = true
        ;(async () => {
            const venta = await cargarVenta(storeId, id)
            if (!vivo) return
            const url = new URL(window.location.href)
            url.searchParams.delete('venta')
            window.history.replaceState(null, '', url.pathname + url.search)
            if (!venta) { toast.error('No se pudo abrir esa venta'); return }
            setSelectedSale(venta)
        })()
        return () => { vivo = false }
    }, [storeId])

    const { data: sellers } = useSWR(storeId ? ['sellers', storeId] : null, async () => {
        const { data } = await supabase.from('store_members').select('display_name').eq('store_id', storeId).order('created_at')
        return (data ?? []).map(m => m.display_name as string)
    }, { revalidateOnFocus: false })

    // Al llegar al final de la lista, se cargan más solas
    useEffect(() => {
        const node = sentinelRef.current
        if (!node || !hasMore || isValidating) return
        const observer = new IntersectionObserver(entries => {
            if (entries[0]?.isIntersecting) setLimit(current => current + PAGE_SIZE)
        }, { rootMargin: '320px' })
        observer.observe(node)
        return () => observer.disconnect()
    }, [hasMore, isValidating, sales])

    const { data: voids } = useSWR<SaleVoid[]>(
        storeId && view === 'anuladas' ? ['sale-voids', storeId, period, fromDate, toDate] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)
            const { data } = await supabase.from('sale_voids').select('*')
                .eq('store_id', storeId)
                .gte('voided_at', range.from || '1970-01-01')
                .lte('voided_at', range.to || '9999-12-31')
                .order('voided_at', { ascending: false })
            return (data ?? []) as SaleVoid[]
        },
        { revalidateOnFocus: false }
    )

    // Búsqueda por cliente o producto sobre las ventas del período
    const filtered = useMemo(() => {
        const list = sales || []
        const q = query.trim().toLowerCase()
        if (!q) return list
        return list.filter(sale =>
            sale.customer_name?.toLowerCase().includes(q) ||
            sale.seller_name?.toLowerCase().includes(q) ||
            sale.sale_items.some(i => ((i.products as { name?: string } | null)?.name ?? '').toLowerCase().includes(q))
        )
    }, [sales, query])

    // El total se calcula sobre todas las ventas del periodo. Antes
    // sumaba solo las 40 que estuvieran cargadas en pantalla.
    const { data: periodTotals } = useSWR(
        storeId ? ['sales-totals', storeId, period, fromDate, toDate, seller, kind] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)
            const run = (withSeller: boolean) => {
                let q = supabase.from('sales')
                    .select('total, is_credit, sale_items(quantity, unit_price, unit_cost), sale_payments(amount)')
                    .eq('store_id', storeId)
                    .gte('created_at', range.from || '1970-01-01')
                    .lte('created_at', range.to || '9999-12-31')
                if (withSeller && seller !== 'todos') q = q.eq('seller_name', seller)
                if (kind === 'contado') q = q.eq('is_credit', false)
                if (kind === 'credito') q = q.eq('is_credit', true)
                if (kind === 'descuento') q = q.gt('discount', 0)
                return q
            }
            // Lo devuelto en el periodo resta el día en que se devuelve, con
            // los mismos filtros de la venta a la que pertenece
            const devoluciones = async () => {
                let q = supabase.from('sale_returns')
                    .select('total, cost_total, sales!inner(seller_name, is_credit, discount)')
                    .eq('store_id', storeId)
                    .gte('created_at', range.from || '1970-01-01')
                    .lte('created_at', range.to || '9999-12-31')
                if (seller !== 'todos') q = q.eq('sales.seller_name', seller)
                if (kind === 'contado') q = q.eq('sales.is_credit', false)
                if (kind === 'credito') q = q.eq('sales.is_credit', true)
                if (kind === 'descuento') q = q.gt('sales.discount', 0)
                const { data, error } = await q
                // Antes de activar las devoluciones la tabla no existe: no hay nada que restar
                return error ? [] : (data ?? []) as unknown as { total: number; cost_total: number }[]
            }
            const [primera, devueltas] = await Promise.all([run(true), devoluciones()])
            let { data, error } = primera
            if (error) ({ data, error } = await run(false))
            if (error) throw error
            const list = (data ?? []) as unknown as { total: number; is_credit: boolean; sale_items: { quantity: number; unit_price: number; unit_cost: number }[]; sale_payments: { amount: number }[] | null }[]
            const devuelto = devueltas.reduce((sum, d) => sum + Number(d.total), 0)
            const gananciaDevuelta = devueltas.reduce((sum, d) => sum + Number(d.total) - Number(d.cost_total), 0)
            return {
                revenue: Math.round(list.reduce((sum, v) => sum + Number(v.total), 0) - devuelto),
                profit: Math.round(list.reduce((sum, v) => sum + utilidad(v), 0) - gananciaDevuelta),
                count: list.length,
                // Lo que quedó fiado: lo mismo que "A crédito" en Reportes
                // (de cada venta a crédito, lo que no se pagó al momento)
                fiado: Math.round(list.filter(v => v.is_credit).reduce((sum, v) => {
                    const pagado = Math.min(Math.max((v.sale_payments ?? []).reduce((a, p) => a + Number(p.amount), 0), 0), Number(v.total))
                    return sum + Number(v.total) - pagado
                }, 0)),
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    // Lo que se devolvió de cada venta de la lista, para marcarla
    const saleIds = useMemo(() => (sales ?? []).map(v => v.id), [sales])
    const { data: devueltoPorVenta } = useSWR(
        saleIds.length ? ['devoluciones-lista', saleIds.join(',')] : null,
        async () => {
            const { data, error } = await supabase.from('sale_returns').select('sale_id, total, cost_total').in('sale_id', saleIds)
            const map = new Map<string, { total: number; ganancia: number }>()
            if (error) return map
            for (const d of data ?? []) {
                const prev = map.get(d.sale_id) ?? { total: 0, ganancia: 0 }
                map.set(d.sale_id, { total: prev.total + Number(d.total), ganancia: prev.ganancia + Number(d.total) - Number(d.cost_total) })
            }
            return map
        },
        { revalidateOnFocus: false },
    )

    // Si está buscando por texto, el resumen refleja lo que ve
    const totals = useMemo(() => {
        if (query.trim()) {
            const devuelto = filtered.reduce((s, v) => s + (devueltoPorVenta?.get(v.id)?.total ?? 0), 0)
            const gananciaDevuelta = filtered.reduce((s, v) => s + (devueltoPorVenta?.get(v.id)?.ganancia ?? 0), 0)
            return {
                revenue: Math.round(filtered.reduce((s, v) => s + v.total, 0) - devuelto),
                profit: Math.round(filtered.reduce((s, v) => s + utilidad(v), 0) - gananciaDevuelta),
                count: filtered.length,
                fiado: periodTotals?.fiado ?? 0,
            }
        }
        return periodTotals ?? { revenue: 0, profit: 0, count: 0, fiado: 0 }
    }, [filtered, periodTotals, query, devueltoPorVenta])

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
        { value: 'year', label: 'Año' },
        { value: 'total', label: 'Todo' },
        { value: 'custom', label: 'Rango' },
    ]

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 max-w-[1180px] mx-auto" style={{ position: 'relative' }}>
            <style>{VT_CSS}</style>
            <div className="toul-ambient" />
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5 flex items-center gap-3" style={{ position: 'relative' }}>
                {/* Ventas ya no está en el menú: se llega desde Movimientos y se vuelve allá */}
                <Link href={`/movimientos?${periodoEnDireccion(period, getRange(period, fromDate, toDate))}`}
                    aria-label="Volver a Movimientos" className="vt-volver">
                    <ArrowLeft size={18} strokeWidth={2} />
                </Link>
                <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>Historial de ventas</h1>
            </motion.div>

            {/* Period tabs */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.04 }}
                className="flex gap-1.5 mb-4 flex-wrap">
                {PERIODS.map(p => (
                    <motion.button
                        key={p.value}
                        onClick={() => { setPeriod(p.value); setLimit(PAGE_SIZE) }}
                        whileTap={{ scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                        style={{
                            padding: '8px 14px',
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            border: `1px solid ${period === p.value ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                            background: period === p.value ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                            color: period === p.value ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                            transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                        }}>
                        {p.label}
                    </motion.button>
                ))}
            </motion.div>

            {/* Ventas / Anuladas */}
            <div className="flex gap-1.5 mb-4">
                {([['ventas', 'Ventas'], ['anuladas', 'Anuladas']] as const).map(([value, label]) => (
                    <button key={value} onClick={() => setView(value)}
                        style={{
                            padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                            border: '1px solid transparent',
                            background: view === value ? 'var(--toul-surface-2)' : 'transparent',
                            color: view === value ? 'var(--toul-text)' : 'var(--toul-text-dim)',
                            transition: 'background var(--toul-transition), color var(--toul-transition)',
                        }}>
                        {label}
                    </button>
                ))}
            </div>

            {view === 'anuladas' && (
                (voids ?? []).length === 0 ? (
                    <EmptyState icon={Ban} title="Sin ventas anuladas" description="Las ventas anuladas en este período aparecen aquí, con el motivo y quién aprobó." />
                ) : (
                    <div className="flex flex-col gap-2">
                        {voids!.map(v => (
                            <div key={v.id} className="toul-card flex items-center gap-3 py-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--toul-error-dim)' }}>
                                    <Ban size={18} style={{ color: 'var(--toul-error)' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>
                                        {v.snapshot.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                        {formatDateTime(v.voided_at)} · {v.reason}
                                        {v.requested_by_name && v.requested_by_name !== v.approved_by_name ? ` · pidió ${v.requested_by_name}` : ''}
                                        {v.approved_by_name ? ` · aprobó ${v.approved_by_name}` : ''}
                                    </p>
                                </div>
                                <p className="font-bold text-sm" style={{ color: 'var(--toul-error)', textDecoration: 'line-through' }}>{formatCOP(v.total)}</p>
                            </div>
                        ))}
                    </div>
                )
            )}

            {/* Custom date range */}
            {period === 'custom' && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    className="toul-card mb-4 flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                        <input type="date" className="toul-input text-sm" value={fromDate} onChange={e => { setFromDate(e.target.value); setLimit(PAGE_SIZE) }} />
                    </div>
                    <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                        <input type="date" className="toul-input text-sm" value={toDate} onChange={e => { setToDate(e.target.value); setLimit(PAGE_SIZE) }} />
                    </div>
                </motion.div>
            )}

            {/* Búsqueda y filtros */}
            {view === 'ventas' && (
                <div className="mb-4">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                            <input className="toul-input" placeholder="Buscar por cliente, producto o vendedor"
                                value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 42 }} />
                        </div>
                        <button onClick={() => setShowFilters(v => !v)} aria-label="Filtros"
                            style={{
                                width: 48, flexShrink: 0, borderRadius: 14, cursor: 'pointer',
                                background: showFilters || seller !== 'todos' || kind !== 'todas' ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${showFilters || seller !== 'todos' || kind !== 'todas' ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: seller !== 'todos' || kind !== 'todas' ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                            }}>
                            <SlidersHorizontal size={17} />
                        </button>
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} style={{ overflow: 'hidden' }}>
                                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div>
                                        <p className="toul-section-label" style={{ margin: '0 0 6px 2px' }}>Tipo de venta</p>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {KINDS.map(k => {
                                                const active = kind === k.value
                                                return (
                                                    <button key={k.value} onClick={() => { setKind(k.value); setLimit(PAGE_SIZE) }}
                                                        style={{
                                                            padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                                            background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                                            border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                                            color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                                            transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                                                        }}>
                                                        {k.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                    {(sellers?.length ?? 0) > 1 && (
                                        <div>
                                            <p className="toul-section-label" style={{ margin: '0 0 6px 2px' }}>Vendedor</p>
                                            <div className="flex gap-1.5 flex-wrap">
                                                {['todos', ...(sellers ?? [])].map(name => {
                                                    const active = seller === name
                                                    return (
                                                        <button key={name} onClick={() => { setSeller(name); setLimit(PAGE_SIZE) }}
                                                            style={{
                                                                padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                                                                background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                                                transition: 'background var(--toul-transition), border-color var(--toul-transition), color var(--toul-transition)',
                                                            }}>
                                                            {name === 'todos' ? 'Todos' : name}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Summary chips */}
            {view === 'anuladas' ? null : (isLoading || storeLoading) ? (
                <div className="grid grid-cols-3 gap-2 mb-5">
                    {[1, 2, 3].map(i => <Skeleton key={i} height="52px" className="rounded-xl" />)}
                </div>
            ) : (sales || []).length > 0 && (
                <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                    className={`grid ${kind === 'credito' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'} gap-2 mb-5`}>
                    {[
                        { label: 'Ventas', value: String(totals.count), raw: true, color: 'var(--toul-text)' },
                        // Después de devoluciones, como en toda la app
                        { label: 'Vendiste', value: totals.revenue, color: 'var(--toul-accent)' },
                        { label: 'Utilidad', value: totals.profit, color: 'var(--toul-accent)' },
                        ...(kind === 'credito' ? [{ label: 'Quedó fiado', value: totals.fiado, color: 'var(--toul-text)' }] : []),
                    ].map(chip => (
                        <motion.div key={chip.label} variants={staggerItem} className="toul-card py-2.5 px-3 text-center">
                            <p className="text-[10px] mb-1" style={{ color: 'var(--toul-text-subtle)' }}>{chip.label}</p>
                            <p className="font-bold text-sm" style={{ color: chip.color }}>
                                {chip.raw ? chip.value : formatCOP(chip.value as unknown as number)}
                            </p>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* Sales list */}
            {view === 'anuladas' ? null : (isLoading || storeLoading) ? (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3, 4, 5, 6].map(n => <Skeleton key={n} height="68px" className="rounded-2xl" />)}
                </div>
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon={Clock}
                    title="Sin ventas en este período"
                    description="Cambia el filtro, o ve a la caja y registra una venta."
                    action={
                        <Link href="/caja"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold"
                            style={{ background: 'var(--toul-accent)', color: '#000', textDecoration: 'none', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                            Ir a la caja
                        </Link>
                    }
                />
            ) : (
                <>
                    {/* PC */}
                    <div className="vt-tabla">
                        <div className="vt-cabeza" aria-hidden>
                            <span>Fecha</span><span>Qué se vendió</span><span>Cliente</span><span>Pago</span>
                            <span className="vt-num">Total</span><span className="vt-num">Utilidad</span>
                        </div>
                        {filtered.map(sale => {
                            const profit = Math.round(utilidad(sale))
                            const summary = sale.sale_items.slice(0, 2).map(i => (i.products as { name?: string } | null)?.name || 'Producto').join(', ')
                            const more = sale.sale_items.length > 2 ? ` +${sale.sale_items.length - 2}` : ''
                            const vendedor = sale.seller_name && sale.seller_name !== 'Administrador' ? sale.seller_name : null
                            return (
                                <button key={sale.id} className="vt-fila" onClick={() => setSelectedSale(sale)}>
                                    <span className="vt-1" style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>{formatDateTime(sale.created_at)}</span>
                                    <span>
                                        <span className="vt-1" style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{summary}{more}</span>
                                        <span className="vt-2">#{sale.id.slice(0, 8).toUpperCase()}{vendedor ? ` · ${vendedor}` : ''}</span>
                                    </span>
                                    <span>
                                        <span className="vt-1" style={{ fontSize: 13.5, color: sale.customer_name ? 'var(--toul-text)' : 'var(--toul-text-faint)' }}>
                                            {sale.customer_name || 'Sin cliente'}
                                        </span>
                                        {sale.is_credit && <span className="vt-2" style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>A crédito</span>}
                                    </span>
                                    <span>
                                        <span className="vt-1" style={{ fontSize: 13.5, color: 'var(--toul-text-muted)' }}>{methodLabel(sale.payment_method)}</span>
                                        {sale.discount > 0 && <span className="vt-2" style={{ color: 'var(--toul-warning)' }}>Dto. {formatCOP(sale.discount)}</span>}
                                    </span>
                                    <span className="vt-num">
                                        <span className="vt-1" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--toul-text)' }}>{formatCOP(sale.total)}</span>
                                        {devueltoPorVenta?.get(sale.id) && (
                                            <span className="vt-2" style={{ color: 'var(--toul-warning)' }}>Devolvió {formatCOP(devueltoPorVenta.get(sale.id)!.total)}</span>
                                        )}
                                    </span>
                                    <span className="vt-num vt-1" style={{ fontSize: 13.5, fontWeight: 600, color: profit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                        {profit >= 0 ? '+' : '−'}{formatCOP(Math.abs(profit))}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Celular */}
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                        className="flex flex-col gap-2 lg:hidden">
                        {filtered.map(sale => {
                            const profit = Math.round(utilidad(sale))
                            const summary = sale.sale_items.slice(0, 2).map(i => (i.products as any)?.name || 'Producto').join(', ')
                            const more = sale.sale_items.length > 2 ? ` +${sale.sale_items.length - 2}` : ''
                            return (
                                <motion.button key={sale.id} variants={staggerItem}
                                    onClick={() => setSelectedSale(sale)}
                                    className="toul-card toul-card-interactive text-left flex items-center gap-3 py-3"
                                    whileTap={{ scale: 0.99 }}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'var(--toul-surface-2)' }}>
                                        <Receipt size={17} style={{ color: 'var(--toul-text-muted)' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{summary}{more}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                            {formatDateTime(sale.created_at)} · {methodLabel(sale.payment_method)}
                                            <span style={{ color: 'var(--toul-text-faint)' }}> · #{sale.id.slice(0, 8).toUpperCase()}</span>
                                            {sale.seller_name && sale.seller_name !== 'Administrador' && <span> · {sale.seller_name}</span>}
                                            {sale.is_credit && <span style={{ color: 'var(--toul-accent)', fontWeight: 600 }}> · Crédito</span>}
                                            {sale.is_credit && sale.customer_name && <span style={{ color: 'var(--toul-text-muted)' }}> — {sale.customer_name}</span>}
                                            {sale.discount > 0 && <span style={{ color: 'var(--toul-warning)' }}> · Dto. {formatCOP(sale.discount)}</span>}
                                            {devueltoPorVenta?.get(sale.id) && <span style={{ color: 'var(--toul-warning)' }}> · Devolvió {formatCOP(devueltoPorVenta.get(sale.id)!.total)}</span>}
                                        </p>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(sale.total)}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-accent)' }}>+{formatCOP(profit)}</p>
                                    </div>
                                </motion.button>
                            )
                        })}
                    </motion.div>

                    {hasMore && (
                        <div ref={sentinelRef} style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 12, color: 'var(--toul-text-dim)' }}>
                                {isValidating ? 'Cargando más…' : '\u00a0'}
                            </span>
                        </div>
                    )}
                </>
            )}

            {/* La venta abierta, con devolver, anular y cambiar el cliente:
                es la misma que se abre desde Movimientos */}
            <VentaAbierta venta={selectedSale} storeId={storeId} onCerrar={cerrarVenta} onCambio={ventaCambio} />
        </div>
    )
}
