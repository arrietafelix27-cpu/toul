'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Home, Package, Layers, ArrowLeftRight, Users, Truck, BarChart3, Store,
    Settings, Ellipsis, ChevronsUpDown, Plus, LogOut,
} from 'lucide-react'
import { usePendingApprovalsCount } from '@/lib/isla/useSession'
import { PUNTO_FISICO } from '@/lib/puntoFisico'
import { useStore } from '@/lib/hooks/useData'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { FullscreenToggle } from './FullscreenToggle'
import { BotonToulAI } from './BotonToulAI'
import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

/* ══════════════════════════════════════════════════════════════
   Navegación de TOUL.
   En PC: barra lateral fija, una sola lista sin grupos. Abajo, el
   botón de TOUL AI y la tienda (Ajustes y Cerrar sesión).
   En celular: barra inferior; "Más" abre su propia pantalla.
   El fondo del activo se desliza entre opciones en vez de prenderse
   y apagarse: así se sabe de dónde se viene y a dónde se va.
   ══════════════════════════════════════════════════════════════ */

const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
const SPRING_SLIDE = { type: 'spring' as const, stiffness: 520, damping: 42, mass: 0.7 }
// El fondo del activo en la barra lateral: se desliza sin rebotar de más
const SPRING_SUAVE = { type: 'spring' as const, duration: 0.4, bounce: 0.12 }
const SIN_MOVIMIENTO = { duration: 0 }

const NAV_CSS = `
/* ── Barra lateral ── */
.nav-row { position: relative; display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; margin-bottom: 2px;
    border-radius: 11px; text-decoration: none; font-size: 15px; font-weight: 400; letter-spacing: -0.01em;
    color: color-mix(in srgb, var(--toul-text) 82%, transparent);
    -webkit-tap-highlight-color: transparent; transition: color 200ms ease; }
.nav-row > * { position: relative; z-index: 1; }
.nav-row .nav-activo { position: absolute; inset: 0; z-index: 0; border-radius: 11px;
    background: color-mix(in srgb, var(--toul-text) 8%, transparent); }
.nav-icono { flex-shrink: 0; color: color-mix(in srgb, var(--toul-text) 50%, transparent); transition: color 200ms ease; }
/* Activo: texto blanco y fuerte, y solo el ícono en verde */
.nav-row[data-activo="true"] { color: var(--toul-text); font-weight: 600; }
.nav-row[data-activo="true"] .nav-icono { color: var(--toul-accent); }
.nav-row:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: -2px; }
.nav-texto { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* La tienda, abajo del todo: abre Ajustes y Cerrar sesión */
.nav-tienda-raiz { position: relative; }
.nav-tienda { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 12px;
    background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
    transition: background-color 160ms var(--toul-ease-emil); }
.nav-tienda[aria-expanded="true"], .nav-tienda[data-activo="true"] { background: color-mix(in srgb, var(--toul-text) 7%, transparent); }
.nav-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 10%, transparent); color: var(--toul-text);
    font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
.nav-tienda-nombre { display: block; font-size: 14px; font-weight: 600; color: var(--toul-text); letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-tienda-plan { display: block; font-size: 12px; color: var(--toul-text-subtle); margin-top: 1px; }
.nav-tienda-flecha { flex-shrink: 0; color: color-mix(in srgb, var(--toul-text) 35%, transparent); }
.nav-tienda-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 10; padding: 6px; border-radius: 14px;
    background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    box-shadow: 0 18px 48px color-mix(in srgb, var(--toul-bg) 72%, transparent); transform-origin: bottom left; }
.nav-menu-opcion { display: flex; align-items: center; gap: 10px; width: 100%; height: 38px; padding: 0 10px; border: none; border-radius: 9px;
    background: none; font: inherit; font-size: 14px; color: var(--toul-text-muted); text-decoration: none; text-align: left; cursor: pointer;
    transition: background-color 120ms var(--toul-ease-emil), color 120ms var(--toul-ease-emil); }
.nav-menu-opcion:focus-visible { outline: none; background: var(--toul-surface-2); color: var(--toul-text); }
.nav-menu-opcion:disabled { opacity: 0.5; cursor: default; }

@media (hover: hover) and (pointer: fine) {
    .nav-row:hover { color: var(--toul-text); }
    .nav-tienda:hover { background: color-mix(in srgb, var(--toul-text) 4%, transparent); }
    .nav-menu-opcion:hover { background: var(--toul-surface); color: var(--toul-text); }
}
`

