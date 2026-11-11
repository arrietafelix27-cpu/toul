'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/client'
import { diasEntre, formatoColombia, enColombia, instanteDeDia, rangoPeriodo, type Periodo, type Rango } from '@/lib/periodos'
import type { PurchaseDetailData } from '@/components/inventory/PurchaseDetail'
import { filtrarCompras, type FiltroCompras } from './calculos'

/* ══════════════════════════════════════════════════════════════
   Los datos del historial de compras.

   El gasto y el número de compras son del período que estés
   viendo. Lo que le debes a proveedores no: eso es de hoy, sin
   importar cuándo compraste.

   Los periodos son los de Reportes (lib/periodos): "Este mes" es
   del día 1 a hoy en Colombia, no los últimos 30 días. Más "Todo",
   para encontrar una compra vieja.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()
const PAGINA = 30

export interface FilaCompra {
    id: string
    created_at: string
    total: number
    is_credit: boolean
    /** 'voided' si se anuló: sale en la lista, pero no cuenta en "Comprado" */
    status: string | null
    provider_id: string | null
    providers: { name: string } | null
    purchase_items: { quantity: number; products: { name: string } | null }[]
}

export interface ResumenCompras {
    gastado: number
    compras: number
    aCredito: number
    porPagar: number
    vencidas: number
}

