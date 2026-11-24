'use client'

import type { ReactNode } from 'react'
import { SelectorPeriodo, type Periodo, type Rango } from './Desplegable'
import { Vendiste, type MetricasInicio, type Conteo, type Tendencia } from './ResumenHoy'
import { AccionesRapidas, ObservacionAI } from './AccionesRapidas'
import { ProductsPanel, type ProductsData } from './ProductsPanel'
import { PendingPanel, type PendingData } from './PendingPanel'
import { ENTRADA_INICIO_CSS, entrada, type FaseLlegada } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   El Inicio en el celular.

   Nada encerrado en cajas: lo separa el espacio. De arriba abajo,
   lo que se mira primero: el saludo, el periodo, cuánto vendiste,
   la gráfica, cuánto ganaste con los gastos y lo fiado (en Hoy sin
   ventas, los gastos de hoy y cómo vas en la semana); luego lo que se
   hace a diario (acciones y TOUL AI), tus productos y la plata pendiente.
   ══════════════════════════════════════════════════════════════ */

const CSS = ENTRADA_INICIO_CSS + `
/* Sin z-index ni isolation: las hojas que se abren desde aquí tienen que
   quedar por encima del menú de abajo */
.md-raiz { position: relative; padding: 20px 16px 128px; }
.md-contenido { position: relative; }
.md-saludo { font-size: 13px; letter-spacing: -0.01em; color: color-mix(in srgb, var(--toul-text) 50%, transparent); margin: 0 0 6px; }
.md-grafica { margin: 18px -16px 20px; }
`

export default function MobileDashboard({
    storeName, saludo, period, setPeriod, rango, setRango,
    metrics, products, pending, insight, loading, primeraCarga, insightsLoading,
    animar, conteo, tendencia, hrefReporte, nuevo, grafica, abajo, llegada = null,
}: {
    storeName: string
    saludo: string
    period: Periodo
    setPeriod: (p: Periodo) => void
    rango: Rango
    setRango: (r: Rango) => void
    metrics: MetricasInicio
    products: ProductsData
    pending: PendingData
    insight: AIInsight | null
    loading: boolean
    /** Todavía no ha llegado nada: lo que no depende del periodo espera solo esta vez */
    primeraCarga: boolean
    insightsLoading: boolean
    /** La primera vez que se abre la app, las secciones entran en cascada */
    animar: boolean
    conteo: Conteo
    tendencia: Tendencia
    /** Tocar lo vendido abre Reportes en el mismo periodo */
    hrefReporte: string
    /** Nunca ha vendido: sin gráfica ni ganancia */
    nuevo: boolean
    /** La gráfica (null si nunca ha vendido) */
    grafica: ReactNode
    /** Debajo de la gráfica: Ganaste y las filas (gastos, lo fiado, cómo vas en la semana) */
    abajo: ReactNode
    /** Al volver de la caja con una venta: la cascada que espera a la gota */
    llegada?: FaseLlegada
}) {
    return (
        <div className="md-raiz">
            <style>{CSS}</style>

            <div className="md-contenido">
                <p {...entrada(0, animar, 'md-saludo', undefined, llegada)} suppressHydrationWarning>
                    {saludo}, {storeName || 'Mi negocio'}
                </p>
                <div {...entrada(1, animar, undefined, undefined, llegada)}>
                    <SelectorPeriodo variante="movil" period={period} setPeriod={setPeriod} rango={rango} setRango={setRango} />
                </div>
                <div {...entrada(2, animar, undefined, { marginTop: 18 }, llegada)}>
                    <Vendiste metrics={metrics} loading={loading} period={period} conteo={conteo} tendencia={tendencia}
                        href={hrefReporte} nuevo={nuevo} />
                </div>
                {grafica && <div {...entrada(3, animar, 'md-grafica', undefined, llegada)}>{grafica}</div>}
                {abajo && <div {...entrada(4, animar, undefined, undefined, llegada)}>{abajo}</div>}
                <div {...entrada(5, animar, undefined, { marginTop: 32 }, llegada)}>
                    <AccionesRapidas variante="movil" />
                </div>
                <div {...entrada(6, animar, undefined, { marginTop: 22 }, llegada)}>
                    <ObservacionAI insight={insight} loading={insightsLoading || primeraCarga} />
                </div>
                <div {...entrada(7, animar, undefined, { marginTop: 36 }, llegada)}>
                    <ProductsPanel products={products} loading={loading} variante="movil" animar={animar} />
                </div>
                <div {...entrada(8, animar, undefined, { marginTop: 40 }, llegada)}>
                    <PendingPanel pending={pending} storeName={storeName} variante="movil" loading={primeraCarga} cuenta={animar} />
                </div>
            </div>
        </div>
    )
}
