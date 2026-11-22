'use client'

import { useEffect, useState } from 'react'
import { useCaja } from '@/components/isla/CajaContext'
import type { CobroState, VentaHecha } from '@/lib/pos/useCobro'
import { BotonPrincipal, BotonSecundario, IcoCompartir, NotaGuardada, cx } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import { nombreMetodo } from '@/lib/format/text'
import { formatCOP } from '@/lib/utils'
import { fechaCorta } from './HojaFecha'
import { HojaComprobante } from './HojaComprobante'

/* ══════════════════════════════════════════════════════════════
   El logro: "Venta registrada" (SPEC §7).
   Brillo verde, el círculo que aparece con su pulso, el chulo que se
   dibuja y un confeti corto (1,1 s: se venden 30 al día). Debajo el
   monto, una línea de resumen y la tarjeta de la venta.
   "¿Te equivocaste? Deshacer" dura 5 segundos (solo el administrador).
   Celular: pantalla completa. PC: ventana al centro; Enter = Nueva venta.
   ══════════════════════════════════════════════════════════════ */

const SEGUNDOS_DESHACER = 5

// Los 12 papelitos: ángulo, distancia, color y cuándo salen
const CONFETI = [
    [10, 120, 'var(--toul-accent)', 300], [40, 150, 'var(--toul-text)', 320], [70, 110, 'var(--toul-accent-menta)', 300],
    [100, 140, 'var(--toul-accent-claro)', 340], [135, 125, 'var(--toul-accent)', 310], [165, 150, 'var(--toul-text)', 330],
    [195, 115, 'var(--toul-accent-menta)', 300], [225, 145, 'var(--toul-accent-claro)', 350], [255, 120, 'var(--toul-accent)', 310],
    [285, 150, 'var(--toul-text)', 320], [315, 112, 'var(--toul-accent-menta)', 300], [345, 140, 'var(--toul-accent-claro)', 340],
] as const

const nombreLinea = (i: VentaHecha['items'][number]) => `${i.product.name}${i.variantName ? ` · ${i.variantName}` : ''}`

/** "Efectivo · Cambio $5.000 · Andrés Pérez" o "Andrés Pérez · Vence el vie 27 nov" */
function resumen(v: VentaHecha): string {
    if (v.isCredit) {
        return [v.customerName, v.fechaPago ? `Vence el ${fechaCorta(v.fechaPago)}` : 'Sin fecha límite'].filter(Boolean).join(' · ')
    }
    const pagos = v.payments.filter(p => p.amount > 0).map(p => nombreMetodo(p.methodName))
    return [
        pagos.join(' + '),
        v.change > 0 ? `Cambio ${formatCOP(Math.round(v.change))}` : null,
        v.customerName,
    ].filter(Boolean).join(' · ')
}

