'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Los primeros pasos.

   Después del registro la app te soltaba en un inicio en ceros,
   sin decirte qué hacer. Alguien que no es técnico abre eso y no
   sabe por dónde empezar.

   No es un tutorial ni un paseo guiado: son los dos pasos que
   hacen que la app sirva para algo, y desaparecen para siempre
   apenas haces la primera venta. Nadie quiere un cartel de
   principiante en su pantalla a los seis meses.
   ══════════════════════════════════════════════════════════════ */

const CSS = PANEL_CSS + `
.pp-paso { display: flex; align-items: center; gap: 12px; width: 100%;
    padding: 11px 10px; border-radius: 14px; text-decoration: none;
    font: inherit; color: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pp-paso:active { transform: scale(0.99); }

.pp-marca { width: 24px; height: 24px; border-radius: 999px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1.5px solid var(--toul-border-2, rgba(255,255,255,0.14)); }
.pp-marca[data-hecho="true"] { border-color: transparent; background: var(--toul-accent-dim); }

@media (hover: hover) and (pointer: fine) { .pp-paso:hover { background: rgba(255,255,255,0.04); } }
@media (prefers-reduced-motion: reduce) { .pp-paso:active { transform: none; } }
`

interface Paso {
    clave: string
    titulo: string
    detalle: string
    href: string
    hecho: boolean
}

export function PrimerosPasos({ storeId }: { storeId: string | null }) {
    const { data } = useSWR(storeId ? ['primeros-pasos', storeId] : null, async () => {
        const [productos, ventas, tienda] = await Promise.all([
            supabase.from('products').select('id', { count: 'exact', head: true })
                .eq('store_id', storeId!).eq('is_active', true),
            supabase.from('sales').select('id', { count: 'exact', head: true }).eq('store_id', storeId!),
            supabase.from('stores').select('catalog_public, public_slug').eq('id', storeId!).single(),
        ])
        return {
            productos: productos.count ?? 0,
            ventas: ventas.count ?? 0,
            catalogo: !!tienda.data?.catalog_public && !!tienda.data?.public_slug,
        }
    }, { revalidateOnFocus: false })

    // Apenas vendes por primera vez, esto no vuelve a aparecer
    if (!data || (data.productos > 0 && data.ventas > 0)) return null

    const pasos: Paso[] = [
        {
            clave: 'producto',
            titulo: 'Crea tu primer producto',
            detalle: 'Lo que vendes, con su precio y lo que te costó.',
            href: '/products/new',
            hecho: data.productos > 0,
        },
        {
            clave: 'venta',
            titulo: 'Haz tu primera venta',
            detalle: 'Desde ahí la app empieza a llevarte las cuentas sola.',
            href: '/caja',
            hecho: data.ventas > 0,
        },
        {
            clave: 'catalogo',
            titulo: 'Comparte tu catálogo por link',
            detalle: 'Para mandarlo por WhatsApp o ponerlo en tu Instagram.',
            href: '/products',
            hecho: data.catalogo,
        },
    ]

    const siguiente = pasos.find(p => !p.hecho)

    return (
        <motion.section
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            style={{ marginBottom: 22 }}>
            <style>{CSS}</style>

            <p className="pnl-label" style={{ marginBottom: 3 }}>Para empezar</p>
            <p style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 10px' }}>
                {data.productos === 0
                    ? 'Tu negocio está listo. Falta lo que vendes.'
                    : 'Ya tienes qué vender. Ahora véndelo.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pasos.map(paso => (
                    <Link key={paso.clave} href={paso.href} className="pp-paso">
                        <span className="pp-marca" data-hecho={paso.hecho}>
                            {paso.hecho && <Check size={13} strokeWidth={3} style={{ color: 'var(--toul-accent)' }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                                display: 'block', fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                                color: paso.hecho ? 'var(--toul-text-dim)' : 'var(--toul-text)',
                                textDecoration: paso.hecho ? 'line-through' : 'none',
                            }}>
                                {paso.titulo}
                            </span>
                            {!paso.hecho && (
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)', marginTop: 1 }}>
                                    {paso.detalle}
                                </span>
                            )}
                        </span>
                        {paso.clave === siguiente?.clave && (
                            <ArrowRight size={15} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} />
                        )}
                    </Link>
                ))}
            </div>
        </motion.section>
    )
}
