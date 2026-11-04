'use client'

import { Fragment, useCallback, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrecio } from '@/lib/utils'
import { inicio } from '@/lib/motion'
import type { TonoParte, Vista, VistaInicio } from '@/lib/reports/calculos'
import type { Periodo } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   Lo vendido en el periodo.

   Una sola pregunta: ¿cuánto vendí? Es el número grande, en blanco.
   Debajo, en gris, cuántas ventas fueron y cómo va contra el mismo
   tramo del periodo anterior. Tocar lo vendido abre Reportes en el
   mismo periodo.

   Después, una barra con sus filas que se alterna entre tres vistas:
   pagado y fiado, ganancia y gastos, y cómo te pagaron. Se cambia
   tocando la barra o uno de los puntos, o deslizando de lado en el
   celular, y se recuerda por persona en cada equipo.

   Son dos piezas porque en el celular la gráfica va entre las dos.
   ══════════════════════════════════════════════════════════════ */

export interface MetricasInicio {
    revenue: number
    expenses: number
    salesCount: number
}

/** Cómo cuentan los montos: al aparecer la primera vez y al cambiar de periodo */
export interface Conteo {
    cuenta: boolean
    clave: string
}

/** Contra el mismo tramo del periodo anterior. null: no hay con qué comparar */
export interface Tendencia {
    porcentaje: number | null
    /** "vs ayer", "vs semana pasada", "vs 1–26 sep" */
    contra: string
}

const CSS = `
.rv-cabeza { display: flex; align-items: center; gap: 10px; min-height: 26px; }
.rv-rotulo { font-size: 13px; color: var(--toul-text-subtle); margin: 0; letter-spacing: -0.01em; }
.rv-monto { font-size: 44px; font-weight: 700; letter-spacing: -2px; line-height: 1.04; margin: 6px 0 0;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
/* La línea gris: cuántas ventas, la tendencia y, en la vista de ganancia,
   la ganancia en ventas. Si no cabe, baja entera cada parte */
.rv-bajo { display: flex; flex-wrap: wrap; align-items: center; column-gap: 5px; margin: 8px 0 0; min-height: 20px;
    font-size: 13px; font-weight: 500; color: var(--toul-text-subtle); }
.rv-trozo { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.rv-flecha { display: inline-flex; align-items: center; gap: 1px; }
/* Lo vendido abre Reportes: se hunde un poco al tocarlo */
.rv-enlace { display: grid; justify-content: start; color: inherit; text-decoration: none; border-radius: 10px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms var(--toul-ease-emil), opacity 160ms var(--toul-ease-emil); }
.rv-enlace:active { transform: scale(0.98); }
.rv-enlace:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 4px; }

/* El bloque de las vistas: deslizar de lado en el celular cambia de vista,
   el desplazamiento vertical sigue siendo de la página */
.rv-vistas { touch-action: pan-y; }
.rv-barra-boton { display: block; width: 100%; padding: 6px 0; margin: 0; border: none; background: none; cursor: pointer;
    border-radius: 8px; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.rv-barra-boton:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: 2px; }
.rv-barra { position: relative; display: block; height: 10px; border-radius: 999px; overflow: hidden;
    transition: opacity 120ms var(--toul-ease-emil); }
.rv-barra-boton:active .rv-barra { opacity: 0.8; }
.rv-barra[data-vacia] { background: var(--toul-surface); }
.rv-barra[data-crece] { animation: rv-crece ${inicio.barra.crece}s cubic-bezier(0.23, 1, 0.32, 1) 120ms backwards; }
@keyframes rv-crece { from { clip-path: inset(0 100% 0 0 round 999px); } }
/* La pista sobra 1 px por lado y cada parte se mete 1 px: quedan 2 px
   entre partes y los extremos al ras */
.rv-pista { position: absolute; top: 0; bottom: 0; left: -1px; right: -1px; }
.rv-parte { position: absolute; top: 0; bottom: 0; border-radius: 2px;
    transition: left ${inicio.barra.cambio}s var(--toul-ease), width ${inicio.barra.cambio}s var(--toul-ease),
        background-color ${inicio.barra.cambio}s var(--toul-ease); }

.rv-puntos { display: flex; justify-content: center; margin-top: 2px; }
.rv-punto-vista { width: 22px; height: 22px; padding: 0; margin: 0; border: none; background: none; cursor: pointer;
    display: grid; place-items: center; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.rv-punto-vista span { width: 6px; height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--toul-text) 25%, transparent);
    transition: background-color 200ms var(--toul-ease-emil); }
.rv-punto-vista[aria-pressed="true"] span { background: var(--toul-text); }
.rv-punto-vista:focus-visible { outline: 2px solid var(--toul-border-2); outline-offset: -2px; border-radius: 999px; }

.rv-filas { display: flex; flex-direction: column; margin-top: 4px; }
.rv-filas[data-fundido] { animation: rv-fundido ${inicio.barra.fundido}s var(--toul-ease-emil) backwards; }
@keyframes rv-fundido { from { opacity: 0; } }
.rv-fila { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 14px; color: var(--toul-text-muted); }
.rv-fila-rotulo { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rv-fila-monto { margin-left: auto; padding-left: 14px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.rv-punto { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.rv-linea-fina { height: 1px; background: var(--toul-border); margin: 8px 0; }
.rv-aparece { animation: rv-fundido ${inicio.barra.fundido}s var(--toul-ease-emil) backwards; }
@media (hover: hover) and (pointer: fine) {
    .rv-enlace:hover { opacity: 0.82; }
}
@media (prefers-reduced-motion: reduce) {
    .rv-enlace:active { transform: none; }
    .rv-barra[data-crece] { animation: rv-fundido 0.2s ease backwards; }
    .rv-parte { transition: none; }
}
`

