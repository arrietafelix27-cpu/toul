'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { PendingPanel, type PendingData } from './PendingPanel'
import { type FinancialSummaryMetrics } from './FinancialSummary'
import { ResumenHoy } from './ResumenHoy'
import { AccionesRapidas, ObservacionAI } from './AccionesRapidas'
import { PANEL_CSS } from './panelStyles'
import { fadeUp } from '@/lib/motion'
import { Calendar } from 'lucide-react'
import { Thumb } from '@/components/ui/Thumb'
import type { AIInsight } from '@/lib/types'
import HeroChart from './HeroChart'

type Period = 'today' | 'week' | 'month' | 'total' | 'custom'

interface MobileDashboardProps {
    storeName: string
    currentDate: string
    storeId: string | null
    period: Period
    setPeriod: (p: Period) => void
    customRange: { from: string; to: string } | null
    setCustomRange: (r: { from: string; to: string } | null) => void
    metrics: FinancialSummaryMetrics
    periodLabel: string
    topProduct: { name: string; image_url: string | null; units: number } | null
    pending: PendingData
    insight: AIInsight | null
    loading: boolean
    insightsLoading: boolean
}

const PERIODS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Semana' },
    { value: 'month', label: 'Mes' },
]

export default function MobileDashboard({
    storeName, currentDate, storeId, period, setPeriod,
    customRange, setCustomRange,
    metrics, topProduct, pending, insight,
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
            <style>{PANEL_CSS + `
                .md-sep { height: 1px; margin: 4px 0 18px; background: var(--toul-divider); border: none;
                    -webkit-mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent);
                    mask-image: linear-gradient(to right, transparent, #000 8%, #000 92%, transparent); }
            `}</style>
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

            {/* 3️⃣ Lo vendido en el periodo, con su ganancia y sus gastos */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.08 }}>
                <ResumenHoy metrics={metrics} loading={loading} period={period} customRange={customRange} />
            </motion.div>

            {/* Acciones rápidas, cerca del pulgar, y TOUL AI en una línea */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <AccionesRapidas variante="movil" />
                <ObservacionAI insight={insight} loading={insightsLoading || loading} />
            </motion.div>

            {/* 4️⃣ Lo que más salió (la línea solo va si hay algo debajo: sin
                producto destacado quedaban dos líneas seguidas) */}
            {!loading && topProduct && <hr className="md-sep" />}
            {!loading && topProduct && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.12 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Thumb src={topProduct.image_url} name={topProduct.name} size={38} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topProduct.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                            {topProduct.units} {topProduct.units === 1 ? 'vendido' : 'vendidos'} · lo que más salió
                        </span>
                    </span>
                </motion.div>
            )}

            {/* 5️⃣ Plata pendiente */}
            {!loading && (pending.customerDebts.length > 0 || pending.providerDebts.length > 0) && (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.14 }}>
                    <hr className="md-sep" />
                    <PendingPanel pending={pending} storeName={storeName} compact />
                </motion.div>
            )}

        </div>
    )
}
