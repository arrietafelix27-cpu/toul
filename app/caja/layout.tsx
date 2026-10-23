'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag, ReceiptText, LockKeyhole, LayoutDashboard, LogOut, Printer, ChevronDown, X } from 'lucide-react'
import { POSProvider } from '@/components/pos/POSContext'
import { CajaContext } from '@/components/isla/CajaContext'
import { useOpenCashSession, useSessionContext } from '@/lib/isla/useSession'
import { useOfflineSales } from '@/lib/isla/useOffline'
import { cacheStoreInfo } from '@/lib/isla/offline'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { OfflineBar } from '@/components/isla/OfflineBar'
import { createClient } from '@/lib/supabase/client'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'

const TABS = [
    { href: '/caja', label: 'Vender', short: 'Vender', icon: ShoppingBag },
    { href: '/caja/ventas', label: 'Ventas del turno', short: 'Ventas', icon: ReceiptText },
    { href: '/caja/cierre', label: 'Cerrar turno', short: 'Cierre', icon: LockKeyhole },
]

/** Las iniciales de quien atiende, para el círculo del celular */
function iniciales(nombre: string) {
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·'
}

const AUTO_PRINT_KEY = 'toul-caja-autoprint'

/* En el celular la barra no cabía: el botón de salir quedaba por fuera
   de la pantalla y el logo se montaba sobre las pestañas. Ahí se arma
   distinto: salir a la izquierda, las tres pestañas como un control
   segmentado con nombres cortos, y la persona como un círculo. */
const CSS = `
.cj-head { flex-shrink: 0; display: flex; align-items: center; gap: 16px; padding: 10px 16px;
    background: rgba(10,10,10,0.85); backdrop-filter: blur(40px) saturate(1.6); -webkit-backdrop-filter: blur(40px) saturate(1.6);
    border-bottom: 1px solid var(--toul-border); position: relative; z-index: 20; }
.cj-tabs { display: flex; gap: 6px; flex: 1; justify-content: center; min-width: 0; }
.cj-tab { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; height: 46px;
    border-radius: 14px; font-size: 15px; text-decoration: none; white-space: nowrap; transition: color var(--toul-transition); }
.cj-corto, .cj-salir-movil { display: none; }
.cj-quien-texto { text-align: left; }
.cj-menu-estado { display: none; }
@media (max-width: 767px) {
    .cj-head { gap: 8px; padding: 8px 12px; }
    .cj-marca[data-admin="1"] { display: none !important; }
    .cj-salir-btn { width: 40px !important; height: 40px !important; border-radius: 13px !important; }
    .cj-salir-movil { display: flex; }
    .cj-salir-pc { display: none; }
    .cj-tabs { gap: 0; padding: 3px; border-radius: 14px; background: var(--toul-surface); border: 1px solid var(--toul-border); }
    .cj-tab { flex: 1; padding: 0 6px; height: 36px; border-radius: 11px; font-size: 14px; }
    .cj-tab-icono, .cj-largo { display: none; }
    .cj-corto { display: inline; }
    .cj-quien { width: 40px; height: 40px !important; padding: 0 !important; justify-content: center; border-radius: 50% !important; }
    .cj-quien-texto, .cj-quien-flecha { display: none; }
    .cj-menu-estado { display: block; }
}
`

function Spinner() {
    return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-bg)' }}>
            <div style={{ width: 26, height: 26, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    )
}

