'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Package, Wallet, Receipt, Users, Zap, Settings, BarChart2, Clock, Menu, X, ChevronRight, ShoppingCart, Plus } from 'lucide-react'
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

// ── MOBILE BOTTOM NAV (mountain style, convex peak) ──────────────────────────
const MOBILE_NAV_ITEMS = [
    { href: '/', icon: LayoutDashboard, label: 'inicio' },
    { href: '/cash', icon: Wallet, label: 'caja' },
    { type: 'pos' }, // Placeholder for the hero button
    { href: '/products', icon: Package, label: 'productos' },
    { type: 'menu', icon: Menu, label: 'más' }, // Hamburger menu as in sketch
]

const MENU_ITEMS = [
    { href: '/inventory', icon: Package, label: 'Inventario' },
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
                        className="fixed inset-0 z-50 md:hidden"
                        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
                        onClick={() => setMenuOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Modern Bottom Sheet for "Más" */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed bottom-0 left-0 right-0 z-50 md:hidden rounded-t-[32px] overflow-hidden shadow-2xl pb-safe"
                        style={{
                            background: 'var(--toul-surface)',
                            borderTop: '1px solid var(--toul-border)',
                        }}>
                        {/* Drag Handle */}
                        <div className="flex justify-center py-3">
                            <div className="w-12 h-1 rounded-full bg-slate-700/50" />
                        </div>

                        <div className="px-4 pb-8 pt-2 grid grid-cols-1 gap-1">
                            {MENU_ITEMS.map(({ href, icon: Icon, label }, i) => (
                                <Link key={href} href={href} onClick={() => setMenuOpen(false)}
                                    className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-colors active:bg-slate-800/50"
                                    style={{
                                        color: pathname === href ? 'var(--toul-accent)' : 'var(--toul-text)',
                                        background: pathname === href ? 'var(--toul-accent-dim)' : 'transparent',
                                    }}>
                                    <div className={`p-2 rounded-xl ${pathname === href ? 'bg-indigo-500/10' : 'bg-slate-800/30'}`}>
                                        <Icon size={20} />
                                    </div>
                                    <span className="text-[15px] font-medium">{label}</span>
                                    <ChevronRight size={16} className="ml-auto opacity-30" />
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Bottom bar */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
                <div className="mx-0 relative">
                    {/* Shadow for the whole bar */}
                    <div className="absolute inset-x-0 bottom-0 h-14 shadow-[0_-12px_40px_rgba(0,0,0,0.3)]" />

                    {/* Mountain SVG background - Optical Centering (x=176) */}
                    <div className="relative overflow-visible">
                        <svg viewBox="0 0 360 80" preserveAspectRatio="none" className="w-full block"
                            style={{ height: 80, marginBottom: -2 }}>
                            {/* Optically centered peak at x=176 to balance lateral visual weights */}
                            <path d="M0,80 L0,45 C60,45 100,45 126,45 C141,45 151,30 176,30 C201,30 211,45 226,45 C256,45 296,45 360,45 L360,80 Z"
                                fill="var(--toul-surface)" />
                            {/* Symmetric top stroke aligned to peak at 176 */}
                            <path d="M0,45 C60,45 100,45 126,45 C141,45 151,30 176,30 C201,30 211,45 226,45 C256,45 296,45 360,45"
                                fill="none" stroke="var(--toul-border)" strokeWidth="0.5" />
                        </svg>

                        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-1"
                            style={{ height: 60, zIndex: 1 }}>

                            {MOBILE_NAV_ITEMS.map((item, idx) => {
                                if (item.type === 'pos') {
                                    return (
                                        <div key="pos-spacer" className="w-[72px] h-20 flex items-center justify-center relative translate-x-[-4px]">
                                            <motion.button
                                                onClick={openPOS}
                                                whileTap={{ scale: 0.94 }}
                                                className="absolute -top-1 w-[60px] h-[60px] rounded-full flex items-center justify-center text-white overflow-hidden shadow-2xl"
                                                animate={{
                                                    boxShadow: [
                                                        '0 8px 30px rgba(0, 0, 0, 0.15), 0 0 10px rgba(74, 222, 128, 0.1)',
                                                        '0 8px 35px rgba(0, 0, 0, 0.2), 0 0 15px rgba(74, 222, 128, 0.2)',
                                                        '0 8px 30px rgba(0, 0, 0, 0.15), 0 0 10px rgba(74, 222, 128, 0.1)'
                                                    ]
                                                }}
                                                transition={{
                                                    duration: 4,
                                                    repeat: Infinity,
                                                    ease: "easeInOut"
                                                }}
                                                style={{
                                                    background: '#4ade80',
                                                }}>
                                                {/* Phase 1: Soft Radial Halo Feedback */}
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 1 }}
                                                    whileTap={{ opacity: [0, 0.5, 0], scale: [1, 1.2] }}
                                                    transition={{ duration: 0.16, ease: "easeOut" }}
                                                    className="absolute inset-0 bg-white/30 rounded-full blur-[2px]"
                                                />
                                                <div className="text-white relative z-10 flex items-center justify-center">
                                                    <Plus size={28} strokeWidth={3} />
                                                </div>
                                            </motion.button>
                                        </div>
                                    )
                                }

                                if (item.type === 'menu') {
                                    return (
                                        <button key="menu-btn" onClick={() => setMenuOpen(true)}
                                            className="flex flex-col items-center justify-center flex-1 gap-1 h-full py-1">
                                            <Menu size={20} strokeWidth={2} className="text-white/60" />
                                            <span className="text-[10px] font-bold text-white/50 uppercase tracking-tighter">{item.label}</span>
                                        </button>
                                    )
                                }

                                const active = pathname === item.href
                                const Icon = item.icon!
                                return (
                                    <Link key={item.href} href={item.href!}
                                        className="flex flex-col items-center justify-center flex-1 gap-1 h-full py-1 transition-all"
                                        style={{ color: active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.5)' }}>
                                        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                                        <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </nav>
        </>
    )
}
