'use client'
import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getDateRange } from '@/lib/utils'
import { Settings, AlertTriangle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import useSWR from 'swr'

// Components
import HeroChart from '@/components/dashboard/HeroChart'
import { InsightsRow } from '@/components/dashboard/InsightsRow'
import MobileDashboard from '@/components/dashboard/MobileDashboard'
import { PrimerosPasos } from '@/components/dashboard/PrimerosPasos'
import { SelectorPeriodo, type Periodo, type Rango } from '@/components/dashboard/Desplegable'
import { Vendiste, Ganaste, LineaFina, FilasInicio, rotuloGastos, ICONO_FIADO, ICONO_GASTOS, ICONO_PERDIDA, ICONO_SEMANA, type FilaInicio, type LlevasHoy, type MetricasInicio, type Tendencia } from '@/components/dashboard/ResumenHoy'

// Hooks & Motion
import { useStore } from '@/lib/hooks/useData'
import { SinInternet } from '@/components/ui/SinInternet'
import { ENTRADA_INICIO_CSS, entrada, useEntradaInicio } from '@/lib/motion'
import { contraQue, diasEntre, periodoEnDireccion, rangoAnterior } from '@/lib/periodos'
import { lineaVentas, porcentajeTendencia, resumenInicio, resumir, type LineaInicio, type TramoLinea } from '@/lib/reports/calculos'
import type { ReporteSQL } from '@/lib/reports/types'
import type { AIInsight } from '@/lib/types'

type Period = Periodo

/** Cada cuánto se recalculan las ideas de TOUL AI */
const IDEAS_VIGENCIA = 6 * 60 * 60 * 1000

/** El periodo que se está viendo, en un texto: los datos que llegan dicen de qué periodo son */
const claveDe = (period: Period, rango: { from: string; to: string } | null) => `${period}|${rango?.from ?? ''}|${rango?.to ?? ''}`

/** La línea del gráfico viene en la misma respuesta de toul_reporte */
type ReporteConLinea = ReporteSQL & { serie?: TramoLinea[]; primeraVenta?: string | null }

/** Lo de arriba del Inicio que depende del periodo, además de los montos */
interface Cabecera {
    linea: LineaInicio | null
    /** La línea termina ahora (no en unas fechas que ya pasaron) */
    enVivo: boolean
    /** Nunca ha vendido: sin gráfica */
    nuevo: boolean
    /** Hoy sin ventas: cómo vas en la semana */
    llevas: LlevasHoy | null
}

export default function DashboardPage() {
    const supabase = createClient()
    const { data: store, error: storeError, isLoading: storeLoading, mutate: recargarTienda } = useStore()
    const storeId = store?.id || null
    const storeName = store?.name || ''

    const [period, setPeriod] = useState<Period>('today')
    const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null)

    // ─── MAIN METRICS FETCHING ──────────────────────────────────────────────
    const { data: dashboardData, isLoading: metricsLoading, error: metricsError, mutate: retryMetrics } = useSWR(
        storeId ? ['dashboard-v3', storeId, period, customRange] : null,
        async () => {
            const range = period === 'custom' && customRange ? customRange : getDateRange(period)
            // El mismo tramo del periodo anterior, para la tendencia. En Hoy
            // no se compara
            const compara = period !== 'today'
            const prevRange = compara ? rangoAnterior(period, range) : { from: null, to: null }
            // La línea del gráfico: por hora en Hoy, por día en los demás
            const paso = period === 'today' ? 'hora' : 'dia'

            const [reporte, reporteAntes, sales, returns, customersDebt, payables, pulse] = await Promise.all([
                // Vendiste, ganancia en ventas, gastos y la línea del gráfico
                // salen de la misma función de Reportes: no pueden dar
                // números distintos
                supabase.rpc('toul_reporte', { p_desde: range.from, p_hasta: range.to, p_paso: paso }),
                prevRange.from && prevRange.to
                    ? supabase.rpc('toul_reporte', { p_desde: prevRange.from, p_hasta: prevRange.to })
                    : Promise.resolve({ data: null, error: null }),
                // Las ventas y devoluciones, solo para las listas de productos
                supabase.from('sales').select('total, subtotal, created_at, sale_items(unit_price, unit_cost, quantity, product_id, products(name, image_url))').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                supabase.from('sale_returns').select('total, cost_total, sale_return_items(quantity, unit_price, unit_cost, sale_items(product_id, sales(total, subtotal)))').eq('store_id', storeId).gte('created_at', range.from || '2000-01-01').lte('created_at', range.to || new Date().toISOString()),
                // Lo que te deben y lo que debes: las mismas funciones de
                // Cuentas por cobrar y de Proveedores
                supabase.rpc('toul_receivables'),
                supabase.rpc('toul_payables'),
                // Menos stock y sin mover: lo mismo que Inventario, por presentación
                supabase.rpc('toul_inventory_overview', { p_limit: 30 }),
            ])
            if (reporte.error) throw reporte.error

            // 1. LO VENDIDO, LA GANANCIA Y LOS GASTOS
            const datos = reporte.data as ReporteConLinea
            const datosAntes = reporteAntes.data as ReporteSQL | null
            const actual = resumir(datos)
            const anterior = datosAntes ? resumir(datosAntes) : null

            // La línea termina ahora, o al final de las fechas si ya pasaron
            const ahora = Date.now()
            const enVivo = period !== 'custom' || !range.to || Date.parse(range.to) > ahora
            const hastaLinea = period === 'custom' && enVivo ? new Date(ahora).toISOString() : range.to
            const linea = range.from && hastaLinea
                ? lineaVentas({ paso, desde: range.from, hasta: hastaLinea, serie: datos.serie ?? [] })
                : null
            const nuevo = !datos.primeraVenta

            // Hoy sin ventas: debajo de los gastos de hoy, cómo vas en la semana
            let llevas: LlevasHoy | null = null
            if (period === 'today' && actual.cantidad === 0 && !nuevo) {
                const semana = getDateRange('week')
                const deLaSemana = await supabase.rpc('toul_reporte', { p_desde: semana.from, p_hasta: semana.to })
                if (deLaSemana.error) throw deLaSemana.error
                llevas = { semana: resumir(deLaSemana.data as ReporteSQL).vendiste }
            }

            // 2. LAS LISTAS DE PRODUCTOS
            const productUnitsMap: Record<string, { name: string; image_url: string | null; units: number; profit: number; revenue: number; last_sale: string }> = {}

            // El descuento de una venta se reparte entre sus productos en
            // proporción a lo que valía cada uno, igual que en Reportes y en
            // las devoluciones: el margen es el de lo que de verdad pagaron
            const factor = (v: { total: number; subtotal?: number | null } | null | undefined) =>
                v && Number(v.subtotal) > 0 ? Number(v.total) / Number(v.subtotal) : 1

            type ItemVendido = { unit_price: number; unit_cost: number; quantity: number; product_id: string | null; products: { name: string; image_url: string | null } | null }
            type VentaFila = { total: number; subtotal: number | null; created_at: string; sale_items: ItemVendido[] | null }
            for (const s of ((sales.data || []) as unknown as VentaFila[])) {
                const f = factor(s)
                for (const item of (s.sale_items || [])) {
                    // Los combos no tienen ficha de producto (se guardan sin product_id):
                    // cuentan en los totales, no en las listas de productos
                    const pid = item.product_id
                    if (!pid) continue
                    if (!productUnitsMap[pid]) {
                        productUnitsMap[pid] = {
                            name: item.products?.name || 'Producto',
                            image_url: item.products?.image_url || null,
                            units: 0,
                            profit: 0,
                            revenue: 0,
                            last_sale: s.created_at,
                        }
                    }
                    productUnitsMap[pid].units += item.quantity
                    productUnitsMap[pid].profit += Math.round((item.unit_price * f - (item.unit_cost || 0)) * item.quantity)
                    productUnitsMap[pid].revenue += Math.round(item.unit_price * f * item.quantity)
                }
            }

            // Lo devuelto en el periodo también baja las unidades de cada producto
            type ItemDevuelto = { quantity: number; unit_price: number; unit_cost: number; sale_items: { product_id: string | null; sales: { total: number; subtotal: number | null } | null } | null }
            const itemsDevueltos = ((returns.data || []) as unknown as { sale_return_items?: ItemDevuelto[] }[]).flatMap(r => r.sale_return_items ?? [])
            for (const item of itemsDevueltos) {
                const pid = item.sale_items?.product_id
                const producto = pid ? productUnitsMap[pid] : undefined
                if (!producto) continue
                const f = factor(item.sale_items?.sales)
                producto.units -= Number(item.quantity)
                producto.profit -= Math.round((Number(item.unit_price) * f - Number(item.unit_cost)) * Number(item.quantity))
                producto.revenue -= Math.round(Number(item.unit_price) * f * Number(item.quantity))
            }

            // Hasta 10 por lista: el celular los muestra en una fila que se
            // desliza; el computador, los 3 primeros.
            // Lo que se devolvió completo ya no cuenta como vendido
            const vendidos = Object.entries(productUnitsMap).filter(([, p]) => p.units > 0)
            const sortedByUnits = vendidos
                .map(([id, p]) => ({ id, name: p.name, image_url: p.image_url, value: p.units }))
                .sort((a, b) => b.value - a.value).slice(0, 10)
            // Más rentables: el % que le queda de cada venta. Si dos empatan,
            // primero el que dejó más plata
            const sortedByProfit = vendidos
                .filter(([, p]) => p.revenue > 0)
                .map(([id, p]) => ({ id, name: p.name, image_url: p.image_url, value: Math.round((p.profit / p.revenue) * 100) }))
                .sort((a, b) => b.value - a.value || productUnitsMap[b.id].profit - productUnitsMap[a.id].profit).slice(0, 10)

            // Menos stock y sin mover salen de la base, por presentación, con
            // el mismo mínimo que usa Inventario (el que pusiste o el que
            // calcula según lo que vendes)
            type Unidad = {
                id: string; kind: string; product_id: string; product_name: string
                variant_name: string | null; image_url: string | null
                stock: number; idle_days: number
            }
            const enLista = (row: Unidad, value: number) => ({
                id: row.kind === 'presentacion' ? row.product_id : row.id,
                name: row.variant_name ? `${row.product_name} · ${row.variant_name}` : row.product_name,
                image_url: row.image_url,
                value,
            })
            const lowStock = ((pulse.data?.alerts ?? []) as Unidad[]).slice(0, 10).map(row => enLista(row, Number(row.stock)))
            // "Sin mover": días desde la última venta de verdad
            const slowMoving = ((pulse.data?.dormant ?? []) as Unidad[]).slice(0, 10).map(row => enLista(row, row.idle_days))

            // 3. PLATA PENDIENTE
            type FilaCartera = { id: string; nombre: string; telefono: string | null; saldo: number; diasFiado: number | null }
            const cartera = (customersDebt.data as { clientes?: FilaCartera[] } | null)?.clientes ?? []
            const customerDebts = cartera.map(c => ({
                id: c.id,
                name: c.nombre,
                amount: Math.round(Number(c.saldo)),
                phone: c.telefono ?? null,
                // Hace cuánto está abierto el fiado más viejo que sigue sin pagar
                days: c.diasFiado ?? null,
            }))

            // Hace cuánto le debes: la compra más vieja que sigue sin pagar
            type FilaDebes = { id: string; nombre: string; telefono: string | null; saldo: number; desde: string | null }
            const debes = (payables.data as { proveedores?: FilaDebes[] } | null)?.proveedores ?? []
            const providerDebts = debes.map(p => ({
                id: p.id,
                name: p.nombre,
                amount: Math.round(Number(p.saldo)),
                phone: p.telefono ?? null,
                days: p.desde ? Math.max(0, diasEntre(p.desde, new Date())) : null,
            }))

            const cabecera: Cabecera = { linea, enVivo, nuevo, llevas }
            return {
                clave: claveDe(period, customRange),
                cabecera,
                // Ganaste (el de Reportes), los gastos y lo que quedó fiado
                resumen: resumenInicio(actual),
                metrics: {
                    revenue: actual.vendiste,
                    expenses: actual.gastos,
                    salesCount: actual.cantidad,
                    prevRevenue: anterior?.vendiste ?? 0,
                    prevSalesCount: anterior?.cantidad ?? 0,
                },
                operational: {
                    products: { topUnits: sortedByUnits, topProfit: sortedByProfit, lowStock, slowMoving }
                },
                pending: {
                    customerDebts, providerDebts,
                    customerCount: customerDebts.length,
                    providerCount: providerDebts.length,
                }
            }
        },
        // Al cambiar de periodo se siguen viendo los datos anteriores mientras
        // llegan los nuevos: la plata pendiente no depende del periodo y no
        // tiene por qué desaparecer y volver a contar
        { revalidateOnFocus: false, dedupingInterval: 60000, keepPreviousData: true }
    )

    // Las ideas de TOUL AI tardan unos 8 segundos y cada cálculo cuesta.
    // Se guardan en el equipo y se recalculan máximo cada 6 horas: al abrir
    // la app salen al instante. Empiezan por "toul": si entra otra cuenta,
    // se borran con todo lo demás.
    const { data: insights, isLoading: insightsLoading } = useSWR(
        storeId ? ['insights', storeId] : null,
        async () => {
            // v2: las guardadas antes traían el botón elegido por palabras sueltas
            const llave = `toul-ideas-v2:${storeId}`
            let guardadas: { at: number; insights: AIInsight[] } | null = null
            try { guardadas = JSON.parse(localStorage.getItem(llave) || 'null') } catch { /* sin almacenamiento */ }
            if (guardadas && Date.now() - guardadas.at < IDEAS_VIGENCIA) return guardadas.insights
            try {
                const r = await fetch('/api/ai-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
                const d = await r.json()
                const nuevas = (d.insights ?? []) as AIInsight[]
                try { localStorage.setItem(llave, JSON.stringify({ at: Date.now(), insights: nuevas })) } catch { /* sin espacio */ }
                return nuevas
            } catch (error) {
                // Sin señal: mejor las ideas de antes que nada
                if (guardadas) return guardadas.insights
                throw error
            }
        },
        { revalidateOnFocus: false, dedupingInterval: 300000 }
    )

    const loading = metricsLoading || storeLoading
    const reintentar = useCallback(() => { recargarTienda(); retryMetrics() }, [recargarTienda, retryMetrics])
    // Solo la primera vez no hay nada que mostrar (ver keepPreviousData arriba)
    const primeraCarga = !dashboardData

    // Saludo según la hora. Sin fecha: el Inicio dice lo que importa hoy
    const greeting = useMemo(() => {
        const hour = new Date().getHours()
        if (hour < 12) return 'Buenos días'
        if (hour < 19) return 'Buenas tardes'
        return 'Buenas noches'
    }, [])

    // La entrada completa (cascada, línea que se dibuja, montos que cuentan)
    // pasa la primera vez que se abre la app. Al cambiar de periodo, la
    // gráfica se vuelve a dibujar y los montos vuelven a contar.
    const animar = useEntradaInicio()
    const [periodoTocado, setPeriodoTocado] = useState(false)
    const cambiarPeriodo = useCallback((p: Periodo) => { setPeriod(p); setPeriodoTocado(true) }, [])
    const cambiarRango = useCallback((r: Rango) => { setCustomRange(r); setPeriodoTocado(true) }, [])
    const dibujar = animar || periodoTocado
    const conteo = useMemo(() => ({
        cuenta: animar || periodoTocado,
        clave: claveDe(period, customRange),
    }), [animar, periodoTocado, period, customRange])

    const metrics: MetricasInicio = {
        revenue: dashboardData?.metrics.revenue || 0,
        expenses: dashboardData?.metrics.expenses || 0,
        salesCount: dashboardData?.metrics.salesCount || 0,
    }
    // Cómo va lo vendido contra el mismo tramo del periodo anterior. Se
    // esconde si antes no hubo ventas o fue tan poquito que el % no dice nada
    const tendencia: Tendencia = useMemo(() => {
        const rango = period === 'custom' && customRange ? customRange : getDateRange(period)
        return {
            // En Hoy no se compara contra ayer
            porcentaje: period === 'today' ? null : porcentajeTendencia({
                ahora: dashboardData?.metrics.revenue ?? 0,
                antes: dashboardData?.metrics.prevRevenue ?? 0,
                ventasAntes: dashboardData?.metrics.prevSalesCount ?? 0,
            }),
            contra: contraQue(period, rango),
        }
    }, [dashboardData, period, customRange])
    // Tocar lo vendido o lo ganado abre Reportes en el mismo periodo
    const hrefReporte = period === 'custom' && customRange
        ? `/reportes?periodo=custom&desde=${encodeURIComponent(customRange.from)}&hasta=${encodeURIComponent(customRange.to)}`
        : `/reportes?periodo=${period}`
    const products = dashboardData?.operational.products || { topUnits: [], topProfit: [], lowStock: [], slowMoving: [] }
    const pending = dashboardData?.pending || { customerDebts: [], providerDebts: [] }

    // La gráfica solo muestra la línea del periodo que se está viendo:
    // mientras llega uno nuevo queda vacía, y al llegar se dibuja
    const cabecera = dashboardData?.clave === conteo.clave ? dashboardData.cabecera : null
    // Nunca ha vendido: no hay gráfica ni ganancia que mostrar, solo el $0
    const nuevo = !!dashboardData?.cabecera.nuevo
    const grafica = (variante: 'movil' | 'pc') => nuevo ? null : (
        <HeroChart linea={cabecera?.linea ?? null} clave={conteo.clave} enVivo={cabecera?.enVivo ?? true}
            variante={variante} alto={variante === 'movil' ? 150 : '100%'} dibujar={dibujar} />
    )
    // Debajo de lo vendido: Ganaste y las filas. Los gastos del periodo
    // siempre (llevan a Movimientos con el mismo periodo); la mercancía
    // que se perdió, solo si hubo (resta de Ganaste; lleva a Reportes,
    // donde está el detalle); lo que quedó fiado, solo si hubo (lleva a
    // Clientes). Sin ventas no hay Ganaste:
    // en Hoy, los gastos de hoy y cómo vas en la semana
    const resumen = dashboardData?.clave === conteo.clave ? dashboardData.resumen : null
    const sinVentas = !loading && metrics.salesCount === 0
    const rangoActual = period === 'custom' && customRange ? customRange : getDateRange(period)
    const filaGastos: FilaInicio = {
        clave: 'gastos', rotulo: rotuloGastos(period), monto: resumen?.gastos ?? metrics.expenses, Icono: ICONO_GASTOS,
        href: `/movimientos?${periodoEnDireccion(period, rangoActual)}&tipo=gastos`,
    }
    const filas: FilaInicio[] = sinVentas
        ? [filaGastos, ...(period === 'today' && cabecera?.llevas
            ? [{ clave: 'semana', rotulo: 'Esta semana llevas', monto: cabecera.llevas.semana, Icono: ICONO_SEMANA, href: '/reportes?periodo=week' }]
            : [])]
        : [filaGastos, ...(resumen && resumen.sePerdio > 0
            ? [{ clave: 'perdida', rotulo: 'Se perdió', monto: resumen.sePerdio, Icono: ICONO_PERDIDA, href: hrefReporte }]
            : []), ...(resumen && resumen.fiado > 0
            ? [{ clave: 'fiado', rotulo: 'Quedó fiado', monto: resumen.fiado, Icono: ICONO_FIADO, href: '/customers', tono: 'fiado' as const }]
            : [])]
    const claveDatos = dashboardData?.clave ?? ''
    const ganaste = sinVentas ? null : (
        <Ganaste resumen={resumen} loading={loading || !resumen} conteo={conteo} href={hrefReporte} />
    )
    const filasInicio = (
        <FilasInicio filas={filas} conteo={conteo} loading={loading} claveDatos={claveDatos} pegadas={sinVentas} />
    )
    // En el celular la gráfica va entre lo vendido y esto
    const abajo: ReactNode = nuevo ? null : <>{ganaste}{filasInicio}</>

    // Sin internet: ni "Vendiste $0" ni "Sin ventas" como si fueran reales.
    // Con keepPreviousData, lo que hay puede ser de otro periodo: eso tampoco cuenta
    const datosDeEstePeriodo = !!dashboardData && dashboardData.clave === conteo.clave
    if ((storeError && !store) || (metricsError && !datosDeEstePeriodo)) {
        return <SinInternet onRetry={reintentar} que="cómo va tu negocio" />
    }

    return (
        <>
            {/* ── Cuando la carga falla ─────────────────────────────────────
                Antes la pantalla caía a cero y decía que no habías vendido
                nada. Un número falso es peor que un error: con esto el
                usuario sabe que lo que ve no es su negocio. */}
            {metricsError && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    margin: '16px 16px 0', padding: '14px 16px', borderRadius: 16,
                    background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)',
                }}>
                    <AlertTriangle size={18} style={{ color: 'var(--toul-warning)', flexShrink: 0, marginTop: 1 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            No se pudieron actualizar tus números
                        </p>
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 10px', lineHeight: 1.5 }}>
                            Lo que ves es de la última vez que cargó. Revisa tu conexión y vuelve a intentar.
                        </p>
                        <button onClick={() => retryMetrics()}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 13px',
                                borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                                background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--toul-text-muted)',
                            }}>
                            <RefreshCw size={13} /> Volver a intentar
                        </button>
                    </div>
                </div>
            )}

            {/* ── CELULAR ───────────────────────────────────────────────────── */}
            <div className="lg:hidden">
                {/* Desaparece solo apenas hace su primera venta */}
                <div style={{ padding: '18px 16px 0' }}>
                    <PrimerosPasos storeId={storeId} />
                </div>
                <MobileDashboard
                    storeName={storeName}
                    saludo={greeting}
                    period={period}
                    setPeriod={cambiarPeriodo}
                    rango={customRange}
                    setRango={cambiarRango}
                    metrics={metrics}
                    products={products}
                    pending={pending}
                    insight={insights?.[0] || null}
                    loading={loading}
                    primeraCarga={primeraCarga}
                    insightsLoading={insightsLoading || false}
                    animar={animar}
                    conteo={conteo}
                    tendencia={tendencia}
                    hrefReporte={hrefReporte}
                    nuevo={nuevo}
                    grafica={grafica('movil')}
                    abajo={abajo}
                />
            </div>

            {/* ── COMPUTADOR ────────────────────────────────────────────────
                Arriba el encabezado: la gráfica a la izquierda y lo vendido a
                la derecha. Abajo, tres columnas sin cajas. */}
            <div className="hidden lg:block in-pc">
                <style>{PC_CSS}</style>
                <div className="in-pc-contenido">
                    <PrimerosPasos storeId={storeId} />

                    {/* Arriba el saludo en una línea */}
                    <header {...entrada(0, animar, 'in-pc-arriba')}>
                        <h1 className="in-pc-saludo" suppressHydrationWarning>{greeting}, {storeName || 'Mi negocio'}</h1>
                        <Link href="/settings" className="in-pc-ajustes" aria-label="Ajustes">
                            <Settings size={20} strokeWidth={1.9} />
                        </Link>
                    </header>

                    {/* El alto que sobra se reparte por igual arriba y abajo del
                        bloque de la gráfica y el resumen */}
                    <div className="in-pc-aire" aria-hidden />

                    {/* La gráfica a la izquierda; a la derecha el resumen, alineado
                        arriba. La gráfica mide lo que el resumen (mínimo 240 px) y
                        crece con la pantalla hasta 380 px */}
                    <section className="in-pc-cuerpo" aria-label="Resumen del periodo" data-nuevo={nuevo || undefined}>
                        {!nuevo && (
                            <div {...entrada(1, animar, 'in-pc-grafica')}>
                                {grafica('pc')}
                            </div>
                        )}
                        <div className="in-pc-resumen">
                            <div {...entrada(2, animar)}>
                                <Vendiste metrics={metrics} loading={loading} period={period} conteo={conteo}
                                    tendencia={tendencia} href={hrefReporte} nuevo={nuevo}
                                    selector={<SelectorPeriodo variante="pc" forma="pildora" period={period} setPeriod={cambiarPeriodo}
                                        rango={customRange} setRango={cambiarRango} />} />
                            </div>
                            {abajo && (
                                <div {...entrada(3, animar)}>
                                    {ganaste && <LineaFina />}
                                    {abajo}
                                </div>
                            )}
                        </div>
                    </section>

                    <div className="in-pc-aire in-pc-aire-abajo" aria-hidden />

                    <div className="in-pc-abajo">
                        <InsightsRow
                            products={products}
                            pending={pending}
                            insight={insights?.[0] || null}
                            storeName={storeName}
                            loading={loading}
                            primeraCarga={primeraCarga}
                            insightsLoading={!!insightsLoading}
                            animar={animar}
                            turno={4}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}

