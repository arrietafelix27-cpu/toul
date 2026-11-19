'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { Store } from 'lucide-react'
import { POSProvider } from '@/components/pos/POSContext'
import { CajaContext, type BotonesComprobante } from '@/components/isla/CajaContext'
import { OpenSessionCard } from '@/components/isla/OpenSessionCard'
import { Sheet } from '@/components/isla/Sheet'
import { useOpenCashSession, useSessionContext } from '@/lib/isla/useSession'
import { useOfflineSales } from '@/lib/isla/useOffline'
import { cacheStoreInfo, getCachedStoreInfo, type CachedStoreInfo } from '@/lib/isla/offline'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { permisosDe } from '@/lib/pos/permisos'
import { tirillaAutomaticaInicial } from '@/lib/pos/comprobante'
import { createClient } from '@/lib/supabase/client'
import { EASE_OUT_EMIL } from '@/components/ui'
import { PUNTO_FISICO } from '@/lib/puntoFisico'
import { alQuitarseGota, avisarCajaLista, entrarEncimaDeGota, retrasoEntradaCaja, soltarCapaDeGota } from '@/components/pos/ui/gota'
import { IcoIzquierda, raizPos } from '@/components/pos/ui'
import { Conexion } from '@/components/pos/caja/piezas'

/* El plan llega con los datos del negocio: el equipo lo recuerda para
   no mostrar los turnos y quitarlos de golpe (y para cuando no hay internet) */
const PLAN_KEY = 'toul-caja-plan:'

const AUTO_PRINT_KEY = 'toul-caja-autoprint'

/* La caja solo vende (diseno/pos/SPEC.md §4): sin pestañas, sin el círculo
   de la persona ni su menú. Nueva venta trae su propia X y su "Sin conexión".
   Las páginas de adentro (Ventas de hoy, Cerrar turno) tienen una barra
   mínima para volver a vender. */
const CSS = `
.cj-sub { flex-shrink: 0; display: flex; align-items: center; gap: 12px;
    padding: calc(14px + env(safe-area-inset-top, 0px)) 20px 10px; }
.cj-sub-titulo { flex: 1; min-width: 0; margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--toul-text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Reducir movimiento: en la caja solo cambian colores y transparencias */
@media (prefers-reduced-motion: reduce) {
    .cj-raiz *, .cj-raiz *::before, .cj-raiz *::after {
        transition-property: color, background-color, border-color, opacity, box-shadow !important;
    }
    .cj-raiz .cj-press, .cj-raiz .pos-press { transform: none !important; }
}
`

/** Lo único que ve un vendedor mientras el punto físico está en pausa */
function EnPausa({ onSalir, entrada }: { onSalir: () => void; entrada: Entrada }) {
    return (
        <div {...entrada} style={{
            minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-bg)',
            padding: '24px 24px calc(24px + env(safe-area-inset-bottom, 0px))',
        }}>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: EASE_OUT_EMIL }}
                style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
                <div aria-hidden style={{
                    width: 52, height: 52, borderRadius: '50%', margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--toul-surface)', color: 'var(--toul-text-muted)',
                }}>
                    <Store size={22} strokeWidth={1.9} />
                </div>
                <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.25, color: 'var(--toul-text)', margin: 0 }}>
                    La venta en punto físico está en pausa
                </h1>
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--toul-text-muted)', margin: '8px 0 26px' }}>
                    Habla con el dueño del negocio.
                </p>
                <button type="button" onClick={onSalir} className="toul-btn-ghost" style={{ width: '100%' }}>
                    Cerrar sesión
                </button>
            </motion.div>
        </div>
    )
}

type Entrada = { ref?: (el: HTMLDivElement | null) => void }

/**
 * Si se llegó con la gota, la raíz de la caja entra ENCIMA de ella
 * (oscura, de 0 a 1, desde el 55 % de la gota) y la tapa: la caja nunca
 * se ve verde. Si primero se ve la carga y luego la caja, la entrada sigue
 * donde iba (no vuelve a empezar). Cuando la gota ya se quitó, la caja deja
 * su capa de encima (para no tapar las hojas que se abren sobre ella).
 */
function useEntradaGota(): Entrada {
    // Hora (performance.now) en que la caja empieza a aparecer
    const [desde] = useState<number | null>(() => {
        const r = retrasoEntradaCaja()
        return r == null ? null : performance.now() + r
    })
    const raiz = useRef<HTMLDivElement | null>(null)
    const [entrando, setEntrando] = useState(desde != null)
    useEffect(() => {
        // Ya hay algo pintado (la caja o su carga): la gota puede seguir
        avisarCajaLista()
        return alQuitarseGota(() => {
            if (raiz.current) soltarCapaDeGota(raiz.current)
            setEntrando(false)
        })
    }, [])
    const ref = useCallback((el: HTMLDivElement | null) => {
        raiz.current = el
        if (el && desde != null) entrarEncimaDeGota(el, desde)
    }, [desde])
    return entrando ? { ref } : {}
}

