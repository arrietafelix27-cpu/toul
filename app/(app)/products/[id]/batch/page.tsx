'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { calculateCPP, formatCOP } from '@/lib/utils'

export default function BatchPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const supabase = createClient()
    const [quantity, setQuantity] = useState('')
    const [unitCost, setUnitCost] = useState('')
    const [supplier, setSupplier] = useState('')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (!quantity || Number(quantity) <= 0) { toast.error('Ingresa la cantidad'); return }
        if (!unitCost || Number(unitCost) < 0) { toast.error('Ingresa el costo unitario'); return }
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) return
        const { data: product } = await supabase.from('products').select('stock, cpp').eq('id', id).single()
        if (!product) { toast.error('Producto no encontrado'); setLoading(false); return }

        const qty = Number(quantity), cost = Number(unitCost)
        const newCpp = calculateCPP(product.stock, product.cpp, qty, cost)
        const newStock = product.stock + qty

        const { error: batchErr } = await supabase.from('inventory_batches').insert({
            store_id: store.id, product_id: id, quantity: qty, unit_cost: cost,
            supplier: supplier || null, notes: notes || null,
        })
        if (batchErr) { toast.error('Error al registrar el lote'); setLoading(false); return }

        // Update CPP only — stock handled via inventory_adjustments + trigger
        await supabase.from('products').update({ cpp: newCpp, updated_at: new Date().toISOString() }).eq('id', id)
        const { error: adjErr } = await supabase.from('inventory_adjustments').insert({
            store_id: store.id, product_id: id, quantity: qty,
            reason: 'batch_entry', notes: notes || supplier || null,
        })
        if (adjErr) { toast.error('Error al actualizar el inventario'); setLoading(false); return }
        toast.success(`¡Lote registrado! Nuevo stock: ${newStock} unidades`)
        router.push(`/inventory/${id}`)
    }

    const totalCost = Number(quantity) * Number(unitCost)

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 fade-in" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            <div className="flex items-center gap-3 mb-6" style={{ position: 'relative' }}>
                <Link href={`/inventory/${id}`}
                    className="flex items-center justify-center transition-all active:scale-90"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </Link>
                <h1 style={{
                    fontSize: 17, fontWeight: 600,
                    color: 'var(--toul-text)', letterSpacing: '-0.02em', margin: 0,
                }}>
                    Entrada de inventario
                </h1>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Cantidad *</label>
                        <input className="toul-input" type="number" min={1} placeholder="0" value={quantity} onChange={e => setQuantity(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Costo unitario *</label>
                        <input className="toul-input" type="number" min={0} placeholder="0" value={unitCost} onChange={e => setUnitCost(e.target.value)} required />
                    </div>
                </div>

                {quantity && unitCost && (
                    <div className="toul-card">
                        <p className="text-xs mb-1" style={{ color: 'var(--toul-text-muted)' }}>Total de la compra</p>
                        <p className="text-xl font-bold" style={{ color: 'var(--toul-accent)' }}>{formatCOP(totalCost)}</p>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Proveedor (opcional)</label>
                    <input className="toul-input" type="text" placeholder="Nombre del proveedor" value={supplier} onChange={e => setSupplier(e.target.value)} />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Notas (opcional)</label>
                    <textarea className="toul-input resize-none" rows={2} placeholder="Notas adicionales..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                <button type="submit" className="toul-btn-primary mt-2" disabled={loading}>
                    {loading ? 'Registrando...' : 'Registrar entrada'}
                </button>
            </form>
        </div>
    )
}
