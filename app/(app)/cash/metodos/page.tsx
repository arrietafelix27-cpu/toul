'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { PaymentMethodConfig } from '@/lib/types'
import { EASE_OUT_EMIL } from '@/components/ui'
import { Sheet } from '@/components/isla/Sheet'

const COLORS = ['#32d74b', '#0a84ff', '#bf5af2', '#ffd60a', '#ff9f0a', '#ff453a', '#64d2ff', '#ffffff']

/** Métodos de pago: con qué te pagan los clientes. Sin saldos. */
export default function MetodosPagoPage() {
    const [adding, setAdding] = useState(false)
    const [name, setName] = useState('')
    const [color, setColor] = useState(COLORS[0])
    const [saving, setSaving] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')

    const { data: methods, isLoading, mutate } = useSWR<PaymentMethodConfig[]>('payment-methods', async () => {
        const res = await fetch('/api/payment-methods')
        const data = await res.json()
        return data.methods ?? []
    }, { revalidateOnFocus: false })

    async function create() {
        if (!name.trim()) return
        setSaving(true)
        const res = await fetch('/api/payment-methods', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), color }),
        })
        setSaving(false)
        if (!res.ok) { toast.error('No se pudo crear'); return }
        toast.success(`"${name.trim()}" agregado`)
        setName(''); setColor(COLORS[0]); setAdding(false)
        mutate()
    }

    async function rename(id: string) {
        if (!editingName.trim()) return
        const res = await fetch('/api/payment-methods', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name: editingName.trim() }),
        })
        if (!res.ok) { toast.error('No se pudo guardar'); return }
        setEditingId(null)
        toast.success('Nombre actualizado')
        mutate()
    }

    async function remove(method: PaymentMethodConfig) {
        if (!confirm(`¿Quitar "${method.name}"? Las ventas que ya se cobraron con él no se modifican.`)) return
        const res = await fetch('/api/payment-methods', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: method.id }),
        })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error || 'No se pudo quitar'); return }
        toast.success(`"${method.name}" quitado`)
        mutate()
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <Link href="/cash" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Caja</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Métodos de pago</h1>
                </div>
                <button onClick={() => setAdding(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: 42, padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px var(--toul-accent-glow)' }}>
                    <Plus size={16} strokeWidth={2.6} /> Nuevo
                </button>
            </div>

            <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', lineHeight: 1.5, margin: '0 4px 16px' }}>
                Son las formas en que te pagan. Aparecen en la caja al cobrar una venta.
            </p>

            {isLoading ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 16 }} />)}</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(methods ?? []).map((method, idx) => (
                        <motion.div key={method.id}
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.22, ease: EASE_OUT_EMIL, delay: Math.min(idx, 8) * 0.03 }}
                            className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{
                                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                background: `${method.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <span style={{ width: 12, height: 12, borderRadius: '50%', background: method.color }} />
                            </span>

                            {editingId === method.id ? (
                                <input className="toul-input" value={editingName} autoFocus
                                    onChange={e => setEditingName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') rename(method.id); if (e.key === 'Escape') setEditingId(null) }}
                                    style={{ flex: 1, height: 44 }} />
                            ) : (
                                <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: 'var(--toul-text)' }}>
                                    {method.name}
                                </span>
                            )}

                            {editingId === method.id ? (
                                <>
                                    <button onClick={() => rename(method.id)} aria-label="Guardar" style={iconBtn('var(--toul-accent)')}><Check size={17} /></button>
                                    <button onClick={() => setEditingId(null)} aria-label="Cancelar" style={iconBtn('var(--toul-text-muted)')}><X size={17} /></button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => { setEditingId(method.id); setEditingName(method.name) }} aria-label={`Renombrar ${method.name}`} style={iconBtn('var(--toul-text-muted)')}><Pencil size={16} /></button>
                                    <button onClick={() => remove(method)} aria-label={`Quitar ${method.name}`} style={iconBtn('var(--toul-error)')}><Trash2 size={16} /></button>
                                </>
                            )}
                        </motion.div>
                    ))}
                </div>
            )}

            <Sheet open={adding} onClose={() => !saving && setAdding(false)}
                title="Nuevo método de pago" subtitle="Por ejemplo: Datáfono, Addi, Transferencia."
                footer={<button className="toul-btn-primary" onClick={create} disabled={saving || !name.trim()}>{saving ? 'Guardando…' : 'Agregar'}</button>}>
                <input className="toul-input" placeholder="Nombre" value={name} autoFocus maxLength={24}
                    onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create() }} />
                <p className="toul-section-label" style={{ margin: '16px 0 8px 2px' }}>Color</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {COLORS.map(c => (
                        <button key={c} onClick={() => setColor(c)} aria-label={`Color ${c}`}
                            style={{
                                width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                                background: `${c}20`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `2px solid ${color === c ? c : 'transparent'}`,
                            }}>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', background: c }} />
                        </button>
                    ))}
                </div>
            </Sheet>
        </div>
    )
}

const iconBtn = (color: string): React.CSSProperties => ({
    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
    border: '1px solid var(--toul-border)', background: 'transparent', color,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
})
