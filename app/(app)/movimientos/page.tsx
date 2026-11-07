'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Banknote, Receipt, ShoppingBag, Truck, Undo2, X, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatPrecio } from '@/lib/utils'
import { diasEntre, enColombia, formatoColombia, periodoDeDireccion, rangoPeriodo, tramoDeDias, ZONA_COLOMBIA, type Periodo, type Rango } from '@/lib/periodos'
import { nombreMetodo } from '@/lib/format/text'
import { nombreCategoria } from '@/lib/types'
import { useStore } from '@/lib/hooks/useData'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { SelectorPeriodo } from '@/components/dashboard/Desplegable'
import { SPRING_PRESS } from '@/components/ui'
import { PLATA_MIA } from '@/components/movimientos/CuentaChips'
import { RegistrarMovimiento, TIPOS_MOVIMIENTO, type MovimientoAEditar, type MovimientoGuardado, type TipoMovimiento } from '@/components/movimientos/RegistrarMovimiento'
import { DetalleMovimiento, type Movimiento } from '@/components/movimientos/DetalleMovimiento'

/* ══════════════════════════════════════════════════════════════
   Movimientos: toda la plata del negocio, día por día.

   Arriba se anota lo que no es venta: un Gasto, "Metí plata" o
   "Saqué plata". Metí y Saqué plata son plata entre el dueño y su
   negocio: se ven aquí, pero no cuentan en lo que ganaste.

   Desde Reportes (o cualquier número que traiga aquí) se llega con
   un filtro puesto: sale como una píldora más, con su total, para
   ver que suma lo mismo. Al quitarla, vuelve la vista normal.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()

const CSS = `
.mv-titulo { margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--toul-text); }
.mv-cabeza { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }

/* Las tres acciones, como las del Inicio */
.mv-acciones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 20px 0 10px; }
@media (min-width: 1024px) { .mv-acciones { max-width: 420px; } }
.mv-accion { display: flex; flex-direction: column; align-items: center; gap: 7px; width: 100%; padding: 2px 0;
    border: none; background: none; font: inherit; font-size: 12px; color: var(--toul-text-muted); cursor: pointer;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
.mv-circulo { width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 7%, transparent); transition: background-color 160ms var(--toul-ease-emil); }
@media (hover: hover) and (pointer: fine) { .mv-accion:hover .mv-circulo { background: color-mix(in srgb, var(--toul-text) 10%, transparent); } }

/* Filtros: se deslizan de lado */
.mv-filtros { display: flex; gap: 6px; overflow-x: auto; margin: 18px -16px 4px; padding: 0 16px;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
.mv-filtros::-webkit-scrollbar { display: none; }
@media (min-width: 768px) { .mv-filtros { margin-left: -32px; margin-right: -32px; padding: 0 32px; } }
.mv-filtro { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 999px;
    border: none; font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); color: var(--toul-text-muted);
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 200ms var(--toul-ease-emil), color 200ms var(--toul-ease-emil); }
.mv-filtro[aria-pressed="true"] { background: var(--toul-text); color: var(--toul-bg); font-weight: 600; }
.mv-quitar { display: inline-flex; margin: -2px -4px -2px 0; padding: 2px; border-radius: 50%; }
@media (hover: hover) and (pointer: fine) { .mv-filtro:not([aria-pressed="true"]):hover { background: color-mix(in srgb, var(--toul-text) 9%, transparent); } }

