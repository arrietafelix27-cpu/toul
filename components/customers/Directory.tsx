'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Plus, Search, Users, Wrench, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { capitalizeFirst } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import { Sheet } from '@/components/isla/Sheet'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { explainError } from '@/lib/errors'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Mis clientes.

   No es una libreta de nombres y teléfonos: es con quién estás
   haciendo negocio. Cada fila dice cuánto te ha comprado, cuántas
   veces y hace cuánto — que es lo que de verdad define a un
   cliente. La deuda es un dato más, no el protagonista; eso vive
   en Cuentas por cobrar.

   Las etiquetas las pone el sistema, nunca una interpretación:
     recurrente  te ha comprado 3 veces o más y sigue viniendo
     inactivo    llevaba comprando y lleva más de 60 días sin volver
     nuevo       entró hace menos de 30 días
   ══════════════════════════════════════════════════════════════ */

const DIAS_INACTIVO = 60

interface Cliente {
    id: string
    nombre: string
    telefono: string | null
    nota: string | null
    compras: number
    gastado: number
    ticket: number
    ultima: string | null
    dias: number | null
    saldo: number
    guardado: number
    etiqueta: 'recurrente' | 'inactivo' | 'nuevo' | 'sincompras' | ''
}

interface Vista {
    clientes: Cliente[]
    total: number
    compraronMes: number
    recurrentes: number
    inactivos: number
    nuevos: number
    inactivoDias: number
}

type Filtro = 'todos' | 'recurrente' | 'inactivo' | 'nuevo' | 'saldo'

const ETIQUETA: Record<string, { texto: string; color: string; fondo: string }> = {
    recurrente: { texto: 'Recurrente', color: 'var(--toul-accent)', fondo: 'var(--toul-accent-dim)' },
    inactivo: { texto: 'Inactivo', color: 'var(--toul-warning)', fondo: 'var(--toul-warning-dim)' },
    nuevo: { texto: 'Nuevo', color: 'var(--toul-text-muted)', fondo: 'rgba(255,255,255,0.06)' },
}

const CSS = `
.dir-wrap { container-type: inline-size; }

/* En el celular el nombre se cortaba para dejarle sitio a la deuda.
   La deuda baja a la segunda línea y el gasto total se guarda para
   la ficha, donde hay espacio de sobra. */
.dir-debe-sm { display: none; }
@container (max-width: 430px) {
    .dir-debe-sm { display: inline; color: var(--toul-text-muted); font-weight: 600; }
    .dir-debe-lg, .dir-gastado { display: none !important; }
}

.dir-chips { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px;
    scrollbar-width: none; }
.dir-chips::-webkit-scrollbar { display: none; }

.dir-chip { height: 34px; padding: 0 13px; border-radius: 999px; cursor: pointer;
    font-family: inherit; font-size: 13px; white-space: nowrap; flex-shrink: 0;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--toul-surface); border: 1px solid var(--toul-border);
    color: var(--toul-text-muted); font-weight: 500;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1),
                color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 140ms cubic-bezier(0.23,1,0.32,1); }
.dir-chip[data-on="true"] { background: var(--toul-surface-focused);
    border-color: var(--toul-border-focused); color: var(--toul-accent); font-weight: 600; }
.dir-chip:active { transform: scale(0.97); }

.dir-fila { display: flex; align-items: center; gap: 12px; padding: 11px 10px;
    border-radius: 14px; text-decoration: none;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.dir-fila:active { transform: scale(0.99); }

.dir-ini { width: 40px; height: 40px; border-radius: 14px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 14.5px; font-weight: 600; letter-spacing: -0.02em;
    background: var(--toul-surface-2); color: var(--toul-text-muted); }

.dir-tag { display: inline-flex; align-items: center; flex-shrink: 0;
    height: 21px; padding: 0 8px; border-radius: 7px;
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; }

@media (hover: hover) and (pointer: fine) {
    .dir-chip:hover { border-color: rgba(255,255,255,0.18); color: var(--toul-text); }
    .dir-chip[data-on="true"]:hover { color: var(--toul-accent); }
    .dir-fila:hover { background: rgba(255,255,255,0.04); }
}
@media (prefers-reduced-motion: reduce) {
    .dir-chip:active, .dir-fila:active { transform: none; }
}
`

