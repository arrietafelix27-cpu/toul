'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowLeft, Search, Eye, EyeOff, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { useSessionContext } from '@/lib/isla/useSession'
import { Sheet } from '@/components/isla/Sheet'
import { EASE_OUT_EMIL } from '@/components/ui'

const supabase = createClient()

interface Row {
    key: string
    productId: string
    variantId: string | null
    name: string
    reference: string | null
    expected: number
    cost: number
}

interface CountState {
    id: string
    status: 'open' | 'applied' | 'cancelled'
    started_at: string
    started_by_name: string | null
    applied_at: string | null
    counted_items: number
    diff_units: number
    diff_value: number
    notes: string | null
}

interface AppliedItem {
    product_id: string
    variant_id: string | null
    counted_qty: number
    expected_qty: number | null
    difference: number | null
    unit_cost: number | null
}

export default function ConteoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const { data: ctx } = useSessionContext()

    const [count, setCount] = useState<CountState | null>(null)
    const [rows, setRows] = useState<Row[]>([])
    const [counted, setCounted] = useState<Record<string, string>>({})
    const [applied, setApplied] = useState<AppliedItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [showExpected, setShowExpected] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    // Los guardados de un mismo producto van en fila, uno detrás de otro:
    // si se escribe rápido, no se pisan ni se duplican renglones
    const saveChains = useRef<Record<string, Promise<void>>>({})
    const itemIdsRef = useRef<Record<string, string>>({})

    // ─── Cargar conteo, catálogo y lo ya contado ──────────────
    useEffect(() => {
        if (!ctx) return
        let cancelled = false

        async function load() {
            const [countRes, productsRes, variantsRes, adjRes, itemsRes] = await Promise.all([
                supabase.from('inventory_counts').select('*').eq('id', id).single(),
                supabase.from('products').select('id, name, reference, stock, cpp').eq('store_id', ctx!.storeId).eq('is_active', true).order('name'),
                supabase.from('product_variants').select('id, product_id, name, cpp').eq('store_id', ctx!.storeId).eq('is_active', true),
                supabase.from('inventory_adjustments').select('variant_id, quantity').eq('store_id', ctx!.storeId).not('variant_id', 'is', null),
                supabase.from('inventory_count_items').select('*').eq('count_id', id),
            ])
            if (cancelled) return

            const stockByVariant: Record<string, number> = {}
            for (const adj of adjRes.data ?? []) {
                if (adj.variant_id) stockByVariant[adj.variant_id] = (stockByVariant[adj.variant_id] ?? 0) + Number(adj.quantity)
            }

            const variantsByProduct: Record<string, { id: string; name: string; cpp: number }[]> = {}
            for (const v of variantsRes.data ?? []) {
                (variantsByProduct[v.product_id] ??= []).push(v)
            }

            const built: Row[] = []
            for (const p of productsRes.data ?? []) {
                const variants = variantsByProduct[p.id]
                if (variants?.length) {
                    for (const v of variants) {
                        built.push({
                            key: `${p.id}:${v.id}`, productId: p.id, variantId: v.id,
                            name: `${p.name} · ${v.name}`, reference: p.reference,
                            expected: Math.max(0, stockByVariant[v.id] ?? 0), cost: Number(v.cpp) || 0,
                        })
                    }
                } else {
                    built.push({
                        key: p.id, productId: p.id, variantId: null, name: p.name, reference: p.reference,
                        expected: Number(p.stock) || 0, cost: Number(p.cpp) || 0,
                    })
                }
            }

            const values: Record<string, string> = {}
            const ids: Record<string, string> = {}
            for (const item of itemsRes.data ?? []) {
                const key = item.variant_id ? `${item.product_id}:${item.variant_id}` : item.product_id
                values[key] = String(Math.round(Number(item.counted_qty)))
                ids[key] = item.id
            }

            itemIdsRef.current = ids
            setCount(countRes.data as CountState)
            setApplied((itemsRes.data ?? []) as AppliedItem[])
            setRows(built)
            setCounted(values)
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [ctx, id])

    // ─── Guardar cada renglón mientras se cuenta ──────────────
    const saveRow = useCallback(async (row: Row, value: string) => {
        if (!ctx) return
        const qty = Number(value)
        if (value === '' || Number.isNaN(qty) || qty < 0) return
        const counted_qty = Math.round(qty)

        const existingId = itemIdsRef.current[row.key]
        if (existingId) {
            const { error } = await supabase.from('inventory_count_items').update({ counted_qty }).eq('id', existingId)
            if (error) toast.error('No se pudo guardar ese conteo')
            return
        }

        const { data, error } = await supabase.from('inventory_count_items').insert({
            count_id: id, store_id: ctx.storeId, product_id: row.productId,
            variant_id: row.variantId, counted_qty,
        }).select('id').single()

        if (data) {
            itemIdsRef.current[row.key] = data.id
            return
        }

        // El renglón ya existía (doble guardado): se actualiza en vez de duplicar
        if (error) {
            let query = supabase.from('inventory_count_items').update({ counted_qty })
                .eq('count_id', id).eq('product_id', row.productId)
            query = row.variantId ? query.eq('variant_id', row.variantId) : query.is('variant_id', null)
            const { error: updateError } = await query
            if (updateError) toast.error('No se pudo guardar ese conteo')
        }
    }, [ctx, id])

    const handleChange = (row: Row, value: string) => {
        const clean = value.replace(/[^0-9]/g, '')
        setCounted(prev => ({ ...prev, [row.key]: clean }))
        clearTimeout(timers.current[row.key])
        timers.current[row.key] = setTimeout(() => {
            saveChains.current[row.key] = (saveChains.current[row.key] ?? Promise.resolve())
                .then(() => saveRow(row, clean))
                .catch(() => { /* ya se avisó al usuario */ })
        }, 600)
    }

    async function apply() {
        setSaving(true)
        const { error } = await supabase.rpc('toul_apply_inventory_count', { p_count_id: id, p_notes: null })
        setSaving(false)
        setConfirmOpen(false)
        if (error) { toast.error(error.message); return }
        toast.success('Conteo aplicado. Inventario actualizado.')
        const [countRes, itemsRes] = await Promise.all([
            supabase.from('inventory_counts').select('*').eq('id', id).single(),
            supabase.from('inventory_count_items').select('*').eq('count_id', id),
        ])
        setCount(countRes.data as CountState)
        setApplied((itemsRes.data ?? []) as AppliedItem[])
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return rows
        return rows.filter(r => r.name.toLowerCase().includes(q) || r.reference?.toLowerCase().includes(q))
    }, [rows, search])

    const countedRows = Object.values(counted).filter(v => v !== '').length
    const nameByKey = useMemo(() => Object.fromEntries(rows.map(r => [r.key, r.name])), [rows])

    if (loading) {
        return (
            <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
            </div>
        )
    }

    // ─── Conteo ya aplicado: resultado ────────────────────────
    if (count?.status === 'applied') {
        const differences = applied
            .filter(i => Number(i.difference ?? 0) !== 0)
            .sort((a, b) => Math.abs(Number(b.difference)) - Math.abs(Number(a.difference)))
        const diffValue = Math.round(Number(count.diff_value))

        return (
            <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
                <div className="toul-ambient" />
                <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                    <Link href="/inventory/conteo" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <div>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Conteo terminado</p>
                        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Resultado</h1>
                    </div>
                </div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.26, ease: EASE_OUT_EMIL }}
                    style={{
                        borderRadius: 18, padding: '20px', marginBottom: 16, textAlign: 'center',
                        background: diffValue === 0 ? 'var(--toul-accent-dim)' : diffValue < 0 ? 'var(--toul-error-dim)' : 'var(--toul-warning-dim)',
                    }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-muted)', margin: 0 }}>
                        {diffValue === 0 ? 'El inventario cuadró' : diffValue < 0 ? 'Faltante en inventario' : 'Sobrante en inventario'}
                    </p>
                    <p style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', margin: '2px 0 0', color: diffValue === 0 ? 'var(--toul-accent)' : diffValue < 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                        {diffValue === 0 ? formatCOP(0) : `${diffValue < 0 ? '−' : '+'}${formatCOP(Math.abs(diffValue))}`}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '6px 0 0' }}>
                        {count.counted_items} productos contados · {differences.length} con diferencia
                    </p>
                </motion.div>

                {differences.length === 0 ? (
                    <div className="toul-card" style={{ textAlign: 'center', padding: '32px 20px' }}>
                        <Check size={28} style={{ color: 'var(--toul-accent)', margin: '0 auto 10px' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Todo lo contado coincidió con el sistema</p>
                    </div>
                ) : (
                    <>
                        <p className="toul-section-label">Diferencias</p>
                        <div className="toul-card" style={{ padding: '4px 16px' }}>
                            {differences.map((item, i) => {
                                const key = item.variant_id ? `${item.product_id}:${item.variant_id}` : item.product_id
                                const diff = Number(item.difference)
                                return (
                                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{nameByKey[key] ?? 'Producto'}</p>
                                            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                                                Sistema {Math.round(Number(item.expected_qty))} · contado {Math.round(Number(item.counted_qty))}
                                            </p>
                                        </div>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                            {diff > 0 ? '+' : '−'}{Math.abs(diff)}
                                        </span>
                                        <span style={{ fontSize: 13, color: 'var(--toul-text-muted)', width: 90, textAlign: 'right' }}>
                                            {formatCOP(Math.abs(diff) * Number(item.unit_cost ?? 0))}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        )
    }

    // ─── Conteo en curso ──────────────────────────────────────
    return (
        <div className="px-4 md:px-8 py-6 pb-32 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-4" style={{ position: 'relative' }}>
                <Link href="/inventory/conteo" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Conteo en curso</p>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>
                        {countedRows} de {rows.length}
                    </h1>
                </div>
                <button onClick={() => setShowExpected(v => !v)}
                    aria-label={showExpected ? 'Ocultar lo que dice el sistema' : 'Ver lo que dice el sistema'}
                    style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid var(--toul-border)', background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    {showExpected ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--toul-text-muted)', margin: '0 0 14px', lineHeight: 1.45 }}>
                Cuenta los productos y escribe cuántos hay. Se guarda solo; puedes salir y volver.
                {!showExpected && ' El stock del sistema está oculto para que el conteo sea real.'}
            </p>

            <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                <input className="toul-input" placeholder="Buscar producto…" value={search}
                    onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 40 }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map(row => {
                    const value = counted[row.key] ?? ''
                    const done = value !== ''
                    const diff = done ? Number(value) - row.expected : 0
                    return (
                        <div key={row.key} className="toul-card"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                borderColor: done ? 'var(--toul-border-focused)' : 'var(--toul-border)',
                                background: done ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                            }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row.name}
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                                    {showExpected ? `Sistema: ${row.expected}` : row.reference || 'Cuenta y escribe'}
                                    {showExpected && done && diff !== 0 && (
                                        <span style={{ color: diff < 0 ? 'var(--toul-error)' : 'var(--toul-warning)', fontWeight: 600 }}>
                                            {' · '}{diff > 0 ? '+' : '−'}{Math.abs(diff)}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <input
                                value={value}
                                onChange={e => handleChange(row, e.target.value)}
                                inputMode="numeric"
                                placeholder="—"
                                aria-label={`Cantidad contada de ${row.name}`}
                                style={{
                                    width: 78, height: 46, borderRadius: 12, textAlign: 'center',
                                    fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em',
                                    background: 'var(--toul-surface-2)', color: 'var(--toul-text)',
                                    border: `1px solid ${done ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                    outline: 'none', flexShrink: 0,
                                }}
                            />
                        </div>
                    )
                })}
            </div>

            {/* Barra fija para terminar */}
            <div style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
                padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
                background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                borderTop: '1px solid var(--toul-border)',
            }}>
                <div className="max-w-2xl mx-auto md:pl-60" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 13, color: 'var(--toul-text-muted)', flex: 1 }}>
                        {countedRows === 0 ? 'Empieza a contar' : `${countedRows} ${countedRows === 1 ? 'producto contado' : 'productos contados'}`}
                    </span>
                    <button onClick={() => setConfirmOpen(true)} disabled={countedRows === 0}
                        style={{
                            height: 48, padding: '0 20px', borderRadius: 14, border: 'none',
                            background: countedRows === 0 ? 'rgba(255,255,255,0.07)' : 'var(--toul-accent)',
                            color: countedRows === 0 ? 'rgba(255,255,255,0.25)' : '#000',
                            fontSize: 15, fontWeight: 600, cursor: countedRows === 0 ? 'default' : 'pointer', fontFamily: 'inherit',
                        }}>
                        Terminar conteo
                    </button>
                </div>
            </div>

            <Sheet open={confirmOpen} onClose={() => !saving && setConfirmOpen(false)}
                title="¿Terminar el conteo?"
                subtitle="El inventario queda en lo que contaste. Los productos que no contaste no se tocan."
                footer={
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }} onClick={() => setConfirmOpen(false)} disabled={saving}>Seguir contando</button>
                        <button className="toul-btn-primary" onClick={apply} disabled={saving}>{saving ? 'Aplicando…' : 'Sí, terminar'}</button>
                    </div>
                }>
                <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                    Contaste <strong style={{ color: 'var(--toul-text)' }}>{countedRows}</strong> de {rows.length} productos.
                    Al terminar verás los faltantes y sobrantes, en unidades y en plata.
                </p>
            </Sheet>
        </div>
    )
}