/* Lo del computador que no cabe en clases de Tailwind: la pantalla que se
   llena de arriba abajo y el encabezado de dos columnas */
const PC_CSS = ENTRADA_INICIO_CSS + `
/* La pantalla se llena sin franja vacía abajo:
   · la gráfica crece con la pantalla, desde lo que mide el resumen
     (nunca menos de 240 px) hasta 380 px;
   · el alto que sobre después se reparte por igual arriba y abajo del
     bloque de la gráfica y el resumen, para que no quede un hueco
     grande en un solo lugar;
   · la fila de abajo (plata pendiente, tus productos y acciones) queda
     pegada al final y mide lo que mide su contenido: nunca se estira */
.in-pc {
    position: relative;
    --in-pc-hueco: clamp(24px, 3.8vh, 56px);
}
/* Sin z-index ni isolation, como en el celular: los menús y las hojas
   tienen que poder quedar por encima de todo. Los 2rem son el margen de
   abajo que ya pone la app. En pantallas muy anchas no pasa de 1680 px */
.in-pc-contenido { position: relative; width: 100%; max-width: 1680px; margin: 0 auto;
    min-height: calc(100dvh - 2rem); display: flex; flex-direction: column;
    padding: clamp(20px, 2.6vh, 32px) 24px 16px; }

.in-pc-arriba { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 40px; }
.in-pc-saludo { min-width: 0; font-size: 14px; font-weight: 400; letter-spacing: -0.01em; color: var(--toul-text-subtle); margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.in-pc-ajustes { flex-shrink: 0; width: 40px; height: 40px; margin-right: -8px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center; color: var(--toul-text-subtle);
    transition: color 160ms var(--toul-ease-emil), background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.in-pc-ajustes:active { transform: scale(0.94); }

/* Los dos aires crecen igual desde su mínimo. La gráfica crece mucho
   más rápido (1000 a 1): se llena primero y, al llegar a 380 px, lo
   que queda se va a los aires */
.in-pc-aire { flex: 1 1 6px; min-height: 6px; }
.in-pc-aire-abajo { flex-basis: var(--in-pc-hueco); min-height: var(--in-pc-hueco); }
/* La gráfica, cerca del 60% desde el borde izquierdo; el resumen, el
   resto, a 40 px */
.in-pc-cuerpo { flex: 1000 1 auto; max-height: 380px; display: grid; grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr);
    grid-template-rows: 1fr; column-gap: 40px; }
/* Sin ventas en toda su historia no hay gráfica: el resumen va solo */
.in-pc-cuerpo[data-nuevo] { grid-template-columns: minmax(0, 1fr); flex-grow: 0; }
.in-pc-grafica { min-width: 0; min-height: 240px; }
.in-pc-resumen { min-width: 0; align-self: start; display: flex; flex-direction: column; gap: 16px; }
.in-pc-abajo { flex: 0 0 auto; }
@media (hover: hover) and (pointer: fine) {
    .in-pc-ajustes:hover { color: var(--toul-text); background: var(--toul-surface); }
}
@media (min-width: 1280px) {
    .in-pc-contenido { padding-left: 32px; padding-right: 32px; }
}
`
