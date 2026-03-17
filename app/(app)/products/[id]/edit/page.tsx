'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, X, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, t } from '@/lib/motion'

const MAX_IMAGES = 3
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
                resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
            }, 'image/jpeg', 0.82)
        }
        img.src = url
    })
}

export default function EditProductPage() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [product, setProduct] = useState<Product | null>(null)
    const [name, setName] = useState('')
    const [reference, setReference] = useState('')
    const [salePrice, setSalePrice] = useState('')
    const [costPrice, setCostPrice] = useState('') // This represents the 'average_cost' or 'cost_price' we edit if no stock
    const [category, setCategory] = useState('General')
    const [existingImages, setExistingImages] = useState<string[]>([]) // already uploaded
    const [newImageFiles, setNewImageFiles] = useState<File[]>([])
    const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)

    const totalImages = existingImages.length + newImagePreviews.length

    const [categories, setCategories] = useState<{ name: string, is_custom: boolean }[]>([])

    const loadProduct = useCallback(async () => {
        const { data } = await supabase.from('products').select('*').eq('id', id).single()
        if (!data) { setLoading(false); return }
        setProduct(data)
        setName(data.name)
        setReference(data.reference || '')
        setSalePrice(String(data.sale_price))
        setCostPrice(data.cpp > 0 ? String(data.cpp) : (data.cost_price > 0 ? String(data.cost_price) : ''))
        setCategory(data.category || 'General')
        // Build image list
        const imgs: string[] = data.images && data.images.length > 0 ? [...data.images] : (data.image_url ? [data.image_url] : [])
        setExistingImages(imgs)
        setLoading(false)
    }, [id])

    useEffect(() => { loadProduct() }, [loadProduct])

    useEffect(() => {
        const loadCats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return

            const saved = localStorage.getItem(`toul_categories_${store.id}`)
            if (saved) {
                try {
                    setCategories(JSON.parse(saved))
                } catch (e) { }
            } else {
                const defaults = ['General', 'Hogar', 'Tecnología', 'Ropa', 'Accesorios', 'Comida', 'Servicios', 'Otros'].map(c => ({ name: c, is_custom: false }))
                setCategories(defaults)
            }
        }
        loadCats()
        const handleUpdate = () => loadCats()
        window.addEventListener('toul_categories_updated', handleUpdate)
        return () => window.removeEventListener('toul_categories_updated', handleUpdate)
    }, [supabase])

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || [])
        const remaining = MAX_IMAGES - totalImages
        const toAdd = files.slice(0, remaining)
        for (const f of toAdd) {
            if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name} supera 20MB`); return }
        }
        setNewImageFiles(prev => [...prev, ...toAdd])
        toAdd.forEach(file => {
            const reader = new FileReader()
            reader.onload = ev => setNewImagePreviews(prev => [...prev, ev.target?.result as string])
            reader.readAsDataURL(file)
        })
        e.target.value = ''
    }

    function removeExistingImage(idx: number) {
        setExistingImages(prev => prev.filter((_, i) => i !== idx))
    }

    function removeNewImage(idx: number) {
        setNewImageFiles(prev => prev.filter((_, i) => i !== idx))
        setNewImagePreviews(prev => prev.filter((_, i) => i !== idx))
    }

    async function uploadNewImages(storeId: string): Promise<string[]> {
        const urls: string[] = []
        for (let i = 0; i < newImageFiles.length; i++) {
            setUploadProgress(Math.round((i / newImageFiles.length) * 80))
            let file = newImageFiles[i]
            if (file.size > 2 * 1024 * 1024) file = await compressImage(file)
            const path = `${storeId}/${Date.now()}_${i}.jpg`
            const { error } = await supabase.storage.from('product-images').upload(path, file)
            if (error) { toast.error(`Error subiendo imagen ${i + 1}`); continue }
            const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
            urls.push(publicUrl)
        }
        setUploadProgress(100)
        return urls
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        if (!salePrice || Number(salePrice) <= 0) { toast.error('Precio de venta inválido'); return }
        setSaving(true)
        setUploadProgress(0)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setSaving(false); return }

        const newUrls = newImageFiles.length > 0 ? await uploadNewImages(store.id) : []
        const allImages = [...existingImages, ...newUrls]

        const updates: any = {
            name: name.trim(),
            reference: reference.trim() || null,
            category,
            sale_price: Number(salePrice),
            image_url: allImages[0] || null,
            images: allImages,
            updated_at: new Date().toISOString(),
        }

        // Only allow updating cost if stock is 0
        if (product && product.stock === 0) {
            const cp = Number(costPrice) || 0
            updates.cost_price = cp
            updates.cpp = cp // update cpp to match if stock is 0
        }

        const { error } = await supabase.from('products').update(updates).eq('id', id)

        if (error) {
            // Fallback for missing migrations
            delete updates.category
            delete updates.reference
            delete updates.cost_price
            delete updates.cpp
            delete updates.images

            const { error: retryError } = await supabase.from('products').update(updates).eq('id', id)
            if (retryError) {
                toast.error('Error al guardar: ' + retryError.message)
            } else {
                toast.success('Producto actualizado (Compatibilidad) ✅')
                router.push(`/products/${id}`)
            }
        } else {
            toast.success('Producto actualizado ✅')
            router.push(`/products/${id}`)
        }
        setSaving(false)
    }

    async function handleDelete() {
        if (!product) return
        if (product.stock > 0) {
            toast.error('No puedes eliminar un producto con stock')
            return
        }
        const confirm = window.confirm('¿Seguro que deseas eliminar este producto?')
        if (!confirm) return
        setDeleting(true)
        const { error } = await supabase.from('products').delete().eq('id', id)
        if (error) {
            toast.error('Error al eliminar')
            setDeleting(false)
        } else {
            toast.success('Producto eliminado')
            router.push('/products')
        }
    }

    if (loading) return (
        <div className="px-4 pt-6">
            <div className="skeleton h-12 w-48 rounded-xl mb-5" />
            <div className="skeleton h-28 w-full rounded-2xl mb-3" />
            <div className="skeleton h-14 w-full rounded-2xl mb-3" />
        </div>
    )
    if (!product) return <div className="p-8 text-center" style={{ color: 'var(--toul-text-muted)' }}>Producto no encontrado</div>

    const profitPerUnit = Number(salePrice) - Number(costPrice)
    const margin = Number(salePrice) > 0 ? (profitPerUnit / Number(salePrice) * 100) : 0

    return (
        <div className="px-4 md:px-8 pt-6 pb-10 max-w-lg">
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6">
                <Link href={`/products/${id}`}
                    className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <h1 className="text-lg font-bold" style={{ color: 'var(--toul-text)' }}>Editar producto</h1>
            </motion.div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
                {/* Images */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible">
                    <label className="block text-sm font-medium mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                        Imágenes <span style={{ color: 'var(--toul-text-subtle)' }}>(hasta 3)</span>
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        {/* Existing images */}
                        <AnimatePresence>
                            {existingImages.map((url, idx) => (
                                <motion.div key={`ex-${idx}`}
                                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                                    transition={t.base}
                                    className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0"
                                    style={{ border: '2px solid var(--toul-border)' }}>
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                    {idx === 0 && (
                                        <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5"
                                            style={{ background: 'rgba(16,185,129,0.85)', color: '#fff' }}>PRINCIPAL</span>
                                    )}
                                    <button type="button" onClick={() => removeExistingImage(idx)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white"
                                        style={{ background: 'rgba(239,68,68,0.85)' }}>
                                        <X size={10} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {/* New image previews */}
                        <AnimatePresence>
                            {newImagePreviews.map((preview, idx) => (
                                <motion.div key={`new-${idx}`}
                                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                                    transition={t.base}
                                    className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0"
                                    style={{ border: '2px dashed var(--toul-accent)' }}>
                                    <img src={preview} alt="" className="w-full h-full object-cover opacity-80" />
                                    <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5"
                                        style={{ background: 'rgba(99,102,241,0.85)', color: '#fff' }}>NUEVA</span>
                                    <button type="button" onClick={() => removeNewImage(idx)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white"
                                        style={{ background: 'rgba(239,68,68,0.85)' }}>
                                        <X size={10} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {/* Add button */}
                        {totalImages < MAX_IMAGES && (
                            <button type="button" onClick={() => fileRef.current?.click()}
                                className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1 flex-shrink-0 transition-all active:scale-95"
                                style={{ border: '2px dashed var(--toul-border)', background: 'var(--toul-surface)' }}>
                                <Plus size={20} style={{ color: 'var(--toul-text-subtle)' }} />
                                <span className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>{totalImages}/{MAX_IMAGES}</span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                </motion.div>

                {/* Name */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                        Nombre <span style={{ color: 'var(--toul-error)' }}>*</span>
                    </label>
                    <input className="toul-input" type="text" value={name}
                        onChange={e => setName(e.target.value)} maxLength={100} required />
                </motion.div>

                {/* Reference */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                        Referencia <span style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                    </label>
                    <input className="toul-input" type="text" placeholder="Ej. LEG-001"
                        value={reference} onChange={e => setReference(e.target.value)} maxLength={50} />
                </motion.div>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Categoría
                        </label>
                        <select
                            className="toul-input w-full"
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                        >
                            {categories.map(c => (
                                <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </motion.div>

                {/* Prices */}
                <motion.div variants={fadeUp} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Precio de venta <span style={{ color: 'var(--toul-error)' }}>*</span>
                        </label>
                        <input className="toul-input" type="number" min={0}
                            value={salePrice} onChange={e => setSalePrice(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Costo promedio
                        </label>
                        <input className="toul-input disabled:opacity-50" type="number" min={0} placeholder="0"
                            value={costPrice} onChange={e => setCostPrice(e.target.value)}
                            disabled={product?.stock > 0} title={product?.stock > 0 ? "Solo se actualiza mediante compras ya que hay stock" : ""} />
                        {product?.stock > 0 && (
                            <p className="text-[10px] mt-1 text-orange-500 font-medium">No editable con stock vivo</p>
                        )}
                    </div>
                </motion.div>

                {/* Margin preview */}
                <AnimatePresence>
                    {salePrice && costPrice && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="toul-card flex items-center justify-between py-3">
                            <div>
                                <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Ganancia por unidad</p>
                                <p className="font-bold" style={{ color: profitPerUnit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {formatCOP(profitPerUnit)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Margen</p>
                                <p className="font-bold text-lg" style={{ color: margin >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {margin.toFixed(1)}%
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Upload progress */}
                <AnimatePresence>
                    {saving && uploadProgress > 0 && uploadProgress < 100 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--toul-border)' }}>
                                <motion.div className="h-full rounded-full" style={{ background: 'var(--toul-accent)' }}
                                    animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex gap-3 mt-1">
                    {product?.stock === 0 && (
                        <motion.button type="button" onClick={handleDelete} variants={fadeUp} initial="hidden" animate="visible"
                            className="w-14 flex-shrink-0 flex items-center justify-center rounded-2xl border transition-colors hover:bg-red-50"
                            style={{ borderColor: 'var(--toul-border)', color: 'var(--toul-error)' }}
                            disabled={deleting}
                            whileTap={!deleting ? { scale: 0.98 } : {}}>
                            {deleting ? <span className="animate-spin text-lg">⟳</span> : <Trash2 size={20} />}
                        </motion.button>
                    )}
                    <motion.button type="submit" variants={fadeUp} initial="hidden" animate="visible"
                        className="toul-btn-primary flex-1" disabled={saving || deleting}
                        whileTap={!(saving || deleting) ? { scale: 0.98 } : {}}>
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                    </motion.button>
                </div>
            </form>
        </div>
    )
}
