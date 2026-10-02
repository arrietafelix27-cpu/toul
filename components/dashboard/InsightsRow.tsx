'use client'

import { ProductsPanel, type ProductsData } from './ProductsPanel'
import { PendingPanel, type PendingData } from './PendingPanel'
import { AIAdvisor } from './AIAdvisor'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   La fila de abajo del inicio: tres paneles, un trabajo cada uno.
   Sin cajas — lo que los separa son líneas que se desvanecen,
   igual que arriba entre el gráfico y el resumen.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
/* Una sola superficie para los tres, como el resumen de arriba:
   lo que separa por dentro son líneas que se desvanecen */
.ir-row { display: grid; gap: 30px; align-items: stretch;
    padding: 20px 24px; border-radius: 20px;
    background: var(--toul-surface); border: 1px solid var(--toul-border); }
.ir-col { position: relative; min-width: 0; }

.ir-col::before {
    content: ''; position: absolute; left: -15px; top: 2%; bottom: 2%; width: 1px;
    background: var(--toul-divider);
    -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
    mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent);
}

/* Se mide el espacio disponible, no la pantalla: la barra lateral
   de la app se lleva 240 px que no se pueden usar */
@container (max-width: 959px) {
    .ir-row { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 26px; }
    .ir-products { grid-column: span 2; }
    .ir-products::before, .ir-products + .ir-col::before { display: none; }
}
@container (min-width: 960px) {
    .ir-row { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr); }
    .ir-products::before { display: none; }
}
`

export function InsightsRow({ products, pending, insight, storeName, loading, insightsLoading }: {
    products: ProductsData
    pending: PendingData
    insight: AIInsight | null
    storeName?: string | null
    loading: boolean
    insightsLoading: boolean
}) {
    return (
        <div style={{ containerType: 'inline-size' }}>
            <style>{CSS}</style>
            <div className="ir-row">
                <div className="ir-col ir-products">
                    <ProductsPanel products={products} loading={loading} />
                </div>
                <div className="ir-col">
                    <PendingPanel pending={pending} storeName={storeName} />
                </div>
                <div className="ir-col">
                    <AIAdvisor insight={insight} loading={insightsLoading || loading} />
                </div>
            </div>
        </div>
    )
}
