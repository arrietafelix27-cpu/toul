'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from './panelStyles'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   TOUL AI — el punto de vista de un experto sobre el negocio.
   Primero dice cómo va, después qué vio, y cierra con algo que
   se puede hacer hoy. El chat abre con la pregunta ya escrita.
   ══════════════════════════════════════════════════════════════ */

const TONE: Record<string, { color: string; dim: string }> = {
    health: { color: 'var(--toul-accent)', dim: 'var(--toul-accent-dim)' },
    attention: { color: 'var(--toul-warning)', dim: 'var(--toul-warning-dim)' },
    alert: { color: 'var(--toul-error)', dim: 'rgba(239,68,68,0.12)' },
    info: { color: 'var(--toul-text-muted)', dim: 'rgba(255,255,255,0.07)' },
}

const CSS = PANEL_CSS

export function AIAdvisor({ insight, loading }: { insight: AIInsight | null; loading: boolean }) {
    const tone = TONE[insight?.severity ?? 'info'] ?? TONE.info

    return (
        <div className="pnl">
            <style>{CSS}</style>

            {/* ── Encabezado: quién habla y cómo va el negocio ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <span className="pnl-label">TOUL AI</span>
                {!loading && insight?.verdict && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        padding: '4px 10px', borderRadius: 999, background: tone.dim,
                        fontSize: 11.5, fontWeight: 600, color: tone.color, whiteSpace: 'nowrap',
                    }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.color }} />
                        {insight.verdict}
                    </span>
                )}
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <Skeleton width="100%" height="1.1rem" />
                    <Skeleton width="80%" height="1.1rem" />
                    <Skeleton width="60%" height="1.1rem" />
                </div>
            ) : !insight ? (
                <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: 0 }}>
                    No hay nada que reportar por ahora.
                </p>
            ) : (
                <>
                    {/* ── Qué vio ── */}
                    <p style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.4, textWrap: 'balance' }}>
                        {insight.interpretation}
                    </p>
                    {insight.implication && (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: '6px 0 0', lineHeight: 1.5 }}>
                            {insight.implication}
                        </p>
                    )}

                    {/* ── Qué hacer ── */}
                    {insight.suggestion && (
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--toul-divider)' }}>
                            <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--toul-text-faint)', margin: '0 0 6px' }}>
                                Qué hacer
                            </p>
                            <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                                {insight.suggestion}
                            </p>
                            {insight.action && (
                                <div style={{ marginTop: 12 }}>
                                    <Link href={insight.action.href} className="pnl-pill">
                                        {insight.action.label} <ArrowRight size={14} />
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Seguir la conversación ── */}
                    <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                        <Link href={`/toul-ai${insight.question ? `?q=${encodeURIComponent(insight.question)}` : ''}`} className="pnl-link">
                            Preguntar a TOUL AI <ArrowRight size={13} />
                        </Link>
                    </div>
                </>
            )}
        </div>
    )
}
