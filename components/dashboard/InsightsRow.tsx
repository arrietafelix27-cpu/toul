'use client'

import { ProductsPanel, type ProductsData } from './ProductsPanel'
import { PendingPanel, type PendingData } from './PendingPanel'
import { AIAdvisor } from './AIAdvisor'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   La fila de abajo del inicio: tres tarjetas, un trabajo cada una.
   Productos (qué pasa con la mercancía), plata pendiente (quién
   me debe) y TOUL AI (qué opina un experto).
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.ir-row { display: grid; gap: 24px; align-items: stretch; }
.ir-pending { border-radius: 18px; background: var(--toul-surface); border: 1px solid var(--toul-border); padding: 18px 20px; }

/* Se mide el espacio disponible, no la pantalla: la barra lateral
   de la app se lleva 240 px que no se pueden usar */
@container (max-width: 959px) {
    .ir-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ir-products { grid-column: span 2; }
}
@container (min-width: 960px) {
    .ir-row { grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr); }
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
                <div className="ir-products">
                    <ProductsPanel products={products} loading={loading} />
                </div>
                <div className="ir-pending">
                    <PendingPanel pending={pending} storeName={storeName} />
                </div>
                <AIAdvisor insight={insight} loading={insightsLoading || loading} />
            </div>
        </div>
    )
}
