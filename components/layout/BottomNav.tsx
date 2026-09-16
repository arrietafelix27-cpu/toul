'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Wallet, Users, Settings, BarChart2, Clock, Menu, ChevronRight, Plus, Sparkles } from 'lucide-react'
import { usePOS } from '@/components/pos/POSContext'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }

// ── SIDEBAR SECTIONS ────────────────────────────────────────────────────────
const NAV_SECTIONS = [
    {
        label: 'Mi negocio',
        items: [
            { href: '/', icon: LayoutDashboard, label: 'Inicio' },
        ]
    },
    {
        label: 'Operaciones',
        items: [
            { href: '/products', icon: Package, label: 'Productos' },
            { href: '/inventory', icon: Package, label: 'Inventario' },
            { href: '/cash', icon: Wallet, label: 'Caja' },
            { href: '/ventas', icon: Clock, label: 'Ventas' },
        ]
    },
    {
        label: 'Personas',
        items: [
            { href: '/customers', icon: Users, label: 'Clientes' },
            { href: '/providers', icon: Users, label: 'Proveedores' },
        ]
    },
    {
        label: 'Inteligencia',
        items: [
            { href: '/toul-ai', icon: Sparkles, label: 'TOUL AI' },
            { href: '/reportes', icon: BarChart2, label: 'Reportes' },
        ]
    },
]

// ── SIDEBAR (desktop) ──────────────────────────────────────────────────────
export function Sidebar() {
    const pathname = usePathname()
    const { openPOS } = usePOS()
    const isActive = (href: string) => pathname === href

    return (
        <aside
            className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 z-40"
            style={{
                background: 'rgba(255,255,255,0.03)',
                borderRight: '1px solid var(--toul-border)',
                backdropFilter: 'blur(40px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
            }}>

            {/* Logo */}
            <div
                className="flex items-center gap-3 px-5 py-5"
                style={{ borderBottom: '1px solid var(--toul-border)' }}>
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                        background: 'var(--toul-accent)',
                        boxShadow: '0 4px 16px var(--toul-accent-glow)',
                    }}>
                    <span style={{ color: '#000', fontWeight: 800, fontSize: 14 }}>T</span>
                </div>
                <span
                    className="gradient-text"
                    style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
                    TOUL
                </span>
            </div>

            {/* CTA: Nueva venta */}
            <div className="px-3 pt-4 pb-2">
                <motion.button
                    onClick={openPOS}
                    whileTap={{ scale: 0.97 }}
                    transition={SPRING_PRESS}
                    className="w-full flex items-center justify-center gap-2"
                    style={{
                        background: 'var(--toul-accent)',
                        color: '#000',
                        height: 44,
                        borderRadius: 14,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        cursor: 'pointer',
                        boxShadow: '0 4px 24px var(--toul-accent-glow)',
                        fontFamily: 'inherit',
                    }}>
                    <Plus size={16} strokeWidth={2.6} />
                    Nueva venta
                </motion.button>
            </div>

            {/* Nav: Grouped sections */}
            <nav className="flex-1 px-3 py-2 flex flex-col gap-1 overflow-y-auto">
                {NAV_SECTIONS.map((section, si) => (
                    <div key={section.label}>
                        {si > 0 && (
                            <div
                                style={{
                                    height: 1,
                                    background: 'var(--toul-divider)',
                                    margin: '8px 0',
                                }}
                            />
                        )}
                        <p style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: 'var(--toul-text-dim)',
                            margin: '6px 0 4px 8px',
                            letterSpacing: '0.01em',
                        }}>
                            {section.label}
                        </p>
                        {section.items.map(({ href, icon: Icon, label }) => {
                            const active = isActive(href)
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    className="flex items-center gap-3 px-3 py-2 rounded-xl"
                                    style={{
                                        transition: 'background var(--toul-transition), color var(--toul-transition)',
                                        background: active ? 'var(--toul-accent-dim)' : 'transparent',
                                        color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                        fontSize: 14,
                                        fontWeight: active ? 600 : 500,
                                        textDecoration: 'none',
                                    }}>
                                    <Icon size={17} strokeWidth={active ? 2.4 : 2} />
                                    {label}
                                </Link>
                            )
                        })}
                    </div>
                ))}
            </nav>

            {/* Settings */}
            <div className="px-3 pb-5 pt-2" style={{ borderTop: '1px solid var(--toul-border)' }}>
                {(() => {
                    const active = isActive('/settings')
                    return (
                        <Link
                            href="/settings"
                            className="flex items-center gap-3 px-3 py-2 rounded-xl"
                            style={{
                                transition: 'background var(--toul-transition), color var(--toul-transition)',
                                background: active ? 'var(--toul-accent-dim)' : 'transparent',
                                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                fontSize: 14,
                                fontWeight: active ? 600 : 500,
                                textDecoration: 'none',
                            }}>
                            <Settings size={17} strokeWidth={active ? 2.4 : 2} />
                            Ajustes
                        </Link>
                    )
                })()}
            </div>
        </aside>
    )
}

