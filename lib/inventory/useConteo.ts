'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/client'
import { useSessionContext } from '@/lib/isla/useSession'
import {
    buscarEnConteo, cuantosContados, filasDelConteo, fotosDelConteo, stockPorPresentacion, yaContado,
    type FilaConteo,
} from './calculos'

/* ══════════════════════════════════════════════════════════════
   Los datos de los conteos: la lista, y el conteo en curso con su
   guardado solo y el momento de terminarlo.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()

export interface Conteo {
    id: string
    status: 'open' | 'applied' | 'cancelled'
    started_by_name: string | null
    started_at: string
    applied_at: string | null
    counted_items: number
    diff_units: number
    diff_value: number
    notes: string | null
}

export interface ItemContado {
    product_id: string
    variant_id: string | null
    counted_qty: number
    expected_qty: number | null
    difference: number | null
    unit_cost: number | null
}

/* ── La lista de conteos ────────────────────────────────────── */

export function useConteos() {
    const router = useRouter()
    const { data: ctx, error: errorSesion, mutate: recargarSesion } = useSessionContext()
    const [creating, setCreating] = useState(false)

    const { data: counts, error, isLoading, mutate } = useSWR(ctx ? ['conteos', ctx.storeId] : null, async () => {
        const { data, error } = await supabase.from('inventory_counts').select('*')
            .eq('store_id', ctx!.storeId).order('started_at', { ascending: false }).limit(30)
        // Sin esto, sin internet parecería que no hay un conteo abierto y
        // "Nuevo" empezaría otro encima
        if (error) throw error
        return (data ?? []) as Conteo[]
    })
    // Sin saber de qué negocio eres tampoco se puede decir "no hay conteos"
    const sinDatos = (!!error && !counts) || (!!errorSesion && !ctx)
    const reintentar = useCallback(() => { recargarSesion(); mutate() }, [recargarSesion, mutate])

    const openCount = counts?.find(c => c.status === 'open')

    // Si hay uno sin terminar, se sigue ese: no se empieza otro
    const startCount = useCallback(async () => {
        if (!ctx) return
        if (openCount) { router.push(`/inventory/conteo/${openCount.id}`); return }

        setCreating(true)
        const { data, error } = await supabase.from('inventory_counts')
            .insert({ store_id: ctx.storeId, started_by: ctx.userId, started_by_name: ctx.displayName })
            .select('id').single()
        setCreating(false)
        if (error || !data) { toast.error('No se pudo iniciar el conteo'); return }
        router.push(`/inventory/conteo/${data.id}`)
    }, [ctx, openCount, router])

    return { counts, isLoading, sinDatos, reintentar, creating, openCount, startCount }
}

/* ── Un conteo ──────────────────────────────────────────────── */

