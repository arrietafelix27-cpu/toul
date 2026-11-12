'use client'

import { use, useState, useCallback } from 'react'
import { StockDetail, StockDetailSkeleton } from '@/components/inventory/StockDetail'
import { SinInternet } from '@/components/ui/SinInternet'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { useDetallePresentacion } from '@/lib/inventory/useDetalleStock'

export default function InventoryVariantPage({ params }: { params: Promise<{ variantId: string }> }) {
    const { variantId } = use(params)
    const [adjustOpen, setAdjustOpen] = useState(false)
    const { detalle, error, isLoading, mutate, saveMin } = useDetallePresentacion(variantId)
    const reintentar = useCallback(() => { mutate() }, [mutate])
    const abrirAjuste = useCallback(() => setAdjustOpen(true), [])
    const cerrarAjuste = useCallback(() => setAdjustOpen(false), [])

    if (isLoading) return <StockDetailSkeleton />
    // Sin internet no es "ya no existe"
    if (error && !detalle) return <SinInternet onRetry={reintentar} que="esta presentación" />
    if (!detalle) {
        return (
            <div className="px-4 pt-10 max-w-xl mx-auto" style={{ textAlign: 'center', color: 'var(--toul-text-muted)' }}>
                Esta presentación ya no existe.
            </div>
        )
    }

    const {
        variant, product, movements, sold30d, coverageDays, stock, cost, price, manualMin, minStock,
        estado, linea, comprar, pedido, teDura, plata,
    } = detalle

    return (
        <>
            <StockDetail
                name={variant.name}
                parent={{ name: product.name, href: `/inventory/${product.id}` }}
                reference={product.reference}
                image={(product.images?.[0] as string | undefined) ?? product.image_url}
                stock={stock}
                estado={estado}
                linea={linea}
                teDura={teDura}
                sold30d={sold30d}
                minimo={{ valor: minStock, manual: manualMin, respaldo: coverageDays, onGuardar: saveMin }}
                cost={cost}
                price={price}
                plata={plata}
                comprar={comprar}
                pedido={pedido}
                buyHref={`/inventory/purchase?product=${product.id}&variant=${variant.id}`}
                movements={movements}
                backHref={`/inventory/${product.id}`}
                catalogHref={`/products/${product.id}/presentacion/${variant.id}`}
                onAdjust={abrirAjuste}
            />

            <StockAdjustSheet
                open={adjustOpen}
                storeId={variant.store_id}
                onClose={cerrarAjuste}
                onDone={mutate}
                preselect={{ productId: product.id, variantId: variant.id }}
            />
        </>
    )
}
