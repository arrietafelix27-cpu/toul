'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { motion } from 'framer-motion'
import { ArrowLeft, Copy, ExternalLink, Search, Share2, Package, Gift } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { Switch } from '@/components/ui'
import { explainError } from '@/lib/errors'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Catálogo por link — el dueño decide si está prendido, con qué
   dirección y qué productos se ven.
   ══════════════════════════════════════════════════════════════ */

interface PublishItem {
    id: string
    kind: 'producto' | 'combo'
    name: string
    price: number
    image: string | null
    isPublic: boolean
}

/** Convierte "Perfumes Félix" en "perfumes-felix". */
function toSlug(text: string) {
    return text
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
}

const SLUG_OK = /^[a-z0-9]([a-z0-9-]{1,30})[a-z0-9]$/

export default function CatalogoPublicoPage() {
    const [origin, setOrigin] = useState('')
    useEffect(() => { setOrigin(window.location.origin) }, [])

    const { data, isLoading, mutate } = useSWR('catalogo-publico', async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null

        const { data: store } = await supabase
            .from('stores')
            .select('id, name, public_slug, catalog_public, catalog_note')
            .eq('owner_id', user.id).single()
        if (!store) return null

        const [productsRes, combosRes] = await Promise.all([
            supabase.from('products').select('id, name, sale_price, image_url, is_public')
                .eq('store_id', store.id).eq('is_active', true).order('name'),
            supabase.from('combos').select('id, name, sale_price, image_url, is_public')
                .eq('store_id', store.id).eq('is_active', true).order('name'),
        ])

        const items: PublishItem[] = [
            ...(productsRes.data ?? []).map(row => ({
                id: row.id, kind: 'producto' as const, name: row.name,
                price: Number(row.sale_price), image: row.image_url, isPublic: !!row.is_public,
            })),
            ...(combosRes.data ?? []).map(row => ({
                id: row.id, kind: 'combo' as const, name: row.name,
                price: Number(row.sale_price), image: row.image_url, isPublic: !!row.is_public,
            })),
        ].sort((a, b) => a.name.localeCompare(b.name, 'es'))

        return { store, items }
    }, { revalidateOnFocus: false })

    const [slug, setSlug] = useState('')
    const [note, setNote] = useState('')
    const [savingSlug, setSavingSlug] = useState(false)
    const [query, setQuery] = useState('')

    useEffect(() => {
        if (!data?.store) return
        setSlug(data.store.public_slug ?? toSlug(data.store.name))
        setNote(data.store.catalog_note ?? '')
    }, [data?.store])

    const published = useMemo(() => (data?.items ?? []).filter(item => item.isPublic).length, [data?.items])
    const visible = useMemo(() => {
        const text = query.trim().toLowerCase()
        return (data?.items ?? []).filter(item => !text || item.name.toLowerCase().includes(text))
    }, [data?.items, query])

    if (isLoading || !data) {
        return (
            <div className="px-4 md:px-8 pt-6 max-w-2xl mx-auto flex flex-col gap-3">
                <div className="skeleton" style={{ height: 120, borderRadius: 18 }} />
                <div className="skeleton" style={{ height: 180, borderRadius: 18 }} />
            </div>
        )
    }

    const store = data.store
    const link = `${origin}/t/${store.public_slug ?? slug}`
    const live = store.catalog_public && !!store.public_slug

    // ── Acciones ──
    const setStoreField = async (patch: Record<string, unknown>, successMessage?: string) => {
        const { error } = await supabase.from('stores').update(patch).eq('id', store.id)
        if (error) { toast.error(explainError(error)); return false }
        await mutate()
        if (successMessage) toast.success(successMessage)
        return true
    }

    const saveSlug = async () => {
        const clean = toSlug(slug)
        if (!SLUG_OK.test(clean)) {
            toast.error('La dirección debe tener al menos 3 letras o números, sin espacios')
            return
        }
        setSavingSlug(true)
        const { error } = await supabase.from('stores').update({ public_slug: clean }).eq('id', store.id)
        setSavingSlug(false)
        if (error) {
            toast.error(error.code === '23505' ? 'Esa dirección ya la tiene otra tienda' : explainError(error))
            return
        }
        setSlug(clean)
        await mutate()
        toast.success('Dirección guardada')
    }

    const togglePublish = async (item: PublishItem, next: boolean) => {
        // Se pinta de una vez: nadie espera a que responda el servidor
        mutate(current => current && {
            ...current,
            items: current.items.map(row => row.id === item.id && row.kind === item.kind ? { ...row, isPublic: next } : row),
        }, { revalidate: false })

        const table = item.kind === 'combo' ? 'combos' : 'products'
        const { error } = await supabase.from(table).update({ is_public: next }).eq('id', item.id)
        if (error) { toast.error(explainError(error)); mutate() }
    }

    const publishAll = async (next: boolean) => {
        mutate(current => current && { ...current, items: current.items.map(row => ({ ...row, isPublic: next })) }, { revalidate: false })
        const [p, c] = await Promise.all([
            supabase.from('products').update({ is_public: next }).eq('store_id', store.id).eq('is_active', true),
            supabase.from('combos').update({ is_public: next }).eq('store_id', store.id).eq('is_active', true),
        ])
        if (p.error || c.error) { toast.error(explainError(p.error ?? c.error)); mutate(); return }
        mutate()
        toast.success(next ? 'Se publicó todo' : 'Se quitó todo del link')
    }

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(link)
            toast.success('Link copiado')
        } catch {
            toast.error('No se pudo copiar. Mantén presionado el link para copiarlo.')
        }
    }

    const shareLink = async () => {
        if (!navigator.share) { copyLink(); return }
        try {
            await navigator.share({ title: store.name, text: `Mira el catálogo de ${store.name}`, url: link })
        } catch { /* el usuario canceló */ }
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <div className="flex items-center gap-3 mb-5" style={{ position: 'relative' }}>
                <Link href="/settings" aria-label="Volver"
                    style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                </Link>
                <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                    Catálogo por link
                </h1>
            </div>

            {/* ── Prender / apagar ── */}
            <div className="toul-card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        Mostrar mi catálogo con un link
                    </p>
                    <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', margin: '3px 0 0', lineHeight: 1.45 }}>
                        Tus clientes lo abren sin cuenta y ven foto, nombre y precio. No ven tu inventario ni tus costos.
                    </p>
                </div>
                <Switch
                    checked={!!store.catalog_public}
                    onChange={next => setStoreField({ catalog_public: next }, next ? 'Catálogo publicado' : 'Catálogo apagado')}
                    label="Mostrar mi catálogo con un link"
                />
            </div>

            {/* ── El link ── */}
            <section style={{ marginTop: 22 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 2px' }}>Tu link</h2>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 10px' }}>
                    Este es el que pegas en Instagram y WhatsApp.
                </p>

                <div className="toul-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', height: 46, borderRadius: 13, overflow: 'hidden',
                        background: 'var(--toul-surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--toul-border)',
                    }}>
                        <span style={{ fontSize: 14, color: 'var(--toul-text-dim)', padding: '0 2px 0 13px', whiteSpace: 'nowrap' }}>
                            {(origin || 'toul.vercel.app').replace(/^https?:\/\//, '')}/t/
                        </span>
                        <input
                            value={slug}
                            onChange={event => setSlug(event.target.value.toLowerCase())}
                            onBlur={() => setSlug(toSlug(slug))}
                            placeholder="mi-tienda"
                            spellCheck={false}
                            style={{
                                flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent',
                                color: 'var(--toul-text)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit', paddingRight: 10,
                            }}
                        />
                    </div>

                    {toSlug(slug) !== (store.public_slug ?? '') && (
                        <motion.button
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            onClick={saveSlug} disabled={savingSlug}
                            style={{
                                height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                background: 'var(--toul-accent)', color: '#000', fontSize: 14, fontWeight: 600,
                            }}>
                            {savingSlug ? 'Guardando…' : 'Guardar dirección'}
                        </motion.button>
                    )}

                    <input
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        onBlur={() => { if (note !== (store.catalog_note ?? '')) setStoreField({ catalog_note: note.trim() || null }) }}
                        maxLength={90}
                        placeholder="Frase corta: “Envíos a todo el país”"
                        style={{
                            height: 46, borderRadius: 13, padding: '0 13px', fontFamily: 'inherit',
                            background: 'var(--toul-surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--toul-border)',
                            color: 'var(--toul-text)', fontSize: 14, outline: 'none',
                        }}
                    />

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={copyLink} disabled={!live} style={linkButton(live)}>
                            <Copy size={15} /> Copiar
                        </button>
                        <button onClick={shareLink} disabled={!live} style={linkButton(live)}>
                            <Share2 size={15} /> Compartir
                        </button>
                        <a href={live ? link : undefined} target="_blank" rel="noopener noreferrer" style={{ ...linkButton(live), textDecoration: 'none' }}>
                            <ExternalLink size={15} /> Abrir
                        </a>
                    </div>

                    {!live && (
                        <p style={{ fontSize: 13, color: 'var(--toul-warning)', margin: 0 }}>
                            {store.public_slug ? 'El link está apagado: préndelo arriba.' : 'Guarda una dirección para poder compartir el link.'}
                        </p>
                    )}
                </div>
            </section>

            {/* ── Qué se ve ── */}
            <section style={{ marginTop: 26 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Qué se ve</h2>
                    <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>
                        {published} de {data.items.length}
                    </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 10px' }}>
                    Solo lo que enciendas aparece en el link.
                </p>

                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar"
                            style={{
                                width: '100%', height: 42, borderRadius: 12, padding: '0 12px 0 34px', fontFamily: 'inherit',
                                background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                                color: 'var(--toul-text)', fontSize: 14, outline: 'none',
                            }}
                        />
                    </div>
                    <button onClick={() => publishAll(published < data.items.length)}
                        style={{
                            height: 42, padding: '0 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                            background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                            color: 'var(--toul-text-muted)', fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap',
                        }}>
                        {published < data.items.length ? 'Publicar todo' : 'Quitar todo'}
                    </button>
                </div>

                {data.items.length === 0 ? (
                    <div className="toul-card" style={{ textAlign: 'center', padding: '34px 20px', color: 'var(--toul-text-muted)', fontSize: 14 }}>
                        Todavía no tienes productos en el catálogo.
                    </div>
                ) : (
                    <div style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', borderRadius: 18, overflow: 'hidden' }}>
                        {visible.map((item, i) => (
                            <div key={`${item.kind}-${item.id}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                                    borderTop: i ? '1px solid var(--toul-divider)' : 'none',
                                }}>
                                <div style={{
                                    width: 42, height: 42, borderRadius: 11, flexShrink: 0, overflow: 'hidden', position: 'relative',
                                    background: 'linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {item.image
                                        ? <img src={item.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : (item.kind === 'combo'
                                            ? <Gift size={16} style={{ color: 'var(--toul-text-faint)' }} />
                                            : <Package size={16} style={{ color: 'var(--toul-text-faint)' }} />)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--toul-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.name}
                                    </p>
                                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>
                                        {formatCOP(item.price)}
                                    </p>
                                </div>
                                <Switch checked={item.isPublic} onChange={next => togglePublish(item, next)} label={`Mostrar ${item.name}`} />
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

const linkButton = (enabled: boolean): React.CSSProperties => ({
    flex: 1, height: 42, borderRadius: 12, cursor: enabled ? 'pointer' : 'default',
    background: 'var(--toul-surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--toul-border)',
    color: enabled ? 'var(--toul-text)' : 'var(--toul-text-faint)',
    fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    pointerEvents: enabled ? 'auto' : 'none',
})
