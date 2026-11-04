'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as PunteroReact } from 'react'
import { formatPrecio } from '@/lib/utils'
import { ZONA_COLOMBIA } from '@/lib/periodos'
import { inicio } from '@/lib/motion'
import { tramoEn, type LineaInicio, type PasoLinea, type TramoVentas } from '@/lib/reports/calculos'
import type { Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   La gráfica del Inicio: lo vendido en cada hora (Hoy), cada día o
   cada semana del periodo.

   Una sola línea verde, suavizada para que un día sin ventas no la
   tire a cero (la arma lineaVentas, en lib/reports/calculos.ts). El
   suavizado es solo para verla: al pasar el mouse o deslizar el dedo
   la etiqueta dice lo REAL de esa hora, ese día o esa semana.

   Debajo, un relleno verde que se apaga hacia abajo. Al final de la
   línea, un punto verde fijo.
   ══════════════════════════════════════════════════════════════ */

/** Aire arriba de la línea, para que el punto final no se corte */
const ARRIBA = 14
/** Lo que ocupan las etiquetas de abajo */
const EJE = 24
const HORA = 3_600_000

const CSS = `
.hc-raiz { position: relative; }
/* El dedo desliza de lado sobre la gráfica; de arriba abajo sigue moviendo la pantalla */
.hc-plot { position: relative; touch-action: pan-y; -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
.hc-dibujo { position: absolute; inset: 0; }
.hc-svg { position: absolute; inset: 0; overflow: visible; }
.hc-linea { fill: none; stroke: var(--toul-accent); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.hc-base { fill: none; stroke: color-mix(in srgb, var(--toul-text) 14%, transparent); stroke-width: 1.5; }
.hc-tinta { stop-color: var(--toul-accent); }
.hc-eje { fill: var(--toul-text-faint); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.hc-anillo { fill: var(--toul-bg); }
.hc-punto { fill: var(--toul-accent); }
.hc-final { transform-box: fill-box; transform-origin: center; }
.hc-cursor { stroke: var(--toul-border-2); stroke-width: 1; }

/* La entrada: la línea se traza de izquierda a derecha, después sale el
   relleno y por último el punto. "backwards": al terminar no queda nada puesto */
.hc-dibujo[data-dibuja="true"] .hc-linea { animation: hc-trazo ${inicio.grafica.trazo}s cubic-bezier(0.77, 0, 0.175, 1) backwards; }
.hc-dibujo[data-dibuja="true"] .hc-base { animation: hc-aparece 400ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
.hc-dibujo[data-dibuja="true"] .hc-relleno { animation: hc-aparece ${inicio.grafica.relleno}s cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.2}s backwards; }
.hc-dibujo[data-dibuja="true"] .hc-final { animation: hc-llega 260ms cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.1}s backwards; }
.hc-dibujo[data-dibuja="false"] .hc-capa { animation: hc-aparece 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@keyframes hc-trazo {
    from { stroke-dasharray: 1 1; stroke-dashoffset: 1; opacity: 0; }
    4% { opacity: 1; }
    to { stroke-dasharray: 1 1; stroke-dashoffset: 0; opacity: 1; }
}
@keyframes hc-aparece { from { opacity: 0; } }
@keyframes hc-llega { from { opacity: 0; transform: scale(0.6); } }

.hc-globo { position: absolute; top: 0; z-index: 2; pointer-events: none; padding: 6px 10px; border-radius: 10px;
    background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    box-shadow: 0 8px 30px color-mix(in srgb, var(--toul-bg) 60%, transparent); white-space: nowrap; }
.hc-globo-texto { font-size: 12px; font-weight: 500; color: var(--toul-text-subtle); margin: 0; font-variant-numeric: tabular-nums; }
.hc-globo-valor { font-weight: 600; color: var(--toul-text); }
.hc-globo-valor[data-cero] { font-weight: 500; color: var(--toul-text-subtle); }

@media (prefers-reduced-motion: reduce) {
    .hc-dibujo[data-dibuja="true"] .hc-linea,
    .hc-dibujo[data-dibuja="true"] .hc-base,
    .hc-dibujo[data-dibuja="true"] .hc-relleno,
    .hc-dibujo[data-dibuja="true"] .hc-final { animation: hc-aparece 200ms ease backwards; }
}
`

/* ── La curva ──────────────────────────────────────────────────
   Monótona en x (la misma de d3, monotoneX): entre dos puntos no
   inventa subidas ni bajadas que no pasaron, y nunca baja de cero si
   los puntos no bajan. Cada tramo es una curva de Bézier. */
type Punto = [number, number]
/** x0, y0, control 1, control 2, x1, y1 */
type Curva = [number, number, number, number, number, number, number, number]

const signo = (v: number) => (v < 0 ? -1 : 1)
function pendiente3(a: Punto, b: Punto, c: Punto) {
    const h0 = b[0] - a[0], h1 = c[0] - b[0]
    const s0 = (b[1] - a[1]) / h0, s1 = (c[1] - b[1]) / h1
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    return (signo(s0) + signo(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
}
function pendiente2(a: Punto, b: Punto, t: number) {
    const h = b[0] - a[0]
    return h ? (3 * (b[1] - a[1]) / h - t) / 2 : t
}
function curvas(pts: Punto[]): Curva[] {
    const n = pts.length
    if (n < 2) return []
    const m: number[] = new Array(n).fill(0)
    if (n === 2) {
        const t = (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0] || 1)
        m[0] = t; m[1] = t
    } else {
        for (let i = 1; i < n - 1; i++) m[i] = pendiente3(pts[i - 1], pts[i], pts[i + 1])
        m[0] = pendiente2(pts[0], pts[1], m[1])
        m[n - 1] = pendiente2(pts[n - 2], pts[n - 1], m[n - 2])
    }
    const res: Curva[] = []
    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = pts[i]
        const [x1, y1] = pts[i + 1]
        const dx = (x1 - x0) / 3
        res.push([x0, y0, x0 + dx, y0 + dx * m[i], x1 - dx, y1 - dx * m[i + 1], x1, y1])
    }
    return res
}
const r = (v: number) => Math.round(v * 10) / 10
const haciaAdelante = (c: Curva[]) => c.map(([, , a, b, d, e, x, y]) => `C${r(a)},${r(b)} ${r(d)},${r(e)} ${r(x)},${r(y)}`).join('')
const desde = (p: Punto) => `M${r(p[0])},${r(p[1])}`

/* ── Los textos ─────────────────────────────────────────────── */
const hora = (t: number) => new Date(t).toLocaleTimeString('es-CO', { hour: 'numeric', timeZone: ZONA_COLOMBIA })
/** "18 oct", sin el "de" ni el punto */
const diaCorto = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: ZONA_COLOMBIA })
    .replace('.', '').replace(' de ', ' ')
