'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { MessageCircle, Printer } from 'lucide-react'
import { useCaja } from '@/components/isla/CajaContext'
import type { CobroState } from '@/lib/pos/useCobro'
import { nombreMetodo } from '@/lib/format/text'
import { textoBotonWhatsApp } from '@/lib/pos/comprobante'
import { formatCOP } from '@/lib/utils'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { EASE_HOJA } from './piezas'

const SEGUNDOS_DESHACER = 5

const CSS = `
@keyframes cj-vacia { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes cj-pulso { 0% { transform: scale(1); opacity: 0.45; } 100% { transform: scale(1.75); opacity: 0; } }
.cj-pulso { animation: cj-pulso 1.1s var(--toul-ease-emil) 0.35s 2 both; }
.cj-equivocaste { transition: opacity 220ms var(--toul-ease-emil); }
.cj-equivocaste-boton { background: none; color: var(--toul-text); font-weight: 650; padding: 8px 2px; margin: -8px -2px;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; transition: color 160ms ease; }
@media (hover: hover) and (pointer: fine) { .cj-equivocaste-boton:hover { color: var(--toul-accent); } }
@media (prefers-reduced-motion: reduce) { .cj-pulso { animation: none; opacity: 0; } }
`

function Fila({ label, valor, tono, fuerte }: { label: string; valor: string; tono?: string; fuerte?: boolean }) {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, padding: '11px 0', borderBottom: '1px solid var(--toul-divider)' }}>
            <span style={{ fontSize: 14, color: tono ?? 'var(--toul-text-subtle)', flexShrink: 0 }}>{label}</span>
            <span className="cj-num" style={{ fontSize: fuerte ? 16 : 14.5, fontWeight: fuerte ? 700 : 550, color: tono ?? 'var(--toul-text)', textAlign: 'right', minWidth: 0 }}>{valor}</span>
        </div>
    )
}

