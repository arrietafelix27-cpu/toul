'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, Package, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { Sheet } from '@/components/isla/Sheet'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { explainError } from '@/lib/errors'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Últimas compras.
   Sirve para ver qué entró y, sobre todo, para arreglar el
   proveedor cuando se escogió mal. Si la compra quedó a crédito,
   la deuda se muda sola al proveedor correcto.
   ══════════════════════════════════════════════════════════════ */

interface PurchaseRow {
    id: string
    created_at: string
    total: number
    is_credit: boolean
    provider_id: string | null
    providers: { name: string } | null
    purchase_items: { id: string }[]
}

const CSS = PANEL_CSS + `
.cp-opt { display: flex; align-items: center; gap: 11px; width: 100%; text-align: left; padding: 11px 13px;
    border-radius: 13px; border: 1px solid var(--toul-border); background: var(--toul-surface);
    cursor: pointer; font-family: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1); }
@media (hover: hover) and (pointer: fine) { .cp-opt:hover { background: var(--toul-surface-2); } }
`

const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })

export default function ComprasPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null
    const [editing, setEditing] = useState<PurchaseRow | null>(null)
    const [saving, setSaving] = useState(false)

    const { data, isLoading, mutate } = useSWR(
        storeId ? ['compras', storeId] : null,
        async () => {
            const [purchasesRes, providersRes] = await Promise.all([
                supabase.from('purchases')
                    .select('id, created_at, total, is_credit, provider_id, providers(name), purchase_items(id)')
                    .eq('store_id', storeId!).order('created_at', { ascending: false }).limit(60),
                supabase.from('providers').select('id, name').eq('store_id', storeId!).order('name'),
            ])
            return {
                purchases: (purchasesRes.data ?? []) as unknown as PurchaseRow[],
                providers: providersRes.data ?? [],
            }
        },
        { revalidateOnFocus: false },
    )

    async function cambiarProveedor(purchaseId: string, providerId: string | null) {
        setSaving(true)
        const { error } = await supabase.rpc('toul_change_purchase_provider', {
            p_purchase_id: purchaseId,
            p_provider_id: providerId,
        })
        setSaving(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar el proveedor.')); return }
        setEditing(null)
        await mutate()
        toast.success('Proveedor actualizado')
    }

    return (
        <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <Link href="/inventory" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div>
                    <p className="pnl-label" style={{ marginBottom: 2 }}>Inventario</p>
                    <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                        Últimas compras
                    </h1>
                </div>
            </div>

            {isLoading || !data ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height="64px" className="rounded-2xl" />)}
                </div>
            ) : data.purchases.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '40px 16px', margin: 0 }}>
                    Todavía no has registrado ninguna compra.
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {data.purchases.map(purchase => {
                        const items = purchase.purchase_items?.length ?? 0
                        return (
                            <button key={purchase.id} onClick={() => setEditing(purchase)} className="pnl-row"
                                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'inherit', textAlign: 'left' }}>
                                <span style={{
                                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.055)',
                                }}>
                                    <Package size={16} style={{ color: 'var(--toul-text-faint)' }} />
                                </span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: purchase.providers ? 'var(--toul-text)' : 'var(--toul-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {purchase.providers?.name ?? 'Sin proveedor'}
                                    </span>
                                    <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)' }}>
                                        {fecha(purchase.created_at)} · {items} {items === 1 ? 'producto' : 'productos'}
                                        {purchase.is_credit && <span style={{ color: 'var(--toul-warning)' }}> · a crédito</span>}
                                    </span>
                                </span>
                                <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--toul-text)', flexShrink: 0 }}>
                                    {formatCOP(Number(purchase.total))}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            <Sheet
                open={!!editing}
                onClose={() => setEditing(null)}
                title="¿De quién fue esta compra?"
                subtitle={editing ? `${fecha(editing.created_at)} · ${formatCOP(Number(editing.total))}` : undefined}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {!editing?.is_credit && (
                        <button className="cp-opt" disabled={saving}
                            onClick={() => editing && cambiarProveedor(editing.id, null)}>
                            <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500, color: 'var(--toul-text-dim)' }}>
                                Sin proveedor
                            </span>
                            {editing?.provider_id === null && <Check size={16} style={{ color: 'var(--toul-accent)' }} />}
                        </button>
                    )}

                    {(data?.providers ?? []).map(provider => {
                        const current = editing?.provider_id === provider.id
                        return (
                            <button key={provider.id} className="cp-opt" disabled={saving}
                                onClick={() => editing && !current && cambiarProveedor(editing.id, provider.id)}
                                style={{
                                    background: current ? 'var(--toul-surface-focused)' : undefined,
                                    borderColor: current ? 'var(--toul-border-focused)' : undefined,
                                }}>
                                <Truck size={16} style={{ color: current ? 'var(--toul-accent)' : 'var(--toul-text-faint)', flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: current ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                                    {provider.name}
                                </span>
                                {current && <Check size={16} style={{ color: 'var(--toul-accent)' }} />}
                            </button>
                        )
                    })}

                    {(data?.providers ?? []).length === 0 && (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '18px 10px', margin: 0 }}>
                            Todavía no tienes proveedores. <Link href="/providers" style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>Crea uno</Link>.
                        </p>
                    )}

                    {editing?.is_credit && (
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                            Esta compra quedó a crédito: al cambiar el proveedor, lo que falta por pagar se le pasa al nuevo.
                        </p>
                    )}
                </div>
            </Sheet>
        </div>
    )
}
