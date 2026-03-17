'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCOP } from '@/lib/utils'
import { ArrowLeft, Download, Palette, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { Product } from '@/lib/types'
import { motion } from 'framer-motion'

const COLOR_PRESETS = [
    { name: 'Esmeralda', bg: '#0B1120', accent: '#10B981', text: '#F5F5F5', card: '#161616' },
    { name: 'Blanco limpio', bg: '#FAFAFA', accent: '#111111', text: '#111111', card: '#FFFFFF' },
    { name: 'Beige editorial', bg: '#F5EFE6', accent: '#8B6914', text: '#2D2D2D', card: '#FFFFFF' },
    { name: 'Azul marino', bg: '#0F172A', accent: '#38BDF8', text: '#F1F5F9', card: '#1E293B' },
    { name: 'Rosa boutique', bg: '#FFF0F5', accent: '#BE185D', text: '#1F0A15', card: '#FFFFFF' },
    { name: 'Negro premium', bg: '#0A0A0A', accent: '#D4AF37', text: '#F5F5F5', card: '#181818' },
]

export default function CatalogExportPage() {
    const supabase = createClient()
    const catalogRef = useRef<HTMLDivElement>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [storeName, setStoreName] = useState('')
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [palette, setPalette] = useState(COLOR_PRESETS[0])
    const [customAccent, setCustomAccent] = useState('')
    const [step, setStep] = useState<'config' | 'preview'>('config')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => { loadProducts() }, [])

    async function loadProducts() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: store } = await supabase.from('stores').select('id, name').eq('owner_id', user.id).single()
        if (!store) return
        setStoreName(store.name)
        const { data } = await supabase.from('products').select('*').eq('store_id', store.id).eq('is_active', true).order('name')
        const prods = data || []
        setProducts(prods)
        setSelectedIds(new Set(prods.map(p => p.id)))
        setLoading(false)
    }

    const selectedProducts = products.filter(p => selectedIds.has(p.id))
    const activePalette = { ...palette, accent: customAccent || palette.accent }

    async function handleExport() {
        if (selectedProducts.length === 0) return
        setGenerating(true)
        try {
            const { default: jsPDF } = await import('jspdf')
            const { default: html2canvas } = await import('html2canvas')

            const el = document.getElementById('catalog-preview')
            if (!el) return

            const canvas = await html2canvas(el, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: activePalette.bg,
            })

            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
            const pdfW = pdf.internal.pageSize.getWidth()
            const pdfH = pdf.internal.pageSize.getHeight()
            const imgW = canvas.width
            const imgH = canvas.height
            const ratio = pdfW / imgW * 2.83465

            // If content fits one page
            if (imgH * ratio <= pdfH * 2.83465) {
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, imgH / imgW * pdfW)
            } else {
                // Multi-page: slice canvas vertically
                const pageH = Math.floor(pdfH / ratio * imgW / imgW * imgW)
                let yOffset = 0
                let page = 0
                while (yOffset < imgH) {
                    if (page > 0) pdf.addPage()
                    const sliceH = Math.min(pageH, imgH - yOffset)
                    const pageCanvas = document.createElement('canvas')
                    pageCanvas.width = imgW
                    pageCanvas.height = sliceH
                    const ctx = pageCanvas.getContext('2d')!
                    ctx.drawImage(canvas, 0, -yOffset)
                    pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, sliceH / imgW * pdfW)
                    yOffset += sliceH
                    page++
                }
            }

            const fileName = `catalogo-${storeName.replace(/\s+/g, '-').toLowerCase() || 'toul'}.pdf`
            pdf.save(fileName)
        } catch (err) {
            console.error(err)
        } finally {
            setGenerating(false)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--toul-accent)' }} />
        </div>
    )

    return (
        <div className="px-4 md:px-8 pt-6 pb-10">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/inventory" className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={18} />
                </Link>
                <div>
                    <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--toul-text-subtle)' }}>Inventario</p>
                    <h1 className="text-lg font-bold" style={{ color: 'var(--toul-text)' }}>Exportar catálogo PDF</h1>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
                {/* ── CONFIG PANEL ── */}
                <div className="md:w-72 flex-shrink-0 flex flex-col gap-4">

                    {/* Color presets */}
                    <div className="toul-card">
                        <div className="flex items-center gap-2 mb-3">
                            <Palette size={16} style={{ color: 'var(--toul-accent)' }} />
                            <span className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>Paleta de colores</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {COLOR_PRESETS.map(p => (
                                <button key={p.name} onClick={() => { setPalette(p); setCustomAccent('') }}
                                    className="aspect-square rounded-xl flex items-center justify-center text-[10px] font-medium transition-all border-2"
                                    style={{
                                        background: p.bg,
                                        color: p.text,
                                        borderColor: palette.name === p.name ? p.accent : 'transparent',
                                        boxShadow: palette.name === p.name ? `0 0 0 3px ${p.accent}44` : 'none',
                                    }}>
                                    <span style={{ color: p.accent }}>●</span>
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--toul-text-subtle)' }}>{palette.name}</p>

                        <div className="mt-3">
                            <label className="text-xs mb-1 block" style={{ color: 'var(--toul-text-muted)' }}>Color acento personalizado</label>
                            <div className="flex gap-2 items-center">
                                <input type="color" value={customAccent || palette.accent}
                                    onChange={e => setCustomAccent(e.target.value)}
                                    className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
                                    style={{ background: 'transparent' }} />
                                <span className="text-xs font-mono" style={{ color: 'var(--toul-text-muted)' }}>{customAccent || palette.accent}</span>
                            </div>
                        </div>
                    </div>

                    {/* Product selection */}
                    <div className="toul-card">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>Productos</span>
                            <div className="flex gap-2 text-xs">
                                <button onClick={() => setSelectedIds(new Set(products.map(p => p.id)))} style={{ color: 'var(--toul-accent)' }}>Todos</button>
                                <span style={{ color: 'var(--toul-text-subtle)' }}>·</span>
                                <button onClick={() => setSelectedIds(new Set())} style={{ color: 'var(--toul-text-muted)' }}>Ninguno</button>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                            {products.map(p => (
                                <label key={p.id} className="flex items-center gap-2 cursor-pointer py-1">
                                    <input type="checkbox" checked={selectedIds.has(p.id)}
                                        onChange={e => setSelectedIds(prev => {
                                            const n = new Set(prev)
                                            e.target.checked ? n.add(p.id) : n.delete(p.id)
                                            return n
                                        })}
                                        className="w-4 h-4 rounded accent-emerald-500" />
                                    <span className="text-xs truncate" style={{ color: 'var(--toul-text)' }}>{p.name}</span>
                                </label>
                            ))}
                        </div>
                        <p className="text-xs mt-2" style={{ color: 'var(--toul-text-subtle)' }}>{selectedProducts.length} productos seleccionados</p>
                    </div>

                    <motion.button onClick={handleExport} disabled={generating || selectedProducts.length === 0}
                        whileTap={{ scale: 0.98 }} className="toul-btn-primary gap-2">
                        {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {generating ? 'Generando PDF...' : 'Descargar PDF'}
                    </motion.button>
                </div>

                {/* ── CATALOG PREVIEW ── */}
                <div className="flex-1 overflow-auto">
                    <p className="text-xs mb-3 font-medium" style={{ color: 'var(--toul-text-subtle)' }}>Vista previa del catálogo</p>
                    <div
                        id="catalog-preview"
                        ref={catalogRef}
                        style={{
                            background: activePalette.bg,
                            width: '100%',
                            maxWidth: 600,
                            borderRadius: 16,
                            overflow: 'hidden',
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                        }}>
                        {/* Cover header */}
                        <div style={{ background: activePalette.bg, padding: '40px 32px 24px', borderBottom: `2px solid ${activePalette.accent}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <div style={{ width: 8, height: 40, background: activePalette.accent, borderRadius: 4 }} />
                                <div>
                                    <p style={{ color: activePalette.accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', margin: 0 }}>Catálogo</p>
                                    <h1 style={{ color: activePalette.text, fontSize: 28, fontWeight: 800, margin: 0 }}>{storeName}</h1>
                                </div>
                            </div>
                            <p style={{ color: activePalette.accent, fontSize: 12, margin: '4px 0 0 20px', opacity: 0.7 }}>
                                {selectedProducts.length} productos · {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                            </p>
                        </div>

                        {/* Products grid */}
                        <div style={{ padding: '24px 24px 32px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            {selectedProducts.map(product => (
                                <div key={product.id} style={{
                                    background: activePalette.card,
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    border: `1px solid ${activePalette.accent}20`,
                                }}>
                                    {/* Product image */}
                                    <div style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', position: 'relative', background: `${activePalette.accent}10` }}>
                                        {product.image_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={product.image_url}
                                                alt={product.name}
                                                crossOrigin="anonymous"
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>📦</div>
                                        )}
                                    </div>
                                    {/* Product info */}
                                    <div style={{ padding: '12px 14px 14px' }}>
                                        <p style={{ color: activePalette.text, fontWeight: 700, fontSize: 13, margin: '0 0 4px', lineHeight: 1.3 }}>{product.name}</p>
                                        {product.description && (
                                            <p style={{ color: activePalette.text, fontSize: 11, opacity: 0.55, margin: '0 0 8px', lineHeight: 1.4 }}>{product.description}</p>
                                        )}
                                        <p style={{ color: activePalette.accent, fontWeight: 800, fontSize: 16, margin: 0 }}>
                                            {formatCOP(product.sale_price)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Footer */}
                        <div style={{ background: `${activePalette.accent}15`, padding: '16px 32px', borderTop: `1px solid ${activePalette.accent}25`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p style={{ color: activePalette.accent, fontSize: 12, fontWeight: 700, margin: 0 }}>{storeName}</p>
                            <p style={{ color: activePalette.text, fontSize: 11, opacity: 0.5, margin: 0 }}>Hecho con TOUL</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