const numeroDia = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', timeZone: ZONA_COLOMBIA })
const mes = (t: number) => new Date(t).toLocaleDateString('es-CO', { month: 'short', timeZone: ZONA_COLOMBIA })

/** Cuándo es el tramo, en la etiqueta del dedo: "2 p. m. a 3 p. m.", "18 oct" o "14 – 20 oct" */
function cuando(tramo: TramoVentas, paso: PasoLinea) {
    if (paso === 'hora') return `${hora(tramo.inicio)} a ${hora(tramo.inicio + HORA)}`
    if (paso === 'dia') return diaCorto(tramo.inicio)
    const ultimo = tramo.fin - 1
    if (diaCorto(tramo.inicio) === diaCorto(ultimo)) return diaCorto(tramo.inicio)
    return mes(tramo.inicio) === mes(ultimo)
        ? `${numeroDia(tramo.inicio)} – ${diaCorto(ultimo)}`
        : `${diaCorto(tramo.inicio)} – ${diaCorto(ultimo)}`
}

/** Lo real de ese tramo. Un día de solo devoluciones queda en negativo */
function cuanto(tramo: TramoVentas) {
    if (tramo.valor === 0 && tramo.ventas === 0) return 'sin ventas'
    return tramo.valor < 0 ? `−${formatPrecio(-tramo.valor)}` : formatPrecio(tramo.valor)
}

