'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Brain, ChevronRight, Sparkles, Wallet, TrendingUp, AlertTriangle, Clock } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { staggerItem } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'
import Link from 'next/link'
import StrategicMetrics from './StrategicMetrics'

interface ProductRow {
    id: string
    name: string
    image_url: string | null
    value: number
    subValue: string
    units: number
}

// ── SEGMENTED TABS ──────────────────────────────────────────────────────────
type ProductTab = 'units' | 'profit' | 'low' | 'slow'
const PRODUCT_TABS: { value: ProductTab; label: string; icon: any }[] = [
    { value: 'units', label: 'Más vendidos', icon: TrendingUp },
    { value: 'profit', label: 'Más rentables', icon: TrendingUp },
    { value: 'low', label: 'Stock bajo', icon: AlertTriangle },
    { value: 'slow', label: 'Sin rotación', icon: Clock },
]

export default function OperationalMetrics({
    products,
    strategic,
    insights,
    loading,
    insightsLoading,
    pending
}: {
    products: { topUnits: ProductRow[]; topProfit: ProductRow[]; lowStock: ProductRow[]; slowMoving: ProductRow[] };
    strategic: { totalMoney: number; distribution: any[] };
    insights: AIInsight[];
    loading: boolean;
    insightsLoading: boolean;
    pending: {
        customerDebts: { id: string; name: string; amount: number; createdAt: string; isOverdue: boolean }[];
        providerDebts: { id: string; name: string; amount: number; dueDate: string | null; isOverdue: boolean }[];
    };
}) {
    return (
        <div className="grid grid-cols-12 gap-6 items-stretch">
            {/* Left — Smart Products Panel */}
            <div className="col-span-12 lg:col-span-4 flex flex-col">
                <SmartProductsPanel products={products} loading={loading} />
            </div>

            {/* Center — TOUL AI Copilot + Pendientes */}
            <div className="col-span-12 lg:col-span-4 flex flex-col">
                <AICopilotPanel insights={insights} loading={insightsLoading || loading} pending={pending} />
            </div>

            {/* Right — Cash & Liquidity */}
            <div className="col-span-12 lg:col-span-4 flex flex-col">
                <StrategicMetrics
                    totalMoney={strategic.totalMoney}
                    distribution={strategic.distribution}
                    loading={loading}
                />
            </div>
        </div>
    )
}

