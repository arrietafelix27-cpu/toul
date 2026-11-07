'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ShoppingBag, ReceiptText, Receipt, LockKeyhole, LayoutDashboard, LogOut, Printer, X, WifiOff, CloudUpload, AlertTriangle, LockKeyholeOpen } from 'lucide-react'
import { POSProvider } from '@/components/pos/POSContext'
import { CajaContext, type BotonesComprobante } from '@/components/isla/CajaContext'
import { OpenSessionCard } from '@/components/isla/OpenSessionCard'
import { Sheet } from '@/components/isla/Sheet'
import { useOpenCashSession, useSessionContext } from '@/lib/isla/useSession'
import { useOfflineSales, type OfflineState } from '@/lib/isla/useOffline'
import { cacheStoreInfo, getCachedStoreInfo, type CachedStoreInfo } from '@/lib/isla/offline'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { permisosDe } from '@/lib/pos/permisos'
import { tirillaAutomaticaInicial } from '@/lib/pos/comprobante'
import { createClient } from '@/lib/supabase/client'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'
import { RegistrarMovimiento } from '@/components/movimientos/RegistrarMovimiento'

const TABS = [
    { href: '/caja', label: 'Vender', short: 'Vender', icon: ShoppingBag },
    { href: '/caja/ventas', label: 'Ventas del turno', short: 'Ventas', icon: ReceiptText },
    { href: '/caja/cierre', label: 'Cerrar turno', short: 'Cierre', icon: LockKeyhole },
]

// En el plan Básico no hay turnos: ni cierre, ni estado del turno
const TABS_BASICO = [
    TABS[0],
    { ...TABS[1], label: 'Ventas de hoy' },
]

/* El plan llega con los datos del negocio: el equipo lo recuerda para
   no mostrar los turnos y quitarlos de golpe (y para cuando no hay internet) */
const PLAN_KEY = 'toul-caja-plan:'

/** Las iniciales de quien atiende, para el círculo */
function iniciales(nombre: string) {
    const partes = nombre.trim().split(/\s+/).filter(Boolean)
    return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '·'
}

const AUTO_PRINT_KEY = 'toul-caja-autoprint'

/* Una barra: marca, pestañas al centro y a la derecha el turno, la
   conexión y quien atiende. En el celular las pestañas son un control
   segmentado con nombres cortos, el turno vive en el círculo de la
   persona y la conexión queda como un ícono con el número. */
const CSS = `
.cj-head { flex-shrink: 0; display: flex; align-items: center; gap: 14px; padding: 10px 16px;
    padding-top: calc(10px + env(safe-area-inset-top, 0px));
    background: rgba(10,10,10,0.85); backdrop-filter: blur(40px) saturate(1.6); -webkit-backdrop-filter: blur(40px) saturate(1.6);
    border-bottom: 1px solid var(--toul-border); position: relative; z-index: 20; }
.cj-tabs { display: flex; gap: 2px; padding: 4px; border-radius: 16px; background: var(--toul-surface); min-width: 0; }
.cj-tab { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 16px; height: 40px;
    border-radius: 12px; font-size: 14.5px; text-decoration: none; white-space: nowrap; transition: color 200ms var(--toul-ease-emil);
    -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
.cj-pill { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: 999px; flex-shrink: 0;
    font-size: 13px; font-weight: 500; white-space: nowrap; font-family: inherit; border: none; text-decoration: none;
    background: var(--toul-surface); color: var(--toul-text-muted); cursor: default;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
button.cj-pill, a.cj-pill { cursor: pointer; transition: transform 120ms var(--toul-ease-emil), background 160ms ease; }
button.cj-pill:active, a.cj-pill:active { transform: scale(0.96); }
.cj-corto, .cj-salir-movil, .cj-solo-movil { display: none; }
/* Reducir movimiento: en la caja solo cambian colores y transparencias */
@media (prefers-reduced-motion: reduce) {
    .cj-raiz *, .cj-raiz *::before, .cj-raiz *::after {
        transition-property: color, background-color, border-color, opacity, box-shadow !important;
    }
    .cj-raiz .cj-press, .cj-raiz .pos-press { transform: none !important; }
}
@media (max-width: 767px) {
    .cj-head { gap: 8px; padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top, 0px)); }
    .cj-marca[data-admin="1"] { display: none !important; }
    .cj-salir-btn { width: 40px !important; height: 40px !important; }
    .cj-salir-movil { display: flex; }
    .cj-salir-pc, .cj-solo-pc { display: none !important; }
    .cj-solo-movil { display: inline-flex; }
    .cj-tabs { flex: 1; padding: 3px; border-radius: 14px; }
    .cj-tab { flex: 1; padding: 0 6px; height: 34px; border-radius: 11px; font-size: 14px; }
    .cj-tab-icono, .cj-largo { display: none; }
    .cj-corto { display: inline; }
    .cj-pill { height: 40px; padding: 0 11px; gap: 5px; }
}
`

