'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
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

const CSS = `
.ai-card { position: relative; height: 100%; display: flex; flex-direction: column;
    padding: 18px 20px; border-radius: 18px;
    background: var(--toul-surface); border: 1px solid var(--toul-border); }

.ai-action { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
    height: 34px; padding: 0 14px; border-radius: 11px; text-decoration: none; white-space: nowrap;
    max-width: 100%; overflow: hidden;
    border: 1px solid var(--toul-border-2, rgba(255,255,255,0.14)); background: rgba(255,255,255,0.07);
    color: var(--toul-text); font-size: 13px; font-weight: 600; letter-spacing: -0.01em;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.ai-action:active { transform: scale(0.97); }

.ai-chat { display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
    font-size: 12.5px; font-weight: 500; color: var(--toul-text-dim);
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }

@media (hover: hover) and (pointer: fine) {
    .ai-action:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }
    .ai-chat:hover { color: var(--toul-accent); }
}
@media (prefers-reduced-motion: reduce) { .ai-action:active { transform: none; } }
`

export function AIAdvisor({ insight, loading }: { insight: AIInsight | null; loading: boolean }) {
    const tone = TONE[insight?.severity ?? 'info'] ?? TONE.info

    return (
        <div className="ai-card">
            <style>{CSS}</style>

            {/* ── Encabezado: quién habla y cómo va el negocio ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--toul-text-faint)' }}>
                    <Sparkles size={13} style={{ color: 'var(--toul-accent)' }} /> TOUL AI
                </span>
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
                                    <Link href={insight.action.href} className="ai-action">
                                        {insight.action.label} <ArrowRight size={14} />
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Seguir la conversación ── */}
                    <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                        <Link href={`/toul-ai${insight.question ? `?q=${encodeURIComponent(insight.question)}` : ''}`} className="ai-chat">
                            Preguntar a TOUL AI <ArrowRight size={13} />
                        </Link>
                    </div>
                </>
            )}
        </div>
    )
}
