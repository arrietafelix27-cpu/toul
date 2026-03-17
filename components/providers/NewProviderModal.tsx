'use client'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Users, Phone, Mail, FileText } from 'lucide-react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

interface Props {
    onClose: () => void
    onSuccess: () => void
}

export function NewProviderModal({ onClose, onSuccess }: Props) {
    const supabase = createClient()
    const [saving, setSaving] = useState(false)
    const [name, setName] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [documentId, setDocumentId] = useState('')

    // Focus management
    const inputRef = useRef<HTMLInputElement>(null)
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error('El nombre es obligatorio')
            return
        }

        setSaving(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('No user found')

            const { data: store } = await supabase.from('stores')
                .select('id').eq('owner_id', user.id).single()
            if (!store) throw new Error('No store found')

            const { error } = await supabase.from('providers').insert({
                store_id: store.id,
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                document_id: documentId.trim() || null,
                total_debt: 0
            })

            if (error) throw error

            toast.success('Proveedor creado exitosamente ✅')
            onSuccess()
        } catch (error: any) {
            console.error('Error creating provider:', error)
            toast.error('Error al guardar: ' + error.message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pb-0 sm:pb-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
                initial={{ opacity: 0, y: 100, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 100, scale: 0.95 }}
                className="toul-card w-full max-w-md relative z-10 flex flex-col max-h-[90vh] pb-8 sm:pb-0 rounded-b-none sm:rounded-b-2xl overflow-hidden"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--toul-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800" style={{ color: 'var(--toul-text)' }}>
                            <Users size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg" style={{ color: 'var(--toul-text)' }}>Nuevo Proveedor</h2>
                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Agrega un distribuidor a tu red</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full flex-shrink-0 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" style={{ color: 'var(--toul-text-muted)' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                            Nombre / Empresa <span style={{ color: 'var(--toul-error)' }}>*</span>
                        </label>
                        <div className="relative">
                            <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                            <input
                                ref={inputRef}
                                type="text"
                                className="toul-input w-full pl-9"
                                placeholder="Ej. Distribuidora del Norte"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>Teléfono</label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                            <input
                                type="tel"
                                className="toul-input w-full pl-9"
                                placeholder="Ej. 300 123 4567"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>Email</label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                            <input
                                type="email"
                                className="toul-input w-full pl-9"
                                placeholder="Ej. ventas@distribuidora.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--toul-text-muted)' }}>NIT o Documento</label>
                        <div className="relative">
                            <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }} />
                            <input
                                type="text"
                                className="toul-input w-full pl-9"
                                placeholder="Ej. 900.123.456-7"
                                value={documentId}
                                onChange={e => setDocumentId(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50/50 dark:bg-gray-900/50" style={{ borderColor: 'var(--toul-border)' }}>
                    <button
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                        className="w-full toul-btn-primary py-3 flex justify-center items-center gap-2"
                    >
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span className="font-bold">Guardar Proveedor</span>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    )
}
