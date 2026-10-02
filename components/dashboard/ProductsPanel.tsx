'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Package, ShoppingCart, ArrowRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from './panelStyles'

/* ══════════════════════════════════════════════════════════════
   Tus productos.
   Dos de las vistas son información (qué vendes, qué te deja
   plata) y dos son tareas (qué se acaba, qué no se mueve).
   Las de tarea traen el botón que resuelve.
   ══════════════════════════════════════════════════════════════ */

export interface ProductRow {
    id: string
    name: string
    image_url: string | null
    value: number
    subValue: string
    units: number
}

export interface ProductsData {
    topUnits: ProductRow[]
    topProfit: ProductRow[]
    lowStock: ProductRow[]
    slowMoving: ProductRow[]
}

type Tab = 'units' | 'profit' | 'low' | 'slow'

const TABS: { value: Tab; label: string }[] = [
    { value: 'units', label: 'Vendidos' },
    { value: 'profit', label: 'Rentables' },
    { value: 'low', label: 'Se acaban' },
    { value: 'slow', label: 'Sin mover' },
]

const EMPTY: Record<Tab, string> = {
    units: 'Todavía no has vendido nada en este periodo.',
    profit: 'Cuando vendas, aquí verás qué te deja más plata.',
    low: 'Ningún producto se está acabando. Todo con stock.',
    slow: 'Todo tu inventario se está moviendo.',
}

const CSS = PANEL_CSS + `
.pp2-tab { position: relative; flex: 1; min-width: 0; padding: 7px 6px; border-radius: 10px; border: none;
    background: transparent; font-family: inherit; font-size: 11.5px; letter-spacing: -0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }
.pp2-tab > span { position: relative; z-index: 1; }

.pp2-item { opacity: 0; transform: translateY(6px); animation: pp2-in 240ms cubic-bezier(0.23,1,0.32,1) forwards; }
@keyframes pp2-in { to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .pp2-item { animation: none; opacity: 1; transform: none; } }
`

export function ProductsPanel({ products, loading }: { products: ProductsData; loading: boolean }) {
    const [tab, setTab] = useState<Tab>('units')

    const rows: Record<Tab, ProductRow[]> = {
        units: products.topUnits,
        profit: products.topProfit,
        low: products.lowStock,
        slow: products.slowMoving,
    }
    const current = rows[tab].slice(0, 5)
    const needsAttention = products.lowStock.length > 0

    const metricOf = (row: ProductRow) => {
        switch (tab) {
            case 'units': return `${row.value}`
            case 'profit': return null
            case 'low': return `${row.value}`
            case 'slow': return null
        }
    }

    return (
        <div className="pnl">
            <style>{CSS}</style>

            <h3 className="pnl-label" style={{ marginBottom: 12 }}>Tus productos</h3>

            {/* ── Qué estoy mirando ── */}
            <div style={{ display: 'flex', gap: 2, marginBottom: 12 }}>
                {TABS.map(item => {
                    const active = tab === item.value
                    const alert = item.value === 'low' && needsAttention
                    return (
                        <button key={item.value} className="pp2-tab" onClick={() => setTab(item.value)}
                            style={{
                                color: active ? 'var(--toul-text)' : alert ? 'var(--toul-error)' : 'var(--toul-text-dim)',
                                fontWeight: active ? 600 : 500,
                            }}>
                            {active && (
                                <motion.span
                                    layoutId="products-tab"
                                    transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
                                    style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: 10, background: 'rgba(255,255,255,0.07)' }}
                                />
                            )}
                            <span>
                                {alert && !active && (
                                    <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: 'var(--toul-error)', marginRight: 5, verticalAlign: 'middle' }} />
                                )}
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* ── La lista ── */}
            <div style={{ flex: 1, minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height="48px" className="rounded-xl opacity-10" />)}
                    </div>
                ) : current.length === 0 ? (
                    <div style={{ padding: '28px 10px', textAlign: 'center' }}>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0, lineHeight: 1.5 }}>{EMPTY[tab]}</p>
                    </div>
                ) : (
                    <div key={tab} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {current.map((row, index) => {
                            const metric = metricOf(row)
                            return (
                                <div key={row.id} className="pp2-item"
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, animationDelay: `${index * 40}ms` }}>
                                    <Link href={`/products/${row.id}`} className="pnl-row" style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            width: 34, height: 34, borderRadius: 10, flexShrink: 0, overflow: 'hidden', position: 'relative',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                        }}>
                                            {row.image_url
                                                ? <img src={row.image_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Package size={14} style={{ color: 'var(--toul-text-faint)' }} />}
                                        </span>

                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {row.name}
                                            </span>
                                            <span style={{
                                                display: 'block', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                color: tab === 'low' ? 'var(--toul-error)' : tab === 'slow' ? 'var(--toul-warning)' : 'var(--toul-text-dim)',
                                            }}>
                                                {row.subValue}
                                            </span>
                                        </span>

                                        {metric && (
                                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--toul-text)', flexShrink: 0 }}>
                                                {metric}
                                            </span>
                                        )}
                                    </Link>

                                    {tab === 'low' && (
                                        <Link href={`/inventory/purchase?product=${row.id}`} className="pnl-pill">
                                            <ShoppingCart size={13} /> Comprar
                                        </Link>
                                    )}
                                    {tab === 'slow' && (
                                        <Link href={`/products/${row.id}`} className="pnl-pill">
                                            Ver <ArrowRight size={13} />
                                        </Link>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
