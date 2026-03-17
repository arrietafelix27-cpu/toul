'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { ArrowLeft, Camera, X, Plus, ImageIcon } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

const MAX_IMAGES = 3
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
                const result = blob ? new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file
                resolve(result)
            }, 'image/jpeg', 0.82)
        }
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
        img.src = url
    })
}

export default function NewProductPage() {
    const router = useRouter()
    const supabase = createClient()
    const fileRef = useRef<HTMLInputElement>(null)

    const [categories, setCategories] = useState<{ name: string, is_custom: boolean }[]>([])
    const [name, setName] = useState('')
    const [reference, setReference] = useState('')
    const [category, setCategory] = useState('')
    const [salePrice, setSalePrice] = useState('')
    const [costPrice, setCostPrice] = useState('')
    const [imageFiles, setImageFiles] = useState<File[]>([])
    const [imagePreviews, setImagePreviews] = useState<string[]>([])
    const [loading, setLoading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)

    useEffect(() => {
        const loadCats = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
            if (!store) return

            const saved = localStorage.getItem(`toul_categories_${store.id}`)
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    setCategories(parsed)
                    if (parsed.length > 0) setCategory(parsed[0].name)
                } catch (e) { }
            } else {
                const defaults = ['General', 'Hogar', 'Tecnología', 'Ropa', 'Accesorios', 'Comida', 'Servicios', 'Otros'].map(c => ({ name: c, is_custom: false }))
                setCategories(defaults)
                setCategory('General')
            }
        }
        loadCats()

        const handleUpdate = () => loadCats()
        window.addEventListener('toul_categories_updated', handleUpdate)
        return () => window.removeEventListener('toul_categories_updated', handleUpdate)
    }, [supabase])

    function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        const remaining = MAX_IMAGES - imageFiles.length
        const toAdd = files.slice(0, remaining)
        const oversized = toAdd.find(f => f.size > MAX_FILE_SIZE)
        if (oversized) { toast.error(`"${oversized.name}" supera los 20MB`); return }
        setImageFiles(prev => [...prev, ...toAdd])
        toAdd.forEach(file => {
            const reader = new FileReader()
            reader.onload = ev => setImagePreviews(prev => [...prev, ev.target?.result as string])
            reader.readAsDataURL(file)
        })
        e.target.value = ''
    }

    function removeImage(idx: number) {
        setImageFiles(prev => prev.filter((_, i) => i !== idx))
        setImagePreviews(prev => prev.filter((_, i) => i !== idx))
    }

    async function uploadImageToStorage(storeId: string, file: File, index: number): Promise<string | null> {
        const compressed = file.size > 2 * 1024 * 1024 ? await compressImage(file) : file
        const fileName = `${Date.now()}_${index}.jpg`
        const path = `${storeId}/${fileName}`

        const { data, error } = await supabase.storage
            .from('product-images')
            .upload(path, compressed, { upsert: false, contentType: 'image/jpeg' })

        if (error) {
            console.error('Upload error:', error)
            toast.error(`Error subiendo imagen ${index + 1}: ${error.message}`)
            return null
        }

        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(data.path)
        return publicUrl
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
        const priceNum = Number(salePrice)
        if (!salePrice || priceNum <= 0) { toast.error('Ingresa un precio de venta válido'); return }

        setLoading(true)
        setUploadProgress(0)

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
        if (!store) { setLoading(false); toast.error('No se encontró la tienda'); return }

        // Upload images one by one
        const imageUrls: string[] = []
        for (let i = 0; i < imageFiles.length; i++) {
            setUploadProgress(Math.round(((i + 0.5) / imageFiles.length) * 85))
            const url = await uploadImageToStorage(store.id, imageFiles[i], i)
            if (url) imageUrls.push(url)
        }
        setUploadProgress(90)

        const cp = Number(costPrice) || 0
        const productData: Record<string, unknown> = {
            store_id: store.id,
            name: name.trim(),
            category,
            description: null,
            sale_price: priceNum,
            cost_price: cp,
            average_cost: cp,
            cpp: cp,
            stock: 0,
            image_url: imageUrls[0] || null,
            is_active: true,
        }

        // Try to add optional columns (only if migration has been run)
        if (reference.trim()) productData.reference = reference.trim()
        if (imageUrls.length > 0) productData.images = imageUrls

        const { error } = await supabase.from('products').insert(productData)

        setUploadProgress(100)
        if (error) {
            // Fallback: The user might not have run the latest migrations (v2 or v3)
            // Let's try inserting only the basic required columns
            delete productData.images
            delete productData.reference
            delete productData.category
            delete productData.average_cost

            const { error: retryError } = await supabase.from('products').insert(productData)
            if (retryError) {
                toast.error('Error al crear el producto: ' + retryError.message)
            } else {
                toast.success('Producto creado (Modo compatibilidad) ✅')
                router.push('/products') // Redirecting to /products as the new route
            }
        } else {
            toast.success('Producto creado ✅')
            router.push('/products')
        }
        setLoading(false)
    }

    const profitPerUnit = Number(salePrice) - Number(costPrice)
    const margin = Number(salePrice) > 0 ? (profitPerUnit / Number(salePrice) * 100) : 0

    return (
        <div className="px-4 md:px-8 pt-6 pb-14 max-w-lg">
            {/* Back */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/products"
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <h1 className="text-lg font-bold" style={{ color: 'var(--toul-text)' }}>Nuevo producto</h1>
            </div>

            <form onSubmit={handleSave} className="flex flex-col gap-5">
                {/* Images */}
                <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                        Fotos del producto <span className="font-normal text-xs" style={{ color: 'var(--toul-text-subtle)' }}>(hasta {MAX_IMAGES} · 20MB c/u)</span>
                    </label>
                    <div className="flex gap-2 flex-wrap">
                        <AnimatePresence>
                            {imagePreviews.map((preview, idx) => (
                                <motion.div key={`img-${idx}`}
                                    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.18 }}
                                    className="relative w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0"
                                    style={{ border: `2px solid ${idx === 0 ? 'var(--toul-accent)' : 'var(--toul-border)'}` }}>
                                    <img src={preview} alt="" className="w-full h-full object-cover" />
                                    {idx === 0 && (
                                        <span className="absolute bottom-0 left-0 right-0 text-center py-0.5 text-[9px] font-bold"
                                            style={{ background: 'rgba(16,185,129,0.88)', color: '#fff' }}>PRINCIPAL</span>
                                    )}
                                    <button type="button" onClick={() => removeImage(idx)}
                                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}>
                                        <X size={10} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {imagePreviews.length < MAX_IMAGES && (
                            <button type="button" onClick={() => fileRef.current?.click()}
                                className="w-24 h-24 rounded-2xl flex flex-col items-center justify-center gap-1.5 flex-shrink-0 transition-all active:scale-95"
                                style={{ border: '2px dashed var(--toul-border)', background: 'var(--toul-surface)' }}>
                                <ImageIcon size={20} style={{ color: 'var(--toul-text-subtle)' }} />
                                <span className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>
                                    {imagePreviews.length === 0 ? 'Agregar foto' : `+${MAX_IMAGES - imagePreviews.length} más`}
                                </span>
                            </button>
                        )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={handleImageSelect} capture="environment" />
                </div>

                {/* Name */}
                <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                        Nombre <span style={{ color: 'var(--toul-error)' }}>*</span>
                    </label>
                    <input className="toul-input" type="text" placeholder="Ej. Perfume floral 100ml"
                        value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
                </div>

                {/* Reference */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Referencia <span className="font-normal text-xs" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                        </label>
                        <input className="toul-input" type="text" placeholder="Ej. REF-001"
                            value={reference} onChange={e => setReference(e.target.value)} maxLength={50} />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
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
                </div>

                {/* Prices */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Precio de venta <span style={{ color: 'var(--toul-error)' }}>*</span>
                        </label>
                        <input className="toul-input" type="number" min={0} step={100} placeholder="0"
                            value={salePrice} onChange={e => setSalePrice(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Costo <span className="font-normal text-xs" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                        </label>
                        <input className="toul-input" type="number" min={0} step={100} placeholder="0"
                            value={costPrice} onChange={e => setCostPrice(e.target.value)} />
                    </div>
                </div>

                {/* Margin preview */}
                <AnimatePresence>
                    {Number(salePrice) > 0 && Number(costPrice) > 0 && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            className="toul-card flex items-center justify-between py-3">
                            <div>
                                <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Ganancia por unidad</p>
                                <p className="font-bold" style={{ color: profitPerUnit >= 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(profitPerUnit)}
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-xs mb-0.5" style={{ color: 'var(--toul-text-muted)' }}>Margen</p>
                                <p className="font-bold text-lg" style={{ color: margin > 0 ? 'var(--toul-accent)' : 'var(--toul-error)' }}>
                                    {margin.toFixed(1)}%
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Upload progress */}
                <AnimatePresence>
                    {loading && uploadProgress > 0 && uploadProgress < 100 && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <p className="text-xs mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                                Subiendo imágenes... {uploadProgress}%
                            </p>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--toul-border)' }}>
                                <motion.div className="h-full rounded-full" style={{ background: 'var(--toul-accent)' }}
                                    animate={{ width: `${uploadProgress}%` }} transition={{ duration: 0.3 }} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <button type="submit" disabled={loading}
                    className="toul-btn-primary mt-1 disabled:opacity-60">
                    {loading ? (uploadProgress < 90 ? 'Subiendo fotos...' : 'Guardando...') : 'Guardar producto'}
                </button>
            </form>
        </div>
    )
}
