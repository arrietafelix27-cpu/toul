'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePOSFlow } from '@/components/pos/POSFlowProvider'
import { useCaja } from '@/components/isla/CajaContext'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { useCobro, vibrar } from '@/lib/pos/useCobro'
import { useListaProductos, type Entrada } from '@/lib/pos/useListaProductos'
import { Avisos, Capa, alQuitarseGota, avisar, raizPos, retrasoCascada, retrasoEntradaCaja, useMontado } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import { CAJA_CSS, Conexion, SalirDeCaja, SinPresencia, useSalirDeCaja } from './piezas'
import { Productos } from './Productos'
import { BarraCobro, PanelVenta } from './PanelVenta'
import { Presentaciones } from './Presentaciones'
import { Cobro } from './Cobro'
import { VentaLista } from './VentaLista'

/**
 * Nueva venta (diseno/pos/SPEC.md).
 * Celular: productos a pantalla completa y la barra del carrito abajo.
 * "Cobrar" desliza el pago desde la derecha y corre los productos a la
 * izquierda, oscurecidos (SPEC §5).
 * PC: productos a la izquierda y el panel "Venta" a la derecha; "Cobrar"
 * desliza el pago encima del panel.
 *
 * Atajos en PC: "/" busca, Enter cobra (o empieza otra venta) y Escape
 * cierra la ventana de presentaciones o vuelve del pago a la venta.
 */
