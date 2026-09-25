'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeftRight, ChevronRight, CreditCard, TrendingDown } from 'lucide-react'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

/**
 * Caja — menú del módulo.
 *
 * No muestra saldos: la plata disponible se prestaba para confusión
 * (parecía ganancia). Lo que se vendió y con qué método está en Ventas
 * y en Reportes; aquí solo se registra y se consulta el movimiento.
 */
const OPTIONS = [
    {
        href: '/expenses',
        icon: TrendingDown,
        title: 'Nuevo gasto',
        description: 'Registra lo que sale del negocio: arriendo, domicilios, bolsas.',
        accent: 'var(--toul-error)',
        dim: 'var(--toul-error-dim)',
    },
    {
        href: '/cash/movimientos',
        icon: ArrowLeftRight,
        title: 'Movimientos',
        description: 'Todo lo que entró y salió, con su fecha y su método de pago.',
        accent: 'var(--toul-accent)',
        dim: 'var(--toul-accent-dim)',
    },
    {
        href: '/cash/metodos',
        icon: CreditCard,
        title: 'Métodos de pago',
        description: 'Efectivo, Nequi, datáfono… crea o cambia con qué te pagan.',
        accent: 'var(--toul-info)',
        dim: 'var(--toul-info-dim)',
    },
]

export default function CashPage() {
    return (
        <div className="px-4 md:px-8 pt-6 pb-8 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-6" style={{ position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px' }}>Operaciones</p>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Caja</h1>
            </motion.div>

            <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {OPTIONS.map(option => (
                    <motion.div key={option.href} variants={staggerItem} whileTap={{ scale: 0.99 }}>
                        <Link href={option.href} className="toul-card toul-card-interactive"
                            style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', padding: 18 }}>
                            <span style={{
                                width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                                background: option.dim, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <option.icon size={20} style={{ color: option.accent }} />
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--toul-text)' }}>
                                    {option.title}
                                </span>
                                <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-muted)', lineHeight: 1.45, marginTop: 2 }}>
                                    {option.description}
                                </span>
                            </span>
                            <ChevronRight size={17} style={{ color: 'var(--toul-text-dim)', flexShrink: 0 }} />
                        </Link>
                    </motion.div>
                ))}
            </motion.div>

            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', lineHeight: 1.5, margin: '20px 4px 0' }}>
                ¿Buscas cuánto vendiste y con qué método? Está en <Link href="/ventas" style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>Ventas</Link> y
                en <Link href="/reportes" style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>Reportes</Link>.
            </p>
        </div>
    )
}
