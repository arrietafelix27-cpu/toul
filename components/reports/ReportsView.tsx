'use client'

import type { CSSProperties, ReactNode } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { Desplegable, SelectorPeriodo, type Variante } from '@/components/dashboard/Desplegable'
import { ENTRADA_INICIO_CSS, entrada } from '@/lib/motion'
import { formatPrecio } from '@/lib/utils'
import { capitalizeFirst } from '@/lib/format/text'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { contraQue, type Periodo, type Rango, type Tramo } from '@/lib/periodos'
import { conOtros, deCada100, formatoCorto, porcentajeTendencia, proyeccion, resumir, type ResumenReporte } from '@/lib/reports/calculos'
import type { MesReporte, ReporteSQL } from '@/lib/reports/types'

/* ══════════════════════════════════════════════════════════════
   Reportes: ¿cómo me fue y por qué?

   Arriba, cuánto ganaste y cómo va. Debajo, cuatro números que lo
   explican; la plata que entró y salió; el mes a mes; de cada $100
   qué se fue en mercancía, en gastos y qué te quedó; y en qué
   gastaste, qué te dejó más y cómo te pagan.

   Sin cajas: lo separa una línea de 1 px. El verde es solo para lo
   ganado, la plata que entró, las barras de ganancia, el método que
   más trae y la flecha cuando sube.
   ══════════════════════════════════════════════════════════════ */

