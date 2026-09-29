import type { CartItem, PaymentSplit } from '@/lib/types'

/** Foto de la venta recién hecha: lo que se muestra en la confirmación y en la tirilla. */
export interface SaleSnapshot {
    items: CartItem[]
    discount: number
    total: number
    subtotal?: number
    payments: PaymentSplit[]
    isCredit: boolean
    customerName: string | null
}