/** Contador rojo de solicitudes pendientes (Punto físico) */
export function CountBadge({ count }: { count: number }) {
    if (!count) return null
    return (
        <motion.span
            initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_PRESS}
            style={{
                minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, marginLeft: 'auto',
                background: 'var(--toul-error)', color: 'var(--toul-text)', fontSize: 11, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {count > 9 ? '9+' : count}
        </motion.span>
    )
}

export type ItemNav = {
    href: string
    icon: typeof Home
    label: string
    /** Muestra el contador de solicitudes pendientes */
    badge?: boolean
    /** Solo con el plan Pro */
    plan?: 'pro'
    /** Solo si el punto físico está prendido (lib/puntoFisico.ts) */
    puntoFisico?: true
    /** Pantallas que también cuentan como esta opción */
    tambien?: string[]
}

const INICIO: ItemNav = { href: '/', icon: Home, label: 'Inicio' }
const CATALOGO: ItemNav = { href: '/products', icon: Package, label: 'Catálogo' }
const INVENTARIO: ItemNav = { href: '/inventory', icon: Layers, label: 'Inventario' }
// Las ventas y los gastos ahora viven dentro de Movimientos
const MOVIMIENTOS: ItemNav = { href: '/movimientos', icon: ArrowLeftRight, label: 'Movimientos', tambien: ['/ventas', '/expenses'] }
const CLIENTES: ItemNav = { href: '/customers', icon: Users, label: 'Clientes' }
const PROVEEDORES: ItemNav = { href: '/providers', icon: Truck, label: 'Proveedores' }
const REPORTES: ItemNav = { href: '/reportes', icon: BarChart3, label: 'Reportes' }
// Solo lo necesita quien vende en un local o una isla. Quien vende por
// Instagram no tiene un cajón que cuadrar, así que no le aparece: es lo
// que separa el plan Pro del básico. En pausa: no le sale a nadie
// mientras la llave de lib/puntoFisico.ts esté apagada.
const ITEM_PUNTO_FISICO: ItemNav = {
    href: '/punto-fisico', icon: Store, label: 'Punto físico', badge: true, plan: 'pro', puntoFisico: true,
    tambien: ['/turnos', '/aprobaciones'],
}

// Una sola lista, en el orden en que se usa
const MENU_PC: ItemNav[] = [INICIO, CATALOGO, INVENTARIO, MOVIMIENTOS, CLIENTES, PROVEEDORES, REPORTES, ITEM_PUNTO_FISICO]
/** Lo que va en la pantalla "Más" del celular (lo que no está en la barra de abajo) */
export const MENU_MAS: ItemNav[] = [INVENTARIO, CLIENTES, PROVEEDORES, REPORTES, ITEM_PUNTO_FISICO]

export const nombrePlan = (plan: string | undefined) => plan === 'pro' ? 'Plan Pro' : plan === 'basico' ? 'Plan Básico' : ''
// "Tienda de perfumes" → TP: las palabras cortas de enlace no cuentan
const ENLACES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e'])
export const inicialesDe = (nombre: string) => {
    const palabras = nombre.trim().split(/\s+/).filter(Boolean)
    const fuertes = palabras.filter(p => !ENLACES.has(p.toLowerCase()))
    return (fuertes.length ? fuertes : palabras).map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'T'
}

/* El plan llega con los datos del negocio, un momento después de que
   se pinta el menú. Mientras tanto "Punto físico" no salía y luego
   aparecía de golpe, empujando todo hacia abajo. Ahora el equipo
   recuerda el plan y el menú sale completo desde el primer momento.
   Empieza por "toul": si entra otra cuenta, se borra con todo lo demás. */
const PLAN_KEY = 'toul-plan'
const sinCambios = () => () => {}
const planRecordado = () => {
    try { return localStorage.getItem(PLAN_KEY) ?? undefined } catch { return undefined }
}

export function usePlan(): string | undefined {
    const { data: store } = useStore()
    const recordado = useSyncExternalStore(sinCambios, planRecordado, () => undefined)
    useEffect(() => {
        if (!store) return
        try {
            if (store.plan) localStorage.setItem(PLAN_KEY, store.plan)
            else localStorage.removeItem(PLAN_KEY)
        } catch { /* sin almacenamiento: solo se pierde el recuerdo */ }
    }, [store])
    return store ? store.plan : recordado
}

/** Una opción marcada 'pro' solo se ve con el plan Pro; lo del punto físico, solo con la llave prendida. */
export const seVe = (item: ItemNav, plan: string | undefined) =>
    (!item.puntoFisico || PUNTO_FISICO) && (item.plan !== 'pro' || plan === 'pro')

/** Una opción está activa también dentro de sus pantallas de detalle. */
function matchPath(pathname: string, href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
}
export const estaEn = (pathname: string, item: ItemNav) =>
    matchPath(pathname, item.href) || (item.tambien ?? []).some(h => matchPath(pathname, h))

function SidebarRow({ item, badge, active }: { item: ItemNav; badge: number; active: boolean }) {
    const Icon = item.icon
    const reducir = useReducedMotion()
    return (
        <Link href={item.href} className="nav-row" data-activo={active} aria-current={active ? 'page' : undefined}>
            {active && <motion.span layoutId="sidebar-active" transition={reducir ? SIN_MOVIMIENTO : SPRING_SUAVE} className="nav-activo" />}
            <Icon size={19} strokeWidth={active ? 2.1 : 1.9} className="nav-icono" />
            <span className="nav-texto">{item.label}</span>
            <CountBadge count={badge} />
        </Link>
    )
}

/** La tienda, abajo del todo. Al tocarla abre Ajustes y Cerrar sesión. */
function TiendaMenu({ nombre, plan, enAjustes, cerrando, onCerrarSesion }: {
    nombre: string
    plan: string | undefined
    enAjustes: boolean
    cerrando: boolean
    onCerrarSesion: () => void
}) {
    const [abierto, setAbierto] = useState(false)
    const raiz = useRef<HTMLDivElement>(null)

    // Se cierra tocando afuera o con Escape
    useEffect(() => {
        if (!abierto) return
        const afuera = (e: PointerEvent) => {
            if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
        }
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
        document.addEventListener('pointerdown', afuera)
        document.addEventListener('keydown', tecla)
        return () => {
            document.removeEventListener('pointerdown', afuera)
            document.removeEventListener('keydown', tecla)
        }
    }, [abierto])

    return (
        <div ref={raiz} className="nav-tienda-raiz">
            <AnimatePresence>
                {abierto && (
                    <motion.div role="menu" aria-label="Tu tienda" className="nav-tienda-menu"
                        initial={{ opacity: 0, transform: 'translateY(4px) scale(0.97)' }}
                        animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
                        exit={{ opacity: 0, transform: 'translateY(4px) scale(0.97)', transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] } }}
                        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}>
                        <Link href="/settings" role="menuitem" className="nav-menu-opcion" onClick={() => setAbierto(false)}>
                            <Settings size={16} className="nav-icono" /> Ajustes
                        </Link>
                        <button type="button" role="menuitem" className="nav-menu-opcion" disabled={cerrando}
                            onClick={() => { setAbierto(false); onCerrarSesion() }}>
                            <LogOut size={16} className="nav-icono" /> {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
            <button type="button" className="nav-tienda" aria-haspopup="menu" aria-expanded={abierto} data-activo={enAjustes}
                onClick={() => setAbierto(v => !v)}>
                <span className="nav-avatar" aria-hidden>{inicialesDe(nombre)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="nav-tienda-nombre">{nombre}</span>
                    {nombrePlan(plan) && <span className="nav-tienda-plan">{nombrePlan(plan)}</span>}
                </span>
                <ChevronsUpDown size={16} className="nav-tienda-flecha" />
            </button>
        </div>
    )
}

export function Sidebar() {
    const plan = usePlan()
    const pathname = usePathname()
    const router = useRouter()
    const { data: store } = useStore()
    // La caja se deja lista de antemano: "Nueva venta" abre de una
    useEffect(() => { router.prefetch('/caja') }, [router])
    // Las aprobaciones son del punto físico: en pausa, ni se preguntan
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(PUNTO_FISICO)
    // Cerrar sesión pasa por el mismo lugar que en Ajustes: carga lo pendiente
    // y no deja nada de la cuenta en el equipo
    const { cerrar, cerrando, dialogo } = useCerrarSesion(store?.id)

    return (
        <>
            <aside
                className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-60 z-40"
                style={{
                    background: 'rgba(255,255,255,0.022)',
                    backdropFilter: 'blur(40px) saturate(1.4)',
                    WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
                }}>
                <style>{NAV_CSS}</style>

                {/* Marca */}
                <div className="flex items-center gap-2.5 pl-5 pr-3" style={{ height: 64, flexShrink: 0 }}>
                    <div className="flex items-center justify-center"
                        style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--toul-accent)', boxShadow: '0 2px 12px var(--toul-accent-glow)' }}>
                        <span style={{ color: 'var(--toul-bg)', fontWeight: 800, fontSize: 13 }}>T</span>
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
                            background: 'var(--toul-accent)', color: 'var(--toul-bg)',
                            height: 40, borderRadius: 12, border: 'none',
                            fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em',
                            cursor: 'pointer', fontFamily: 'inherit',
                            boxShadow: '0 2px 18px var(--toul-accent-glow)',
                        }}>
                        <Plus size={16} strokeWidth={2.6} />
                        Nueva venta
                    </motion.button>
                </div>

                {/* Una sola lista, sin grupos. Cabe sin desplazarse aun en un
                    portátil de 768 px de alto */}
                <nav className="flex-1 px-3 overflow-y-auto" aria-label="Menú">
                    {MENU_PC.filter(item => seVe(item, plan)).map(item => (
                        <SidebarRow key={item.href} item={item}
                            active={estaEn(pathname, item)}
                            badge={item.badge ? pendingApprovals : 0} />
                    ))}
                </nav>

                {/* TOUL AI, encima de la tienda */}
                <div className="px-3" style={{ flexShrink: 0, marginTop: 12 }}>
                    <BotonToulAI />
                </div>

                {/* La tienda: lo único con una línea encima */}
                <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--toul-divider)', marginTop: 12, flexShrink: 0 }}>
                    <TiendaMenu nombre={store?.name || 'Mi negocio'} plan={plan}
                        enAjustes={matchPath(pathname, '/settings')}
                        cerrando={cerrando} onCerrarSesion={cerrar} />
                </div>
            </aside>
            {/* Fuera de la barra: con su desenfoque, adentro quedaría encerrado */}
            {dialogo}
        </>
    )
}