const CSS = ENTRADA_INICIO_CSS + `
.rp-raiz { container-type: inline-size; }
.rp { width: 100%; max-width: 1440px; margin: 0 auto; padding: 20px 16px 128px; }

.rp-cabeza { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.rp-titulo { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--toul-text); }
.rp-pildoras { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.rp-principal { margin-top: 28px; }
.rp-rotulo { margin: 0; font-size: 13px; letter-spacing: -0.01em; color: var(--toul-text-subtle); }
.rp-ganaste { margin: 6px 0 0; font-size: 44px; font-weight: 700; letter-spacing: -2px; line-height: 1.04;
    font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-tendencia { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 12px 0 0; font-size: 13px; color: var(--toul-text-subtle); }
.rp-tendencia-pct { color: var(--toul-text); font-weight: 600; font-variant-numeric: tabular-nums; margin-right: 2px; }
.rp-proyeccion { margin: 8px 0 0; font-size: 14px; line-height: 1.45; color: var(--toul-text-subtle); }
.rp-proyeccion b { font-weight: 600; color: var(--toul-text); white-space: nowrap; }

.rp-linea { height: 1px; border: none; background: var(--toul-border); margin: 28px 0; }

.rp-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 22px; }
.rp-kpi { min-width: 0; padding: 0 0 0 16px; border-left: 1px solid var(--toul-border); }
.rp-kpi:nth-child(odd) { padding-left: 0; border-left: none; padding-right: 16px; }
.rp-kpi-rotulo { margin: 0; font-size: 12px; color: var(--toul-text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-kpi-valor { margin: 6px 0 0; font-size: 21px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2; color: var(--toul-text);
    font-variant-numeric: tabular-nums; white-space: nowrap; }

.rp-h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.4px; line-height: 1.25; color: var(--toul-text); }
.rp-sec-cabeza { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.rp-medio, .rp-abajo { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 44px; }
.rp-col { min-width: 0; }
.rp-derecha { display: flex; flex-direction: column; gap: 44px; }
.rp-vacio { margin: 0; font-size: 14px; line-height: 1.5; color: var(--toul-text-dim); }

/* Tu plata */
.rp-barras { display: flex; flex-direction: column; gap: 16px; margin-bottom: 28px; }
.rp-barra-fila { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.rp-barra-rotulo { font-size: 13px; color: var(--toul-text-muted); }
.rp-barra-monto { font-size: 15px; font-weight: 600; color: var(--toul-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-pista { position: relative; border-radius: 999px; background: var(--toul-surface-3); overflow: hidden; }
.rp-relleno { position: absolute; inset: 0; clip-path: inset(0 var(--rp-resto, 100%) 0 0 round 999px);
    transition: clip-path 600ms var(--toul-ease-emil); }
.rp-crece-x { animation: rp-crece-x 900ms cubic-bezier(0.23, 1, 0.32, 1) backwards; animation-delay: var(--rp-d, 0ms); }
@keyframes rp-crece-x { from { clip-path: inset(0 100% 0 0 round 999px); } }

.rp-grupo + .rp-grupo { margin-top: 26px; }
.rp-grupo-titulo { margin: 0 0 4px; font-size: 13px; color: var(--toul-text-subtle); }
.rp-fila { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 7px 0; font-size: 14px; color: var(--toul-text); }
.rp-fila-sub { padding-left: 14px; font-size: 13.5px; color: var(--toul-text-muted); }
.rp-fila-valor { font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-fila-total { margin-top: 6px; padding-top: 13px; border-top: 1px solid var(--toul-border); font-size: 15px; font-weight: 600; }
.rp-fila-nota { display: block; margin-top: 2px; font-size: 12px; font-weight: 400; color: var(--toul-text-dim); }

/* Mes a mes */
.rp-leyenda { display: flex; align-items: center; gap: 14px; font-size: 12px; color: var(--toul-text-subtle); }
.rp-leyenda span { display: inline-flex; align-items: center; gap: 6px; }
.rp-punto { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
.rp-meses { display: grid; grid-template-columns: repeat(var(--rp-n), minmax(0, 1fr)); column-gap: 10px; }
.rp-mes { display: flex; flex-direction: column; align-items: center; min-width: 0; }
.rp-mes-area { position: relative; width: min(100%, 48px); height: 170px; margin-top: 24px; }
.rp-mes-ventas, .rp-mes-ganancia { position: absolute; bottom: 0; height: 100%;
    transition: clip-path 600ms var(--toul-ease-emil); }
.rp-mes-ventas { left: 0; right: 0; background: color-mix(in srgb, var(--toul-text) 12%, transparent);
    clip-path: inset(var(--rp-arriba, 100%) 0 0 0 round 6px); }
.rp-mes-ganancia { left: 32%; right: 32%; background: color-mix(in srgb, var(--toul-accent) 55%, transparent);
    clip-path: inset(var(--rp-arriba, 100%) 0 0 0 round 4px); }
.rp-mes[data-actual="true"] .rp-mes-ventas { background: color-mix(in srgb, var(--toul-text) 20%, transparent); }
.rp-mes[data-actual="true"] .rp-mes-ganancia { background: var(--toul-accent); }
.rp-crece-y { animation: rp-crece-y 900ms cubic-bezier(0.23, 1, 0.32, 1) backwards; animation-delay: var(--rp-d, 0ms); }
@keyframes rp-crece-y { from { clip-path: inset(100% 0 0 0 round 6px); } }
.rp-mes-valor { position: absolute; left: 50%; transform: translateX(-50%); margin-bottom: 6px; font-size: 12px; font-weight: 600;
    color: var(--toul-text); white-space: nowrap; font-variant-numeric: tabular-nums;
    animation: rp-aparece 400ms ease-out backwards; animation-delay: var(--rp-d, 0ms); }
@keyframes rp-aparece { from { opacity: 0; } }
.rp-mes-nombre { margin-top: 10px; font-size: 12px; color: var(--toul-text-subtle); }
.rp-mes[data-actual="true"] .rp-mes-nombre { color: var(--toul-text); font-weight: 600; }

/* De cada $100 */
.rp-cien { display: flex; gap: 3px; height: 12px; border-radius: 6px; overflow: hidden;
    animation: rp-crece-x 900ms cubic-bezier(0.23, 1, 0.32, 1) backwards; animation-delay: var(--rp-d, 0ms); }
.rp-cien-tramo { height: 100%; border-radius: 3px; transition: flex-basis 600ms var(--toul-ease-emil); }
.rp-cien-leyenda { display: flex; flex-direction: column; gap: 2px; margin-top: 16px; }
.rp-cien-fila { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; color: var(--toul-text-muted); }
.rp-cien-fila b { margin-left: auto; font-weight: 600; color: var(--toul-text); font-variant-numeric: tabular-nums; }
.rp-perdida { margin: 10px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--toul-error); }

/* Listas */
.rp-lista { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 0; list-style: none; }
.rp-item { min-width: 0; }
.rp-item-cabeza { display: flex; align-items: baseline; gap: 10px; }
.rp-pos { flex-shrink: 0; width: 14px; font-size: 13px; color: var(--toul-text-dim); font-variant-numeric: tabular-nums; }
.rp-item-texto { flex: 1; min-width: 0; }
.rp-item-nombre { display: block; font-size: 14px; color: var(--toul-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-item-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--toul-text-subtle); }
.rp-item-monto { flex-shrink: 0; font-size: 14px; font-weight: 600; color: var(--toul-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-item .rp-pista { margin-top: 9px; }

/* Cómo te pagan */
.rp-dona-caja { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
.rp-dona { position: relative; width: 136px; height: 136px; flex-shrink: 0; }
.rp-dona svg { display: block; width: 100%; height: 100%; transform: rotate(-90deg); }
.rp-dona circle { fill: none; stroke-width: 14; }
.rp-dona-tramo { animation: rp-dona 520ms cubic-bezier(0.23, 1, 0.32, 1) backwards; animation-delay: var(--rp-d, 0ms);
    transition: stroke-dasharray 600ms var(--toul-ease-emil), stroke-dashoffset 600ms var(--toul-ease-emil); }
@keyframes rp-dona { from { stroke-dasharray: 0 100; } }
.rp-dona-centro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.rp-dona-monto { font-size: 17px; font-weight: 700; letter-spacing: -0.4px; color: var(--toul-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rp-dona-sub { margin-top: 1px; font-size: 12px; color: var(--toul-text-subtle); }
.rp-metodos { flex: 1 1 210px; min-width: 0; display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; list-style: none; }
.rp-metodo { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 14px; color: var(--toul-text); }
.rp-metodo-nombre { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-metodo-pct { color: var(--toul-text-subtle); font-variant-numeric: tabular-nums; }
.rp-metodo-monto { margin-left: auto; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Descargar */
.dz-opcion.rp-opcion { padding-top: 9px; padding-bottom: 9px; }
.rp-opcion-texto { display: flex; flex-direction: column; gap: 3px; text-align: left; line-height: 1.25; }
.rp-opcion-texto small { font-size: 12px; font-weight: 400; color: var(--toul-text-subtle); }
.rp-opcion-icono { flex-shrink: 0; color: var(--toul-text-muted); }

.rp-error { display: flex; align-items: flex-start; gap: 12px; margin-top: 24px; padding: 14px 16px; border-radius: 16px;
    background: var(--toul-warning-dim); }
.rp-reintentar { display: inline-flex; align-items: center; gap: 6px; height: 32px; margin-top: 10px; padding: 0 13px; border-radius: 10px;
    border: none; background: var(--toul-surface-2); color: var(--toul-text-muted); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }

@container (min-width: 720px) {
    .rp { padding: 28px 32px 48px; }
    .rp-cabeza { flex-direction: row; align-items: center; justify-content: space-between; }
    .rp-titulo { font-size: 28px; letter-spacing: -0.9px; }
    .rp-principal { margin-top: 24px; }
    .rp-ganaste { font-size: 52px; }
    .rp-linea { margin: 32px 0; }
    .rp-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .rp-kpi:nth-child(n) { padding: 0 24px; border-left: 1px solid var(--toul-border); }
    .rp-kpi:first-child { padding-left: 0; border-left: none; }
    .rp-medio { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .rp-medio > :first-child { padding-right: clamp(24px, 3vw, 48px); }
    .rp-medio > :last-child { padding-left: clamp(24px, 3vw, 48px); border-left: 1px solid var(--toul-border); }
    .rp-abajo { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .rp-abajo > :nth-child(1) { padding-right: 32px; }
    .rp-abajo > :nth-child(2) { padding-left: 32px; border-left: 1px solid var(--toul-border); }
    .rp-abajo > :nth-child(3) { grid-column: 1 / -1; }
}
@container (min-width: 960px) {
    .rp-abajo { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .rp-abajo > :nth-child(2) { padding-right: 32px; }
    .rp-abajo > :nth-child(3) { grid-column: auto; padding-left: 32px; border-left: 1px solid var(--toul-border); }
}
@media (hover: hover) and (pointer: fine) {
    .rp-reintentar:hover { color: var(--toul-text); }
}
@media (prefers-reduced-motion: reduce) {
    .rp-crece-x, .rp-crece-y, .rp-cien, .rp-dona-tramo { animation: rp-aparece 200ms ease backwards; }
    .rp-relleno, .rp-mes-ventas, .rp-mes-ganancia, .rp-cien-tramo, .rp-dona-tramo { transition: none; }
}
`

