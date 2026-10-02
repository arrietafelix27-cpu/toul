'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Home, Package, Boxes, Wallet, Receipt, TrendingDown, Users, Truck,
    Sparkles, BarChart3, Settings, Menu, ChevronRight, Plus, ShieldCheck, LockKeyhole,
} from 'lucide-react'
import { usePendingApprovalsCount } from '@/lib/isla/useSession'
import { FullscreenToggle } from './FullscreenToggle'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion'

/* ══════════════════════════════════════════════════════════════
   Navegación de TOUL.
   En PC: barra lateral fija. En celular: barra inferior con un
   panel "Más" que se arrastra para cerrar.
   La marca activa se desliza entre opciones en vez de prenderse
   y apagarse: así se sabe de dónde se viene y a dónde se va.
   ══════════════════════════════════════════════════════════════ */

const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
const SPRING_SLIDE = { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.7 }

const NAV_CSS = `
.nav-row { position: relative; display: flex; align-items: center; gap: 11px; height: 36px; padding: 0 10px; border-radius: 10px; text-decoration: none; font-size: 14px; letter-spacing: -0.01em; }
.nav-row > * { position: relative; z-index: 1; }
.nav-row-hover::before {
    content: ''; position: absolute; inset: 0; border-radius: 10px;
    background: rgba(255,255,255,0.055); opacity: 0;
    transition: opacity 160ms cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-row-hover:hover::before { opacity: 1; }
.nav-group { background: var(--toul-surface); border: 1px solid var(--toul-border); border-radius: 18px; overflow: hidden; }
.nav-group > a + a { border-top: 1px solid var(--toul-divider); }
`