// ── SMART PRODUCTS PANEL ────────────────────────────────────────────────────
function SmartProductsPanel({ products, loading }: {
    products: { topUnits: ProductRow[]; topProfit: ProductRow[]; lowStock: ProductRow[]; slowMoving: ProductRow[] };
    loading: boolean;
}) {
    const [tab, setTab] = useState<ProductTab>('units')

    const tabDataMap: Record<ProductTab, ProductRow[]> = {
        units: products.topUnits,
        profit: products.topProfit,
        low: products.lowStock,
        slow: products.slowMoving,
    }

    const currentData = tabDataMap[tab].slice(0, 5)

    const getMetricDisplay = (item: ProductRow, index: number): { value: string; badge?: string; badgeColor?: string } => {
        switch (tab) {
            case 'units':
                return {
                    value: `${item.units}u`,
                    badge: index === 0 ? 'Top ventas' : undefined,
                    badgeColor: 'rgba(234, 179, 8, 0.15)',
                }
            case 'profit':
                return {
                    value: formatCOP(item.value),
                    badge: index === 0 ? 'Más rentable' : undefined,
                    badgeColor: 'rgba(74, 222, 128, 0.12)',
                }
            case 'low':
                return {
                    value: `${item.value} uds`,
                    badge: item.value <= 2 ? 'Crítico' : undefined,
                    badgeColor: 'rgba(239, 68, 68, 0.15)',
                }
            case 'slow':
                return {
                    value: `${item.value}d`,
                    badge: item.value > 30 ? 'Sin movimiento' : undefined,
                    badgeColor: 'rgba(245, 158, 11, 0.12)',
                }
        }
    }

    return (
        <motion.div variants={staggerItem}
            className="toul-card p-5 h-full flex flex-col"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Package size={13} style={{ color: 'var(--toul-text-subtle)' }} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--toul-text-subtle)' }}>Productos inteligentes</h3>
            </div>

            {/* Segmented Control */}
            <div className="flex gap-0.5 p-0.5 rounded-xl mb-4" style={{ background: 'var(--toul-bg)' }}>
                {PRODUCT_TABS.map(t => {
                    const hasAlert = t.value === 'low' && products.lowStock.length > 0
                    return (
                        <button key={t.value} onClick={() => setTab(t.value)}
                            className="flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider text-center flex items-center justify-center gap-1"
                            style={{
                                transition: 'var(--toul-transition)',
                                ...(tab === t.value
                                    ? {
                                        background: 'var(--toul-surface-2)',
                                        color: hasAlert ? 'var(--toul-error, #ef4444)' : 'var(--toul-text)',
                                        ...(hasAlert ? { borderBottom: '1.5px solid var(--toul-error, #ef4444)' } : {})
                                    }
                                    : {
                                        color: hasAlert ? 'var(--toul-error, #ef4444)' : 'var(--toul-text-subtle)',
                                    })
                            }}>
                            {hasAlert && (
                                <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: 'var(--toul-error, #ef4444)' }} />
                            )}
                            {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Product List */}
            <div className="flex-1 space-y-1.5">
                <AnimatePresence mode="wait">
                    <motion.div key={tab}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="space-y-1.5"
                    >
                        {loading ? (
                            [1, 2, 3, 4, 5].map(i => <Skeleton key={i} height="48px" className="rounded-xl opacity-10" />)
                        ) : currentData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <Package size={24} style={{ color: 'var(--toul-text-subtle)', opacity: 0.3 }} />
                                <p className="text-[11px] mt-2" style={{ color: 'var(--toul-text-subtle)' }}>Sin datos para esta categoría</p>
                            </div>
                        ) : (
                            currentData.map((p, i) => {
                                const metric = getMetricDisplay(p, i)
                                return (
                                    <div key={p.id}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                                        style={{
                                            background: i === 0 ? 'var(--toul-surface-2)' : 'transparent',
                                            borderColor: i === 0 ? 'rgba(234, 179, 8, 0.08)' : 'var(--toul-border)',
                                            boxShadow: i === 0 ? '0 0 20px -8px rgba(234, 179, 8, 0.08)' : 'none',
                                            transition: 'var(--toul-transition)',
                                        }}
                                    >
                                        {/* Thumbnail */}
                                        <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border"
                                            style={{ background: 'var(--toul-bg)', borderColor: 'var(--toul-border)' }}>
                                            {p.image_url
                                                ? <img src={p.image_url} className="w-full h-full object-cover" alt={p.name} />
                                                : <Package size={11} style={{ color: 'var(--toul-text-subtle)' }} />
                                            }
                                        </div>

                                        {/* Name + badge */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-semibold truncate text-white">{p.name}</p>
                                            {metric.badge && (
                                                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md inline-block mt-0.5"
                                                    style={{ background: metric.badgeColor, color: 'var(--toul-text-muted)' }}>
                                                    {metric.badge}
                                                </span>
                                            )}
                                        </div>

                                        {/* Metric */}
                                        <p className="text-[12px] font-black tracking-tight text-white flex-shrink-0">
                                            {metric.value}
                                        </p>
                                    </div>
                                )
                            })
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    )
}

// ── TOUL AI COPILOT PANEL + PENDIENTES ─────────────────────────────────────
type PendingData = {
    customerDebts: { id: string; name: string; amount: number; createdAt: string; isOverdue: boolean }[];
    providerDebts: { id: string; name: string; amount: number; dueDate: string | null; isOverdue: boolean }[];
}

function AICopilotPanel({ insights, loading, pending }: { insights: AIInsight[]; loading: boolean; pending: PendingData }) {
    const [pendingTab, setPendingTab] = useState<'cobrar' | 'pagar'>('cobrar')

    const totalCobrar = pending.customerDebts.reduce((s, c) => s + c.amount, 0)
    const totalPagar = pending.providerDebts.reduce((s, p) => s + p.amount, 0)
    const currentList = pendingTab === 'cobrar' ? pending.customerDebts : pending.providerDebts
    const accentColor = pendingTab === 'cobrar' ? 'var(--toul-error, #ef4444)' : '#F59E0B'

    if (loading) return (
        <div className="toul-card p-5 h-full flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Skeleton width="8px" height="8px" className="rounded-full opacity-20" />
                <Skeleton width="120px" height="12px" className="opacity-10" />
            </div>
            <Skeleton width="100%" height="20px" className="opacity-10" />
            <Skeleton width="85%" height="16px" className="opacity-10" />
            <Skeleton width="100%" height="36px" className="rounded-xl opacity-10 mt-auto" />
        </div>
    )

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="toul-card p-5 h-full flex flex-col"
        >
            {/* ─── AI Section (compressed) ─── */}
            {insights.length === 0 ? (
                <div className="flex items-center gap-3 py-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center border flex-shrink-0"
                        style={{ background: 'var(--toul-bg)', borderColor: 'var(--toul-border)' }}>
                        <Brain size={14} style={{ color: 'var(--toul-text-subtle)' }} />
                    </div>
                    <p className="text-[10px] font-medium leading-relaxed" style={{ color: 'var(--toul-text-subtle)' }}>
                        Analizando datos para generar lectura estratégica...
                    </p>
                </div>
            ) : (
                <>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: 'var(--toul-accent)', boxShadow: '0 0 8px var(--toul-accent-glow)' }} />
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--toul-text-subtle)' }}>
                            TOUL AI · Copiloto
                        </h3>
                    </div>

                    {/* Primary Insight — compact */}
                    <div className="flex items-start gap-2.5 mb-2">
                        <span className="text-base mt-0.5 flex-shrink-0">{insights[0].icon}</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-white leading-snug mb-0.5">
                                {insights[0].interpretation}
                            </p>
                            <p className="text-[10px] font-medium leading-relaxed" style={{ color: 'var(--toul-text-subtle)' }}>
                                {insights[0].implication}
                            </p>
                        </div>
                    </div>

                    {/* Suggestion — compact */}
                    {insights[0].suggestion && (
                        <div className="px-2.5 py-2 rounded-lg mb-2" style={{ background: 'var(--toul-bg)', border: '1px solid var(--toul-border)' }}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <div className="w-1 h-1 rounded-full" style={{ background: 'var(--toul-accent)' }} />
                                <span className="text-[8px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--toul-text-subtle)' }}>Recomendación</span>
                            </div>
                            <p className="text-[9px] font-medium leading-snug pl-2.5" style={{ color: 'var(--toul-text-muted)', borderLeft: '1px solid var(--toul-border)' }}>
                                {insights[0].suggestion}
                            </p>
                        </div>
                    )}

                    {/* CTA */}
                    <Link href="/toul-ai"
                        className="flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider mb-3"
                        style={{
                            color: 'var(--toul-accent)',
                            background: 'var(--toul-accent-dim)',
                            border: '1px solid var(--toul-accent-glow)',
                            transition: 'var(--toul-transition)',
                            textDecoration: 'none',
                        }}>
                        <Sparkles size={11} />
                        Habla con TOUL AI
                        <ChevronRight size={10} />
                    </Link>
                </>
            )}

            {/* ─── Divider ─── */}
            <div style={{ height: '0.5px', background: 'var(--toul-border)', margin: '0 -20px', width: 'calc(100% + 40px)' }} />

            {/* ─── Pendientes Section ─── */}
            <div className="flex-1 flex flex-col mt-3">
                {/* Header + Toggle */}
                <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--toul-text-subtle)' }}>Pendientes</span>
                    <div className="flex p-0.5 rounded-md" style={{ background: 'var(--toul-bg)' }}>
                        <button
                            onClick={() => setPendingTab('cobrar')}
                            className="px-2.5 py-1 rounded text-[9px] font-bold"
                            style={{
                                transition: 'var(--toul-transition)',
                                ...(pendingTab === 'cobrar'
                                    ? { background: 'var(--toul-surface-2)', color: 'var(--toul-accent)' }
                                    : { color: 'var(--toul-text-subtle)' })
                            }}>
                            Por cobrar
                        </button>
                        <button
                            onClick={() => setPendingTab('pagar')}
                            className="px-2.5 py-1 rounded text-[9px] font-bold"
                            style={{
                                transition: 'var(--toul-transition)',
                                ...(pendingTab === 'pagar'
                                    ? { background: 'var(--toul-surface-2)', color: 'var(--toul-accent)' }
                                    : { color: 'var(--toul-text-subtle)' })
                            }}>
                            Por pagar
                        </button>
                    </div>
                </div>

                {/* Total */}
                <div className="mb-2">
                    <div className="text-lg font-black tracking-tighter" style={{ color: accentColor }}>
                        {formatCOP(pendingTab === 'cobrar' ? totalCobrar : totalPagar)}
                    </div>
                    <div className="text-[10px] font-medium" style={{ color: 'var(--toul-text-subtle)' }}>
                        {pendingTab === 'cobrar'
                            ? `${pending.customerDebts.length} cliente${pending.customerDebts.length !== 1 ? 's' : ''}`
                            : `${pending.providerDebts.length} proveedor${pending.providerDebts.length !== 1 ? 'es' : ''}`
                        }
                    </div>
                </div>

                {/* List */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={pendingTab}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="flex-1"
                    >
                        {currentList.length === 0 ? (
                            <div className="flex items-center justify-center py-6">
                                <span className="text-[11px] font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Todo al día ✨</span>
                            </div>
                        ) : (
                            currentList.slice(0, 3).map((item, i) => {
                                const initials = item.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                                const daysDiff = 'createdAt' in item
                                    ? Math.floor((Date.now() - new Date((item as any).createdAt).getTime()) / 86400000)
                                    : null
                                const dueDate = 'dueDate' in item ? (item as any).dueDate : null
                                const isOverdue = dueDate ? new Date(dueDate) < new Date() : false

                                return (
                                    <div key={item.id}>
                                        <div className="flex items-center gap-2.5 py-2">
                                            {/* Avatar */}
                                            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold"
                                                style={{
                                                    background: pendingTab === 'cobrar' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                                    color: pendingTab === 'cobrar' ? '#A855F7' : '#F59E0B',
                                                }}>
                                                {initials}
                                            </div>

                                            {/* Name + badge */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-semibold text-white truncate">{item.name}</p>
                                                {isOverdue && (
                                                    <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded"
                                                        style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444' }}>
                                                        Vencido
                                                    </span>
                                                )}
                                            </div>

                                            {/* Amount + date */}
                                            <div className="text-right flex-shrink-0">
                                                <p className="text-[11px] font-bold" style={{ color: accentColor }}>
                                                    {formatCOP(item.amount)}
                                                </p>
                                                <p className="text-[9px]" style={{ color: 'var(--toul-text-subtle)' }}>
                                                    {dueDate
                                                        ? (isOverdue ? 'Venc. ' : '') + new Date(dueDate).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
                                                        : daysDiff !== null ? `hace ${daysDiff}d` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        {i < Math.min(currentList.length, 3) - 1 && (
                                            <div style={{ height: '0.5px', background: 'var(--toul-border)' }} />
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    )
}