/** El $0 de un periodo sin ventas, y un monto en cero: blanco al 28% */
const CERO = 'color-mix(in srgb, var(--toul-text) 28%, transparent)'
/** El monto ocupa su propia línea, con el ancho del valor final */
const BLOQUE = { display: 'grid', justifyContent: 'start' } as const

function sinVentasTexto(period: Periodo, nuevo: boolean): string {
    if (nuevo) return 'Registra tu primera venta y aquí verás cómo avanza tu negocio'
    if (period === 'today') return 'Tu primera venta de hoy aparecerá aquí'
    return 'Aún no hay ventas en este periodo'
}

/** "↗115% vs semana pasada": la flecha de color, el resto en gris */
function TrozoTendencia({ tendencia }: { tendencia: Tendencia }) {
    const p = tendencia.porcentaje
    if (p === null) return null
    const sube = p > 0
    const baja = p < 0
    return (
        <span className="rv-trozo">
            <span aria-hidden>·</span>
            <span className="rv-flecha">
                {sube && <ArrowUpRight size={14} strokeWidth={2.6} style={{ color: 'var(--toul-accent)' }} aria-hidden />}
                {baja && <ArrowDownRight size={14} strokeWidth={2.6} style={{ color: 'var(--toul-error)' }} aria-hidden />}
                <span className="sr-only">{sube ? 'sube' : baja ? 'baja' : 'igual'}</span>
                {Math.abs(p)}%
            </span>
            {tendencia.contra}
        </span>
    )
}