export default function CajaLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { data: ctx, isLoading } = useSessionContext()
    const { data: session, isLoading: sessionLoading, mutate: refreshSession } = useOpenCashSession(ctx?.storeId)
    const [autoPrint, setAutoPrint] = useState(true)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const offline = useOfflineSales(ctx?.storeId)

    useEffect(() => {
        try {
            const stored = localStorage.getItem(AUTO_PRINT_KEY)
            if (stored !== null) setAutoPrint(stored === '1')
        } catch { /* almacenamiento bloqueado: se usa el valor por defecto */ }
    }, [])

    // La caja debe abrir aunque no haya internet, y la tirilla necesita
    // los datos del negocio guardados en el computador
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* sin soporte */ })
        }
    }, [])

    useEffect(() => {
        const storeId = ctx?.storeId
        if (!storeId) return
        createClient().from('stores').select('name, nit, address, phone, receipt_footer').eq('id', storeId).single()
            .then(({ data }) => { if (data) cacheStoreInfo(storeId, data) })
    }, [ctx?.storeId])

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

    // Cerrar sesión pasa por un solo lugar: carga lo pendiente, avisa si
    // algo no se pudo cargar y no deja nada de la cuenta en el equipo
    const { cerrar: logout, dialogo: dialogoSalir } = useCerrarSesion(ctx?.storeId)

    const value = useMemo(() => ctx ? ({
        ctx, session: session ?? null, sessionLoading, refreshSession, autoPrint,
    }) : null, [ctx, session, sessionLoading, refreshSession, autoPrint])

    if (isLoading || !value) return <Spinner />

    const openedAt = session ? new Date(session.opened_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : null
    const estadoTurno = session ? `Turno desde ${openedAt}` : 'Sin turno abierto'

    return (
        <CajaContext.Provider value={value}>
            {dialogoSalir}
            <POSProvider>
                <style>{CSS}</style>
                <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--toul-bg)', overflow: 'hidden' }}>
                    {/* ── Barra superior ───────────────────────────── */}
                    <header className="cj-head">
                        {ctx!.role === 'admin' && <SalirDeCaja className="cj-salir-movil" />}
                        <div className="cj-marca" data-admin={ctx!.role === 'admin' ? '1' : '0'} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 0 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--toul-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                                <span style={{ color: '#000', fontWeight: 800, fontSize: 15 }}>T</span>
                            </div>
                            <div style={{ minWidth: 0 }} className="hidden lg:block">
                                <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ctx!.storeName}</p>
                                <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Caja</p>
                            </div>
                        </div>

                        <nav className="cj-tabs">
                            {TABS.map(tab => {
                                const active = pathname === tab.href
                                return (
                                    <Link key={tab.href} href={tab.href} className="cj-tab" aria-current={active ? 'page' : undefined} style={{
                                        fontWeight: active ? 600 : 500,
                                        color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                    }}>
                                        {active && (
                                            <motion.span layoutId="caja-tab" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                                                style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--toul-surface-focused)', border: '1px solid var(--toul-border-focused)' }} />
                                        )}
                                        <tab.icon size={18} strokeWidth={active ? 2.3 : 2} className="cj-tab-icono" style={{ position: 'relative' }} />
                                        <span style={{ position: 'relative' }} className="cj-largo hidden md:inline">{tab.label}</span>
                                        <span style={{ position: 'relative' }} className="cj-corto">{tab.short}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                            <motion.button onClick={() => setMenuOpen(o => !o)} whileTap={{ scale: 0.97 }} transition={SPRING_PRESS}
                                className="cj-quien" aria-label={`${ctx!.displayName} · ${estadoTurno}`} aria-expanded={menuOpen}
                                style={{
                                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, height: 46, padding: '0 12px 0 14px', borderRadius: 14, cursor: 'pointer',
                                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text)', fontFamily: 'inherit',
                                }}>
                                <span className="cj-quien-texto" aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: session ? 'var(--toul-accent)' : 'var(--toul-text-faint)', boxShadow: session ? '0 0 10px var(--toul-accent-glow)' : 'none' }} />
                                <span className="cj-quien-texto">
                                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{ctx!.displayName}</span>
                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--toul-text-dim)', lineHeight: 1.2 }}>{estadoTurno}</span>
                                </span>
                                {/* Celular: iniciales con el punto del turno encima */}
                                <span className="cj-corto" aria-hidden style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '0.02em' }}>{iniciales(ctx!.displayName)}</span>
                                <span className="cj-corto" aria-hidden style={{
                                    position: 'absolute', top: 1, right: 1, width: 10, height: 10, borderRadius: '50%',
                                    background: session ? 'var(--toul-accent)' : 'var(--toul-text-faint)', boxShadow: '0 0 0 2px var(--toul-bg)',
                                }} />
                                <ChevronDown size={15} className="cj-quien-flecha" style={{ color: 'var(--toul-text-dim)', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms var(--toul-ease)' }} />
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
                                        {/* En el celular el nombre no cabe en la barra: va aquí */}
                                        <div className="cj-menu-estado" style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--toul-divider)', marginBottom: 4 }}>
                                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{ctx!.displayName}</p>
                                            <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>{estadoTurno}</p>
                                        </div>
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
                        {ctx!.role === 'admin' && <SalirDeCaja className="cj-salir-pc" />}
                    </header>

                    <OfflineBar offline={offline} />

                    <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {children}
                    </main>
                </div>
            </POSProvider>
        </CajaContext.Provider>
    )
}

/** Volver al panel del administrador. En PC va a la derecha; en el
 *  celular, a la izquierda, donde se busca para salir */
function SalirDeCaja({ className }: { className: string }) {
    return (
        <motion.div whileTap={{ scale: 0.94 }} transition={SPRING_PRESS} className={className} style={{ flexShrink: 0 }}>
            <Link href="/" aria-label="Salir de la caja" title="Salir de la caja" className="cj-salir-btn"
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 46, height: 46, borderRadius: 14, textDecoration: 'none',
                    background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
                    color: 'var(--toul-text-muted)',
                    transition: 'background var(--toul-transition), color var(--toul-transition)',
                }}>
                <X size={19} strokeWidth={2.2} />
            </Link>
        </motion.div>
    )
}

const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 46, borderRadius: 11,
    background: 'transparent', border: 'none', color: 'var(--toul-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
}