// ── MOBILE BOTTOM NAV ──────────────────────────────────────────────────────

const MOBILE_NAV = [
    { href: '/', icon: LayoutDashboard, label: 'Inicio' },
    { href: '/products', icon: Package, label: 'Productos' },
    { type: 'pos' as const },
    { href: '/cash', icon: Wallet, label: 'Caja' },
    { type: 'menu' as const, icon: Menu, label: 'Más' },
]

const MENU_SECTIONS = [
    {
        label: 'Operaciones',
        items: [
            { href: '/inventory', icon: Package, label: 'Inventario' },
            { href: '/ventas', icon: Clock, label: 'Ventas' },
            { href: '/expenses', icon: Wallet, label: 'Gastos' },
        ]
    },
    {
        label: 'Personas',
        items: [
            { href: '/customers', icon: Users, label: 'Clientes' },
            { href: '/providers', icon: Users, label: 'Proveedores' },
        ]
    },
    {
        label: 'Inteligencia',
        items: [
            { href: '/toul-ai', icon: Sparkles, label: 'TOUL AI' },
            { href: '/reportes', icon: BarChart2, label: 'Reportes' },
        ]
    },
    {
        label: 'Sistema',
        items: [
            { href: '/settings', icon: Settings, label: 'Ajustes' },
        ]
    },
]

