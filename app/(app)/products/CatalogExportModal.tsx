'use client'
import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Palette, Download, Check, ChevronDown, Loader2 } from 'lucide-react'
import type { Product } from '@/lib/types'
import { formatCOP } from '@/lib/utils'

interface CatalogExportModalProps {
    products: Product[]
    onClose: () => void
}

export function CatalogExportModal({ products, onClose }: CatalogExportModalProps) {
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [primaryColor, setPrimaryColor] = useState('#10B981')
    const [secondaryColor, setSecondaryColor] = useState('#F3F4F6')
    const [accentColor, setAccentColor] = useState('#111827')
    const [includeOutOfStock, setIncludeOutOfStock] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState<string>('all') // 'all' or category UUID
    const [step, setStep] = useState<'config' | 'confirm' | 'generating'>('config')
    const [generating, setGenerating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fileInputRef = useRef<HTMLInputElement>(null)

    // Extract unique categories from products (joined objects)
    const categories = useMemo(() => {
        const seen = new Map<string, string>()
        products.forEach(p => { if (p.category) seen.set(p.category.id, p.category.name) })
        return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
    }, [products])

    // Filter products based on config
    const filteredProducts = useMemo(() => {
        let result = products
        if (!includeOutOfStock) result = result.filter(p => p.stock > 0)
        if (categoryFilter !== 'all') result = result.filter(p => p.category_id === categoryFilter)
        return result
    }, [products, includeOutOfStock, categoryFilter])

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 5 * 1024 * 1024) {
            setError('El logo no debe pesar más de 5MB')
            return
        }
        const reader = new FileReader()
        reader.onload = (e) => setLogoPreview(e.target?.result as string)
        reader.readAsDataURL(file)
    }

    function getProductImage(product: Product): string | null {
        if (product.images && product.images.length > 0) return product.images[0]
        return product.image_url
    }

    // ─── jsPDF Native Generation ──────────────────────────

    async function handleGeneratePDF() {
        if (filteredProducts.length === 0) return
        setGenerating(true)
        setStep('generating')
        setError(null)

        try {
            const { default: jsPDF } = await import('jspdf')

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const pageWidth = pdf.internal.pageSize.getWidth()  // 210mm
            const pageHeight = pdf.internal.pageSize.getHeight() // 297mm
            const margin = 16

            // ── Cover Page ──
            pdf.setFillColor(primaryColor)
            pdf.rect(0, 0, pageWidth, pageHeight, 'F')

            // Logo on cover
            if (logoPreview) {
                try {
                    pdf.addImage(logoPreview, 'PNG', pageWidth / 2 - 25, 80, 50, 50)
                } catch {
                    // Logo load failed, continue without it
                }
            }

            // Title
            pdf.setFont('helvetica', 'bold')
            pdf.setFontSize(36)
            pdf.setTextColor('#FFFFFF')
            const titleY = logoPreview ? 155 : 130
            pdf.text('Catálogo', pageWidth / 2, titleY, { align: 'center' })

            // Accent line
            pdf.setFillColor(accentColor)
            pdf.rect(pageWidth / 2 - 20, titleY + 10, 40, 2, 'F')

            // Product count
            pdf.setFontSize(12)
            pdf.setFont('helvetica', 'normal')
            pdf.text(`${filteredProducts.length} productos`, pageWidth / 2, titleY + 22, { align: 'center' })

            // ── Product Pages ──
            const colCount = 2
            const cardWidth = (pageWidth - margin * 2 - 12) / colCount  // 12mm gap
            const imageHeight = cardWidth * 0.85
            const cardInfoHeight = 22
            const cardTotalHeight = imageHeight + cardInfoHeight + 6
            const productsPerRow = colCount
            const startY = margin + 12 // space for header
            const maxY = pageHeight - margin

            // Load all images first (async, with error handling)
            const imageDataMap = new Map<string, string>()
            for (const product of filteredProducts) {
                const imgUrl = getProductImage(product)
                if (imgUrl) {
                    try {
                        const dataUrl = await loadImageAsDataUrl(imgUrl)
                        if (dataUrl) imageDataMap.set(product.id, dataUrl)
                    } catch {
                        // Skip failed images
                    }
                }
            }

            let currentY = 0
            let pageStarted = false

            for (let i = 0; i < filteredProducts.length; i++) {
                const col = i % productsPerRow
                const isNewRow = col === 0

                if (isNewRow) {
                    if (!pageStarted || currentY + cardTotalHeight > maxY) {
                        // New page
                        if (pageStarted) pdf.addPage()
                        pageStarted = true
                        currentY = startY

                        // Page header
                        pdf.setFillColor('#FFFFFF')
                        pdf.rect(0, 0, pageWidth, pageHeight, 'F')
                        pdf.setFillColor(secondaryColor)
                        pdf.rect(0, 0, pageWidth, startY - 2, 'F')
                        pdf.setFont('helvetica', 'bold')
                        pdf.setFontSize(10)
                        pdf.setTextColor(primaryColor)
                        pdf.text('PRODUCTOS', margin, margin + 4)

                        // Accent line under header
                        pdf.setFillColor(primaryColor)
                        pdf.rect(margin, startY - 4, pageWidth - margin * 2, 0.5, 'F')
                    }
                }

                const product = filteredProducts[i]
                const x = margin + col * (cardWidth + 12)
                const y = currentY

                // Card background
                pdf.setFillColor(secondaryColor)
                pdf.roundedRect(x, y, cardWidth, cardTotalHeight, 3, 3, 'F')

                // Image
                const imgData = imageDataMap.get(product.id)
                if (imgData) {
                    try {
                        // Clip to rounded rect area
                        pdf.addImage(imgData, 'JPEG', x + 1, y + 1, cardWidth - 2, imageHeight - 2)
                    } catch {
                        // Draw placeholder
                        drawPlaceholder(pdf, x, y, cardWidth, imageHeight, accentColor)
                    }
                } else {
                    drawPlaceholder(pdf, x, y, cardWidth, imageHeight, accentColor)
                }

                // Product name
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(9)
                pdf.setTextColor(accentColor)
                const nameLines = pdf.splitTextToSize(product.name, cardWidth - 8)
                pdf.text(nameLines.slice(0, 2), x + 4, y + imageHeight + 6)

                // Price
                pdf.setFont('helvetica', 'bold')
                pdf.setFontSize(11)
                pdf.setTextColor(primaryColor)
                pdf.text(formatCOP(product.sale_price), x + 4, y + imageHeight + 16)

                // Move to next row after last column
                if (col === productsPerRow - 1) {
                    currentY += cardTotalHeight + 8
                }
            }

            // Handle odd last row
            if (filteredProducts.length % productsPerRow !== 0) {
                currentY += cardTotalHeight + 8
            }

            // Footer on last page
            pdf.setFontSize(8)
            pdf.setFont('helvetica', 'normal')
            pdf.setTextColor('#999999')
            pdf.text('Hecho con TOUL', pageWidth / 2, pageHeight - 8, { align: 'center' })

            // Download
            pdf.save('catalogo.pdf')
        } catch (err) {
            console.error('PDF generation error:', err)
            setError('Error al generar el catálogo. Intenta de nuevo.')
        } finally {
            setGenerating(false)
            setStep('config')
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-lg md:rounded-3xl rounded-t-3xl h-[85vh] md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden"
                style={{ background: 'var(--toul-surface)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--toul-border)' }}>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: 'var(--toul-text)' }}>Exportar Catálogo</h2>
                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>
                            {step === 'generating' ? 'Preparando catálogo...' : 'Configura y genera tu PDF'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5" style={{ color: 'var(--toul-text-subtle)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {step === 'generating' ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Loader2 size={36} className="animate-spin mb-4" style={{ color: 'var(--toul-accent)' }} />
                            <p className="font-semibold mb-1" style={{ color: 'var(--toul-text)' }}>Preparando catálogo...</p>
                            <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>
                                Procesando {filteredProducts.length} productos
                            </p>
                        </div>
                    ) : step === 'confirm' ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
                                style={{ background: 'var(--toul-accent-dim)' }}>
                                <Download size={28} style={{ color: 'var(--toul-accent)' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--toul-text)' }}>Listo para generar</h3>
                            <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                                {filteredProducts.length} productos incluidos
                            </p>
                            {categoryFilter !== 'all' && (
                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                    Categoría: {categories.find(c => c.id === categoryFilter)?.name ?? categoryFilter}
                                </p>
                            )}
                            {error && (
                                <p className="text-sm mt-3 text-red-500">{error}</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Logo */}
                            <section>
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Upload size={14} /> Logo (Opcional)
                                </h3>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors"
                                    style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface-2)' }}
                                >
                                    {logoPreview ? (
                                        <div className="relative w-20 h-20 mx-auto">
                                            <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setLogoPreview(null); }}
                                                className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full shadow"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <Upload size={18} className="mx-auto mb-2" style={{ color: 'var(--toul-text-subtle)' }} />
                                            <p className="text-xs font-medium" style={{ color: 'var(--toul-text-muted)' }}>Toca para subir</p>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLogoUpload} />
                                </div>
                            </section>

                            {/* Colors */}
                            <section>
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Palette size={14} /> Colores
                                </h3>
                                <div className="grid grid-cols-3 gap-3">
                                    <ColorPicker label="Primario" sublabel="Portada, títulos" value={primaryColor} onChange={setPrimaryColor} />
                                    <ColorPicker label="Secundario" sublabel="Fondos" value={secondaryColor} onChange={setSecondaryColor} />
                                    <ColorPicker label="Acento" sublabel="Textos, líneas" value={accentColor} onChange={setAccentColor} />
                                </div>
                            </section>

                            {/* Options */}
                            <section>
                                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Check size={14} /> Opciones
                                </h3>
                                <div className="space-y-2.5">
                                    {/* Out of stock toggle */}
                                    <label className="flex items-center justify-between p-3.5 rounded-xl border cursor-pointer"
                                        style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Incluir sin stock</p>
                                            <p className="text-[11px]" style={{ color: 'var(--toul-text-subtle)' }}>
                                                {includeOutOfStock ? 'Todos los productos' : 'Solo con stock'}
                                            </p>
                                        </div>
                                        <div className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${includeOutOfStock ? 'bg-green-500' : 'bg-gray-600'}`}>
                                            <motion.div layout className="w-4 h-4 bg-white rounded-full shadow"
                                                style={{ marginLeft: includeOutOfStock ? 'auto' : 0 }} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={includeOutOfStock}
                                            onChange={(e) => setIncludeOutOfStock(e.target.checked)} />
                                    </label>

                                    {/* Category filter */}
                                    {categories.length > 0 && (
                                        <div className="p-3.5 rounded-xl border"
                                            style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                            <p className="text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text)' }}>Categoría</p>
                                            <div className="relative">
                                                <select
                                                    className="toul-input text-sm w-full"
                                                    value={categoryFilter}
                                                    onChange={e => setCategoryFilter(e.target.value)}
                                                >
                                                    <option value="all">Todas las categorías</option>
                                                    {categories.map(cat => (
                                                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Summary */}
                            <div className="text-center py-2">
                                <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                    {filteredProducts.length} productos serán incluidos
                                </p>
                            </div>

                            {error && (
                                <p className="text-sm text-center text-red-500">{error}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step !== 'generating' && (
                    <div className="p-5 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                        {step === 'config' ? (
                            <button
                                onClick={() => setStep('confirm')}
                                disabled={filteredProducts.length === 0}
                                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold transition-transform active:scale-[0.98] disabled:opacity-50"
                                style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}
                            >
                                Continuar
                            </button>
                        ) : (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('config')}
                                    className="px-5 py-3 rounded-2xl font-bold border transition-colors"
                                    style={{ borderColor: 'var(--toul-border)', color: 'var(--toul-text)' }}
                                >
                                    Atrás
                                </button>
                                <button
                                    onClick={handleGeneratePDF}
                                    disabled={generating || filteredProducts.length === 0}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-bold transition-transform active:scale-[0.98] disabled:opacity-70"
                                    style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}
                                >
                                    <Download size={16} /> Generar PDF
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </motion.div>
        </div>
    )
}

// ─── Helper Components ────────────────────────────────────

function ColorPicker({
    label,
    sublabel,
    value,
    onChange,
}: {
    label: string
    sublabel: string
    value: string
    onChange: (v: string) => void
}) {
    return (
        <div className="p-3 rounded-xl border flex flex-col items-center gap-2"
            style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
            <input type="color" value={value} onChange={e => onChange(e.target.value)}
                className="w-8 h-8 rounded-lg border-none cursor-pointer p-0" style={{ background: 'transparent' }} />
            <div className="text-center">
                <p className="text-xs font-medium" style={{ color: 'var(--toul-text)' }}>{label}</p>
                <p className="text-[10px]" style={{ color: 'var(--toul-text-subtle)' }}>{sublabel}</p>
            </div>
        </div>
    )
}

// ─── Image Loader ─────────────────────────────────────────

function loadImageAsDataUrl(url: string): Promise<string | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas')
                // Normalize to max 400px for PDF performance
                const maxSize = 400
                const ratio = Math.min(1, maxSize / Math.max(img.width, img.height))
                canvas.width = img.width * ratio
                canvas.height = img.height * ratio
                const ctx = canvas.getContext('2d')
                if (!ctx) { resolve(null); return }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                resolve(canvas.toDataURL('image/jpeg', 0.75))
            } catch {
                resolve(null)
            }
        }
        img.onerror = () => resolve(null)
        // Timeout to prevent hanging
        setTimeout(() => resolve(null), 8000)
        img.src = url
    })
}

// ─── PDF Placeholder ──────────────────────────────────────

function drawPlaceholder(
    pdf: any,
    x: number,
    y: number,
    width: number,
    height: number,
    textColor: string,
) {
    pdf.setFillColor('#E5E7EB')
    pdf.rect(x + 1, y + 1, width - 2, height - 2, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(20)
    pdf.setTextColor('#9CA3AF')
    pdf.text('📦', x + width / 2, y + height / 2 + 4, { align: 'center' })
    pdf.setTextColor(textColor) // Reset
}