export function Directory() {
    const { data, isLoading, error, mutate } = useSWR<Vista>(['clientes', DIAS_INACTIVO], async () => {
        const { data, error } = await supabase.rpc('toul_customers_overview', { p_inactive_days: DIAS_INACTIVO })
        if (error) throw error
        return data as Vista
    }, { revalidateOnFocus: true })

    const [busca, setBusca] = useState('')
    const [filtro, setFiltro] = useState<Filtro>('todos')
    const [nuevo, setNuevo] = useState(false)
    const [form, setForm] = useState({ name: '', phone: '' })
    const [creando, setCreando] = useState(false)
    const [dupOpen, setDupOpen] = useState(false)
    const [uniendo, setUniendo] = useState<string | null>(null)
    const [cuadrando, setCuadrando] = useState(false)

    const clientes = data?.clientes ?? []

    // Antes, escribir el nombre en la caja creaba un cliente nuevo cada
    // vez. Esto encuentra los que quedaron partidos en varios registros.
    const repetidos = useMemo(() => {
        const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ')
        const tel = (t: string | null) => (t ?? '').replace(/\D/g, '')
        const mismaPersona = (a: Cliente, b: Cliente) => {
            const na = norm(a.nombre), nb = norm(b.nombre)
            if (na === nb) return true
            const ta = tel(a.telefono), tb = tel(b.telefono)
            if (ta && ta === tb) return true
            const corto = na.length <= nb.length ? na : nb
            const largo = na.length <= nb.length ? nb : na
            return corto.length >= 3 && largo.startsWith(corto + ' ')
        }
        const grupos: Cliente[][] = []
        const usados = new Set<string>()
        for (const base of clientes) {
            if (usados.has(base.id)) continue
            const grupo = clientes.filter(o => !usados.has(o.id) && (o.id === base.id || mismaPersona(base, o)))
            grupo.forEach(c => usados.add(c.id))
            if (grupo.length > 1) grupos.push(grupo)
        }
        return grupos
    }, [clientes])

    // La deuda guardada en la ficha puede quedar desfasada de lo que
    // dicen los movimientos. El botón de arreglarla solo aparece
    // cuando de verdad hay algo que arreglar.
    const descuadradas = useMemo(
        () => clientes.filter(c => Math.round(Number(c.guardado)) !== Math.round(Number(c.saldo))).length,
        [clientes])

    const lista = useMemo(() => clientes.filter(c => {
        if (busca && !c.nombre.toLowerCase().includes(busca.toLowerCase())
            && !(c.telefono ?? '').includes(busca)) return false
        switch (filtro) {
            case 'recurrente': return c.etiqueta === 'recurrente'
            case 'inactivo': return c.etiqueta === 'inactivo'
            case 'nuevo': return c.etiqueta === 'nuevo'
            case 'saldo': return Number(c.saldo) > 0
            default: return true
        }
    }), [clientes, busca, filtro])

    async function crear() {
        if (!form.name.trim()) { toast.error('Escribe el nombre'); return }
        setCreando(true)
        const { data: store } = await supabase.from('stores').select('id').limit(1).single()
        const { error } = await supabase.from('customers').insert({
            store_id: store?.id, name: form.name.trim(), phone: form.phone.trim() || null,
        })
        setCreando(false)
        if (error) { toast.error(explainError(error, 'No se pudo crear el cliente.')); return }
        setNuevo(false); setForm({ name: '', phone: '' })
        await mutate()
        toast.success('Cliente creado')
    }

    async function unir(grupo: Cliente[]) {
        const ordenado = [...grupo].sort((a, b) => b.nombre.trim().length - a.nombre.trim().length)
        const [quedarse, ...resto] = ordenado
        setUniendo(quedarse.id)
        for (const otro of resto) {
            const { error } = await supabase.rpc('toul_merge_customers', { p_keep: quedarse.id, p_merge: otro.id })
            if (error) { toast.error(explainError(error, 'No se pudieron unir.')); setUniendo(null); return }
        }
        setUniendo(null)
        await mutate()
        toast.success(`${quedarse.nombre} quedó en un solo registro`)
    }

    async function cuadrar() {
        setCuadrando(true)
        const { data: res, error } = await supabase.rpc('toul_recalc_customer_debt', { p_customer_id: null })
        setCuadrando(false)
        if (error) { toast.error(explainError(error)); return }
        await mutate()
        const fixed = Number(res?.fixed ?? 0)
        toast.success(fixed === 0 ? 'Todas las deudas ya cuadraban'
            : `${fixed} ${fixed === 1 ? 'deuda quedó al día' : 'deudas quedaron al día'}`)
    }

    const chips: { key: Filtro; label: string; n?: number }[] = [
        { key: 'todos', label: 'Todos' },
        { key: 'recurrente', label: 'Recurrentes', n: data?.recurrentes },
        { key: 'inactivo', label: 'Inactivos', n: data?.inactivos },
        { key: 'nuevo', label: 'Nuevos', n: data?.nuevos },
        { key: 'saldo', label: 'Con saldo' },
    ]

    return (
        <>
            <style>{PANEL_CSS}{CSS}</style>

            {error && (
                <Aviso onClick={() => mutate()}
                    titulo="No se pudo leer tu lista de clientes"
                    detalle="Toca para volver a intentarlo." />
            )}

            {/* ── Quiénes son ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '2px 2px 14px' }}>
                <div>
                    {isLoading ? <Skeleton height="1.6rem" width="140px" className="rounded-lg" /> : (
                        <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', margin: 0 }}>
                            {data?.total ?? 0} {(data?.total ?? 0) === 1 ? 'cliente' : 'clientes'}
                        </p>
                    )}
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '2px 0 0' }}>
                        {data?.compraronMes ?? 0} te compraron este mes
                    </p>
                </div>
                <button onClick={() => setNuevo(v => !v)} className="dir-chip" data-on={nuevo}
                    style={{ height: 36 }}>
                    {nuevo ? <X size={14} /> : <Plus size={14} />} {nuevo ? 'Cancelar' : 'Nuevo'}
                </button>
            </motion.div>

            <AnimatePresence>
                {nuevo && (
                    <motion.div
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 14 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                        className="toul-card" style={{ overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <input className="toul-input" autoCapitalize="sentences" placeholder="Nombre del cliente"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: capitalizeFirst(e.target.value) }))} />
                            <input className="toul-input" inputMode="numeric" placeholder="WhatsApp (opcional)"
                                value={form.phone}
                                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                            <button onClick={crear} disabled={creando} className="toul-btn-primary">
                                {creando ? 'Creando…' : 'Crear cliente'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Avisos, solo cuando hay algo que resolver ── */}
            {repetidos.length > 0 && (
                <Aviso onClick={() => setDupOpen(true)}
                    titulo={`${repetidos.length} ${repetidos.length === 1 ? 'cliente está repetido' : 'clientes están repetidos'}`}
                    detalle="Su deuda y sus compras quedaron partidas. Toca para unirlos." />
            )}
            {descuadradas > 0 && (
                <Aviso onClick={cuadrar} busy={cuadrando}
                    icono={<Wrench size={17} style={{ color: 'var(--toul-warning)', flexShrink: 0 }} />}
                    titulo={`${descuadradas} ${descuadradas === 1 ? 'ficha no cuadra' : 'fichas no cuadran'} con sus movimientos`}
                    detalle={cuadrando ? 'Cuadrando…' : 'Toca para dejarlas iguales a lo que de verdad pasó.'} />
            )}

            {/* ── Filtros ── */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="dir-chips" style={{ marginBottom: 12 }}>
                {chips.map(c => (
                    <button key={c.key} className="dir-chip" data-on={filtro === c.key}
                        onClick={() => setFiltro(c.key)}>
                        {c.label}
                        {c.n != null && c.n > 0 && (
                            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.65, fontVariantNumeric: 'tabular-nums' }}>
                                {c.n}
                            </span>
                        )}
                    </button>
                ))}
            </motion.div>

            <motion.div variants={fadeUp} initial="hidden" animate="visible"
                style={{ position: 'relative', marginBottom: 10 }}>
                <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                <input className="toul-input" style={{ paddingLeft: 42 }} placeholder="Buscar por nombre o teléfono…"
                    value={busca} onChange={e => setBusca(e.target.value)} />
            </motion.div>

            {/* ── La lista ── */}
            {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[1, 2, 3, 4, 5].map(n => <Skeleton key={n} height="62px" className="rounded-2xl" />)}
                </div>
            ) : lista.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                    <Users size={30} style={{ color: 'var(--toul-border-2)', margin: '0 auto 8px' }} />
                    <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                        {busca ? 'Nadie con ese nombre' : vacio(filtro).titulo}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                        {busca ? 'Prueba con el teléfono o con otra parte del nombre.' : vacio(filtro).detalle}
                    </p>
                </div>
            ) : (
                <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                    className="dir-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {lista.map(c => {
                        const tag = ETIQUETA[c.etiqueta]
                        return (
                            <motion.div key={c.id} variants={staggerItem}>
                                <Link href={`/customers/${c.id}`} className="dir-fila">
                                    <span className="dir-ini">{c.nombre[0]?.toUpperCase()}</span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                            <span style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {c.nombre}
                                            </span>
                                            {tag && (
                                                <span className="dir-tag" style={{ color: tag.color, background: tag.fondo }}>
                                                    {tag.texto}
                                                </span>
                                            )}
                                        </span>
                                        <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {Number(c.saldo) > 0 && (
                                                <span className="dir-debe-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                                    Debe {formatCOP(Number(c.saldo))} ·{' '}
                                                </span>
                                            )}
                                            {resumen(c)}
                                        </span>
                                    </span>
                                    {Number(c.saldo) > 0 && (
                                        <span className="dir-debe-lg" style={{ fontSize: 12, fontWeight: 600, flexShrink: 0, color: 'var(--toul-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                            Debe {formatCOP(Number(c.saldo))}
                                        </span>
                                    )}
                                </Link>
                            </motion.div>
                        )
                    })}
                </motion.div>
            )}

            {/* ── Unir repetidos ── */}
            <Sheet open={dupOpen} onClose={() => setDupOpen(false)}
                title="Clientes repetidos"
                subtitle="Al unirlos, sus compras y su deuda quedan en un solo registro.">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                    {repetidos.length === 0 ? (
                        <p style={{ fontSize: 13.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '20px 10px', margin: 0 }}>
                            Ya no hay clientes repetidos.
                        </p>
                    ) : repetidos.map(grupo => {
                        const principal = [...grupo].sort((a, b) => b.nombre.trim().length - a.nombre.trim().length)[0]
                        return (
                            <div key={grupo[0].id} className="toul-card" style={{ padding: '12px 14px' }}>
                                <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{principal.nombre}</p>
                                <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '2px 0 4px' }}>
                                    {grupo.map(c => c.nombre).join(' · ')}
                                </p>
                                <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '0 0 10px' }}>
                                    {grupo.length} registros · {formatCOP(grupo.reduce((s, c) => s + Number(c.saldo), 0))} de saldo
                                </p>
                                <button onClick={() => unir(grupo)} disabled={uniendo === principal.id}
                                    style={{
                                        height: 38, padding: '0 14px', borderRadius: 11, border: 'none', cursor: 'pointer',
                                        fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
                                        background: 'var(--toul-accent)', color: '#000',
                                    }}>
                                    {uniendo === principal.id ? 'Uniendo…' : 'Unir en uno solo'}
                                </button>
                            </div>
                        )
                    })}
                </div>
            </Sheet>
        </>
    )
}

