import type { AIInsight } from '@/lib/types'

// Extended color/icon/label maps for all new insight types
const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    ventas_comparativa: { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Tendencia de ventas' },
    ticket_promedio: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Ticket promedio' },
    producto_estrella: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Producto estrella' },
    producto_mayor_margen: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)', label: 'Mejor margen' },
    capital_atrapado: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Capital atrapado' },
    producto_sin_rotacion: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Sin rotación' },
    stock_bajo: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Stock bajo' },
    sin_stock: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Sin stock' },
    mejor_dia: { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Mejor día' },
    mejor_hora: { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Mejor hora' },
    metodo_pago: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Método favorito' },
    gasto_alto: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Gasto destacado' },
    alerta_margen: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Alerta de margen' },
    promocionar: { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Oportunidad' },
    reponer: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Reponer ya' },
    liquidar: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Liquidar' },
    tendencia_gastos: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Tendencia gastos' },
    // Legacy types
    star_product: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Producto estrella' },
    low_rotation: { color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', label: 'Baja rotación' },
    low_stock: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', label: 'Stock bajo' },
    trapped_capital: { color: '#A855F7', bg: 'rgba(168,85,247,0.08)', label: 'Capital atrapado' },
    best_day: { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: 'Mejor día' },
    sales_goal: { color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', label: 'Meta ventas' },
}

const URGENCY_BORDER: Record<string, string> = {
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6',
}

export default function AIInsightCard({ insight }: { insight: AIInsight }) {
    const config = TYPE_CONFIG[insight.type] || { color: '#10B981', bg: 'rgba(16,185,129,0.08)', label: insight.type }
    const urgencyColor = URGENCY_BORDER[(insight as any).urgency || 'info'] || config.color
    const icon = insight.icon || '💡'

    return (
        <div className="rounded-2xl overflow-hidden transition-all"
            style={{
                background: 'var(--toul-surface)',
                border: `1px solid ${urgencyColor}25`,
            }}>
            {/* Colored top accent bar */}
            <div className="h-0.5 w-full" style={{ background: urgencyColor }} />

            {/* Header row */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                <span className="text-xl leading-none">{icon}</span>
                <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: urgencyColor }}>
                        {config.label}
                    </span>
                    <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>
                        {insight.title}
                    </p>
                </div>
            </div>

            {/* Body */}
            <div className="px-4 pb-4">
                <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--toul-text-muted)' }}>
                    {insight.explanation}
                </p>

                {/* Suggestion pill */}
                <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
                    style={{ background: config.bg, borderLeft: `3px solid ${urgencyColor}` }}>
                    <span className="text-sm mt-0.5">↗</span>
                    <p className="text-xs font-medium leading-relaxed" style={{ color: urgencyColor }}>
                        {insight.suggestion}
                    </p>
                </div>
            </div>
        </div>
    )
}