/** Los tonos de la dona y su leyenda: el que más trae en verde, los demás en blanco cada vez más tenue */
const TONOS = [
    'var(--toul-accent)',
    'color-mix(in srgb, var(--toul-text) 55%, transparent)',
    'color-mix(in srgb, var(--toul-text) 36%, transparent)',
    'color-mix(in srgb, var(--toul-text) 22%, transparent)',
    'color-mix(in srgb, var(--toul-text) 13%, transparent)',
]

const pct = (v: number) => `${Math.round(v)}%`
const restante = (fraccion: number) => `${Math.round((1 - Math.min(Math.max(fraccion, 0), 1)) * 1000) / 10}%`
const estilo = (vars: Record<string, string | number>) => vars as CSSProperties

function nombreCategoria(valor: string): string {
    return EXPENSE_CATEGORIES.find(c => c.value === valor)?.label ?? capitalizeFirst(valor)
}

function mesCorto(iso: string): string {
    const [y, m] = iso.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
}

/** "cierras octubre", "cierras la semana", "cierras 2026" */
function cierre(periodo: Periodo, desde: Date): string {
    if (periodo === 'week') return 'cierras la semana'
    if (periodo === 'year') return `cierras ${desde.getFullYear()}`
    return `cierras ${desde.toLocaleDateString('es-CO', { month: 'long' })}`
}

