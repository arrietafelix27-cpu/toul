'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { ArrowLeft, Search, X, Camera, Check, Loader2, Trash2, Plus, Minus } from 'lucide-react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { formatCOP } from '@/lib/utils'
import type { ProductCategory } from '@/lib/types'
import { Field, PriceField, CategoryPicker, SPRING_PRESS, SPRING_SOFT, EASE_OUT_EXPO } from '@/components/ui'

const MAX_FILE_SIZE = 20 * 1024 * 1024

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

type SearchItem = {
    key: string
    type: 'product' | 'variant'
    label: string
    price: number
    cost: number
    productId: string | null
    variantId: string | null
}

type ComboItem = SearchItem & { quantity: number }

export default function NewComboPage() {
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [name, setName] = useState('')
    const [categoryId, setCategoryId] = useState('')
    const [categories, setCategories] = useState<ProductCategory[]>([])
    const [imageFile, setImageFile] = useState<File | null>(null)
    const [imagePreview, setImagePreview] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [searchFocused, setSearchFocused] = useState(false)
    const [allItems, setAllItems] = useState<SearchItem[]>([])
    const [selectedItems, setSelectedItems] = useState<ComboItem[]>([])
    const [comboPrice, setComboPrice] = useState('')
    const [loading, setLoading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [dataLoading, setDataLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return

            const { data: cats } = await supabase
                .from('product_categories')
                .select('*')
                .eq('store_id', store.id)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true })
            if (cats && cats.length > 0) {
                setCategories(cats)
                setCategoryId(cats[0].id)
            }

            const [prodsRes, varsRes] = await Promise.all([
                supabase.from('products').select('id, name, sale_price, cpp').eq('store_id', store.id).eq('is_active', true),
                supabase.from('product_variants').select('id, name, sale_price, cpp, product_id').eq('store_id', store.id).eq('is_active', true),
            ])

            const products = prodsRes.data || []
            const variants = varsRes.data || []
            const productIdsWithVariants = new Set(variants.map(v => v.product_id))
            const productNameMap = new Map(products.map(p => [p.id, p.name]))

            setAllItems([
                ...products
                    .filter(p => !productIdsWithVariants.has(p.id))
                    .map(p => ({
                        key: `p-${p.id}`,
                        type: 'product' as const,
                        label: p.name,
                        price: p.sale_price,
                        cost: p.cpp,
                        productId: p.id,
                        variantId: null,
                    })),
                ...variants.map(v => ({
                    key: `v-${v.id}`,
                    type: 'variant' as const,
                    label: `${productNameMap.get(v.product_id) || ''} · ${v.name}`,
                    price: v.sale_price,
                    cost: v.cpp,
                    productId: null,
                    variantId: v.id,
                })),
            ])
            setDataLoading(false)
        }
        load()
    }, [supabase])

    const selectedKeys = useMemo(() => new Set(selectedItems.map(i => i.key)), [selectedItems])

    const searchResults = useMemo(() => {
        if (!search.trim()) return []
        const q = search.toLowerCase()
        return allItems
            .filter(i => !selectedKeys.has(i.key) && i.label.toLowerCase().includes(q))
            .slice(0, 6)
    }, [search, allItems, selectedKeys])

    const regularPrice = useMemo(
        () => Math.round(selectedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)),
        [selectedItems]
    )
    const totalCost = useMemo(
        () => Math.round(selectedItems.reduce((sum, i) => sum + i.cost * i.quantity, 0)),
        [selectedItems]
    )
    const comboPriceNum = Number(comboPrice) || 0
    const profit = Math.round(comboPriceNum - totalCost)
    const showProfit = comboPriceNum > 0 && totalCost > 0
    const margin = showProfit ? Math.round((profit / comboPriceNum) * 100) : null
    const savings = Math.max(0, regularPrice - comboPriceNum)

    const marginColor =
        margin === null ? 'var(--toul-text-faint)' :
            margin > 35 ? 'var(--toul-margin-high)' :
                margin > 15 ? 'var(--toul-margin-mid)' :
                    'var(--toul-margin-low)'

    const addItem = useCallback((item: SearchItem) => {
        setSelectedItems(prev => [...prev, { ...item, quantity: 1 }])
        setSearch('')
    }, [])

    const changeQty = useCallback((key: string, delta: number) => {
        setSelectedItems(prev => prev
            .map(i => i.key === key ? { ...i, quantity: i.quantity + delta } : i)
            .filter(i => i.quantity > 0)
        )
    }, [])

    const removeItem = useCallback((key: string) => {
        setSelectedItems(prev => prev.filter(i => i.key !== key))
    }, [])

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > MAX_FILE_SIZE) { toast.error('La imagen supera los 20MB'); return }
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

    async function handleSave() {
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        if (selectedItems.length === 0) { toast.error('Agrega al menos un producto al combo'); return }
        if (!comboPriceNum) { toast.error('El precio del combo es obligatorio'); return }

        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); router.push('/login'); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { toast.error('Tienda no encontrada'); setLoading(false); return }

        let imageUrl: string | null = null
        if (imageFile) {
            const compressed = imageFile.size > 2 * 1024 * 1024 ? await compressImage(imageFile) : imageFile
            const { data, error } = await supabase.storage.from('product-images')
                .upload(`${store.id}/combo_${Date.now()}.jpg`, compressed, { upsert: false, contentType: 'image/jpeg' })
            if (!error && data) {
                imageUrl = supabase.storage.from('product-images').getPublicUrl(data.path).data.publicUrl
            }
        }

        const { data: combo, error: comboErr } = await supabase.from('combos').insert({
            store_id: store.id,
            name: name.trim(),
            category_id: categoryId || null,
            sale_price: comboPriceNum,
            image_url: imageUrl,
            is_active: true,
        }).select('id').single()

        if (comboErr || !combo) { toast.error('Error al crear el combo'); setLoading(false); return }

        const { error: itemsErr } = await supabase.from('combo_items').insert(
            selectedItems.map(i => ({
                combo_id: combo.id,
                product_id: i.productId,
                variant_id: i.variantId,
                quantity: i.quantity,
            }))
        )

        if (itemsErr) {
            await supabase.from('combos').delete().eq('id', combo.id)
            toast.error('Error al guardar los productos del combo')
            setLoading(false); return
        }

        setLoading(false)
        setSaved(true)
        toast.success('Combo creado')
        setTimeout(() => router.push('/products'), 1800)
    }

    const isValid = name.trim().length > 0 && selectedItems.length > 0 && comboPriceNum > 0
    type BtnState = 'disabled' | 'ready' | 'loading' | 'saved'
    const buttonState: BtnState = saved ? 'saved' : loading ? 'loading' : isValid ? 'ready' : 'disabled'

    return (
        <div style={{ position: 'relative', minHeight: '100dvh' }}>
            <div className="toul-ambient" />

            <div style={{
                position: 'relative',
                padding: '20px 18px 0',
                paddingBottom: 'calc(190px + env(safe-area-inset-bottom, 0px))',
                maxWidth: 520,
                margin: '0 auto',
            }}>

                {/* HEADER */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
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
                        color: 'var(--toul-text)', letterSpacing: '-0.02em', margin: 0,
                    }}>
                        Nuevo combo
                    </h1>
                </motion.div>

                <form
                    id="ncp-form"
                    onSubmit={e => { e.preventDefault(); if (buttonState === 'ready') handleSave() }}>

                    {/* FOTO */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.05, ease: EASE_OUT_EXPO }}
                        style={{ marginBottom: 22 }}>

                        <h2 className="toul-section-label">Foto del combo</h2>

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

                    {/* INFORMACIÓN */}
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
                                placeholder="Ej. Promo san valentín"
                                maxLength={100}
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

                    {/* PRODUCTOS DEL COMBO */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.15, ease: EASE_OUT_EXPO }}
                        style={{ position: 'relative', zIndex: 40 }}>

                        <h2 className="toul-section-label">Productos del combo</h2>

                        {/* Search input — active container with icon */}
                        <div style={{ position: 'relative', marginBottom: 10 }}>
                            <div style={{
                                position: 'relative',
                                borderRadius: 14,
                                background: searchFocused ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                border: `1px solid ${searchFocused ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                            }}>
                                <Search
                                    size={16}
                                    strokeWidth={2}
                                    style={{
                                        position: 'absolute',
                                        left: 14, top: '50%',
                                        transform: 'translateY(-50%)',
                                        color: searchFocused ? 'var(--toul-accent)' : 'rgba(255,255,255,0.4)',
                                        transition: 'color var(--toul-transition)',
                                        pointerEvents: 'none',
                                    }}
                                />
                                <input
                                    type="text"
                                    placeholder={dataLoading ? 'Cargando productos...' : 'Buscar producto o variante...'}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onFocus={() => setSearchFocused(true)}
                                    onBlur={() => setSearchFocused(false)}
                                    disabled={dataLoading}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        outline: 'none',
                                        padding: '14px 16px 14px 42px',
                                        fontSize: 15,
                                        color: 'var(--toul-text)',
                                        fontFamily: 'inherit',
                                    }}
                                />
                            </div>

                            {/* Search results dropdown */}
                            <AnimatePresence>
                                {searchResults.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.18, ease: EASE_OUT_EXPO }}
                                        style={{
                                            position: 'absolute',
                                            left: 0, right: 0,
                                            top: '100%',
                                            marginTop: 6,
                                            borderRadius: 14,
                                            overflow: 'hidden',
                                            background: 'var(--toul-surface-overlay)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                                            zIndex: 50,
                                        }}>
                                        {searchResults.map((item, idx) => (
                                            <motion.button
                                                key={item.key}
                                                type="button"
                                                onClick={() => addItem(item)}
                                                whileTap={{ scale: 0.98 }}
                                                transition={SPRING_PRESS}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '13px 16px',
                                                    background: 'transparent',
                                                    border: 'none',
                                                    borderBottom: idx < searchResults.length - 1
                                                        ? '1px solid rgba(255,255,255,0.05)'
                                                        : 'none',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    fontFamily: 'inherit',
                                                }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{
                                                        fontSize: 14,
                                                        fontWeight: 500,
                                                        color: 'var(--toul-text)',
                                                        margin: 0,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {item.label}
                                                    </p>
                                                    <p style={{
                                                        fontSize: 12,
                                                        color: 'var(--toul-text-dim)',
                                                        margin: '2px 0 0',
                                                        fontVariantNumeric: 'tabular-nums',
                                                    }}>
                                                        {formatCOP(item.price)}
                                                    </p>
                                                </div>
                                                <Plus size={16} color="var(--toul-accent)" strokeWidth={2.4} style={{ flexShrink: 0, marginLeft: 8 }} />
                                            </motion.button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Empty state */}
                        <AnimatePresence>
                            {selectedItems.length === 0 && (
                                <motion.p
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    style={{
                                        textAlign: 'center',
                                        padding: '18px 0',
                                        fontSize: 13,
                                        color: 'var(--toul-text-faint)',
                                        margin: 0,
                                    }}>
                                    Busca y agrega productos al combo
                                </motion.p>
                            )}
                        </AnimatePresence>

                        {/* Selected items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <AnimatePresence initial={false}>
                                {selectedItems.map(item => (
                                    <motion.div
                                        key={item.key}
                                        initial={{ opacity: 0, height: 0, scale: 0.97 }}
                                        animate={{ opacity: 1, height: 'auto', scale: 1 }}
                                        exit={{ opacity: 0, height: 0, scale: 0.97 }}
                                        transition={SPRING_SOFT}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            padding: '10px 12px',
                                            borderRadius: 14,
                                            background: 'var(--toul-surface)',
                                            border: '1px solid var(--toul-border)',
                                        }}>
                                            {/* Left control: delete (qty 1) or minus */}
                                            {item.quantity === 1 ? (
                                                <motion.button
                                                    type="button"
                                                    onClick={() => removeItem(item.key)}
                                                    whileTap={{ scale: 0.9 }}
                                                    transition={SPRING_PRESS}
                                                    style={{
                                                        width: 30, height: 30,
                                                        borderRadius: 9,
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
                                            ) : (
                                                <motion.button
                                                    type="button"
                                                    onClick={() => changeQty(item.key, -1)}
                                                    whileTap={{ scale: 0.9 }}
                                                    transition={SPRING_PRESS}
                                                    style={{
                                                        width: 30, height: 30,
                                                        borderRadius: 9,
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: '1px solid var(--toul-border)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        flexShrink: 0,
                                                    }}>
                                                    <Minus size={13} color="rgba(255,255,255,0.7)" strokeWidth={2.2} />
                                                </motion.button>
                                            )}

                                            {/* Quantity badge */}
                                            {item.quantity > 1 && (
                                                <span style={{
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    color: 'var(--toul-accent)',
                                                    width: 18, textAlign: 'center',
                                                    flexShrink: 0,
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {item.quantity}
                                                </span>
                                            )}

                                            {/* Label + price */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{
                                                    fontSize: 13,
                                                    fontWeight: 500,
                                                    color: 'var(--toul-text)',
                                                    margin: 0,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                    letterSpacing: '-0.01em',
                                                }}>
                                                    {item.label}
                                                </p>
                                                <p style={{
                                                    fontSize: 11,
                                                    color: 'var(--toul-text-dim)',
                                                    margin: '2px 0 0',
                                                    fontVariantNumeric: 'tabular-nums',
                                                }}>
                                                    {formatCOP(item.price)} c/u
                                                </p>
                                            </div>

                                            {/* Plus */}
                                            <motion.button
                                                type="button"
                                                onClick={() => changeQty(item.key, 1)}
                                                whileTap={{ scale: 0.9 }}
                                                transition={SPRING_PRESS}
                                                style={{
                                                    width: 30, height: 30,
                                                    borderRadius: 9,
                                                    background: 'var(--toul-accent-dim)',
                                                    border: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    cursor: 'pointer',
                                                    flexShrink: 0,
                                                }}>
                                                <Plus size={13} color="var(--toul-accent)" strokeWidth={2.4} />
                                            </motion.button>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    </motion.section>

                    <hr className="toul-divider" />

                    {/* PRECIO DEL COMBO + MARGEN */}
                    <motion.section
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT_EXPO }}>

                        <h2 className="toul-section-label">Precio</h2>

                        <div style={{ display: 'flex' }}>
                            <PriceField
                                label="Precio del combo"
                                required
                                value={comboPrice}
                                onChange={setComboPrice}
                            />
                        </div>

                        {/* Resumen: Regular vs Combo + Margen */}
                        <AnimatePresence>
                            {selectedItems.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 8, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                                    transition={SPRING_SOFT}
                                    style={{
                                        marginTop: 12,
                                        padding: '14px 16px',
                                        borderRadius: 14,
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid var(--toul-border)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 10,
                                    }}>

                                    {/* Precio regular row */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                    }}>
                                        <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                            Precio regular
                                        </span>
                                        <span style={{
                                            fontSize: 14,
                                            fontWeight: 500,
                                            color: 'rgba(255,255,255,0.7)',
                                            fontVariantNumeric: 'tabular-nums',
                                            textDecoration: savings > 0 && comboPriceNum > 0 ? 'line-through' : 'none',
                                            opacity: savings > 0 && comboPriceNum > 0 ? 0.6 : 1,
                                        }}>
                                            {formatCOP(regularPrice)}
                                        </span>
                                    </div>

                                    {/* Ahorro row (only if savings) */}
                                    {savings > 0 && comboPriceNum > 0 && (
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}>
                                            <span style={{ fontSize: 13, color: 'var(--toul-text-dim)' }}>
                                                Ahorro cliente
                                            </span>
                                            <span style={{
                                                fontSize: 14,
                                                fontWeight: 500,
                                                color: 'var(--toul-accent)',
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>
                                                −{formatCOP(savings)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Margen row */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingTop: 10,
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <span style={{ fontSize: 14, color: 'var(--toul-text-subtle)', fontWeight: 500 }}>
                                            Margen de ganancia
                                        </span>
                                        <AnimatePresence mode="wait" initial={false}>
                                            <motion.div
                                                key={margin === null ? 'empty' : margin > 35 ? 'high' : margin > 15 ? 'mid' : 'low'}
                                                initial={{ opacity: 0, y: 3 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -3 }}
                                                transition={SPRING_SOFT}
                                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.section>

                </form>
            </div>

            {/* FIXED BOTTOM SAVE */}
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
                        form="ncp-form"
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
                                        <span>Guardar combo</span>
                                    </>
                                )}
                                {buttonState === 'disabled' && (
                                    <span>Guardar combo</span>
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