export function Vendiste({ metrics, loading, period, conteo, tendencia, selector, href, nuevo = false, gananciaVentas = null }: {
    metrics: MetricasInicio
    loading: boolean
    period: Periodo
    conteo: Conteo
    tendencia: Tendencia
    /** Nunca ha vendido: no hay gráfica ni nada que comparar */
    nuevo?: boolean
    /** En PC, la píldora del periodo va al lado de "Vendiste" */
    selector?: ReactNode
    /** Reportes en el mismo periodo */
    href: string
    /** En la vista de ganancia y gastos, la línea gris la agrega */
    gananciaVentas?: number | null
}) {
    const sinVentas = metrics.salesCount === 0

    return (
        <div>
            <style>{CSS}</style>
            <div className="rv-cabeza">
                <p className="rv-rotulo">Vendiste</p>
                {selector}
            </div>
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="200px" height="2.75rem" /></div>
            ) : (
                <Link href={href} className="rv-enlace" aria-label="Ver el reporte de este periodo">
                    <AnimatedNumber value={metrics.revenue} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-monto" style={{ ...BLOQUE, color: sinVentas ? CERO : 'var(--toul-text)' }} />
                </Link>
            )}
            {/* Sin ventas el monto va apagado y no hay tendencia: no hay nada que comparar */}
            {loading ? (
                <div style={{ marginTop: 10 }}><Skeleton width="120px" height="0.9rem" /></div>
            ) : sinVentas ? (
                <p className="rv-bajo">{sinVentasTexto(period, nuevo)}</p>
            ) : (
                <p className="rv-bajo">
                    <span className="rv-trozo">{metrics.salesCount} {metrics.salesCount === 1 ? 'venta' : 'ventas'}</span>
                    <TrozoTendencia tendencia={tendencia} />
                    {gananciaVentas !== null && (
                        <span className="rv-trozo rv-aparece">
                            <span aria-hidden>·</span>
                            ganancia en ventas {formatPrecio(gananciaVentas)}
                        </span>
                    )}
                </p>
            )}
        </div>
    )
}

/* ─── Las tres vistas ─────────────────────────────────────────── */

const NOMBRE_VISTA: Record<VistaInicio, string> = {
    pagado: 'Pagado y fiado',
    ganancia: 'Ganancia y gastos',
    metodos: 'Cómo te pagaron',
}

const TONO: Record<TonoParte, string> = {
    verde: 'var(--toul-accent)',
    fiado: 'color-mix(in srgb, var(--toul-accent) 30%, transparent)',
    fiadoGris: 'color-mix(in srgb, var(--toul-text) 22%, transparent)',
    gastos: 'color-mix(in srgb, var(--toul-text) 60%, transparent)',
    metodo2: 'color-mix(in srgb, var(--toul-text) 60%, transparent)',
    metodo3: 'color-mix(in srgb, var(--toul-text) 45%, transparent)',
    metodo4: 'color-mix(in srgb, var(--toul-text) 33%, transparent)',
}

const COLOR_MONTO = { texto: 'var(--toul-text)', verde: 'var(--toul-accent)', rojo: 'var(--toul-error)' } as const

/** Las partes que caben en la barra: 4 métodos (contando "Otros") y lo fiado */
const PARTES = 5

const CLAVE_VISTA = 'toul:inicio-vista:'
/* Si el navegador no deja guardar (modo privado), se recuerda mientras la app esté abierta */
const vistasEnMemoria = new Map<string, VistaInicio>()
const avisos = new Set<() => void>()
const suscribirVista = (avisar: () => void) => {
    avisos.add(avisar)
    return () => { avisos.delete(avisar) }
}

function leerVista(usuario: string): VistaInicio {
    const enMemoria = vistasEnMemoria.get(usuario)
    if (enMemoria) return enMemoria
    try {
        const v = localStorage.getItem(CLAVE_VISTA + usuario)
        if (v === 'pagado' || v === 'ganancia' || v === 'metodos') return v
    } catch { /* sin acceso: la primera vista */ }
    return 'pagado'
}

/** La última vista que eligió cada persona en este equipo. Arranca en
 *  "Pagado y fiado" */
export function useVistaInicio(usuario: string | null): [VistaInicio, (v: VistaInicio) => void] {
    const quien = usuario ?? ''
    const vista = useSyncExternalStore(suscribirVista, () => leerVista(quien), () => 'pagado' as const)
    const cambiar = useCallback((v: VistaInicio) => {
        vistasEnMemoria.set(quien, v)
        try { localStorage.setItem(CLAVE_VISTA + quien, v) } catch { /* queda en memoria */ }
        avisos.forEach(avisar => avisar())
    }, [quien])
    return [vista, cambiar]
}

