'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Package, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Sheet } from '@/components/isla/Sheet'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Ajuste de inventario.
   Dos direcciones en el mismo lugar: lo que se perdió y lo que
   entró sin ser una compra. Siempre sobre la unidad real de
   stock — la talla o la presentación, no la referencia.
   ══════════════════════════════════════════════════════════════ */

type Direction = 'out' | 'in'

const MOTIVOS: Record<Direction, { id: string; label: string }[]> = {
    out: [
        { id: 'damage', label: 'Se dañó' },
        { id: 'loss', label: 'Se perdió' },
        { id: 'theft', label: 'Se lo robaron' },
        { id: 'expired', label: 'Se venció' },
        { id: 'other', label: 'Otro' },
    ],
    in: [
        { id: 'return', label: 'Un cliente lo devolvió' },
        { id: 'found', label: 'Apareció' },
        { id: 'gift', label: 'Regalo del proveedor' },
        { id: 'other', label: 'Otro' },
    ],
}

interface Unit {
    productId: string
    variantId: string | null
    label: string
    sub: string | null
    stock: number
    cost: number
    image: string | null
}

const CSS = PANEL_CSS + `
.sa-seg { position: relative; flex: 1; padding: 9px 10px; border-radius: 11px; border: none; cursor: pointer;
    background: transparent; font-family: inherit; font-size: 13.5px; letter-spacing: -0.01em;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
.sa-unit { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; padding: 9px 11px;
    border-radius: 12px; border: 1px solid transparent; background: transparent; cursor: pointer; font-family: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1); }
@media (hover: hover) and (pointer: fine) { .sa-unit:hover { background: rgba(255,255,255,0.045); } }
.sa-input { width: 100%; height: 48px; border-radius: 13px; padding: 0 14px; font-family: inherit;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text);
    font-size: 16px; outline: none; }
.sa-input:focus { border-color: var(--toul-border-focused); }
`

