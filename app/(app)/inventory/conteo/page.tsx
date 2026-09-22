'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, ClipboardList, Plus, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { EASE_OUT_EMIL } from '@/components/ui'

const supabase = createClient()

interface CountRow {
    id: string
    status: 'open' | 'applied' | 'cancelled'
    started_by_name: string | null
    started_at: string
    applied_at: string | null
    counted_items: number
    diff_units: number
    diff_value: number
    notes: string | null
}

const fmt = (iso: string) => new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ConteosPage() {
    const router = useRouter()
    const { data: ctx } = useSessionContext()
    const [creating, setCreating] = useState(false)

    const { data: counts, isLoading } = useSWR(ctx ? ['conteos', ctx.storeId] : null, async () => {
        const { data } = await supabase.from('inventory_counts').select('*')
            .eq('store_id', ctx!.storeId).order('started_at', { ascending: false }).limit(30)
        return (data ?? []) as CountRow[]
    })

    async function startCount() {
        if (!ctx) return
        const open = counts?.find(c => c.status === 'open')
        if (open) { router.push(`/inventory/conteo/${open.id}`); return }

        setCreating(true)
        const { data, error } = await supabase.from('inventory_counts')
            .insert({ store_id: ctx.storeId, started_by: ctx.userId, started_by_name: ctx.displayName })
            .select('id').single()
        setCreating(false)
        if (error || !data) { toast.error('No se pudo iniciar el conteo'); return }
        router.push(`/inventory/conteo/${data.id}`)
    }

    const openCount = counts?.find(c => c.status === 'open')

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <Link href="/inventory" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} strokeWidth={2} color="rgba(255,255,255,0.7)" />
                </Link>
                <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Inventario</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Conteos</h1>
                </div>
            </div>

            <div className="toul-card mb-5" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--toul-accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClipboardList size={20} style={{ color: 'var(--toul-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        {openCount ? 'Tienes un conteo sin terminar' : 'Cuenta tu inventario físico'}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
                        {openCount
                            ? `Empezado ${fmt(openCount.started_at)}`
                            : 'Anota cuántos tienes de cada producto. TOUL te muestra faltantes y sobrantes y ajusta el inventario.'}
                    </p>
                </div>
                <button onClick={startCount} disabled={creating}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit', boxShadow: '0 4px 20px var(--toul-accent-glow)' }}>
                    {openCount ? 'Continuar' : <><Plus size={16} /> Nuevo</>}
                </button>
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 16 }} />)}</div>
            ) : (counts?.length ?? 0) === 0 ? (
                <div className="toul-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Todavía no has hecho conteos</p>
                    <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '4px 0 0' }}>
                        Hacerlo cada mes es la forma de detectar pérdidas a tiempo.
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {counts!.map((count, idx) => {
                        const diff = Math.round(Number(count.diff_value))
                        return (
                            <motion.div key={count.id}
                                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, ease: EASE_OUT_EMIL, delay: Math.min(idx, 8) * 0.025 }}>
                                <Link href={`/inventory/conteo/${count.id}`} className="toul-card toul-card-interactive"
                                    style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none' }}>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)' }}>
                                            {count.status === 'open' ? 'En curso' : count.status === 'cancelled' ? 'Cancelado' : `${count.counted_items} productos contados`}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                            {fmt(count.started_at)} · {count.started_by_name ?? ''}
                                        </span>
                                    </span>
                                    {count.status === 'applied' && (
                                        <span style={{ fontSize: 15, fontWeight: 700, color: diff === 0 ? 'var(--toul-accent)' : diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                            {diff === 0 ? 'Cuadró' : `${diff < 0 ? '−' : '+'}${formatCOP(Math.abs(diff))}`}
                                        </span>
                                    )}
                                    <ChevronRight size={16} style={{ color: 'var(--toul-text-dim)', flexShrink: 0 }} />
                                </Link>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
