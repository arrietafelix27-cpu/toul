'use client'
import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Palette, Eye, Download, Check } from 'lucide-react'
import type { Product } from '@/lib/types'
import { formatCOP } from '@/lib/utils'

interface CatalogExportModalProps {
    products: Product[]
    onClose: () => void
}

export function CatalogExportModal({ products, onClose }: CatalogExportModalProps) {
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [primaryColor, setPrimaryColor] = useState('#10B981') // TOUL accent default
    const [secondaryColor, setSecondaryColor] = useState('#F3F4F6') // Soft gray
    const [textColor, setTextColor] = useState('#111827') // Dark text
    const [includeOutOfStock, setIncludeOutOfStock] = useState(false)
    const [showLogoOnPages, setShowLogoOnPages] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [step, setStep] = useState<'config' | 'preview'>('config')

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onload = (e) => setLogoPreview(e.target?.result as string)
            reader.readAsDataURL(file)
        }
    }

    const filteredProducts = products.filter(p => includeOutOfStock || p.stock > 0)

    const handlePrint = () => {
        setGenerating(true)
        setTimeout(() => {
            window.print()
            setGenerating(false)
        }, 500)
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
                className="relative w-full max-w-2xl bg-white md:rounded-3xl rounded-t-3xl h-[85vh] md:h-auto md:max-h-[90vh] flex flex-col overflow-hidden"
                style={{ background: 'var(--toul-surface)' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--toul-border)' }}>
                    <div>
                        <h2 className="text-xl font-bold" style={{ color: 'var(--toul-text)' }}>Exportar Catálogo</h2>
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Configura el diseño de tu catálogo en PDF</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5" style={{ color: 'var(--toul-text-subtle)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {step === 'config' ? (
                        <div className="space-y-8">
                            {/* Logo */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Upload size={16} /> 1. Logo del negocio (Opcional)
                                </h3>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors"
                                    style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface-2)' }}
                                >
                                    {logoPreview ? (
                                        <div className="relative w-24 h-24 mx-auto">
                                            <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setLogoPreview(null); }}
                                                className="absolute -top-3 -right-3 p-1.5 bg-red-500 text-white rounded-full shadow-lg"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--toul-surface)' }}>
                                                <Upload size={20} style={{ color: 'var(--toul-text-subtle)' }} />
                                            </div>
                                            <p className="font-medium text-sm" style={{ color: 'var(--toul-text)' }}>Toca para subir un logo</p>
                                            <p className="text-xs mt-1" style={{ color: 'var(--toul-text-muted)' }}>Formatos PNG o JPG recomendados</p>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLogoUpload} />
                                </div>
                            </section>

                            {/* Colors */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Palette size={16} /> 2. Colores del catálogo
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="p-4 rounded-2xl border flex items-center justify-between" style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Principal</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Títulos, portada</p>
                                        </div>
                                        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer p-0" />
                                    </div>
                                    <div className="p-4 rounded-2xl border flex items-center justify-between" style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Secundario</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Fondos de producto</p>
                                        </div>
                                        <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer p-0" />
                                    </div>
                                    <div className="p-4 rounded-2xl border flex items-center justify-between" style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Detalles/Texto</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Precios, líneas</p>
                                        </div>
                                        <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer p-0" />
                                    </div>
                                </div>
                            </section>

                            {/* Options */}
                            <section>
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--toul-text)' }}>
                                    <Check size={16} /> 3. Opciones de contenido
                                </h3>
                                <div className="space-y-3">
                                    <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer" style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Incluir productos sin stock</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>
                                                {includeOutOfStock ? 'Se exportarán todos los productos' : 'Solo productos con stock mayor a 0'}
                                            </p>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${includeOutOfStock ? 'bg-green-500' : 'bg-gray-200'}`}>
                                            <motion.div layout className="w-4 h-4 bg-white rounded-full shadow" style={{ marginLeft: includeOutOfStock ? 'auto' : 0 }} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={includeOutOfStock} onChange={(e) => setIncludeOutOfStock(e.target.checked)} />
                                    </label>
                                    <label className="flex items-center justify-between p-4 rounded-2xl border cursor-pointer" style={{ borderColor: 'var(--toul-border)', background: 'var(--toul-surface)' }}>
                                        <div>
                                            <p className="text-sm font-medium" style={{ color: 'var(--toul-text)' }}>Logo en cada página</p>
                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Mostrar un logo pequeño en las esquinas</p>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full transition-colors flex items-center px-1 ${showLogoOnPages ? 'bg-green-500' : 'bg-gray-200'}`}>
                                            <motion.div layout className="w-4 h-4 bg-white rounded-full shadow" style={{ marginLeft: showLogoOnPages ? 'auto' : 0 }} />
                                        </div>
                                        <input type="checkbox" className="hidden" checked={showLogoOnPages} onChange={(e) => setShowLogoOnPages(e.target.checked)} />
                                    </label>
                                </div>
                            </section>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-20 h-20 rounded-full mb-4 flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: primaryColor }}>
                                <Download size={32} />
                            </div>
                            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>Listo para exportar</h3>
                            <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: 'var(--toul-text-muted)' }}>
                                Se han incluido {filteredProducts.length} productos en tu catálogo.
                                Al presionar generar, se abrirá la vista de impresión. Guarda como PDF para enviarlo a tus clientes.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer action */}
                <div className="p-5 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                    {step === 'config' ? (
                        <button
                            onClick={() => setStep('preview')}
                            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold transition-transform active:scale-[0.98]"
                            style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}
                        >
                            <Eye size={18} /> Continuar
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep('config')}
                                className="px-6 py-3.5 rounded-2xl font-bold border transition-colors"
                                style={{ borderColor: 'var(--toul-border)', color: 'var(--toul-text)' }}
                            >
                                Atrás
                            </button>
                            <button
                                onClick={handlePrint}
                                disabled={generating}
                                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white font-bold transition-transform active:scale-[0.98] disabled:opacity-70 disabled:scale-100"
                                style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}
                            >
                                {generating ? (
                                    <span className="animate-pulse">Generando...</span>
                                ) : (
                                    <>
                                        <Download size={18} /> Generar PDF
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* THE ACTUAL PRINTABLE DOCUMENT (Hidden from screen, visible on print) */}
                <div id="catalog-print-area" className="hidden print:block fixed inset-0 bg-white z-[9999]">
                    <style>{`
                        @media print {
                            body * { visibility: hidden; }
                            #catalog-print-area, #catalog-print-area * { visibility: visible; }
                            #catalog-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                            @page { size: A4 portrait; margin: 0; }
                            .page-break { page-break-after: always; }
                        }
                    `}</style>

                    {/* COVER PAGE */}
                    <div className="w-full h-screen flex flex-col items-center justify-center page-break relative" style={{ backgroundColor: secondaryColor }}>
                        {logoPreview && (
                            <img src={logoPreview} alt="Logo" className="w-48 h-48 object-contain mb-12 shadow-2xl rounded-3xl" style={{ backgroundColor: '#fff', padding: '1rem' }} />
                        )}
                        <h1 className="text-7xl font-extrabold uppercase tracking-widest text-center" style={{ color: primaryColor }}>Catálogo</h1>
                        <div className="w-32 h-2 mt-8 rounded-full" style={{ backgroundColor: textColor }}></div>
                    </div>

                    {/* PRODUCT PAGES */}
                    <div className="p-12 w-full h-screen bg-white" style={{ backgroundColor: '#fff' }}>
                        {/* Header for internal pages */}
                        <div className="flex items-end justify-between border-b-2 pb-6 mb-10" style={{ borderColor: primaryColor }}>
                            <h2 className="text-3xl font-bold uppercase tracking-widest" style={{ color: primaryColor }}>Productos</h2>
                            {showLogoOnPages && logoPreview && (
                                <img src={logoPreview} alt="Logo" className="h-12 w-auto object-contain" />
                            )}
                        </div>

                        {/* Grid */}
                        <div className="grid grid-cols-3 gap-8">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="flex flex-col rounded-2xl overflow-hidden border shadow-sm" style={{ borderColor: secondaryColor }}>
                                    <div className="w-full aspect-square bg-gray-100 relative" style={{ backgroundColor: secondaryColor }}>
                                        {p.images && p.images[0] ? (
                                            <img src={p.images[0]} className="w-full h-full object-cover" />
                                        ) : p.image_url ? (
                                            <img src={p.image_url} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-4xl">📦</div>
                                        )}
                                    </div>
                                    <div className="p-4" style={{ backgroundColor: '#fff' }}>
                                        <p className="text-sm font-semibold mb-1 line-clamp-2" style={{ color: textColor }}>{p.name}</p>
                                        <p className="text-lg font-bold" style={{ color: primaryColor }}>{formatCOP(p.sale_price)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
