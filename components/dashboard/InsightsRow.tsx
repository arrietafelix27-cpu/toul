'use client'

import { ProductsPanel, type ProductsData } from './ProductsPanel'
import { PendingPanel, type PendingData } from './PendingPanel'
import { AccionesRapidas, ObservacionAI } from './AccionesRapidas'
import { ENTRADA_INICIO_CSS, entrada } from '@/lib/motion'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   La parte de abajo del Inicio en el computador: tres columnas,
   sin cajas. Plata pendiente a la izquierda, tus productos en el
   centro (la más ancha) y las acciones a la derecha. Lo que las
   separa es una línea de 1 px.
   ══════════════════════════════════════════════════════════════ */

const CSS = ENTRADA_INICIO_CSS + `
.ir-fila { display: grid; }
.ir-col { position: relative; min-width: 0; display: flex; flex-direction: column; }

/* Se mide el espacio disponible, no la pantalla: la barra lateral
   de la app se lleva 240 px que no se pueden usar */
@container (min-width: 1060px) {
    .ir-fila { grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1fr); }
    .ir-col { padding: 0 32px; }
    .ir-col:first-child { padding-left: 0; }
    .ir-col:last-child { padding-right: 0; }
    .ir-col + .ir-col { border-left: 1px solid var(--toul-border); }
}
/* Más angosto: los productos arriba a todo lo ancho y las otras dos debajo */
@container (max-width: 1059px) {
    .ir-fila { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 40px; }
    .ir-productos { grid-column: 1 / -1; grid-row: 1; }
    .ir-plata { padding-right: 32px; }
    .ir-acciones { padding-left: 32px; border-left: 1px solid var(--toul-border); }
}
`

export function InsightsRow({ products, pending, insight, storeName, loading, primeraCarga, insightsLoading, animar, turno }: {
    products: ProductsData
    pending: PendingData
    insight: AIInsight | null
    storeName?: string | null
    loading: boolean
    /** Todavía no ha llegado nada: lo que no depende del periodo espera solo esta vez */
    primeraCarga: boolean
    insightsLoading: boolean
    /** La primera vez que se abre la app, las columnas entran en cascada */
    animar: boolean
    /** En qué turno de la cascada del Inicio arranca esta fila */
    turno: number
}) {
    const columna = (clase: string, n: number) => entrada(turno + n, animar, `ir-col ${clase}`)

    return (
        <div style={{ containerType: 'inline-size' }}>
            <style>{CSS}</style>
            <div className="ir-fila">
                <div {...columna('ir-plata', 0)}>
                    <PendingPanel pending={pending} storeName={storeName} variante="pc" loading={primeraCarga} cuenta={animar} />
                </div>
                <div {...columna('ir-productos', 1)}>
                    <ProductsPanel products={products} loading={loading} variante="pc" animar={animar} />
                </div>
                <div {...columna('ir-acciones', 2)}>
                    <AccionesRapidas variante="pc" />
                    <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                        <ObservacionAI insight={insight} loading={insightsLoading || primeraCarga} />
                    </div>
                </div>
            </div>
        </div>
    )
}