export function Caja() {
    const router = useRouter()
    const { data, cart, payment } = usePOSFlow()
    const { ctx, offline } = useCaja()
    const cobro = useCobro()
    const lista = useListaProductos(data, cart)
    const narrow = useIsMobile(900)
    const buscadorRef = useRef<HTMLInputElement>(null)
    const listaRef = useRef<HTMLDivElement>(null)
    const [presentacion, setPresentacion] = useState<string | null>(null)
    const [hojaCobro, setHojaCobro] = useState(false)
    const [pagoPc, setPagoPc] = useState(false)
    // El botón de confirmar terminó de estallar: ahora sí "Venta registrada"
    const [mostrarVenta, setMostrarVenta] = useState(false)
    // Cada venta nueva estrena la capa del pago (sin deslizarse de vuelta)
    const [vuelta, setVuelta] = useState(0)
    // Al abrir la caja, las filas y el panel esperan a la gota (o al zoom)
    const [entrada] = useState(() => {
        const r = retrasoCascada()
        return { filas: (typeof performance === 'undefined' ? 0 : performance.now()) + r.filas, panel: r.panel }
    })

    const { venta, nuevaVenta, enviando, limpiarError, boton, accionar } = cobro
    // Se deshizo: los productos vuelven a la venta, sin el pago encima
    if (!venta && mostrarVenta) {
        setMostrarVenta(false)
        setHojaCobro(false)
        setPagoPc(false)
        setVuelta(v => v + 1)
    }
    const ventaVisible = !!venta && mostrarVenta
    const verRegistrada = useCallback(() => setMostrarVenta(true), [])

    // Mientras corre la gota no se arma la lista (lo más pesado de la caja):
    // la gota nunca espera a que se pinten los productos. Entran al terminar
    const [enGota, setEnGota] = useState(() => retrasoEntradaCaja() != null)
    useEffect(() => {
        if (!enGota) return
        const soltar = alQuitarseGota(() => setEnGota(false))
        // Por si la gota ya se quitó antes de alcanzar a escuchar
        if (retrasoEntradaCaja() == null) queueMicrotask(() => setEnGota(false))
        return soltar
    }, [enGota])

    // La cantidad de una línea: recorta al stock y avisa si no alcanzó
    const cambiar = useCallback((key: string, n: number, nombre: string) => {
        if (venta) nuevaVenta()
        const antes = cart.cartMap[key] || 0
        const falta = n > antes ? cart.missingFor(key) : null
        const quedo = cart.setItemQuantity(key, n)
        if (quedo < n) {
            avisar(key.startsWith('combo:') && falta
                ? `Para otro combo falta ${data.unitName(falta)}`
                : `Ya tienes en la venta todo el stock de ${nombre}`, 'aviso')
        }
        if (quedo > antes) vibrar(8)
    }, [venta, nuevaVenta, cart, data])

    // PC: tocar la foto agrega uno o abre las presentaciones
    const tocar = useCallback((e: Entrada) => {
        if (e.agotado) return
        if (e.conPresentaciones) { setPresentacion(e.id); return }
        cambiar(e.key, e.enCarrito + 1, e.nombre)
    }, [cambiar])

    const empezarOtra = useCallback(() => {
        nuevaVenta()
        setHojaCobro(false)
        setPagoPc(false)
        setMostrarVenta(false)
        setVuelta(v => v + 1)
        // La venta nueva empieza viendo la lista desde arriba
        listaRef.current?.scrollTo({ top: 0 })
        if (!narrow) setTimeout(() => buscadorRef.current?.focus({ preventScroll: true }), 50)
    }, [nuevaVenta, narrow])

    const verVentas = useCallback(() => { nuevaVenta(); router.push('/caja/ventas') }, [nuevaVenta, router])
    const vaciar = useCallback(() => cart.clearCart(), [cart])
    const cobrarPc = useCallback(() => { if (!cart.isEmpty) setPagoPc(true) }, [cart.isEmpty])
    const volverPc = useCallback(() => { if (!enviando) { setPagoPc(false); limpiarError() } }, [enviando, limpiarError])
    const abrirHoja = useCallback(() => setHojaCobro(true), [])
    const cerrarPresentaciones = useCallback(() => setPresentacion(null), [])

    // Si se vacía el carrito con el pago encima, vuelve a la venta
    // (con la venta registrada, el panel vuelve a "Venta": el logro va encima)
    const pagando = pagoPc && (!cart.isEmpty || enviando) || (!!venta && !ventaVisible)

    // ── Atajos ───────────────────────────────────────────────────
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
                if (presentacion) { ev.preventDefault(); setPresentacion(null); return }
                if (!narrow && pagando && !venta && !enviando) { ev.preventDefault(); volverPc() }
                return
            }
            if (ev.key !== 'Enter') return
            if (tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return
            if (t?.dataset.enter === 'propio') return
            // Dentro de una hoja (abono, descuento…) Enter no cobra
            if (t?.closest('[role="dialog"]')) return
            if (presentacion) { ev.preventDefault(); setPresentacion(null); return }
            if (venta) { if (ventaVisible) { ev.preventDefault(); empezarOtra() } return }
            if (narrow && !hojaCobro) return
            if (!narrow && !pagando) { if (!cart.isEmpty) { ev.preventDefault(); setPagoPc(true) } return }
            // Enter cobra o pide la aprobación; nunca cancela una que se está esperando
            if (boton.accion === 'cobrar' || boton.accion === 'pedir') { ev.preventDefault(); accionar() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [presentacion, venta, ventaVisible, empezarOtra, narrow, hojaCobro, pagando, enviando, volverPc, cart.isEmpty, boton.accion, accionar])

    // Celular: el pago encima mientras hay algo que cobrar (vaciar el detalle vuelve a los productos)
    const enPago = hojaCobro && (!cart.isEmpty || enviando || !!venta)
    const { montado: pagoMontado } = useMontado(enPago, 460)
    const volverCelular = useCallback(() => {
        if (enviando || venta) return
        setHojaCobro(false)
        limpiarError()
    }, [enviando, venta, limpiarError])

    const productos = (
        <Productos lista={lista} data={data} narrow={narrow} esAdmin={ctx.role === 'admin'}
            onCambiar={cambiar} onTocar={tocar} buscadorRef={buscadorRef} listaRef={listaRef}
            salir={ctx.role === 'admin' ? <SalirDeCaja /> : null}
            conexion={<Conexion offline={offline} />}
            inicioCascada={entrada.filas} enEspera={enGota} />
    )

    const salir = useSalirDeCaja()
    // El logro se sigue viendo mientras se va
    const { montado: logroMontado } = useMontado(ventaVisible, 300)
    const registrada = (logroMontado || ventaVisible) && (
        <VentaLista cobro={cobro} narrow={narrow} onNueva={empezarOtra} onSalir={ctx.role === 'admin' ? salir : null} />
    )

    // ── Celular ──────────────────────────────────────────────────
    if (narrow) {
        return (
            <div className={raizPos} style={{ position: 'relative', height: '100%' }}>
                <style>{CAJA_CSS}</style>
                <Capa etiqueta="Productos" estado={enPago && !ventaVisible ? 'empujada' : 'normal'}>
                    {productos}
                    <BarraCobro cart={cart} total={payment.total} enviando={enviando} onCobrar={abrirHoja} />
                </Capa>
                <Capa key={vuelta} tipo="lateral" etiqueta="Pago" estado={ventaVisible ? 'ida' : enPago ? 'dentro' : 'fuera'}>
                    {(pagoMontado || enPago) && (
                        <Cobro cobro={cobro} narrow onCambiar={cambiar} onVolver={volverCelular} onRegistrada={verRegistrada} />
                    )}
                </Capa>
                <Capa tipo="encima" etiqueta="Venta registrada" estado={ventaVisible ? 'dentro' : 'fuera'}>
                    {registrada}
                </Capa>
                <Avisos />
            </div>
        )
    }

    // ── PC ───────────────────────────────────────────────────────
    const abierta = presentacion ? lista.entradas.find(e => e.id === presentacion) ?? null : null
    return (
        <div className={raizPos} style={{ height: '100%' }}>
            <style>{CAJA_CSS}</style>
            <div className={s.pcRejilla}>
                <section aria-label="Productos" style={{ minWidth: 0, height: '100%' }}>{productos}</section>
                <PanelVenta cart={cart} total={payment.total} pagando={pagando} enviando={enviando} base={entrada.panel}
                    onCambiar={cambiar} onVaciar={vaciar} onCobrar={cobrarPc} onVolver={volverPc} onVerVentas={verVentas}
                    volver={!venta} pago={<SinPresencia>
                        <Cobro cobro={cobro} narrow={false} onCambiar={cambiar} onRegistrada={verRegistrada} />
                    </SinPresencia>} />
            </div>
            {registrada && (
                <div className={s.logroVelo} data-sale={ventaVisible ? undefined : '1'}>
                    <div className={s.logroVentana} role="dialog" aria-modal="true" aria-label="Venta registrada">{registrada}</div>
                </div>
            )}
            <Presentaciones entrada={abierta} onCambiar={cambiar} onCerrar={cerrarPresentaciones} />
            <Avisos />
        </div>
    )
}