function Spinner() {
    return (
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-bg)' }}>
            <div style={{ width: 26, height: 26, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    )
}

const botonesDe = (v: unknown): BotonesComprobante => v === 'whatsapp' || v === 'tirilla' ? v : 'ambos'

export default function CajaLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const { data: ctx, isLoading } = useSessionContext()
    const { data: session, isLoading: sessionLoading, mutate: refreshSession } = useOpenCashSession(ctx?.storeId)
    // Apagada hasta saber qué equipo es (ver abajo)
    const [autoPrint, setAutoPrint] = useState(false)
    // Los datos del negocio llegan del servidor; mientras tanto (o sin
    // internet) vale lo último guardado en el equipo
    const [servidor, setServidor] = useState<{ storeId: string; plan: string; info: CachedStoreInfo } | null>(null)
    const [menuOpen, setMenuOpen] = useState(false)
    const [abrirTurnoOpen, setAbrirTurnoOpen] = useState(false)
    // Un gasto desde la caja: solo con el permiso "Registrar gastos"
    const [gastoOpen, setGastoOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const offline = useOfflineSales(ctx?.storeId)

    // Tirilla automática: lo que este equipo eligió en el menú; si nunca
    // eligió, prendida en el computador y apagada en el celular
    useEffect(() => {
        let stored: string | null = null
        try { stored = localStorage.getItem(AUTO_PRINT_KEY) } catch { /* almacenamiento bloqueado */ }
        const esCelular = typeof window.matchMedia === 'function' && window.matchMedia('(hover: none) and (pointer: coarse)').matches
        setAutoPrint(tirillaAutomaticaInicial(stored, esCelular))
    }, [])

    // La caja debe abrir aunque no haya internet, y la tirilla necesita
    // los datos del negocio guardados en el computador
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* sin soporte */ })
        }
    }, [])

    const tiendaId = ctx?.storeId
    const guardado = useMemo(() => {
        if (!tiendaId) return { plan: null, info: null }
        let plan: string | null = null
        try { plan = localStorage.getItem(PLAN_KEY + tiendaId) } catch { /* sin almacenamiento */ }
        return { plan, info: getCachedStoreInfo(tiendaId) }
    }, [tiendaId])
    const delServidor = servidor && servidor.storeId === tiendaId ? servidor : null
    const plan = delServidor ? delServidor.plan : guardado.plan
    const tienda = delServidor ? delServidor.info : guardado.info

    useEffect(() => {
        const storeId = ctx?.storeId
        if (!storeId) return
        // select('*'): los permisos y los botones del comprobante no existen
        // en la base hasta correr el SQL, y la caja tiene que abrir igual
        createClient().from('stores').select('*').eq('id', storeId).single()
            .then(({ data }) => {
                if (!data) return
                const fila = data as Record<string, unknown>
                const info: CachedStoreInfo = {
                    name: String(fila.name ?? ''),
                    nit: (fila.nit as string | null) ?? null,
                    address: (fila.address as string | null) ?? null,
                    phone: (fila.phone as string | null) ?? null,
                    receipt_footer: (fila.receipt_footer as string | null) ?? null,
                    receipt_buttons: (fila.receipt_buttons as string | null) ?? null,
                    seller_permissions: 'seller_permissions' in fila ? fila.seller_permissions : undefined,
                }
                const elPlan = String(fila.plan ?? 'basico')
                cacheStoreInfo(storeId, info)
                setServidor({ storeId, plan: elPlan, info })
                try { localStorage.setItem(PLAN_KEY + storeId, elPlan) } catch { /* sin almacenamiento */ }
            })
    }, [ctx?.storeId])

    useEffect(() => {
        if (!menuOpen) return
        const onDown = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
        window.addEventListener('pointerdown', onDown)
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('pointerdown', onDown)
            window.removeEventListener('keydown', onKey)
        }
    }, [menuOpen])

    const toggleAutoPrint = () => {
        setAutoPrint(prev => {
            try { localStorage.setItem(AUTO_PRINT_KEY, prev ? '0' : '1') } catch { /* sin almacenamiento */ }
            return !prev
        })
    }

    const abrirTurno = useCallback(() => { setMenuOpen(false); setAbrirTurnoOpen(true) }, [])
    const anotarGasto = useCallback(() => { setMenuOpen(false); setGastoOpen(true) }, [])
    const cerrarGasto = useCallback(() => setGastoOpen(false), [])

    // Cerrar sesión pasa por un solo lugar: carga lo pendiente, avisa si
    // algo no se pudo cargar y no deja nada de la cuenta en el equipo
    const { cerrar: logout, dialogo: dialogoSalir } = useCerrarSesion(ctx?.storeId)

    // Mientras no se sabe el plan se muestra la caja como siempre. Quien
    // vende con su propia cuenta siempre es de un plan Pro (el equipo es Pro)
    const isPro = plan !== 'basico' || ctx?.role === 'seller'
    const turno = isPro ? (session ?? null) : null
    const permisos = useMemo(() => permisosDe(ctx?.role ?? 'seller', tienda?.seller_permissions), [ctx?.role, tienda?.seller_permissions])
    const comprobante = botonesDe(tienda?.receipt_buttons)

    const value = useMemo(() => ctx ? ({
        ctx, session: turno, sessionLoading, refreshSession, autoPrint: autoPrint && isPro, isPro,
        permisos, comprobante, tienda, offline, abrirTurno,
    }) : null, [ctx, turno, sessionLoading, refreshSession, autoPrint, isPro, permisos, comprobante, tienda, offline, abrirTurno])

    if (isLoading || !value) return <Spinner />

    const openedAt = turno ? new Date(turno.opened_at).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : null
    // El turno abierto puede ser de otra persona: que se vea de quién es
    const ajeno = !!turno && turno.opened_by !== ctx!.userId
    const estadoTurno = !isPro ? null
        : !turno ? 'Sin turno abierto'
        : ajeno ? `Turno de ${turno.opened_by_name || 'otra persona'} · desde ${openedAt}`
        : `Turno desde ${openedAt}`
    const puntoTurno = !turno ? 'var(--toul-text-faint)' : ajeno ? 'var(--toul-warning)' : 'var(--toul-accent)'
    const tabs = isPro ? TABS : TABS_BASICO

    return (
        <CajaContext.Provider value={value}>
            {dialogoSalir}
            <POSProvider>
                <style>{CSS}</style>
                <div className="cj-raiz" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--toul-bg)', overflow: 'hidden' }}>
                    {/* ── Barra superior ───────────────────────────── */}
                    <header className="cj-head">
                        {ctx!.role === 'admin' && <SalirDeCaja className="cj-salir-movil" />}
                        <div className="cj-marca" data-admin={ctx!.role === 'admin' ? '1' : '0'} style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 0' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--toul-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ color: 'var(--toul-bg)', fontWeight: 800, fontSize: 15 }}>T</span>
                            </div>
                            <p className="hidden lg:block" style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                {ctx!.storeName}
                            </p>
                        </div>

                        <nav className="cj-tabs">
                            {tabs.map(tab => {
                                const active = pathname === tab.href
                                return (
                                    <Link key={tab.href} href={tab.href} className="cj-tab" aria-current={active ? 'page' : undefined} style={{
                                        fontWeight: active ? 600 : 500,
                                        color: active ? 'var(--toul-text)' : 'var(--toul-text-subtle)',
                                    }}>
                                        {active && (
                                            <motion.span layoutId="caja-tab" transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
                                                style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'var(--toul-surface-2)', boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset' }} />
                                        )}
                                        <tab.icon size={17} strokeWidth={active ? 2.2 : 1.9} className="cj-tab-icono" style={{ position: 'relative' }} />
                                        <span style={{ position: 'relative' }} className="cj-largo">{tab.label}</span>
                                        <span style={{ position: 'relative' }} className="cj-corto">{tab.short}</span>
                                    </Link>
                                )
                            })}
                        </nav>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flex: '1 1 0', minWidth: 0 }}>
                            {/* Turno: en el celular va en el círculo de la persona */}
                            {isPro && (turno ? (
                                <span className="cj-pill cj-solo-pc" title={ajeno ? 'Lo que vendas aquí no entra a ese turno ni a su cuadre' : undefined}>
                                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: puntoTurno }} />
                                    {ajeno ? `Turno de ${turno.opened_by_name || 'otra persona'}` : `Turno desde ${openedAt}`}
                                </span>
                            ) : (
                                <button className="cj-pill cj-solo-pc" onClick={abrirTurno}>
                                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: puntoTurno }} />
                                    Sin turno · <span style={{ color: 'var(--toul-accent)', fontWeight: 600 }}>Abrir</span>
                                </button>
                            ))}

                            <Conexion offline={offline} />

                            <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                                <motion.button onClick={() => setMenuOpen(o => !o)} whileTap={{ scale: 0.94 }} transition={SPRING_PRESS}
                                    aria-label={estadoTurno ? `${ctx!.displayName} · ${estadoTurno}` : ctx!.displayName} aria-expanded={menuOpen}
                                    style={{
                                        position: 'relative', width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', padding: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: menuOpen ? 'var(--toul-surface-2)' : 'var(--toul-surface)', border: 'none',
                                        color: 'var(--toul-text)', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 650,
                                        WebkitTapHighlightColor: 'transparent',
                                    }}>
                                    {iniciales(ctx!.displayName)}
                                    {/* Celular: el punto del turno encima */}
                                    {estadoTurno && <span className="cj-solo-movil" aria-hidden style={{
                                        position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: '50%',
                                        background: puntoTurno, boxShadow: '0 0 0 2px var(--toul-bg)',
                                    }} />}
                                </motion.button>

                                <AnimatePresence>
                                    {menuOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }}
                                            transition={{ duration: 0.16, ease: EASE_OUT_EMIL }}
                                            style={{
                                                position: 'absolute', right: 0, top: 48, width: 260, padding: 6, borderRadius: 16, transformOrigin: 'top right',
                                                background: 'var(--toul-surface-overlay)', border: '1px solid var(--toul-border)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                                            }}>
                                            <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--toul-divider)', marginBottom: 4 }}>
                                                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{ctx!.displayName}</p>
                                                {estadoTurno && <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>{estadoTurno}</p>}
                                            </div>
                                            {isPro && !turno && (
                                                <button onClick={abrirTurno} style={menuItemStyle}>
                                                    <LockKeyholeOpen size={17} /> <span style={{ flex: 1, textAlign: 'left' }}>Abrir turno</span>
                                                </button>
                                            )}
                                            {/* Sin internet no se puede: el gasto se guarda en el servidor */}
                                            {permisos.registrar_gastos === 'solo' && (
                                                <button onClick={anotarGasto} disabled={!offline.online}
                                                    style={{ ...menuItemStyle, opacity: offline.online ? 1 : 0.45, cursor: offline.online ? 'pointer' : 'default' }}>
                                                    <Receipt size={17} /> <span style={{ flex: 1, textAlign: 'left' }}>Gasto</span>
                                                    {!offline.online && <span style={{ fontSize: 12, color: 'var(--toul-text-dim)' }}>Sin internet</span>}
                                                </button>
                                            )}
                                            {isPro && (
                                                <button onClick={toggleAutoPrint} style={menuItemStyle}>
                                                    <Printer size={17} />
                                                    <span style={{ flex: 1, textAlign: 'left' }}>Tirilla automática</span>
                                                    <span style={{ width: 38, height: 22, borderRadius: 999, padding: 2, background: autoPrint ? 'var(--toul-accent)' : 'var(--toul-surface-2)', transition: 'background 180ms var(--toul-ease-emil)', display: 'flex' }}>
                                                        <span style={{ width: 18, height: 18, borderRadius: '50%', background: autoPrint ? 'var(--toul-bg)' : 'var(--toul-text)', transform: autoPrint ? 'translateX(16px)' : 'none', transition: 'transform 180ms var(--toul-ease-emil)' }} />
                                                    </span>
                                                </button>
                                            )}
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
                        </div>
                    </header>

                    <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {children}
                    </main>
                </div>

                <Sheet open={abrirTurnoOpen} onClose={() => setAbrirTurnoOpen(false)} title="Abrir turno de caja"
                    subtitle="Cuenta el efectivo que hay en la caja antes de empezar.">
                    <OpenSessionCard name={ctx!.displayName} onOpened={() => { setAbrirTurnoOpen(false); refreshSession() }} embedded />
                </Sheet>

                {/* El vendedor anota con una cuenta del negocio, nunca con "Plata mía" */}
                <RegistrarMovimiento abierto={gastoOpen} tipo="gasto" conPlataMia={ctx!.role === 'admin'} onCerrar={cerrarGasto} />
            </POSProvider>
        </CajaContext.Provider>
    )
}

