// ─── Modo isla: tipos compartidos ─────────────────────────────

export type MemberRole = 'admin' | 'seller'

export interface SessionContext {
    userId: string
    storeId: string
    storeName: string
    role: MemberRole
    displayName: string
}

export interface CashSession {
    id: string
    store_id: string
    status: 'open' | 'closed'
    opened_by: string
    opened_by_name: string | null
    opened_at: string
    opening_cash: number
    closed_by: string | null
    closed_by_name: string | null
    closed_at: string | null
    counted_cash: number | null
    expected_cash: number | null
    difference: number | null
    notes: string | null
}

export interface CashSessionSummary {
    openingCash: number
    expectedCash: number
    byMethod: { method: string; isCash: boolean; net: number }[]
    salesCount: number
    salesTotal: number
    discountTotal: number
    discountCount: number
    creditCount: number
    voidCount: number
    voidTotal: number
    countedCash?: number
    difference?: number
}

export type ApprovalType = 'void_sale' | 'credit_sale'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'used' | 'cancelled' | 'expired'

export interface ApprovalRequest {
    id: string
    store_id: string
    type: ApprovalType
    status: ApprovalStatus
    requested_by: string
    requested_by_name: string | null
    requested_at: string
    sale_id: string | null
    amount: number | null
    reason: string | null
    details: {
        customerName?: string
        dueDate?: string
        initialPayment?: number
        items?: { name: string; quantity: number }[]
        saleSummary?: string
    }
    resolved_by_name: string | null
    resolved_at: string | null
    resolution_note: string | null
}

export interface SaleVoid {
    id: string
    sale_id: string
    sale_created_at: string | null
    total: number
    refunded: number
    reason: string | null
    seller_name: string | null
    requested_by_name: string | null
    approved_by_name: string | null
    voided_at: string
    snapshot: {
        items: { name: string; variantName: string | null; quantity: number; unitPrice: number }[]
        payments: { method: string | null; amount: number }[]
    }
}

export interface ReceiptData {
    saleId: string
    createdAt: string
    storeName: string
    nit?: string | null
    address?: string | null
    phone?: string | null
    footer?: string | null
    sellerName?: string | null
    customerName?: string | null
    items: { name: string; quantity: number; unitPrice: number }[]
    subtotal: number
    discount: number
    total: number
    payments: { method: string; amount: number }[]
    isCredit: boolean
    initialPayment?: number
}