// Contador de solicitudes pendientes (modo isla)
function CountBadge({ count }: { count: number }) {
    if (!count) return null
    return (
        <motion.span
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_PRESS}
            style={{
                minWidth: 19, height: 19, padding: '0 6px', borderRadius: 999,
                background: 'var(--toul-error)', color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {count > 9 ? '9+' : count}
        </motion.span>
    )
}

const ISLA_SECTION = {
    label: 'Isla',
    items: [
        { href: '/aprobaciones', icon: ShieldCheck, label: 'Aprobaciones', badge: true },
        { href: '/turnos', icon: LockKeyhole, label: 'Turnos de caja' },
    ],
}

// ── Barra lateral (PC) ─────────────────────────────────────────────────────
const NAV_SECTIONS = [
    { label: 'Mi negocio', items: [{ href: '/', icon: Home, label: 'Inicio' }] },
    {
        label: 'Operaciones',
        items: [
            { href: '/products', icon: Package, label: 'Catálogo' },
            { href: '/inventory', icon: Boxes, label: 'Inventario' },
            { href: '/cash', icon: Wallet, label: 'Caja' },
            { href: '/ventas', icon: Receipt, label: 'Ventas' },
        ],
    },
    ISLA_SECTION,
    {
        label: 'Personas',
        items: [
            { href: '/customers', icon: Users, label: 'Clientes' },
            { href: '/providers', icon: Truck, label: 'Proveedores' },
        ],
    },
    {
        label: 'Inteligencia',
        items: [
            { href: '/toul-ai', icon: Sparkles, label: 'TOUL AI' },
            { href: '/reportes', icon: BarChart3, label: 'Reportes' },
        ],
    },
]

/** Una opción está activa también dentro de sus pantallas de detalle. */
function matchPath(pathname: string, href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
}

function SidebarRow({ href, Icon, label, badge, active }: {
    href: string; Icon: typeof Home; label: string; badge: number; active: boolean
}) {
    return (
        <Link href={href} className="nav-row nav-row-hover"
            style={{
                color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                fontWeight: active ? 600 : 500,
                transition: 'color 160ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
            {active && (
                <motion.span
                    layoutId="sidebar-active"
                    transition={SPRING_SLIDE}
                    style={{ position: 'absolute', inset: 0, zIndex: 0, borderRadius: 10, background: 'var(--toul-accent-dim)' }}
                />
            )}
            <Icon size={16.5} strokeWidth={active ? 2.3 : 1.9} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            <CountBadge count={badge} />
        </Link>
    )
}

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(true)

    return (
        <aside
            className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 z-40"
            style={{
                background: 'rgba(255,255,255,0.022)',
                borderRight: '1px solid var(--toul-border)',
                backdropFilter: 'blur(40px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
            }}>
            <style>{NAV_CSS}</style>

            {/* Marca */}
            <div className="flex items-center gap-2.5 pl-5 pr-3" style={{ height: 64, flexShrink: 0 }}>
                <div className="flex items-center justify-center"
                    style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--toul-accent)', boxShadow: '0 2px 12px var(--toul-accent-glow)' }}>
                    <span style={{ color: '#000', fontWeight: 800, fontSize: 13 }}>T</span>
                </div>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', flex: 1 }}>TOUL</span>
                <FullscreenToggle />
            </div>

            {/* Acción principal */}
            <div className="px-3 pb-3" style={{ flexShrink: 0 }}>
                <motion.button
                    onClick={() => router.push('/caja')}
                    whileTap={{ scale: 0.975 }}
                    whileHover={{ y: -1 }}
                    transition={SPRING_PRESS}
                    className="w-full flex items-center justify-center gap-2"
                    style={{
                        background: 'var(--toul-accent)', color: '#000',
                        height: 40, borderRadius: 12, border: 'none',
                        fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                        cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: '0 2px 18px var(--toul-accent-glow)',
                    }}>
                    <Plus size={16} strokeWidth={2.6} />
                    Nueva venta
                </motion.button>
            </div>

            {/* Secciones */}
            <nav className="flex-1 px-3 overflow-y-auto" style={{ paddingBottom: 8 }}>
                {NAV_SECTIONS.map(section => (
                    <div key={section.label} style={{ marginBottom: 14 }}>
                        <p style={{
                            fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
                            color: 'var(--toul-text-faint)', margin: '0 0 4px 10px',
                        }}>
                            {section.label}
                        </p>
                        {section.items.map(({ href, icon: Icon, label, ...rest }) => (
                            <SidebarRow
                                key={href}
                                href={href} Icon={Icon} label={label}
                                active={matchPath(pathname, href)}
                                badge={'badge' in rest && rest.badge ? pendingApprovals : 0}
                            />
                        ))}
                    </div>
                ))}
            </nav>

            {/* Ajustes */}
            <div className="px-3 pb-4 pt-3" style={{ borderTop: '1px solid var(--toul-border)', flexShrink: 0 }}>
                <SidebarRow href="/settings" Icon={Settings} label="Ajustes" badge={0} active={matchPath(pathname, '/settings')} />
            </div>
        </aside>
    )
}

// ── Barra inferior (celular) ───────────────────────────────────────────────

const MOBILE_NAV = [
    { href: '/', icon: Home, label: 'Inicio' },
    { href: '/products', icon: Package, label: 'Catálogo' },
    { type: 'pos' as const },
    { href: '/cash', icon: Wallet, label: 'Caja' },
    { type: 'menu' as const, icon: Menu, label: 'Más' },
]

const MENU_SECTIONS = [
    {
        label: 'Operaciones',
        items: [
            { href: '/inventory', icon: Boxes, label: 'Inventario' },
            { href: '/ventas', icon: Receipt, label: 'Ventas' },
            { href: '/expenses', icon: TrendingDown, label: 'Gastos' },
        ],
    },
    ISLA_SECTION,
    {
        label: 'Personas',
        items: [
            { href: '/customers', icon: Users, label: 'Clientes' },
            { href: '/providers', icon: Truck, label: 'Proveedores' },
        ],
    },
    {
        label: 'Inteligencia',
        items: [
            { href: '/toul-ai', icon: Sparkles, label: 'TOUL AI' },
            { href: '/reportes', icon: BarChart3, label: 'Reportes' },
        ],
    },
    {
        label: 'Sistema',
        items: [{ href: '/settings', icon: Settings, label: 'Ajustes' }],
    },
]

export function BottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(true)
    const dragControls = useDragControls()

    // Mientras el panel está abierto la pantalla de atrás no se mueve
    useEffect(() => {
        if (!menuOpen) return
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [menuOpen])

    // Arrastrar hacia abajo cierra, igual que una hoja de iOS
    const handleDragEnd = (_: unknown, info: PanInfo) => {
        if (info.offset.y > 110 || info.velocity.y > 520) setMenuOpen(false)
    }

    return (
        <>
            <style>{NAV_CSS}</style>

            {/* ── Fondo ── */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="fixed inset-0 z-50 md:hidden"
                        style={{
                            background: 'rgba(0,0,0,0.45)',
                            backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
                        }}
                        onClick={() => setMenuOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* ── Panel "Más" ── */}
            <AnimatePresence>
                {menuOpen && (
                    <motion.div
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 32, stiffness: 300, mass: 0.9 }}
                        drag="y"
                        dragListener={false}
                        dragControls={dragControls}
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.5 }}
                        onDragEnd={handleDragEnd}
                        className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
                        style={{
                            maxHeight: '86dvh', display: 'flex', flexDirection: 'column',
                            background: 'var(--toul-surface-overlay)',
                            borderTop: '1px solid rgba(255,255,255,0.09)',
                            borderTopLeftRadius: 28, borderTopRightRadius: 28,
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.55)',
                        }}>

                        {/* Agarradera */}
                        <div
                            onPointerDown={event => dragControls.start(event)}
                            className="flex justify-center"
                            style={{ padding: '11px 0 7px', flexShrink: 0, cursor: 'grab', touchAction: 'none' }}>
                            <div style={{ width: 38, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.2)' }} />
                        </div>

                        <div style={{
                            overflowY: 'auto', overscrollBehavior: 'contain', touchAction: 'pan-y',
                            padding: '4px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
                        }}>
                            {MENU_SECTIONS.map((section, si) => (
                                <motion.div
                                    key={section.label}
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.26, delay: 0.04 + si * 0.035, ease: [0, 0, 0.2, 1] }}
                                    style={{ marginBottom: 14 }}>
                                    <p style={{
                                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em',
                                        color: 'var(--toul-text-faint)', margin: '0 0 7px 14px',
                                    }}>
                                        {section.label}
                                    </p>

                                    {/* Lista agrupada: un solo bloque, filas separadas por una línea */}
                                    <div className="nav-group">
                                        {section.items.map(({ href, icon: Icon, label, ...rest }) => {
                                            const active = matchPath(pathname, href)
                                            const badge = 'badge' in rest && rest.badge ? pendingApprovals : 0
                                            return (
                                                <Link
                                                    key={href}
                                                    href={href}
                                                    onClick={() => setMenuOpen(false)}
                                                    className="flex items-center gap-3"
                                                    style={{
                                                        padding: '10px 14px', textDecoration: 'none',
                                                        background: active ? 'var(--toul-surface-focused)' : 'transparent',
                                                        color: active ? 'var(--toul-accent)' : 'var(--toul-text)',
                                                    }}>
                                                    <span style={{
                                                        width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: active ? 'var(--toul-accent-dim)' : 'rgba(255,255,255,0.055)',
                                                    }}>
                                                        <Icon size={16.5} strokeWidth={active ? 2.3 : 1.9}
                                                            color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.72)'} />
                                                    </span>
                                                    <span style={{ fontSize: 15, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em', flex: 1 }}>
                                                        {label}
                                                    </span>
                                                    <CountBadge count={badge} />
                                                    <ChevronRight size={15} color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.22)'} />
                                                </Link>
                                            )
                                        })}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Barra inferior ── */}
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
                        borderTopLeftRadius: 22, borderTopRightRadius: 22,
                    }}>
                    {MOBILE_NAV.map(item => {
                        if (item.type === 'pos') {
                            return (
                                <div key="pos-center" className="flex items-center justify-center" style={{ width: 64 }}>
                                    <motion.button
                                        onClick={() => router.push('/caja')}
                                        whileTap={{ scale: 0.94 }}
                                        transition={SPRING_PRESS}
                                        className="flex items-center justify-center"
                                        style={{
                                            width: 56, height: 56, marginTop: -12, borderRadius: '50%',
                                            background: 'var(--toul-accent)', color: '#000', border: 'none', cursor: 'pointer',
                                            boxShadow: '0 8px 28px rgba(50,215,75,0.45), 0 2px 8px rgba(0,0,0,0.35)',
                                        }}>
                                        <Plus size={26} strokeWidth={2.8} color="#000" />
                                    </motion.button>
                                </div>
                            )
                        }

                        const isMenu = item.type === 'menu'
                        const active = isMenu ? menuOpen : matchPath(pathname, item.href!)
                        const Icon = item.icon!
                        const tint = active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.45)'

                        const inner = (
                            <>
                                <div style={{
                                    width: 34, height: 30, borderRadius: 10, position: 'relative',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {active && (
                                        <motion.span
                                            layoutId="bottomnav-active"
                                            transition={SPRING_SLIDE}
                                            style={{ position: 'absolute', inset: 0, borderRadius: 10, background: 'var(--toul-accent-dim)' }}
                                        />
                                    )}
                                    {isMenu && pendingApprovals > 0 && (
                                        <span style={{
                                            position: 'absolute', top: 1, right: 2, width: 8, height: 8, borderRadius: '50%',
                                            background: 'var(--toul-error)', boxShadow: '0 0 0 2px rgba(10,10,10,0.9)', zIndex: 2,
                                        }} />
                                    )}
                                    <Icon size={20} strokeWidth={active ? 2.3 : 1.9} color={tint}
                                        style={{ position: 'relative', zIndex: 1, transition: 'color 160ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                </div>
                                <span style={{
                                    fontSize: 10, fontWeight: 500, letterSpacing: '0.01em', color: tint,
                                    transition: 'color 160ms cubic-bezier(0.4, 0, 0.2, 1)',
                                }}>
                                    {item.label}
                                </span>
                            </>
                        )

                        return isMenu ? (
                            <motion.button
                                key="menu-btn"
                                onClick={() => setMenuOpen(true)}
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                className="flex flex-col items-center justify-center flex-1"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', gap: 3, padding: '8px 4px' }}>
                                {inner}
                            </motion.button>
                        ) : (
                            <motion.div key={item.href} whileTap={{ scale: 0.92 }} transition={SPRING_PRESS} className="flex-1">
                                <Link href={item.href!} className="flex flex-col items-center justify-center"
                                    style={{ gap: 3, padding: '8px 4px', textDecoration: 'none' }}>
                                    {inner}
                                </Link>
                            </motion.div>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}