// ── Barra inferior (celular) ───────────────────────────────────────────────

const MAS: ItemNav = { href: '/mas', icon: Ellipsis, label: 'Más' }
const BARRA: (ItemNav | 'caja')[] = [INICIO, CATALOGO, 'caja', MOVIMIENTOS, MAS]

/** Pantallas de trabajo que necesitan todo el celular. Ahí el menú de
 *  abajo tapaba lo importante (la casilla para escribirle a TOUL AI, el
 *  botón de terminar el conteo) o se apilaba con el botón de guardar.
 *  Cada una tiene su botón para volver. */
const SIN_MENU = [
    /^\/toul-ai$/,
    /^\/inventory\/conteo\/[^/]+$/,
    /^\/inventory\/purchase$/,
    /^\/products\/new\/(simple|variant|combo)$/,
    /^\/products\/[^/]+\/edit$/,
    /^\/products\/combo\/[^/]+\/edit$/,
]

export function BottomNav() {
    const pathname = usePathname()
    const router = useRouter()
    // La caja se deja lista de antemano: el botón + abre de una
    useEffect(() => { router.prefetch('/caja') }, [router])
    // Las aprobaciones son del punto físico: en pausa, ni se preguntan
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(PUNTO_FISICO)

    if (SIN_MENU.some(ruta => ruta.test(pathname))) return null

    // Lo que se abre desde "Más" (Clientes, Reportes, Ajustes…) deja "Más"
    // marcado, como en las apps del celular: así se sabe por dónde volver
    const enLaBarra = [INICIO, CATALOGO, MOVIMIENTOS].find(item => estaEn(pathname, item))
    const activo = enLaBarra?.href ?? MAS.href

    return (
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
                {BARRA.map(item => {
                    if (item === 'caja') {
                        return (
                            <div key="pos-center" className="flex items-center justify-center" style={{ width: 64 }}>
                                <motion.button
                                    onClick={() => router.push('/caja')}
                                    whileTap={{ scale: 0.94 }}
                                    transition={SPRING_PRESS}
                                    aria-label="Nueva venta"
                                    className="flex items-center justify-center"
                                    style={{
                                        width: 56, height: 56, marginTop: -12, borderRadius: '50%',
                                        background: 'var(--toul-accent)', color: 'var(--toul-bg)', border: 'none', cursor: 'pointer',
                                        boxShadow: '0 8px 28px rgba(50,215,75,0.45), 0 2px 8px rgba(0,0,0,0.35)',
                                    }}>
                                    <Plus size={26} strokeWidth={2.8} />
                                </motion.button>
                            </div>
                        )
                    }

                    const active = activo === item.href
                    const Icon = item.icon
                    const tint = active ? 'var(--toul-accent)' : 'var(--toul-text-subtle)'

                    return (
                        <motion.div key={item.href} whileTap={{ scale: 0.92 }} transition={SPRING_PRESS} className="flex-1" style={{ minWidth: 0 }}>
                            <Link href={item.href} aria-current={active ? 'page' : undefined}
                                className="flex flex-col items-center justify-center"
                                style={{ gap: 3, padding: '8px 2px', textDecoration: 'none', WebkitTapHighlightColor: 'transparent' }}>
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
                                    {/* Hay aprobaciones pendientes: están dentro de "Más" > Punto físico */}
                                    {item === MAS && pendingApprovals > 0 && (
                                        <span style={{
                                            position: 'absolute', top: 1, right: 2, width: 8, height: 8, borderRadius: '50%',
                                            background: 'var(--toul-error)', boxShadow: '0 0 0 2px rgba(10,10,10,0.9)', zIndex: 2,
                                        }} />
                                    )}
                                    <Icon size={20} strokeWidth={active ? 2.3 : 1.9} color={tint}
                                        style={{ position: 'relative', zIndex: 1, transition: 'color 160ms cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                </div>
                                <span style={{
                                    fontSize: 10, fontWeight: 500, letterSpacing: '0.01em', color: tint, whiteSpace: 'nowrap',
                                    transition: 'color 160ms cubic-bezier(0.4, 0, 0.2, 1)',
                                }}>
                                    {item.label}
                                </span>
                            </Link>
                        </motion.div>
                    )
                })}
            </div>
        </nav>
    )
}
