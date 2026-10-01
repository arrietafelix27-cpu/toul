'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, ChevronLeft, ChevronRight, Package, Gift, Store } from 'lucide-react'
import { formatCOP } from '@/lib/utils'

/* ══════════════════════════════════════════════════════════════
   Vitrina pública. La ve un cliente, no el dueño:
   nada de stock, costos ni botones de administración.
   ══════════════════════════════════════════════════════════════ */

export interface PublicStore {
    name: string
    logo: string | null
    note: string | null
    whatsapp: string | null
    slug: string
}

export interface PublicItem {
    id: string
    kind: 'producto' | 'combo'
    name: string
    description: string | null
    image: string | null
    images: string[] | null
    category: string | null
    priceMin: number
    priceMax: number
    presentations: { name: string; price: number }[]
}

const priceLabel = (item: PublicItem) =>
    Number(item.priceMin) === Number(item.priceMax)
        ? formatCOP(Number(item.priceMin))
        : `${formatCOP(Number(item.priceMin))} – ${formatCOP(Number(item.priceMax))}`

const CSS = `
.pc-wrap { max-width: 1180px; margin: 0 auto; padding: 0 16px 56px; }
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(150px, 22vw, 230px), 1fr)); gap: 12px; }
.pc-card { display: flex; flex-direction: column; height: 100%; text-align: left; cursor: pointer;
    border-radius: 18px; overflow: hidden; background: var(--toul-surface); border: 1px solid var(--toul-border);
    padding: 0; font-family: inherit; transition: border-color 180ms cubic-bezier(0.4,0,0.2,1), transform 140ms cubic-bezier(0.4,0,0.2,1); }
.pc-card:hover { border-color: var(--toul-border-2, rgba(255,255,255,0.16)); transform: translateY(-2px); }
.pc-card:active { transform: scale(0.985); }
@media (min-width: 768px) { .pc-wrap { padding: 0 32px 72px; } }

/* En celular sube desde abajo; en PC es una ficha centrada */
.pc-sheet-wrap { position: fixed; inset: 0; z-index: 61; display: flex; align-items: flex-end; justify-content: center; pointer-events: none; }
.pc-sheet { pointer-events: auto; width: min(560px, 100%); max-height: 92dvh; overflow-y: auto;
    border-radius: 26px 26px 0 0; background: var(--toul-surface-overlay);
    border: 1px solid rgba(255,255,255,0.09); box-shadow: 0 -20px 70px rgba(0,0,0,0.6); }
@media (min-width: 768px) {
    .pc-sheet-wrap { align-items: center; padding: 24px; }
    .pc-sheet { border-radius: 24px; max-height: 88dvh; box-shadow: 0 30px 90px rgba(0,0,0,0.6); }
}
`

function Photo({ src, alt, kind }: { src: string | null; alt: string; kind: PublicItem['kind'] }) {
    const Icon = kind === 'combo' ? Gift : Package
    return (
        <div style={{
            position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', flexShrink: 0,
            background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
        }}>
            {src
                ? <img src={src} alt={alt} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Icon size={26} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--toul-text-faint)' }} />}
        </div>
    )
}