export function ReportsView({
    variante, periodo, setPeriodo, rango, setRango, tramo,
    actual, anterior, clave, meses, inventario,
    cargando, error, reintentar, descargar, descargando,
}: {
    variante: Variante
    periodo: Periodo
    setPeriodo: (p: Periodo) => void
    rango: Rango
    setRango: (r: Rango) => void
    tramo: Tramo
    actual: ReporteSQL | null
    anterior: ReporteSQL | null
    /** Cambia cuando llega otro periodo: ahí los montos vuelven a contar */
    clave: string
    meses: MesReporte[] | null
    inventario: number | null
    cargando: boolean
    error: boolean
    reintentar: () => void
    descargar: (formato: 'excel' | 'pdf') => void
    descargando: boolean
}) {
    const r = actual ? resumir(actual) : null
    const antes = anterior ? resumir(anterior) : null
    const lado = variante === 'pc' ? 'derecha' : 'izquierda'

    return (
        <div className="rp-raiz">
            <style>{CSS}</style>
            <div className="rp">
                <header {...entrada(0, true, 'rp-cabeza')}>
                    <h1 className="rp-titulo">Reportes</h1>
                    <div className="rp-pildoras">
                        <SelectorPeriodo variante={variante} forma="boton" conAno lado={lado}
                            period={periodo} setPeriod={setPeriodo} rango={rango} setRango={setRango} />
                        <Desplegable variante={variante} titulo="Descargar" claseBoton="dz-pildora" lado={lado}
                            boton={<><Download size={15} strokeWidth={2.2} /> {descargando ? 'Descargando…' : 'Descargar'}</>}
                            contenido={cerrar => (
                                <div className="dz-lista" data-variante={variante}>
                                    {([
                                        { formato: 'excel', icono: FileSpreadsheet, titulo: 'Excel', sub: 'Resumen y cada venta' },
                                        { formato: 'pdf', icono: FileText, titulo: 'PDF', sub: 'Resumen para compartir' },
                                    ] as const).map(o => (
                                        <button key={o.formato} type="button" className="dz-opcion rp-opcion" disabled={!actual || descargando}
                                            onClick={() => { cerrar(); descargar(o.formato) }}>
                                            <span className="rp-opcion-texto">
                                                {o.titulo}
                                                <small>{o.sub}</small>
                                            </span>
                                            <o.icono size={18} strokeWidth={1.9} className="rp-opcion-icono" />
                                        </button>
                                    ))}
                                </div>
                            )} />
                    </div>
                </header>

                {error && (
                    <div className="rp-error" role="alert">
                        <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0, marginTop: 1 }} />
                        <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--toul-text)' }}>No se pudieron cargar tus números</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--toul-text-dim)' }}>
                                Revisa tu conexión y vuelve a intentar.
                            </p>
                            <button type="button" className="rp-reintentar" onClick={reintentar}>
                                <RefreshCw size={13} /> Volver a intentar
                            </button>
                        </div>
                    </div>
                )}

                <Principal r={r} antes={antes} anteriorVentas={anterior?.ventas.cantidad ?? 0}
                    periodo={periodo} tramo={tramo} clave={clave} cargando={cargando} />

                <hr className="rp-linea" />

                <div {...entrada(2, true, 'rp-kpis')}>
                    <Kpi rotulo="Margen promedio" valor={r?.margen ?? null} formato={pct} clave={clave} cargando={cargando} />
                    <Kpi rotulo="Ticket promedio" valor={r?.ticket ?? null} formato={formatPrecio} clave={clave} cargando={cargando} />
                    <Kpi rotulo="Vendiste a crédito" valor={r?.pctCredito ?? null} formato={pct} clave={clave} cargando={cargando} />
                    <Kpi rotulo="Plata en mercancía" valor={inventario} formato={formatPrecio} clave="inventario" cargando={inventario === null} />
                </div>

                <hr className="rp-linea" />

                <div className="rp-medio">
                    <section {...entrada(3, true, 'rp-col')} aria-labelledby="rp-tu-plata">
                        <TuPlata r={r} clave={clave} cargando={cargando} />
                    </section>
                    <div {...entrada(4, true, 'rp-col rp-derecha')}>
                        <MesAMes meses={meses} />
                        <DeCadaCien r={r} cargando={cargando} />
                    </div>
                </div>

                <hr className="rp-linea" />

                <div className="rp-abajo">
                    <section {...entrada(5, true, 'rp-col')}>
                        <EnQueGastaste filas={actual?.gastosPorCategoria ?? null} cargando={cargando} />
                    </section>
                    <section {...entrada(6, true, 'rp-col')}>
                        <QueTeDejoMas filas={actual?.productos ?? null} cargando={cargando} />
                    </section>
                    <section {...entrada(7, true, 'rp-col')}>
                        <ComoTePagan filas={actual?.metodos ?? null} total={r?.entro ?? 0} cargando={cargando} />
                    </section>
                </div>
            </div>
        </div>
    )
}

