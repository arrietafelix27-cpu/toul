'use client'

import HeroChart from './HeroChart'
import { SelectorPeriodo, type Periodo, type Rango } from './Desplegable'
import { Vendiste, GananciaGastos, type MetricasInicio, type Conteo, type Tendencia } from './ResumenHoy'
import { AccionesRapidas, ObservacionAI } from './AccionesRapidas'
import { ProductsPanel, type ProductsData } from './ProductsPanel'
import { PendingPanel, type PendingData } from './PendingPanel'
import { ENTRADA_INICIO_CSS, entrada } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   El Inicio en el celular.

   Nada encerrado en cajas: lo separa el espacio. De arriba abajo,
   lo que se mira primero: el saludo, el periodo, cuánto vendiste,
   la gráfica, la ganancia y los gastos; luego lo que se hace a diario
   (acciones y TOUL AI), tus productos y la plata pendiente.
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
    storeName, saludo, storeId, period, setPeriod, rango, setRango,
    metrics, products, pending, insight, loading, primeraCarga, insightsLoading,
    animar, dibujar, conteo, tendencia, hrefReporte,
}: {
    storeName: string
    saludo: string
    storeId: string | null
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
    dibujar: boolean
    conteo: Conteo
    tendencia: Tendencia
    /** Tocar lo vendido abre Reportes en el mismo periodo */
    hrefReporte: string
}) {
    return (
        <div className="md-raiz">
            <style>{CSS}</style>

            <div className="md-contenido">
                <p {...entrada(0, animar, 'md-saludo')} suppressHydrationWarning>
                    {saludo}, {storeName || 'Mi negocio'}
                </p>
                <div {...entrada(1, animar)}>
                    <SelectorPeriodo variante="movil" period={period} setPeriod={setPeriod} rango={rango} setRango={setRango} />
                </div>
                <div {...entrada(2, animar, undefined, { marginTop: 18 })}>
                    <Vendiste metrics={metrics} loading={loading} period={period} variante="movil" conteo={conteo} tendencia={tendencia} href={hrefReporte} />
                </div>
                <div {...entrada(3, animar, 'md-grafica')}>
                    <HeroChart storeId={storeId} period={period} rango={rango} alto={110} dibujar={dibujar} />
                </div>
                <div {...entrada(4, animar)}>
                    <GananciaGastos metrics={metrics} loading={loading} conteo={conteo} />
                </div>
                <div {...entrada(5, animar, undefined, { marginTop: 32 })}>
                    <AccionesRapidas variante="movil" />
                </div>
                <div {...entrada(6, animar, undefined, { marginTop: 22 })}>
                    <ObservacionAI insight={insight} loading={insightsLoading || primeraCarga} />
                </div>
                <div {...entrada(7, animar, undefined, { marginTop: 36 })}>
                    <ProductsPanel products={products} loading={loading} variante="movil" animar={animar} />
                </div>
                <div {...entrada(8, animar, undefined, { marginTop: 40 })}>
                    <PendingPanel pending={pending} storeName={storeName} variante="movil" loading={primeraCarga} cuenta={animar} />
                </div>
            </div>
        </div>
    )
}
