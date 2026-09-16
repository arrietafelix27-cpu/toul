'use client'
import { useState, useEffect } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Picker item — debe tener al menos id + name.
 * Genérico para reutilizar con cualquier entidad (categorías, proveedores, etc).
 */
export interface PickerItem {
    id: string
    name: string
}

export interface CategoryPickerProps<T extends PickerItem = PickerItem> {
    items: T[]
    value: string
    onChange: (id: string) => void
    label?: string
    required?: boolean
    placeholder?: string
    emptyMessage?: string
    disabled?: boolean
}

const SPRING_SOFT = { type: 'spring' as const, stiffness: 240, damping: 26 }
const SPRING_PRESS = { type: 'spring' as const, stiffness: 420, damping: 26 }
const EASE_OUT_EXPO: [number, number, number, number] = [0.4, 0, 0.2, 1]

/**
 * CategoryPicker — dropdown custom con modal central y backdrop blur.
 * NO usa select nativo. Patrón "active container" en el trigger.
 * Chevron rota 180° cuando abre. Check con pop animation por opción activa.
 * Body scroll lock cuando está abierto.
 */
export function CategoryPicker<T extends PickerItem>({
    items, value, onChange,
    label = 'Categoría',
    required,
    placeholder = 'Selecciona',
    emptyMessage = 'Sin opciones',
    disabled,
}: CategoryPickerProps<T>) {
    const [open, setOpen] = useState(false)
    const selected = items.find(i => i.id === value)

    useEffect(() => {
        if (open) {
            const prev = document.body.style.overflow
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = prev }
        }
    }, [open])

    return (
        <>
            <button
                type="button"
                onClick={() => !disabled && items.length > 0 && setOpen(true)}
                disabled={disabled}
                style={{
                    width: '100%',
                    textAlign: 'left',
                    borderRadius: 14,
                    padding: '12px 16px 14px',
                    background: open ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                    border: `1px solid ${open ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                    cursor: items.length > 0 && !disabled ? 'pointer' : 'default',
                    transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                    position: 'relative',
                    fontFamily: 'inherit',
                    opacity: disabled ? 0.5 : 1,
                }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    color: open ? 'var(--toul-accent)' : 'var(--toul-text-dim)',
                    transition: 'color var(--toul-transition)',
                }}>
                    <span>{label}</span>
                    {required && (
                        <span style={{ color: 'var(--toul-accent)' }}>·</span>
                    )}
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                    gap: 8,
                }}>
                    <span style={{
                        fontSize: 16,
                        color: selected ? 'var(--toul-text)' : 'var(--toul-text-faint)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {selected?.name || (items.length === 0 ? emptyMessage : placeholder)}
                    </span>
                    <motion.div
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                        }}>
                        <ChevronDown
                            size={15}
                            strokeWidth={2}
                            color={open ? 'var(--toul-accent)' : 'rgba(255,255,255,0.4)'}
                        />
                    </motion.div>
                </div>
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                            onClick={() => setOpen(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0,0,0,0.4)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                zIndex: 60,
                            }}
                        />
                        {/* Modal centered */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 4 }}
                            transition={SPRING_SOFT}
                            style={{
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                x: '-50%',
                                y: '-50%',
                                width: 'calc(100% - 36px)',
                                maxWidth: 360,
                                maxHeight: '70vh',
                                background: 'var(--toul-surface-overlay)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                                overflow: 'hidden',
                                zIndex: 61,
                                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                            }}>
                            <div style={{
                                maxHeight: '70vh',
                                overflowY: 'auto',
                            }}>
                                {items.length === 0 ? (
                                    <div style={{
                                        padding: 24,
                                        textAlign: 'center',
                                        color: 'var(--toul-text-subtle)',
                                        fontSize: 14,
                                    }}>
                                        {emptyMessage}
                                    </div>
                                ) : items.map((item, i) => {
                                    const isActive = item.id === value
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => { onChange(item.id); setOpen(false) }}
                                            style={{
                                                display: 'flex',
                                                width: '100%',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '14px 18px',
                                                background: 'transparent',
                                                border: 'none',
                                                borderBottom: i < items.length - 1
                                                    ? '1px solid rgba(255,255,255,0.05)'
                                                    : 'none',
                                                color: isActive ? 'var(--toul-accent)' : 'var(--toul-text)',
                                                fontSize: 15,
                                                fontWeight: isActive ? 600 : 500,
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                fontFamily: 'inherit',
                                            }}>
                                            <span>{item.name}</span>
                                            {isActive && (
                                                <motion.div
                                                    initial={{ scale: 0.5, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    transition={SPRING_PRESS}
                                                    style={{ display: 'flex', alignItems: 'center' }}>
                                                    <Check size={16} color="var(--toul-accent)" strokeWidth={2.4} />
                                                </motion.div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    )
}
