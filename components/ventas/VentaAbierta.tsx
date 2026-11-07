'use client'

import { useCallback, useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { explainError } from '@/lib/errors'
import { Sheet } from '@/components/isla/Sheet'
import { VoidSaleDialog } from '@/components/isla/VoidSaleDialog'
import { PANEL_CSS } from '@/components/dashboard/panelStyles'
import { SALE_DETAIL_SELECT, type SaleDetailData } from '@/lib/types'
import { SaleDetail } from './SaleDetail'
import { DevolucionSheet } from './DevolucionSheet'

/* ══════════════════════════════════════════════════════════════
   Una venta abierta, con todo lo que se le puede hacer: ver el
   detalle, reimprimir, devolver una parte, anular y cambiar a
   quién fue. La usan Ventas y Movimientos, para que la venta se
   abra igual desde los dos lados.
   ══════════════════════════════════════════════════════════════ */

const supabase = createClient()

/** Trae una venta con todo lo que muestra el detalle; null si no está */
export async function cargarVenta(storeId: string, id: string): Promise<SaleDetailData | null> {
    const run = (select: string) => supabase.from('sales').select(select).eq('store_id', storeId).eq('id', id).maybeSingle()
    // seller_name existe desde el modo isla; si falta, se reintenta sin él
    let { data, error } = await run(`${SALE_DETAIL_SELECT}, seller_name`)
    if (error) ({ data, error } = await run(SALE_DETAIL_SELECT))
    if (error || !data) return null
    return data as unknown as SaleDetailData
}

export function VentaAbierta({ venta, storeId, onCerrar, onCambio }: {
    venta: SaleDetailData | null
    storeId: string | null
    onCerrar: () => void
    /** Se anuló, se devolvió algo o cambió el cliente: la lista se vuelve a pedir */
    onCambio: () => void
}) {
    const [anular, setAnular] = useState(false)
    const [devolver, setDevolver] = useState(false)
    const [cambiarCliente, setCambiarCliente] = useState<SaleDetailData | null>(null)
    const [guardandoCliente, setGuardandoCliente] = useState(false)

    const { data: clientes } = useSWR(
        storeId && cambiarCliente ? ['clientes-venta', storeId] : null,
        async () => {
            // Lo que debe cada uno sale de los movimientos, igual que en Cuentas por cobrar
            const [{ data }, { data: cartera }] = await Promise.all([
                supabase.from('customers').select('id, name').eq('store_id', storeId!).eq('is_active', true).order('name'),
                supabase.rpc('toul_receivables'),
            ])
            const saldos = new Map(((cartera as { clientes?: { id: string; saldo: number }[] } | null)?.clientes ?? [])
                .map(c => [c.id, Number(c.saldo)]))
            return (data ?? []).map(c => ({ ...c, total_debt: saldos.get(c.id) ?? 0 }))
        },
        { revalidateOnFocus: false },
    )

    const listo = useCallback(() => { onCerrar(); onCambio() }, [onCerrar, onCambio])
    const cerrarDevolucion = useCallback(() => setDevolver(false), [])
    const cerrarAnular = useCallback(() => setAnular(false), [])
    const cerrarCambioCliente = useCallback(() => setCambiarCliente(null), [])
    const abrirAnular = useCallback(() => setAnular(true), [])
    const abrirDevolver = useCallback(() => setDevolver(true), [])
    const anulada = useCallback(() => { setAnular(false); listo() }, [listo])

    async function ponerCliente(customerId: string | null) {
        if (!cambiarCliente) return
        setGuardandoCliente(true)
        const { data, error } = await supabase.rpc('toul_change_sale_customer', {
            p_sale_id: cambiarCliente.id,
            p_customer_id: customerId,
        })
        setGuardandoCliente(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar el cliente.')); return }
        setCambiarCliente(null)
        listo()

        if (data?.changed === false) {
            toast('Esa venta ya estaba a nombre de ese cliente')
        } else if (customerId === null) {
            toast.success('La venta quedó sin cliente')
        } else {
            const movida = Number(data?.movedDebt ?? 0)
            toast.success(movida > 0
                ? `La venta quedó a nombre de ${data?.name}. Se le pasaron ${formatCOP(movida)} de deuda.`
                : `La venta quedó a nombre de ${data?.name}`)
        }
    }

    return (
        <>
            <SaleDetail
                sale={venta}
                onClose={onCerrar}
                onChangeCustomer={setCambiarCliente}
                onVoid={abrirAnular}
                onDevolver={abrirDevolver}
            />

            {/* Devolver una parte: lo demás de la venta sigue igual */}
            <DevolucionSheet
                open={devolver}
                onClose={cerrarDevolucion}
                saleId={venta?.id ?? null}
                isAdmin
                onDone={listo}
            />

            {/* Corregir a quién se le vendió */}
            <Sheet
                open={!!cambiarCliente}
                onClose={cerrarCambioCliente}
                title="¿A quién fue esta venta?"
                subtitle={cambiarCliente ? formatCOP(cambiarCliente.total) : undefined}>
                <style>{PANEL_CSS}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
                    {!cambiarCliente?.is_credit && (
                        <button className="pnl-row" style={{ border: '1px solid var(--toul-border)', background: 'var(--toul-surface)' }}
                            disabled={guardandoCliente} onClick={() => ponerCliente(null)}>
                            <span style={{ flex: 1, fontSize: 14.5, color: 'var(--toul-text-dim)', textAlign: 'left' }}>Sin cliente</span>
                        </button>
                    )}
                    {(clientes ?? []).map(persona => {
                        const actual = cambiarCliente?.customer_id === persona.id
                        return (
                            <button key={persona.id} className="pnl-row"
                                style={{
                                    border: `1px solid ${actual ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                    background: actual ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                }}
                                disabled={guardandoCliente || actual} onClick={() => ponerCliente(persona.id)}>
                                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: actual ? 'var(--toul-accent)' : 'var(--toul-text)' }}>
                                        {persona.name}
                                    </span>
                                    {actual && (
                                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--toul-accent)' }}>
                                            esta venta ya es de esta persona
                                        </span>
                                    )}
                                </span>
                                {Number(persona.total_debt) > 0 && (
                                    <span style={{ fontSize: 12.5, color: 'var(--toul-warning)', flexShrink: 0 }}>
                                        debe {formatCOP(Math.round(Number(persona.total_debt)))}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                    {cambiarCliente?.is_credit && (
                        <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '4px 2px 0', lineHeight: 1.5 }}>
                            Esta venta fue a crédito: al cambiar el cliente, la deuda se le pasa al nuevo.
                        </p>
                    )}
                </div>
            </Sheet>

            {venta && (
                <VoidSaleDialog
                    open={anular}
                    onClose={cerrarAnular}
                    saleId={venta.id}
                    total={venta.total}
                    isAdmin
                    onDone={anulada}
                />
            )}
        </>
    )
}
