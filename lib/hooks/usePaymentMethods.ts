'use client'

import useSWR from 'swr'
import type { PaymentMethodConfig } from '@/lib/types'

/**
 * Métodos de pago configurados por el negocio.
 * Regla del proyecto: nunca se usan métodos fijos en el código —
 * si el usuario crea "Datáfono", tiene que aparecer en todos lados.
 */
export function usePaymentMethods() {
    const { data, isLoading } = useSWR<PaymentMethodConfig[]>('payment-methods-list', async () => {
        const res = await fetch('/api/payment-methods')
        const json = await res.json()
        return json.methods ?? []
    }, { revalidateOnFocus: false, dedupingInterval: 60_000 })

    const methods = data ?? []

    /** Nombre bonito a partir de lo guardado en la venta o el gasto. */
    const labelFor = (raw: string | null | undefined) => {
        if (!raw) return 'Pago'
        const match = methods.find(m => m.name.toLowerCase() === raw.toLowerCase())
        return match?.name ?? raw.charAt(0).toUpperCase() + raw.slice(1)
    }

    return { methods, labelFor, isLoading }
}
