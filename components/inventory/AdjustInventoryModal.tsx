'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageMinus, X, Search, Package, AlertCircle } from 'lucide-react'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

interface AdjustInventoryModalProps {
    storeId: string
    onClose: () => void
    onSuccess: () => void
}

export function AdjustInventoryModal({ storeId, onClose, onSuccess }: AdjustInventoryModalProps) {
    const supabase = createClient()
    const [step, setStep] = useState<1 | 2>(1)

    // Step 1
    const [products, setProducts] = useState<Product[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [loadingProducts, setLoadingProducts] = useState(true)

    // Step 2
    const [quantity, setQuantity] = useState('')
    const [reason, setReason] = useState('damage')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function fetchProducts() {
            const { data } = await supabase
                .from('products')
                .select('*')
                .eq('store_id', storeId)
                .gt('stock', 0) // Only products with stock
                .order('name')

            if (data) setProducts(data)
            setLoadingProducts(false)
        }
        fetchProducts()
    }, [supabase, storeId])

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.reference && p.reference.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 10)

    const handleConfirm = async () => {
        if (!selectedProduct) return
        const qtyToReduce = Number(quantity)
        if (qtyToReduce <= 0 || qtyToReduce > selectedProduct.stock) {
            toast.error('Cantidad inválida')
            return
        }

        setSaving(true)
        try {
            const response = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productId: selectedProduct.id,
                    quantity: qtyToReduce,
                    reason,
                    notes: notes.trim()
                })
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Error al ajustar inventario')

            toast.success('Inventario ajustado correctamente')
            onSuccess()
            onClose()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al ajustar inventario')
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="w-full max-w-md bg-white dark:bg-[#111] rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between sticky top-0 bg-white/80 dark:bg-[#111]/80 backdrop-blur-md z-10"
                    style={{ borderColor: 'var(--toul-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                            <PackageMinus size={16} />
                        </div>
                        <h2 className="font-bold text-lg" style={{ color: 'var(--toul-text)' }}>Ajuste de Inventario</h2>
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800" style={{ color: 'var(--toul-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto">
                    {step === 1 ? (
                        <div className="space-y-4">
                            <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Selecciona el producto del que deseas descontar unidades.</p>

                            <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2" size={18} style={{ color: 'var(--toul-text-muted)' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar producto con stock..."
                                    className="toul-input w-full pl-10"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {loadingProducts ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredProducts.map(product => (
                                        <button key={product.id}
                                            onClick={() => {
                                                setSelectedProduct(product)
                                                setStep(2)
                                            }}
                                            className="w-full p-3 text-left flex items-center gap-3 rounded-xl transition-all active:scale-[0.98] border border-transparent hover:border-gray-200 dark:hover:border-gray-800"
                                            style={{ background: 'var(--toul-surface-2)' }}>
                                            <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                                {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                                <p className="text-xs truncate font-medium" style={{ color: 'var(--toul-accent)' }}>Stock disponible: {product.stock}</p>
                                            </div>
                                        </button>
                                    ))}
                                    {filteredProducts.length === 0 && (
                                        <div className="text-center py-6 text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                                            No se encontraron productos con stock.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Selected Product Card */}
                            <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'var(--toul-surface-2)' }}>
                                <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                    {selectedProduct?.image_url ? <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" /> : <Package size={16} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Paso 2 de 2</p>
                                    <p className="font-bold text-sm truncate" style={{ color: 'var(--toul-text)' }}>{selectedProduct?.name}</p>
                                </div>
                                <button onClick={() => setStep(1)} className="text-xs font-bold underline" style={{ color: 'var(--toul-text-muted)' }}>Cambiar</button>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                        Cantidad a reducir <span style={{ color: 'var(--toul-error)' }}>*</span>
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max={selectedProduct?.stock}
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        className="toul-input w-full"
                                        placeholder={`Max: ${selectedProduct?.stock}`}
                                    />
                                    {Number(quantity) > (selectedProduct?.stock || 0) && (
                                        <p className="text-xs mt-1" style={{ color: 'var(--toul-error)' }}>Supera el stock actual ({selectedProduct?.stock})</p>
                                    )}
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                        Razón <span style={{ color: 'var(--toul-error)' }}>*</span>
                                    </label>
                                    <select
                                        className="toul-input w-full"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                    >
                                        <option value="damage">Daño / Avería</option>
                                        <option value="loss">Pérdida</option>
                                        <option value="theft">Robo</option>
                                        <option value="expired">Vencimiento</option>
                                        <option value="other">Otro</option>
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                        Notas <span className="font-normal text-xs" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                                    </label>
                                    <textarea
                                        className="toul-input w-full resize-none"
                                        rows={2}
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Detalles adicionales sobre el ajuste..."
                                    />
                                </div>
                            </div>

                            <div className="p-3 rounded-xl flex items-start gap-2 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--toul-error)' }}>
                                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                                <p>Esta acción descontará el stock inmediatamente y no puede deshacerse. Asegúrate de los datos.</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step === 2 && (
                    <div className="p-4 border-t bg-gray-50 dark:bg-gray-900/50" style={{ borderColor: 'var(--toul-border)' }}>
                        <button
                            disabled={saving || !quantity || Number(quantity) <= 0 || Number(quantity) > (selectedProduct?.stock || 0)}
                            onClick={handleConfirm}
                            className="toul-btn-primary w-full flex items-center justify-center gap-2"
                            style={{ background: 'var(--toul-error)', boxShadow: '0 4px 16px rgba(239,68,68,0.3)' }}>
                            {saving ? 'Registrando...' : 'Confirmar Ajuste'}
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    )
}
