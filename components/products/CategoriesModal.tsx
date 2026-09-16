'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Plus, Pencil, Trash2, Check, Tag } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import type { ProductCategory } from '@/lib/types'

const DOT_COLORS = ['#32d74b', '#bf5af2', '#0a84ff', '#ffd60a', '#ff9f0a', '#ff453a']

const SPRING_SOFT = { type: 'spring' as const, stiffness: 240, damping: 26 }
const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
const EASE_OUT_EXPO: [number, number, number, number] = [0.4, 0, 0.2, 1]

interface CategoriesModalProps {
    storeId: string
    onClose: () => void
    onChanged?: () => void
}

export function CategoriesModal({ storeId, onClose, onChanged }: CategoriesModalProps) {
    const supabase = createClient()
    const [isVisible, setIsVisible] = useState(true)
    const [categories, setCategories] = useState<ProductCategory[]>([])
    const [productCounts, setProductCounts] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(true)
    const [newName, setNewName] = useState('')
    const [inputFocused, setInputFocused] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editingName, setEditingName] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => { loadCategories() }, [storeId])

    // Lock body scroll while open
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    async function loadCategories() {
        setLoading(true)
        const [{ data, error }, { data: products }] = await Promise.all([
            supabase
                .from('product_categories')
                .select('*')
                .eq('store_id', storeId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: true }),
            supabase
                .from('products')
                .select('category_id')
                .eq('store_id', storeId)
                .not('category_id', 'is', null)
        ])

        if (!error && data) setCategories(data)

        if (products) {
            const counts: Record<string, number> = {}
            products.forEach(p => {
                if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1
            })
            setProductCounts(counts)
        }

        setLoading(false)
    }

    function handleClose() {
        setIsVisible(false)
        setTimeout(onClose, 320)
    }

    async function handleAdd() {
        const trimmed = newName.trim()
        if (!trimmed) { toast.error('El nombre es obligatorio'); return }
        if (categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
            toast.error('Esta categoría ya existe'); return
        }
        setSaving(true)
        const { data, error } = await supabase
            .from('product_categories')
            .insert({ store_id: storeId, name: trimmed, sort_order: categories.length })
            .select('*')
            .single()
        setSaving(false)
        if (error) { toast.error('Error al crear: ' + error.message); return }
        setCategories(prev => [...prev, data])
        setNewName('')
        toast.success('Categoría agregada')
        onChanged?.()
    }

    async function handleEdit(id: string) {
        const trimmed = editingName.trim()
        if (!trimmed) { setEditingId(null); return }
        if (categories.some(c => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
            toast.error('Ya existe una categoría con ese nombre'); return
        }
        setSaving(true)
        const { error } = await supabase
            .from('product_categories')
            .update({ name: trimmed })
            .eq('id', id)
        setSaving(false)
        if (error) { toast.error('Error al editar: ' + error.message); return }
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c))
        setEditingId(null)
        setEditingName('')
        toast.success('Categoría actualizada')
        onChanged?.()
    }

    async function handleDelete(id: string) {
        const count = productCounts[id] || 0
        if (count > 0) {
            toast.error(`No se puede eliminar: ${count} producto${count > 1 ? 's' : ''} la usa`)
            return
        }
        setSaving(true)
        const { error } = await supabase.from('product_categories').delete().eq('id', id)
        setSaving(false)
        if (error) { toast.error('Error al eliminar: ' + error.message); return }
        setCategories(prev => prev.filter(c => c.id !== id))
        toast.success('Categoría eliminada')
        onChanged?.()
    }

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
                            maxHeight: '85vh',
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
                                    background: 'rgba(50,215,75,0.12)',
                                    border: '1px solid rgba(50,215,75,0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <Tag size={14} color="var(--toul-accent)" strokeWidth={2} />
                                </div>
                                <span style={{
                                    fontSize: 17,
                                    fontWeight: 600,
                                    color: 'var(--toul-text)',
                                    letterSpacing: '-0.02em',
                                }}>
                                    Categorías
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

                        {/* Input row */}
                        <div style={{
                            display: 'flex',
                            gap: 8,
                            padding: '14px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <input
                                style={{
                                    flex: 1,
                                    background: inputFocused
                                        ? 'var(--toul-surface-focused)'
                                        : 'var(--toul-surface)',
                                    border: `1px solid ${inputFocused
                                        ? 'var(--toul-border-focused)'
                                        : 'var(--toul-border)'}`,
                                    borderRadius: 12,
                                    padding: '10px 14px',
                                    fontSize: 15,
                                    color: 'var(--toul-text)',
                                    outline: 'none',
                                    transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                    fontFamily: 'inherit',
                                }}
                                placeholder="Nueva categoría..."
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onFocus={() => setInputFocused(true)}
                                onBlur={() => setInputFocused(false)}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                disabled={saving}
                            />
                            <motion.button
                                onClick={handleAdd}
                                disabled={saving}
                                whileTap={{ scale: 0.95 }}
                                transition={SPRING_PRESS}
                                style={{
                                    width: 40, height: 40,
                                    borderRadius: 12,
                                    background: 'var(--toul-accent)',
                                    border: 'none',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0,
                                    boxShadow: '0 4px 16px rgba(50,215,75,0.25)',
                                }}>
                                <Plus size={18} color="#000" strokeWidth={2.6} />
                            </motion.button>
                        </div>

                        {/* Counter */}
                        <div style={{ padding: '12px 18px 6px' }}>
                            <span style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--toul-text-dim)',
                            }}>
                                {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
                            </span>
                        </div>

                        {/* List */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '4px 16px 24px',
                        }}>
                            {loading ? (
                                <p style={{
                                    color: 'var(--toul-text-subtle)',
                                    textAlign: 'center',
                                    paddingTop: 20,
                                    fontSize: 14,
                                }}>
                                    Cargando...
                                </p>
                            ) : categories.length === 0 ? (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    paddingTop: 36,
                                    gap: 10,
                                }}>
                                    <div style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 14,
                                        background: 'rgba(255,255,255,0.05)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Tag size={20} color="rgba(255,255,255,0.25)" />
                                    </div>
                                    <p style={{ fontSize: 14, color: 'var(--toul-text-subtle)', margin: 0 }}>
                                        Aún no tienes categorías
                                    </p>
                                    <p style={{ fontSize: 12, color: 'var(--toul-text-faint)', margin: 0 }}>
                                        Crea tu primera arriba
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <AnimatePresence initial={false}>
                                        {categories.map((cat, idx) => {
                                            const dotColor = DOT_COLORS[idx % DOT_COLORS.length]
                                            const count = productCounts[cat.id] || 0
                                            const isEditing = editingId === cat.id

                                            return (
                                                <motion.div
                                                    key={cat.id}
                                                    initial={{ opacity: 0, scale: 0.97 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.97 }}
                                                    transition={SPRING_SOFT}
                                                    style={{
                                                        height: 54,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        background: isEditing
                                                            ? 'var(--toul-surface-focused)'
                                                            : 'var(--toul-surface)',
                                                        border: `1px solid ${isEditing
                                                            ? 'var(--toul-border-focused)'
                                                            : 'var(--toul-border)'}`,
                                                        borderRadius: 14,
                                                        padding: '0 8px 0 14px',
                                                        transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                                    }}>
                                                    {/* Color dot */}
                                                    <div style={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        background: dotColor,
                                                        flexShrink: 0,
                                                        marginRight: 12,
                                                    }} />

                                                    {/* Name or edit input */}
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            value={editingName}
                                                            onChange={e => setEditingName(e.target.value)}
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') handleEdit(cat.id)
                                                                if (e.key === 'Escape') setEditingId(null)
                                                            }}
                                                            style={{
                                                                flex: 1,
                                                                background: 'transparent',
                                                                border: 'none',
                                                                padding: '4px 0',
                                                                fontSize: 15,
                                                                fontWeight: 500,
                                                                color: 'var(--toul-text)',
                                                                outline: 'none',
                                                                marginRight: 8,
                                                                fontFamily: 'inherit',
                                                            }}
                                                        />
                                                    ) : (
                                                        <span style={{
                                                            fontSize: 15,
                                                            fontWeight: 500,
                                                            color: 'var(--toul-text)',
                                                            flex: 1,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {cat.name}
                                                        </span>
                                                    )}

                                                    {/* Product count */}
                                                    {!isEditing && (
                                                        <span style={{
                                                            fontSize: 12,
                                                            color: 'var(--toul-text-faint)',
                                                            marginRight: 10,
                                                            flexShrink: 0,
                                                            whiteSpace: 'nowrap',
                                                            fontVariantNumeric: 'tabular-nums',
                                                        }}>
                                                            {count > 0 ? `${count} producto${count > 1 ? 's' : ''}` : 'Sin productos'}
                                                        </span>
                                                    )}

                                                    {/* Action buttons */}
                                                    {isEditing ? (
                                                        <>
                                                            <motion.button
                                                                onClick={() => handleEdit(cat.id)}
                                                                whileTap={{ scale: 0.9 }}
                                                                transition={SPRING_PRESS}
                                                                style={{
                                                                    width: 34, height: 34,
                                                                    borderRadius: 10,
                                                                    background: 'rgba(50,215,75,0.12)',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                    marginRight: 4,
                                                                }}>
                                                                <Check size={14} color="var(--toul-accent)" strokeWidth={2.4} />
                                                            </motion.button>
                                                            <motion.button
                                                                onClick={() => setEditingId(null)}
                                                                whileTap={{ scale: 0.9 }}
                                                                transition={SPRING_PRESS}
                                                                style={{
                                                                    width: 34, height: 34,
                                                                    borderRadius: 10,
                                                                    background: 'rgba(255,255,255,0.05)',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                }}>
                                                                <X size={14} color="rgba(255,255,255,0.5)" strokeWidth={2.2} />
                                                            </motion.button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <motion.button
                                                                onClick={() => { setEditingId(cat.id); setEditingName(cat.name) }}
                                                                whileTap={{ scale: 0.9 }}
                                                                transition={SPRING_PRESS}
                                                                style={{
                                                                    width: 34, height: 34,
                                                                    borderRadius: 10,
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                }}>
                                                                <Pencil size={13} color="rgba(255,255,255,0.5)" strokeWidth={2} />
                                                            </motion.button>
                                                            <motion.button
                                                                onClick={() => handleDelete(cat.id)}
                                                                disabled={saving}
                                                                whileTap={{ scale: 0.9 }}
                                                                transition={SPRING_PRESS}
                                                                style={{
                                                                    width: 34, height: 34,
                                                                    borderRadius: 10,
                                                                    background: 'transparent',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    flexShrink: 0,
                                                                }}>
                                                                <Trash2 size={13} color="var(--toul-error)" strokeWidth={2} />
                                                            </motion.button>
                                                        </>
                                                    )}
                                                </motion.div>
                                            )
                                        })}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