export function VentaLista({ cobro, narrow, onNueva, onVerVentas }: {
    cobro: CobroState
    narrow: boolean
    onNueva: () => void
    onVerVentas: () => void
}) {
    const { ctx, isPro, comprobante, session } = useCaja()
    const venta = cobro.venta
    const reducir = useReducedMotion()
    if (!venta) return null

    const conWhatsApp = comprobante !== 'tirilla' || !isPro
    const conTirilla = isPro && comprobante !== 'whatsapp'
    const textoWhatsApp = textoBotonWhatsApp(venta.customerName, venta.customerPhone)
    const conDeshacer = ctx.role === 'admin'
    const pagos = venta.payments.filter(p => p.amount > 0)
    const productos = venta.items.slice(0, 4)
    const masProductos = venta.items.length - productos.length

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <style>{CSS}</style>
            <div className="cj-scroll-y" style={{ flex: 1, minHeight: 0, padding: narrow ? '8px 20px 20px' : '36px 24px 20px' }}>
                {/* ── El chulo, que se dibuja ───────────────────── */}
                <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto' }}>
                    <span aria-hidden className="cj-pulso" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--toul-accent-glow)' }} />
                    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden style={{ position: 'relative' }}>
                        <circle cx="42" cy="42" r="40" fill="var(--toul-accent-dim)" />
                        <motion.path d="M27 43 L38 54 L58 32" fill="none" stroke="var(--toul-accent)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
                            initial={{ pathLength: reducir ? 1 : 0 }} animate={{ pathLength: 1 }}
                            transition={{ duration: 0.55, ease: EASE_HOJA, delay: 0.08 }} />
                    </svg>
                </div>

                <h2 style={{ fontSize: 15, fontWeight: 500, color: 'var(--toul-text-muted)', margin: '14px 0 0', textAlign: 'center' }}>
                    {venta.isCredit ? 'Venta fiada registrada' : 'Venta registrada'}
                </h2>
                <p style={{ margin: '4px 0 0', textAlign: 'center' }}>
                    <AnimatedNumber value={venta.total} formatter={formatCOP} cuenta duration={0.5}
                        style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.035em', color: 'var(--toul-text)', fontVariantNumeric: 'tabular-nums' }} />
                </p>
                <p style={{ fontSize: 13, textAlign: 'center', margin: '4px 0 0', color: venta.offline ? 'var(--toul-warning)' : 'var(--toul-text-subtle)' }}>
                    {venta.offline ? 'Guardada sin internet · se envía sola cuando vuelva' : 'Inventario y caja actualizados'}
                </p>

                {/* ── Resumen ────────────────────────────────────── */}
                <div style={{ marginTop: 24 }}>
                    {venta.isCredit ? (<>
                        <Fila label="Cliente" valor={venta.customerName || 'Sin nombre'} />
                        <Fila label="Abono recibido" valor={venta.abono > 0 ? `${formatCOP(venta.abono)}${pagos.length === 1 ? ` · ${nombreMetodo(pagos[0].methodName)}` : ''}` : 'Sin abono'} />
                        <Fila label="Queda debiendo" valor={formatCOP(venta.debe)} tono="var(--toul-warning)" fuerte />
                    </>) : (<>
                        {pagos.length > 1
                            ? pagos.map((p, n) => <Fila key={n} label={nombreMetodo(p.methodName)} valor={formatCOP(p.amount)} />)
                            : <Fila label="Pagado con" valor={pagos.length === 0 ? '—' : nombreMetodo(pagos[0].methodName)} />}
                        {venta.customerName && <Fila label="Cliente" valor={venta.customerName} />}
                    </>)}
                    {venta.change > 0 && venta.cashReceived !== null && (<>
                        <Fila label="Recibido en efectivo" valor={formatCOP(venta.cashReceived)} />
                        <Fila label="Vuelto" valor={formatCOP(venta.change)} fuerte />
                    </>)}
                    {venta.discount > 0 && <Fila label="Descuento" valor={`−${formatCOP(venta.discount)}`} />}
                    <div style={{ padding: '11px 0' }}>
                        {productos.map((i, n) => (
                            <div key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', fontSize: 13.5 }}>
                                <span style={{ color: 'var(--toul-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    {i.quantity} × {i.product.name}{i.variantName ? ` · ${i.variantName}` : ''}
                                </span>
                                <span className="cj-num" style={{ color: 'var(--toul-text-muted)', flexShrink: 0 }}>{formatCOP((i.unitPrice ?? i.product.sale_price) * i.quantity)}</span>
                            </div>
                        ))}
                        {masProductos > 0 && <p style={{ fontSize: 13, color: 'var(--toul-text-subtle)', margin: '3px 0 0' }}>y {masProductos} más</p>}
                    </div>
                </div>
            </div>

            {/* ── Botones ───────────────────────────────────────── */}
            <div style={{ flexShrink: 0, padding: `12px ${narrow ? 20 : 24}px ${conDeshacer ? '4px' : `calc(${narrow ? 14 : 18}px + env(safe-area-inset-bottom, 0px))`}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {conWhatsApp && (
                    <button type="button" onClick={cobro.compartir} className="cj-btn cj-press-suave" style={secundario}>
                        <MessageCircle size={17} aria-hidden /> {textoWhatsApp}
                    </button>
                )}
                {conTirilla && (
                    <button type="button" onClick={() => void cobro.imprimir()} disabled={cobro.imprimiendo} className="cj-btn cj-press-suave" style={{ ...secundario, opacity: cobro.imprimiendo ? 0.6 : 1 }}>
                        <Printer size={17} aria-hidden /> {cobro.imprimiendo ? 'Preparando la tirilla…' : 'Imprimir tirilla'}
                    </button>
                )}
                <button type="button" onClick={onNueva} autoFocus={!narrow} className="cj-btn cj-press-suave"
                    style={{ marginTop: conWhatsApp || conTirilla ? 4 : 0, height: 58, borderRadius: 17, fontSize: 16.5, fontWeight: 650, background: 'var(--toul-accent)', color: 'var(--toul-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    Nueva venta
                    {!narrow && <kbd style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, padding: '2px 7px', borderRadius: 6, background: 'color-mix(in srgb, var(--toul-bg) 14%, transparent)' }}>Enter</kbd>}
                </button>
                <div style={{ display: 'flex', justifyContent: 'center', minHeight: 36, alignItems: 'center' }}>
                    <button type="button" onClick={onVerVentas} className="cj-btn cj-link">{isPro && session ? 'Ver ventas del turno' : 'Ver ventas de hoy'}</button>
                </div>
            </div>
            {conDeshacer && <TeEquivocaste key={venta.clientSaleId} cobro={cobro} narrow={narrow} />}
        </div>
    )
}

/** "¿Te equivocaste? Deshacer": 5 segundos, con la barra verde que se
 *  vacía. Solo el administrador. Al vencer se desvanece pero deja su
 *  espacio, para que "Nueva venta" no se mueva bajo el dedo */
function TeEquivocaste({ cobro, narrow }: { cobro: CobroState; narrow: boolean }) {
    const [vigente, setVigente] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => setVigente(false), SEGUNDOS_DESHACER * 1000)
        return () => clearTimeout(t)
    }, [])
    const visible = vigente || cobro.deshaciendo

    return (
        <div className="cj-equivocaste" aria-hidden={!visible} style={{
            flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: `11px ${narrow ? 20 : 24}px calc(11px + env(safe-area-inset-bottom, 0px))`,
            borderTop: '1px solid var(--toul-divider)', fontSize: 13.5, color: 'var(--toul-text-muted)',
            opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none',
        }}>
            <span>¿Te equivocaste?</span>
            <button type="button" onClick={() => void cobro.deshacer()} disabled={cobro.deshaciendo || !visible} tabIndex={visible ? 0 : -1}
                className="cj-btn cj-equivocaste-boton" style={{ fontSize: 13.5 }}>
                {cobro.deshaciendo ? 'Deshaciendo…' : 'Deshacer'}
            </button>
            {!cobro.deshaciendo && (
                <span aria-hidden style={{
                    position: 'absolute', left: 0, right: 0, top: -1, height: 2, background: 'var(--toul-accent)',
                    transformOrigin: 'left', animation: `cj-vacia ${SEGUNDOS_DESHACER}s linear both`,
                }} />
            )}
        </div>
    )
}

const secundario: React.CSSProperties = {
    flex: 1, height: 48, borderRadius: 15, fontSize: 15, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'var(--toul-surface)', color: 'var(--toul-text)',
}
