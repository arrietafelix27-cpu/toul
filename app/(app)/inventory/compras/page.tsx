'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Package, Search } from 'lucide-react'
import { formatCOP } from '@/lib/utils'
import { useStore } from '@/lib/hooks/useData'
import { Skeleton } from '@/components/ui/Skeleton'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { PurchaseDetail } from '@/components/inventory/PurchaseDetail'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'
import { estaVencida, fechaCompra, useCompras } from '@/lib/inventory/useCompras'
import { unidadesDeCompra, type FiltroCompras } from '@/lib/inventory/calculos'
import { SelectorPeriodo } from '@/components/dashboard/Desplegable'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { SinInternet } from '@/components/inventory/SinInternet'

/* ══════════════════════════════════════════════════════════════
   Historial de compras.

   Antes esta pantalla solo servía para corregir el proveedor.
   Ahora responde lo que de verdad se pregunta uno: cuánto llevo
   gastado, qué entró en cada compra, a qué costo, y a quién le
   debo todavía.

   El gasto y el número de compras son del período que estés
   viendo. Lo que le debes a proveedores no: eso es de hoy, sin
   importar cuándo compraste.
   ══════════════════════════════════════════════════════════════ */

const FILTROS: { key: FiltroCompras; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'contado', label: 'De contado' },
    { key: 'credito', label: 'A crédito' },
    { key: 'debiendo', label: 'Sin pagar' },
]

const CSS = PANEL_CSS + `
.hc-page, .hc-wrap { container-type: inline-size; }

/* En el celular la línea no alcanza para todo y se perdía justo lo
   que importa: que esa compra sigue sin pagarse. Las unidades se
   guardan para el detalle y la deuda se baja a su propia línea. */
@container (max-width: 430px) {
    .hc-und, .hc-larga { display: none; }
    .hc-debe { display: block; }
}

.hc-chips { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
.hc-chips::-webkit-scrollbar { display: none; }

.hc-chip { height: 34px; padding: 0 13px; border-radius: 999px; cursor: pointer; flex-shrink: 0;
    font-family: inherit; font-size: 13px; white-space: nowrap; font-weight: 500;
    background: var(--toul-surface); border: 1px solid var(--toul-border); color: var(--toul-text-muted);
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                border-color 160ms cubic-bezier(0.23,1,0.32,1),
                color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 140ms cubic-bezier(0.23,1,0.32,1); }
.hc-chip[data-on="true"] { background: var(--toul-surface-focused);
    border-color: var(--toul-border-focused); color: var(--toul-accent); font-weight: 600; }
.hc-chip:active { transform: scale(0.97); }

.hc-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 10px;
    border-radius: 14px; border: none; background: none; font-family: inherit; text-align: left;
    cursor: pointer; color: inherit;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.hc-fila:active { transform: scale(0.99); }

/* PC: tabla. En una sola fila de lado a lado el proveedor quedaba a
   un extremo y el total al otro; con columnas se lee de un vistazo */
.hc-pc, .hc-cabeza { display: none; }
@media (min-width: 1024px) {
    .hc-page { max-width: 980px !important; }
    .hc-movil { display: none !important; }
    .hc-pc { display: grid; }
    .hc-cabeza { display: grid; padding: 0 10px 8px; border-bottom: 1px solid var(--toul-divider); margin-bottom: 4px;
        font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--toul-text-faint); }
    .hc-pc, .hc-cabeza { grid-template-columns: 96px minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) 130px; gap: 16px; align-items: center; }
    .hc-pc > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hc-num { text-align: right; font-variant-numeric: tabular-nums; }
}

@media (hover: hover) and (pointer: fine) {
    .hc-chip:hover { border-color: rgba(255,255,255,0.18); color: var(--toul-text); }
    .hc-chip[data-on="true"]:hover { color: var(--toul-accent); }
    .hc-fila:hover { background: rgba(255,255,255,0.04); }
}
@media (prefers-reduced-motion: reduce) {
    .hc-chip:active, .hc-fila:active { transform: none; }
}
`

