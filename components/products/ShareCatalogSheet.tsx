'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Check, Copy, ExternalLink, Settings2, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Sheet } from '@/components/isla/Sheet'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { explainError } from '@/lib/errors'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Compartir el catálogo.

   Antes el botón mandaba a Ajustes, que es donde se configura el
   link, no donde se comparte. Uno toca "compartir" porque quiere
   mandárselo a alguien ya, no para cambiar la dirección.

   Si el catálogo todavía no está publicado, se prende aquí mismo
   en vez de echar al usuario a otra pantalla.
   ══════════════════════════════════════════════════════════════ */

const aSlug = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export function ShareCatalogSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [copiado, setCopiado] = useState(false)
    const [prendiendo, setPrendiendo] = useState(false)

    const { data: store, mutate } = useSWR(open ? 'tienda-catalogo' : null, async () => {
        const { data } = await supabase.from('stores')
            .select('id, name, public_slug, catalog_public').limit(1).single()
        return data
    }, { revalidateOnFocus: false })

    const slug = store?.public_slug ?? (store ? aSlug(store.name) : '')
    const link = typeof window !== 'undefined' && slug ? `${window.location.origin}/t/${slug}` : ''
    const publicado = !!store?.catalog_public && !!store?.public_slug

    async function publicar() {
        if (!store) return
        setPrendiendo(true)
        const { error } = await supabase.from('stores')
            .update({ catalog_public: true, public_slug: store.public_slug ?? aSlug(store.name) })
            .eq('id', store.id)
        setPrendiendo(false)
        if (error) { toast.error(explainError(error, 'No se pudo publicar el catálogo.')); return }
        await mutate()
        toast.success('Tu catálogo quedó publicado')
    }

    async function copiar() {
        try {
            await navigator.clipboard.writeText(link)
            setCopiado(true)
            setTimeout(() => setCopiado(false), 1800)
        } catch {
            toast.error('No se pudo copiar. Mantén presionado el link.')
        }
    }

    function compartir() {
        const texto = `Mira el catálogo de ${store?.name ?? 'mi tienda'}`
        if (navigator.share) {
            void navigator.share({ title: store?.name, text: texto, url: link }).catch(() => { /* lo canceló */ })
            return
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${texto}\n${link}`)}`, '_blank')
    }

    return (
        <Sheet open={open} onClose={onClose}
            title="Compartir tu catálogo"
            subtitle={publicado
                ? 'Cualquiera que abra este link ve tus productos. No puede pedir ni ver tu inventario.'
                : 'Publica tu catálogo para poder mandarlo por WhatsApp o Instagram.'}>
            <style>{PANEL_CSS}</style>

            {!store ? (
                <div className="skeleton" style={{ height: 96, borderRadius: 14 }} />
            ) : !publicado ? (
                <button onClick={publicar} disabled={prendiendo} className="toul-btn-primary" style={{ width: '100%' }}>
                    {prendiendo ? 'Publicando…' : 'Publicar mi catálogo'}
                </button>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{
                        padding: '13px 15px', borderRadius: 14, wordBreak: 'break-all',
                        background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                        fontSize: 13.5, color: 'var(--toul-text)',
                    }}>
                        {link}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={compartir} className="toul-btn-primary" style={{ flex: 1 }}>
                            <Share2 size={16} /> Compartir
                        </button>
                        <button onClick={copiar}
                            style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                                height: 50, padding: '0 16px', borderRadius: 14, cursor: 'pointer', flexShrink: 0,
                                fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600,
                                background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                                color: copiado ? 'var(--toul-accent)' : 'var(--toul-text)',
                            }}>
                            {copiado ? <Check size={16} /> : <Copy size={16} />}
                            {copiado ? 'Copiado' : 'Copiar'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 2 }}>
                        <a href={link} target="_blank" rel="noreferrer" className="pnl-link">
                            Verlo como lo ve un cliente <ExternalLink size={12} />
                        </a>
                        <Link href="/settings/catalogo" className="pnl-link">
                            <Settings2 size={12} /> Ajustes
                        </Link>
                    </div>
                </div>
            )}
        </Sheet>
    )
}
