'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { usePOSFlow } from '@/components/pos/POSFlowProvider'
import { useCaja } from '@/components/isla/CajaContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useCobro, vibrar } from '@/lib/pos/useCobro'
import { useListaProductos, type Entrada } from '@/lib/pos/useListaProductos'
import { CAJA_CSS, Cuenta, EASE_HOJA, SinPresencia } from './piezas'
import { Productos } from './Productos'
import { Presentaciones } from './Presentaciones'
import { Cobro } from './Cobro'
import { VentaLista } from './VentaLista'
import { Hoja } from './Hoja'

/**
 * Nueva venta. En PC: productos a la izquierda y el cobro a la derecha.
 * En el celular: productos a pantalla completa y el cobro en una hoja
 * que se cierra arrastrándola hacia abajo.
 *
 * Atajos en PC: "/" busca, Enter cobra (o empieza otra venta) y Escape
 * cierra cualquier hoja.
 */
export function Caja() {
    const router = useRouter()
    const { data, cart, payment } = usePOSFlow()
    const { ctx } = useCaja()
    const cobro = useCobro()
    const lista = useListaProductos(data, cart)
    const narrow = useIsMobile(900)
    const buscadorRef = useRef<HTMLInputElement>(null)
    const [presentacion, setPresentacion] = useState<string | null>(null)
    const [hojaCobro, setHojaCobro] = useState(false)

    const { venta, nuevaVenta } = cobro

    const agregar = useCallback((e: Entrada) => {
        // Tocar un producto con la venta lista en pantalla empieza otra
        if (venta) nuevaVenta()
        if (e.agotado) return
        if (e.conPresentaciones) { setPresentacion(e.id); return }
        const falta = cart.missingFor(e.key)
        if (falta) {
            toast(e.tipo === 'combo' ? `Para otro combo falta ${data.unitName(falta)}` : `Ya tienes en la venta todo lo que hay de ${e.nombre}`, { id: 'sin-stock' })
            return
        }
        cart.addItem(e.key)
        vibrar(8)
    }, [venta, nuevaVenta, cart, data])

    const quitar = useCallback((key: string) => cart.decrementItem(key), [cart])

    const empezarOtra = useCallback(() => {
        nuevaVenta()
        setHojaCobro(false)
        if (!narrow) setTimeout(() => buscadorRef.current?.focus(), 50)
    }, [nuevaVenta, narrow])

    const verVentas = useCallback(() => { nuevaVenta(); router.push('/caja/ventas') }, [nuevaVenta, router])

    // ── Atajos ───────────────────────────────────────────────────
    const { boton, accionar } = cobro
    useEffect(() => {
        const onKey = (ev: KeyboardEvent) => {
            if (ev.defaultPrevented || ev.isComposing || ev.metaKey || ev.ctrlKey || ev.altKey) return
            const t = ev.target as HTMLElement | null
            const tag = t?.tagName
            const escribiendo = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t?.isContentEditable

            if (ev.key === '/' && !escribiendo) {
                ev.preventDefault()
                if (presentacion) setPresentacion(null)
                buscadorRef.current?.focus()
                return
            }
            if (ev.key === 'Escape') {
                if (presentacion) { ev.preventDefault(); setPresentacion(null) }
                return
            }
            if (ev.key !== 'Enter') return
            if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return
            if (t?.dataset.enter === 'propio') return
            if (presentacion) { ev.preventDefault(); setPresentacion(null); return }
            if (venta) { ev.preventDefault(); empezarOtra(); return }
            if (narrow && !hojaCobro) return
            // Enter cobra o pide la aprobación; nunca cancela una que se está esperando
            if (boton.accion === 'cobrar' || boton.accion === 'pedir') { ev.preventDefault(); accionar() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [presentacion, venta, empezarOtra, narrow, hojaCobro, boton.accion, accionar])

    const cerrarPresentaciones = useCallback(() => setPresentacion(null), [])
    const cerrarHoja = useCallback(() => {
        if (cobro.enviando) return
        if (venta) empezarOtra()
        else setHojaCobro(false)
    }, [cobro.enviando, venta, empezarOtra])

    const productos = (
        <Productos lista={lista} data={data} cart={cart} narrow={narrow} esAdmin={ctx.role === 'admin'}
            onAgregar={agregar} onQuitar={quitar} buscadorRef={buscadorRef} />
    )

    const derecha = venta
        ? <VentaLista cobro={cobro} narrow={narrow} onNueva={empezarOtra} onVerVentas={verVentas} />
        : <Cobro cobro={cobro} narrow={narrow} />

    // ── Celular ──────────────────────────────────────────────────
    if (narrow) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--toul-bg)' }}>
                <style>{CAJA_CSS}</style>
                <div style={{ flex: 1, minHeight: 0 }}>{productos}</div>

                {/* Barra de cobro */}
                <div style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
                    borderTop: '1px solid var(--toul-divider)',
                    background: 'rgba(10,10,10,0.9)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-subtle)', margin: 0 }}>
                            {cart.isEmpty ? 'Sin productos' : `${cart.totalUnits} ${cart.totalUnits === 1 ? 'producto' : 'productos'}`}
                        </p>
                        <Cuenta valor={payment.total} style={{ display: 'block', fontSize: 25, fontWeight: 750, letterSpacing: '-0.035em', lineHeight: 1.2, color: 'var(--toul-text)' }} />
                    </div>
                    <button type="button" onClick={() => setHojaCobro(true)} disabled={cart.isEmpty} className="cj-btn cj-press"
                        style={{
                            height: 54, padding: '0 26px', borderRadius: 17, flexShrink: 0, fontSize: 16.5, fontWeight: 650,
                            background: cart.isEmpty ? 'var(--toul-pos-btn-disabled-bg)' : 'var(--toul-accent)',
                            color: cart.isEmpty ? 'var(--toul-text-dim)' : 'var(--toul-bg)',
                        }}>
                        Cobrar
                    </button>
                </div>

                <Hoja open={hojaCobro || !!venta} onClose={cerrarHoja} narrow completa cerrable={!cobro.enviando}>
                    {derecha}
                </Hoja>
                <Presentaciones productId={presentacion} data={data} cart={cart} narrow onClose={cerrarPresentaciones} />
            </div>
        )
    }

    // ── Computador: dos columnas ─────────────────────────────────
    return (
        <div style={{ display: 'flex', height: '100%', background: 'var(--toul-bg)' }}>
            <style>{CAJA_CSS}</style>
            <section aria-label="Productos" style={{ flex: 1, minWidth: 0, height: '100%' }}>{productos}</section>
            <aside aria-label="Cobro" style={{ width: 'clamp(380px, 34vw, 460px)', flexShrink: 0, height: '100%', borderLeft: '1px solid var(--toul-divider)', position: 'relative', overflow: 'hidden' }}>
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={venta ? 'lista' : 'cobro'} style={{ height: '100%' }}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.22, ease: EASE_HOJA }}>
                        {/* Sin esto, cambiar Contado/Crédito antes de cobrar dejaba el
                            cobro sin salir y "Venta registrada" nunca aparecía */}
                        <SinPresencia>{derecha}</SinPresencia>
                    </motion.div>
                </AnimatePresence>
            </aside>
            <Presentaciones productId={presentacion} data={data} cart={cart} narrow={false} onClose={cerrarPresentaciones} />
        </div>
    )
}