/* La historia */
.mv-dia { margin: 18px 0 4px; font-size: 13px; font-weight: 600; color: color-mix(in srgb, var(--toul-text) 50%, transparent); }
.mv-fila { display: flex; align-items: center; gap: 12px; width: calc(100% + 16px); margin: 0 -8px; padding: 10px 8px;
    border: none; border-radius: 14px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.mv-fila:active { transform: scale(0.99); }
@media (hover: hover) and (pointer: fine) { .mv-fila:hover { background: color-mix(in srgb, var(--toul-text) 4%, transparent); } }
.mv-icono { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); }
.mv-textos { flex: 1; min-width: 0; }
.mv-t { display: block; font-size: 15px; font-weight: 500; color: var(--toul-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-s { display: block; margin-top: 2px; font-size: 12px; color: var(--toul-text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mv-etiqueta { display: inline-block; margin-left: 4px; padding: 2px 7px; border-radius: 999px; font-size: 11px;
    color: color-mix(in srgb, var(--toul-text) 55%, transparent); background: color-mix(in srgb, var(--toul-text) 6%, transparent); }
.mv-monto { margin-left: auto; padding-left: 8px; flex-shrink: 0; font-size: 15px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.mv-vacio { padding: 30px 0; text-align: center; font-size: 13px; color: var(--toul-text-subtle); }

/* La fila que se acaba de guardar entra desde arriba */
.mv-nueva { animation: mv-entra 500ms cubic-bezier(0.23, 1, 0.32, 1); }
@keyframes mv-entra { from { opacity: 0; transform: translateY(-10px); } }
@media (prefers-reduced-motion: reduce) { .mv-nueva { animation: none; } .mv-fila:active { transform: none; } }
`

/** Salidas de plata. Todo lo demás entra */
const SALEN = ['expense', 'purchase', 'provider_payment', 'transfer_out', 'owner_out']

/** Plata entre el dueño y su negocio: no es ganancia ni gasto (lo de
 *  antes del dueño, tampoco) */
const DE_TU_NEGOCIO = ['owner_in', 'owner_out', 'transfer_in', 'transfer_out', 'capital']

const ICONOS: Record<string, LucideIcon> = {
    sale: ShoppingBag, sale_payment: Banknote, credit_payment: Banknote, sale_refund: Undo2,
    expense: Receipt, purchase: Truck, provider_payment: Truck,
    owner_in: ArrowDownLeft, owner_out: ArrowUpRight,
    transfer_in: ArrowLeftRight, transfer_out: ArrowLeftRight, capital: ArrowDownLeft,
}

type Filtro = 'todo' | 'ventas' | 'abonos' | 'gastos' | 'compras' | 'tu'
const FILTROS: { valor: Filtro; texto: string }[] = [
    { valor: 'todo', texto: 'Todo' },
    { valor: 'ventas', texto: 'Ventas' },
    { valor: 'abonos', texto: 'Abonos' },
    { valor: 'gastos', texto: 'Gastos' },
    { valor: 'compras', texto: 'Compras' },
    { valor: 'tu', texto: 'Tú y tu negocio' },
]

/** Lo que llega desde otra pantalla: /movimientos?periodo=month&tipo=cobros&metodo=Nequi.
 *  Cada uno suma exactamente lo mismo que el número de donde vino */
type TipoDeAfuera = 'todos' | 'entradas' | 'salidas' | 'cobros' | 'ventas' | 'abonos' | 'mercancia' | 'gastos' | 'devoluciones'
const NOMBRE_DE_AFUERA: Record<TipoDeAfuera, string> = {
    todos: 'Todo', entradas: 'Entradas', salidas: 'Salidas', cobros: 'Ventas y abonos', ventas: 'Ventas',
    abonos: 'Abonos', mercancia: 'Mercancía que pagaste', gastos: 'Gastos', devoluciones: 'Devoluciones',
}
const ES_DE_AFUERA = (v: string | null): v is TipoDeAfuera => !!v && v in NOMBRE_DE_AFUERA
/** "Sin cuenta": lo de antes que se guardó sin método ("General") */
const SIN_CUENTA = 'sin'

interface Fila {
    id: string
    created_at: string
    type: string
    method: string | null
    method_id: string | null
    own_money: boolean
    amount: number
    notes: string | null
    reference_id: string | null
    linked_payment_id: string | null
    cash_session_id: string | null
    created_by_name: string | null
    signed: number
}

const POR_PAGINA = 60
const sinMetodo = (f: Pick<Fila, 'method'>) => !f.method?.trim() || f.method.trim().toLowerCase() === 'general'

/** "Hoy", "Ayer", "4 nov" (y el año si no es este) */
function nombreDia(iso: string): string {
    const atras = diasEntre(iso, new Date())
    if (atras === 0) return 'Hoy'
    if (atras === 1) return 'Ayer'
    const mismoAno = enColombia(iso).ano === enColombia(new Date()).ano
    // es-CO dice "4 de nov." y el diseño pide "4 nov"
    return formatoColombia(iso, mismoAno ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
        .replace(/\bde\s+/g, '').replace(/\./g, '')
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA_COLOMBIA })

/** Lo que dice cada producto: "2 xxx", "carneguey 200 ml"; y "y 2 más" */
interface ItemDb { quantity: number; products: { name: string } | null; product_variants?: { name: string } | null; combos?: { name: string } | null }
function textoItems(items: ItemDb[]): string {
    if (!items.length) return ''
    const nombre = (i: ItemDb) => [i.products?.name ?? i.combos?.name ?? 'Producto', i.product_variants?.name].filter(Boolean).join(' ')
    const primero = items[0]
    const cant = Math.round(Number(primero.quantity))
    const base = `${cant > 1 ? `${cant} ` : ''}${nombre(primero)}`
    return items.length > 1 ? `${base} y ${items.length - 1} más` : base
}
const despuesDe = (texto: string | null, prefijo: string) =>
    texto && texto.startsWith(prefijo) ? texto.slice(prefijo.length).trim() : ''

export default function MovimientosPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <Movimientos />
        </Suspense>
    )
}

function Movimientos() {
    const { data: store } = useStore()
    const storeId = store?.id || null
    const variante = useIsMobile() ? 'movil' : 'pc'

    const params = useSearchParams()
    const [inicial] = useState(() => {
        const p = periodoDeDireccion(params)
        const tipo = params.get('tipo')
        const metodo = params.get('metodo')
        return {
            periodo: (p?.periodo ?? 'month') as Periodo,
            rango: p?.periodo === 'custom' ? tramoDeDias(p.desde, p.hasta) as Rango : null,
            deAfuera: ES_DE_AFUERA(tipo) || metodo ? { tipo: ES_DE_AFUERA(tipo) ? tipo : 'todos' as TipoDeAfuera, metodo: metodo ?? '' } : null,
        }
    })
    const [periodo, setPeriodo] = useState<Periodo>(inicial.periodo)
    const [rango, setRango] = useState<Rango>(inicial.rango)
    const [filtro, setFiltro] = useState<Filtro>('todo')
    const [deAfuera, setDeAfuera] = useState(inicial.deAfuera)
    const [limite, setLimite] = useState(POR_PAGINA)

    const [anotar, setAnotar] = useState<TipoMovimiento | null>(null)
    const [editar, setEditar] = useState<MovimientoAEditar | null>(null)
    const [abierto, setAbierto] = useState<Movimiento | null>(null)
    const [nueva, setNueva] = useState<{ paymentId?: string; expenseId?: string } | null>(null)

    const tramo = useMemo(() => rangoPeriodo(periodo, rango), [periodo, rango])

    // Todo el periodo, de a 1.000: el total de un filtro tiene que sumarlo todo
    const { data, isLoading, mutate } = useSWR(storeId ? ['movimientos', storeId, periodo, tramo.from, periodo === 'custom' ? tramo.to : 'ahora'] : null, async () => {
        const filas: Fila[] = []
        for (let desde = 0; ; desde += 1000) {
            let q = supabase.from('payments')
                .select('id, created_at, type, method, method_id, own_money, amount, notes, reference_id, linked_payment_id, cash_session_id, created_by_name')
                .eq('store_id', storeId)
                .order('created_at', { ascending: false })
                .order('id')
                .range(desde, desde + 999)
            if (tramo.from) q = q.gte('created_at', tramo.from)
            if (tramo.to && periodo === 'custom') q = q.lte('created_at', tramo.to)
            const { data, error } = await q
            if (error) throw error
            for (const f of (data ?? []) as Omit<Fila, 'signed'>[]) {
                // Un monto negativo ya viene firmado (anulaciones); el resto se firma por tipo
                const monto = Number(f.amount)
                filas.push({ ...f, own_money: !!f.own_money, signed: monto < 0 ? monto : SALEN.includes(f.type) ? -monto : monto })
            }
            if ((data ?? []).length < 1000) return filas
        }
    }, { revalidateOnFocus: false })

    const { visibles, total } = useMemo(() => {
        const filas = data ?? []
        // Una venta anulada deja su entrada y su devolución: se anulan entre
        // sí y no cuentan como venta, igual que en Reportes
        const anuladas = new Set(filas
            .filter(f => f.type === 'sale_refund' && (f.notes ?? '').startsWith('Anulación') && f.reference_id)
            .map(f => f.reference_id as string))
        const esVenta = (f: Fila) => f.type === 'sale' && !(f.reference_id && anuladas.has(f.reference_id))
        const esAbono = (f: Fila) => f.type === 'sale_payment' || f.type === 'credit_payment'

        let lista: Fila[]
        if (deAfuera) {
            lista = filas.filter(f => {
                switch (deAfuera.tipo) {
                    case 'entradas': return f.signed >= 0
                    case 'salidas': return f.signed < 0
                    case 'cobros': return esVenta(f) || esAbono(f)
                    case 'ventas': return esVenta(f)
                    case 'abonos': return esAbono(f)
                    case 'mercancia': return f.type === 'purchase' || f.type === 'provider_payment'
                    case 'gastos': return f.type === 'expense'
                    case 'devoluciones': return f.type === 'sale_refund' && !(f.notes ?? '').startsWith('Anulación')
                    default: return true
                }
            }).filter(f => !deAfuera.metodo || (deAfuera.metodo === SIN_CUENTA
                ? sinMetodo(f)
                : f.method?.trim().toLowerCase() === deAfuera.metodo.trim().toLowerCase()))
        } else {
            lista = filas.filter(f => {
                switch (filtro) {
                    case 'ventas': return esVenta(f)
                    case 'abonos': return esAbono(f)
                    case 'gastos': return f.type === 'expense'
                    case 'compras': return f.type === 'purchase' || f.type === 'provider_payment'
                    case 'tu': return f.type === 'owner_in' || f.type === 'owner_out'
                    default: return true
                }
            })
        }
        // El total de la píldora: lo que suma ese número allá (Metí y Saqué plata no)
        const cuentan = lista.filter(f => !DE_TU_NEGOCIO.includes(f.type))
        return { visibles: lista, total: Math.round(cuentan.reduce((s, f) => s + Math.abs(f.signed), 0)) }
    }, [data, filtro, deAfuera])

    const pagina = useMemo(() => visibles.slice(0, limite), [visibles, limite])
    const detalles = useDetalles(pagina)

    // Cada fila, lista para mostrar
    const porId = useMemo(() => new Map((data ?? []).map(f => [f.id, f])), [data])
    const armar = useCallback((f: Fila): Movimiento => {
        let titulo: string
        const items = (ref: string | null) => (ref && detalles.items.get(ref)) || ''
        const con = (base: string, extra: string) => extra ? `${base} · ${extra}` : base
        switch (f.type) {
            case 'sale': titulo = con('Venta', items(f.reference_id)); break
            case 'sale_refund': titulo = con((f.notes ?? '').startsWith('Anulación') ? 'Anulación' : 'Devolución', items(f.reference_id)); break
            case 'sale_payment':
            case 'credit_payment': titulo = con('Abono', despuesDe(f.notes, 'Abono del cliente:')); break
            case 'expense': {
                const g = f.reference_id ? detalles.gastos.get(f.reference_id) : undefined
                titulo = con('Gasto', g ? nombreCategoria(g.category) : despuesDe(f.notes, 'Gasto:'))
                break
            }
            case 'purchase': titulo = con('Compra', items(f.reference_id)); break
            case 'provider_payment': titulo = con('Pago a proveedor', despuesDe(f.notes, 'Abono a proveedor:')); break
            case 'owner_in': {
                if (f.linked_payment_id) {
                    const padre = porId.get(f.linked_payment_id)?.type
                        ?? ((f.notes ?? '').startsWith('Compra') ? 'purchase' : (f.notes ?? '').startsWith('Gasto') ? 'expense' : (f.notes ?? '').startsWith('Abono a proveedor') ? 'provider_payment' : '')
                    titulo = con('Metí plata', padre === 'purchase' ? 'para la compra' : padre === 'expense' ? 'para el gasto' : padre === 'provider_payment' ? 'para pagarle al proveedor' : '')
                } else titulo = con('Metí plata', f.notes?.trim() ?? '')
                break
            }
            case 'owner_out': titulo = con('Saqué plata', f.notes?.trim() ?? ''); break
            case 'transfer_in':
            case 'transfer_out': titulo = 'Traslado'; break
            case 'capital': titulo = 'Capital propio'; break
            default: titulo = 'Movimiento'
        }
        const g = f.type === 'expense' && f.reference_id ? detalles.gastos.get(f.reference_id) : undefined
        return {
            ...f, titulo,
            cuenta: f.own_money ? 'Plata tuya' : sinMetodo(f) ? 'Sin cuenta' : nombreMetodo(f.method),
            Icon: ICONOS[f.type] ?? ArrowLeftRight,
            deTuNegocio: f.type === 'owner_in' || f.type === 'owner_out',
            turnoCerrado: !!f.cash_session_id && detalles.turnos.get(f.cash_session_id) === 'closed',
            categoria: g ? nombreCategoria(g.category) : undefined,
            descripcion: g ? g.description : undefined,
        }
    }, [detalles, porId])

    // Por día
    const dias = useMemo(() => {
        const grupos: { dia: string; filas: Movimiento[] }[] = []
        for (const f of pagina) {
            const dia = nombreDia(f.created_at)
            const ultimo = grupos[grupos.length - 1]
            if (ultimo?.dia === dia) ultimo.filas.push(armar(f))
            else grupos.push({ dia, filas: [armar(f)] })
        }
        return grupos
    }, [pagina, armar])

    // Al llegar al final, siguen cargando solas
    const fin = useRef<HTMLDivElement>(null)
    const hayMas = visibles.length > limite
    useEffect(() => {
        const nodo = fin.current
        if (!nodo || !hayMas) return
        const obs = new IntersectionObserver(e => { if (e[0]?.isIntersecting) setLimite(l => l + POR_PAGINA) }, { rootMargin: '300px' })
        obs.observe(nodo)
        return () => obs.disconnect()
    }, [hayMas])

    const verFiltro = useCallback((f: Filtro) => { setFiltro(f); setDeAfuera(null); setLimite(POR_PAGINA) }, [])
    const cambiarPeriodo = useCallback((p: Periodo) => { setPeriodo(p); setLimite(POR_PAGINA) }, [])
    // Quitar el filtro que vino de afuera: vuelve la vista normal
    const quitarDeAfuera = useCallback(() => {
        setDeAfuera(null); setFiltro('todo'); setLimite(POR_PAGINA)
        const url = new URL(window.location.href)
        url.searchParams.delete('tipo'); url.searchParams.delete('metodo')
        window.history.replaceState(null, '', url.pathname + (url.search || ''))
    }, [])

    const cerrarAnotar = useCallback(() => { setAnotar(null); setEditar(null) }, [])
    const guardado = useCallback((r: MovimientoGuardado) => {
        if (!r.editado) {
            // Que se vea: si el filtro no la muestra, se vuelve a "Todo"
            const seVe = !deAfuera && (filtro === 'todo' || (filtro === 'gastos' && r.tipo === 'gasto') || (filtro === 'tu' && r.tipo !== 'gasto'))
            if (!seVe) { setDeAfuera(null); setFiltro('todo') }
            setNueva({ paymentId: r.paymentId, expenseId: r.expenseId })
            setTimeout(() => setNueva(null), 2300)
        } else if (r.expenseId) {
            // Un gasto corregido puede cambiar de categoría
            detalles.olvidar([r.expenseId])
        }
        mutate()
    }, [deAfuera, filtro, mutate, detalles])

    const abrirEdicion = useCallback((m: Movimiento) => {
        setAbierto(null)
        const tipo: TipoMovimiento = m.type === 'expense' ? 'gasto' : m.type === 'owner_in' ? 'meti' : 'saque'
        setEditar({
            tipo,
            id: m.type === 'expense' ? (m.reference_id as string) : m.id,
            monto: m.amount,
            nota: m.type === 'expense' ? (m.descripcion ?? null) : m.notes,
            categoria: m.type === 'expense' ? (detalles.gastos.get(m.reference_id as string)?.category ?? 'otros') : undefined,
            cuenta: m.own_money ? PLATA_MIA : m.method_id,
            turnoCerrado: m.turnoCerrado,
        })
        setAnotar(tipo)
    }, [detalles])

    const verPadre = useCallback((m: Movimiento) => {
        const padre = m.linked_payment_id ? porId.get(m.linked_payment_id) : undefined
        setAbierto(padre ? armar(padre) : null)
    }, [porId, armar])

    const esNueva = (m: Movimiento) => !!nueva && ((!!nueva.paymentId && nueva.paymentId === m.id)
        || (!!nueva.expenseId && m.type === 'expense' && m.reference_id === nueva.expenseId))

    return (
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-2xl lg:max-w-[1040px] mx-auto" style={{ position: 'relative' }}>
            <style>{CSS}</style>

            <div className="mv-cabeza">
                <h1 className="mv-titulo">Movimientos</h1>
                <SelectorPeriodo variante={variante} forma="pildora" conAno lado={variante === 'pc' ? 'derecha' : 'izquierda'}
                    period={periodo} setPeriod={cambiarPeriodo} rango={rango} setRango={setRango} />
            </div>

            <div className="mv-acciones">
                {(Object.keys(TIPOS_MOVIMIENTO) as TipoMovimiento[]).map(tipo => {
                    const { titulo, Icon, verde } = TIPOS_MOVIMIENTO[tipo]
                    return (
                        <motion.button key={tipo} type="button" className="mv-accion" onClick={() => { setEditar(null); setAnotar(tipo) }}
                            whileTap={{ scale: 0.92 }} transition={SPRING_PRESS}>
                            <span className="mv-circulo">
                                <Icon size={24} strokeWidth={2} style={{ color: verde ? 'var(--toul-accent)' : 'var(--toul-text)' }} />
                            </span>
                            {titulo}
                        </motion.button>
                    )
                })}
            </div>

            <div className="mv-filtros" role="group" aria-label="Qué movimientos ver">
                {deAfuera && (
                    <button type="button" className="mv-filtro" aria-pressed="true" onClick={quitarDeAfuera}
                        aria-label={`Quitar el filtro ${NOMBRE_DE_AFUERA[deAfuera.tipo]}`}>
                        {NOMBRE_DE_AFUERA[deAfuera.tipo]}
                        {deAfuera.metodo && ` · ${deAfuera.metodo === SIN_CUENTA ? 'Sin cuenta' : nombreMetodo(deAfuera.metodo)}`}
                        {!isLoading && (deAfuera.tipo === 'todos'
                            ? ` · ${visibles.length} ${visibles.length === 1 ? 'movimiento' : 'movimientos'}`
                            : ` · ${formatPrecio(total)}`)}
                        <span className="mv-quitar" aria-hidden><X size={14} strokeWidth={2.4} /></span>
                    </button>
                )}
                {FILTROS.map(f => (
                    <button key={f.valor} type="button" className="mv-filtro" aria-pressed={!deAfuera && filtro === f.valor}
                        onClick={() => verFiltro(f.valor)}>
                        {f.texto}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                    {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 14 }} />)}
                </div>
            ) : visibles.length === 0 ? (
                <p className="mv-vacio">Aún no hay movimientos de este tipo</p>
            ) : (
                <div>
                    {dias.map(({ dia, filas }) => (
                        <section key={dia}>
                            <h2 className="mv-dia">{dia}</h2>
                            {filas.map(m => {
                                const entra = m.signed > 0
                                return (
                                    <button key={m.id} type="button" className={`mv-fila${esNueva(m) ? ' mv-nueva' : ''}`} onClick={() => setAbierto(m)}>
                                        <span className="mv-icono">
                                            <m.Icon size={18} strokeWidth={2} style={{ color: entra ? 'var(--toul-accent)' : 'var(--toul-text-muted)' }} />
                                        </span>
                                        <span className="mv-textos">
                                            <span className="mv-t">{m.titulo}</span>
                                            <span className="mv-s">
                                                {m.cuenta} · {hora(m.created_at)}
                                                {m.deTuNegocio && <span className="mv-etiqueta">No cuenta en lo que ganaste</span>}
                                            </span>
                                        </span>
                                        <span className="mv-monto" style={{ color: entra ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                                            {entra ? '+' : '−'}{formatPrecio(Math.round(Math.abs(m.signed)))}
                                        </span>
                                    </button>
                                )
                            })}
                        </section>
                    ))}
                    {hayMas && <div ref={fin} aria-hidden style={{ height: 1 }} />}
                </div>
            )}

            <RegistrarMovimiento abierto={!!anotar} tipo={anotar ?? 'gasto'} editar={editar} conPlataMia
                onCerrar={cerrarAnotar} onGuardado={guardado} />

            <DetalleMovimiento movimiento={abierto} onCerrar={() => setAbierto(null)}
                onEditar={abrirEdicion} onBorrado={() => { setAbierto(null); mutate() }} onVerPadre={verPadre} />
        </div>
    )
}

/* ── Lo que dice cada fila ────────────────────────────────────
   El libro de plata guarda el monto y la cuenta; el nombre de lo
   vendido, la categoría del gasto o si el turno ya se cerró están
   en otras tablas. Se piden solo para las filas que se ven, y lo ya
   pedido no se vuelve a pedir. */
function useDetalles(filas: Fila[]) {
    const [items, setItems] = useState(() => new Map<string, string>())
    const [gastos, setGastos] = useState(() => new Map<string, { category: string; description: string | null }>())
    const [turnos, setTurnos] = useState(() => new Map<string, string>())
    const pedidos = useRef(new Set<string>())
    const [version, setVersion] = useState(0)

    useEffect(() => {
        const nuevos = (ids: (string | null)[]) => [...new Set(ids.filter((x): x is string => !!x && !pedidos.current.has(x)))]
        const ventas = nuevos(filas.filter(f => f.type === 'sale' || f.type === 'sale_refund').map(f => f.reference_id))
        const compras = nuevos(filas.filter(f => f.type === 'purchase').map(f => f.reference_id))
        const deGastos = nuevos(filas.filter(f => f.type === 'expense').map(f => f.reference_id))
        const deTurnos = nuevos(filas.filter(f => ['expense', 'owner_in', 'owner_out'].includes(f.type)).map(f => f.cash_session_id))
        const todos = [...ventas, ...compras, ...deGastos, ...deTurnos]
        if (!todos.length) return
        todos.forEach(id => pedidos.current.add(id))

        const agrupar = (filasDb: (ItemDb & { ref: string })[]) => {
            const porRef = new Map<string, ItemDb[]>()
            for (const f of filasDb) porRef.set(f.ref, [...(porRef.get(f.ref) ?? []), f])
            return porRef
        }
        const tareas: Promise<unknown>[] = []
        if (ventas.length) tareas.push(Promise.resolve(supabase.from('sale_items')
            .select('sale_id, quantity, products(name), product_variants(name), combos(name)').in('sale_id', ventas)
            .then(({ data }) => {
                const porVenta = agrupar(((data ?? []) as unknown as (ItemDb & { sale_id: string })[]).map(i => ({ ...i, ref: i.sale_id })))
                setItems(m => { const n = new Map(m); porVenta.forEach((v, k) => n.set(k, textoItems(v))); return n })
            })))
        if (compras.length) tareas.push(Promise.resolve(supabase.from('purchase_items')
            .select('purchase_id, quantity, products(name), product_variants(name)').in('purchase_id', compras)
            .then(({ data }) => {
                const porCompra = agrupar(((data ?? []) as unknown as (ItemDb & { purchase_id: string })[]).map(i => ({ ...i, ref: i.purchase_id })))
                setItems(m => { const n = new Map(m); porCompra.forEach((v, k) => n.set(k, textoItems(v))); return n })
            })))
        if (deGastos.length) tareas.push(Promise.resolve(supabase.from('expenses')
            .select('id, category, description').in('id', deGastos)
            .then(({ data }) => setGastos(m => {
                const n = new Map(m)
                for (const g of (data ?? []) as { id: string; category: string; description: string | null }[]) n.set(g.id, g)
                return n
            }))))
        if (deTurnos.length) tareas.push(Promise.resolve(supabase.from('cash_sessions')
            .select('id, status').in('id', deTurnos)
            .then(({ data }) => setTurnos(m => {
                const n = new Map(m)
                for (const t of (data ?? []) as { id: string; status: string }[]) n.set(t.id, t.status)
                return n
            }))))
        // Si algo falla, se puede volver a pedir
        Promise.all(tareas).catch(() => { todos.forEach(id => pedidos.current.delete(id)) })
    }, [filas, version])

    // Un gasto corregido cambia su categoría: se vuelve a pedir
    const olvidar = useCallback((ids: string[]) => { ids.forEach(id => pedidos.current.delete(id)); setVersion(v => v + 1) }, [])

    return useMemo(() => ({ items, gastos, turnos, olvidar }), [items, gastos, turnos, olvidar])
}
