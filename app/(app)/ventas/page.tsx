'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Clock, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PAYMENT_METHODS } from '@/lib/types'
import { staggerContainer, staggerItem, fadeUp, t, panelVariants, backdropVariants } from '@/lib/motion'
import { Skeleton } from '@/components/ui/Skeleton'
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

    // Using SWR for caching and consistency
    const { data: sales, isLoading, isValidating } = useSWR<VentaData[]>(
        storeId ? ['sales', storeId, period, fromDate, toDate, limit] : null,
        async () => {
            const range = getRange(period, fromDate, toDate)
            const { data, error } = await supabase.from('sales')
                .select('id, created_at, total, discount, payment_method, sale_items(product_id, quantity, unit_price, unit_cost, products(name, image_url))')
                .eq('store_id', storeId)
                .eq('is_credit', false)
                .order('created_at', { ascending: false })
                .gte('created_at', range.from || '1970-01-01')
                .lte('created_at', range.to || '9999-12-31')
                .limit(limit + 1)

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

    const totals = useMemo(() => {
        const list = sales || []
        return {
            revenue: list.reduce((s, v) => s + v.total, 0),
            profit: list.reduce((s, v) => s + v.sale_items.reduce((a, i) => a + (i.unit_price - i.unit_cost) * i.quantity, 0), 0),
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
        <div className="px-4 md:px-8 pt-6 pb-8">
            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-5">
                <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Analytics</p>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Historial de ventas</h1>
            </motion.div>

            {/* Period tabs */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ ...t.base, delay: 0.04 }}
                className="flex gap-1.5 mb-4 flex-wrap">
                {PERIODS.map(p => (
                    <button key={p.value} onClick={() => { setPeriod(p.value); setLimit(PAGE_SIZE) }}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border"
                        style={period === p.value
                            ? { background: 'var(--toul-accent)', color: '#fff', borderColor: 'var(--toul-accent)' }
                            : { color: 'var(--toul-text-muted)', borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                        {p.label}
                    </button>
                ))}
            </motion.div>

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
            {(isLoading || storeLoading) ? (
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
            {(isLoading || storeLoading) ? (
                <div className="flex flex-col gap-2">
                    {[1, 2, 3, 4, 5, 6].map(n => <Skeleton key={n} height="68px" className="rounded-2xl" />)}
                </div>
            ) : sales?.length === 0 ? (
                <div className="toul-card text-center py-12">
                    <Clock size={30} className="mx-auto mb-2" style={{ color: 'var(--toul-border-2)' }} />
                    <p className="font-semibold mb-1" style={{ color: 'var(--toul-text)' }}>Sin ventas en este período</p>
                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Cambia el filtro o registra una venta nueva</p>
                </div>
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
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
