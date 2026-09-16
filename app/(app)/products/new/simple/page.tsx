'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { ArrowLeft, X, Camera, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { ProductCategory } from '@/lib/types'
import {
    Field, PriceField, CategoryPicker,
    SPRING_SOFT, SPRING_PRESS, EASE_OUT_EXPO,
} from '@/components/ui'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

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
                const result = blob
                    ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })
                    : file
                resolve(result)
            }, 'image/jpeg', 0.82)
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
        img.src = url
    })
}

export default function NewSimpleProductPage() {
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [categories, setCategories] = useState<ProductCategory[]>([])
    const [name, setName] = useState('')
    const [reference, setReference] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [salePrice, setSalePrice] = useState('')
    const [costPrice, setCostPrice] = useState('')
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        const loadCats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase
                .from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return
            const { data } = await supabase
                .from('product_categories')
                .select('*')
                .eq('store_id', store.id)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })
            if (data && data.length > 0) {
                setCategories(data)
                setCategoryId(data[0].id)
            }
        }
        loadCats()
    }, [supabase])

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > MAX_FILE_SIZE) {
            toast.error(`"${file.name}" supera los 20MB`)
            return
        }
        setImageFile(file)
        const reader = new FileReader()
        reader.onload = ev => setImagePreview(ev.target?.result as string)
        reader.readAsDataURL(file)
        e.target.value = ''
    }

    function removeImage() {
        setImageFile(null)
        setImagePreview(null)
    }

    async function uploadImageToStorage(storeId: string, file: File): Promise<string | null> {
        const compressed = file.size > 2 * 1024 * 1024 ? await compressImage(file) : file
        const fileName = `${Date.now()}.jpg`
        const path = `${storeId}/${fileName}`
        const { data, error } = await supabase.storage
            .from('product-images')
            .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' })
        if (error) {
            console.error('Upload error:', error)
            toast.error(`Error subiendo imagen: ${error.message}`)
            return null
        }
        const { data: { publicUrl } } = supabase.storage
            .from('product-images').getPublicUrl(data.path)
        return publicUrl
    }

    async function handleSave() {
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        const priceNum = Number(salePrice)
        if (!salePrice || priceNum <= 0) { toast.error('Ingresa un precio de venta válido'); return }

        setLoading(true)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: store } = await supabase
            .from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setLoading(false); toast.error('No se encontró la tienda'); return }

        let imageUrl: string | null = null
        if (imageFile) {
            imageUrl = await uploadImageToStorage(store.id, imageFile)
        }

        const cp = Number(costPrice) || 0
        const productData: Record<string, unknown> = {
            store_id: store.id,
            name: name.trim(),
            category_id: categoryId || null,
            sale_price: priceNum,
            cost_price: cp,
            cpp: cp,
            stock: 0,
            image_url: imageUrl,
            is_active: true,
        }
        if (reference.trim()) productData.reference = reference.trim()

        const { error } = await supabase.from('products').insert(productData)
        if (error) {
            toast.error('Error al crear el producto: ' + error.message)
            setLoading(false)
            return
        }

        setLoading(false)
        setSaved(true)
        toast.success('Producto creado')
        setTimeout(() => router.push('/products'), 1800)
    }

    // ─── Derived ───
    const salePriceNum = Number(salePrice)
    const costPriceNum = Number(costPrice)
    const showProfit = salePriceNum > 0 && costPriceNum > 0
    const profit = showProfit ? Math.round(salePriceNum - costPriceNum) : 0
    const margin = showProfit && salePriceNum > 0
        ? Math.round((profit / salePriceNum) * 100)
        : null

    const marginColor =
        margin === null ? 'var(--toul-text-faint)' :
            margin > 35 ? 'var(--toul-margin-high)' :
                margin > 15 ? 'var(--toul-margin-mid)' :
                    'var(--toul-margin-low)'

    const isValid = name.trim().length > 0 && salePriceNum > 0
    type BtnState = 'disabled' | 'ready' | 'loading' | 'saved'
    const buttonState: BtnState = saved ? 'saved' : loading ? 'loading' : isValid ? 'ready' : 'disabled'

    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>

            {/* ─── Ambient verde ─── */}
            <div className="toul-ambient" />

            {/* ─── SCROLL CONTAINER ─── */}
            <div
                style={{
                    position: 'relative',
                    padding: '20px 18px 0',
                    paddingBottom: 'calc(190px + env(safe-area-inset-bottom, 0px))',
                    maxWidth: 520,
                    margin: '0 auto',
                }}>

                {/* ─── HEADER ─── */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 28,
                    }}>
                    <Link
                        href="/products/new"
                        style={{
                            width: 36, height: 36,
                            borderRadius: 12,
                            background: 'rgba(255,255,255,0.07)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.18s var(--toul-ease), background 0.18s var(--toul-ease)',
                        }}
                        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.94)')}
                        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                        <ArrowLeft size={17} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                    </Link>
                    <h1 style={{
                        fontSize: 17,
                        fontWeight: 600,
                        color: 'var(--toul-text)',
                        letterSpacing: '-0.02em',
                        margin: 0,
                    }}>
                        Nuevo Producto
                    </h1>
                </motion.div>

                <form
                    id="nsp-form"
                    onSubmit={e => { e.preventDefault(); if (buttonState === 'ready') handleSave() }}>

                    {/* ─── FOTO ─── */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT_EXPO }}
                        style={{ marginBottom: 22 }}>

                        <h2 className="toul-section-label">Fotos del producto</h2>

                        <motion.div
                            onClick={() => !imagePreview && fileRef.current?.click()}
                            whileTap={!imagePreview ? { scale: 0.96 } : undefined}
                            transition={SPRING_PRESS}
                            style={{
                                width: 86,
                                height: 86,
                                borderRadius: 18,
                                overflow: 'hidden',
                                position: 'relative',
                                cursor: imagePreview ? 'default' : 'pointer',
                                background: 'var(--toul-surface)',
                                border: imagePreview
                                    ? '1px solid var(--toul-border)'
                                    : '1.5px solid rgba(255,255,255,0.08)',
                            }}>
                            {imagePreview ? (
                                <>
                                    <img
                                        src={imagePreview}
                                        alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <motion.button
                                        type="button"
                                        onClick={removeImage}
                                        whileTap={{ scale: 0.9 }}
                                        transition={SPRING_PRESS}
                                        style={{
                                            position: 'absolute',
                                            top: 5, right: 5,
                                            width: 22, height: 22,
                                            borderRadius: '50%',
                                            background: 'rgba(0,0,0,0.55)',
                                            backdropFilter: 'blur(6px)',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}>
                                        <X size={11} color="#ffffff" strokeWidth={2.4} />
                                    </motion.button>
                                </>
                            ) : (
                                <div style={{
                                    width: '100%', height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 4,
                                }}>
                                    <Camera size={20} color="rgba(255,255,255,0.25)" strokeWidth={1.6} />
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>
                                        Añadir
                                    </span>
                                </div>
                            )}
                        </motion.div>

                        <p style={{
                            fontSize: 11,
                            color: 'var(--toul-text-ghost)',
                            margin: '8px 0 0',
                        }}>
                            20 MB máximo
                        </p>
                    </motion.section>

                    {/* ─── DIVISOR ─── */}
                    <hr className="toul-divider" />

                    {/* ─── INFORMACIÓN ─── */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.1, ease: EASE_OUT_EXPO }}>

                        <h2 className="toul-section-label">Información</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Field
                                label="Nombre"
                                required
                                value={name}
                                onChange={setName}
                                placeholder="Ej. Perfume Floral 100ml"
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
                    </motion.section>

                    {/* ─── DIVISOR ─── */}
                    <hr className="toul-divider" />

                    {/* ─── PRECIOS ─── */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: EASE_OUT_EXPO }}>

                        <h2 className="toul-section-label">Precios</h2>

                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <PriceField
                                label="Venta"
                                required
                                value={salePrice}
                                onChange={setSalePrice}
                            />
                            <PriceField
                                label="Costo"
                                hint="opcional"
                                value={costPrice}
                                onChange={setCostPrice}
                            />
                        </div>

                        {/* ─── MARGEN ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT_EXPO }}
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid var(--toul-border)',
                                borderRadius: 14,
                                padding: '12px 16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                            <span style={{
                                fontSize: 14,
                                color: 'var(--toul-text-subtle)',
                                fontWeight: 500,
                            }}>
                                Margen de ganancia
                            </span>

                            <AnimatePresence mode="wait" initial={false}>
                                <motion.div
                                    key={margin === null ? 'empty' : margin > 35 ? 'high' : margin > 15 ? 'mid' : 'low'}
                                    initial={{ opacity: 0, y: 3 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -3 }}
                                    transition={SPRING_SOFT}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                    {margin !== null && (
                                        <span style={{
                                            width: 6, height: 6,
                                            borderRadius: '50%',
                                            background: marginColor,
                                            transition: 'background 0.3s ease',
                                        }} />
                                    )}
                                    <span style={{
                                        fontSize: 17,
                                        fontWeight: 600,
                                        color: marginColor,
                                        fontVariantNumeric: 'tabular-nums',
                                        letterSpacing: '-0.02em',
                                        transition: 'color 0.3s ease',
                                    }}>
                                        {margin === null ? '—' : `${margin}%`}
                                    </span>
                                </motion.div>
                            </AnimatePresence>
                        </motion.div>
                    </motion.section>

                </form>
            </div>

            {/* ─── FIXED BOTTOM SAVE ─── */}
            <div style={{
                position: 'fixed',
                bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
                left: 0,
                right: 0,
                padding: '28px 18px 12px',
                background: 'linear-gradient(to top, var(--toul-bg) 65%, transparent)',
                zIndex: 30,
                pointerEvents: 'none',
            }}>
                <div style={{ maxWidth: 520, margin: '0 auto' }}>
                    <motion.button
                        form="nsp-form"
                        type="submit"
                        disabled={buttonState === 'disabled' || buttonState === 'loading' || buttonState === 'saved'}
                        whileTap={buttonState === 'ready' ? { scale: 0.97 } : undefined}
                        transition={SPRING_PRESS}
                        style={{
                            pointerEvents: 'auto',
                            width: '100%',
                            height: 54,
                            borderRadius: 16,
                            border: buttonState === 'saved'
                                ? '1px solid rgba(50,215,75,0.3)'
                                : 'none',
                            background:
                                buttonState === 'disabled' ? 'rgba(255,255,255,0.07)' :
                                    buttonState === 'saved' ? 'rgba(50,215,75,0.15)' :
                                        'var(--toul-accent)',
                            color:
                                buttonState === 'disabled' ? 'rgba(255,255,255,0.2)' :
                                    buttonState === 'saved' ? 'var(--toul-accent)' :
                                        '#000000',
                            fontSize: 16,
                            fontWeight: 600,
                            letterSpacing: '-0.01em',
                            cursor: buttonState === 'ready' ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            boxShadow: buttonState === 'ready'
                                ? '0 4px 24px var(--toul-accent-glow)'
                                : 'none',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            fontFamily: 'inherit',
                        }}>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={buttonState}
                                initial={{ opacity: 0, scale: 0.85 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.85 }}
                                transition={SPRING_PRESS}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}>
                                {buttonState === 'loading' && (
                                    <>
                                        <Loader2
                                            size={17}
                                            color="#000000"
                                            strokeWidth={2.4}
                                            style={{ animation: 'spin 0.7s linear infinite' }}
                                        />
                                        <span>Guardando...</span>
                                    </>
                                )}
                                {buttonState === 'saved' && (
                                    <>
                                        <Check size={17} color="var(--toul-accent)" strokeWidth={2.6} />
                                        <span>Guardado</span>
                                    </>
                                )}
                                {buttonState === 'ready' && (
                                    <>
                                        <Check size={17} color="#000000" strokeWidth={2.6} />
                                        <span>Guardar producto</span>
                                    </>
                                )}
                                {buttonState === 'disabled' && (
                                    <span>Guardar producto</span>
                                )}
                            </motion.div>
                        </AnimatePresence>
                    </motion.button>
                </div>
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
            />
        </div>
    )
}
