import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PublicCatalog, type PublicItem, type PublicStore } from '@/components/public/PublicCatalog'
import { StoreClosed } from '@/components/public/StoreClosed'

/* ══════════════════════════════════════════════════════════════
   La vitrina pública. Se abre sin cuenta.
   Todo lo que llega aquí sale de una sola función de la base de
   datos que entrega únicamente lo marcado como público: nunca
   costos, nunca stock, nunca ventas.
   ══════════════════════════════════════════════════════════════ */

export const revalidate = 60

type CatalogData = { store: PublicStore; items: PublicItem[] } | null

async function loadCatalog(slug: string): Promise<CatalogData> {
    const supabase = await createClient()
    const { data } = await supabase.rpc('toul_public_catalog', { p_slug: slug })
    return (data as CatalogData) ?? null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    const data = await loadCatalog(slug)
    if (!data) return { title: 'Catálogo no disponible' }

    const title = data.store.name
    const description = data.store.note || `Mira el catálogo de ${data.store.name}.`
    const image = data.store.logo || data.items.find(item => item.image)?.image || undefined

    return {
        title,
        description,
        openGraph: { title, description, type: 'website', images: image ? [image] : undefined },
        twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : undefined },
    }
}

export default async function PublicCatalogPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const data = await loadCatalog(slug)

    if (!data) return <StoreClosed />

    return <PublicCatalog store={data.store} items={data.items} />
}
