'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Home, Package, Boxes, ArrowLeftRight, Receipt, TrendingDown, Users, Truck,
    Sparkles, BarChart3, Settings, Menu, ChevronRight, ChevronsUpDown, Plus, ShieldCheck, LockKeyhole, LogOut,
} from 'lucide-react'
import { usePendingApprovalsCount } from '@/lib/isla/useSession'
import { useStore } from '@/lib/hooks/useData'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { FullscreenToggle } from './FullscreenToggle'
import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
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
// El fondo del activo en la barra lateral: se desliza sin rebotar de más
const SPRING_SUAVE = { type: 'spring' as const, duration: 0.4, bounce: 0.12 }

const NAV_CSS = `
/* ── Barra lateral ── */
.nav-row { position: relative; display: flex; align-items: center; gap: 11px; height: 36px; padding: 0 10px; border-radius: 10px;
    text-decoration: none; font-size: 14px; font-weight: 400; letter-spacing: -0.01em;
    color: color-mix(in srgb, var(--toul-text) 62%, transparent);
    -webkit-tap-highlight-color: transparent; transition: color 160ms var(--toul-ease-emil); }
.nav-row > * { position: relative; z-index: 1; }
.nav-row::before { content: ''; position: absolute; inset: 0; border-radius: 10px; opacity: 0;
    background: color-mix(in srgb, var(--toul-text) 4%, transparent); transition: opacity 160ms var(--toul-ease-emil); }
.nav-row .nav-activo { position: absolute; inset: 0; z-index: 0; border-radius: 10px;
    background: color-mix(in srgb, var(--toul-text) 7%, transparent); }
.nav-icono { flex-shrink: 0; color: var(--toul-text-subtle); transition: color 160ms var(--toul-ease-emil); }
/* Activo: texto blanco y solo el ícono en verde */
.nav-row[data-activo="true"] { color: var(--toul-text); font-weight: 500; }
.nav-row[data-activo="true"] .nav-icono, .nav-icono[data-verde="true"] { color: var(--toul-accent); }
.nav-texto { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-grupo { font-size: 11px; font-weight: 500; color: var(--toul-text-dim); margin: 0 0 4px 10px; }

/* La tienda, abajo del todo: abre Ajustes y Cerrar sesión */
.nav-tienda-raiz { position: relative; }
.nav-tienda { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 12px;
    background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
    transition: background-color 160ms var(--toul-ease-emil); }
.nav-tienda[aria-expanded="true"], .nav-tienda[data-activo="true"] { background: color-mix(in srgb, var(--toul-text) 7%, transparent); }
.nav-avatar { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: var(--toul-surface-2); color: var(--toul-text); font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }
.nav-tienda-nombre { display: block; font-size: 14px; font-weight: 500; color: var(--toul-text); letter-spacing: -0.01em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-tienda-plan { display: block; font-size: 12px; color: var(--toul-text-subtle); margin-top: 1px; }
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
    .nav-row:hover::before { opacity: 1; }
    .nav-tienda:hover { background: color-mix(in srgb, var(--toul-text) 4%, transparent); }
    .nav-menu-opcion:hover { background: var(--toul-surface); color: var(--toul-text); }
}

/* ── Celular: panel "Más" ── */
.nav-group { background: var(--toul-surface); border: 1px solid var(--toul-border); border-radius: 18px; overflow: hidden; }
.nav-group > * + * { border-top: 1px solid var(--toul-divider); }
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

type ItemNav = {
    href: string
    icon: typeof Home
    label: string
    /** Muestra el contador de solicitudes pendientes */
    badge?: boolean
    /** El ícono va siempre en verde (TOUL AI) */
    verde?: boolean
}
type SeccionNav = { label: string; plan?: 'pro'; items: ItemNav[] }

const INICIO: ItemNav = { href: '/', icon: Home, label: 'Inicio' }
const TOUL_AI: ItemNav = { href: '/toul-ai', icon: Sparkles, label: 'TOUL AI', verde: true }

// Solo lo necesita quien vende en un local o una isla. Quien vende por
// Instagram no tiene un cajón que cuadrar, así que no le aparece: es lo
// que separa el plan Pro del básico.
const PUNTO_FISICO: SeccionNav = {
    label: 'Punto físico',
    plan: 'pro',
    items: [
        { href: '/turnos', icon: LockKeyhole, label: 'Turnos de caja' },
        { href: '/aprobaciones', icon: ShieldCheck, label: 'Aprobaciones', badge: true },
    ],
}

// ── Los grupos, iguales en la barra lateral y en "Más" ─────────────────────
// Ordenados por lo que se hace: vender, la mercancía, la plata y el local
const GRUPOS: SeccionNav[] = [
    {
        label: 'Vender',
        items: [
            { href: '/ventas', icon: Receipt, label: 'Ventas' },
            { href: '/customers', icon: Users, label: 'Clientes' },
        ],
    },
    {
        label: 'Mercancía',
        items: [
            { href: '/products', icon: Package, label: 'Catálogo' },
            { href: '/inventory', icon: Boxes, label: 'Inventario' },
            { href: '/providers', icon: Truck, label: 'Proveedores' },
        ],
    },
    {
        label: 'Plata',
        items: [
            { href: '/movimientos', icon: ArrowLeftRight, label: 'Movimientos' },
            { href: '/expenses', icon: TrendingDown, label: 'Gastos' },
            { href: '/reportes', icon: BarChart3, label: 'Reportes' },
        ],
    },
    PUNTO_FISICO,
]

const nombrePlan = (plan: string | undefined) => plan === 'pro' ? 'Plan Pro' : plan === 'basico' ? 'Plan Básico' : ''
// "Tienda de perfumes" → TP: las palabras cortas de enlace no cuentan
const ENLACES = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e'])
const inicialesDe = (nombre: string) => {
    const palabras = nombre.trim().split(/\s+/).filter(Boolean)
    const fuertes = palabras.filter(p => !ENLACES.has(p.toLowerCase()))
    return (fuertes.length ? fuertes : palabras).map(p => p[0]).join('').toUpperCase().slice(0, 2) || 'T'
}

/* El plan llega con los datos del negocio, un momento después de que
   se pinta el menú. Mientras tanto la sección "Punto físico" no salía
   y luego aparecía de golpe, empujando todo hacia abajo. Ahora el equipo
   recuerda el plan y el menú sale completo desde el primer momento.
   Empieza por "toul": si entra otra cuenta, se borra con todo lo demás. */
const PLAN_KEY = 'toul-plan'
const sinCambios = () => () => {}
const planRecordado = () => {
    try { return localStorage.getItem(PLAN_KEY) ?? undefined } catch { return undefined }
}

function usePlan(): string | undefined {
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

/** Una sección marcada 'pro' solo se ve con el plan Pro. */
function seVe(seccion: object, plan: string | undefined): boolean {
    if (!('plan' in seccion)) return true
    return (seccion as { plan?: string }).plan !== 'pro' || plan === 'pro'
}

/** Una opción está activa también dentro de sus pantallas de detalle. */
function matchPath(pathname: string, href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
}

function SidebarRow({ item, badge, active }: { item: ItemNav; badge: number; active: boolean }) {
    const Icon = item.icon
    return (
        <Link href={item.href} className="nav-row" data-activo={active}>
            {active && <motion.span layoutId="sidebar-active" transition={SPRING_SUAVE} className="nav-activo" />}
            <Icon size={18} strokeWidth={active ? 2.2 : 1.9} className="nav-icono" data-verde={item.verde ?? false} />
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
                <ChevronsUpDown size={15} className="nav-icono" />
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
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(true)
    // Cerrar sesión pasa por el mismo lugar que en Ajustes: carga lo pendiente
    // y no deja nada de la cuenta en el equipo
    const { cerrar, cerrando, dialogo } = useCerrarSesion(store?.id)

    const fila = (item: ItemNav) => (
        <SidebarRow key={item.href} item={item}
            active={matchPath(pathname, item.href)}
            badge={item.badge ? pendingApprovals : 0} />
    )

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

                {/* Inicio, y los grupos */}
                {/* Espacios medidos para que todo quepa sin desplazarse, aun en
                    un portátil de 768 px de alto */}
                <nav className="flex-1 px-3 overflow-y-auto">
                    <div style={{ marginBottom: 10 }}>{fila(INICIO)}</div>
                    {GRUPOS.filter(s => seVe(s, plan)).map(section => (
                        <div key={section.label} style={{ marginBottom: 10 }}>
                            <p className="nav-grupo">{section.label}</p>
                            {section.items.map(fila)}
                        </div>
                    ))}
                </nav>

                {/* TOUL AI, aparte del resto */}
                <div className="px-3 pb-2" style={{ flexShrink: 0 }}>{fila(TOUL_AI)}</div>

                {/* La tienda: lo único con una línea encima */}
                <div className="px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--toul-divider)', flexShrink: 0 }}>
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

const MOBILE_NAV = [
    { href: '/', icon: Home, label: 'Inicio' },
    { href: '/products', icon: Package, label: 'Catálogo' },
    { type: 'pos' as const },
    { href: '/ventas', icon: Receipt, label: 'Ventas' },
    { type: 'menu' as const, icon: Menu, label: 'Más' },
]

// Los mismos grupos que la barra lateral, sin lo que ya está en la barra de
// abajo (Inicio, Catálogo y Ventas). TOUL AI va aparte, al final
const EN_LA_BARRA = new Set(MOBILE_NAV.flatMap(item => ('href' in item && item.href ? [item.href] : [])))
const MENU_SECTIONS: SeccionNav[] = [
    ...GRUPOS
        .map(grupo => ({ ...grupo, items: grupo.items.filter(item => !EN_LA_BARRA.has(item.href)) }))
        .filter(grupo => grupo.items.length > 0),
    { label: '', items: [TOUL_AI] },
]

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
    const plan = usePlan()
    const pathname = usePathname()
    const router = useRouter()
    // La caja se deja lista de antemano: el botón + abre de una
    useEffect(() => { router.prefetch('/caja') }, [router])
    const [menuOpen, setMenuOpen] = useState(false)
    const { data: pendingApprovals = 0 } = usePendingApprovalsCount(true)
    const dragControls = useDragControls()
    const { data: store } = useStore()
    const { cerrar: cerrarSesion, cerrando, dialogo: dialogoSalir } = useCerrarSesion(store?.id)

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

    if (SIN_MENU.some(ruta => ruta.test(pathname))) return null

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
                            {MENU_SECTIONS.filter(s => seVe(s, plan)).map((section, si) => (
                                <motion.div
                                    key={section.label || `s${si}`}
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.26, delay: 0.04 + si * 0.035, ease: [0, 0, 0.2, 1] }}
                                    style={{ marginBottom: 14 }}>
                                    {section.label && (
                                        <p style={{
                                            fontSize: 12, fontWeight: 500,
                                            color: 'var(--toul-text-dim)', margin: '0 0 7px 14px',
                                        }}>
                                            {section.label}
                                        </p>
                                    )}

                                    {/* Lista agrupada: un solo bloque, filas separadas por una línea */}
                                    <div className="nav-group">
                                        {section.items.map(({ href, icon: Icon, label, badge: conContador, verde }) => {
                                            const active = matchPath(pathname, href)
                                            const badge = conContador ? pendingApprovals : 0
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
                                                            color={active || verde ? 'var(--toul-accent)' : 'rgba(255,255,255,0.72)'} />
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

                            {/* La tienda, al final: Ajustes y Cerrar sesión */}
                            <motion.div
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.26, delay: 0.04 + MENU_SECTIONS.length * 0.035, ease: [0, 0, 0.2, 1] }}
                                style={{ marginBottom: 14 }}>
                                <div className="nav-group">
                                    <div className="flex items-center gap-3" style={{ padding: '12px 14px' }}>
                                        <span className="nav-avatar" aria-hidden>{inicialesDe(store?.name || 'Mi negocio')}</span>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span className="nav-tienda-nombre" style={{ fontSize: 15 }}>{store?.name || 'Mi negocio'}</span>
                                            {nombrePlan(plan) && <span className="nav-tienda-plan">{nombrePlan(plan)}</span>}
                                        </span>
                                    </div>
                                    {[
                                        { clave: 'ajustes', Icon: Settings, label: 'Ajustes', href: '/settings' },
                                        { clave: 'salir', Icon: LogOut, label: cerrando ? 'Cerrando sesión…' : 'Cerrar sesión', href: null },
                                    ].map(({ clave, Icon, label, href }) => {
                                        const active = !!href && matchPath(pathname, href)
                                        const cuerpo = (
                                            <>
                                                <span style={{
                                                    width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: active ? 'var(--toul-accent-dim)' : 'rgba(255,255,255,0.055)',
                                                }}>
                                                    <Icon size={16.5} strokeWidth={active ? 2.3 : 1.9}
                                                        color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.72)'} />
                                                </span>
                                                <span style={{ fontSize: 15, fontWeight: active ? 600 : 500, letterSpacing: '-0.01em', flex: 1, textAlign: 'left' }}>
                                                    {label}
                                                </span>
                                                {href && <ChevronRight size={15} color={active ? 'var(--toul-accent)' : 'rgba(255,255,255,0.22)'} />}
                                            </>
                                        )
                                        const estilo = {
                                            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                                            padding: '10px 14px', textDecoration: 'none', border: 'none', font: 'inherit', cursor: 'pointer',
                                            background: active ? 'var(--toul-surface-focused)' : 'transparent',
                                            color: active ? 'var(--toul-accent)' : 'var(--toul-text)',
                                        } as const
                                        return href ? (
                                            <Link key={clave} href={href} onClick={() => setMenuOpen(false)} style={estilo}>{cuerpo}</Link>
                                        ) : (
                                            <button key={clave} type="button" disabled={cerrando} style={estilo}
                                                onClick={() => { setMenuOpen(false); cerrarSesion() }}>
                                                {cuerpo}
                                            </button>
                                        )
                                    })}
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {dialogoSalir}

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
