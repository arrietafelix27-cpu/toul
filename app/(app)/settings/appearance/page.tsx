'use client'
import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Palette, Check, Save } from 'lucide-react'
import { useAppearance } from '@/components/ui/ThemeProvider'
import { createClient } from '@/lib/supabase/client'
import { useStore } from '@/lib/hooks/useData'
import toast from 'react-hot-toast'
import { fadeUp, staggerContainer, staggerItem } from '@/lib/motion'

const THEMES = [
    { id: 'light', label: 'Claro', icon: <Sun size={20} />, preview: 'bg-white' },
    { id: 'dark', label: 'Oscuro', icon: <Moon size={20} />, preview: 'bg-slate-900' },
    { id: 'custom', label: 'Personalizado', icon: <Palette size={20} />, preview: 'bg-gradient-to-tr from-emerald-400 to-indigo-500' }
]

export default function AppearancePage() {
    const supabase = createClient()
    const { data: store, mutate: mutateStore } = useStore()
    const { appearance, setAppearance } = useAppearance()

    const [localAppearance, setLocalAppearance] = useState(appearance)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setLocalAppearance(appearance)
    }, [appearance])

    const handleThemeSelect = (theme: string) => {
        const next = { ...localAppearance, theme: theme as any }
        setLocalAppearance(next)
        setAppearance(next) // Live preview
    }

    const handleColorChange = (key: 'primary' | 'secondary' | 'accent', value: string) => {
        const next = {
            ...localAppearance,
            colors: { ...localAppearance.colors, [key]: value }
        }
        setLocalAppearance(next)
        setAppearance(next) // Live preview
    }

    const handleSave = async () => {
        if (!store?.id) return
        setSaving(true)
        const { error } = await supabase
            .from('stores')
            .update({ appearance: localAppearance })
            .eq('id', store.id)

        if (error) {
            toast.error('Error al guardar la apariencia')
        } else {
            toast.success('Apariencia guardada correctamente')
            mutateStore()
        }
        setSaving(false)
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-24 max-w-2xl mx-auto">
            <motion.div variants={fadeUp} initial="hidden" animate="visible">
                <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Configuración</p>
                <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Apariencia</h1>
                <p className="text-sm mb-8" style={{ color: 'var(--toul-text-muted)' }}>
                    Personaliza cómo se ve TOUL y adapta los colores de la app a tu negocio.
                </p>
            </motion.div>

            {/* Theme Selection */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }} className="mb-10">
                <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--toul-text)' }}>Tema</h2>
                <div className="grid grid-cols-3 gap-3">
                    {THEMES.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => handleThemeSelect(t.id)}
                            className={`relative flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all active:scale-95 ${localAppearance.theme === t.id
                                    ? 'border-[var(--toul-primary)] bg-[var(--toul-surface-2)]'
                                    : 'border-[var(--toul-border)] bg-[var(--toul-surface)] hover:border-[var(--toul-border-2)]'
                                }`}
                        >
                            <div className={`w-full aspect-video rounded-lg ${t.preview} shadow-inner flex items-center justify-center`}>
                                <div style={{ color: t.id === 'light' ? '#64748B' : '#F5F5F5' }}>{t.icon}</div>
                            </div>
                            <span className="text-xs font-semibold" style={{ color: 'var(--toul-text)' }}>{t.label}</span>
                            {localAppearance.theme === t.id && (
                                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--toul-primary)] flex items-center justify-center text-white">
                                    <Check size={12} strokeWidth={4} />
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            </motion.div>

            {/* Custom Colors */}
            <AnimatePresence>
                {localAppearance.theme === 'custom' && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mb-10 overflow-hidden"
                    >
                        <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--toul-text)' }}>Colores del negocio</h2>
                        <div className="toul-card p-5 grid gap-6">
                            {[
                                { id: 'primary', label: 'Color principal', desc: 'Botones y acciones principales' },
                                { id: 'secondary', label: 'Color secundario', desc: 'Chips y decoraciones' },
                                { id: 'accent', label: 'Color de detalles', desc: 'Acentos y hovers' },
                            ].map((c) => (
                                <div key={c.id} className="flex items-center justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: 'var(--toul-text)' }}>{c.label}</p>
                                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>{c.desc}</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="color"
                                            value={localAppearance.colors[c.id as keyof typeof localAppearance.colors]}
                                            onChange={(e) => handleColorChange(c.id as any, e.target.value)}
                                            className="w-12 h-12 rounded-xl cursor-pointer border-none p-0 overflow-hidden"
                                            style={{ backgroundColor: 'transparent' }}
                                        />
                                        <div
                                            className="absolute inset-0 pointer-events-none rounded-xl border-2 border-[var(--toul-border)]"
                                            style={{ background: localAppearance.colors[c.id as keyof typeof localAppearance.colors] }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Preview Zone */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.2 }} className="mb-10">
                <h2 className="text-sm font-bold mb-4" style={{ color: 'var(--toul-text)' }}>Vista previa</h2>
                <div className="toul-card p-6 flex flex-col gap-6" style={{ background: 'var(--toul-bg)' }}>
                    {/* Fake Header/Nav */}
                    <div className="flex items-center justify-between pb-4 border-b border-[var(--toul-border)]">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[var(--toul-primary)]" />
                            <div className="w-20 h-3 rounded bg-[var(--toul-border)]" />
                        </div>
                        <div className="flex gap-2">
                            <div className="w-6 h-6 rounded-full bg-[var(--toul-surface-2)]" />
                            <div className="w-6 h-6 rounded-full bg-[var(--toul-surface-2)]" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <div className="w-32 h-4 rounded bg-[var(--toul-text)] opacity-80" />
                            <div className="w-full h-8 rounded-xl bg-[var(--toul-surface-2)]" />
                            <div className="w-24 h-6 rounded-full bg-[var(--toul-primary-dim)] flex items-center justify-center">
                                <span className="text-[10px] font-bold text-[var(--toul-primary)] uppercase">Activo</span>
                            </div>
                        </div>
                        <div className="flex flex-col justify-end">
                            <button className="toul-btn-primary py-2 text-sm">Botón Principal</button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Save Button */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.3 }}>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full toul-btn-primary flex items-center justify-center gap-2"
                >
                    {saving ? 'Guardando...' : <><Save size={18} /> Guardar cambios</>}
                </button>
            </motion.div>
        </div>
    )
}
