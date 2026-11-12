'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronLeft, Tag } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { Thumb } from '@/components/ui/Thumb'
import { InventoryRow, ROW_CSS, colorDeEstado } from '@/components/inventory/InventoryRow'
import { guardarPedido, type PedidoLinea } from '@/lib/inventory/pedido'
import type { EstadoStock } from '@/lib/inventory/calculos'

/* ══════════════════════════════════════════════════════════════
   Detalle de inventario, como el prototipo (diseno/inventario).
   Arriba lo que hay, grande y con el color de la regla única; una
   línea que dice qué pasa; las filas Te dura, Vendiste en 30 días,
   Tu mínimo, Te cuesta, Lo vendes en y Plata en este producto; y
   "Comprar N" y "Ajustar". Debajo, las existencias de cada
   presentación y lo que se movió. Ningún número se calcula aquí: todo llega listo del hook.
   ══════════════════════════════════════════════════════════════ */

export interface StockPresentation {
    id: string
    name: string
    stock: number
    estado: EstadoStock
    href: string
}

export interface StockMovement {
    id: string
    label: string
    quantity: number
    date: string
    /** Quién lo movió */
    author?: string | null
}

export interface StockDetailProps {
    name: string
    parent?: { name: string; href: string } | null
    reference?: string | null
    image?: string | null
    stock: number
    estado: EstadoStock
    /** "Se acabó · compra 20", "Quedan pocas · compra 6", "Bien de existencias"... */
    linea: string
    /** "unos 12 días", "Ya se acabó" o "Sin ventas en 30 días" */
    teDura: string
    /** Lo que se vendió en los últimos 30 días */
    sold30d: number
    /** El mínimo, solo en lo que se cuenta solo (no en un producto con presentaciones) */
    minimo?: {
        valor: number
        /** El que puso el dueño, si lo hay */
        manual: number | null
        respaldo: number
        onGuardar: (value: number | null) => Promise<void>
    }
    cost: number
    /** Lo vendes en: no va en un producto con presentaciones (cada una tiene el suyo) */
    price?: number | null
    /** Plata en este producto, a costo */
    plata: number
    /** Cuántas sugiere comprar (lo mismo que Compra sugerida) y lo que se lleva */
    comprar: number
    pedido: PedidoLinea[]
    /** Nueva compra con este producto, cuando no hace falta comprar */
    buyHref: string
    presentations?: StockPresentation[]
    movements: StockMovement[]
    backHref: string
    catalogHref: string
    /** Sin esto no hay "Ajustar": un producto con presentaciones se ajusta en cada una */
    onAdjust?: () => void
    extra?: ReactNode
}

const CSS = PANEL_CSS + ROW_CSS + `
.sd-wrap { position: relative; max-width: 560px; margin: 0 auto; padding: 20px 16px 48px; }
@media (min-width: 768px) { .sd-wrap { padding: 32px 40px 56px; } }
/* PC ancho: lo del producto a la izquierda, lo que se movió a la derecha */
@media (min-width: 1100px) {
    .sd-wrap { max-width: 1040px; }
    .sd-cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: start; }
    .sd-der .sd-grupo:first-child { margin-top: 64px; }
}
.sd-entra { animation: sd-entra 380ms cubic-bezier(0.23, 1, 0.32, 1) both; }
@keyframes sd-entra { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

.sd-volver { width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 7%, transparent); color: var(--toul-text-muted);
    -webkit-tap-highlight-color: transparent; transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.sd-volver:active { transform: scale(0.92); }
.sd-volver:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; }

.sd-titulo { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--toul-text); margin: 0; text-wrap: balance; }
.sd-papa { display: inline-flex; align-items: center; gap: 3px; font-size: 12.5px; color: var(--toul-text-subtle); text-decoration: none; }
.sd-ref { font-size: 12px; color: var(--toul-text-dim); margin: 2px 0 0; }

.sd-cifra { font-size: 44px; font-weight: 700; letter-spacing: -2px; line-height: 1; font-variant-numeric: tabular-nums; }
.sd-unidades { font-size: 15px; color: var(--toul-text-subtle); }
.sd-linea { font-size: 13px; margin: 6px 0 0; }

.sd-filas { margin-top: 16px; border-top: 1px solid var(--toul-divider); padding-top: 6px; }
.sd-fila { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 36px; padding: 4px 0;
    font-size: 14px; color: var(--toul-text-muted); }
.sd-fila b { color: var(--toul-text); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sd-valor { display: flex; align-items: center; gap: 10px; }
.sd-cambiar { border: none; background: none; padding: 6px 0 6px 4px; font: inherit; font-size: 13px; font-weight: 600;
    color: var(--toul-accent); cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.sd-cambiar:disabled { opacity: 0.4; cursor: default; }
.sd-cambiar:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 6px; }
.sd-min { width: 64px; height: 36px; border-radius: 10px; padding: 0 10px; font-family: inherit; text-align: center;
    background: var(--toul-surface); border: none; color: var(--toul-text); font-size: 16px; font-weight: 600; outline: none;
    transition: box-shadow 200ms ease; }
.sd-min:focus { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--toul-accent) 50%, transparent); }
.sd-ayuda { font-size: 12px; color: var(--toul-text-dim); margin: 0 0 4px; text-align: right; }

.sd-duo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px; }
.sd-duo.solo { grid-template-columns: 1fr; }
.sd-cta, .sd-cta2 { height: 50px; border-radius: 14px; border: none; cursor: pointer; font: inherit; font-size: 15px;
    display: flex; align-items: center; justify-content: center; text-decoration: none;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
.sd-cta { background: var(--toul-accent); color: var(--toul-bg); font-weight: 700; }
.sd-cta2 { background: var(--toul-surface); color: var(--toul-text); font-weight: 600; }
.sd-cta:active, .sd-cta2:active { transform: scale(0.97); }
.sd-cta:focus-visible, .sd-cta2:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 3px; }

.sd-grupo { font-size: 13px; color: var(--toul-text-subtle); margin: 28px 0 4px; }
.sd-mov { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0;
    border-bottom: 1px solid var(--toul-divider); }
.sd-mov:last-child { border-bottom: none; }
.sd-mov-nombre { display: block; font-size: 14px; font-weight: 500; color: var(--toul-text); }
.sd-mov-fecha { display: block; font-size: 12px; color: var(--toul-text-dim); margin-top: 1px; }
.sd-mov-num { font-size: 15px; font-weight: 700; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.sd-vacio { font-size: 13.5px; color: var(--toul-text-dim); margin: 0; padding: 14px 0; }

@media (prefers-reduced-motion: reduce) {
    .sd-entra { animation: none; }
    .sd-volver, .sd-cta, .sd-cta2, .sd-min { transition: none; }
}
`

