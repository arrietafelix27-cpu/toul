'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Wallet, Receipt, Users, Zap, Settings, BarChart2, Clock, Menu, X, ChevronRight } from 'lucide-react'
import { usePOS } from '@/components/pos/POSContext'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

function ClipboardDollarIcon({ size = 22 }: { size?: number }) {
    return (
        <svg viewBox="0 0 512 512" width={size} height={size} fill="currentColor">
            <path d="M416 64h-64V48c0-26.51-21.49-48-48-48h-96c-26.51 0-48 21.49-48 48v16h-64c-35.35 0-64 28.65-64 64v320c0 35.35 28.65 64 64 64h256c35.35 0 64-28.65 64-64V128c0-35.35-28.65-64-64-64zm-160-32c8.84 0 16 7.16 16 16v16h-32V48c0-8.84 7.16-16 16-16zm160 416H160V128h256v320z" />
            <path d="M256 181c-29.74 0-54 24.26-54 54s24.26 54 54 54h18c8.84 0 16 7.16 16 16s-7.16 16-16 16h-42c-8.84 0-16 7.16-16 16s7.16 16 16 16h18v16c0 8.84 7.16 16 16 16s16-7.16 16-16v-16c29.74 0 54-24.26 54-54s-24.26-54-54-54h-18c-8.84 0-16-7.16-16-16s7.16-16 16-16h42c8.84 0 16-7.16 16-16s-7.16-16-16-16h-18v-16c0-8.84-7.16-16-16-16s-16 7.16-16 16v16z" />
        </svg>
    )
}

