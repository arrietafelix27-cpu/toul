'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Clock, Ban, Search, SlidersHorizontal, Receipt } from 'lucide-react'
import toast from 'react-hot-toast'
import { VoidSaleDialog } from '@/components/isla/VoidSaleDialog'
import { Sheet } from '@/components/isla/Sheet'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { explainError } from '@/lib/errors'
import type { SaleVoid } from '@/lib/isla/types'
import { motion, AnimatePresence } from 'framer-motion'
import { staggerContainer, staggerItem, fadeUp, t } from '@/lib/motion'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import type { SaleDetailData as VentaData } from '@/lib/types'
import { SALE_DETAIL_SELECT } from '@/lib/types'
import { SaleDetail } from '@/components/ventas/SaleDetail'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'

function getRange(period: Period, from: string, to: string) {
    const now = new Date()
    if (period === 'custom') return { from: from || null, to: to ? to + 'T23:59:59' : null }
    if (period === 'total') return { from: null, to: null }
    if (period === 'today') { const s = new Date(now); s.setHours(0, 0, 0, 0); return { from: s.toISOString(), to: now.toISOString() } }
    if (period === 'week') { const s = new Date(now); s.setDate(s.getDate() - 6); s.setHours(0, 0, 0, 0); return { from: s.toISOString(), to: now.toISOString() } }
    if (period === 'month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: s.toISOString(), to: now.toISOString() } }
    return { from: null, to: null }
}

function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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
`

type Kind = 'todas' | 'contado' | 'credito' | 'descuento'

const KINDS: { value: Kind; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'contado', label: 'Contado' },
    { value: 'credito', label: 'Crédito' },
    { value: 'descuento', label: 'Con descuento' },
]

export default function VentasPage() {
    const supabase = createClient()
    const { data: store, isLoading: storeLoading } = useStore()
    const storeId = store?.id || null

    const [period, setPeriod] = useState<Period>('today')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [selectedSale, setSelectedSale] = useState<VentaData | null>(null)
    const [limit, setLimit] = useState(PAGE_SIZE)
    const [hasMore, setHasMore] = useState(true)
    // Las ventas siguen cargando solas al llegar al final de la lista
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const [customerEdit, setCustomerEdit] = useState<VentaData | null>(null)
    const [savingCustomer, setSavingCustomer] = useState(false)

    const { data: customerList } = useSWR(
        storeId && customerEdit ? ['clientes-venta', storeId] : null,
        async () => {
            const { data } = await supabase.from('customers')
                .select('id, name, total_debt').eq('store_id', storeId!).eq('is_active', true).order('name')
            return data ?? []
        },
        { revalidateOnFocus: false },
    )

    async function changeSaleCustomer(customerId: string | null) {
        if (!customerEdit) return
        setSavingCustomer(true)
        const { data, error } = await supabase.rpc('toul_change_sale_customer', {
            p_sale_id: customerEdit.id,
            p_customer_id: customerId,
        })
        setSavingCustomer(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar el cliente.')); return }
        setCustomerEdit(null)
        setSelectedSale(null)
        mutate()

        if (data?.changed === false) {
            toast('Esa venta ya estaba a nombre de ese cliente')
        } else if (customerId === null) {
            toast.success('La venta quedó sin cliente')
        } else {
            const movida = Number(data?.movedDebt ?? 0)
            toast.success(movida > 0
                ? `La venta quedó a nombre de ${data?.name}. Se le pasaron ${formatCOP(movida)} de deuda.`
                : `La venta quedó a nombre de ${data?.name}`)
        }
    }
    const [view, setView] = useState<'ventas' | 'anuladas'>('ventas')
    const [seller, setSeller] = useState<string>('todos')
    const [kind, setKind] = useState<Kind>('todas')
    const [query, setQuery] = useState('')
    const [showFilters, setShowFilters] = useState(false)
    const [voidOpen, setVoidOpen] = useState(false)

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

    // Nombres reales de los métodos de pago del negocio (Datáfono, Addi, etc.)
    const { data: methodNames } = useSWR(storeId ? ['method-names', storeId] : null, async () => {
        const res = await fetch('/api/payment-methods')
        const data = await res.json()
        const map: Record<string, string> = {}
        for (const m of data.methods ?? []) map[String(m.name).toLowerCase()] = m.name
        return map
    }, { revalidateOnFocus: false })

    const methodLabel = (raw: string) =>
        methodNames?.[raw?.toLowerCase()] ?? (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Pago')

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
                    .select('total, sale_items(quantity, unit_price, unit_cost)')
                    .eq('store_id', storeId)
                    .gte('created_at', range.from || '1970-01-01')
                    .lte('created_at', range.to || '9999-12-31')
                if (withSeller && seller !== 'todos') q = q.eq('seller_name', seller)
                if (kind === 'contado') q = q.eq('is_credit', false)
                if (kind === 'credito') q = q.eq('is_credit', true)
                if (kind === 'descuento') q = q.gt('discount', 0)
                return q
            }
            let { data, error } = await run(true)
            if (error) ({ data, error } = await run(false))
            if (error) throw error
            const list = (data ?? []) as unknown as { total: number; sale_items: { quantity: number; unit_price: number; unit_cost: number }[] }[]
            return {
                revenue: Math.round(list.reduce((sum, v) => sum + Number(v.total), 0)),
                profit: Math.round(list.reduce((sum, v) => sum + (v.sale_items ?? []).reduce((a, i) => a + (i.unit_price - i.unit_cost) * i.quantity, 0), 0)),
                count: list.length,
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 30000 },
    )

    // Si está buscando por texto, el resumen refleja lo que ve
    const totals = useMemo(() => {
        if (query.trim()) {
            return {
                revenue: Math.round(filtered.reduce((s, v) => s + v.total, 0)),
                profit: Math.round(filtered.reduce((s, v) => s + v.sale_items.reduce((a, i) => a + (i.unit_price - i.unit_cost) * i.quantity, 0), 0)),
                count: filtered.length,
            }
        }
        return periodTotals ?? { revenue: 0, profit: 0, count: 0 }
    }, [filtered, periodTotals, query])

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
        { value: 'total', label: 'Todo' },
        { value: 'custom', label: 'Rango' },
    ]

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 max-w-[1180px] mx-auto" style={{ position: 'relative' }}>
            <style>{VT_CSS}</style>
            <div className="toul-ambient" />
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5" style={{ position: 'relative' }}>
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
                    className="grid grid-cols-3 gap-2 mb-5">
                    {[
                        { label: 'Ventas', value: String(totals.count), raw: true, color: 'var(--toul-text)' },
                        { label: 'Facturado', value: totals.revenue, color: 'var(--toul-accent)' },
                        { label: 'Utilidad', value: totals.profit, color: 'var(--toul-accent)' },
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
                            const profit = Math.round(sale.sale_items.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0))
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
                                    <span className="vt-num vt-1" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--toul-text)' }}>{formatCOP(sale.total)}</span>
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
                            const profit = sale.sale_items.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0)
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

            {/* El resumen vive en components/ventas: la ficha del cliente
                abre exactamente este mismo */}
            <SaleDetail
                sale={selectedSale}
                onClose={() => setSelectedSale(null)}
                onChangeCustomer={setCustomerEdit}
                onVoid={() => setVoidOpen(true)}
            />

            {/* Corregir a quién se le vendió */}
            <Sheet
                open={!!customerEdit}
                onClose={() => setCustomerEdit(null)}
                title="¿A quién fue esta venta?"
                subtitle={customerEdit ? formatCOP(customerEdit.total) : undefined}>
                <style>{PANEL_CSS}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
                    {!customerEdit?.is_credit && (
                        <button className="pnl-row" style={{ border: '1px solid var(--toul-border)', background: 'var(--toul-surface)' }}
                            disabled={savingCustomer} onClick={() => changeSaleCustomer(null)}>
                            <span style={{ flex: 1, fontSize: 14.5, color: 'var(--toul-text-dim)', textAlign: 'left' }}>Sin cliente</span>
                        </button>
                    )}
                    {(customerList ?? []).map(person => {
                        const actual = customerEdit?.customer_id === person.id
                        return (
                            <button key={person.id} className="pnl-row"
                                style={{
                                    border: `1px solid ${actual ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                    background: actual ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                }}
                                disabled={savingCustomer || actual} onClick={() => changeSaleCustomer(person.id)}>
                                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: actual ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                                        {person.name}
                                    </span>
                                    {actual && (
                                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-accent)' }}>
                                            esta venta ya es de esta persona
                                        </span>
                                    )}
                                </span>
                                {Number(person.total_debt) > 0 && (
                                    <span style={{ fontSize: 12.5, color: 'var(--toul-warning)', flexShrink: 0 }}>
                                        debe {formatCOP(Number(person.total_debt))}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                    {customerEdit?.is_credit && (
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                            Esta venta fue a crédito: al cambiar el cliente, la deuda se le pasa al nuevo.
                        </p>
                    )}
                </div>
            </Sheet>

            {selectedSale && (
                <VoidSaleDialog
                    open={voidOpen}
                    onClose={() => setVoidOpen(false)}
                    saleId={selectedSale.id}
                    total={selectedSale.total}
                    isAdmin
                    onDone={() => { setVoidOpen(false); setSelectedSale(null); mutate() }}
                />
            )}
        </div>
    )
}
