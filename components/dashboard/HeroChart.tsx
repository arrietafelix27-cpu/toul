'use client'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type PointerEvent as PunteroReact } from 'react'
import { formatPrecio } from '@/lib/utils'
import { ZONA_COLOMBIA, enColombia } from '@/lib/periodos'
import { inicio } from '@/lib/motion'
import type { LineaInicio, PuntoLinea } from '@/lib/reports/calculos'
import type { Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   La gráfica del Inicio: lo vendido ACUMULADO en el periodo.

   La línea sube con cada venta (y baja con una devolución), así
   termina exacto en "Vendiste". Los puntos los arma lineaAcumulada
   (lib/reports/calculos.ts) con lo que entrega toul_reporte: Hoy va
   por hora, los demás por día y, si pasan de 120 días, por semana.

   En semana, mes y fechas elegidas, detrás va la línea del periodo
   anterior, también acumulada y día 1 contra día 1. El espacio entre
   las dos se ilumina de verde donde vas adelante y casi no se ve
   donde vas atrás. En Hoy no se compara: solo la línea del día y una
   marca de "Ahora".

   Al final de la línea, un punto verde que late. Al pasar el mouse o
   deslizar el dedo dice cuánto llevabas en ese momento.
   ══════════════════════════════════════════════════════════════ */

export interface Comparacion {
    /** En la leyenda: "Este mes" */
    actual: string
    /** En la leyenda: "Mes pasado" */
    anterior: string
    /** En la etiqueta del dedo: "Mes pasado: $120.000" */
    globo: string
}

/** Aire arriba de la línea, para que el pulso del punto no se corte; en Hoy, además, para "Ahora" */
const ARRIBA = 14
const ARRIBA_HOY = 26
/** Lo que ocupan las etiquetas de abajo */
const EJE = 24

const CSS = `
.hc-raiz { position: relative; }
/* El dedo desliza de lado sobre la gráfica; de arriba abajo sigue moviendo la pantalla */
.hc-plot { position: relative; touch-action: pan-y; -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; }
.hc-dibujo { position: absolute; inset: 0; }
.hc-svg { position: absolute; inset: 0; overflow: visible; }
.hc-linea { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
.hc-base { fill: none; stroke: color-mix(in srgb, var(--toul-text) 14%, transparent); stroke-width: 1.5; }
.hc-antes { fill: none; stroke: color-mix(in srgb, var(--toul-text) 22%, transparent); stroke-width: 1.5;
    stroke-linecap: round; stroke-linejoin: round; }
.hc-detras { fill: color-mix(in srgb, var(--toul-text) 4%, transparent); }
.hc-tinta { stop-color: var(--toul-accent); }
.hc-eje { fill: var(--toul-text-faint); font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.hc-ahora { stroke: color-mix(in srgb, var(--toul-text) 18%, transparent); stroke-width: 1; stroke-dasharray: 2 4; }
.hc-anillo { fill: var(--toul-bg); }
.hc-punto, .hc-pulso { fill: var(--toul-accent); }
.hc-final { transform-box: fill-box; transform-origin: center; }
.hc-pulso { transform-box: fill-box; transform-origin: center;
    animation: hc-pulso 1.8s cubic-bezier(0.23, 1, 0.32, 1) infinite; }
@keyframes hc-pulso { from { transform: scale(1); opacity: 0.55; } to { transform: scale(3.2); opacity: 0; } }
.hc-cursor { stroke: var(--toul-border-2); stroke-width: 1; }
.hc-foco { fill: var(--toul-accent); stroke: var(--toul-bg); stroke-width: 2; }
.hc-foco-antes { fill: color-mix(in srgb, var(--toul-text) 55%, transparent); stroke: var(--toul-bg); stroke-width: 2; }

/* La entrada: la línea se traza de izquierda a derecha, después sale el
   brillo entre las dos líneas y por último el punto. "backwards": al
   terminar no queda nada puesto */
.hc-dibujo[data-dibuja="true"] .hc-linea { animation: hc-trazo ${inicio.grafica.trazo}s cubic-bezier(0.77, 0, 0.175, 1) backwards; }
.hc-dibujo[data-dibuja="true"] .hc-antes,
.hc-dibujo[data-dibuja="true"] .hc-base { animation: hc-aparece 400ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
.hc-dibujo[data-dibuja="true"] .hc-brillo { animation: hc-aparece ${inicio.grafica.relleno}s cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.1}s backwards; }
.hc-dibujo[data-dibuja="true"] .hc-final,
.hc-dibujo[data-dibuja="true"] .hc-marca-ahora { animation: hc-llega 260ms cubic-bezier(0.23, 1, 0.32, 1) ${inicio.grafica.trazo - 0.1}s backwards; }
.hc-dibujo[data-dibuja="true"] .hc-pulso { animation-delay: ${inicio.grafica.trazo + 0.2}s; }
.hc-dibujo[data-dibuja="false"] .hc-capa { animation: hc-aparece 200ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@keyframes hc-trazo {
    from { stroke-dasharray: 1 1; stroke-dashoffset: 1; opacity: 0; }
    4% { opacity: 1; }
    to { stroke-dasharray: 1 1; stroke-dashoffset: 0; opacity: 1; }
}
@keyframes hc-aparece { from { opacity: 0; } }
@keyframes hc-llega { from { opacity: 0; transform: scale(0.6); } }

.hc-globo { position: absolute; top: 0; z-index: 2; pointer-events: none; padding: 7px 11px; border-radius: 10px;
    background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    box-shadow: 0 8px 30px color-mix(in srgb, var(--toul-bg) 60%, transparent); white-space: nowrap; }
.hc-globo-cuando { font-size: 11px; font-weight: 500; color: var(--toul-text-subtle); margin: 0; }
.hc-globo-valor { font-size: 13px; font-weight: 600; color: var(--toul-text); margin: 2px 0 0; font-variant-numeric: tabular-nums; }
.hc-globo-antes { font-size: 12px; font-weight: 500; color: var(--toul-text-subtle); margin: 2px 0 0; font-variant-numeric: tabular-nums; }

.hc-leyenda { display: flex; align-items: center; gap: 16px; height: 16px; margin-top: 8px;
    font-size: 11px; font-weight: 500; color: var(--toul-text-subtle); }
.hc-leyenda[data-variante="movil"] { padding: 0 16px; }
.hc-ley { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.hc-ley-actual { width: 12px; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--toul-accent) 30%, transparent), var(--toul-accent)); }
.hc-ley-antes { width: 12px; height: 1.5px; border-radius: 2px; background: color-mix(in srgb, var(--toul-text) 22%, transparent); }

@media (prefers-reduced-motion: reduce) {
    .hc-dibujo[data-dibuja="true"] .hc-linea,
    .hc-dibujo[data-dibuja="true"] .hc-antes,
    .hc-dibujo[data-dibuja="true"] .hc-base,
    .hc-dibujo[data-dibuja="true"] .hc-brillo,
    .hc-dibujo[data-dibuja="true"] .hc-final,
    .hc-dibujo[data-dibuja="true"] .hc-marca-ahora { animation: hc-aparece 200ms ease backwards; }
    .hc-pulso { animation: none; opacity: 0; }
}
`

/* ── La curva ──────────────────────────────────────────────────
   Monótona en x (la misma de d3, monotoneX): entre dos puntos no
   inventa subidas ni bajadas que no pasaron. Cada tramo es una curva
   de Bézier; tenerlos sueltos deja recorrer la línea al revés para
   cerrar el brillo entre las dos. */
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
const haciaAtras = (c: Curva[]) => c.slice().reverse().map(([x, y, a, b, d, e]) => `C${r(d)},${r(e)} ${r(a)},${r(b)} ${r(x)},${r(y)}`).join('')
const desde = (p: Punto) => `M${r(p[0])},${r(p[1])}`

/* ── Los textos ─────────────────────────────────────────────── */
const hora = (t: number) => new Date(t).toLocaleTimeString('es-CO', enColombia(t).minuto
    ? { hour: 'numeric', minute: '2-digit', timeZone: ZONA_COLOMBIA }
    : { hour: 'numeric', timeZone: ZONA_COLOMBIA })
const diaCorto = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: ZONA_COLOMBIA }).replace('.', '')
const diaLargo = (t: number) => new Date(t).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ZONA_COLOMBIA }).replace(/\./g, '')

