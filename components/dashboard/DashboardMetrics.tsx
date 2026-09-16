'use client'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatCOP, getHealthStatus } from '@/lib/utils'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { staggerItem } from '@/lib/motion'

interface MetricProps {
    label: string
    value: number
    prevValue: number
    loading: boolean
    isPercentage?: boolean
}

export default function DashboardMetrics({ expenses, balance, netProfit, netMargin, prevExpenses, prevBalance, prevNetProfit, prevNetMargin, loading }: {
    expenses: number; balance: number; netProfit: number; netMargin: number;
    prevExpenses: number; prevBalance: number; prevNetProfit: number; prevNetMargin: number;
    loading: boolean
}) {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <MetricCard label="Gastos" value={expenses} prevValue={prevExpenses} loading={loading} invert />
            <MetricCard label="Balance" value={balance} prevValue={prevBalance} loading={loading} />
            <MetricCard label="Ganancia Real" value={netProfit} prevValue={prevNetProfit} loading={loading} />
            <MetricCard label="Margen Neto (%)" value={netMargin} prevValue={prevNetMargin} loading={loading} isPercentage />
        </div>
    )
}

// ── FINANCIAL SUMMARY PANEL (Right panel in Row 1) ──────────────────────────
// Cohesive narrative stack: Activity → Cost → Result
// IMPORTANT: Skeleton renders <div>, so never place it inside <p> tags
DashboardMetrics.MiniStrip = function MiniStrip({ metrics, loading }: { metrics: any, loading: boolean }) {
    return (
        <div className="toul-card p-5 h-full flex flex-col bg-[var(--toul-surface)] border-[var(--toul-border)]">
            {/* Label */}
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] mb-4" style={{ color: 'var(--toul-text-subtle)' }}>
                Resumen financiero
            </div>

            {/* 1. Registered Sales — Activity */}
            <div className="flex-1 flex flex-col justify-center pb-4 mb-4" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--toul-text-subtle)' }}>Ventas registradas</span>
                    <TrendingUp size={11} style={{ color: 'var(--toul-accent)', opacity: 0.3 }} />
                </div>
                {loading ? (
                    <Skeleton width="80px" height="1.25rem" className="opacity-10 mb-0.5" />
                ) : (
                    <div className="text-xl font-black tracking-tighter text-white mb-0.5">
                        {metrics.salesCount}
                        <span className="text-[10px] font-bold ml-1.5 uppercase tracking-wide" style={{ color: 'var(--toul-text-subtle)' }}>operaciones</span>
                    </div>
                )}
                {!loading && (
                    <div className="text-[10px] font-medium" style={{ color: 'var(--toul-text-subtle)' }}>
                        Ticket promedio: <span style={{ color: 'var(--toul-text-muted)' }}>{formatCOP(metrics.avgTicket)}</span>
                    </div>
                )}
            </div>

            {/* 2. Expenses — Cost */}
            <div className="flex-1 flex flex-col justify-center pb-4 mb-4" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Gastos del periodo</div>
                {loading ? (
                    <Skeleton width="100px" height="1.1rem" className="opacity-10" />
                ) : (
                    <div className="text-lg font-black tracking-tighter" style={{ color: '#f87171' }}>
                        {formatCOP(metrics.expenses)}
                    </div>
                )}
            </div>

            {/* 3. Net Profit — Result (visually most important) */}
            <div className="flex-1 flex flex-col justify-center">
                <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Ganancia neta</div>
                {loading ? (
                    <Skeleton width="120px" height="1.25rem" className="opacity-10" />
                ) : (
                    <div className="text-xl font-black tracking-tighter" style={{ color: 'var(--toul-accent)' }}>
                        {formatCOP(metrics.netProfit)}
                    </div>
                )}
                <div className="text-[9px] font-medium mt-0.5" style={{ color: 'var(--toul-text-subtle)', opacity: 0.6 }}>Ingresos – Costo productos – Gastos</div>
            </div>
        </div>
    )
}

function MetricCard({ label, value, prevValue, loading, invert = false, isPercentage = false }: MetricProps & { invert?: boolean }) {
    const variation = prevValue === 0 ? 0 : ((value - prevValue) / Math.abs(prevValue)) * 100
    const health = getHealthStatus(invert ? -variation : variation)

    const colors = {
        healthy: 'text-emerald-500',
        neutral: 'text-zinc-500',
        alert: 'text-rose-500'
    }

    const TrendIcon = variation > 2 ? TrendingUp : variation < -2 ? TrendingDown : Minus

    return (
        <motion.div variants={staggerItem}
            className="toul-card p-3.5 flex flex-col justify-between bg-[var(--toul-surface)] border-[var(--toul-border)]"
            style={{ height: 80 }}>
            <div className="flex items-center justify-between">
                <span className="text-[8px] uppercase tracking-widest font-black opacity-30" style={{ color: 'var(--toul-text-muted)' }}>{label}</span>
                {!loading && (
                    <div className={`flex items-center gap-0.5 ${colors[health]}`}>
                        <TrendIcon size={8} strokeWidth={3} />
                        <span className="text-[8px] font-black">{Math.abs(variation).toFixed(1)}%</span>
                    </div>
                )}
            </div>

            <div className="flex items-baseline mt-1 overflow-hidden">
                {loading ? (
                    <Skeleton height="1.25rem" width="100%" className="rounded" />
                ) : (
                    <AnimatedNumber
                        value={value}
                        formatter={isPercentage ? (v) => `${v.toFixed(1)}%` : formatCOP}
                        className="text-xl font-black tracking-tighter truncate text-white"
                    />
                )}
            </div>
        </motion.div>
    )
}