/** La línea que define al cliente: cuánto, cuántas veces, hace cuánto */
function resumen(c: Cliente) {
    if (c.compras === 0) return 'Todavía no te ha comprado'
    const cuando = c.dias == null ? null
        : c.dias === 0 ? 'hoy' : c.dias === 1 ? 'ayer' : `hace ${c.dias} días`
    return (
        <>
            {c.compras} {c.compras === 1 ? 'compra' : 'compras'}
            <span className="dir-gastado"> · {formatCOP(Number(c.gastado))}</span>
            {cuando && <> · {cuando}</>}
        </>
    )
}

function vacio(f: Filtro) {
    switch (f) {
        case 'recurrente': return { titulo: 'Todavía no tienes clientes recurrentes', detalle: 'Un cliente entra aquí cuando te compra por tercera vez.' }
        case 'inactivo': return { titulo: 'Ningún cliente está inactivo', detalle: `Todos los que te compran han vuelto en los últimos ${DIAS_INACTIVO} días.` }
        case 'nuevo': return { titulo: 'No hay clientes nuevos', detalle: 'Aquí aparecen los que entraron en los últimos 30 días.' }
        case 'saldo': return { titulo: 'Nadie tiene saldo pendiente', detalle: 'Tu cartera está en cero. Así se trabaja.' }
        default: return { titulo: 'Todavía no tienes clientes', detalle: 'Se agregan solos cuando vendes a crédito, o los creas con el botón de arriba.' }
    }
}

function Aviso({ titulo, detalle, onClick, busy, icono }: {
    titulo: string; detalle: string; onClick: () => void; busy?: boolean; icono?: React.ReactNode
}) {
    return (
        <motion.button variants={fadeUp} initial="hidden" animate="visible"
            onClick={onClick} disabled={busy}
            style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12,
                padding: '12px 14px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                background: 'var(--toul-warning-dim)', border: '1px solid rgba(255,214,10,0.25)',
            }}>
            {icono ?? <AlertTriangle size={17} style={{ color: 'var(--toul-warning)', flexShrink: 0 }} />}
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--toul-text)' }}>{titulo}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)', lineHeight: 1.45 }}>{detalle}</span>
            </span>
        </motion.button>
    )
}