export function VentaLista({ cobro, narrow, onNueva, onSalir }: {
    cobro: CobroState
    narrow: boolean
    onNueva: () => void
    /** null: quien vende no tiene a dónde salir (no ve "Salir") */
    onSalir: (() => void) | null
}) {
    const { ctx, isPro, comprobante, tienda } = useCaja()
    const [verComprobante, setVerComprobante] = useState(false)
    // La última venta se sigue viendo mientras el logro se va
    const [ultima, setUltima] = useState(cobro.venta)
    if (cobro.venta && cobro.venta !== ultima) setUltima(cobro.venta)
    const venta = cobro.venta ?? ultima
    if (!venta) return null

    const conTirilla = isPro && comprobante !== 'whatsapp'
    const productos = venta.items.slice(0, 4)
    const mas = venta.items.length - productos.length

    return (
        <div className={s.logro}>
            <div className={s.logroBrillo} aria-hidden="true" />
            <div className={s.logroScroll}>
                <div className={s.logroCirculo} aria-hidden="true">
                    <svg width={narrow ? 46 : 40} height={narrow ? 46 : 40} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                        <path className={s.logroCheck} d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    {CONFETI.map(([a, r, c, dl], i) => (
                        <span key={i} className={s.confeti}
                            style={{ ['--a' as string]: `${a}deg`, ['--r' as string]: `${r}px`, ['--c' as string]: c, ['--dl' as string]: `${dl}ms` }} />
                    ))}
                </div>

                <h2 className={cx(s.logroTitulo, s.logroSube)} style={{ ['--dl' as string]: '380ms' }} role="status">
                    {venta.isCredit ? 'Venta a crédito registrada' : 'Venta registrada'}
                </h2>
                <div className={cx(s.logroMonto, s.logroSube)} style={{ ['--dl' as string]: '460ms' }}>
                    {formatCOP(Math.round(venta.total))}
                </div>
                {resumen(venta) && (
                    <div className={cx(s.logroResumen, s.logroSube)} style={{ ['--dl' as string]: '520ms' }}>{resumen(venta)}</div>
                )}

                {ctx.role === 'admin' && <Deshacer key={venta.clientSaleId} cobro={cobro} />}

                {venta.offline && (
                    <NotaGuardada>
                        {narrow ? 'Guardada en el teléfono.' : 'Guardada en este computador.'} Se enviará automáticamente al recuperar la conexión.
                    </NotaGuardada>
                )}

                <div className={cx(s.logroTarjeta, s.logroSube)} style={{ ['--dl' as string]: '600ms' }}>
                    {productos.map((i, n) => (
                        <div key={n} className={s.logroLinea}>
                            <span className={s.logroLineaNombre}><span className={s.logroCant}>{i.quantity}×</span>{nombreLinea(i)}</span>
                            <span className={s.logroValor}>{formatCOP(Math.round((i.unitPrice ?? i.product.sale_price) * i.quantity))}</span>
                        </div>
                    ))}
                    {mas > 0 && <div className={s.logroMas}>y {mas} {mas === 1 ? 'producto más' : 'productos más'}</div>}
                    {venta.discount > 0 && (
                        <div className={s.logroFila}><span>Descuento</span><span className={s.logroValor} data-tono="verde">−{formatCOP(Math.round(venta.discount))}</span></div>
                    )}
                    {venta.isCredit && (<>
                        {venta.abono > 0 && (
                            <div className={s.logroFila}><span>Abono</span><span className={s.logroValor} data-tono="verde">{formatCOP(Math.round(venta.abono))}</span></div>
                        )}
                        <div className={s.logroFila}><span>Saldo pendiente</span><span className={s.logroValor} data-tono="ambar">{formatCOP(Math.round(venta.debe))}</span></div>
                    </>)}
                    <div className={s.logroTotal}><span>Total</span><span>{formatCOP(Math.round(venta.total))}</span></div>
                </div>
            </div>

            <div className={s.logroBotones}>
                <BotonSecundario onClick={() => setVerComprobante(true)}><IcoCompartir />Enviar comprobante</BotonSecundario>
                <div className={onSalir ? s.logroPar : undefined}>
                    {onSalir && <BotonSecundario onClick={onSalir}>Salir</BotonSecundario>}
                    <BotonPrincipal onClick={onNueva} autoFocus={!narrow} style={onSalir ? undefined : { width: '100%' }}>
                        Nueva venta
                        {!narrow && <kbd className={cx(s.tecla, s.teclaOscura)}>Enter</kbd>}
                    </BotonPrincipal>
                </div>
            </div>

            <HojaComprobante abierta={verComprobante} onCerrar={() => setVerComprobante(false)} venta={venta}
                tienda={tienda?.name || ctx.storeName} onEnviarWhatsApp={cobro.compartir}
                conTirilla={conTirilla} onImprimir={() => void cobro.imprimir()} imprimiendo={cobro.imprimiendo} />
        </div>
    )
}

/** "¿Te equivocaste? Deshacer": 5 segundos con el anillo que se vacía.
 *  Al vencer se apaga pero deja su espacio: nada se mueve bajo el dedo */
function Deshacer({ cobro }: { cobro: CobroState }) {
    const [vigente, setVigente] = useState(true)
    useEffect(() => {
        // 400 ms de entrada + los 5 segundos del anillo
        const t = setTimeout(() => setVigente(false), SEGUNDOS_DESHACER * 1000 + 400)
        return () => clearTimeout(t)
    }, [])
    const visible = vigente || cobro.deshaciendo

    return (
        <button type="button" className={s.deshacer} data-fuera={visible ? undefined : '1'} aria-hidden={!visible}
            tabIndex={visible ? 0 : -1} disabled={!visible || cobro.deshaciendo} onClick={() => void cobro.deshacer()}>
            <svg className={s.deshacerAnillo} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="8" fill="none" stroke="var(--p-s14)" strokeWidth="2" />
                <circle className={s.deshacerArco} cx="10" cy="10" r="8" fill="none" stroke="var(--toul-text)" strokeWidth="2"
                    strokeLinecap="round" style={{ ['--t' as string]: `${SEGUNDOS_DESHACER}s` }} />
            </svg>
            {cobro.deshaciendo ? 'Deshaciendo…' : '¿Te equivocaste? Deshacer'}
        </button>
    )
}
