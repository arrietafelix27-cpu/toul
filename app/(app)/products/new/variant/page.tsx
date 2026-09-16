'use client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { ArrowLeft, X, Camera, Check, Loader2, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { ProductCategory } from '@/lib/types'
import { Field, CategoryPicker, SPRING_PRESS, EASE_OUT_EXPO } from '@/components/ui'

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
                resolve(blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file)
            }, 'image/jpeg', 0.82)
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
        img.src = url
    })
}

type AttrValue = { id: string; value: string }
type Attribute = { id: string; name: string; values: AttrValue[] }

function uid() { return Math.random().toString(36).slice(2, 9) }

function cartesianProduct(arrays: string[][]): string[] {
    if (!arrays.length) return []
    return arrays.reduce<string[][]>((acc, arr) => {
        if (!acc.length) return arr.map(v => [v])
        return acc.flatMap(c => arr.map(v => [...c, v]))
    }, []).map(c => c.join(' · '))
}

// ─── Small input used inside the variants table (numeric, $ prefix) ───
function VariantPriceInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    const [focused, setFocused] = useState(false)
    return (
        <div style={{
            position: 'relative',
            borderRadius: 10,
            background: focused ? 'var(--toul-surface-focused)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${focused ? 'var(--toul-border-focused)' : 'rgba(255,255,255,0.07)'}`,
            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
        }}>
            <span style={{
                position: 'absolute',
                left: 8, top: '50%', transform: 'translateY(-50%)',
                fontSize: 11,
                color: focused ? 'var(--toul-accent)' : 'rgba(255,255,255,0.3)',
                fontWeight: 500,
                pointerEvents: 'none',
                userSelect: 'none',
                transition: 'color var(--toul-transition)',
            }}>$</span>
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
                    width: '100%',
                    height: 36,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '0 8px 0 18px',
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--toul-text)',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                    fontFamily: 'inherit',
                    textAlign: 'right',
                }}
            />
        </div>
    )
}