export function StockAdjustSheet({ open, storeId, onClose, onDone, preselect }: {
    open: boolean
    storeId: string
    onClose: () => void
    onDone: () => void
    /** Para abrirlo ya apuntando a un producto o una presentación */
    preselect?: { productId: string; variantId?: string | null }
}) {
    const [direction, setDirection] = useState<Direction>('out')
    const [query, setQuery] = useState('')
    const [unit, setUnit] = useState<Unit | null>(null)
    const [quantity, setQuantity] = useState('')
    const [reason, setReason] = useState('damage')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    // Cada fila es una unidad de stock real: la presentación si la
    // hay, o el producto si no tiene
    const { data: units } = useSWR(open && storeId ? ['adjust-units', storeId] : null, async () => {
        const [productsRes, variantsRes] = await Promise.all([
            supabase.from('products').select('id, name, reference, stock, cpp, image_url')
                .eq('store_id', storeId).eq('is_active', true).order('name'),
            supabase.from('product_variants').select('id, product_id, name, stock, cpp')
                .eq('store_id', storeId).eq('is_active', true).order('name'),
        ])
        const variants = variantsRes.data ?? []
        const withVariants = new Set(variants.map(v => v.product_id))
        const list: Unit[] = []

        for (const product of productsRes.data ?? []) {
            if (withVariants.has(product.id)) continue
            list.push({
                productId: product.id, variantId: null, label: product.name,
                sub: product.reference ? `Ref. ${product.reference}` : null,
                stock: Number(product.stock) || 0, cost: Number(product.cpp) || 0, image: product.image_url,
            })
        }
        const byProduct = new Map((productsRes.data ?? []).map(p => [p.id, p]))
        for (const variant of variants) {
            const parent = byProduct.get(variant.product_id)
            if (!parent) continue
            list.push({
                productId: variant.product_id, variantId: variant.id,
                label: parent.name, sub: variant.name,
                stock: Number(variant.stock) || 0, cost: Number(variant.cpp) || 0, image: parent.image_url,
            })
        }
        return list.sort((a, b) => a.label.localeCompare(b.label, 'es'))
    }, { revalidateOnFocus: false })

    // Abrir apuntando a algo concreto
    useEffect(() => {
        if (!open || !preselect || !units) return
        const found = units.find(u => u.productId === preselect.productId
            && (u.variantId ?? null) === (preselect.variantId ?? null))
        if (found) setUnit(found)
    }, [open, preselect, units])

    useEffect(() => {
        if (!open) return
        setReason(MOTIVOS[direction][0].id)
    }, [direction, open])

    useEffect(() => {
        if (open) return
        // Al cerrar queda limpio para la próxima
        setDirection('out'); setQuery(''); setUnit(null)
        setQuantity(''); setNotes(''); setSaving(false)
    }, [open])

    const visible = useMemo(() => {
        const text = query.trim().toLowerCase()
        const base = units ?? []
        const list = direction === 'out' ? base.filter(u => u.stock > 0) : base
        if (!text) return list.slice(0, 40)
        return list.filter(u =>
            u.label.toLowerCase().includes(text) || (u.sub ?? '').toLowerCase().includes(text)
        ).slice(0, 40)
    }, [units, query, direction])

    const amount = Math.round(Number(quantity)) || 0
    const excede = direction === 'out' && unit ? amount > unit.stock : false
    const resultado = unit ? (direction === 'out' ? unit.stock - amount : unit.stock + amount) : 0
    const canSave = !!unit && amount > 0 && !excede && !saving

    async function save() {
        if (!unit || !canSave) return
        setSaving(true)
        try {
            const response = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: unit.productId, variantId: unit.variantId,
                    direction, quantity: amount, reason, notes,
                }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'No se pudo ajustar el inventario')

            toast.success(direction === 'out'
                ? `Diste de baja ${amount} de ${unit.sub ? `${unit.label} ${unit.sub}` : unit.label}`
                : `Entraron ${amount} de ${unit.sub ? `${unit.label} ${unit.sub}` : unit.label}`)
            onDone()
            onClose()
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo ajustar el inventario')
            setSaving(false)
        }
    }

    return (
        <Sheet
            open={open}
            onClose={onClose}
            title="Ajustar inventario"
            subtitle={unit ? undefined : 'Para lo que se perdió o lo que entró sin ser una compra'}
            footer={
                <button onClick={save} disabled={!canSave} className="w-full"
                    style={{
                        height: 50, borderRadius: 14, border: 'none', fontFamily: 'inherit',
                        fontSize: 15, fontWeight: 600, cursor: canSave ? 'pointer' : 'default',
                        background: canSave ? 'var(--toul-accent)' : 'rgba(255,255,255,0.06)',
                        color: canSave ? '#000' : 'var(--toul-text-faint)',
                    }}>
                    {saving ? 'Guardando…' : direction === 'out' ? 'Dar de baja' : 'Registrar entrada'}
                </button>
            }>
            <style>{CSS}</style>

            {/* ── Qué pasó ── */}
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 14, background: 'rgba(255,255,255,0.045)', marginBottom: 14 }}>
                {([
                    { key: 'out' as Direction, label: 'Salió del inventario' },
                    { key: 'in' as Direction, label: 'Entró al inventario' },
                ]).map(option => {
                    const active = direction === option.key
                    return (
                        <button key={option.key} className="sa-seg" onClick={() => setDirection(option.key)}
                            style={{
                                background: active ? 'var(--toul-surface-2)' : 'transparent',
                                color: active ? 'var(--toul-text)' : 'var(--toul-text-dim)',
                                fontWeight: active ? 600 : 500,
                            }}>
                            {option.label}
                        </button>
                    )
                })}
            </div>

            {!unit ? (
                <>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                        <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                        <input className="sa-input" style={{ paddingLeft: 38 }} autoFocus
                            placeholder="Buscar producto o talla"
                            value={query} onChange={event => setQuery(event.target.value)} />
                    </div>

                    <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {visible.length === 0 ? (
                            <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '26px 10px', margin: 0 }}>
                                {direction === 'out' ? 'No hay nada con existencias para dar de baja.' : 'No encontramos nada con eso.'}
                            </p>
                        ) : visible.map(item => (
                            <button key={`${item.productId}-${item.variantId ?? 'base'}`} className="sa-unit"
                                onClick={() => setUnit(item)}>
                                <span style={{
                                    width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: 'hidden', position: 'relative',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                }}>
                                    {item.image
                                        ? <img src={item.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <Package size={15} style={{ color: 'var(--toul-text-faint)' }} />}
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.label}
                                    </span>
                                    {item.sub && (
                                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--toul-text-dim)' }}>{item.sub}</span>
                                    )}
                                </span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: item.stock > 0 ? 'var(--toul-text-muted)' : 'var(--toul-error)', flexShrink: 0 }}>
                                    {item.stock}
                                </span>
                            </button>
                        ))}
                    </div>
                </>
            ) : (
                <>
                    {/* ── Qué escogió ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 14, background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', marginBottom: 14 }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)' }}>
                                {unit.label}{unit.sub ? ` · ${unit.sub}` : ''}
                            </span>
                            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--toul-text-dim)' }}>
                                Hay {unit.stock} · costo {formatCOP(unit.cost)}
                            </span>
                        </span>
                        <button className="pnl-pill" onClick={() => { setUnit(null); setQuantity('') }}>Cambiar</button>
                    </div>

                    {/* ── Cuántas ── */}
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--toul-text-muted)', marginBottom: 6 }}>
                        {direction === 'out' ? '¿Cuántas salieron?' : '¿Cuántas entraron?'}
                    </label>
                    <input className="sa-input" type="text" inputMode="numeric" autoFocus
                        placeholder="0" value={quantity}
                        onChange={event => setQuantity(event.target.value.replace(/[^0-9]/g, ''))} />

                    {amount > 0 && (
                        <p style={{ fontSize: 12.5, margin: '7px 2px 0', color: excede ? 'var(--toul-error)' : 'var(--toul-text-dim)' }}>
                            {excede
                                ? `Solo hay ${unit.stock}. No puedes dar de baja ${amount}.`
                                : `Queda en ${resultado} ${resultado === 1 ? 'unidad' : 'unidades'}`}
                        </p>
                    )}

                    {/* ── Por qué ── */}
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--toul-text-muted)', margin: '16px 0 7px' }}>
                        ¿Qué pasó?
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                        {MOTIVOS[direction].map(item => {
                            const active = reason === item.id
                            return (
                                <button key={item.id} onClick={() => setReason(item.id)}
                                    style={{
                                        height: 34, padding: '0 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                                        fontSize: 13, fontWeight: active ? 600 : 500,
                                        background: active ? 'var(--toul-accent-dim)' : 'var(--toul-surface)',
                                        border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                        color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                        transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)',
                                    }}>
                                    {item.label}
                                </button>
                            )
                        })}
                    </div>

                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: 'var(--toul-text-muted)', margin: '16px 0 7px' }}>
                        Nota (opcional)
                    </label>
                    <input className="sa-input" placeholder="Para acordarte después"
                        value={notes} onChange={event => setNotes(event.target.value)} maxLength={120} />
                </>
            )}
        </Sheet>
    )
}