/* ── Lo que ganaste ─────────────────────────────────────────── */

function Principal({ r, antes, anteriorVentas, periodo, tramo, clave, cargando }: {
    r: ResumenReporte | null
    antes: ResumenReporte | null
    anteriorVentas: number
    periodo: Periodo
    tramo: Tramo
    clave: string
    cargando: boolean
}) {
    const ganaste = r?.ganaste ?? 0
    const perdio = ganaste < 0
    const nada = !r || (r.cantidad === 0 && r.gastos === 0)
    const tendencia = r && antes
        ? porcentajeTendencia({ ahora: r.ganaste, antes: antes.ganaste, ventasAntes: anteriorVentas })
        : null
    const desde = tramo.from ? new Date(tramo.from) : null
    const aEsteRitmo = r && desde ? proyeccion({ periodo, desde, ahora: new Date(), ganado: r.ganaste }) : null

    return (
        <div {...entrada(1, true, 'rp-principal')}>
            <p className="rp-rotulo">{perdio ? 'Perdiste' : 'Ganaste'}</p>
            {cargando ? (
                <div style={{ marginTop: 10 }}><Skeleton width="240px" height="3rem" /></div>
            ) : (
                <AnimatedNumber value={Math.abs(ganaste)} formatter={formatPrecio} cuenta clave={clave}
                    className="rp-ganaste"
                    style={{
                        display: 'grid', justifyContent: 'start',
                        color: nada ? 'var(--toul-text-dim)' : perdio ? 'var(--toul-error)' : ganaste > 0 ? 'var(--toul-accent)' : 'var(--toul-text)',
                    }} />
            )}
            {!cargando && tendencia !== null && (
                <p className="rp-tendencia">
                    {tendencia > 0 && <ArrowUpRight size={16} strokeWidth={2.6} style={{ color: 'var(--toul-accent)' }} aria-label="Sube" />}
                    {tendencia < 0 && <ArrowDownRight size={16} strokeWidth={2.6} style={{ color: 'var(--toul-error)' }} aria-label="Baja" />}
                    <span className="rp-tendencia-pct">{Math.abs(tendencia)}%</span>
                    {contraQue(periodo, tramo)}
                </p>
            )}
            {!cargando && aEsteRitmo !== null && desde && (
                <p className="rp-proyeccion">
                    A este ritmo {cierre(periodo, desde)} ganando cerca de <b>{formatoCorto(aEsteRitmo)}</b>
                </p>
            )}
        </div>
    )
}

function Kpi({ rotulo, valor, formato, clave, cargando }: {
    rotulo: string
    valor: number | null
    formato: (v: number) => string
    clave: string
    cargando: boolean
}) {
    return (
        <div className="rp-kpi">
            <p className="rp-kpi-rotulo">{rotulo}</p>
            {cargando
                ? <div style={{ marginTop: 9 }}><Skeleton width="90px" height="1.3rem" /></div>
                : valor === null
                    ? <p className="rp-kpi-valor" style={{ color: 'var(--toul-text-dim)' }}>—</p>
                    : <AnimatedNumber value={valor} formatter={formato} cuenta clave={clave} className="rp-kpi-valor"
                        style={{ display: 'grid', justifyContent: 'start' }} />}
        </div>
    )
}

/* ── Tu plata ───────────────────────────────────────────────── */