export default function NewVariantProductPage() {
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [name, setName] = useState('')
    const [reference, setReference] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [categories, setCategories] = useState<ProductCategory[]>([])
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [attributes, setAttributes] = useState<Attribute[]>([{ id: uid(), name: '', values: [] }])
    const [variantPrices, setVariantPrices] = useState<Record<string, { price: string; cost: string }>>({})
    const [valueInputs, setValueInputs] = useState<Record<string, string>>({})

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
            if (data && data.length > 0) {
                setCategories(data)
                setCategoryId(data[0].id)
            }
        }
        loadCats()
    }, [supabase])

    const variantNames = useMemo(() => {
        const active = attributes.filter(a => a.name.trim() && a.values.length > 0)
        if (!active.length) return []
        return cartesianProduct(active.map(a => a.values.map(v => v.value)))
    }, [attributes])

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

    function removeImage() {
        setImageFile(null)
        setImagePreview(null)
    }

    async function uploadImage(storeId: string, file: File): Promise<string | null> {
        const compressed = file.size > 2 * 1024 * 1024 ? await compressImage(file) : file
        const { data, error } = await supabase.storage.from('product-images')
            .upload(`${storeId}/${Date.now()}.jpg`, compressed, { upsert: false, contentType: 'image/jpeg' })
        if (error) {
            console.error('Upload error:', error)
            toast.error(`Error subiendo imagen: ${error.message}`)
            return null
        }
        return supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl
    }

    const updateAttrName = useCallback((id: string, val: string) => {
        setAttributes(prev => prev.map(a => a.id === id ? { ...a, name: val } : a))
    }, [])

    const removeAttr = useCallback((id: string) => {
        setAttributes(prev => prev.filter(a => a.id !== id))
    }, [])

    const addValue = useCallback((attrId: string) => {
        const val = (valueInputs[attrId] || '').trim()
        if (!val) return
        setAttributes(prev => prev.map(a => {
            if (a.id !== attrId) return a
            if (a.values.some(v => v.value.toLowerCase() === val.toLowerCase())) return a
            return { ...a, values: [...a.values, { id: uid(), value: val }] }
        }))
        setValueInputs(prev => ({ ...prev, [attrId]: '' }))
    }, [valueInputs])

    const removeValue = useCallback((attrId: string, valueId: string) => {
        setAttributes(prev => prev.map(a =>
            a.id === attrId ? { ...a, values: a.values.filter(v => v.id !== valueId) } : a
        ))
    }, [])

    const setVariantField = useCallback((vName: string, field: 'price' | 'cost', val: string) => {
        setVariantPrices(prev => ({ ...prev, [vName]: { ...prev[vName], [field]: val } }))
    }, [])

    async function handleSave() {
        const activeAttrs = attributes.filter(a => a.name.trim() && a.values.length > 0)
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        if (!activeAttrs.length) { toast.error('Agrega al menos un atributo con valores'); return }
        if (!variantNames.length) { toast.error('Define los valores de los atributos'); return }
        if (variantNames.some(n => !Number(variantPrices[n]?.price))) {
            toast.error('Todas las variantes deben tener precio'); return
        }

        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); router.push('/login'); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { toast.error('Tienda no encontrada'); setLoading(false); return }

        let imageUrl: string | null = null
        if (imageFile) {
            imageUrl = await uploadImage(store.id, imageFile)
        }

        const productPayload: Record<string, unknown> = {
            store_id: store.id,
            name: name.trim(),
            category_id: categoryId || null,
            sale_price: 0,
            cost_price: 0,
            cpp: 0,
            stock: 0,
            image_url: imageUrl,
            is_active: true,
        }
        if (reference.trim()) productPayload.reference = reference.trim()

        const { data: p1, error: e1 } = await supabase.from('products').insert(productPayload).select('id').single()
        if (e1 || !p1) { toast.error('Error al crear el producto'); setLoading(false); return }
        const productId = p1.id

        // Insert attributes
        const { error: attrErr } = await supabase.from('product_variant_attributes').insert(
            activeAttrs.map(a => ({ product_id: productId, name: a.name.trim() }))
        )
        if (attrErr) {
            await supabase.from('products').delete().eq('id', productId)
            toast.error('Error al guardar atributos')
            setLoading(false); return
        }

        // Insert variants
        const { error: varErr } = await supabase.from('product_variants').insert(
            variantNames.map(n => ({
                store_id: store.id,
                product_id: productId,
                name: n,
                sale_price: Number(variantPrices[n].price),
                cost_price: Number(variantPrices[n]?.cost || 0),
                cpp: Number(variantPrices[n]?.cost || 0),
                is_active: true,
            }))
        )
        if (varErr) {
            await supabase.from('products').delete().eq('id', productId)
            toast.error('Error al guardar variantes')
            setLoading(false); return
        }

        setLoading(false)
        setSaved(true)
        toast.success('Producto creado')
        setTimeout(() => router.push('/products'), 1800)
    }

    const isValid = name.trim().length > 0 && variantNames.length > 0 && variantNames.every(n => Number(variantPrices[n]?.price) > 0)
    type BtnState = 'disabled' | 'ready' | 'loading' | 'saved'
    const buttonState: BtnState = saved ? 'saved' : loading ? 'loading' : isValid ? 'ready' : 'disabled'

    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <div className="toul-ambient" />

            {/* ─── SCROLL CONTAINER ─── */}
            <div style={{
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
                    <Link href="/products/new"
                        className="active:scale-90"
                        style={{
                            width: 36, height: 36, borderRadius: 12,
                            background: 'rgba(255,255,255,0.07)',
                            color: 'rgba(255,255,255,0.7)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'transform 0.18s var(--toul-ease)',
                        }}>
                        <ArrowLeft size={17} strokeWidth={2} />
                    </Link>
                    <h1 style={{
                        fontSize: 17, fontWeight: 600,
                        color: 'var(--toul-text)',
                        letterSpacing: '-0.02em', margin: 0,
                    }}>
                        Producto con variantes
                    </h1>
                </motion.div>

                <form
                    id="nvp-form"
                    onSubmit={e => { e.preventDefault(); if (buttonState === 'ready') handleSave() }}>

                    {/* ─── FOTO ─── */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT_EXPO }}
                        style={{ marginBottom: 22 }}>

                        <h2 className="toul-section-label">Foto del producto</h2>

                        <motion.div
                            onClick={() => !imagePreview && fileRef.current?.click()}
                            whileTap={!imagePreview ? { scale: 0.96 } : undefined}
                            transition={SPRING_PRESS}
                            style={{
                                width: 86, height: 86,
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
                                    <img src={imagePreview} alt=""
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

                        <p style={{ fontSize: 11, color: 'var(--toul-text-ghost)', margin: '8px 0 0' }}>
                            20 MB máximo
                        </p>
                    </motion.section>

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
                                placeholder="Ej. Afnam 9pm"
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

                    <hr className="toul-divider" />

                    {/* ─── ATRIBUTOS ─── */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: EASE_OUT_EXPO }}>

                        <h2 className="toul-section-label">Atributos</h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {attributes.map((attr, idx) => (
                                <div key={attr.id}
                                    style={{
                                        background: 'var(--toul-surface)',
                                        border: '1px solid var(--toul-border)',
                                        borderRadius: 14,
                                        padding: 14,
                                    }}>
                                    {/* Attribute name + remove */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <input
                                            placeholder={`Nombre del atributo (ej. ${idx === 0 ? 'Tamaño' : idx === 1 ? 'Color' : 'Talla'})`}
                                            value={attr.name}
                                            onChange={e => updateAttrName(attr.id, e.target.value)}
                                            style={{
                                                flex: 1,
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 10,
                                                padding: '10px 12px',
                                                fontSize: 14,
                                                color: 'var(--toul-text)',
                                                outline: 'none',
                                                fontFamily: 'inherit',
                                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                            }}
                                            onFocus={e => {
                                                e.currentTarget.style.background = 'var(--toul-surface-focused)'
                                                e.currentTarget.style.borderColor = 'var(--toul-border-focused)'
                                            }}
                                            onBlur={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                                            }}
                                        />
                                        {attributes.length > 1 && (
                                            <motion.button
                                                type="button"
                                                onClick={() => removeAttr(attr.id)}
                                                whileTap={{ scale: 0.9 }}
                                                transition={SPRING_PRESS}
                                                style={{
                                                    width: 36, height: 36,
                                                    borderRadius: 10,
                                                    background: 'rgba(255,69,58,0.08)',
                                                    border: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                }}>
                                                <Trash2 size={13} color="var(--toul-error)" strokeWidth={2} />
                                            </motion.button>
                                        )}
                                    </div>

                                    {/* Value chips */}
                                    {attr.values.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                            {attr.values.map(v => (
                                                <span key={v.id}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        fontSize: 12,
                                                        fontWeight: 500,
                                                        padding: '4px 4px 4px 10px',
                                                        borderRadius: 999,
                                                        background: 'var(--toul-accent-dim)',
                                                        color: 'var(--toul-accent)',
                                                        border: '1px solid var(--toul-border-focused)',
                                                    }}>
                                                    {v.value}
                                                    <button type="button"
                                                        onClick={() => removeValue(attr.id, v.id)}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: 16, height: 16,
                                                            borderRadius: '50%',
                                                            background: 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: 'var(--toul-accent)',
                                                            opacity: 0.6,
                                                        }}>
                                                        <X size={10} strokeWidth={2.4} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add value */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input
                                            placeholder="Agregar valor (ej. 100ml)"
                                            value={valueInputs[attr.id] || ''}
                                            onChange={e => setValueInputs(prev => ({ ...prev, [attr.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValue(attr.id) } }}
                                            style={{
                                                flex: 1,
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.07)',
                                                borderRadius: 10,
                                                padding: '9px 12px',
                                                fontSize: 13,
                                                color: 'var(--toul-text)',
                                                outline: 'none',
                                                fontFamily: 'inherit',
                                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                            }}
                                            onFocus={e => {
                                                e.currentTarget.style.background = 'var(--toul-surface-focused)'
                                                e.currentTarget.style.borderColor = 'var(--toul-border-focused)'
                                            }}
                                            onBlur={e => {
                                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                                            }}
                                        />
                                        <motion.button
                                            type="button"
                                            onClick={() => addValue(attr.id)}
                                            whileTap={{ scale: 0.95 }}
                                            transition={SPRING_PRESS}
                                            style={{
                                                width: 38, height: 38,
                                                borderRadius: 10,
                                                background: 'var(--toul-accent)',
                                                border: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                                boxShadow: '0 4px 16px var(--toul-accent-glow)',
                                            }}>
                                            <Plus size={16} color="#000" strokeWidth={2.6} />
                                        </motion.button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {attributes.length < 3 && (
                            <motion.button
                                type="button"
                                onClick={() => setAttributes(prev => [...prev, { id: uid(), name: '', values: [] }])}
                                whileTap={{ scale: 0.98 }}
                                transition={SPRING_PRESS}
                                style={{
                                    marginTop: 10,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: 'var(--toul-accent)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '6px 0',
                                    fontFamily: 'inherit',
                                }}>
                                <Plus size={14} strokeWidth={2.4} /> Agregar otro atributo
                            </motion.button>
                        )}
                    </motion.section>

                    {/* ─── VARIANTES ─── */}
                    <AnimatePresence>
                        {variantNames.length > 0 && (
                            <motion.section
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 16 }}
                                transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                                style={{ marginTop: 22 }}>

                                <h2 className="toul-section-label">
                                    Variantes <span style={{ color: 'var(--toul-text-faint)', fontWeight: 500 }}>· {variantNames.length}</span>
                                </h2>

                                <div style={{
                                    background: 'var(--toul-surface)',
                                    border: '1px solid var(--toul-border)',
                                    borderRadius: 14,
                                    overflow: 'hidden',
                                }}>
                                    {/* Headers */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 100px 100px',
                                        gap: 8,
                                        padding: '10px 12px',
                                        borderBottom: '1px solid var(--toul-divider)',
                                    }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--toul-text-dim)', letterSpacing: '0.01em' }}>
                                            Variante
                                        </span>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--toul-text-dim)', letterSpacing: '0.01em', textAlign: 'center' }}>
                                            Venta
                                        </span>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--toul-text-dim)', letterSpacing: '0.01em', textAlign: 'center' }}>
                                            Costo
                                        </span>
                                    </div>

                                    {/* Rows */}
                                    {variantNames.map((vName, idx) => (
                                        <div key={vName}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: '1fr 100px 100px',
                                                gap: 8,
                                                alignItems: 'center',
                                                padding: '8px 12px',
                                                borderBottom: idx < variantNames.length - 1
                                                    ? '1px solid rgba(255,255,255,0.05)'
                                                    : 'none',
                                            }}>
                                            <span style={{
                                                fontSize: 13,
                                                fontWeight: 500,
                                                color: 'var(--toul-text)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                paddingRight: 4,
                                            }}>
                                                {vName}
                                            </span>
                                            <VariantPriceInput
                                                value={variantPrices[vName]?.price || ''}
                                                onChange={v => setVariantField(vName, 'price', v)}
                                            />
                                            <VariantPriceInput
                                                value={variantPrices[vName]?.cost || ''}
                                                onChange={v => setVariantField(vName, 'cost', v)}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </motion.section>
                        )}
                    </AnimatePresence>

                </form>
            </div>

            {/* ─── FIXED BOTTOM SAVE ─── */}
            <div style={{
                position: 'fixed',
                bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
                left: 0, right: 0,
                padding: '28px 18px 12px',
                background: 'linear-gradient(to top, var(--toul-bg) 65%, transparent)',
                zIndex: 30,
                pointerEvents: 'none',
            }}>
                <div style={{ maxWidth: 520, margin: '0 auto' }}>
                    <motion.button
                        form="nvp-form"
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
                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {buttonState === 'loading' && (
                                    <>
                                        <Loader2 size={17} color="#000000" strokeWidth={2.4}
                                            style={{ animation: 'spin 0.7s linear infinite' }} />
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

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        </div>
    )
}
