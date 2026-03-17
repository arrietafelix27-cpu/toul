export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
    public: {
        Tables: {
            stores: {
                Row: {
                    id: string
                    owner_id: string
                    name: string
                    category: string
                    currency: string
                    logo_url: string | null
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['stores']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['stores']['Insert']>
            }
            products: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    reference: string | null
                    description: string | null
                    sale_price: number
                    cost_price: number
                    cpp: number
                    average_cost: number
                    category: string | null
                    stock: number
                    low_stock_threshold: number | null
                    image_url: string | null
                    images: string[]
                    is_active: boolean
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['products']['Insert']>
            }
            inventory_batches: {
                Row: {
                    id: string
                    store_id: string
                    product_id: string
                    quantity: number
                    unit_cost: number
                    supplier: string | null
                    notes: string | null
                    created_at: string
                }
            }
            sales: {
                Row: {
                    id: string
                    store_id: string
                    customer_id: string | null
                    customer_name: string | null
                    customer_phone: string | null
                    subtotal: number
                    discount: number
                    total: number
                    payment_method: string // legacy field kept for backward compat
                    is_credit: boolean
                    initial_payment: number
                    notes: string | null
                    created_at: string
                }
            }
            sale_items: {
                Row: {
                    id: string
                    store_id: string
                    sale_id: string
                    product_id: string
                    quantity: number
                    unit_price: number
                    unit_cost: number
                    subtotal: number
                }
            }
            sale_payments: {
                Row: {
                    id: string
                    sale_id: string
                    store_id: string
                    method_id: string
                    amount: number
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['sale_payments']['Row'], 'id' | 'created_at'>
            }
            payment_methods: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    color: string
                    sort_order: number
                    is_active: boolean
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['payment_methods']['Row'], 'id' | 'created_at'>
                Update: Partial<Database['public']['Tables']['payment_methods']['Insert']>
            }
            payments: {
                Row: {
                    id: string
                    store_id: string
                    type: 'sale' | 'expense' | 'transfer_in' | 'transfer_out' | 'credit_payment'
                    method: string
                    amount: number
                    reference_id: string | null
                    notes: string | null
                    created_at: string
                }
            }
            expenses: {
                Row: {
                    id: string
                    store_id: string
                    category: string
                    description: string | null
                    amount: number
                    payment_method: string
                    receipt_url: string | null
                    created_at: string
                }
            }
            customers: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    phone: string | null
                    notes: string | null
                    total_debt: number
                    created_at: string
                }
            }
            credits: {
                Row: {
                    id: string
                    store_id: string
                    customer_id: string
                    sale_id: string | null
                    type: 'debt' | 'payment'
                    amount: number
                    payment_method: string | null
                    notes: string | null
                    created_at: string
                }
            }
            ai_insights: {
                Row: {
                    id: string
                    store_id: string
                    insights: Json
                    generated_at: string
                }
            }
            providers: {
                Row: {
                    id: string
                    store_id: string
                    name: string
                    phone: string | null
                    notes: string | null
                    total_debt: number
                    created_at: string
                    updated_at: string
                }
                Insert: Omit<Database['public']['Tables']['providers']['Row'], 'id' | 'created_at' | 'updated_at'>
                Update: Partial<Database['public']['Tables']['providers']['Insert']>
            }
            purchases: {
                Row: {
                    id: string
                    store_id: string
                    provider_id: string | null
                    subtotal: number
                    total: number
                    initial_payment: number
                    is_credit: boolean
                    due_date: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['purchases']['Row'], 'id' | 'created_at'>
                Update: Partial<Database['public']['Tables']['purchases']['Insert']>
            }
            purchase_items: {
                Row: {
                    id: string
                    store_id: string
                    purchase_id: string
                    product_id: string
                    quantity: number
                    unit_cost: number
                    subtotal: number
                }
                Insert: Omit<Database['public']['Tables']['purchase_items']['Row'], 'id'>
            }
            purchase_payments: {
                Row: {
                    id: string
                    purchase_id: string
                    store_id: string
                    method_id: string
                    amount: number
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['purchase_payments']['Row'], 'id' | 'created_at'>
            }
            provider_debts: {
                Row: {
                    id: string
                    store_id: string
                    provider_id: string
                    purchase_id: string | null
                    type: 'cargo' | 'abono'
                    amount: number
                    payment_method_id: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['provider_debts']['Row'], 'id' | 'created_at'>
            }
            inventory_adjustments: {
                Row: {
                    id: string
                    store_id: string
                    product_id: string
                    quantity: number
                    reason: string
                    notes: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['inventory_adjustments']['Row'], 'id' | 'created_at'>
            }
            owner_capital_injections: {
                Row: {
                    id: string
                    store_id: string
                    amount: number
                    reason: string
                    reference_id: string | null
                    notes: string | null
                    created_at: string
                }
                Insert: Omit<Database['public']['Tables']['owner_capital_injections']['Row'], 'id' | 'created_at'>
            }
        }
    }
}

export type Store = Database['public']['Tables']['stores']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type SaleItem = Database['public']['Tables']['sale_items']['Row']
export type SalePayment = Database['public']['Tables']['sale_payments']['Row']
export type PaymentMethodConfig = Database['public']['Tables']['payment_methods']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type Expense = Database['public']['Tables']['expenses']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Credit = Database['public']['Tables']['credits']['Row']
export type InventoryBatch = Database['public']['Tables']['inventory_batches']['Row']
export type Provider = Database['public']['Tables']['providers']['Row']
export type Purchase = Database['public']['Tables']['purchases']['Row']
export type PurchaseItem = Database['public']['Tables']['purchase_items']['Row']
export type PurchasePayment = Database['public']['Tables']['purchase_payments']['Row']
export type ProviderDebt = Database['public']['Tables']['provider_debts']['Row']
export type InventoryAdjustment = Database['public']['Tables']['inventory_adjustments']['Row']
export type OwnerCapitalInjection = Database['public']['Tables']['owner_capital_injections']['Row']

// Default payment methods for store seeding
export const DEFAULT_PAYMENT_METHODS: Array<{ name: string; color: string; sort_order: number }> = [
    { name: 'Efectivo', color: '#10B981', sort_order: 0 },
    { name: 'Nequi', color: '#A855F7', sort_order: 1 },
    { name: 'Bancolombia', color: '#F59E0B', sort_order: 2 },
    { name: 'Daviplata', color: '#EF4444', sort_order: 3 },
]

export const EXPENSE_CATEGORIES = [
    { value: 'publicidad', label: 'Publicidad' },
    { value: 'transporte', label: 'Transporte' },
    { value: 'compras', label: 'Compras' },
    { value: 'servicios', label: 'Servicios' },
    { value: 'otros', label: 'Otros' },
]

export interface AIInsight {
    id: string
    type: 'star_product' | 'low_rotation' | 'low_stock' | 'trapped_capital' | 'best_day' | 'sales_goal'
    title: string
    context: string
    explanation: string
    suggestion: string
    icon: string
}

export interface CartItem {
    product: Product
    quantity: number
}

// Cart payment split entry
export interface PaymentSplit {
    methodId: string
    methodName: string
    methodColor: string
    amount: number
}

// ─── Legacy compatibility (used by expenses, customers, ventas pages) ─────────
export type PaymentMethod = 'efectivo' | 'nequi' | 'bancolombia' | 'daviplata' | 'capital'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; color: string }[] = [
    { value: 'efectivo', label: 'Efectivo', color: '#10B981' },
    { value: 'nequi', label: 'Nequi', color: '#A855F7' },
    { value: 'bancolombia', label: 'Bancolombia', color: '#F59E0B' },
    { value: 'daviplata', label: 'Daviplata', color: '#EF4444' },
    { value: 'capital', label: 'Capital Propio', color: '#6366F1' },
]

