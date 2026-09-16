'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag, ReceiptText, LockKeyhole, LayoutDashboard, LogOut, Printer, ChevronDown } from 'lucide-react'
import { POSProvider } from '@/components/pos/POSContext'
import { CajaContext } from '@/components/isla/CajaContext'
import { useOpenCashSession, useSessionContext } from '@/lib/isla/useSession'
import { createClient } from '@/lib/supabase/client'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'

const TABS = [
    { href: '/caja', label: 'Vender', icon: ShoppingBag },
    { href: '/caja/ventas', label: 'Ventas del turno', icon: ReceiptText },
    { href: '/caja/cierre', label: 'Cerrar turno', icon: LockKeyhole },
]

const AUTO_PRINT_KEY = 'toul-caja-autoprint'

function Spinner() {
    return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-bg)' }}>
            <div style={{ width: 26, height: 26, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    )
}

export default function CajaLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { data: ctx, isLoading } = useSessionContext()
    const { data: session, isLoading: sessionLoading, mutate: refreshSession } = useOpenCashSession(ctx?.storeId)
    const [autoPrint, setAutoPrint] = useState(true)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(AUTO_PRINT_KEY)
            if (stored !== null) setAutoPrint(stored === '1')
        } catch { /* almacenamiento bloqueado: se usa el valor por defecto */ }
    }, [])

    useEffect(() => {
        if (!menuOpen) return
        const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
        window.addEventListener('pointerdown', onDown)
        return () => window.removeEventListener('pointerdown', onDown)
    }, [menuOpen])

    const toggleAutoPrint = () => {
        setAutoPrint(prev => {
            try { localStorage.setItem(AUTO_PRINT_KEY, prev ? '0' : '1') } catch { /* sin almacenamiento */ }
            return !prev
        })
    }

    const logout = async () => {
        await createClient().auth.signOut()
        router.replace('/login')
    }

    const value = useMemo(() => ctx ? ({
        ctx, session: session ?? null, sessionLoading, refreshSession, autoPrint,
    }) : null, [ctx, session, sessionLoading, refreshSession, autoPrint])

    if (isLoading || !value) return <Spinner />

    const openedAt = session ? new Date(session.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null

    return (
        <CajaContext.Provider value={value}>
            <POSProvider>
                <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--toul-bg)', overflow: 'hidden' }}>
                    {/* ── Barra superior ───────────────────────────── */}
                    <header style={{
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px',
                        background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(40px) saturate(1.6)', WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
                        borderBottom: '1px solid var(--toul-border)', position: 'relative', zIndex: 20,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--toul-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                                <span style={{ color: '#000', fontWeight: 800, fontSize: 15 }}>T</span>
                            </div>
                            <div style={{ minWidth: 0 }} className="hidden lg:block">
                                <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctx!.storeName}</p>
                                <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Caja</p>
                            </div>
                        </div>

                        <nav style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
                            {TABS.map(tab => {
                                const active = pathname === tab.href
                                return (
                                    <Link key={tab.href} href={tab.href} style={{
                                        position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 46, borderRadius: 14,
                                        fontSize: 15, fontWeight: active ? 600 : 500, textDecoration: 'none', whiteSpace: 'nowrap',
                                        color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                        transition: 'color var(--toul-transition)',
                                    }}>
                                        {active && (
                                            <motion.span layoutId="caja-tab" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                                style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'var(--toul-surface-focused)', border: '1px solid var(--toul-border-focused)' }} />
                                        )}
                                        <tab.icon size={18} strokeWidth={active ? 2.3 : 2} style={{ position: 'relative' }} />
                                        <span style={{ position: 'relative' }} className="hidden md:inline">{tab.label}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                            <motion.button onClick={() => setMenuOpen(o => !o)} whileTap={{ scale: 0.97 }} transition={SPRING_PRESS}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 12px 0 14px', borderRadius: 14, cursor: 'pointer',
                                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text)', fontFamily: 'inherit',
                                }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: session ? 'var(--toul-accent)' : 'var(--toul-text-faint)', boxShadow: session ? '0 0 10px var(--toul-accent-glow)' : 'none' }} />
                                <span style={{ textAlign: 'left' }}>
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{ctx!.displayName}</span>
                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--toul-text-dim)', lineHeight: 1.2 }}>
                                        {session ? `Turno desde ${openedAt}` : 'Sin turno abierto'}
                                    </span>
                                </span>
                                <ChevronDown size={15} style={{ color: 'var(--toul-text-dim)', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--toul-ease)' }} />
                            </motion.button>

                            <AnimatePresence>
                                {menuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                        transition={{ duration: 0.16, ease: EASE_OUT_EMIL }}
                                        style={{
                                            position: 'absolute', right: 0, top: 54, width: 250, padding: 6, borderRadius: 16, transformOrigin: 'top right',
                                            background: 'var(--toul-surface-overlay)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                        }}>
                                        <button onClick={toggleAutoPrint} style={menuItemStyle}>
                                            <Printer size={17} />
                                            <span style={{ flex: 1, textAlign: 'left' }}>Tirilla automática</span>
                                            <span style={{ width: 38, height: 22, borderRadius: 999, padding: 2, background: autoPrint ? 'var(--toul-accent)' : 'rgba(255,255,255,0.14)', transition: 'background 180ms var(--toul-ease)', display: 'flex' }}>
                                                <span style={{ width: 18, height: 18, borderRadius: '50%', background: autoPrint ? '#000' : '#fff', transform: autoPrint ? 'translateX(16px)' : 'none', transition: 'transform 180ms var(--toul-ease)' }} />
                                            </span>
                                        </button>
                                        {ctx!.role === 'admin' && (
                                            <Link href="/" style={{ ...menuItemStyle, textDecoration: 'none' }}>
                                                <LayoutDashboard size={17} /> <span style={{ flex: 1 }}>Panel de administrador</span>
                                            </Link>
                                        )}
                                        <div style={{ height: 1, background: 'var(--toul-divider)', margin: '4px 6px' }} />
                                        <button onClick={logout} style={{ ...menuItemStyle, color: 'var(--toul-error)' }}>
                                            <LogOut size={17} /> <span style={{ flex: 1, textAlign: 'left' }}>Cerrar sesión</span>
                                        </button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </header>

                    <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {children}
                    </main>
                </div>
            </POSProvider>
        </CajaContext.Provider>
    )
}

const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 46, borderRadius: 11,
    background: 'transparent', border: 'none', color: 'var(--toul-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
}