export default function ComprasPage() {
    const { data: store } = useStore()
    const storeId = store?.id || null

    const {
        periodo, verPeriodo, rango, setRango, sinDatos, reintentar, filtro, verFiltro, busca, setBusca,
        resumen, compras, lista, deudas, isLoading, isValidating,
        hayMas, sentinela, abierta, abriendo, abrir, cerrar, alCambiar,
    } = useCompras(storeId)
    const esMovil = useIsMobile()

    return (
        <div className="px-4 md:px-8 py-6 pb-24" style={{ position: 'relative' }}>
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <div className="hc-page" style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <div className="flex items-center gap-3 mb-5">
                    <Link href="/inventory" aria-label="Volver"
                        style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" />
                    </Link>
                    <div>
                        <p className="pnl-label" style={{ marginBottom: 2 }}>Inventario</p>
                        <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                            Compras
                        </h1>
                    </div>
                </div>

                {/* Sin internet: ni "Comprado $0" ni una lista vacía que parezcan reales */}
                {sinDatos ? <SinInternet onRetry={reintentar} que="tus compras" /> : <>
                {/* ── Cuánto has comprado ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible"
                    style={{ borderRadius: 22, padding: '18px 20px', marginBottom: 14,
                        background: 'linear-gradient(180deg, var(--toul-surface) 0%, transparent 100%)',
                        border: '1px solid var(--toul-border)', borderBottomColor: 'transparent' }}>
                    <p className="pnl-label">Comprado</p>
                    <p style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.045em', lineHeight: 1.1,
                        margin: '6px 0 0', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }}>
                        {resumen ? formatCOP(Math.round(Number(resumen.gastado ?? 0))) : <span className="skeleton" aria-hidden="true" style={{ display: 'inline-block', width: 150, height: 36, borderRadius: 12, verticalAlign: 'middle' }} />}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '4px 0 0' }}>
                        {resumen ? <>
                            {resumen.compras ?? 0} {(resumen.compras ?? 0) === 1 ? 'compra' : 'compras'}
                            {Number(resumen.aCredito ?? 0) > 0 && <> · {formatCOP(Math.round(Number(resumen.aCredito)))} a crédito</>}
                        </> : <span className="skeleton" aria-hidden="true" style={{ display: 'inline-block', width: 110, height: 14, borderRadius: 6, verticalAlign: 'middle' }} />}
                    </p>

                    {Number(resumen?.porPagar ?? 0) > 0 && (
                        <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--toul-divider)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--toul-text-dim)' }}>
                                Le debes<span className="hc-larga"> a proveedores</span>
                                {Number(resumen?.vencidas ?? 0) > 0 && (
                                    <span style={{ color: 'var(--toul-error)', fontWeight: 600 }}>
                                        {' · '}{resumen!.vencidas} {resumen!.vencidas === 1 ? 'vencida' : 'vencidas'}
                                    </span>
                                )}
                            </span>
                            <Link href="/providers" style={{ fontSize: 14, fontWeight: 700, color: 'var(--toul-warning)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
                                {formatCOP(Number(resumen!.porPagar))}
                            </Link>
                        </div>
                    )}
                </motion.div>

                {/* ── El periodo: el mismo selector de Reportes, más "Todo" ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 10 }}>
                    <SelectorPeriodo variante={esMovil ? 'movil' : 'pc'} forma="boton" conAno conTodo lado="izquierda"
                        period={periodo} setPeriod={verPeriodo} rango={rango} setRango={setRango} />
                </motion.div>
                {/* ── Filtros ── */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="hc-chips" style={{ marginBottom: 10 }}>
                    {FILTROS.map(f => (
                        <button key={f.key} className="hc-chip" data-on={filtro === f.key}
                            onClick={() => verFiltro(f.key)}>{f.label}</button>
                    ))}
                </motion.div>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                    <input className="toul-input" style={{ paddingLeft: 42 }}
                        placeholder="Buscar proveedor o producto…"
                        value={busca} onChange={e => setBusca(e.target.value)} />
                </motion.div>

                {/* ── La lista ── */}
                {isLoading && !compras ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} height="64px" className="rounded-2xl" />)}
                    </div>
                ) : lista.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '44px 16px' }}>
                        <Package size={30} style={{ color: 'var(--toul-border-2)', margin: '0 auto 8px' }} />
                        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>
                            {busca ? 'Nada con ese nombre' : 'Sin compras en este período'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '3px 0 0' }}>
                            {busca ? 'Prueba con el proveedor o con otro producto.' : 'Cambia el período o registra una compra nueva.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="hc-cabeza" aria-hidden>
                            <span>Fecha</span><span>Proveedor</span><span>Productos</span><span>Pago</span><span className="hc-num">Total</span>
                        </div>
                        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
                            className="hc-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {lista.map(c => {
                                const unidades = unidadesDeCompra(c.purchase_items)
                                const refs = (c.purchase_items ?? []).length
                                const deuda = deudas?.get(c.id)
                                const vencida = deuda ? estaVencida(deuda.vence) : false
                                const anulada = c.status === 'voided'
                                // Anulada: se ve en el historial, pero su total no cuenta
                                const estiloTotal = anulada ? { color: 'var(--toul-text-dim)', textDecoration: 'line-through' } : { color: 'var(--toul-text)' }
                                return (
                                    <motion.div key={c.id} variants={staggerItem}>
                                        {/* PC: una fila de tabla */}
                                        <button className="hc-fila hc-pc" disabled={abriendo === c.id} onClick={() => abrir(c.id)}>
                                            <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>{fechaCompra(c.created_at)}</span>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: c.providers ? 'var(--toul-text)' : 'var(--toul-text-dim)' }}>
                                                {c.providers?.name ?? 'Sin proveedor'}
                                            </span>
                                            <span style={{ fontSize: 13, color: 'var(--toul-text-muted)' }}>
                                                {refs} {refs === 1 ? 'producto' : 'productos'} · {unidades} und
                                            </span>
                                            <span style={{ fontSize: 13, fontWeight: deuda || anulada ? 600 : 400,
                                                color: anulada ? 'var(--toul-error)' : deuda ? (vencida ? 'var(--toul-error)' : 'var(--toul-warning)') : 'var(--toul-text-dim)' }}>
                                                {anulada ? 'Anulada'
                                                    : deuda ? `Debes ${formatCOP(deuda.falta)}${vencida ? ' · vencida' : ''}`
                                                    : c.is_credit ? 'Crédito pagado' : 'De contado'}
                                            </span>
                                            <span className="hc-num" style={{ fontSize: 14.5, fontWeight: 700, ...estiloTotal }}>
                                                {abriendo === c.id ? '…' : formatCOP(Number(c.total))}
                                            </span>
                                        </button>
                                        <button className="hc-fila hc-movil" disabled={abriendo === c.id} onClick={() => abrir(c.id)}>
                                            <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                background: 'rgba(255,255,255,0.055)' }}>
                                                <Package size={16} style={{ color: 'var(--toul-text-faint)' }} />
                                            </span>
                                            <span style={{ flex: 1, minWidth: 0 }}>
                                                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em',
                                                    color: c.providers ? 'var(--toul-text)' : 'var(--toul-text-dim)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.providers?.name ?? 'Sin proveedor'}
                                                </span>
                                                <span style={{ display: 'block', fontSize: 12, color: 'var(--toul-text-dim)',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {fechaCompra(c.created_at)} · {refs} {refs === 1 ? 'producto' : 'productos'}
                                                    <span className="hc-und"> · {unidades} und</span>
                                                    {anulada && <span style={{ color: 'var(--toul-error)', fontWeight: 600 }}> · Anulada</span>}
                                                    {deuda && (
                                                        <span className="hc-debe" style={{ color: estaVencida(deuda.vence) ? 'var(--toul-error)' : 'var(--toul-warning)' }}>
                                                            <span className="hc-und"> · </span>
                                                            debes {formatCOP(deuda.falta)}
                                                            {estaVencida(deuda.vence) && ' · vencida'}
                                                        </span>
                                                    )}
                                                </span>
                                            </span>
                                            <span style={{ fontSize: 14.5, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums', ...estiloTotal }}>
                                                {abriendo === c.id ? '…' : formatCOP(Number(c.total))}
                                            </span>
                                        </button>
                                    </motion.div>
                                )
                            })}
                        </motion.div>
                        <div ref={sentinela} style={{ height: 1 }} />
                        {isValidating && hayMas && (
                            <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', textAlign: 'center', padding: '14px 0 0', margin: 0 }}>
                                Cargando más…
                            </p>
                        )}
                    </>
                )}

                {/* La búsqueda solo ve lo que ya se cargó: decirlo evita que
                    alguien crea que una compra vieja no existe */}
                {busca.trim() !== '' && hayMas && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, padding: '11px 13px',
                        borderRadius: 14, background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                        <AlertTriangle size={15} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--toul-text-dim)', lineHeight: 1.45 }}>
                            Buscando entre las compras cargadas. Baja hasta el final o abre el período «Todo» para buscar en todas.
                        </span>
                    </div>
                )}
                </>}
            </div>

            <PurchaseDetail
                purchase={abierta}
                onClose={cerrar}
                onChanged={alCambiar}
            />
        </div>
    )
}
