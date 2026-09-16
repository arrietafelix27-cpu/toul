'use client'

import { formatCOP } from '@/lib/utils'
import type { CashSessionSummary } from '@/lib/isla/types'

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: 'ok' | 'error' | 'warn' | 'muted'; strong?: boolean }) {
    const color = tone === 'ok' ? 'var(--toul-accent)' : tone === 'error' ? 'var(--toul-error)' : tone === 'warn' ? 'var(--toul-warning)' : tone === 'muted' ? 'var(--toul-text-muted)' : 'var(--toul-text)'
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--toul-divider)' }}>
            <span style={{ fontSize: 14, color: 'var(--toul-text-muted)' }}>{label}</span>
            <span style={{ fontSize: strong ? 18 : 15, fontWeight: strong ? 700 : 600, color, letterSpacing: '-0.02em' }}>{value}</span>
        </div>
    )
}

/** Resultado de un turno: diferencia de efectivo, pagos por método y novedades. */
export function CashSummary({ summary }: { summary: CashSessionSummary }) {
    const hasCount = typeof summary.difference === 'number'
    const diff = Math.round(summary.difference ?? 0)

    return (
        <div>
            {hasCount && (
                <div style={{
                    borderRadius: 18, padding: '18px 20px', marginBottom: 16, textAlign: 'center',
                    background: diff === 0 ? 'var(--toul-accent-dim)' : diff < 0 ? 'var(--toul-error-dim)' : 'var(--toul-warning-dim)',
                    border: `1px solid ${diff === 0 ? 'var(--toul-border-focused)' : 'transparent'}`,
                }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-muted)', margin: 0 }}>
                        {diff === 0 ? 'La caja cuadra' : diff < 0 ? 'Faltante en efectivo' : 'Sobrante en efectivo'}
                    </p>
                    <p style={{
                        fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', margin: '2px 0 0',
                        color: diff === 0 ? 'var(--toul-accent)' : diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)',
                    }}>
                        {diff === 0 ? formatCOP(0) : `${diff < 0 ? '−' : '+'}${formatCOP(Math.abs(diff))}`}
                    </p>
                </div>
            )}

            <p className="toul-section-label" style={{ margin: '4px 0 0' }}>Efectivo</p>
            <Row label="Base del turno" value={formatCOP(summary.openingCash)} />
            <Row label="Debería haber" value={formatCOP(summary.expectedCash)} strong={!hasCount} />
            {hasCount && <Row label="Contado" value={formatCOP(summary.countedCash ?? 0)} strong />}

            <p className="toul-section-label" style={{ margin: '18px 0 0' }}>Por método de pago</p>
            {summary.byMethod.length === 0
                ? <Row label="Sin movimientos" value="—" tone="muted" />
                : summary.byMethod.map(m => (
                    <Row key={m.method} label={m.isCash ? `${m.method} (movimientos)` : m.method} value={formatCOP(m.net)} />
                ))}

            <p className="toul-section-label" style={{ margin: '18px 0 0' }}>Ventas del turno</p>
            <Row label={`${summary.salesCount} ${summary.salesCount === 1 ? 'venta' : 'ventas'}`} value={formatCOP(summary.salesTotal)} strong />
            {summary.discountCount > 0 && <Row label={`Con descuento (${summary.discountCount})`} value={`−${formatCOP(summary.discountTotal)}`} tone="warn" />}
            {summary.creditCount > 0 && <Row label="A crédito" value={String(summary.creditCount)} />}
            {summary.voidCount > 0 && <Row label={`Anuladas (${summary.voidCount})`} value={formatCOP(summary.voidTotal)} tone="error" />}
        </div>
    )
}