/** La conexión: sin internet (amarillo), enviando (azul) o algo que no se pudo enviar (rojo) */
function Conexion({ offline }: { offline: OfflineState }) {
    const { online, pendingCount, failedCount, syncing, sync } = offline
    const estado = failedCount > 0 && online ? 'fallo' : !online ? 'sin' : pendingCount > 0 || syncing ? 'enviando' : null
    const guardadas = `${pendingCount} ${pendingCount === 1 ? 'guardada' : 'guardadas'}`

    return (
        <AnimatePresence initial={false}>
            {estado && (
                <motion.span key={estado} initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.18, ease: EASE_OUT_EMIL }} style={{ display: 'inline-flex', flexShrink: 0 }}>
                    {estado === 'sin' && (
                        <span className="cj-pill" role="status" style={{ color: 'var(--toul-warning)', background: 'var(--toul-warning-dim)' }}
                            title="Puedes seguir vendiendo de contado. Las ventas se envían solas cuando vuelva el internet">
                            <WifiOff size={15} />
                            <span className="cj-solo-pc">Sin internet{pendingCount > 0 ? ` · ${guardadas}` : ''}</span>
                            {pendingCount > 0 && <span className="cj-solo-movil">{pendingCount}</span>}
                        </span>
                    )}
                    {estado === 'enviando' && (
                        <button className="cj-pill" onClick={() => sync(true)} disabled={syncing} style={{ color: 'var(--toul-info)', background: 'var(--toul-info-dim)' }}>
                            <CloudUpload size={15} />
                            <span className="cj-solo-pc">Enviando {pendingCount}…</span>
                            <span className="cj-solo-movil">{pendingCount}</span>
                        </button>
                    )}
                    {estado === 'fallo' && (
                        <Link href="/caja/ventas" className="cj-pill" style={{ color: 'var(--toul-error)', background: 'var(--toul-error-dim)' }}>
                            <AlertTriangle size={15} />
                            <span className="cj-solo-pc">{failedCount} no se {failedCount === 1 ? 'pudo' : 'pudieron'} enviar · Revisar</span>
                            <span className="cj-solo-movil">{failedCount}</span>
                        </Link>
                    )}
                </motion.span>
            )}
        </AnimatePresence>
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
                    width: 40, height: 40, borderRadius: '50%', textDecoration: 'none',
                    background: 'var(--toul-surface)', color: 'var(--toul-text-muted)',
                    transition: 'background var(--toul-transition), color var(--toul-transition)',
                }}>
                <X size={18} strokeWidth={2.2} />
            </Link>
        </motion.div>
    )
}

const menuItemStyle: React.CSSProperties = {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 46, borderRadius: 11,
    background: 'transparent', border: 'none', color: 'var(--toul-text)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
}
