'use client'
import Link from 'next/link'
import { ArrowLeft, Package, Layers, Gift, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'

const EASE_OUT_EXPO: [number, number, number, number] = [0.4, 0, 0.2, 1]
const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }

const OPTIONS = [
    { href: '/products/new/simple', icon: Package, label: 'Producto simple' },
    { href: '/products/new/variant', icon: Layers, label: 'Con variantes' },
    { href: '/products/new/combo', icon: Gift, label: 'Combo / Paquete' },
]

function TypeCard({
    href, Icon, label, delay,
}: {
    href: string
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
    label: string
    delay: number
}) {
    const [hovered, setHovered] = useState(false)

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: EASE_OUT_EXPO }}>
            <motion.div whileTap={{ scale: 0.98 }} transition={SPRING_PRESS}>
                <Link
                    href={href}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    onTouchStart={() => setHovered(true)}
                    onTouchEnd={() => setHovered(false)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        padding: '16px 18px',
                        borderRadius: 16,
                        background: hovered ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                        border: `1px solid ${hovered ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                        transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                        textDecoration: 'none',
                    }}>
                    <div style={{
                        width: 44, height: 44,
                        borderRadius: 12,
                        background: hovered ? 'rgba(50,215,75,0.18)' : 'var(--toul-accent-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'background var(--toul-transition)',
                    }}>
                        <Icon size={20} strokeWidth={2} color="var(--toul-accent)" />
                    </div>
                    <span style={{
                        flex: 1,
                        fontSize: 16,
                        fontWeight: 500,
                        color: 'var(--toul-text)',
                        letterSpacing: '-0.01em',
                    }}>
                        {label}
                    </span>
                    <ChevronRight
                        size={16}
                        strokeWidth={2}
                        color={hovered ? 'var(--toul-accent)' : 'rgba(255,255,255,0.3)'}
                        style={{ transition: 'color var(--toul-transition)' }}
                    />
                </Link>
            </motion.div>
        </motion.div>
    )
}

export default function NewProductTypePage() {
    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <div className="toul-ambient" />

            <div style={{
                position: 'relative',
                padding: '20px 18px 90px',
                maxWidth: 520,
                margin: '0 auto',
            }}>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 36,
                    }}>
                    <Link
                        href="/products"
                        className="active:scale-90"
                        style={{
                            width: 36, height: 36, borderRadius: 12,
                            background: 'rgba(255,255,255,0.07)',
                            color: 'rgba(255,255,255,0.7)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.18s var(--toul-ease)',
                        }}>
                        <ArrowLeft size={17} strokeWidth={2} />
                    </Link>
                    <h1 style={{
                        fontSize: 17,
                        fontWeight: 600,
                        color: 'var(--toul-text)',
                        letterSpacing: '-0.02em',
                        margin: 0,
                    }}>
                        Nuevo producto
                    </h1>
                </motion.div>

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {OPTIONS.map((opt, i) => (
                        <TypeCard
                            key={opt.href}
                            href={opt.href}
                            Icon={opt.icon}
                            label={opt.label}
                            delay={0.05 + i * 0.05}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
