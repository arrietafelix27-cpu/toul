'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, X, Check, Loader2, Pencil } from 'lucide-react'
import Link from 'next/link'
import type { Product, ProductCategory } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { Field, PriceField, CategoryPicker, SPRING_PRESS, EASE_OUT_EXPO } from '@/components/ui'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

const DOT_COLORS = ['#a78bfa', '#60a5fa', '#4ade80', '#fbbf24', '#f472b6', '#34d399']

type Variant = { id: string; name: string; sale_price: number; cpp: number; cost_price: number }

async function compressImage(file: File, maxWidthPx = 1200): Promise<File> {
    return new Promise(resolve => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            const canvas = document.createElement('canvas')
            const ratio = Math.min(1, maxWidthPx / img.width)
            canvas.width = img.width * ratio
            canvas.height = img.height * ratio
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
            canvas.toBlob(blob => {
                URL.revokeObjectURL(url)
                resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file)
            }, 'image/jpeg', 0.82)
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
        img.src = url
    })
}

// ─────────────────────────────────────────────────
// Variant inputs (compact, active container pattern)
// ─────────────────────────────────────────────────

function VariantPriceInput({
    value, onChange, prefix = '$',
}: {
    value: string
    onChange: (v: string) => void
    prefix?: string
}) {
    const [focused, setFocused] = useState(false)
    return (
        <div style={{
            position: 'relative',
            borderRadius: 10,
            background: focused ? 'rgba(50,215,75,0.05)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${focused ? 'rgba(50,215,75,0.3)' : 'rgba(255,255,255,0.07)'}`,
            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
        }}>
            <div style={{ padding: '8px 10px' }}>
                <div style={{
                    fontSize: 9, fontWeight: 600,
                    color: focused ? '#32d74b' : 'rgba(255,255,255,0.38)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    transition: 'color var(--toul-transition)',
                }}>
                    VENTA <span style={{ color: '#32d74b' }}>·</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
                    <span style={{
                        fontSize: 12,
                        color: focused ? '#32d74b' : 'rgba(255,255,255,0.3)',
                        fontWeight: 500,
                        transition: 'color var(--toul-transition)',
                    }}>
                        {prefix}
                    </span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={100}
                        placeholder="0"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            padding: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            color: '#fff',
                            fontVariantNumeric: 'tabular-nums',
                            letterSpacing: '-0.01em',
                            fontFamily: 'inherit',
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

function VariantReadOnlyInput({ value, label }: { value: string; label: string }) {
    return (
        <div style={{
            borderRadius: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
            padding: '8px 10px',
            opacity: 0.5,
            pointerEvents: 'none',
            userSelect: 'none',
        }}>
            <div style={{
                fontSize: 9, fontWeight: 600,
                color: 'rgba(255,255,255,0.38)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
            }}>
                {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginTop: 2 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>$</span>
                <span style={{
                    fontSize: 14, fontWeight: 600, color: '#fff',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                }}>
                    {value || '0'}
                </span>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [product, setProduct] = useState<Product | null>(null)
    const [categories, setCategories] = useState<ProductCategory[]>([])
    const [variants, setVariants] = useState<Variant[]>([])

    // Simple form fields
    const [name, setName] = useState('')
    const [reference, setReference] = useState('')
    const [salePrice, setSalePrice] = useState('')
    const [categoryId, setCategoryId] = useState('')

    // Image (single)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null)

    // Variant prices (per variantId)
    const [variantPrices, setVariantPrices] = useState<Record<string, string>>({})
    const [variantOriginal, setVariantOriginal] = useState<Record<string, number>>({})

    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [sheetOpen, setSheetOpen] = useState(false)
    const [notFound, setNotFound] = useState(false)

    // ─── Load ─────────────────────────────────────
    const loadProduct = useCallback(async () => {
        const { data: prod } = await supabase
            .from('products')
            .select('*, category:product_categories(id, name)')
            .eq('id', id)
            .single()
        if (!prod) { setNotFound(true); setLoading(false); return }
        setProduct(prod as Product)

        setName(prod.name)
        setReference(prod.reference || '')
        setSalePrice(String(Math.round(prod.sale_price || 0)))
        setCategoryId(prod.category_id || '')

        const firstImage = (prod.images && prod.images.length > 0) ? prod.images[0] : (prod.image_url || null)
        setOriginalImageUrl(firstImage)
        setImagePreview(firstImage)

        // Variants
        const { data: vs } = await supabase
            .from('product_variants')
            .select('id, name, sale_price, cpp, cost_price')
            .eq('product_id', id)
            .eq('is_active', true)
            .order('name')

        if (vs && vs.length > 0) {
            setVariants(vs as Variant[])
            const prices: Record<string, string> = {}
            const origs: Record<string, number> = {}
            for (const v of vs as Variant[]) {
                prices[v.id] = String(Math.round(v.sale_price || 0))
                origs[v.id] = Math.round(v.sale_price || 0)
            }
            setVariantPrices(prices)
            setVariantOriginal(origs)
        }

        setLoading(false)
    }, [id])

    useEffect(() => { loadProduct() }, [loadProduct])

    useEffect(() => {
        const loadCats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return
            const { data } = await supabase
                .from('product_categories')
                .select('*')
                .eq('store_id', store.id)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })
            if (data) setCategories(data)
        }
        loadCats()
    }, [supabase])

    const hasVariants = variants.length > 0

    // ─── Derived (simple mode) ────────────────────
    const cpp = Math.round(product?.cpp || 0)
    const salePriceNum = Number(salePrice) || 0
    const showProfit = salePriceNum > 0 && cpp > 0
    const profit = showProfit ? salePriceNum - cpp : 0
    const margin = showProfit ? Math.round((profit / salePriceNum) * 100) : null
    const marginColor =
        margin === null ? 'rgba(255,255,255,0.4)' :
            margin > 35 ? '#32d74b' :
                margin > 15 ? '#ffd60a' :
                    '#ff453a'

    // ─── Dirty detection ──────────────────────────
    const simpleDirty = useMemo(() => {
        if (!product) return false
        return (
            name.trim() !== product.name ||
            reference.trim() !== (product.reference || '') ||
            Number(salePrice) !== Math.round(product.sale_price || 0) ||
            categoryId !== (product.category_id || '') ||
            imageFile !== null
        )
    }, [name, reference, salePrice, categoryId, imageFile, product])

    const variantsDirty = useMemo(() => {
        return variants.some(v => Number(variantPrices[v.id]) !== variantOriginal[v.id])
    }, [variants, variantPrices, variantOriginal])

    const isDirty = hasVariants ? variantsDirty : simpleDirty

    // ─── Handlers ─────────────────────────────────
    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > MAX_FILE_SIZE) { toast.error(`"${file.name}" supera los 20MB`); return }
        setImageFile(file)
        const reader = new FileReader()
        reader.onload = ev => setImagePreview(ev.target?.result as string)
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    async function uploadImage(storeId: string, file: File): Promise<string | null> {
        const compressed = file.size > 2 * 1024 * 1024 ? await compressImage(file) : file
        const path = `${storeId}/${Date.now()}.jpg`
        const { error } = await supabase.storage.from('product-images').upload(path, compressed, { upsert: false, contentType: 'image/jpeg' })
        if (error) {
            console.error('Upload error:', error)
            toast.error(`Error subiendo imagen: ${error.message}`)
            return null
        }
        return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
    }

    async function handleSaveSimple() {
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        if (!salePrice || salePriceNum <= 0) { toast.error('Ingresa un precio de venta válido'); return }

        setSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setSaving(false); toast.error('Tienda no encontrada'); return }

        let imageUrl = originalImageUrl
        if (imageFile) {
            imageUrl = await uploadImage(store.id, imageFile)
        }

        const updates: Record<string, unknown> = {
            name: name.trim(),
            reference: reference.trim() || null,
            category_id: categoryId || null,
            sale_price: salePriceNum,
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
        }

        const { error } = await supabase.from('products').update(updates).eq('id', id)
        if (error) {
            toast.error('Error al guardar: ' + error.message)
            setSaving(false)
            return
        }

        toast.success('Producto actualizado')
        router.push(`/products/${id}`)
    }

    async function handleSaveVariants() {
        setSaving(true)
        const changed = variants.filter(v => Number(variantPrices[v.id]) !== variantOriginal[v.id])
        if (changed.length === 0) { setSaving(false); return }

        const results = await Promise.all(
            changed.map(v =>
                supabase.from('product_variants')
                    .update({ sale_price: Number(variantPrices[v.id]) })
                    .eq('id', v.id)
            )
        )
        const errs = results.filter(r => r.error)
        if (errs.length > 0) {
            toast.error(`Error en ${errs.length} variante${errs.length > 1 ? 's' : ''}`)
            setSaving(false)
            return
        }

        toast.success('Variantes actualizadas')
        router.push(`/products/variant-group/${id}`)
    }

    async function handleSheetSave(data: { name: string; reference: string; categoryId: string; imageFile: File | null; imagePreview: string | null; originalImageUrl: string | null }) {
        setSaving(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setSaving(false); toast.error('Tienda no encontrada'); return }

        let imageUrl = data.originalImageUrl
        if (data.imageFile) {
            imageUrl = await uploadImage(store.id, data.imageFile)
        } else if (data.imagePreview === null) {
            imageUrl = null
        }

        const updates: Record<string, unknown> = {
            name: data.name.trim(),
            reference: data.reference.trim() || null,
            category_id: data.categoryId || null,
            image_url: imageUrl,
            updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('products').update(updates).eq('id', id)
        setSaving(false)
        if (error) {
            toast.error('Error al guardar: ' + error.message)
            return
        }
        toast.success('Datos actualizados')
        setSheetOpen(false)
        await loadProduct()
    }

    // ─── Loading / Not found ──────────────────────
    if (loading) return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <div className="toul-ambient" />
            <div style={{ padding: '20px 18px', maxWidth: 520, margin: '0 auto' }}>
                <div className="skeleton" style={{ height: 30, borderRadius: 9, marginBottom: 24 }} />
                <div className="skeleton" style={{ height: 100, borderRadius: 14, marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 60, borderRadius: 12, marginBottom: 10 }} />
                <div className="skeleton" style={{ height: 60, borderRadius: 12 }} />
            </div>
        </div>
    )
    if (notFound || !product) return (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--toul-text-muted)' }}>
            Producto no encontrado
        </div>
    )

    // ─── Render ───────────────────────────────────
    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <div className="toul-ambient" />

            {/* ─── Sticky topbar ─── */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 20,
                background: 'rgba(10,10,10,0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    padding: '14px 18px 12px',
                    maxWidth: 520,
                    margin: '0 auto',
                    gap: 10,
                }}>
                    <div style={{ justifySelf: 'start' }}>
                        <Link href={hasVariants ? `/products/variant-group/${id}` : `/products/${id}`}
                            className="active:scale-90"
                            style={{
                                width: 30, height: 30, borderRadius: 9,
                                background: 'rgba(255,255,255,0.07)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'transform 0.15s var(--toul-ease)',
                            }}>
                            <ArrowLeft size={14} strokeWidth={2.2} color="rgba(255,255,255,0.8)" />
                        </Link>
                    </div>
                    <h1 style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--toul-text)',
                        letterSpacing: '-0.01em',
                        margin: 0,
                        textAlign: 'center',
                    }}>
                        Editar producto
                    </h1>
                    <div style={{ justifySelf: 'end' }}>
                        {/* Save button — only visible/active in SIMPLE mode */}
                        {!hasVariants && (
                            <motion.button
                                type="button"
                                onClick={handleSaveSimple}
                                disabled={!isDirty || saving}
                                whileTap={isDirty && !saving ? { scale: 0.97 } : undefined}
                                transition={SPRING_PRESS}
                                style={{
                                    height: 30,
                                    padding: '0 12px',
                                    borderRadius: 9,
                                    border: 'none',
                                    background: isDirty && !saving ? '#32d74b' : 'rgba(255,255,255,0.07)',
                                    color: isDirty && !saving ? '#000' : 'rgba(255,255,255,0.3)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '-0.01em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
                                    boxShadow: isDirty && !saving ? '0 4px 14px rgba(50,215,75,0.25)' : 'none',
                                    transition: 'background 0.2s var(--toul-ease), color 0.2s var(--toul-ease), box-shadow 0.2s var(--toul-ease)',
                                    fontFamily: 'inherit',
                                }}>
                                {saving ? (
                                    <>
                                        <Loader2 size={11} strokeWidth={2.6}
                                            style={{ animation: 'spin 0.7s linear infinite' }} />
                                        <span>Guardando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={12} strokeWidth={2.8} />
                                        <span>Guardar</span>
                                    </>
                                )}
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>

            {/* ─── Content ─── */}
            <div style={{
                position: 'relative',
                padding: '18px 18px 0',
                paddingBottom: hasVariants
                    ? 'calc(190px + env(safe-area-inset-bottom, 0px))'
                    : '40px',
                maxWidth: 520,
                margin: '0 auto',
            }}>
                {hasVariants ? (
                    <>
                        {/* Product header (readonly) */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.07)',
                                borderRadius: 14,
                                padding: 12,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                            }}>
                            <div style={{
                                width: 48, height: 48,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: 'rgba(255,255,255,0.05)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {imagePreview ? (
                                    <img src={imagePreview} alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <Camera size={18} color="rgba(255,255,255,0.3)" strokeWidth={1.6} />
                                )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{
                                    fontSize: 14, fontWeight: 600, color: '#fff',
                                    letterSpacing: '-0.01em',
                                    margin: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {product.name}
                                </p>
                                <p style={{
                                    fontSize: 11, color: 'rgba(255,255,255,0.35)',
                                    margin: '2px 0 0',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {[
                                        (product as Product & { category?: { name: string } | null }).category?.name,
                                        product.reference,
                                    ].filter(Boolean).join(' · ') || 'Sin categoría'}
                                </p>
                            </div>
                            <motion.button
                                type="button"
                                onClick={() => setSheetOpen(true)}
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                style={{
                                    width: 28, height: 28,
                                    borderRadius: 8,
                                    background: 'rgba(255,255,255,0.06)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                }}>
                                <Pencil size={13} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                            </motion.button>
                        </motion.div>

                        {/* Variants section */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT_EXPO }}>
                            <h2 style={{
                                fontSize: 11,
                                color: 'rgba(255,255,255,0.35)',
                                margin: '14px 0 8px',
                                fontWeight: 500,
                            }}>
                                Variantes — precio y costo
                            </h2>

                            <div>
                                {variants.map((v, idx) => {
                                    const dotColor = DOT_COLORS[idx % DOT_COLORS.length]
                                    const vSale = Number(variantPrices[v.id]) || 0
                                    const vCpp = Math.round(v.cpp || 0)
                                    const vShow = vSale > 0 && vCpp > 0
                                    const vMargin = vShow ? Math.round(((vSale - vCpp) / vSale) * 100) : null
                                    const vMarginColor =
                                        vMargin === null ? 'rgba(255,255,255,0.3)' :
                                            vMargin > 35 ? '#32d74b' :
                                                vMargin > 15 ? '#ffd60a' :
                                                    '#ff453a'

                                    return (
                                        <motion.div
                                            key={v.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.3, delay: 0.05 + idx * 0.03, ease: EASE_OUT_EXPO }}
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 14,
                                                padding: 12,
                                                marginBottom: 8,
                                            }}>
                                            {/* Header */}
                                            <div style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                marginBottom: 10,
                                            }}>
                                                <span style={{
                                                    width: 8, height: 8,
                                                    borderRadius: '50%',
                                                    background: dotColor,
                                                    flexShrink: 0,
                                                }} />
                                                <span style={{
                                                    fontSize: 13, fontWeight: 600,
                                                    color: '#fff',
                                                    letterSpacing: '-0.01em',
                                                    flex: 1,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {v.name}
                                                </span>
                                                <span style={{
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    color: vMarginColor,
                                                    fontVariantNumeric: 'tabular-nums',
                                                    letterSpacing: '0.01em',
                                                    flexShrink: 0,
                                                    transition: 'color 0.3s var(--toul-ease)',
                                                }}>
                                                    {vMargin === null ? '— margen' : `${vMargin}% margen`}
                                                </span>
                                            </div>

                                            {/* Inputs grid */}
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 1fr',
                                                gap: 6,
                                            }}>
                                                <VariantPriceInput
                                                    value={variantPrices[v.id] || ''}
                                                    onChange={vv => setVariantPrices(prev => ({ ...prev, [v.id]: vv }))}
                                                />
                                                <VariantReadOnlyInput
                                                    value={String(vCpp)}
                                                    label="COSTO PROM."
                                                />
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </>
                ) : (
                    <>
                        {/* ─── PHOTO (single full-width) ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                            onClick={() => fileRef.current?.click()}
                            style={{
                                width: '100%',
                                height: 100,
                                borderRadius: 14,
                                overflow: 'hidden',
                                position: 'relative',
                                background: imagePreview
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'rgba(255,255,255,0.04)',
                                cursor: 'pointer',
                                marginBottom: 14,
                            }}>
                            {imagePreview ? (
                                <img src={imagePreview} alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                                <div style={{
                                    width: '100%', height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Camera size={28} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                                </div>
                            )}
                            <motion.div
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                style={{
                                    position: 'absolute',
                                    bottom: 8, right: 8,
                                    width: 26, height: 26,
                                    borderRadius: 8,
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(6px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                <Camera size={13} color="#fff" strokeWidth={2} />
                            </motion.div>
                        </motion.div>

                        {/* ─── FIELDS ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT_EXPO }}
                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                            <Field
                                label="Nombre"
                                required
                                value={name}
                                onChange={setName}
                                placeholder="Ej. Perfume floral 100ml"
                                maxLength={100}
                            />
                            <Field
                                label="Referencia"
                                hint="opcional"
                                value={reference}
                                onChange={setReference}
                                placeholder="REF-001"
                                maxLength={50}
                            />

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                                <CategoryPicker
                                    items={categories}
                                    value={categoryId}
                                    onChange={setCategoryId}
                                    label="Categoría"
                                    emptyMessage="Sin categorías"
                                />
                            </div>
                        </motion.div>

                        {/* ─── DIVISOR ─── */}
                        <div style={{
                            height: 1,
                            background: 'rgba(255,255,255,0.06)',
                            margin: '12px 0',
                        }} />

                        {/* ─── PRECIOS ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.1, ease: EASE_OUT_EXPO }}>

                            <div style={{ display: 'flex', gap: 8 }}>
                                <PriceField
                                    label="Venta"
                                    required
                                    value={salePrice}
                                    onChange={setSalePrice}
                                />
                                {/* Costo promedio — read-only */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        opacity: 0.5,
                                        pointerEvents: 'none',
                                        userSelect: 'none',
                                    }}>
                                        <PriceField
                                            label="Costo promedio"
                                            value={cpp > 0 ? String(cpp) : ''}
                                            onChange={() => { }}
                                            disabled
                                        />
                                    </div>
                                    <p style={{
                                        fontSize: 10,
                                        color: 'rgba(255,255,255,0.25)',
                                        fontStyle: 'italic',
                                        margin: '4px 4px 0',
                                        letterSpacing: '0.01em',
                                    }}>
                                        Se actualiza al registrar compras en inventario
                                    </p>
                                </div>
                            </div>

                            {/* Profit card */}
                            <AnimatePresence>
                                {salePriceNum > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 4 }}
                                        transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                                        style={{
                                            marginTop: 12,
                                            padding: '10px 12px',
                                            borderRadius: 12,
                                            background: 'rgba(50,215,75,0.06)',
                                            border: '1px solid rgba(50,215,75,0.15)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                        }}>
                                        <div>
                                            <p style={{
                                                fontSize: 11,
                                                color: 'rgba(255,255,255,0.4)',
                                                margin: 0,
                                                fontWeight: 500,
                                            }}>
                                                Ganancia estimada
                                            </p>
                                            <p style={{
                                                fontSize: 10,
                                                color: 'rgba(50,215,75,0.6)',
                                                margin: '2px 0 0',
                                                fontVariantNumeric: 'tabular-nums',
                                                fontWeight: 500,
                                            }}>
                                                {margin === null ? '—' : `${margin}% margen`}
                                            </p>
                                        </div>
                                        <span style={{
                                            fontSize: 16,
                                            fontWeight: 700,
                                            color: marginColor,
                                            fontVariantNumeric: 'tabular-nums',
                                            letterSpacing: '-0.3px',
                                            transition: 'color 0.3s var(--toul-ease)',
                                        }}>
                                            {showProfit ? formatCOP(profit) : '—'}
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </>
                )}
            </div>

            {/* ─── FIXED BOTTOM SAVE (variantes mode only) ─── */}
            {hasVariants && (
                <div style={{
                    position: 'fixed',
                    bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
                    left: 0, right: 0,
                    padding: '28px 18px 12px',
                    background: 'linear-gradient(to top, #0a0a0a 65%, transparent)',
                    zIndex: 30,
                    pointerEvents: 'none',
                }}>
                    <div style={{ maxWidth: 520, margin: '0 auto' }}>
                        <motion.button
                            type="button"
                            onClick={handleSaveVariants}
                            disabled={!isDirty || saving}
                            whileTap={isDirty && !saving ? { scale: 0.97 } : undefined}
                            transition={SPRING_PRESS}
                            style={{
                                pointerEvents: 'auto',
                                width: '100%',
                                height: 50,
                                borderRadius: 14,
                                border: 'none',
                                background: isDirty && !saving ? '#32d74b' : 'rgba(255,255,255,0.07)',
                                color: isDirty && !saving ? '#000' : 'rgba(255,255,255,0.3)',
                                fontSize: 15,
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                boxShadow: isDirty && !saving ? '0 4px 24px rgba(50,215,75,0.25)' : 'none',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                fontFamily: 'inherit',
                            }}>
                            {saving ? (
                                <>
                                    <Loader2 size={16} strokeWidth={2.4}
                                        style={{ animation: 'spin 0.7s linear infinite' }} />
                                    <span>Guardando...</span>
                                </>
                            ) : (
                                <>
                                    <Check size={16} strokeWidth={2.6} />
                                    <span>Guardar cambios</span>
                                </>
                            )}
                        </motion.button>
                    </div>
                </div>
            )}

            {/* Hidden file input (simple mode) */}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

            {/* ─── BOTTOM SHEET — edit general data (variantes mode only) ─── */}
            {hasVariants && (
                <GeneralEditSheet
                    open={sheetOpen}
                    onClose={() => setSheetOpen(false)}
                    initialName={product.name}
                    initialReference={product.reference || ''}
                    initialCategoryId={product.category_id || ''}
                    initialImageUrl={originalImageUrl}
                    categories={categories}
                    saving={saving}
                    onSubmit={handleSheetSave}
                />
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────
// Bottom sheet for editing general product data
// (only used in variants mode)
// ─────────────────────────────────────────────────

function GeneralEditSheet({
    open, onClose,
    initialName, initialReference, initialCategoryId, initialImageUrl,
    categories,
    saving,
    onSubmit,
}: {
    open: boolean
    onClose: () => void
    initialName: string
    initialReference: string
    initialCategoryId: string
    initialImageUrl: string | null
    categories: ProductCategory[]
    saving: boolean
    onSubmit: (data: { name: string; reference: string; categoryId: string; imageFile: File | null; imagePreview: string | null; originalImageUrl: string | null }) => void
}) {
    const fileRef = useRef<HTMLInputElement>(null)
    const [name, setName] = useState(initialName)
    const [reference, setReference] = useState(initialReference)
    const [categoryId, setCategoryId] = useState(initialCategoryId)
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl)

    useEffect(() => {
        if (open) {
            setName(initialName)
            setReference(initialReference)
            setCategoryId(initialCategoryId)
            setImageFile(null)
            setImagePreview(initialImageUrl)
            const prev = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = prev }
        }
    }, [open, initialName, initialReference, initialCategoryId, initialImageUrl])

    function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > MAX_FILE_SIZE) { toast.error(`"${file.name}" supera los 20MB`); return }
        setImageFile(file)
        const reader = new FileReader()
        reader.onload = ev => setImagePreview(ev.target?.result as string)
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    return (
        <AnimatePresence>
            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-end"
                    onClick={onClose}>
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
                        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
                            <div style={{
                                width: 36, height: 4,
                                borderRadius: 999,
                                background: 'rgba(255,255,255,0.18)',
                            }} />
                        </div>

                        {/* Header */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            alignItems: 'center',
                            padding: '14px 18px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            gap: 10,
                        }}>
                            <motion.button
                                type="button"
                                onClick={onClose}
                                whileTap={{ scale: 0.92 }}
                                transition={SPRING_PRESS}
                                style={{
                                    width: 30, height: 30,
                                    borderRadius: 9,
                                    background: 'rgba(255,255,255,0.07)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    justifySelf: 'start',
                                }}>
                                <X size={14} color="rgba(255,255,255,0.8)" strokeWidth={2.2} />
                            </motion.button>
                            <h2 style={{
                                fontSize: 14,
                                fontWeight: 600,
                                color: 'var(--toul-text)',
                                letterSpacing: '-0.01em',
                                margin: 0,
                                textAlign: 'center',
                            }}>
                                Datos del producto
                            </h2>
                            <motion.button
                                type="button"
                                onClick={() => onSubmit({ name, reference, categoryId, imageFile, imagePreview, originalImageUrl: initialImageUrl })}
                                disabled={saving || !name.trim()}
                                whileTap={!saving && name.trim() ? { scale: 0.97 } : undefined}
                                transition={SPRING_PRESS}
                                style={{
                                    height: 30,
                                    padding: '0 12px',
                                    borderRadius: 9,
                                    border: 'none',
                                    background: !saving && name.trim() ? '#32d74b' : 'rgba(255,255,255,0.07)',
                                    color: !saving && name.trim() ? '#000' : 'rgba(255,255,255,0.3)',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    letterSpacing: '-0.01em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    cursor: !saving && name.trim() ? 'pointer' : 'not-allowed',
                                    boxShadow: !saving && name.trim() ? '0 4px 14px rgba(50,215,75,0.25)' : 'none',
                                    transition: 'all 0.2s var(--toul-ease)',
                                    fontFamily: 'inherit',
                                    justifySelf: 'end',
                                }}>
                                {saving ? (
                                    <>
                                        <Loader2 size={11} strokeWidth={2.6}
                                            style={{ animation: 'spin 0.7s linear infinite' }} />
                                        <span>Guardando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check size={12} strokeWidth={2.8} />
                                        <span>Guardar</span>
                                    </>
                                )}
                            </motion.button>
                        </div>

                        {/* Body */}
                        <div style={{ overflowY: 'auto', padding: '16px 18px 20px' }}>
                            {/* Photo */}
                            <div
                                onClick={() => fileRef.current?.click()}
                                style={{
                                    width: '100%',
                                    height: 100,
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                    position: 'relative',
                                    background: 'rgba(255,255,255,0.05)',
                                    cursor: 'pointer',
                                    marginBottom: 14,
                                }}>
                                {imagePreview ? (
                                    <img src={imagePreview} alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{
                                        width: '100%', height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Camera size={28} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                                    </div>
                                )}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 8, right: 8,
                                    width: 26, height: 26,
                                    borderRadius: 8,
                                    background: 'rgba(0,0,0,0.6)',
                                    backdropFilter: 'blur(6px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Camera size={13} color="#fff" strokeWidth={2} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <Field
                                    label="Nombre"
                                    required
                                    value={name}
                                    onChange={setName}
                                    placeholder="Ej. Perfume floral 100ml"
                                    maxLength={100}
                                />
                                <Field
                                    label="Referencia"
                                    hint="opcional"
                                    value={reference}
                                    onChange={setReference}
                                    placeholder="REF-001"
                                    maxLength={50}
                                />
                                <CategoryPicker
                                    items={categories}
                                    value={categoryId}
                                    onChange={setCategoryId}
                                    label="Categoría"
                                    emptyMessage="Sin categorías"
                                />
                            </div>

                            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePick} />
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