// ── SIDEBAR (desktop) ──────────────────────────────────────────────────────
const NAV_MAIN = [
    { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/products', icon: Package, label: 'Productos' },
    { href: '/inventory', icon: Package, label: 'Inventario' },
    { href: '/cash', icon: Wallet, label: 'Caja' },
    { href: '/providers', icon: Users, label: 'Proveedores' },
    { href: '/customers', icon: Users, label: 'Clientes' },
]
const NAV_ANALYTICS = [
    { href: '/ventas', icon: Clock, label: 'Historial' },
    { href: '/reportes', icon: BarChart2, label: 'Reportes' },
]

export function Sidebar() {
    const pathname = usePathname()
    const { openPOS } = usePOS()
    const isActive = (href: string) => pathname === href

    return (
        <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 z-40"
            style={{ background: 'var(--toul-surface)', borderRight: '1px solid var(--toul-border)' }}>

            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid var(--toul-border)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                    <Zap size={18} className="text-white" fill="white" />
                </div>
                <span className="text-xl font-bold gradient-text">TOUL</span>
            </div>

            {/* CTA */}
            <div className="px-3 pt-4 pb-2">
                <button onClick={openPOS}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-2xl text-white text-sm font-bold transition-all hover:opacity-90 active:scale-[0.98]"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 24px var(--toul-accent-glow)' }}>
                    <ClipboardDollarIcon size={18} />
                    Nueva venta
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-1 flex flex-col gap-0.5 overflow-y-auto">
                {NAV_MAIN.map(({ href, icon: Icon, label }) => (
                    <Link key={href} href={href}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium"
                        style={isActive(href)
                            ? { background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)', border: '1px solid var(--toul-accent-glow)' }
                            : { color: 'var(--toul-text-muted)', border: '1px solid transparent' }}>
                        <Icon size={17} strokeWidth={isActive(href) ? 2.5 : 2} />
                        {label}
                    </Link>
                ))}
                <div className="my-2" style={{ borderTop: '1px solid var(--toul-border)' }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1" style={{ color: 'var(--toul-text-subtle)' }}>Analytics</p>
                {NAV_ANALYTICS.map(({ href, icon: Icon, label }) => (
                    <Link key={href} href={href}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium"
                        style={isActive(href)
                            ? { background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)', border: '1px solid var(--toul-accent-glow)' }
                            : { color: 'var(--toul-text-muted)', border: '1px solid transparent' }}>
                        <Icon size={17} strokeWidth={isActive(href) ? 2.5 : 2} />
                        {label}
                    </Link>
                ))}
            </nav>

            {/* Settings */}
            <div className="px-3 pb-5 pt-2" style={{ borderTop: '1px solid var(--toul-border)' }}>
                <Link href="/settings"
                    className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium"
                    style={isActive('/settings')
                        ? { background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)', border: '1px solid var(--toul-accent-glow)' }
                        : { color: 'var(--toul-text-muted)', border: '1px solid transparent' }}>
                    <Settings size={17} />
                    Configuración
                </Link>
            </div>
        </aside>
    )
}

// ── MOBILE BOTTOM NAV (curved, hero POS button) ────────────────────────────
const MOBILE_LEFT = [
    { href: '/', icon: LayoutDashboard, label: 'Inicio' },
    { href: '/products', icon: Package, label: 'Productos' },
]
const MOBILE_RIGHT = [
    { href: '/inventory', icon: Package, label: 'Inventario' },
    { href: '/cash', icon: Wallet, label: 'Caja' },
]
const MENU_ITEMS = [
    { href: '/ventas', icon: Clock, label: 'Historial de ventas' },
    { href: '/reportes', icon: BarChart2, label: 'Reportes' },
    { href: '/expenses', icon: Receipt, label: 'Gastos' },
    { href: '/providers', icon: Users, label: 'Proveedores' },
    { href: '/customers', icon: Users, label: 'Clientes' },
    { href: '/settings', icon: Settings, label: 'Configuración' },
]

export function BottomNav() {
    const pathname = usePathname()
    const { openPOS } = usePOS()
    const [menuOpen, setMenuOpen] = useState(false)

    return (
        <>
            {/* Overlay for menu */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 md:hidden"
                        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
                        onClick={() => setMenuOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Floating menu drawer */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                        className="fixed z-50 md:hidden rounded-3xl overflow-hidden shadow-2xl"
                        style={{
                            bottom: 92, right: 16,
                            background: 'var(--toul-surface)',
                            border: '1px solid var(--toul-border)',
                            minWidth: 220,
                        }}>
                        {MENU_ITEMS.map(({ href, icon: Icon, label }, i) => (
                            <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                                style={{
                                    color: pathname === href ? 'var(--toul-accent)' : 'var(--toul-text)',
                                    borderBottom: i < MENU_ITEMS.length - 1 ? '1px solid var(--toul-border)' : 'none',
                                    background: pathname === href ? 'var(--toul-accent-dim)' : 'transparent',
                                }}>
                                <Icon size={18} />
                                <span className="text-sm font-medium">{label}</span>
                                <ChevronRight size={14} className="ml-auto opacity-30" />
                            </Link>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom bar */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                {/* Curved SVG background */}
                <div className="relative">
                    <svg viewBox="0 0 390 70" preserveAspectRatio="none" className="w-full block"
                        style={{ height: 70, position: 'absolute', bottom: 0, left: 0 }}>
                        <path d="M0,70 L0,20 Q80,0 160,18 Q185,28 195,28 Q205,28 230,18 Q310,0 390,20 L390,70 Z"
                            fill="var(--toul-surface)" />
                        <path d="M0,20 Q80,0 160,18 Q185,28 195,28 Q205,28 230,18 Q310,0 390,20"
                            fill="none" stroke="var(--toul-border)" strokeWidth="1" />
                    </svg>

                    <div className="relative flex items-end justify-around px-2"
                        style={{ height: 70, zIndex: 1 }}>
                        {/* LEFT ITEMS */}
                        {MOBILE_LEFT.map(({ href, icon: Icon, label }) => {
                            const active = pathname === href
                            return (
                                <Link key={href} href={href}
                                    className="flex flex-col items-center gap-0.5 pb-2 px-3 flex-1 transition-all"
                                    style={{ color: active ? 'var(--toul-accent)' : 'var(--toul-text-subtle)' }}>
                                    <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                                    <span className="text-[9px] font-semibold">{label}</span>
                                </Link>
                            )
                        })}

                        {/* CENTER: POS hero button */}
                        <div className="flex flex-col items-center pb-1 px-1" style={{ flex: '0 0 72px' }}>
                            <motion.button
                                onClick={openPOS}
                                whileTap={{ scale: 0.92 }}
                                className="w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl -mt-8"
                                style={{
                                    background: 'var(--toul-accent)',
                                    boxShadow: '0 0 0 4px var(--toul-surface), 0 4px 24px var(--toul-accent-glow)',
                                }}>
                                <ClipboardDollarIcon size={26} />
                            </motion.button>
                        </div>

                        {/* RIGHT ITEMS */}
                        {MOBILE_RIGHT.map(({ href, icon: Icon, label }) => {
                            const active = pathname === href
                            return (
                                <Link key={href} href={href}
                                    className="flex flex-col items-center gap-0.5 pb-2 px-3 flex-1 transition-all"
                                    style={{ color: active ? 'var(--toul-accent)' : 'var(--toul-text-subtle)' }}>
                                    <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                                    <span className="text-[9px] font-semibold">{label}</span>
                                </Link>
                            )
                        })}

                        {/* MENU button */}
                        <button onClick={() => setMenuOpen(v => !v)}
                            className="flex flex-col items-center gap-0.5 pb-2 px-3 flex-1 transition-all"
                            style={{ color: menuOpen ? 'var(--toul-accent)' : 'var(--toul-text-subtle)' }}>
                            <AnimatePresence mode="wait">
                                {menuOpen
                                    ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}><X size={22} strokeWidth={1.8} /></motion.div>
                                    : <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}><Menu size={22} strokeWidth={1.8} /></motion.div>
                                }
                            </AnimatePresence>
                            <span className="text-[9px] font-semibold">Más</span>
                        </button>
                    </div>
                </div>
            </nav>
        </>
    )
}
