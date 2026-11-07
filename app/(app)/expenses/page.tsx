'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { periodoDeDireccion } from '@/lib/periodos'

/* ══════════════════════════════════════════════════════════════
   Gastos ahora vive dentro de Movimientos (filtro "Gastos", con su
   total y sus categorías). Esta dirección se queda para que los
   enlaces de antes sigan funcionando: lleva allá con el mismo
   periodo, la misma categoría y, si venía a anotar uno, con el
   formulario abierto.
   ══════════════════════════════════════════════════════════════ */

export default function ExpensesPage() {
    // useSearchParams necesita su propio Suspense en el App Router
    return (
        <Suspense fallback={null}>
            <AGastos />
        </Suspense>
    )
}

function AGastos() {
    const router = useRouter()
    const params = useSearchParams()

    useEffect(() => {
        const p = periodoDeDireccion(params)
        const destino = new URLSearchParams()
        // Antes "Todo" era "all"; en Movimientos es "total"
        const periodo = params.get('periodo') === 'all' ? 'total' : p?.periodo ?? 'month'
        destino.set('periodo', periodo)
        if (p?.periodo === 'custom') { destino.set('desde', p.desde); destino.set('hasta', p.hasta) }
        destino.set('tipo', 'gastos')
        const categoria = params.get('categoria')?.trim()
        if (categoria) destino.set('categoria', categoria)
        if (params.get('nuevo') === '1') destino.set('nuevo', 'gasto')
        router.replace(`/movimientos?${destino.toString()}`)
    }, [params, router])

    return null
}
