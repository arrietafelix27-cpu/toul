'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { explainError } from '@/lib/errors'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Agregar y quitar presentaciones de un producto que ya existe.
   Antes solo se podían crear al nacer el producto: si se te
   acababa la XL y querías meter XXL, no había cómo.
   ══════════════════════════════════════════════════════════════ */

interface VariantRow {
    id: string
    name: string
    stock: number
    cpp: number
    sale_price?: number
}

const CSS = PANEL_CSS + `
.vm-input { height: 42px; border-radius: 12px; padding: 0 12px; font-family: inherit;
    background: var(--toul-surface-2); border: 1px solid var(--toul-border); color: var(--toul-text);
    font-size: 15px; outline: none; min-width: 0; }
.vm-input:focus { border-color: var(--toul-border-focused); }
`

export function VariantManager({ productId, storeId, variants, onChange }: {
    productId: string
    storeId: string
    variants: VariantRow[]
    onChange: () => void
}) {
    const [adding, setAdding] = useState(false)
    const [name, setName] = useState('')
    const [price, setPrice] = useState('')
    const [saving, setSaving] = useState(false)
    const [toRemove, setToRemove] = useState<VariantRow | null>(null)

    if (variants.length === 0) return null

    async function add() {
        const clean = name.trim()
        const value = Number(price)
        if (!clean) { toast.error('Ponle nombre, por ejemplo "XL" o "100 ml"'); return }
        if (variants.some(v => v.name.toLowerCase() === clean.toLowerCase())) {
            toast.error(`Ya tienes una presentación "${clean}"`); return
        }
        if (!value || value <= 0) { toast.error('Ponle el precio de venta'); return }

        setSaving(true)
        const { error } = await supabase.from('product_variants').insert({
            store_id: storeId, product_id: productId,
            name: clean, sale_price: value, cost_price: 0, cpp: 0,
        })
        setSaving(false)
        if (error) { toast.error(explainError(error, 'No se pudo agregar la presentación.')); return }

        setName(''); setPrice(''); setAdding(false)
        onChange()
        toast.success(`${clean} agregada. Su costo se llena con la primera compra.`)
    }

    async function remove(variant: VariantRow) {
        // No se borra: se desactiva, para no perder el historial de
        // ventas y movimientos que ya tiene encima
        const { error } = await supabase.from('product_variants')
            .update({ is_active: false }).eq('id', variant.id)
        setToRemove(null)
        if (error) { toast.error(explainError(error)); return }
        onChange()
        toast.success(`${variant.name} ya no se vende`)
    }

    return (
        <section style={{ marginTop: 20 }}>
            <style>{CSS}</style>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <p className="pnl-label" style={{ margin: 0 }}>Presentaciones</p>
                {!adding && (
                    <button className="pnl-pill" onClick={() => setAdding(true)}>
                        <Plus size={13} strokeWidth={2.6} /> Agregar
                    </button>
                )}
            </div>

            <AnimatePresence>
                {adding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                            <input className="vm-input" style={{ flex: '1 1 120px' }} autoFocus
                                placeholder='Nombre (ej. "XL")' value={name} maxLength={40} autoCapitalize="characters"
                                onChange={event => setName(event.target.value)} />
                            <input className="vm-input" style={{ flex: '1 1 110px' }} type="text" inputMode="numeric"
                                placeholder="Precio de venta" value={price}
                                onChange={event => setPrice(event.target.value.replace(/[^0-9]/g, ''))} />
                            <button className="pnl-pill" onClick={add} disabled={saving}>
                                <Check size={14} /> {saving ? 'Guardando…' : 'Agregar'}
                            </button>
                            <button className="pnl-pill" onClick={() => { setAdding(false); setName(''); setPrice('') }}>
                                <X size={14} />
                            </button>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '0 0 10px 2px' }}>
                            Entra sin existencias. El costo se llena solo con la primera compra.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {variants.map(variant => (
                    <div key={variant.id} className="pnl-row" style={{ cursor: 'default' }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>{variant.name}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-text-dim)' }}>
                                {variant.stock} en bodega · costo {formatCOP(Number(variant.cpp) || 0)}
                            </span>
                        </span>
                        <button className="pnl-pill" onClick={() => setToRemove(variant)}
                            aria-label={`Dejar de vender ${variant.name}`} style={{ padding: '0 10px' }}>
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>

            <ConfirmSheet
                open={!!toRemove}
                onClose={() => setToRemove(null)}
                onConfirm={() => toRemove && remove(toRemove)}
                title={`¿Dejar de vender ${toRemove?.name ?? ''}?`}
                message={
                    (toRemove?.stock ?? 0) > 0
                        ? `Todavía tienes ${toRemove?.stock} en bodega. Desaparece del catálogo y de la caja, pero su historial de ventas se conserva.`
                        : 'Desaparece del catálogo y de la caja. Su historial de ventas se conserva.'
                }
                confirmLabel="Dejar de vender" danger
            />
        </section>
    )
}