export default function HeroChart({ linea, clave, enVivo, variante, alto, dibujar }: {
    /** null mientras carga el periodo */
    linea: LineaInicio | null
    /** El periodo de esa línea: al cambiar, la gráfica se vuelve a dibujar */
    clave: string
    /** La línea termina ahora (no en el final de unas fechas que ya pasaron) */
    enVivo: boolean
    variante: Variante
    /** En px, o una medida de CSS */
    alto: number | string
    /** Trazar la línea de izquierda a derecha (si no, aparece de una) */
    dibujar: boolean
}) {
    const id = `hc${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
    const plotRef = useRef<HTMLDivElement>(null)
    const [tam, setTam] = useState({ w: 0, h: 0 })
    useEffect(() => {
        const node = plotRef.current
        if (!node) return
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect
            setTam(t => (t.w === width && t.h === height ? t : { w: width, h: height }))
        })
        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    const hoy = linea?.paso === 'hora'
    const movil = variante === 'movil'

    // Todo lo que se dibuja, en píxeles
    const geo = useMemo(() => {
        if (!linea || tam.w === 0 || tam.h === 0) return null
        const { w, h } = tam
        // En el celular la línea respeta el margen de la pantalla, como el
        // resto del Inicio. En PC, a la derecha queda aire para el punto
        const izq = movil ? 16 : 0
        const der = movil ? 16 : 8
        const abajo = h - EJE
        const max = Math.max(0, ...linea.puntos.map(p => p.valor))
        const ancho = linea.hasta - linea.desde || 1
        const x = (v: number) => izq + ((v - linea.desde) / ancho) * (w - izq - der)
        const y = (v: number) => (max > 0 ? abajo - (v / max) * (abajo - ARRIBA) : abajo)

        const pts: Punto[] = linea.puntos.map(p => [x(p.x), y(p.valor)])
        const trazo = desde(pts[0]) + haciaAdelante(curvas(pts))
        const fin = pts[pts.length - 1]
        return {
            w, h, izq, der, abajo, ancho, x, fin, trazo,
            relleno: trazo + `L${r(fin[0])},${r(abajo)}L${r(pts[0][0])},${r(abajo)}Z`,
        }
    }, [linea, tam, movil])

    // Al pasar el mouse o deslizar el dedo: la hora, el día o la semana de debajo
    const [foco, setFoco] = useState<TramoVentas | null>(null)
    const leible = !!linea && !linea.vacia
    const mover = useCallback((e: PunteroReact<HTMLDivElement>) => {
        if (!geo || !linea || !leible) return
        const px = e.clientX - e.currentTarget.getBoundingClientRect().left
        setFoco(tramoEn(linea, linea.desde + ((px - geo.izq) / (geo.w - geo.izq - geo.der)) * geo.ancho))
    }, [geo, linea, leible])
    const soltar = useCallback(() => setFoco(null), [])
    // Con el mouse la etiqueta sigue mientras esté encima; con el dedo se va al soltar
    const alSoltar = useCallback((e: PunteroReact<HTMLDivElement>) => { if (e.pointerType !== 'mouse') setFoco(null) }, [])

    const numerico = typeof alto === 'number'
    const primero = linea?.tramos[0] ?? null
    const ultimo = linea?.tramos[linea.tramos.length - 1] ?? null
    // La raya del dedo va en la mitad de lo que se ve de ese tramo
    const focoX = geo && foco ? geo.x((foco.x0 + foco.x1) / 2) : null

    return (
        <div className="hc-raiz" style={numerico ? undefined : { height: alto, display: 'flex', flexDirection: 'column' }}>
            <style>{CSS}</style>
            <div ref={plotRef} className="hc-plot" style={numerico ? { height: alto } : { flex: 1, minHeight: 0 }}
                onPointerDown={mover} onPointerMove={mover} onPointerLeave={soltar} onPointerUp={alSoltar} onPointerCancel={soltar}>
                {linea && geo && primero && ultimo && (
                    // Cambia de periodo → se monta de nuevo y se vuelve a dibujar
                    <div key={clave} data-dibuja={dibujar} className="hc-dibujo">
                        <svg className="hc-svg" width={geo.w} height={geo.h} aria-hidden>
                            <defs>
                                <linearGradient id={`${id}-luz`} gradientUnits="userSpaceOnUse" x1={0} y1={ARRIBA} x2={0} y2={geo.abajo}>
                                    <stop offset="0%" className="hc-tinta" stopOpacity={0.18} />
                                    <stop offset="100%" className="hc-tinta" stopOpacity={0} />
                                </linearGradient>
                            </defs>

                            {linea.vacia
                                ? <path d={geo.trazo} className="hc-base hc-capa" />
                                : (
                                    <>
                                        <path d={geo.relleno} fill={`url(#${id}-luz)`} className="hc-relleno hc-capa" />
                                        <path d={geo.trazo} pathLength={1} className="hc-linea hc-capa" />
                                    </>
                                )}

                            {focoX !== null && (
                                <line x1={focoX} x2={focoX} y1={ARRIBA - 6} y2={geo.abajo} className="hc-cursor" />
                            )}

                            {/* Abajo, solo dónde empieza y dónde termina */}
                            <g className="hc-capa">
                                <text x={geo.izq} y={geo.h - 6} textAnchor="start" className="hc-eje">
                                    {hoy ? hora(primero.inicio) : diaCorto(primero.inicio)}
                                </text>
                                <text x={Math.min(geo.w - (movil ? 16 : 0), geo.fin[0] + (movil ? 0 : geo.der))} y={geo.h - 6} textAnchor="end" className="hc-eje">
                                    {enVivo ? (hoy ? 'Ahora' : 'Hoy') : diaCorto(ultimo.fin - 1)}
                                </text>
                            </g>

                            {/* El punto fijo al final de la línea */}
                            <g className="hc-final hc-capa">
                                <circle cx={geo.fin[0]} cy={geo.fin[1]} r={6.5} className="hc-anillo" />
                                <circle cx={geo.fin[0]} cy={geo.fin[1]} r={4.5} className="hc-punto" />
                            </g>
                        </svg>

                        {foco && focoX !== null && (
                            <div className="hc-globo" style={{
                                left: focoX,
                                transform: `translateX(${focoX < 90 ? '0' : focoX > geo.w - 90 ? '-100%' : '-50%'})`,
                            }}>
                                <p className="hc-globo-texto">
                                    {cuando(foco, linea.paso)} · <span className="hc-globo-valor"
                                        data-cero={(foco.ventas === 0 && foco.valor === 0) || undefined}>{cuanto(foco)}</span>
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