export function BottomNav() {
    const pathname = usePathname()
    const { openPOS } = usePOS()
    const [menuOpen, setMenuOpen] = useState(false)

    const isActive = (href: string) => {
        if (href === '/') return pathname === '/'
        return pathname.startsWith(href)
    }

    // Lock body scroll while bottom sheet is open
    useEffect(() => {
        if (menuOpen) {
            const prev = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = prev }
        }
    }, [menuOpen])

    return (
        <>
            {/* ── Backdrop ─────────────────────────────────────── */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed inset-0 z-50 md:hidden"
                        style={{
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                        }}
                        onClick={() => setMenuOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* ── "Más" Bottom Sheet ─────────────────────────── */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                        className="fixed bottom-0 left-0 right-0 z-50 md:hidden overflow-hidden pb-safe"
                        style={{
                            background: 'var(--toul-surface-overlay)',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            borderTopLeftRadius: 28,
                            borderTopRightRadius: 28,
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
                        }}>
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div style={{
                                width: 36,
                                height: 4,
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.18)',
                            }} />
                        </div>

                        <div className="px-4 pb-8 pt-3">
                            {MENU_SECTIONS.map((section, si) => (
                                <div key={section.label}>
                                    {si > 0 && (
                                        <div style={{
                                            height: 1,
                                            background: 'rgba(255,255,255,0.05)',
                                            margin: '12px 0',
                                        }} />
                                    )}
                                    <p style={{
                                        fontSize: 13,
                                        fontWeight: 500,
                                        color: 'var(--toul-text-dim)',
                                        margin: '4px 0 10px 4px',
                                    }}>
                                        {section.label}
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {section.items.map(({ href, icon: Icon, label }) => {
                                            const active = isActive(href)
                                            return (
                                                <motion.div
                                                    key={href}
                                                    whileTap={{ scale: 0.98 }}
                                                    transition={SPRING_PRESS}>
                                                    <Link
                                                        href={href}
                                                        onClick={() => setMenuOpen(false)}
                                                        className="flex items-center gap-3 px-3 py-3 rounded-2xl"
                                                        style={{
                                                            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                                            background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                                            border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                                            color: active ? 'var(--toul-accent)' : 'var(--toul-text)',
                                                            textDecoration: 'none',
                                                        }}>
                                                        <div style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: 9,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            background: active ? 'rgba(50,215,75,0.12)' : 'rgba(255,255,255,0.05)',
                                                        }}>
                                                            <Icon
                                                                size={17}
                                                                strokeWidth={active ? 2.4 : 2}
                                                                color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.7)'}
                                                            />
                                                        </div>
                                                        <span style={{
                                                            fontSize: 15,
                                                            fontWeight: active ? 600 : 500,
                                                            letterSpacing: '-0.01em',
                                                            flex: 1,
                                                        }}>
                                                            {label}
                                                        </span>
                                                        <ChevronRight
                                                            size={14}
                                                            color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.2)'}
                                                        />
                                                    </Link>
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Bottom Bar (frosted glass) ───────────────────── */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
                <div
                    className="flex items-center justify-around px-2 relative"
                    style={{
                        height: 70,
                        background: 'rgba(10, 10, 10, 0.78)',
                        backdropFilter: 'blur(40px) saturate(1.8)',
                        WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
                        borderTop: '1px solid rgba(255,255,255,0.06)',
                        borderTopLeftRadius: 22,
                        borderTopRightRadius: 22,
                    }}>
                    {MOBILE_NAV.map(item => {
                        // ── POS Center FAB ──
                        if (item.type === 'pos') {
                            return (
                                <div key="pos-center" className="flex items-center justify-center" style={{ width: 64 }}>
                                    <motion.button
                                        onClick={openPOS}
                                        whileTap={{ scale: 0.94 }}
                                        transition={SPRING_PRESS}
                                        className="flex items-center justify-center"
                                        style={{
                                            width: 56,
                                            height: 56,
                                            marginTop: -12,
                                            borderRadius: '50%',
                                            background: 'var(--toul-accent)',
                                            color: '#000',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: '0 8px 28px rgba(50,215,75,0.45), 0 2px 8px rgba(0,0,0,0.35)',
                                        }}>
                                        <Plus size={26} strokeWidth={2.8} color="#000" />
                                    </motion.button>
                                </div>
                            )
                        }

                        // ── "Más" Button ──
                        if (item.type === 'menu') {
                            const Icon = item.icon!
                            return (
                                <motion.button
                                    key="menu-btn"
                                    onClick={() => setMenuOpen(true)}
                                    whileTap={{ scale: 0.92 }}
                                    transition={SPRING_PRESS}
                                    className="flex flex-col items-center justify-center flex-1"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        gap: 3,
                                        padding: '8px 4px',
                                    }}>
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: menuOpen ? 'rgba(50,215,75,0.12)' : 'transparent',
                                        transition: 'background var(--toul-transition)',
                                    }}>
                                        <Icon
                                            size={20}
                                            strokeWidth={menuOpen ? 2.4 : 2}
                                            color={menuOpen ? 'var(--toul-accent)' : 'rgba(255,255,255,0.45)'}
                                            style={{ transition: 'color var(--toul-transition)' }}
                                        />
                                    </div>
                                    <span style={{
                                        fontSize: 10,
                                        fontWeight: 500,
                                        letterSpacing: '0.01em',
                                        color: menuOpen ? 'var(--toul-accent)' : 'rgba(255,255,255,0.45)',
                                        transition: 'color var(--toul-transition)',
                                    }}>
                                        {item.label}
                                    </span>
                                </motion.button>
                            )
                        }

                        // ── Regular Nav Tab ──
                        const active = isActive(item.href!)
                        const Icon = item.icon!
                        return (
                            <motion.div
                                key={item.href}
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                className="flex-1">
                                <Link
                                    href={item.href!}
                                    className="flex flex-col items-center justify-center"
                                    style={{
                                        gap: 3,
                                        padding: '8px 4px',
                                        textDecoration: 'none',
                                    }}>
                                    <div style={{
                                        width: 32,
                                        height: 32,
                                        borderRadius: 10,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: active ? 'rgba(50,215,75,0.12)' : 'transparent',
                                        transition: 'background var(--toul-transition)',
                                    }}>
                                        <Icon
                                            size={20}
                                            strokeWidth={active ? 2.4 : 2}
                                            color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.45)'}
                                            style={{ transition: 'color var(--toul-transition)' }}
                                        />
                                    </div>
                                    <span style={{
                                        fontSize: 10,
                                        fontWeight: 500,
                                        letterSpacing: '0.01em',
                                        color: active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.45)',
                                        transition: 'color var(--toul-transition)',
                                    }}>
                                        {item.label}
                                    </span>
                                </Link>
                            </motion.div>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}
