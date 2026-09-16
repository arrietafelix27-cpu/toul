'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Clock, X, Printer, Ban } from 'lucide-react'
import toast from 'react-hot-toast'
import { VoidSaleDialog } from '@/components/isla/VoidSaleDialog'
import { loadReceiptData, printReceipt } from '@/lib/isla/receipt'
import type { SaleVoid } from '@/lib/isla/types'
import { motion, AnimatePresence } from 'framer-motion'
import { PAYMENT_METHODS } from '@/lib/types'
import { staggerContainer, staggerItem, fadeUp, t, panelVariants, backdropVariants } from '@/lib/motion'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { useStore } from '@/lib/hooks/useData'
import useSWR from 'swr'
import type { Sale } from '@/lib/types'

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

interface SaleItem {
    product_id: string
    quantity: number
    unit_price: number
    unit_cost: number
    products: { name: string; image_url: string | null } | null
}

interface VentaData {
    id: string
    created_at: string
    total: number
    discount: number
    payment_method: string
    is_credit: boolean
    customer_name: string | null
    seller_name?: string | null
    sale_items: SaleItem[]
}

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
    const [view, setView] = useState<'ventas' | 'anuladas'>('ventas')
    const [voidOpen, setVoidOpen] = useState(false)
    const [printing, setPrinting] = useState(false)

    // Using SWR for caching and consistency
    const { data: sales, isLoading, isValidating, mutate } = useSWR<VentaData[]>(
        storeId ? ['sales', storeId, period, fromDate, toDate, limit] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)
            // seller_name existe desde migration_v10 (modo isla); si falta, se reintenta sin él
            const baseSelect = 'id, created_at, total, discount, payment_method, is_credit, customer_name, sale_items(product_id, quantity, unit_price, unit_cost, products(name, image_url))'
            const run = (select: string) => supabase.from('sales')
                .select(select)
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .gte('created_at', range.from || '1970-01-01')
                .lte('created_at', range.to || '9999-12-31')
                .limit(limit + 1)

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

    const handlePrint = async (saleId: string) => {
        setPrinting(true)
        try {
            printReceipt(await loadReceiptData(supabase, saleId))
        } catch {
            toast.error('No se pudo preparar la tirilla')
        } finally {
            setPrinting(false)
        }
    }

    const totals = useMemo(() => {
        const list = sales || []
        return {
            revenue: Math.round(list.reduce((s, v) => s + v.total, 0)),
            profit: Math.round(list.reduce((s, v) => s + v.sale_items.reduce((a, i) => a + (i.unit_price - i.unit_cost) * i.quantity, 0), 0)),
            count: list.length,
        }
    }, [sales])

    const PERIODS: { value: Period; label: string }[] = [
        { value: 'today', label: 'Hoy' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mes' },
        { value: 'total', label: 'Todo' },
        { value: 'custom', label: 'Rango' },
    ]

    return (
        <div className="px-4 md:px-8 pt-6 pb-8" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5" style={{ position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px 0' }}>Operaciones</p>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Historial de ventas</h1>
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
                        { label: 'Utilidad', value: totals.profit, color: '#10B981' },
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
            ) : sales?.length === 0 ? (
                <EmptyState
                    icon={Clock}
                    title="Sin ventas en este período"
                    description="Cambia el filtro o registra una venta nueva para ver resultados aquí."
                />
            ) : (
                <>
                    <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                        className="flex flex-col gap-2">
                        {sales?.map(sale => {
                            const pm = PAYMENT_METHODS.find(m => m.value === sale.payment_method)
                            const profit = sale.sale_items.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0)
                            const summary = sale.sale_items.slice(0, 2).map(i => (i.products as any)?.name || 'Producto').join(', ')
                            const more = sale.sale_items.length > 2 ? ` +${sale.sale_items.length - 2}` : ''
                            return (
                                <motion.button key={sale.id} variants={staggerItem}
                                    onClick={() => setSelectedSale(sale)}
                                    className="toul-card toul-card-interactive text-left flex items-center gap-3 py-3"
                                    whileTap={{ scale: 0.99 }}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ background: 'var(--toul-accent-dim)' }}>
                                        <span style={{ color: 'var(--toul-accent)', fontSize: 18 }}>💰</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{summary}{more}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                                            {formatDateTime(sale.created_at)} · {pm?.label || sale.payment_method}
                                            {sale.seller_name && sale.seller_name !== 'Administrador' && <span> · {sale.seller_name}</span>}
                                            {sale.is_credit && <span style={{ color: '#00E5A0', fontWeight: 600 }}> · Crédito</span>}
                                            {sale.is_credit && sale.customer_name && <span style={{ color: 'var(--toul-text-muted)' }}> — {sale.customer_name}</span>}
                                            {sale.discount > 0 && <span style={{ color: '#F59E0B' }}> · Dto. {formatCOP(sale.discount)}</span>}
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
                        <button
                            onClick={() => setLimit(l => l + PAGE_SIZE)}
                            disabled={isValidating}
                            className="w-full py-4 mt-4 rounded-2xl border border-dashed font-semibold text-xs transition-colors hover:bg-slate-900/50"
                            style={{ color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)' }}
                        >
                            {isValidating ? 'Cargando más...' : 'Ver más ventas'}
                        </button>
                    )}
                </>
            )}

            {/* Sale detail modal */}
            <AnimatePresence>
                {selectedSale && (
                    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
                        <motion.div className="absolute inset-0" onClick={() => setSelectedSale(null)}
                            variants={backdropVariants} initial="hidden" animate="visible" exit="exit"
                            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
                        <motion.div
                            variants={panelVariants} initial="hidden" animate="visible" exit="exit"
                            className="relative w-full md:w-[440px] rounded-t-3xl md:rounded-3xl shadow-2xl"
                            style={{ background: 'var(--toul-bg)', border: '1px solid var(--toul-border)', maxHeight: '88dvh', overflowY: 'auto' }}>
                            <div className="flex justify-center pt-3 pb-0 md:hidden">
                                <div className="w-10 h-1 rounded-full" style={{ background: 'var(--toul-border)' }} />
                            </div>
                            <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                <div>
                                    <p className="text-xs font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Detalle de venta</p>
                                    <p className="font-bold" style={{ color: 'var(--toul-text)' }}>{formatDateTime(selectedSale.created_at)}</p>
                                </div>
                                <button onClick={() => setSelectedSale(null)} className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            <div className="px-5 py-4 flex flex-col gap-2">
                                {selectedSale.sale_items.map((item, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ background: 'var(--toul-surface)' }}>
                                            {item.products?.image_url ? (
                                                <img src={item.products.image_url} className="w-full h-full object-cover" alt="" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-lg">📦</div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{item.products?.name || 'Producto'}</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{item.quantity} × {formatCOP(item.unit_price)}</p>
                                        </div>
                                        <p className="font-bold text-sm" style={{ color: 'var(--toul-text)' }}>{formatCOP(item.unit_price * item.quantity)}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="px-5 pb-6 flex flex-col gap-2">
                                {selectedSale.discount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Descuento</span>
                                        <span style={{ color: '#F59E0B' }}>−{formatCOP(selectedSale.discount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Método</span>
                                    <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>
                                        {PAYMENT_METHODS.find(m => m.value === selectedSale.payment_method)?.label || selectedSale.payment_method}
                                    </span>
                                </div>
                                <div className="flex justify-between pt-2" style={{ borderTop: '1px solid var(--toul-border)' }}>
                                    <span className="font-bold" style={{ color: 'var(--toul-text)' }}>Total</span>
                                    <span className="text-xl font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(selectedSale.total)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Utilidad estimada</span>
                                    <span className="font-semibold text-sm" style={{ color: 'var(--toul-accent)' }}>
                                        {formatCOP(selectedSale.sale_items.reduce((s, i) => s + (i.unit_price - i.unit_cost) * i.quantity, 0))}
                                    </span>
                                </div>
                                {selectedSale.seller_name && (
                                    <div className="flex justify-between">
                                        <span className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Vendedor</span>
                                        <span className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>{selectedSale.seller_name}</span>
                                    </div>
                                )}
                                <div className="flex gap-2 pt-3">
                                    <button className="toul-btn-secondary" style={{ height: 48, fontSize: 14, color: 'var(--toul-text)' }}
                                        disabled={printing} onClick={() => handlePrint(selectedSale.id)}>
                                        <Printer size={16} /> {printing ? 'Preparando…' : 'Tirilla'}
                                    </button>
                                    <button className="toul-btn-secondary" style={{ height: 48, fontSize: 14, color: 'var(--toul-error)' }}
                                        onClick={() => setVoidOpen(true)}>
                                        <Ban size={16} /> Anular
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
