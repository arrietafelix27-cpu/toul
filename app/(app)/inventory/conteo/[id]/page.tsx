'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Search, Eye, EyeOff, Check } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'
import { EASE_OUT_EMIL } from '@/components/ui'
import { useConteo } from '@/lib/inventory/useConteo'
import { SinInternet } from '@/components/ui/SinInternet'
import { diferenciasDelConteo, llaveDeConteo } from '@/lib/inventory/calculos'

const CSS = `
.cd-caja { border-radius: 16px; background: rgba(255,255,255,0.022);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
.cd-fila { display: flex; align-items: center; gap: 12px; padding: 12px 12px; border-radius: 14px; }
`

export default function ConteoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const {
        count, rows, counted, applied, loading, sinDatos, reintentar, search, setSearch,
        confirmOpen, setConfirmOpen, cancelOpen, setCancelOpen, saving, handleChange, apply, cancel, fotos,
        filtered, countedRows, nameByKey,
    } = useConteo(id)
    const [showExpected, setShowExpected] = useState(false)

    if (loading) {
        return (
            <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto flex flex-col gap-2">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 14 }} />)}
            </div>
        )
    }

    if (sinDatos) return <SinInternet onRetry={reintentar} que="este conteo" />

    // ─── Conteo ya aplicado: resultado ────────────────────────
    if (count?.status === 'applied') {
        const differences = diferenciasDelConteo(applied)
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
                    <div style={{ textAlign: 'center', padding: '36px 20px' }}>
                        <Check size={28} style={{ color: 'var(--toul-accent)', margin: '0 auto 10px' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Todo lo contado coincidió con el sistema</p>
                    </div>
                ) : (
                    <>
                        <p className="toul-section-label">Diferencias</p>
                        <div className="cd-caja" style={{ padding: '4px 16px' }}>
                            {differences.map((item, i) => {
                                const key = llaveDeConteo(item.product_id, item.variant_id)
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

    // ─── Conteo cancelado: no tocó el inventario ──────────────
    if (count?.status === 'cancelled') {
        return (
            <div className="px-4 md:px-8 py-6 pb-24 max-w-2xl mx-auto" style={{ position: 'relative' }}>
                <div className="toul-ambient" />
                <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                    <Link href="/inventory/conteo" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <div>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 2px' }}>Conteo</p>
                        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Cancelado</h1>
                    </div>
                </div>
                <p style={{ fontSize: 14.5, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5, position: 'relative' }}>
                    Este conteo se canceló. El inventario quedó como estaba.
                </p>
            </div>
        )
    }

    // ─── Conteo en curso ──────────────────────────────────────
    return (
        <div className="px-4 md:px-8 py-6 pb-32 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <style>{CSS}</style>
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
                Escribe cuántos hay de cada uno. Se guarda solo.
                {!showExpected && ' El stock del sistema no se ve, para que el conteo sea real.'}
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
                    // Contra lo que decía el sistema al contarlo, si ya se guardó
                    const sistema = fotos[row.key] ?? row.expected
                    const diff = done ? Number(value) - sistema : 0
                    return (
                        <div key={row.key} className="cd-fila"
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
                                    {showExpected ? `Sistema: ${sistema}` : row.reference || 'Cuenta y escribe'}
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

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
                <button type="button" onClick={() => setCancelOpen(true)} disabled={saving}
                    style={{ height: 40, padding: '0 14px', borderRadius: 12, border: 'none', background: 'none',
                        fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text-dim)', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancelar conteo
                </button>
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
                subtitle="Se ajusta lo que no cuadró. Lo que se vendió mientras contabas no se pierde, y lo que no contaste no se toca."
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

            <ConfirmSheet
                open={cancelOpen}
                onClose={() => !saving && setCancelOpen(false)}
                onConfirm={cancel}
                busy={saving}
                danger
                title="¿Cancelar el conteo?"
                message="Lo que contaste se descarta y el inventario queda como está."
                confirmLabel="Sí, cancelar"
                cancelLabel="Seguir contando"
            />
        </div>
    )
}
