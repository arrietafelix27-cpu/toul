'use client'

import { Suspense, useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useStore } from '@/lib/hooks/useData'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { PERIODOS_URL, rangoAnterior, rangoPeriodo, type Periodo, type Rango } from '@/lib/periodos'
import { ReportsView } from '@/components/reports/ReportsView'
import type { MesReporte, ReporteSQL } from '@/lib/reports/types'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Reportes: ¿cómo me fue y por qué?

   Todo sale de la base en dos llamadas (el periodo y el mismo tramo
   del anterior), más el mes a mes y el valor del inventario. Las
   cuentas viven en supabase/deploy_reportes.sql y lib/reports/calculos.ts.
   ══════════════════════════════════════════════════════════════ */

interface DatosReporte {
    actual: ReporteSQL
    anterior: ReporteSQL | null
    /** Para qué periodo son: los montos cuentan cuando llega uno nuevo */
    clave: string
}

/** El periodo con el que se abre: el que trae la dirección (desde el
 *  Inicio) o este mes */
function periodoInicial(params: URLSearchParams): { periodo: Periodo; rango: Rango } {
    const p = params.get('periodo') as Periodo | null
    if (p === 'custom') {
        const desde = params.get('desde')
        const hasta = params.get('hasta')
        if (desde && hasta && !Number.isNaN(Date.parse(desde)) && !Number.isNaN(Date.parse(hasta))) {
            return { periodo: 'custom', rango: { from: desde, to: hasta } }
        }
        return { periodo: 'month', rango: null }
    }
    if (p && PERIODOS_URL.includes(p)) return { periodo: p, rango: null }
    return { periodo: 'month', rango: null }
}

function Reportes() {
    const params = useSearchParams()
    const { data: store } = useStore()
    const storeId = store?.id || null
    const esMovil = useIsMobile()

    const [inicial] = useState(() => periodoInicial(new URLSearchParams(params.toString())))
    const [periodo, setPeriodo] = useState<Periodo>(inicial.periodo)
    const [rango, setRango] = useState<Rango>(inicial.rango)

    // El rango se fija al elegir el periodo: si se recalculara en cada
    // render, "hasta ahora" cambiaría y se volvería a pedir todo
    const tramo = useMemo(() => rangoPeriodo(periodo, rango), [periodo, rango])
    const clave = `${periodo}|${tramo.from ?? ''}|${tramo.to ?? ''}`

    const { data, isLoading, error, mutate } = useSWR<DatosReporte>(
        storeId ? ['reporte', storeId, clave] : null,
        async () => {
            const anterior = rangoAnterior(periodo, tramo)
            const [actual, previo] = await Promise.all([
                supabase.rpc('toul_reporte', { p_desde: tramo.from, p_hasta: tramo.to }),
                anterior.from && anterior.to
                    ? supabase.rpc('toul_reporte', { p_desde: anterior.from, p_hasta: anterior.to })
                    : Promise.resolve({ data: null, error: null }),
            ])
            if (actual.error) throw actual.error
            return { actual: actual.data as ReporteSQL, anterior: (previo.data as ReporteSQL | null) ?? null, clave }
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
    )

    // No depende del periodo elegido
    const { data: meses } = useSWR<MesReporte[]>(
        storeId ? ['reporte-meses', storeId] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_reporte_meses', { p_meses: 6 })
            if (error) throw error
            return (data ?? []) as MesReporte[]
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    )

    // Plata en mercancía: lo de hoy, contando cada presentación, igual que Inventario
    const { data: inventario } = useSWR<number>(
        storeId ? ['reporte-inventario', storeId] : null,
        async () => {
            const { data, error } = await supabase.rpc('toul_inventory_overview', { p_limit: 1 })
            if (error) throw error
            return Math.round(Number((data as { value?: number } | null)?.value ?? 0))
        },
        { revalidateOnFocus: false, dedupingInterval: 60_000 },
    )

    const [descargando, setDescargando] = useState(false)
    const descargar = useCallback(async (formato: 'excel' | 'pdf') => {
        if (!data || !storeId || descargando) return
        setDescargando(true)
        const aviso = toast.loading(formato === 'excel' ? 'Armando el Excel…' : 'Armando el PDF…')
        try {
            // Las librerías se cargan solo cuando alguien descarga
            const { descargarExcel, descargarPDF } = await import('@/lib/reports/descargar')
            const base = {
                tienda: store?.name || 'Mi negocio', periodo, tramo,
                actual: data.actual, anterior: data.anterior, meses: meses ?? [], inventario: inventario ?? null,
            }
            if (formato === 'excel') await descargarExcel({ ...base, supabase, storeId })
            else await descargarPDF(base)
            toast.success('Listo, quedó en tus descargas', { id: aviso })
        } catch (e) {
            console.error('Descargar reporte:', e)
            toast.error('No se pudo descargar. Intenta de nuevo.', { id: aviso })
        } finally {
            setDescargando(false)
        }
    }, [data, storeId, descargando, store?.name, periodo, tramo, meses, inventario])

    const cambiarPeriodo = useCallback((p: Periodo) => setPeriodo(p), [])
    const cambiarRango = useCallback((r: Rango) => setRango(r), [])
    const reintentar = useCallback(() => { mutate() }, [mutate])

    return (
        <ReportsView
            variante={esMovil ? 'movil' : 'pc'}
            periodo={periodo}
            setPeriodo={cambiarPeriodo}
            rango={rango}
            setRango={cambiarRango}
            tramo={tramo}
            actual={data?.actual ?? null}
            anterior={data?.anterior ?? null}
            clave={data?.clave ?? clave}
            meses={meses ?? null}
            inventario={inventario ?? null}
            cargando={isLoading && !data}
            error={!!error && !data}
            reintentar={reintentar}
            descargar={descargar}
            descargando={descargando}
        />
    )
}

export default function ReportesPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <Reportes />
        </Suspense>
    )
}
