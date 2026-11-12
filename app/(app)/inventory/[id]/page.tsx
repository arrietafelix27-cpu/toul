'use client'

import { use, useState, useCallback } from 'react'
import { StockDetail, StockDetailSkeleton } from '@/components/inventory/StockDetail'
import { SinInternet } from '@/components/ui/SinInternet'
import { StockAdjustSheet } from '@/components/inventory/StockAdjustSheet'
import { VariantManager } from '@/components/inventory/VariantManager'
import { useDetalleProducto } from '@/lib/inventory/useDetalleStock'

export default function InventoryProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [adjustOpen, setAdjustOpen] = useState(false)
    const { detalle, error, isLoading, mutate, saveMin } = useDetalleProducto(id)
    const reintentar = useCallback(() => { mutate() }, [mutate])
    const abrirAjuste = useCallback(() => setAdjustOpen(true), [])
    const cerrarAjuste = useCallback(() => setAdjustOpen(false), [])

    if (isLoading) return <StockDetailSkeleton />
    // Sin internet no es "ya no existe"
    if (error && !detalle) return <SinInternet onRetry={reintentar} que="este producto" />
    if (!detalle) {
        return (
            <div className="px-4 pt-10 max-w-xl mx-auto" style={{ textAlign: 'center', color: 'var(--toul-text-muted)' }}>
                Este producto ya no existe.
            </div>
        )
    }

    const {
        product, variants, movements, sold30d, coverageDays, hasVariants, stock, cost, price, manualMin, minStock, presentations,
        estado, linea, comprar, pedido, teDura, plata,
    } = detalle

    return (
        <>
            <StockDetail
                name={product.name}
                reference={product.reference}
                image={(product.images?.[0] as string | undefined) ?? product.image_url}
                stock={stock}
                estado={estado}
                linea={linea}
                teDura={teDura}
                sold30d={sold30d}
                // Con presentaciones, el mínimo y el precio viven en cada una
                minimo={hasVariants ? undefined : { valor: minStock, manual: manualMin, respaldo: coverageDays, onGuardar: saveMin }}
                cost={cost}
                price={hasVariants ? undefined : price}
                plata={plata}
                comprar={comprar}
                pedido={pedido}
                buyHref={`/inventory/purchase?product=${product.id}`}
                presentations={presentations}
                movements={movements}
                backHref="/inventory"
                catalogHref={`/products/${product.id}`}
                // Un producto con presentaciones no se ajusta por sí mismo: cada una
                onAdjust={hasVariants ? undefined : abrirAjuste}
                extra={
                    <VariantManager
                        productId={product.id}
                        storeId={product.store_id}
                        variants={variants}
                        onChange={mutate}
                    />
                }
            />

            <StockAdjustSheet
                open={adjustOpen}
                storeId={product.store_id}
                onClose={cerrarAjuste}
                onDone={mutate}
                preselect={{ productId: product.id }}
            />
        </>
    )
}
