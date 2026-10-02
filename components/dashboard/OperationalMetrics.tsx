'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Brain, ChevronRight, Sparkles, Wallet, TrendingUp, AlertTriangle, Clock } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PendingPanel, type PendingData } from './PendingPanel'
import { Skeleton } from '@/components/ui/Skeleton'
import { staggerItem } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'
import Link from 'next/link'

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
    insights,
    loading,
    insightsLoading,
    pending,
    storeName
}: {
    products: { topUnits: ProductRow[]; topProfit: ProductRow[]; lowStock: ProductRow[]; slowMoving: ProductRow[] };
    insights: AIInsight[];
    loading: boolean;
    insightsLoading: boolean;
    pending: PendingData;
    storeName?: string | null;
}) {
    return (
        <div className="grid grid-cols-12 gap-6 items-stretch">
            {/* Left — Smart Products Panel */}
            <div className="col-span-12 lg:col-span-6 flex flex-col">
                <SmartProductsPanel products={products} loading={loading} />
            </div>

            {/* Right — TOUL AI Copilot + Pendientes */}
            <div className="col-span-12 lg:col-span-6 flex flex-col">
                <AICopilotPanel insights={insights} loading={insightsLoading || loading} pending={pending} storeName={storeName} />
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

// ── TOUL AI COPILOT PANEL + PLATA PENDIENTE ────────────────────────────────
function AICopilotPanel({ insights, loading, pending, storeName }: {
    insights: AIInsight[]; loading: boolean; pending: PendingData; storeName?: string | null
}) {

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

            {/* ─── Plata pendiente ─── */}
            <div className="flex-1 flex flex-col mt-4">
                <PendingPanel pending={pending} storeName={storeName} />
            </div>

        </motion.div>
    )
}