const colorDeLinea = (estado: EstadoStock) =>
    estado === 'bien' ? 'var(--toul-text-subtle)' : colorDeEstado(estado)

export function StockDetail(props: StockDetailProps) {
    const {
        name, parent, reference, image, stock, estado, linea, teDura, sold30d, minimo, cost, price, plata,
        comprar, pedido, buyHref, presentations, movements, backHref, catalogHref, onAdjust, extra,
    } = props
    const router = useRouter()
    const irAComprar = useCallback(() => router.push(guardarPedido(pedido)), [router, pedido])
    const unidades = Math.round(stock)

    return (
        <div className="sd-wrap">
            <style>{CSS}</style>
            <div className="toul-ambient" />

            <div className="sd-cols" style={{ position: 'relative' }}>
                <div className="sd-entra">
                    <Link href={backHref} aria-label="Volver" className="sd-volver">
                        <ArrowLeft size={17} />
                    </Link>

                    {/* ── Qué es ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
                        <Thumb src={image} name={parent?.name ?? name} size={48} radius={14} />
                        <div style={{ minWidth: 0 }}>
                            {parent && (
                                <Link href={parent.href} className="sd-papa"><ChevronLeft size={12} /> {parent.name}</Link>
                            )}
                            <h1 className="sd-titulo">{name}</h1>
                            {reference && <p className="sd-ref">Ref. {reference}</p>}
                        </div>
                    </div>

                    {/* ── Cuánto hay: el número habla con su color ── */}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 22 }}>
                        <span className="sd-cifra" style={{ color: colorDeEstado(estado) }}>{unidades}</span>
                        <span className="sd-unidades">{unidades === 1 ? 'unidad' : 'unidades'}</span>
                    </div>
                    {linea && <p className="sd-linea" style={{ color: colorDeLinea(estado) }}>{linea}</p>}

                    {/* ── Las filas ── */}
                    <div className="sd-filas">
                        <div className="sd-fila"><span>Te dura</span><b>{teDura}</b></div>
                        <div className="sd-fila"><span>Vendiste en 30 días</span><b>{Math.round(sold30d)}</b></div>
                        {minimo && <FilaMinimo {...minimo} />}
                        <div className="sd-fila"><span>Te cuesta</span><b>{formatCOP(Math.round(cost))}</b></div>
                        {price !== undefined && (
                            <div className="sd-fila"><span>Lo vendes en</span><b>{formatCOP(Math.round(price ?? 0))}</b></div>
                        )}
                        <div className="sd-fila"><span>Plata en este producto</span><b>{formatCOP(Math.round(plata))}</b></div>
                    </div>

                    {/* ── Comprar N y Ajustar ── */}
                    <div className={`sd-duo${onAdjust ? '' : ' solo'}`}>
                        {pedido.length > 0
                            ? <button type="button" className="sd-cta" onClick={irAComprar}>Comprar {Math.round(comprar)}</button>
                            : <Link href={buyHref} className="sd-cta">Comprar</Link>}
                        {onAdjust && <button type="button" className="sd-cta2" onClick={onAdjust}>Ajustar</button>}
                    </div>

                    {/* ── Presentaciones, cada una con su color ── */}
                    {presentations && presentations.length > 0 && (
                        <section>
                            <p className="sd-grupo">Existencias por presentación</p>
                            {presentations.map(item => (
                                <InventoryRow key={item.id} href={item.href} name={item.name}
                                    stock={item.stock} estado={item.estado} hijo />
                            ))}
                        </section>
                    )}

                    {extra}
                </div>

                {/* ── Qué se movió ── */}
                <section className="sd-der sd-entra">
                    <p className="sd-grupo">Movimientos</p>
                    {movements.length === 0 ? (
                        <p className="sd-vacio">Todavía no se ha movido nada.</p>
                    ) : movements.map(movement => (
                        <div key={movement.id} className="sd-mov">
                            <span style={{ minWidth: 0 }}>
                                <span className="sd-mov-nombre">{movement.label}</span>
                                <span className="sd-mov-fecha">{movement.date}{movement.author ? ` · ${movement.author}` : ''}</span>
                            </span>
                            <span className="sd-mov-num" style={{ color: movement.quantity >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                {movement.quantity >= 0 ? '+' : '−'}{Math.abs(Math.round(movement.quantity))}
                            </span>
                        </div>
                    ))}
                </section>
            </div>

            <div style={{ marginTop: 24, position: 'relative' }}>
                <Link href={catalogHref} className="pnl-link">
                    <Tag size={13} /> Ver precio y margen en el catálogo
                </Link>
            </div>
        </div>
    )
}