function Spinner({ entrada }: { entrada: Entrada }) {
    return (
        <div {...entrada} style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--toul-bg)' }}>
            <div style={{ width: 26, height: 26, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    )
}

const botonesDe = (v: unknown): BotonesComprobante => v === 'whatsapp' || v === 'tirilla' ? v : 'ambos'

export default function CajaLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const entrada = useEntradaGota()
    const { data: ctx, isLoading } = useSessionContext()
    // Con el punto físico en pausa no hay turnos: ni se piden ni se esperan
    const { data: session, isLoading: sessionLoading, mutate: refreshSession } = useOpenCashSession(PUNTO_FISICO ? ctx?.storeId : null)
    // Apagada hasta saber qué equipo es (ver abajo)
    const [autoPrint, setAutoPrint] = useState(false)
    // Los datos del negocio llegan del servidor; mientras tanto (o sin
    // internet) vale lo último guardado en el equipo
    const [servidor, setServidor] = useState<{ storeId: string; plan: string; info: CachedStoreInfo } | null>(null)
    const [abrirTurnoOpen, setAbrirTurnoOpen] = useState(false)
    const offline = useOfflineSales(ctx?.storeId)

    // Tirilla automática: lo que este equipo eligió; si nunca eligió,
    // prendida en el computador y apagada en el celular. Con el punto
    // físico en pausa no hay tirilla (ver isPro)
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

    const abrirTurno = useCallback(() => setAbrirTurnoOpen(true), [])

    // Cerrar sesión pasa por un solo lugar: carga lo pendiente, avisa si
    // algo no se pudo cargar y no deja nada de la cuenta en el equipo
    const { cerrar: logout, dialogo: dialogoSalir } = useCerrarSesion(ctx?.storeId)

    // Mientras no se sabe el plan se muestra la caja como siempre. Quien
    // vende con su propia cuenta siempre es de un plan Pro (el equipo es Pro).
    // Con el punto físico en pausa (lib/puntoFisico.ts) nadie tiene turnos
    // ni tirilla: la caja es solo la forma rápida de anotar una venta
    const isPro = PUNTO_FISICO && (plan !== 'basico' || ctx?.role === 'seller')
    const turno = isPro ? (session ?? null) : null
    const permisos = useMemo(() => permisosDe(ctx?.role ?? 'seller', tienda?.seller_permissions), [ctx?.role, tienda?.seller_permissions])
    // El comprobante por WhatsApp queda para todos; la tirilla, en pausa
    const comprobante: BotonesComprobante = PUNTO_FISICO ? botonesDe(tienda?.receipt_buttons) : 'whatsapp'

    const value = useMemo(() => ctx ? ({
        ctx, session: turno, sessionLoading, refreshSession, autoPrint: autoPrint && isPro, isPro,
        permisos, comprobante, tienda, offline, abrirTurno,
    }) : null, [ctx, turno, sessionLoading, refreshSession, autoPrint, isPro, permisos, comprobante, tienda, offline, abrirTurno])

    if (isLoading || !value) return <Spinner entrada={entrada} />

    // Un vendedor que llegue a entrar no puede vender mientras el punto
    // físico esté en pausa
    if (!PUNTO_FISICO && ctx!.role === 'seller') return <>{dialogoSalir}<EnPausa onSalir={logout} entrada={entrada} /></>

    // Nueva venta es la pantalla entera; lo demás lleva su barra para volver
    const titulo = pathname === '/caja/ventas' ? (isPro ? 'Ventas del turno' : 'Ventas de hoy')
        : pathname === '/caja/cierre' ? 'Cerrar turno'
        : null

    return (
        <CajaContext.Provider value={value}>
            {dialogoSalir}
            <POSProvider>
                <style>{CSS}</style>
                <div data-caja-raiz {...entrada} className="cj-raiz" style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--toul-bg)', overflow: 'hidden' }}>
                    {titulo && (
                        <header className={`cj-sub ${raizPos}`}>
                            <Link href="/caja" aria-label="Volver a la venta" className="cj-sub-volver"
                                style={{
                                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'var(--toul-surface-2)', color: 'var(--toul-text)',
                                }}>
                                <IcoIzquierda />
                            </Link>
                            <h1 className="cj-sub-titulo">{titulo}</h1>
                            <Conexion offline={offline} />
                        </header>
                    )}
                    <main style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                        {children}
                    </main>
                </div>

                <Sheet open={abrirTurnoOpen} onClose={() => setAbrirTurnoOpen(false)} title="Abrir turno de caja"
                    subtitle="Cuenta el efectivo que hay en la caja antes de empezar.">
                    <OpenSessionCard name={ctx!.displayName} onOpened={() => { setAbrirTurnoOpen(false); refreshSession() }} embedded />
                </Sheet>
            </POSProvider>
        </CajaContext.Provider>
    )
}