/** Cuándo es el punto, en la etiqueta del dedo */
function cuando(p: PuntoLinea, paso: LineaInicio['paso'], ultimo: boolean, enVivo: boolean) {
    if (ultimo && enVivo) return paso === 'hora' ? 'Ahora' : 'Hoy'
    if (paso === 'hora') return hora(p.t)
    if (paso === 'semana') return `Hasta el ${diaCorto(p.t)}`
    return diaLargo(p.t)
}

export default function HeroChart({ linea, clave, comparacion, enVivo, variante, alto, dibujar }: {
    /** null mientras carga el periodo */
    linea: LineaInicio | null
    /** El periodo de esa línea: al cambiar, la gráfica se vuelve a dibujar */
    clave: string
    /** Los nombres de la leyenda; null en Hoy */
    comparacion: Comparacion | null
    /** La línea termina ahora (no en el final de unas fechas que ya pasaron) */
    enVivo: boolean
    variante: Variante
    /** En px, el alto de la gráfica (la leyenda va aparte); o una medida de CSS para todo, con la leyenda adentro */
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
    const conLeyenda = !!(linea?.anterior && comparacion)

    // Todo lo que se dibuja, en píxeles
    const geo = useMemo(() => {
        if (!linea || tam.w === 0 || tam.h === 0) return null
        const { w, h } = tam
        // A la derecha queda aire para el punto que late; en el celular, el margen de la pantalla
        const der = movil ? 16 : 8
        const arriba = hoy ? ARRIBA_HOY : ARRIBA
        const abajo = h - EJE
        const valores = [...linea.actual, ...(linea.anterior ?? [])].map(p => p.valor)
        const max = Math.max(0, ...valores)
        const min = Math.min(0, ...valores)
        const rango = max - min || 1
        const ancho = linea.hasta - linea.desde || 1
        const x = (v: number) => ((v - linea.desde) / ancho) * (w - der)
        const y = (v: number) => abajo - ((v - min) / rango) * (abajo - arriba)

        const pa: Punto[] = linea.actual.map(p => [x(p.x), y(p.valor)])
        const ca = curvas(pa)
        const pb: Punto[] | null = linea.anterior ? linea.anterior.map(p => [x(p.x), y(p.valor)]) : null
        const cb = pb ? curvas(pb) : null

        // El brillo va entre las dos líneas, hasta donde llegan las dos. Se
        // recorta en dos: arriba de la línea anterior (vas adelante, verde) y
        // debajo (vas atrás, casi nada)
        let brillo: { forma: string; adelante: string; atras: string } | null = null
        if (pb && cb) {
            const k = Math.min(pa.length, pb.length)
            if (k >= 2) {
                const ca2 = ca.slice(0, k - 1)
                const cb2 = cb.slice(0, k - 1)
                const lineaB = desde(pb[0]) + haciaAdelante(cb2)
                const [xi, xf] = [r(pb[0][0]), r(pb[k - 1][0])]
                brillo = {
                    forma: desde(pa[0]) + haciaAdelante(ca2) + `L${r(pb[k - 1][0])},${r(pb[k - 1][1])}` + haciaAtras(cb2) + 'Z',
                    adelante: lineaB + `L${xf},${-h}L${xi},${-h}Z`,
                    atras: lineaB + `L${xf},${2 * h}L${xi},${2 * h}Z`,
                }
            }
        }
        return {
            w, h, der, arriba, abajo, pa, pb,
            lineaA: desde(pa[0]) + haciaAdelante(ca),
            lineaB: pb && cb ? desde(pb[0]) + haciaAdelante(cb) : null,
            brillo,
        }
    }, [linea, tam, movil, hoy])

    // Al pasar el mouse o deslizar el dedo: el punto más cercano
    const [foco, setFoco] = useState<number | null>(null)
    const leible = !!linea && !(linea.vacia && !linea.anterior)
    const mover = useCallback((e: PunteroReact<HTMLDivElement>) => {
        if (!geo || !linea || !leible) return
        const px = e.clientX - e.currentTarget.getBoundingClientRect().left
        let mejor: number | null = null
        let distancia = Infinity
        linea.actual.forEach((p, i) => {
            if (p.fuera) return
            const d = Math.abs(geo.pa[i][0] - px)
            if (d < distancia) { distancia = d; mejor = i }
        })
        setFoco(mejor)
    }, [geo, linea, leible])
    const soltar = useCallback(() => setFoco(null), [])
    // Con el mouse la etiqueta sigue mientras esté encima; con el dedo se va al soltar
    const alSoltar = useCallback((e: PunteroReact<HTMLDivElement>) => { if (e.pointerType !== 'mouse') setFoco(null) }, [])

    const numerico = typeof alto === 'number'
    const ultimo = linea ? linea.actual[linea.actual.length - 1] : null
    const puntoFinal = geo ? geo.pa[geo.pa.length - 1] : null
    const focoPunto = linea && foco !== null ? linea.actual[foco] : null
    const focoAntes = focoPunto && linea?.anterior ? linea.anterior.find(p => p.x === focoPunto.x) ?? null : null

    return (
        <div className="hc-raiz" style={numerico ? undefined : { height: alto, display: 'flex', flexDirection: 'column' }}>
            <style>{CSS}</style>
            <div ref={plotRef} className="hc-plot" style={numerico ? { height: alto } : { flex: 1, minHeight: 0 }}
                onPointerDown={mover} onPointerMove={mover} onPointerLeave={soltar} onPointerUp={alSoltar} onPointerCancel={soltar}>
                {linea && geo && ultimo && puntoFinal && (
                    // Cambia de periodo → se monta de nuevo y se vuelve a dibujar
                    <div key={clave} data-dibuja={dibujar} className="hc-dibujo">
                        <svg className="hc-svg" width={geo.w} height={geo.h} aria-hidden>
                            <defs>
                                <linearGradient id={`${id}-trazo`} gradientUnits="userSpaceOnUse" x1={geo.pa[0][0]} y1={0} x2={puntoFinal[0]} y2={0}>
                                    <stop offset="0%" className="hc-tinta" stopOpacity={0.3} />
                                    <stop offset="100%" className="hc-tinta" stopOpacity={1} />
                                </linearGradient>
                                <linearGradient id={`${id}-luz`} gradientUnits="userSpaceOnUse" x1={0} y1={geo.arriba} x2={0} y2={geo.abajo}>
                                    <stop offset="0%" className="hc-tinta" stopOpacity={0.16} />
                                    <stop offset="100%" className="hc-tinta" stopOpacity={0} />
                                </linearGradient>
                                {geo.brillo && (
                                    <>
                                        <clipPath id={`${id}-adelante`}><path d={geo.brillo.adelante} /></clipPath>
                                        <clipPath id={`${id}-atras`}><path d={geo.brillo.atras} /></clipPath>
                                    </>
                                )}
                            </defs>

                            {geo.brillo && (
                                <g className="hc-brillo hc-capa">
                                    <path d={geo.brillo.forma} fill={`url(#${id}-luz)`} clipPath={`url(#${id}-adelante)`} />
                                    <path d={geo.brillo.forma} className="hc-detras" clipPath={`url(#${id}-atras)`} />
                                </g>
                            )}
                            {geo.lineaB && <path d={geo.lineaB} className="hc-antes hc-capa" />}
                            {linea.vacia
                                ? <path d={geo.lineaA} className="hc-base hc-capa" />
                                : <path d={geo.lineaA} pathLength={1} className="hc-linea hc-capa" stroke={`url(#${id}-trazo)`} />}

                            {/* En Hoy, la hora de ahora */}
                            {hoy && enVivo && (
                                <g className="hc-marca-ahora hc-capa">
                                    <line x1={puntoFinal[0]} x2={puntoFinal[0]} y1={geo.arriba - 6} y2={geo.abajo} className="hc-ahora" />
                                    <text x={Math.min(geo.w - (movil ? 16 : 0), puntoFinal[0] + 12)} y={11} textAnchor="end" className="hc-eje">Ahora</text>
                                </g>
                            )}

                            {/* Abajo, solo dónde empieza y dónde termina */}
                            <g className="hc-capa">
                                <text x={movil ? 16 : 0} y={geo.h - 6} textAnchor="start" className="hc-eje">
                                    {hoy ? hora(linea.actual[0].t) : diaCorto(linea.actual[0].t)}
                                </text>
                                <text x={Math.min(geo.w - (movil ? 16 : 0), puntoFinal[0] + (movil ? 0 : geo.der))} y={geo.h - 6} textAnchor="end" className="hc-eje">
                                    {hoy ? hora(ultimo.t) : enVivo ? 'Hoy' : diaCorto(ultimo.t)}
                                </text>
                            </g>

                            {/* El punto que late al final de la línea */}
                            <g className="hc-final hc-capa">
                                <circle cx={puntoFinal[0]} cy={puntoFinal[1]} r={4.5} className="hc-pulso" />
                                <circle cx={puntoFinal[0]} cy={puntoFinal[1]} r={6.5} className="hc-anillo" />
                                <circle cx={puntoFinal[0]} cy={puntoFinal[1]} r={4.5} className="hc-punto" />
                            </g>

                            {focoPunto && foco !== null && (
                                <g>
                                    <line x1={geo.pa[foco][0]} x2={geo.pa[foco][0]} y1={geo.arriba - 6} y2={geo.abajo} className="hc-cursor" />
                                    {focoAntes && geo.pb && (
                                        <circle cx={geo.pa[foco][0]} cy={geo.pb[linea.anterior!.indexOf(focoAntes)][1]} r={3} className="hc-foco-antes" />
                                    )}
                                    <circle cx={geo.pa[foco][0]} cy={geo.pa[foco][1]} r={4} className="hc-foco" />
                                </g>
                            )}
                        </svg>

                        {focoPunto && foco !== null && (
                            <div className="hc-globo" style={{
                                left: geo.pa[foco][0],
                                transform: `translateX(${geo.pa[foco][0] < 90 ? '0' : geo.pa[foco][0] > geo.w - 90 ? '-100%' : '-50%'})`,
                            }}>
                                <p className="hc-globo-cuando">{cuando(focoPunto, linea.paso, foco === linea.actual.length - 1, enVivo)}</p>
                                <p className="hc-globo-valor">Llevabas {formatPrecio(focoPunto.valor)}</p>
                                {focoAntes && comparacion && (
                                    <p className="hc-globo-antes">{comparacion.globo}: {formatPrecio(focoAntes.valor)}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {conLeyenda && comparacion && (
                <div className="hc-leyenda" data-variante={variante}>
                    <span className="hc-ley"><i className="hc-ley-actual" aria-hidden />{comparacion.actual}</span>
                    <span className="hc-ley"><i className="hc-ley-antes" aria-hidden />{comparacion.anterior}</span>
                </div>
            )}
        </div>
    )
}