/** "3 nov" (o "3 nov 2025" si es de otro año), en el día de Colombia */
export const fechaCompra = (iso: string) => {
    const esteAnio = enColombia(iso).ano === enColombia(new Date()).ano
    return formatoColombia(iso, esteAnio
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Desde y hasta para la base. "Hasta" solo con fechas elegidas: en los
 *  demás periodos es hasta este momento */
function tramoDeCompras(periodo: Periodo, rango: Rango): { desde: string | null; hasta: string | null } {
    const t = rangoPeriodo(periodo, rango)
    return { desde: t.from, hasta: periodo === 'custom' ? t.to : null }
}

/** Un plazo que ya pasó deja de ser un dato y pasa a ser un aviso */
export function estaVencida(iso: string | null) {
    if (!iso) return false
    // El plazo es un día del calendario; "hoy" es el de Colombia
    return diasEntre(instanteDeDia(iso.slice(0, 10)), new Date()) > 0
}

export function useCompras(storeId: string | null) {
    const [periodo, setPeriodo] = useState<Periodo>('month')
    const [rango, setRangoState] = useState<Rango>(null)
    const [filtro, setFiltro] = useState<FiltroCompras>('todas')
    const [busca, setBusca] = useState('')
    const [limite, setLimite] = useState(PAGINA)
    const [hayMas, setHayMas] = useState(false)
    const [abierta, setAbierta] = useState<PurchaseDetailData | null>(null)
    const [abriendo, setAbriendo] = useState<string | null>(null)
    const sentinela = useRef<HTMLDivElement>(null)

    // Cambiar de período o de filtro vuelve a empezar la lista
    const verPeriodo = useCallback((p: Periodo) => { setPeriodo(p); setLimite(PAGINA) }, [])
    const setRango = useCallback((r: Rango) => { setRangoState(r); setLimite(PAGINA) }, [])
    const verFiltro = useCallback((f: FiltroCompras) => { setFiltro(f); setLimite(PAGINA) }, [])

    // Los totales salen de la base, no de la página que estás viendo:
    // si no, el gasto cambiaría cada vez que bajas por la lista
    const { data: resumen, error: errorResumen, mutate: mutateResumen } = useSWR<ResumenCompras>(
        storeId ? ['compras-resumen', storeId, periodo, rango?.from, rango?.to] : null,
        async () => {
            const { desde, hasta } = tramoDeCompras(periodo, rango)
            const { data, error } = await supabase.rpc('toul_purchases_summary', {
                p_from: desde, p_to: hasta,
            })
            if (error) throw error
            return data as ResumenCompras
        },
        { revalidateOnFocus: false },
    )

    const { data: compras, error: errorCompras, isLoading, isValidating, mutate } = useSWR<FilaCompra[]>(
        storeId ? ['compras', storeId, periodo, rango?.from, rango?.to, filtro, limite] : null,
        async () => {
            let q = supabase.from('purchases')
                .select('id, created_at, total, is_credit, status, provider_id, providers(name), purchase_items(quantity, products(name))')
                .eq('store_id', storeId!)
                .order('created_at', { ascending: false })
            const { desde, hasta } = tramoDeCompras(periodo, rango)
            if (desde) q = q.gte('created_at', desde)
            if (hasta) q = q.lte('created_at', hasta)
            if (filtro === 'contado') q = q.eq('is_credit', false)
            if (filtro === 'credito' || filtro === 'debiendo') q = q.eq('is_credit', true)

            const { data, error } = await q.limit(limite + 1)
            if (error) throw error
            const filas = (data ?? []) as unknown as FilaCompra[]
            setHayMas(filas.length > limite)
            return filas.slice(0, limite)
        },
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    // Las que siguen sin pagar: la deuda vive aparte de la compra
    const { data: deudas, error: errorDeudas, mutate: mutateDeudas } = useSWR(
        storeId ? ['compras-deudas', storeId] : null,
        async () => {
            const { data, error } = await supabase.from('provider_debts')
                .select('purchase_id, remaining_amount, due_date, status')
                .eq('store_id', storeId!).neq('status', 'paid').gt('remaining_amount', 0)
            // Sin esto "Sin pagar" saldría vacío como si no debieras nada
            if (error) throw error
            const m = new Map<string, { falta: number; vence: string | null }>()
            for (const d of data ?? []) {
                if (d.purchase_id) m.set(d.purchase_id, { falta: Number(d.remaining_amount), vence: d.due_date })
            }
            return m
        },
        { revalidateOnFocus: false },
    )

    // Al llegar al final se cargan más solas
    useEffect(() => {
        const node = sentinela.current
        if (!node || !hayMas || isValidating) return
        const obs = new IntersectionObserver(e => {
            if (e[0]?.isIntersecting) setLimite(l => l + PAGINA)
        }, { rootMargin: '200px' })
        obs.observe(node)
        return () => obs.disconnect()
    }, [hayMas, isValidating])

    const abrir = useCallback(async (id: string) => {
        setAbriendo(id)
        const { data, error } = await supabase.rpc('toul_purchase_detail', { p_purchase_id: id })
        setAbriendo(null)
        if (error || !data) { toast.error(explainError(error, 'No se pudo abrir esa compra')); return }
        setAbierta(data as PurchaseDetailData)
    }, [])

    const cerrar = useCallback(() => setAbierta(null), [])
    // Se anuló o cambió el proveedor: se cierra y la lista se vuelve a pedir
    const alCambiar = useCallback(() => { setAbierta(null); mutate() }, [mutate])

    // Desde Movimientos ("Ver la compra") se llega con ?compra=<id>: abre de una.
    // La dirección se limpia solo cuando ya abrió
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get('compra')
        if (!id) return
        let vivo = true
        ;(async () => {
            const { data, error } = await supabase.rpc('toul_purchase_detail', { p_purchase_id: id })
            if (!vivo) return
            window.history.replaceState(null, '', window.location.pathname)
            if (error || !data) { toast.error(explainError(error, 'No se pudo abrir esa compra')); return }
            setAbierta(data as PurchaseDetailData)
        })()
        return () => { vivo = false }
    }, [])

    // La búsqueda corre sobre lo cargado: por proveedor o por producto
    const lista = useMemo(() => filtrarCompras(compras, filtro, deudas, busca), [compras, deudas, filtro, busca])

    // Sin internet: si falta cualquiera de las tres, no se muestran números a medias
    const sinDatos = (!!errorResumen && !resumen) || (!!errorCompras && !compras) || (!!errorDeudas && !deudas)
    const reintentar = useCallback(() => { mutateResumen(); mutate(); mutateDeudas() }, [mutateResumen, mutate, mutateDeudas])

    return {
        periodo, verPeriodo, rango, setRango,
        sinDatos, reintentar,
        filtro, verFiltro,
        busca, setBusca,
        resumen,
        compras, lista, deudas,
        isLoading, isValidating, mutate,
        hayMas, sentinela,
        abierta, abriendo, abrir, cerrar, alCambiar,
    }
}