/** Lo mínimo que mide una parte, en % de la barra: un método con muy
 *  poca plata se ve como una rayita en vez de desaparecer */
const RAYITA = 1.5

/** Cada parte va donde empieza y mide lo que le toca de la barra. Las
 *  que no se usan quedan en cero al final: al cambiar de vista todas se
 *  corren a su lugar nuevo en vez de aparecer de golpe */
function partesDeBarra(vista: Vista) {
    const total = vista.barra.reduce((s, p) => s + p.monto, 0)
    const crudos = vista.barra.map(p => (total > 0 ? (p.monto / total) * 100 : 0))
    // Lo que se les da a las rayitas sale, en proporción, de las grandes
    const chicas = crudos.filter(c => c < RAYITA).length
    const grandes = crudos.filter(c => c >= RAYITA).reduce((s, c) => s + c, 0)
    const escala = grandes > 0 ? (100 - chicas * RAYITA) / grandes : 1
    let desde = 0
    return Array.from({ length: PARTES }, (_, i) => {
        const p = vista.barra[i]
        if (!p || total <= 0) return { izquierda: 100, ancho: 0, color: 'transparent' }
        const ancho = crudos[i] < RAYITA ? RAYITA : crudos[i] * escala
        const parte = { izquierda: desde, ancho, color: TONO[p.tono] }
        desde += ancho
        return parte
    })
}

/** Lo que se mueve el dedo de lado para cambiar de vista */
const DESLIZAR = 40

export function ResumenVistas({ vistas, vista, onCambiar, loading, conteo, claveDatos }: {
    vistas: Vista[] | null
    vista: VistaInicio
    onCambiar: (v: VistaInicio) => void
    loading: boolean
    conteo: Conteo
    /** El periodo de estos números: cuando llegan los de otro, la barra vuelve a crecer */
    claveDatos: string
}) {
    // Al cambiar de vista las filas se funden y los montos no vuelven a
    // contar; con el periodo siguiente cuentan otra vez
    const [cambiadaEn, setCambiadaEn] = useState<string | null>(null)
    const cambiada = cambiadaEn === conteo.clave
    const toque = useRef<{ x: number; y: number; id: number } | null>(null)
    const deslizo = useRef(false)

    const lista = vistas ?? []
    const indice = Math.max(lista.findIndex(v => v.id === vista), 0)
    const actual = lista[indice]

    const ir = (id: VistaInicio) => {
        setCambiadaEn(conteo.clave)
        onCambiar(id)
    }
    const mover = (paso: number) => {
        if (lista.length < 2) return
        ir(lista[(indice + paso + lista.length) % lista.length].id)
    }

    if (loading || !actual) {
        return (
            <div>
                <style>{CSS}</style>
                <div style={{ padding: '6px 0' }}><Skeleton height="10px" /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30 }}>
                    {[0, 1, 2].map(n => <Skeleton key={n} height="1rem" />)}
                </div>
            </div>
        )
    }

    const partes = partesDeBarra(actual)
    const vacia = actual.barra.length === 0
    const siguiente = lista[(indice + 1) % lista.length]

    return (
        <div className="rv-vistas"
            onPointerDown={e => {
                deslizo.current = false
                toque.current = e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY, id: e.pointerId }
            }}
            onPointerUp={e => {
                const t = toque.current
                toque.current = null
                if (!t || t.id !== e.pointerId) return
                const dx = e.clientX - t.x
                const dy = e.clientY - t.y
                if (Math.abs(dx) < DESLIZAR || Math.abs(dx) < Math.abs(dy) * 1.5) return
                deslizo.current = true
                mover(dx < 0 ? 1 : -1)
            }}
            onPointerCancel={() => { toque.current = null }}>
            <style>{CSS}</style>
            <button type="button" className="rv-barra-boton" aria-label={`Ver ${NOMBRE_VISTA[siguiente.id].toLowerCase()}`}
                onClick={() => {
                    // Si se deslizó, ya cambió
                    if (deslizo.current) { deslizo.current = false; return }
                    mover(1)
                }}>
                <span key={claveDatos} className="rv-barra" data-crece={conteo.cuenta || undefined} data-vacia={vacia || undefined}>
                    <span className="rv-pista">
                        {partes.map((p, i) => (
                            <span key={i} className="rv-parte"
                                style={{ left: `calc(${p.izquierda}% + 1px)`, width: `calc(${p.ancho}% - 2px)`, backgroundColor: p.color }} />
                        ))}
                    </span>
                </span>
            </button>

            {lista.length > 1 && (
                <div className="rv-puntos">
                    {lista.map(v => (
                        <button key={v.id} type="button" className="rv-punto-vista" aria-label={NOMBRE_VISTA[v.id]}
                            aria-pressed={v.id === actual.id} onClick={() => { if (v.id !== actual.id) ir(v.id) }}>
                            <span />
                        </button>
                    ))}
                </div>
            )}

            <div key={actual.id} className="rv-filas" data-fundido={cambiada || undefined}>
                {actual.filas.map((f, i) => (
                    <Fragment key={f.clave}>
                        {actual.linea === i && <div className="rv-linea-fina" aria-hidden />}
                        <div className="rv-fila">
                            {/* Lo que no es parte de la barra va sin punto, pegado a la izquierda */}
                            {f.tono && <i className="rv-punto" style={{ background: TONO[f.tono] }} aria-hidden />}
                            <span className="rv-fila-rotulo">{f.rotulo}</span>
                            <AnimatedNumber value={f.monto} formatter={formatPrecio} cuenta={conteo.cuenta && !cambiada} clave={conteo.clave}
                                className="rv-fila-monto" style={{ color: COLOR_MONTO[f.color] }} />
                        </div>
                    </Fragment>
                ))}
            </div>
        </div>
    )
}

