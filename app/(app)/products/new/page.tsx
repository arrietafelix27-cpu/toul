'use client'
import Link from 'next/link'
import { ArrowLeft, Package, Layers, Gift, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'

/* Elegir qué tipo de producto crear. En PC eran tres botoncitos en una
   esquina de una pantalla vacía: ahora cada opción dice para qué sirve,
   que es justo lo que hay que saber para escoger bien. */

const OPTIONS = [
    {
        href: '/products/new/simple', icon: Package, label: 'Producto simple',
        text: 'Un solo precio y un solo stock.',
    },
    {
        href: '/products/new/variant', icon: Layers, label: 'Con presentaciones',
        text: 'El mismo producto en tallas, colores o tamaños, cada uno con su precio y su stock.',
    },
    {
        href: '/products/new/combo', icon: Gift, label: 'Combo o paquete',
        text: 'Varios productos que se venden juntos. Al venderlo se descuenta cada uno.',
    },
]

const CSS = `
.np-opcion { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 16px; text-decoration: none;
    background: var(--toul-surface); border: 1px solid var(--toul-border);
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil); }
.np-icono { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: var(--toul-accent-dim); color: var(--toul-accent); }
.np-flecha { color: var(--toul-text-faint); flex-shrink: 0; transition: color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
@media (hover: hover) and (pointer: fine) {
    .np-opcion:hover { background: var(--toul-surface-focused); border-color: var(--toul-border-focused); }
    .np-opcion:hover .np-flecha { color: var(--toul-accent); transform: translateX(2px); }
}
@media (min-width: 1024px) {
    .np-opcion { padding: 22px 24px; gap: 18px; border-radius: 18px; }
    .np-icono { width: 52px; height: 52px; border-radius: 14px; }
}
`

export default function NewProductTypePage() {
    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="max-w-[520px] lg:max-w-[640px] lg:pt-14" style={{
                position: 'relative',
                padding: '20px 18px 90px',
                margin: '0 auto',
            }}>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE_OUT_EMIL }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
                    <Link
                        href="/products"
                        aria-label="Volver al catálogo"
                        className="active:scale-90"
                        style={{
                            width: 36, height: 36, borderRadius: 12,
                            background: 'var(--toul-surface-2)',
                            color: 'var(--toul-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.16s var(--toul-ease-emil)',
                        }}>
                        <ArrowLeft size={17} strokeWidth={2} />
                    </Link>
                    <div>
                        <h1 className="text-[17px] lg:text-[24px]" style={{ fontWeight: 650, color: 'var(--toul-text)', letterSpacing: '-0.025em', margin: 0 }}>
                            Nuevo producto
                        </h1>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>Elige cómo lo vendes</p>
                    </div>
                </motion.div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {OPTIONS.map((opt, i) => (
                        <motion.div key={opt.href}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.04 + i * 0.05, ease: EASE_OUT_EMIL }}>
                            <motion.div whileTap={{ scale: 0.98 }} transition={SPRING_PRESS}>
                                <Link href={opt.href} className="np-opcion">
                                    <span className="np-icono"><opt.icon size={21} strokeWidth={2} /></span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 16, fontWeight: 600, color: 'var(--toul-text)', letterSpacing: '-0.01em' }}>
                                            {opt.label}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.45, color: 'var(--toul-text-dim)', marginTop: 2 }}>
                                            {opt.text}
                                        </span>
                                    </span>
                                    <ChevronRight size={17} strokeWidth={2} className="np-flecha" />
                                </Link>
                            </motion.div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </div>
    )
}
