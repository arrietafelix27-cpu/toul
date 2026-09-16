'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatCOP } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'
import { fadeUp } from '@/lib/motion'
import { Sparkles, ChevronRight, Package, Brain, Wallet, Calendar } from 'lucide-react'
import Link from 'next/link'
import type { AIInsight } from '@/lib/types'
import HeroChart from './HeroChart'

interface MobileDashboardProps {
    storeName: string
    currentDate: string
    storeId: string | null
    period: 'today' | 'week' | 'month' | 'total' | 'custom'
    setPeriod: (p: any) => void
    customRange: { from: string; to: string } | null
    setCustomRange: (r: { from: string; to: string } | null) => void
    metrics: {
        revenue: number
        expenses: number
        netProfit: number
        salesCount: number
        avgTicket: number
    }
    topProduct: { name: string; image_url: string | null; units: number } | null
    insight: AIInsight | null
    strategic: { totalMoney: number; distribution: { name: string; value: number; color: string }[] }
    loading: boolean
    insightsLoading: boolean
}

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'
const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
]

export default function MobileDashboard({
    storeName, currentDate, storeId, period, setPeriod,
    customRange, setCustomRange,
    metrics, topProduct, insight, strategic,
    loading, insightsLoading
}: MobileDashboardProps) {
    const [showCalendar, setShowCalendar] = useState(false)
    const [calFrom, setCalFrom] = useState('')
    const [calTo, setCalTo] = useState('')
    const calRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (calRef.current && !calRef.current.contains(e.target as Node)) {
                setShowCalendar(false)
            }
        }
        if (showCalendar) document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showCalendar])

    function handleApplyCustomRange() {
        if (!calFrom || !calTo) return
        setCustomRange({
            from: new Date(calFrom + 'T00:00:00').toISOString(),
            to: new Date(calTo + 'T23:59:59').toISOString(),
        })
        setPeriod('custom')
        setShowCalendar(false)
    }

    return (
        <div className="px-4 pb-32 pt-5 flex flex-col gap-5" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* 1️⃣ Saludo + controles de periodo */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ position: 'relative' }}>
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)' }}>
                            Hola, {storeName || 'Mi Negocio'}
                        </h1>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)', textTransform: 'capitalize', marginTop: 2 }}>
                            {currentDate}
                        </p>
                    </div>
                </div>

                {/* Period selector row — above chart */}
                <div className="flex items-center gap-2">
                    <div className="flex flex-1 p-0.5 rounded-xl" style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                        {PERIODS.map(p => (
                            <motion.button
                                key={p.value}
                                onClick={() => setPeriod(p.value)}
                                whileTap={{ scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                                className="flex-1 py-1.5 rounded-lg text-center"
                                style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '-0.01em',
                                    border: 'none',
                                    transition: 'background var(--toul-transition), color var(--toul-transition)',
                                    background: period === p.value ? 'var(--toul-accent-dim)' : 'transparent',
                                    color: period === p.value ? 'var(--toul-accent)' : 'var(--toul-text-dim)',
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                }}
                            >
                                {p.label}
                            </motion.button>
                        ))}
                    </div>

                    {/* Calendar */}
                    <div className="relative" ref={calRef}>
                        <motion.button
                            onClick={() => setShowCalendar(v => !v)}
                            whileTap={{ scale: 0.94 }}
                            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                            className="flex items-center justify-center"
                            style={{
                                width: 36, height: 36,
                                borderRadius: 12,
                                background: showCalendar || period === 'custom' ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${showCalendar || period === 'custom' ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                color: period === 'custom' ? 'var(--toul-accent)' : 'var(--toul-text-dim)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                cursor: 'pointer',
                            }}
                        >
                            <Calendar size={15} strokeWidth={2} />
                        </motion.button>

                        <AnimatePresence>
                            {showCalendar && (
                                <motion.div
                                    initial={{ opacity: 0, y: 4, scale: 0.96 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 4, scale: 0.96 }}
                                    transition={{ duration: 0.12 }}
                                    className="absolute right-0 top-full mt-2 z-50 p-4 rounded-2xl shadow-2xl"
                                    style={{
                                        background: 'var(--toul-surface)',
                                        border: '1px solid var(--toul-border)',
                                        minWidth: 240,
                                    }}
                                >
                                    <div className="text-[9px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--toul-text-subtle)' }}>
                                        Rango personalizado
                                    </div>
                                    <div className="space-y-2 mb-3">
                                        <div>
                                            <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Desde</label>
                                            <input type="date" value={calFrom} onChange={e => setCalFrom(e.target.value)}
                                                className="toul-input text-sm w-full" style={{ colorScheme: 'dark' }} />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-medium block mb-1" style={{ color: 'var(--toul-text-muted)' }}>Hasta</label>
                                            <input type="date" value={calTo} onChange={e => setCalTo(e.target.value)}
                                                className="toul-input text-sm w-full" style={{ colorScheme: 'dark' }} />
                                        </div>
                                    </div>
                                    <motion.button
                                        onClick={handleApplyCustomRange}
                                        disabled={!calFrom || !calTo}
                                        whileTap={calFrom && calTo ? { scale: 0.97 } : undefined}
                                        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                                        className="w-full"
                                        style={{
                                            height: 38,
                                            borderRadius: 12,
                                            border: 'none',
                                            background: calFrom && calTo ? 'var(--toul-accent)' : 'rgba(255,255,255,0.07)',
                                            color: calFrom && calTo ? '#000' : 'var(--toul-text-ghost)',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            letterSpacing: '-0.01em',
                                            cursor: calFrom && calTo ? 'pointer' : 'not-allowed',
                                            transition: 'background var(--toul-transition), color var(--toul-transition)',
                                            boxShadow: calFrom && calTo ? '0 4px 16px var(--toul-accent-glow)' : 'none',
                                            fontFamily: 'inherit',
                                        }}>
                                        Aplicar
                                    </motion.button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* 2️⃣ Gráfico protagonista (controls hidden — shown above) */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.04 }}>
                <HeroChart
                    storeId={storeId!}
                    period={period}
                    setPeriod={setPeriod}
                    revenue={metrics.revenue}
                    loading={loading}
                    customRange={customRange}
                    setCustomRange={setCustomRange}
                    mobileHeight={250}
                    hideControls
                />
            </motion.div>

            {/* 3️⃣ Bloque financiero compacto — 2 columns */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.08 }}
                className="grid grid-cols-2 gap-3"
            >
                {/* Gastos */}
                <Link href="/expenses" className="toul-card flex flex-col gap-1 active:scale-[0.98]"
                    style={{ textDecoration: 'none', padding: 16, transition: 'transform 0.15s var(--toul-ease)' }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)' }}>Gastos</span>
                    {loading ? (
                        <Skeleton width="80px" height="1.4rem" className="opacity-10" />
                    ) : (
                        <span style={{
                            fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                            color: 'var(--toul-error)', fontVariantNumeric: 'tabular-nums',
                        }}>
                            {formatCOP(metrics.expenses)}
                        </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--toul-text-faint)', marginTop: 2 }}>
                        Agregar gasto →
                    </span>
                </Link>

                {/* Utilidad */}
                <div className="toul-card flex flex-col gap-1" style={{ padding: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)' }}>Utilidad</span>
                    {loading ? (
                        <Skeleton width="90px" height="1.4rem" className="opacity-10" />
                    ) : (
                        <span style={{
                            fontSize: 20, fontWeight: 700, letterSpacing: '-0.03em',
                            color: 'var(--toul-accent)', fontVariantNumeric: 'tabular-nums',
                        }}>
                            {formatCOP(metrics.netProfit)}
                        </span>
                    )}
                    <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--toul-text-faint)', marginTop: 2 }}>
                        Ventas – Costo – Gastos
                    </span>
                </div>
            </motion.div>

            {/* 4️⃣ Producto estrella del día */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.12 }}>
                {loading ? (
                    <Skeleton height="56px" className="rounded-2xl opacity-10" />
                ) : topProduct ? (
                    <div className="toul-card flex items-center gap-3" style={{ padding: '12px 16px' }}>
                        <div className="rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                            style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--toul-border)' }}>
                            {topProduct.image_url
                                ? <img src={topProduct.image_url} className="w-full h-full object-cover rounded-full" alt={topProduct.name} />
                                : <Package size={16} color="rgba(255,255,255,0.4)" />
                            }
                        </div>
                        <div className="flex-1 min-w-0">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topProduct.name}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)', fontVariantNumeric: 'tabular-nums' }}>{topProduct.units} vendidos hoy</p>
                        </div>
                        <span style={{
                            fontSize: 10, fontWeight: 600, letterSpacing: '-0.01em',
                            padding: '4px 9px', borderRadius: 8, flexShrink: 0,
                            background: 'var(--toul-warning-dim)',
                            color: 'var(--toul-warning)',
                            border: '1px solid rgba(255,214,10,0.2)',
                        }}>
                            Top hoy
                        </span>
                    </div>
                ) : (
                    <div className="toul-card flex items-center gap-3" style={{ padding: '12px 16px' }}>
                        <Package size={16} color="rgba(255,255,255,0.4)" />
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)' }}>Sin ventas hoy</p>
                    </div>
                )}
            </motion.div>

            {/* 5️⃣ Insight TOUL AI */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.16 }}>
                {(insightsLoading || loading) ? (
                    <div className="toul-card p-5 flex flex-col gap-3">
                        <Skeleton width="100px" height="12px" className="opacity-10" />
                        <Skeleton width="100%" height="16px" className="opacity-10" />
                        <Skeleton width="80%" height="14px" className="opacity-10" />
                        <Skeleton width="100%" height="40px" className="rounded-xl opacity-10 mt-2" />
                    </div>
                ) : insight ? (
                    <div className="toul-card flex flex-col gap-3" style={{ padding: 18 }}>
                        <div className="flex items-center gap-2">
                            <div className="rounded-full animate-pulse"
                                style={{ width: 6, height: 6, background: 'var(--toul-accent)', boxShadow: '0 0 8px var(--toul-accent-glow)' }} />
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)' }}>TOUL AI</span>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <span style={{ fontSize: 18 }}>{insight.icon}</span>
                            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--toul-text)', lineHeight: 1.45, letterSpacing: '-0.01em', flex: 1 }}>
                                {insight.interpretation}
                            </p>
                        </div>
                        <Link href="/toul-ai"
                            className="flex items-center justify-center gap-2 active:scale-[0.98]"
                            style={{
                                height: 50,
                                borderRadius: 14,
                                color: '#000',
                                fontSize: 15,
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                background: 'var(--toul-accent)',
                                boxShadow: '0 4px 24px var(--toul-accent-glow)',
                                textDecoration: 'none',
                                transition: 'transform 0.15s var(--toul-ease)',
                            }}>
                            <Sparkles size={16} strokeWidth={2.4} />
                            Habla con TOUL IA
                        </Link>
                    </div>
                ) : (
                    <div className="toul-card flex flex-col items-center gap-3 text-center" style={{ padding: 18 }}>
                        <Brain size={24} color="rgba(255,255,255,0.25)" />
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--toul-text-dim)' }}>
                            Analizando tus movimientos...
                        </p>
                        <Link href="/toul-ai"
                            className="flex items-center justify-center gap-2 w-full active:scale-[0.98]"
                            style={{
                                height: 50,
                                borderRadius: 14,
                                color: '#000',
                                fontSize: 15,
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                background: 'var(--toul-accent)',
                                boxShadow: '0 4px 24px var(--toul-accent-glow)',
                                textDecoration: 'none',
                                transition: 'transform 0.15s var(--toul-ease)',
                            }}>
                            <Sparkles size={16} strokeWidth={2.4} />
                            Habla con TOUL IA
                        </Link>
                    </div>
                )}
            </motion.div>

            {/* 6️⃣ Caja disponible simplificada */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }} style={{ position: 'relative' }}>
                <div className="toul-card flex flex-col gap-3" style={{ padding: 18 }}>
                    <div className="flex items-center gap-2">
                        <Wallet size={13} color="rgba(255,255,255,0.45)" />
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)' }}>Liquidez disponible</span>
                    </div>

                    {loading ? (
                        <Skeleton width="140px" height="2rem" className="opacity-10" />
                    ) : (
                        <span style={{
                            fontSize: 28,
                            fontWeight: 700,
                            letterSpacing: '-0.03em',
                            color: 'var(--toul-text)',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {formatCOP(strategic.totalMoney)}
                        </span>
                    )}

                    {/* Method chips */}
                    {!loading && strategic.distribution.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                            {strategic.distribution.slice(0, 4).map((item, i) => (
                                <div key={i} className="flex items-center gap-1.5"
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: 10,
                                        background: `${item.color}12`,
                                        border: `1px solid ${item.color}20`,
                                    }}>
                                    <div className="rounded-full" style={{ width: 6, height: 6, backgroundColor: item.color }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: item.color }}>
                                        {item.name}
                                    </span>
                                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)', fontVariantNumeric: 'tabular-nums' }}>
                                        {formatCOP(item.value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    )
}
