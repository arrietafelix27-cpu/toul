'use client'
import { Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { formatCOP } from '@/lib/utils'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { staggerItem } from '@/lib/motion'

export default function StrategicMetrics({ totalMoney, distribution, loading }: {
    totalMoney: number;
    distribution: { name: string; value: number; color: string }[];
    loading: boolean
}) {
    return (
        <motion.div variants={staggerItem}
            className="toul-card p-5 h-full flex flex-col bg-[var(--toul-surface)] border-[var(--toul-border)]"
        >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
                <Wallet size={13} style={{ color: 'var(--toul-text-subtle)' }} />
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--toul-text-subtle)' }}>Liquidez disponible</h3>
            </div>

            {/* Total Available */}
            <div className="text-center mb-4">
                {loading ? (
                    <Skeleton width="160px" height="32px" className="opacity-10 mx-auto" />
                ) : (
                    <AnimatedNumber value={totalMoney} formatter={formatCOP}
                        className="text-2xl font-black tracking-tighter text-white block" duration={0.5} />
                )}
            </div>

            {/* Donut Chart — balanced, centered */}
            <div className="relative w-full flex items-center justify-center mb-4" style={{ height: 140 }}>
                {loading ? (
                    <div className="w-[120px] h-[120px] rounded-full border-[6px] animate-spin"
                        style={{ borderColor: 'var(--toul-border)', borderTopColor: 'var(--toul-border-2)' }} />
                ) : distribution.length === 0 ? (
                    <div className="flex flex-col items-center justify-center">
                        <Wallet size={20} style={{ color: 'var(--toul-text-subtle)', opacity: 0.3 }} />
                        <p className="text-[10px] mt-2" style={{ color: 'var(--toul-text-subtle)' }}>Sin métodos configurados</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <RePieChart>
                            <Pie
                                data={distribution}
                                innerRadius={48}
                                outerRadius={62}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                                animationDuration={600}
                                startAngle={90}
                                endAngle={450}
                            >
                                {distribution.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.color}
                                        style={{ opacity: 0.75, filter: 'saturate(0.7)' }}
                                    />
                                ))}
                            </Pie>
                        </RePieChart>
                    </ResponsiveContainer>
                )}
                {/* Center icon */}
                {!loading && distribution.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="p-2 rounded-full border" style={{ background: 'var(--toul-bg)', borderColor: 'var(--toul-border)' }}>
                            <Wallet size={14} style={{ color: 'var(--toul-accent)', opacity: 0.4 }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Breakdown */}
            <div className="space-y-2 mt-auto">
                {loading ? (
                    [1, 2, 3].map(i => <Skeleton key={i} height="14px" className="rounded opacity-10" />)
                ) : (
                    distribution.slice(0, 4).map((item, index) => (
                        <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-[10px] font-semibold truncate max-w-[100px]" style={{ color: 'var(--toul-text-muted)' }}>{item.name}</span>
                            </div>
                            <span className="text-[10px] font-bold" style={{ color: 'var(--toul-text)' }}>{formatCOP(item.value)}</span>
                        </div>
                    ))
                )}
            </div>
        </motion.div>
    )
}