export function useConteo(id: string) {
    const { data: ctx, error: errorSesion, mutate: recargarSesion } = useSessionContext()
    const [count, setCount] = useState<Conteo | null>(null)
    const [rows, setRows] = useState<FilaConteo[]>([])
    const [counted, setCounted] = useState<Record<string, string>>({})
    const [applied, setApplied] = useState<ItemContado[]>([])
    const [loading, setLoading] = useState(true)
    // No se pudo cargar (sin internet): no se cuenta contra datos a medias
    const [sinDatos, setSinDatos] = useState(false)
    const [intento, setIntento] = useState(0)
    const [search, setSearch] = useState('')
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    // Lo que decía el sistema cuando se contó cada renglón: la base lo
    // anota al guardar, y la diferencia es contra eso (no contra el stock
    // de ahora, que ya cambió si se vendió mientras se contaba)
    const [fotos, setFotos] = useState<Record<string, number>>({})
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
    // Los guardados de un mismo producto van en fila, uno detrás de otro:
    // si se escribe rápido, no se pisan ni se duplican renglones
    const saveChains = useRef<Record<string, Promise<void>>>({})
    const itemIdsRef = useRef<Record<string, string>>({})

    // ─── Cargar conteo, catálogo y lo ya contado ──────────────
    useEffect(() => {
        if (!ctx) return
        let cancelled = false

        async function load() {
            const [countRes, productsRes, variantsRes, adjRes, itemsRes] = await Promise.all([
                supabase.from('inventory_counts').select('*').eq('id', id).single(),
                supabase.from('products').select('id, name, reference, stock, cpp').eq('store_id', ctx!.storeId).eq('is_active', true).order('name'),
                supabase.from('product_variants').select('id, product_id, name, cpp').eq('store_id', ctx!.storeId).eq('is_active', true),
                supabase.from('inventory_adjustments').select('variant_id, quantity').eq('store_id', ctx!.storeId).not('variant_id', 'is', null),
                supabase.from('inventory_count_items').select('*').eq('count_id', id),
            ])
            if (cancelled) return
            // "No existe" (PGRST116) deja el conteo vacío; cualquier otro error es la conexión
            const fallo = [countRes, productsRes, variantsRes, adjRes, itemsRes]
                .some(r => r.error && r.error.code !== 'PGRST116')
            if (fallo) { setSinDatos(true); setLoading(false); return }
            setSinDatos(false)

            const built = filasDelConteo(productsRes.data ?? [], variantsRes.data ?? [], stockPorPresentacion(adjRes.data ?? []))
            const { valores, ids } = yaContado(itemsRes.data ?? [])

            itemIdsRef.current = ids
            setFotos(fotosDelConteo(itemsRes.data ?? []))
            setCount(countRes.data as Conteo)
            setApplied((itemsRes.data ?? []) as ItemContado[])
            setRows(built)
            setCounted(valores)
            setLoading(false)
        }

        load()
        return () => { cancelled = true }
    }, [ctx, id, intento])

    const reintentar = useCallback(() => { recargarSesion(); setLoading(true); setIntento(n => n + 1) }, [recargarSesion])
    // Sin saber de qué negocio eres no se puede cargar: aviso, no "cargando" para siempre
    const sinSesion = !!errorSesion && !ctx

    // ─── Guardar cada renglón mientras se cuenta ──────────────
    const saveRow = useCallback(async (row: FilaConteo, value: string) => {
        if (!ctx) return
        const qty = Number(value)
        if (value === '' || Number.isNaN(qty) || qty < 0) return
        const counted_qty = Math.round(qty)

        const anotar = (foto: number | null | undefined) => {
            if (foto === null || foto === undefined) return
            setFotos(prev => ({ ...prev, [row.key]: Math.round(Number(foto)) }))
        }

        const existingId = itemIdsRef.current[row.key]
        if (existingId) {
            const { data, error } = await supabase.from('inventory_count_items').update({ counted_qty })
                .eq('id', existingId).select('expected_qty').single()
            if (error) toast.error('No se pudo guardar ese conteo')
            anotar(data?.expected_qty)
            return
        }

        const { data, error } = await supabase.from('inventory_count_items').insert({
            count_id: id, store_id: ctx.storeId, product_id: row.productId,
            variant_id: row.variantId, counted_qty,
        }).select('id, expected_qty').single()

        if (data) {
            itemIdsRef.current[row.key] = data.id
            anotar(data.expected_qty)
            return
        }

        // El renglón ya existía (doble guardado): se actualiza en vez de duplicar
        if (error) {
            let query = supabase.from('inventory_count_items').update({ counted_qty })
                .eq('count_id', id).eq('product_id', row.productId)
            query = row.variantId ? query.eq('variant_id', row.variantId) : query.is('variant_id', null)
            const { data: fila, error: updateError } = await query.select('id, expected_qty').maybeSingle()
            if (updateError) toast.error('No se pudo guardar ese conteo')
            if (fila) { itemIdsRef.current[row.key] = fila.id; anotar(fila.expected_qty) }
        }
    }, [ctx, id])

    const handleChange = useCallback((row: FilaConteo, value: string) => {
        const clean = value.replace(/[^0-9]/g, '')
        setCounted(prev => ({ ...prev, [row.key]: clean }))
        clearTimeout(timers.current[row.key])
        timers.current[row.key] = setTimeout(() => {
            saveChains.current[row.key] = (saveChains.current[row.key] ?? Promise.resolve())
                .then(() => saveRow(row, clean))
                .catch(() => { /* ya se avisó al usuario */ })
        }, 600)
    }, [saveRow])

    const apply = useCallback(async () => {
        setSaving(true)
        const { error } = await supabase.rpc('toul_apply_inventory_count', { p_count_id: id, p_notes: null })
        setSaving(false)
        setConfirmOpen(false)
        if (error) { toast.error(explainError(error, 'No se pudo aplicar el conteo. Intenta de nuevo.')); return }
        toast.success('Conteo aplicado. Inventario actualizado.')
        const [countRes, itemsRes] = await Promise.all([
            supabase.from('inventory_counts').select('*').eq('id', id).single(),
            supabase.from('inventory_count_items').select('*').eq('count_id', id),
        ])
        setCount(countRes.data as Conteo)
        setApplied((itemsRes.data ?? []) as ItemContado[])
    }, [id])

    // Cancelar: el conteo se cierra sin tocar el inventario. Solo uno abierto
    const cancel = useCallback(async () => {
        setSaving(true)
        const { data, error } = await supabase.from('inventory_counts').update({ status: 'cancelled' })
            .eq('id', id).eq('status', 'open').select('*').maybeSingle()
        setSaving(false)
        setCancelOpen(false)
        if (error || !data) { toast.error('No se pudo cancelar el conteo'); return }
        setCount(data as Conteo)
        toast.success('Conteo cancelado. El inventario no cambió.')
    }, [id])

    const filtered = useMemo(() => buscarEnConteo(rows, search), [rows, search])
    const countedRows = cuantosContados(counted)
    const nameByKey = useMemo(() => Object.fromEntries(rows.map(r => [r.key, r.name])), [rows])

    return {
        count, rows, counted, applied,
        loading: loading && !sinSesion, sinDatos: sinDatos || sinSesion, reintentar,
        search, setSearch,
        confirmOpen, setConfirmOpen,
        cancelOpen, setCancelOpen,
        saving, handleChange, apply, cancel, fotos,
        filtered, countedRows, nameByKey,
    }
}
