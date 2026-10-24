'use client'

import { useCallback, useMemo, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import toast from 'react-hot-toast'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Minus, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { explainError } from '@/lib/errors'
import { useStore } from '@/lib/hooks/useData'
import { usePaymentMethods } from '@/lib/hooks/usePaymentMethods'
import { Sheet } from '@/components/isla/Sheet'
import { Thumb } from '@/components/ui/Thumb'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'
import { saleItemName, SALE_RETURN_SELECT } from '@/lib/types'
import type { SaleItemDetail, SaleReturn } from '@/lib/types'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Devolver una parte de una venta.

   Se elige qué productos y cuántos, por dónde sale la plata y el
   motivo. El administrador la hace de una; el vendedor la pide y el
   administrador la aprueba, igual que anular.

   Las cuentas de verdad las hace la base (toul_return_sale). Aquí
   solo se estiman para que se vea cuánto va a salir antes de
   confirmar: con descuento se devuelve en proporción, y en un fiado
   primero baja lo que todavía debe de esa venta.
   ══════════════════════════════════════════════════════════════ */

/** Igual que en la base: pasado este plazo ya no se puede devolver */
export const DIAS_PARA_DEVOLVER = 30
const PLAZO_MS = DIAS_PARA_DEVOLVER * 86_400_000

const MOTIVOS = ['No le gustó', 'Llegó con un defecto', 'Se equivocó de producto']

/** Lo que se vuelve a pedir después de devolver: ventas, plata y aprobaciones */
const REFRESCAR = new Set([
    'devoluciones-venta', 'venta-para-devolver', 'ventas-para-devolver', 'devoluciones-lista', 'devoluciones-periodo',
    'dashboard-v3', 'sales', 'sales-totals', 'caja-ventas', 'reportes', 'aprobaciones',
])

/** Antes de correr deploy_devoluciones.sql la tabla no existe */
const SIN_TABLA = new Set(['42P01', 'PGRST205', 'PGRST200'])

type ItemVenta = Pick<SaleItemDetail, 'products' | 'product_variants' | 'combos'> & {
    id: string
    quantity: number
    unit_price: number
    subtotal: number
}

interface VentaParaDevolver {
    id: string
    created_at: string
    total: number
    is_credit: boolean
    customer_name: string | null
    sale_items: ItemVenta[]
    sale_payments: { amount: number; method_id: string | null }[]
}

const VENTA_SELECT = 'id, created_at, total, is_credit, customer_name, ' +
    'sale_items(id, quantity, unit_price, subtotal, products(name, image_url), product_variants(name), combos(name)), ' +
    'sale_payments(amount, method_id)'

interface VentaReciente {
    id: string
    created_at: string
    total: number
    customer_name: string | null
    sale_items: (Pick<SaleItemDetail, 'products' | 'product_variants' | 'combos'> & { quantity: number })[]
}

const RECIENTES_SELECT = 'id, created_at, total, customer_name, ' +
    'sale_items(quantity, products(name, image_url), product_variants(name), combos(name))'

const CSS = `
.dv-rotulo { font-size: 13px; font-weight: 500; color: var(--toul-text-muted); margin: 0 0 8px; }
.dv-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
.dv-item + .dv-item { border-top: 1px solid var(--toul-divider); }
.dv-nombre { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: var(--toul-text); margin: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dv-sub { font-size: 12.5px; color: var(--toul-text-dim); margin: 2px 0 0; font-variant-numeric: tabular-nums; }
.dv-paso { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.dv-boton { width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    background: var(--toul-surface-2); color: var(--toul-text);
    transition: background-color 160ms var(--toul-ease-emil), color 160ms var(--toul-ease-emil); }
.dv-boton:disabled { color: var(--toul-text-faint); cursor: default; }
.dv-num { min-width: 26px; text-align: center; font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.dv-chip { padding: 10px 14px; border-radius: 12px; font-size: 14px; font-weight: 500; cursor: pointer; min-height: 44px;
    font-family: inherit; background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text);
    transition: background-color 160ms var(--toul-ease-emil), border-color 160ms var(--toul-ease-emil), color 160ms var(--toul-ease-emil); }
.dv-chip[data-activo="true"] { background: var(--toul-surface-focused); border-color: var(--toul-border-focused); color: var(--toul-accent); }
.dv-venta { display: flex; align-items: center; gap: 12px; padding: 10px 8px; margin: 0 -8px; width: calc(100% + 16px);
    border: none; background: none; border-radius: 14px; font: inherit; color: inherit; text-align: left; cursor: pointer;
    transition: background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.dv-venta:active { transform: scale(0.985); }
.dv-volver { display: inline-flex; align-items: center; gap: 6px; padding: 6px 0; margin: 0 0 10px; border: none; background: none;
    font: inherit; font-size: 13px; font-weight: 500; color: var(--toul-text-muted); cursor: pointer; }
.dv-aviso { font-size: 14.5px; line-height: 1.55; color: var(--toul-text-muted); margin: 4px 0 0; }
.dv-fila { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
@media (hover: hover) and (pointer: fine) {
    .dv-boton:not(:disabled):hover { background: var(--toul-border-2); }
    .dv-venta:hover { background: var(--toul-surface-3); }
    .dv-volver:hover { color: var(--toul-text); }
}
@media (prefers-reduced-motion: reduce) { .dv-venta:active { transform: none; } }
`

const fecha = (iso: string) =>
    new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Las devoluciones de una venta. null: la función todavía no está
 *  activa en este negocio (falta correr deploy_devoluciones.sql). */
export function useDevolucionesDeVenta(saleId: string | null) {
    return useSWR<SaleReturn[] | null>(saleId ? ['devoluciones-venta', saleId] : null, async () => {
        const { data, error } = await supabase.from('sale_returns').select(SALE_RETURN_SELECT)
            .eq('sale_id', saleId!).order('created_at')
        if (error) {
            if (SIN_TABLA.has(error.code)) return null
            throw error
        }
        return (data ?? []) as unknown as SaleReturn[]
    }, { revalidateOnFocus: false })
}

/** Cuántas unidades de cada producto de la venta ya volvieron */
export function devueltasPorItem(devoluciones: SaleReturn[] | null | undefined) {
    const map = new Map<string, number>()
    for (const d of devoluciones ?? []) {
        for (const i of d.sale_return_items ?? []) {
            map.set(i.sale_item_id, (map.get(i.sale_item_id) ?? 0) + Number(i.quantity))
        }
    }
    return map
}

function mensajeHecho(r: { refunded?: number; debtReduced?: number; method?: string | null }) {
    const plata = Math.round(Number(r.refunded) || 0)
    const deuda = Math.round(Number(r.debtReduced) || 0)
    if (plata > 0 && deuda > 0) return `Listo. Se le bajaron ${formatCOP(deuda)} de la deuda y le devuelves ${formatCOP(plata)} por ${r.method ?? 'el mismo medio'}.`
    if (deuda > 0) return `Listo. Se le bajaron ${formatCOP(deuda)} de la deuda.`
    return `Listo. Le devuelves ${formatCOP(plata)} por ${r.method ?? 'el mismo medio'}. El producto ya volvió al inventario.`
}

export function DevolucionSheet({ open, onClose, saleId = null, isAdmin, onDone }: {
    open: boolean
    onClose: () => void
    /** Desde el detalle de una venta ya se sabe cuál es; desde el inicio, se busca */
    saleId?: string | null
    isAdmin: boolean
    onDone?: (resultado: 'devuelta' | 'pedida') => void
}) {
    const { mutate: refrescar } = useSWRConfig()
    const { methods } = usePaymentMethods()
    const { data: store } = useStore()

    const [buscada, setBuscada] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [cantidades, setCantidades] = useState<Record<string, number>>({})
    const [metodo, setMetodo] = useState<string | null>(null)
    const [motivo, setMotivo] = useState('')
    const [enviando, setEnviando] = useState(false)

    // Cada vez que se abre, de cero
    const [abiertaAntes, setAbiertaAntes] = useState(open)
    if (open !== abiertaAntes) {
        setAbiertaAntes(open)
        if (open) {
            setBuscada(null); setQuery(''); setCantidades({}); setMetodo(null); setMotivo('')
        }
    }

    const id = saleId ?? buscada

    // ── Buscar la venta (desde el inicio) ──
    const { data: recientes, isLoading: cargandoRecientes } = useSWR(
        open && !id && store?.id ? ['ventas-para-devolver', store.id] : null,
        async () => {
            const desde = new Date(Date.now() - PLAZO_MS).toISOString()
            const { data, error } = await supabase.from('sales').select(RECIENTES_SELECT)
                .eq('store_id', store!.id).gte('created_at', desde)
                .order('created_at', { ascending: false }).limit(150)
            if (error) throw error
            return (data ?? []) as unknown as VentaReciente[]
        },
        { revalidateOnFocus: false },
    )

    const encontradas = useMemo(() => {
        const q = query.trim().toLowerCase().replace(/^#/, '')
        const lista = recientes ?? []
        if (!q) return lista.slice(0, 30)
        return lista.filter(v =>
            v.id.startsWith(q) ||
            v.customer_name?.toLowerCase().includes(q) ||
            v.sale_items.some(i => saleItemName(i).toLowerCase().includes(q))
        ).slice(0, 30)
    }, [recientes, query])

    // ── La venta elegida ──
    const { data: venta, error: errorVenta } = useSWR(open && id ? ['venta-para-devolver', id] : null, async () => {
        const { data, error } = await supabase.from('sales').select(VENTA_SELECT).eq('id', id!).single()
        if (error) throw error
        return data as unknown as VentaParaDevolver
    }, { revalidateOnFocus: false })

    const { data: devoluciones } = useDevolucionesDeVenta(open && id ? id : null)
    const devueltas = useMemo(() => devueltasPorItem(devoluciones), [devoluciones])
    const quedan = useCallback((item: ItemVenta) => Math.max(Number(item.quantity) - (devueltas.get(item.id) ?? 0), 0), [devueltas])

    const calculo = useMemo(() => {
        if (!venta) return { total: 0, deuda: 0, plata: 0 }
        const bruto = venta.sale_items.reduce((s, i) => s + Number(i.subtotal), 0)
        const factor = bruto > 0 ? Number(venta.total) / bruto : 1
        const elegido = venta.sale_items.reduce((s, i) => s + (cantidades[i.id] ?? 0) * Number(i.unit_price), 0)
        const yaDevuelto = (devoluciones ?? []).reduce((s, d) => s + Number(d.total), 0)
        const total = Math.round(Math.min(elegido * factor, Math.max(Number(venta.total) - yaDevuelto, 0)))
        let deuda = 0
        if (venta.is_credit) {
            const pagado = venta.sale_payments.reduce((s, p) => s + Number(p.amount), 0)
            const yaBajado = (devoluciones ?? []).reduce((s, d) => s + Number(d.debt_reduced), 0)
            deuda = Math.min(total, Math.max(Number(venta.total) - pagado - yaBajado, 0))
        }
        return { total, deuda: Math.round(deuda), plata: Math.round(total - deuda) }
    }, [venta, cantidades, devoluciones])

    // Por defecto, por donde entró la mayor parte de la plata
    const metodoPorDefecto = useMemo(() => {
        const pagos = [...(venta?.sale_payments ?? [])].sort((a, b) => Number(b.amount) - Number(a.amount))
        const delPago = pagos.find(p => p.method_id && methods.some(m => m.id === p.method_id))?.method_id
        return delPago ?? methods[0]?.id ?? null
    }, [venta, methods])
    const metodoElegido = metodo ?? metodoPorDefecto
    const nombreMetodo = methods.find(m => m.id === metodoElegido)?.name

    const cambiar = useCallback((itemId: string, delta: number, max: number) => {
        setCantidades(prev => ({ ...prev, [itemId]: Math.min(Math.max((prev[itemId] ?? 0) + delta, 0), max) }))
    }, [])

    const cerrar = useCallback(() => { if (!enviando) onClose() }, [enviando, onClose])

    const vieja = !!venta && Date.now() - new Date(venta.created_at).getTime() > PLAZO_MS
    const todoDevuelto = !!venta && venta.sale_items.every(i => quedan(i) === 0)
    const inactiva = devoluciones === null
    const bloqueo = inactiva
        ? 'Las devoluciones todavía no están activas en tu negocio.'
        : vieja
            ? `Esta venta tiene más de ${DIAS_PARA_DEVOLVER} días: ya no se puede devolver.`
            : todoDevuelto
                ? 'Ya devolvió todo lo de esta venta.'
                : null
    const listo = !!venta && devoluciones !== undefined && !bloqueo && calculo.total > 0 && motivo.trim().length > 0 && !!metodoElegido

    async function confirmar() {
        if (!venta || !listo) return
        const items = venta.sale_items
            .filter(i => (cantidades[i.id] ?? 0) > 0)
            .map(i => ({ saleItemId: i.id, quantity: cantidades[i.id] }))
        setEnviando(true)
        try {
            if (isAdmin) {
                const { data, error } = await supabase.rpc('toul_return_sale', {
                    p_sale_id: venta.id, p_items: items, p_method_id: metodoElegido, p_reason: motivo.trim(),
                })
                if (error) throw error
                toast.success(mensajeHecho(data as { refunded: number; debtReduced: number; method: string | null }))
                onDone?.('devuelta')
            } else {
                const res = await fetch('/api/approvals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'return_sale', saleId: venta.id, reason: motivo.trim(), details: { items, methodId: metodoElegido } }),
                })
                const data = await res.json()
                // Los 400 traen la regla de negocio, ya escrita en español
                if (!res.ok) throw { message: data.error, code: res.status === 400 ? 'P0001' : undefined }
                toast.success('Solicitud enviada al administrador')
                onDone?.('pedida')
            }
            refrescar(key => Array.isArray(key) ? REFRESCAR.has(String(key[0])) : key === 'isla-pending-approvals')
            onClose()
        } catch (err) {
            toast.error(explainError(err, 'No se pudo hacer la devolución. Intenta de nuevo.'))
        } finally {
            setEnviando(false)
        }
    }

    const titulo = isAdmin ? 'Devolver productos' : 'Pedir devolución'
    const subtitulo = id
        ? venta ? `${fecha(venta.created_at)} · ${formatCOP(venta.total)}${venta.customer_name ? ` · ${venta.customer_name}` : ''}` : undefined
        : `Busca la venta. Se puede devolver hasta ${DIAS_PARA_DEVOLVER} días después.`

    const pie = id && venta && !bloqueo && devoluciones !== undefined ? (
        <div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, minHeight: 24 }}>
                {calculo.total === 0 ? (
                    <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', margin: 0 }}>Elige qué productos devuelve</p>
                ) : (
                    <>
                        {calculo.deuda > 0 && (
                            <div className="dv-fila">
                                <span style={{ fontSize: 14, color: 'var(--toul-text-muted)' }}>Se le baja de la deuda</span>
                                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-info)', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCOP(calculo.deuda)}
                                </span>
                            </div>
                        )}
                        {calculo.plata > 0 && (
                            <div className="dv-fila">
                                <span style={{ fontSize: 14, color: 'var(--toul-text-muted)' }}>Le devuelves{nombreMetodo ? ` en ${nombreMetodo}` : ''}</span>
                                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCOP(calculo.plata)}
                                </span>
                            </div>
                        )}
                    </>
                )}
            </div>
            <button className="toul-btn-primary" onClick={confirmar} disabled={!listo || enviando}>
                {enviando ? 'Enviando…' : isAdmin ? 'Hacer la devolución' : 'Enviar al administrador'}
            </button>
        </div>
    ) : undefined

    return (
        <Sheet open={open} onClose={cerrar} title={titulo} subtitle={subtitulo} footer={pie} width={460}>
            <style>{CSS}</style>
            <AnimatePresence mode="wait" initial={false}>
                {!id ? (
                    <motion.div key="buscar"
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.18, ease: EASE_OUT_EMIL }}>
                        <div style={{ position: 'relative', marginBottom: 10 }}>
                            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }} />
                            <input className="toul-input" placeholder="Cliente, producto o número de venta"
                                value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 42 }} />
                        </div>
                        {cargandoRecientes || !recientes ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                                {[0, 1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 14 }} />)}
                            </div>
                        ) : encontradas.length === 0 ? (
                            <p className="dv-aviso" style={{ padding: '18px 0', textAlign: 'center' }}>
                                {query.trim() ? 'No hay ventas recientes que coincidan.' : `No hay ventas en los últimos ${DIAS_PARA_DEVOLVER} días.`}
                            </p>
                        ) : (
                            <div>
                                {encontradas.map(v => {
                                    const nombres = v.sale_items.map(i => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${saleItemName(i)}`).join(', ')
                                    const primero = v.sale_items[0]
                                    return (
                                        <button key={v.id} type="button" className="dv-venta" onClick={() => setBuscada(v.id)}>
                                            <Thumb src={primero?.products?.image_url} name={primero ? saleItemName(primero) : ''} size={40} />
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span className="dv-nombre" style={{ display: 'block', fontSize: 14.5 }}>{nombres || 'Venta'}</span>
                                                <span className="dv-sub" style={{ display: 'block' }}>
                                                    {fecha(v.created_at)}{v.customer_name ? ` · ${v.customer_name}` : ''}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                {formatCOP(v.total)}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div key={id}
                        initial={{ opacity: 0, x: saleId ? 0 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.18, ease: EASE_OUT_EMIL }}>
                        {!saleId && (
                            <button type="button" className="dv-volver" onClick={() => { setBuscada(null); setCantidades({}); setMetodo(null) }}>
                                <ArrowLeft size={15} /> Otra venta
                            </button>
                        )}

                        {errorVenta ? (
                            <p className="dv-aviso">No se encontró la venta. Puede que la hayan anulado.</p>
                        ) : !venta || devoluciones === undefined ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {[0, 1].map(i => <div key={i} className="skeleton" style={{ height: 60, borderRadius: 14 }} />)}
                            </div>
                        ) : bloqueo ? (
                            <p className="dv-aviso">{bloqueo}</p>
                        ) : (
                            <>
                                <p className="dv-rotulo">¿Qué devuelve?</p>
                                <div>
                                    {venta.sale_items.map(item => {
                                        const max = quedan(item)
                                        const n = cantidades[item.id] ?? 0
                                        const ya = devueltas.get(item.id) ?? 0
                                        return (
                                            <div key={item.id} className="dv-item" style={{ opacity: max === 0 ? 0.5 : 1 }}>
                                                <Thumb src={item.products?.image_url} name={saleItemName(item)} size={40} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p className="dv-nombre">{saleItemName(item)}</p>
                                                    <p className="dv-sub">
                                                        {max === 0 ? 'Ya lo devolvió'
                                                            : `${item.quantity} × ${formatCOP(item.unit_price)}${ya ? ` · quedan ${max}` : ''}`}
                                                    </p>
                                                </div>
                                                {max > 0 && (
                                                    <div className="dv-paso">
                                                        <motion.button type="button" className="dv-boton" aria-label="Uno menos"
                                                            whileTap={n > 0 ? { scale: 0.9 } : undefined} transition={SPRING_PRESS}
                                                            disabled={n === 0} onClick={() => cambiar(item.id, -1, max)}>
                                                            <Minus size={16} strokeWidth={2.4} />
                                                        </motion.button>
                                                        <span className="dv-num" style={{ color: n > 0 ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>{n}</span>
                                                        <motion.button type="button" className="dv-boton" aria-label="Uno más"
                                                            whileTap={n < max ? { scale: 0.9 } : undefined} transition={SPRING_PRESS}
                                                            disabled={n >= max} onClick={() => cambiar(item.id, 1, max)}>
                                                            <Plus size={16} strokeWidth={2.4} />
                                                        </motion.button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>

                                {venta.is_credit && (
                                    <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--toul-text-dim)', margin: '10px 0 0' }}>
                                        Era fiado: primero se le baja de lo que debe. Si ya había pagado, el resto vuelve en plata.
                                    </p>
                                )}

                                {/* En un fiado sin abonos no sale plata: no hay método que elegir */}
                                {(!venta.is_credit || calculo.plata > 0) && methods.length > 0 && (
                                    <div style={{ marginTop: 20 }}>
                                        <p className="dv-rotulo">Le devuelves por</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                            {methods.map(m => (
                                                <button key={m.id} type="button" className="dv-chip" data-activo={metodoElegido === m.id}
                                                    onClick={() => setMetodo(m.id)}>
                                                    {m.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ marginTop: 20 }}>
                                    <p className="dv-rotulo">Motivo</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                        {MOTIVOS.map(r => (
                                            <button key={r} type="button" className="dv-chip" data-activo={motivo === r} onClick={() => setMotivo(r)}>
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea className="toul-input" rows={2} placeholder="O escribe otro motivo…" value={motivo}
                                        onChange={e => setMotivo(e.target.value)} maxLength={200}
                                        style={{ resize: 'none', height: 'auto', paddingTop: 12 }} />
                                </div>

                                {!isAdmin && (
                                    <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '10px 0 0' }}>
                                        El administrador recibirá una notificación. La devolución se hace cuando la apruebe.
                                    </p>
                                )}
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </Sheet>
    )
}