function Barra({ fraccion, color, alto, retraso = 0 }: { fraccion: number; color: string; alto: number; retraso?: number }) {
    return (
        <div className="rp-pista" style={{ height: alto }}>
            <div className="rp-relleno rp-crece-x"
                style={{ ...estilo({ '--rp-resto': restante(fraccion), '--rp-d': `${retraso}ms` }), background: color }} />
        </div>
    )
}

function Fila({ rotulo, valor, sub, total, color, nota }: {
    rotulo: string
    valor: number
    sub?: boolean
    total?: boolean
    color?: string
    nota?: string
}) {
    return (
        <div className={`rp-fila${sub ? ' rp-fila-sub' : ''}${total ? ' rp-fila-total' : ''}`}>
            <span>
                {rotulo}
                {nota && <span className="rp-fila-nota">{nota}</span>}
            </span>
            <span className="rp-fila-valor" style={color ? { color } : undefined}>{formatPrecio(valor)}</span>
        </div>
    )
}

function TuPlata({ r, clave, cargando }: { r: ResumenReporte | null; clave: string; cargando: boolean }) {
    const mayor = Math.max(r?.entro ?? 0, r?.salio ?? 0, 1)

    return (
        <>
            <div className="rp-sec-cabeza"><h2 className="rp-h2" id="rp-tu-plata">Tu plata</h2></div>
            {cargando || !r ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Skeleton height="2.6rem" /><Skeleton height="2.6rem" /><Skeleton height="10rem" />
                </div>
            ) : (
                <>
                    <div className="rp-barras">
                        <div>
                            <div className="rp-barra-fila">
                                <span className="rp-barra-rotulo">Entró</span>
                                <AnimatedNumber value={r.entro} formatter={formatPrecio} cuenta clave={clave} className="rp-barra-monto" />
                            </div>
                            <Barra fraccion={r.entro / mayor} color="var(--toul-accent)" alto={8} />
                        </div>
                        <div>
                            <div className="rp-barra-fila">
                                <span className="rp-barra-rotulo">Salió</span>
                                <AnimatedNumber value={r.salio} formatter={formatPrecio} cuenta clave={clave} className="rp-barra-monto" />
                            </div>
                            <Barra fraccion={r.salio / mayor} color="color-mix(in srgb, var(--toul-text) 55%, transparent)" alto={8} retraso={90} />
                        </div>
                    </div>

                    <div className="rp-grupo">
                        <p className="rp-grupo-titulo">Entradas</p>
                        <Fila rotulo="Vendiste" valor={r.vendiste} />
                        <Fila rotulo="De contado" valor={r.contado} sub />
                        <Fila rotulo="A crédito" valor={r.credito} sub />
                        <Fila rotulo="Abonos que te hicieron" valor={r.abonos} />
                        <Fila rotulo="Plata que entró" valor={r.entro} total color="var(--toul-accent)" nota="De contado + abonos" />
                    </div>

                    <div className="rp-grupo">
                        <p className="rp-grupo-titulo">Salidas</p>
                        <Fila rotulo="Gastos" valor={r.gastos} />
                        <Fila rotulo="Mercancía que pagaste" valor={r.mercancia} />
                        {r.devuelto > 0 && <Fila rotulo="Devoluciones" valor={r.devuelto} />}
                        <Fila rotulo="Plata que salió" valor={r.salio} total />
                    </div>
                </>
            )}
        </>
    )
}

/* ── Mes a mes ──────────────────────────────────────────────── */

