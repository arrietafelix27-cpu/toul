'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { ArrowLeft, Check, Bug } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Qué se ha roto.

   No es para que el usuario arregle nada: es para que cuando diga
   "se me cerró la app" haya algo concreto que mirar, en vez de
   adivinar. Los errores iguales se agrupan y dicen cuántas veces
   pasaron, que es lo que distingue un tropiezo de un problema.
   ══════════════════════════════════════════════════════════════ */

interface Falla {
    id: string
    mensaje: string
    url: string | null
    cuando: string
    veces: number
}

const cuando = (iso: string) => {
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (dias === 0) return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
    if (dias === 1) return 'ayer'
    return `hace ${dias} días`
}

export default function ErroresPage() {
    const { data, isLoading } = useSWR('app-errores', async () => {
        const { data, error } = await supabase.rpc('toul_recent_errors', { p_limit: 50 })
        if (error) throw error
        return data as { total: number; errores: Falla[] }
    }, { revalidateOnFocus: false })

    const fallas = data?.errores ?? []

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <style>{PANEL_CSS}</style>
            <div className="toul-ambient" />
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <div className="flex items-center gap-3 mb-5">
                    <Link href="/settings" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <div>
                        <p className="pnl-label" style={{ marginBottom: 2 }}>Sistema</p>
                        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                            Fallas de la app
                        </h1>
                    </div>
                </div>

                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 16px', lineHeight: 1.5 }}>
                    Lo que se ha roto en los últimos 30 días. Si ves algo aquí, mándaselo a quien
                    te ayuda con la app: con esto se arregla mucho más rápido.
                </p>

                {isLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[1, 2, 3].map(i => <Skeleton key={i} height="58px" className="rounded-2xl" />)}
                    </div>
                ) : fallas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                        <Check size={30} style={{ color: 'var(--toul-accent)', margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            Nada se ha roto
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                            La app no ha fallado en los últimos 30 días.
                        </p>
                    </div>
                ) : (
                    <>
                        <p className="pnl-label" style={{ marginBottom: 8 }}>
                            {fallas.length} {fallas.length === 1 ? 'falla distinta' : 'fallas distintas'} · {data?.total} en total
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {fallas.map(f => (
                                <div key={f.id} className="pnl-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                                    <span style={{
                                        width: 30, height: 30, borderRadius: 10, flexShrink: 0, marginTop: 2,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(239,68,68,0.1)',
                                    }}>
                                        <Bug size={14} style={{ color: 'var(--toul-error)' }} />
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: 'var(--toul-text)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                                            {f.mensaje}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)', marginTop: 2 }}>
                                            {f.url ?? 'sin pantalla'} · {cuando(f.cuando)}
                                        </span>
                                    </span>
                                    {Number(f.veces) > 1 && (
                                        <span style={{
                                            flexShrink: 0, height: 22, padding: '0 8px', borderRadius: 7,
                                            display: 'inline-flex', alignItems: 'center',
                                            fontSize: 11.5, fontWeight: 700,
                                            background: 'rgba(255,255,255,0.06)', color: 'var(--toul-text-muted)',
                                        }}>
                                            {f.veces}×
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
