'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PackageMinus, X, Search, Package, AlertCircle } from 'lucide-react'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { Field, CategoryPicker } from '@/components/ui'

const SPRING_SOFT = { type: 'spring' as const, stiffness: 240, damping: 26 }
const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
const EASE_OUT_EXPO: [number, number, number, number] = [0.4, 0, 0.2, 1]

const REASONS = [
    { id: 'damage', name: 'Daño / Avería' },
    { id: 'loss', name: 'Pérdida' },
    { id: 'theft', name: 'Robo' },
    { id: 'expired', name: 'Vencimiento' },
    { id: 'other', name: 'Otro' },
]

interface AdjustInventoryModalProps {
    storeId: string
    onClose: () => void
    onSuccess: () => void
}

export function AdjustInventoryModal({ storeId, onClose, onSuccess }: AdjustInventoryModalProps) {
    const supabase = createClient()
    const [isVisible, setIsVisible] = useState(true)
    const [step, setStep] = useState<1 | 2>(1)

    const [products, setProducts] = useState<Product[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [loadingProducts, setLoadingProducts] = useState(true)
    const [searchFocused, setSearchFocused] = useState(false)

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
                .gt('stock', 0)
                .order('name')

            if (data) setProducts(data)
            setLoadingProducts(false)
        }
        fetchProducts()
    }, [supabase, storeId])

    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.reference && p.reference.toLowerCase().includes(searchQuery.toLowerCase()))
    ).slice(0, 10)

    function handleClose() {
        setIsVisible(false)
        setTimeout(onClose, 320)
    }

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
            handleClose()
        } catch (e: any) {
            console.error(e)
            toast.error(e.message || 'Error al ajustar inventario')
            setSaving(false)
        }
    }

    const exceedsStock = Number(quantity) > (selectedProduct?.stock || 0)
    const canSubmit = !saving && !!quantity && Number(quantity) > 0 && !exceedsStock

    return (
        <AnimatePresence>
            {isVisible && (
                <div
                    className="fixed inset-0 z-50 flex items-end"
                    onClick={handleClose}>

                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                        }}
                    />

                    {/* Bottom sheet */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 280 }}
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            width: '100%',
                            maxHeight: '90vh',
                            background: 'var(--toul-surface-overlay)',
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                            borderTopLeftRadius: 28,
                            borderTopRightRadius: 28,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
                            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                        }}>

                        {/* Drag handle */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            paddingTop: 12,
                        }}>
                            <div style={{
                                width: 36,
                                height: 4,
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.18)',
                            }} />
                        </div>

                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px 14px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 32, height: 32,
                                    borderRadius: 9,
                                    background: 'rgba(255,69,58,0.12)',
                                    border: '1px solid rgba(255,69,58,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <PackageMinus size={14} color="var(--toul-error)" strokeWidth={2} />
                                </div>
                                <span style={{
                                    fontSize: 17,
                                    fontWeight: 600,
                                    color: 'var(--toul-text)',
                                    letterSpacing: '-0.02em',
                                }}>
                                    Ajuste de inventario
                                </span>
                            </div>
                            <motion.button
                                onClick={handleClose}
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                style={{
                                    width: 32, height: 32,
                                    borderRadius: 10,
                                    background: 'rgba(255,255,255,0.07)',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                <X size={14} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
                            </motion.button>
                        </div>

                        {/* Body */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '18px 18px 16px',
                        }}>
                            {step === 1 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                    <p style={{
                                        fontSize: 14,
                                        color: 'var(--toul-text-muted)',
                                        margin: 0,
                                        lineHeight: 1.45,
                                    }}>
                                        Selecciona el producto del que deseas descontar unidades.
                                    </p>

                                    {/* Search input — active container pattern */}
                                    <div style={{
                                        position: 'relative',
                                        borderRadius: 14,
                                        background: searchFocused ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                        border: `1px solid ${searchFocused ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                        transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                    }}>
                                        <Search
                                            size={16}
                                            style={{
                                                position: 'absolute',
                                                left: 14,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                color: searchFocused ? 'var(--toul-accent)' : 'rgba(255,255,255,0.4)',
                                                transition: 'color var(--toul-transition)',
                                                pointerEvents: 'none',
                                            }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="Buscar producto con stock..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            onFocus={() => setSearchFocused(true)}
                                            onBlur={() => setSearchFocused(false)}
                                            style={{
                                                width: '100%',
                                                background: 'transparent',
                                                border: 'none',
                                                outline: 'none',
                                                padding: '14px 16px 14px 40px',
                                                fontSize: 15,
                                                color: 'var(--toul-text)',
                                                fontFamily: 'inherit',
                                            }}
                                        />
                                    </div>

                                    {loadingProducts ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {[1, 2, 3].map(i => (
                                                <div
                                                    key={i}
                                                    className="skeleton"
                                                    style={{ height: 64, borderRadius: 14 }}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {filteredProducts.map(product => (
                                                <motion.button
                                                    key={product.id}
                                                    onClick={() => {
                                                        setSelectedProduct(product)
                                                        setStep(2)
                                                    }}
                                                    whileTap={{ scale: 0.98 }}
                                                    transition={SPRING_PRESS}
                                                    style={{
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        padding: 12,
                                                        borderRadius: 14,
                                                        background: 'var(--toul-surface)',
                                                        border: '1px solid var(--toul-border)',
                                                        cursor: 'pointer',
                                                        fontFamily: 'inherit',
                                                    }}>
                                                    <div style={{
                                                        width: 40, height: 40,
                                                        borderRadius: 10,
                                                        background: 'rgba(255,255,255,0.05)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0,
                                                        overflow: 'hidden',
                                                    }}>
                                                        {product.image_url
                                                            ? <img src={product.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            : <Package size={16} color="rgba(255,255,255,0.4)" />
                                                        }
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{
                                                            fontSize: 14,
                                                            fontWeight: 600,
                                                            color: 'var(--toul-text)',
                                                            margin: 0,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            letterSpacing: '-0.01em',
                                                        }}>
                                                            {product.name}
                                                        </p>
                                                        <p style={{
                                                            fontSize: 12,
                                                            color: 'var(--toul-accent)',
                                                            margin: '2px 0 0',
                                                            fontWeight: 500,
                                                            fontVariantNumeric: 'tabular-nums',
                                                        }}>
                                                            Stock disponible: {Math.round(product.stock)}
                                                        </p>
                                                    </div>
                                                </motion.button>
                                            ))}
                                            {filteredProducts.length === 0 && (
                                                <div style={{
                                                    textAlign: 'center',
                                                    padding: '32px 16px',
                                                    fontSize: 14,
                                                    color: 'var(--toul-text-subtle)',
                                                }}>
                                                    No se encontraron productos con stock.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={SPRING_SOFT}
                                    style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                                    {/* Selected product summary */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: 14,
                                        borderRadius: 14,
                                        background: 'var(--toul-surface)',
                                        border: '1px solid var(--toul-border)',
                                    }}>
                                        <div style={{
                                            width: 40, height: 40,
                                            borderRadius: 10,
                                            background: 'rgba(255,255,255,0.05)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                            overflow: 'hidden',
                                        }}>
                                            {selectedProduct?.image_url
                                                ? <img src={selectedProduct.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                : <Package size={16} color="rgba(255,255,255,0.4)" />
                                            }
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{
                                                fontSize: 10,
                                                fontWeight: 600,
                                                color: 'var(--toul-text-dim)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.1em',
                                                margin: 0,
                                            }}>
                                                Paso 2 de 2
                                            </p>
                                            <p style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                color: 'var(--toul-text)',
                                                margin: '3px 0 0',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                letterSpacing: '-0.01em',
                                            }}>
                                                {selectedProduct?.name}
                                            </p>
                                        </div>
                                        <motion.button
                                            onClick={() => setStep(1)}
                                            whileTap={{ scale: 0.95 }}
                                            transition={SPRING_PRESS}
                                            style={{
                                                background: 'rgba(255,255,255,0.07)',
                                                color: 'var(--toul-text)',
                                                border: 'none',
                                                borderRadius: 10,
                                                padding: '7px 12px',
                                                fontSize: 12,
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                            }}>
                                            Cambiar
                                        </motion.button>
                                    </div>

                                    {/* Quantity field */}
                                    <Field
                                        label="Cantidad a reducir"
                                        required
                                        type="text"
                                        inputMode="numeric"
                                        value={quantity}
                                        onChange={setQuantity}
                                        placeholder={`Máx ${selectedProduct?.stock || 0}`}
                                    />
                                    {exceedsStock && (
                                        <p style={{
                                            fontSize: 12,
                                            color: 'var(--toul-error)',
                                            margin: '-6px 0 0 4px',
                                            fontWeight: 500,
                                        }}>
                                            Supera el stock actual ({Math.round(selectedProduct?.stock || 0)})
                                        </p>
                                    )}

                                    {/* Reason picker */}
                                    <CategoryPicker
                                        items={REASONS}
                                        value={reason}
                                        onChange={setReason}
                                        label="Razón"
                                        required
                                    />

                                    {/* Notes */}
                                    <Field
                                        label="Notas"
                                        hint="opcional"
                                        value={notes}
                                        onChange={setNotes}
                                        placeholder="Detalles adicionales sobre el ajuste..."
                                    />

                                    {/* Warning */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 10,
                                        padding: '12px 14px',
                                        borderRadius: 12,
                                        background: 'rgba(255,69,58,0.08)',
                                        border: '1px solid rgba(255,69,58,0.2)',
                                    }}>
                                        <AlertCircle
                                            size={14}
                                            color="var(--toul-error)"
                                            strokeWidth={2.2}
                                            style={{ marginTop: 2, flexShrink: 0 }}
                                        />
                                        <p style={{
                                            fontSize: 12,
                                            color: 'var(--toul-error)',
                                            margin: 0,
                                            lineHeight: 1.45,
                                        }}>
                                            Esta acción descontará el stock inmediatamente y no puede deshacerse. Asegúrate de los datos.
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Footer — confirm button (only step 2) */}
                        {step === 2 && (
                            <div style={{
                                padding: '12px 18px 16px',
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <motion.button
                                    onClick={handleConfirm}
                                    disabled={!canSubmit}
                                    whileTap={canSubmit ? { scale: 0.97 } : undefined}
                                    transition={SPRING_PRESS}
                                    style={{
                                        width: '100%',
                                        height: 54,
                                        borderRadius: 16,
                                        border: 'none',
                                        background: canSubmit ? 'var(--toul-error)' : 'rgba(255,255,255,0.07)',
                                        color: canSubmit ? '#fff' : 'rgba(255,255,255,0.2)',
                                        fontSize: 16,
                                        fontWeight: 600,
                                        letterSpacing: '-0.01em',
                                        cursor: canSubmit ? 'pointer' : 'not-allowed',
                                        boxShadow: canSubmit ? '0 4px 24px rgba(255,69,58,0.25)' : 'none',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        fontFamily: 'inherit',
                                    }}>
                                    {saving ? 'Registrando...' : 'Confirmar ajuste'}
                                </motion.button>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