export function PublicCatalog({ store, items }: { store: PublicStore; items: PublicItem[] }) {
    const [query, setQuery] = useState('')
    const [category, setCategory] = useState<string | null>(null)
    const [openItem, setOpenItem] = useState<PublicItem | null>(null)

    const categories = useMemo(() => {
        const names = new Set<string>()
        items.forEach(item => { if (item.category) names.add(item.category) })
        return [...names].sort((a, b) => a.localeCompare(b, 'es'))
    }, [items])

    const visible = useMemo(() => {
        const text = query.trim().toLowerCase()
        return items.filter(item => {
            if (category && item.category !== category) return false
            if (!text) return true
            return item.name.toLowerCase().includes(text) || (item.description ?? '').toLowerCase().includes(text)
        })
    }, [items, query, category])

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--toul-bg)', position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="pc-wrap" style={{ position: 'relative' }}>

                {/* ── La tienda ── */}
                <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '34px 0 20px' }}>
                    <div style={{
                        width: 54, height: 54, borderRadius: 17, flexShrink: 0, overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: store.logo ? 'transparent' : 'var(--toul-accent)',
                        border: store.logo ? '1px solid var(--toul-border)' : 'none',
                    }}>
                        {store.logo
                            ? <img src={store.logo} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <Store size={24} color="#000" strokeWidth={2.2} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, textWrap: 'balance' }}>
                            {store.name}
                        </h1>
                        {store.note && (
                            <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '3px 0 0', lineHeight: 1.4 }}>
                                {store.note}
                            </p>
                        )}
                    </div>
                </header>

                {/* ── Buscar y filtrar ── */}
                {items.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                            <input
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                                placeholder="Buscar"
                                style={{
                                    width: '100%', height: 44, borderRadius: 14, padding: '0 14px 0 38px',
                                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                                    color: 'var(--toul-text)', fontSize: 15, outline: 'none', fontFamily: 'inherit',
                                }}
                            />
                        </div>

                        {categories.length > 0 && (
                            <div style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
                                {[null, ...categories].map(name => {
                                    const active = category === name
                                    return (
                                        <button key={name ?? 'todo'} onClick={() => setCategory(name)}
                                            style={{
                                                flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
                                                fontSize: 13.5, fontWeight: active ? 600 : 500, fontFamily: 'inherit',
                                                background: active ? 'var(--toul-accent-dim)' : 'var(--toul-surface)',
                                                border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                                transition: 'all 160ms cubic-bezier(0.4,0,0.2,1)',
                                            }}>
                                            {name ?? 'Todo'}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Los productos ── */}
                {visible.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--toul-text-muted)' }}>
                        <p style={{ fontSize: 15, margin: 0 }}>
                            {items.length === 0 ? 'Esta tienda todavía no ha publicado productos.' : 'No encontramos nada con eso.'}
                        </p>
                    </div>
                ) : (
                    <div className="pc-grid">
                        {visible.map((item, index) => (
                            <motion.button
                                key={`${item.kind}-${item.id}`}
                                className="pc-card"
                                onClick={() => setOpenItem(item)}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.22, delay: Math.min(index, 11) * 0.03, ease: [0, 0, 0.2, 1] }}>
                                <Photo src={item.image} alt={item.name} kind={item.kind} />
                                <div style={{ padding: '10px 12px 13px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <p style={{
                                        fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0, lineHeight: 1.3, height: 36,
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                    }}>
                                        {item.name}
                                    </p>
                                    <p style={{
                                        fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-accent)', margin: 0,
                                        lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}>
                                        {priceLabel(item)}
                                    </p>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                )}

                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--toul-text-faint)', margin: '40px 0 0' }}>
                    Hecho con TOUL
                </p>
            </div>

            <ItemSheet item={openItem} onClose={() => setOpenItem(null)} />
        </main>
    )
}

/* ── Ficha del producto ── */
function ItemSheet({ item, onClose }: { item: PublicItem | null; onClose: () => void }) {
    const [photo, setPhoto] = useState(0)
    const photos = item ? [...(item.images ?? []), item.image].filter(Boolean) as string[] : []

    return (
        <AnimatePresence onExitComplete={() => setPhoto(0)}>
            {item && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 60,
                            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(22px)', WebkitBackdropFilter: 'blur(22px)',
                        }}
                    />
                    <div className="pc-sheet-wrap">
                        <motion.div
                            className="pc-sheet"
                            initial={{ opacity: 0, y: 40, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 30, scale: 0.98 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 32 }}>

                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                }}>
                                    {photos.length > 0
                                        ? <img src={photos[photo]} alt={item.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <Package size={40} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'var(--toul-text-faint)' }} />}

                                    {photos.length > 1 && (
                                        <>
                                            <button onClick={() => setPhoto(i => (i - 1 + photos.length) % photos.length)} aria-label="Foto anterior" style={navButton('left')}>
                                                <ChevronLeft size={18} />
                                            </button>
                                            <button onClick={() => setPhoto(i => (i + 1) % photos.length)} aria-label="Foto siguiente" style={navButton('right')}>
                                                <ChevronRight size={18} />
                                            </button>
                                            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                {photos.map((_, i) => (
                                                    <span key={i} style={{
                                                        width: i === photo ? 18 : 6, height: 6, borderRadius: 999,
                                                        background: i === photo ? 'var(--toul-accent)' : 'rgba(255,255,255,0.4)',
                                                        transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
                                                    }} />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button onClick={onClose} aria-label="Cerrar"
                                    style={{
                                        position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 12, border: 'none',
                                        background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(10px)', color: '#fff', cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                    <X size={17} />
                                </button>
                            </div>

                            <div style={{ padding: '18px 20px calc(28px + env(safe-area-inset-bottom, 0px))' }}>
                                {item.kind === 'combo' && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
                                        color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)',
                                        borderRadius: 999, padding: '5px 11px', marginBottom: 10,
                                    }}>
                                        <Gift size={13} /> Combo
                                    </span>
                                )}

                                <h2 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, textWrap: 'balance' }}>
                                    {item.name}
                                </h2>
                                <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-accent)', margin: '6px 0 0' }}>
                                    {priceLabel(item)}
                                </p>

                                {item.description && (
                                    <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', lineHeight: 1.55, margin: '14px 0 0', whiteSpace: 'pre-line' }}>
                                        {item.description}
                                    </p>
                                )}

                                {item.presentations.length > 0 && (
                                    <div style={{ marginTop: 20 }}>
                                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--toul-text-dim)', margin: '0 0 8px' }}>
                                            Presentaciones
                                        </p>
                                        <div style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', borderRadius: 16, overflow: 'hidden' }}>
                                            {item.presentations.map((presentation, i) => (
                                                <div key={presentation.name}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                                                        padding: '12px 15px', borderTop: i ? '1px solid var(--toul-divider)' : 'none',
                                                    }}>
                                                    <span style={{ fontSize: 15, color: 'var(--toul-text)' }}>{presentation.name}</span>
                                                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--toul-accent)' }}>
                                                        {formatCOP(Number(presentation.price))}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}

const navButton = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 10, width: 36, height: 36, borderRadius: 12, border: 'none',
    background: 'rgba(10,10,10,0.6)', backdropFilter: 'blur(10px)',
    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
})