function MesAMes({ meses }: { meses: MesReporte[] | null }) {
    const mayor = Math.max(...(meses ?? []).map(m => Math.max(m.ventas, m.ganancia, 0)), 1)

    return (
        <section aria-labelledby="rp-mes-a-mes">
            <div className="rp-sec-cabeza">
                <h2 className="rp-h2" id="rp-mes-a-mes">Mes a mes</h2>
                <div className="rp-leyenda" aria-hidden>
                    <span><i className="rp-punto" style={{ background: 'color-mix(in srgb, var(--toul-text) 20%, transparent)' }} />Ventas</span>
                    <span><i className="rp-punto" style={{ background: 'var(--toul-accent)' }} />Ganancia</span>
                </div>
            </div>
            {meses === null ? (
                <Skeleton height="200px" />
            ) : meses.length === 0 ? (
                <p className="rp-vacio">Aún no hay ventas</p>
            ) : (
                <div className="rp-meses" style={estilo({ '--rp-n': meses.length })} role="list">
                    {meses.map((m, i) => {
                        const actual = i === meses.length - 1
                        const ventas = Math.max(m.ventas, 0) / mayor
                        const ganancia = Math.max(m.ganancia, 0) / mayor
                        const retraso = `${i * 70}ms`
                        return (
                            <div key={m.mes} className="rp-mes" data-actual={actual} role="listitem"
                                aria-label={`${mesCorto(m.mes)}: vendiste ${formatPrecio(m.ventas)}, ganaste ${formatPrecio(m.ganancia)}`}>
                                <div className="rp-mes-area">
                                    <div className="rp-mes-ventas rp-crece-y"
                                        style={estilo({ '--rp-arriba': restante(ventas), '--rp-d': retraso })} />
                                    <div className="rp-mes-ganancia rp-crece-y"
                                        style={estilo({ '--rp-arriba': restante(ganancia), '--rp-d': `${i * 70 + 120}ms` })} />
                                    {actual && (
                                        <span className="rp-mes-valor"
                                            style={estilo({ bottom: `${Math.round(ventas * 1000) / 10}%`, '--rp-d': `${i * 70 + 500}ms` })}>
                                            {formatoCorto(m.ventas)}
                                        </span>
                                    )}
                                </div>
                                <span className="rp-mes-nombre">{mesCorto(m.mes)}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

/* ── De cada $100 ───────────────────────────────────────────── */

function DeCadaCien({ r, cargando }: { r: ResumenReporte | null; cargando: boolean }) {
    const cien = r ? deCada100({ ventas: r.ventasNetas, costo: r.costoNeto, gastos: r.gastos }) : null
    const tramos = cien ? [
        { clave: 'mercancia', rotulo: 'Se fue en mercancía', valor: cien.mercancia, barra: cien.barra.mercancia,
            color: 'color-mix(in srgb, var(--toul-text) 22%, transparent)' },
        { clave: 'gastos', rotulo: 'Se fue en gastos', valor: cien.gastos, barra: cien.barra.gastos,
            color: 'color-mix(in srgb, var(--toul-text) 55%, transparent)' },
        { clave: 'quedo', rotulo: 'Te quedó', valor: cien.quedo, barra: cien.barra.quedo, color: 'var(--toul-accent)' },
    ] : []

    return (
        <section aria-labelledby="rp-cien">
            <div className="rp-sec-cabeza"><h2 className="rp-h2" id="rp-cien">De cada $100 que vendiste</h2></div>
            {cargando ? (
                <Skeleton height="7rem" />
            ) : !cien ? (
                <p className="rp-vacio">Cuando vendas, aquí ves qué se va en mercancía, qué en gastos y qué te queda.</p>
            ) : (
                <>
                    <div className="rp-cien" style={estilo({ '--rp-d': '200ms' })} aria-hidden>
                        {tramos.filter(t => t.barra > 0).map(t => (
                            <span key={t.clave} className="rp-cien-tramo" style={{ flex: `0 0 calc(${t.barra}% - 2px)`, background: t.color }} />
                        ))}
                    </div>
                    <div className="rp-cien-leyenda">
                        {tramos.map(t => (
                            <div key={t.clave} className="rp-cien-fila">
                                <i className="rp-punto" style={{ background: t.color }} />
                                {t.rotulo}
                                <b>${t.valor}</b>
                            </div>
                        ))}
                    </div>
                    {cien.perdida && <p className="rp-perdida">Gastaste más de lo que te dejaron las ventas</p>}
                </>
            )}
        </section>
    )
}

/* ── En qué gastaste, qué te dejó más y cómo te pagan ───────── */

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
    return (
        <>
            <div className="rp-sec-cabeza"><h2 className="rp-h2" id={id}>{titulo}</h2></div>
            {children}
        </>
    )
}

function Cargando() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[0, 1, 2].map(n => <Skeleton key={n} height="2.4rem" />)}
        </div>
    )
}

function EnQueGastaste({ filas, cargando }: { filas: ReporteSQL['gastosPorCategoria'] | null; cargando: boolean }) {
    const lista = conOtros(
        (filas ?? []).map(f => ({ nombre: nombreCategoria(f.categoria), monto: Number(f.monto) })),
        6, monto => ({ nombre: 'Otros', monto }),
    )
    const mayor = Math.max(...lista.map(f => f.monto), 1)

    return (
        <Seccion id="rp-gastos" titulo="En qué gastaste">
            {cargando || !filas ? <Cargando /> : lista.length === 0 ? (
                <p className="rp-vacio">No hubo gastos en este periodo.</p>
            ) : (
                <ul className="rp-lista" aria-labelledby="rp-gastos">
                    {lista.map((f, i) => (
                        <li key={f.nombre} className="rp-item">
                            <div className="rp-item-cabeza">
                                <span className="rp-item-texto"><span className="rp-item-nombre">{f.nombre}</span></span>
                                <span className="rp-item-monto">{formatPrecio(f.monto)}</span>
                            </div>
                            <Barra fraccion={f.monto / mayor} color="color-mix(in srgb, var(--toul-text) 55%, transparent)" alto={4} retraso={i * 60} />
                        </li>
                    ))}
                </ul>
            )}
        </Seccion>
    )
}

function QueTeDejoMas({ filas, cargando }: { filas: ReporteSQL['productos'] | null; cargando: boolean }) {
    const lista = (filas ?? []).slice(0, 5)
    const mayor = Math.max(...lista.map(f => Number(f.ganancia)), 1)

    return (
        <Seccion id="rp-productos" titulo="Qué te dejó más">
            {cargando || !filas ? <Cargando /> : lista.length === 0 ? (
                <p className="rp-vacio">Cuando vendas, aquí ves los productos que más ganancia te dejan.</p>
            ) : (
                <ol className="rp-lista" aria-labelledby="rp-productos">
                    {lista.map((p, i) => (
                        <li key={p.id} className="rp-item">
                            <div className="rp-item-cabeza">
                                <span className="rp-pos">{i + 1}</span>
                                <span className="rp-item-texto">
                                    <span className="rp-item-nombre">{p.nombre}</span>
                                    <span className="rp-item-sub">{Math.round(Number(p.margen))}% de margen</span>
                                </span>
                                <span className="rp-item-monto">{formatPrecio(Number(p.ganancia))}</span>
                            </div>
                            <div style={{ paddingLeft: 24 }}>
                                <Barra fraccion={Number(p.ganancia) / mayor} color="color-mix(in srgb, var(--toul-text) 32%, transparent)" alto={3} retraso={i * 60} />
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </Seccion>
    )
}

function ComoTePagan({ filas, total, cargando }: { filas: ReporteSQL['metodos'] | null; total: number; cargando: boolean }) {
    const lista = conOtros(
        (filas ?? []).map(f => ({ nombre: f.nombre, monto: Number(f.monto) })),
        5, monto => ({ nombre: 'Otros', monto }),
    )
    const suma = lista.reduce((s, f) => s + f.monto, 0)
    // Un hueco pequeño entre tramos, en las mismas unidades del círculo (100)
    const hueco = lista.length > 1 ? 1.4 : 0
    const largos = lista.map(f => (suma > 0 ? (f.monto / suma) * 100 : 0))
    const tramos = lista.map((f, i) => ({
        ...f,
        largo: largos[i],
        inicio: largos.slice(0, i).reduce((s, l) => s + l, 0),
        color: TONOS[Math.min(i, TONOS.length - 1)],
    }))

    return (
        <Seccion id="rp-metodos" titulo="Cómo te pagan">
            {cargando || !filas ? <Cargando /> : lista.length === 0 ? (
                <p className="rp-vacio">Aún no entró plata en este periodo.</p>
            ) : (
                <div className="rp-dona-caja">
                    <div className="rp-dona">
                        <svg viewBox="0 0 120 120" aria-hidden>
                            <circle cx="60" cy="60" r="50" pathLength={100} style={{ stroke: 'var(--toul-surface-3)' }} />
                            {tramos.map((t, i) => (
                                <circle key={t.nombre} className="rp-dona-tramo" cx="60" cy="60" r="50" pathLength={100}
                                    style={{
                                        stroke: t.color,
                                        strokeDasharray: `${Math.max(t.largo - hueco, 0.01)} 100`,
                                        strokeDashoffset: -t.inicio,
                                        ...estilo({ '--rp-d': `${300 + i * 180}ms` }),
                                    }} />
                            ))}
                        </svg>
                        <div className="rp-dona-centro">
                            <span className="rp-dona-monto">{formatoCorto(total)}</span>
                            <span className="rp-dona-sub">entraron</span>
                        </div>
                    </div>
                    <ul className="rp-metodos" aria-labelledby="rp-metodos">
                        {tramos.map(t => (
                            <li key={t.nombre} className="rp-metodo">
                                <i className="rp-punto" style={{ background: t.color }} />
                                <span className="rp-metodo-nombre">{t.nombre}</span>
                                <span className="rp-metodo-pct">{Math.round(t.largo)}%</span>
                                <span className="rp-metodo-monto">{formatPrecio(t.monto)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Seccion>
    )
}