/* ─── Sin ventas ──────────────────────────────────────────────── */

/** Filas sin punto: lo que se muestra cuando no hay ventas que repartir */
function FilasSimples({ filas, conteo }: { filas: { rotulo: string; monto: number }[]; conteo: Conteo }) {
    return (
        <div className="rv-filas" style={{ marginTop: 0 }}>
            <style>{CSS}</style>
            {filas.map(f => (
                <div key={f.rotulo} className="rv-fila">
                    <span className="rv-fila-rotulo">{f.rotulo}</span>
                    <AnimatedNumber value={f.monto} formatter={formatPrecio} cuenta={conteo.cuenta} clave={conteo.clave}
                        className="rv-fila-monto" style={{ color: f.monto === 0 ? CERO : 'var(--toul-text)' }} />
                </div>
            ))}
        </div>
    )
}

/** Hoy sin ventas: cómo vas en la semana y en el mes */
export interface LlevasHoy {
    semana: number
    mes: number
}

/** Hoy sin ventas: cómo vas en la semana y en el mes. Si hoy ya hubo
 *  gastos, van primero */
export function LlevasEnHoy({ llevas, gastosHoy, conteo }: {
    llevas: LlevasHoy
    gastosHoy: number
    conteo: Conteo
}) {
    return (
        <FilasSimples conteo={conteo} filas={[
            ...(gastosHoy > 0 ? [{ rotulo: 'Gastos de hoy', monto: gastosHoy }] : []),
            { rotulo: 'Esta semana llevas', monto: llevas.semana },
            { rotulo: 'Este mes llevas', monto: llevas.mes },
        ]} />
    )
}

/** Otro periodo sin ventas pero con gastos: solo los gastos (decir además
 *  "Perdiste" sería repetir el mismo número) */
export function GastosSinVentas({ gastos, conteo }: { gastos: number; conteo: Conteo }) {
    return <FilasSimples conteo={conteo} filas={[{ rotulo: 'Gastos', monto: gastos }]} />
}