/* ── Tu mínimo: se cambia aquí mismo ──────────────────────── */

function FilaMinimo({ valor, manual, respaldo, onGuardar }: NonNullable<StockDetailProps['minimo']>) {
    const [editando, setEditando] = useState(false)
    const [borrador, setBorrador] = useState(String(valor))
    const [guardando, setGuardando] = useState(false)

    async function guardar(value: number | null) {
        setGuardando(true)
        await onGuardar(value)
        setGuardando(false)
        setEditando(false)
    }

    return (
        <>
            <div className="sd-fila">
                <span>Tu mínimo</span>
                {editando ? (
                    <span className="sd-valor">
                        {/* Entra con el número actual escogido: escribir lo reemplaza. Vacío = automático */}
                        <input className="sd-min" type="text" inputMode="numeric" autoFocus value={borrador}
                            aria-label="Tu mínimo"
                            onFocus={event => event.target.select()}
                            onChange={event => setBorrador(event.target.value.replace(/[^0-9]/g, ''))}
                            onKeyDown={event => { if (event.key === 'Enter') guardar(borrador === '' ? null : Number(borrador)) }} />
                        {manual !== null && (
                            <button type="button" className="sd-cambiar" disabled={guardando} onClick={() => guardar(null)}>Automático</button>
                        )}
                        <button type="button" className="sd-cambiar" disabled={guardando}
                            onClick={() => guardar(borrador === '' ? null : Number(borrador))}>
                            Listo
                        </button>
                    </span>
                ) : (
                    <span className="sd-valor">
                        <b>{Math.round(valor)}</b>
                        <button type="button" className="sd-cambiar" onClick={() => { setBorrador(String(valor)); setEditando(true) }}>
                            Cambiar
                        </button>
                    </span>
                )}
            </div>
            {editando && (
                <p className="sd-ayuda">
                    {manual === null
                        ? `Calculado por lo que vendes, para ${respaldo} días de respaldo`
                        : 'Lo fijaste tú'}
                </p>
            )}
        </>
    )
}

/** Esqueleto con la misma forma que la pantalla real. */
export function StockDetailSkeleton() {
    return (
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 48px' }}>
            <div className="skeleton" style={{ height: 36, width: 36, borderRadius: 12 }} />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 18 }}>
                <div className="skeleton" style={{ height: 48, width: 48, borderRadius: 14 }} />
                <div className="skeleton" style={{ height: 22, width: 160, borderRadius: 8 }} />
            </div>
            <div className="skeleton" style={{ height: 44, width: 110, borderRadius: 10, marginTop: 22 }} />
            <div className="skeleton" style={{ height: 14, width: 170, borderRadius: 6, marginTop: 10 }} />
            <div className="skeleton" style={{ height: 210, borderRadius: 14, marginTop: 18 }} />
            <div className="skeleton" style={{ height: 50, borderRadius: 14, marginTop: 18 }} />
        </div>
    )
}
