'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { LogOut, Store, User, Palette, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const CATEGORIES = [
    { value: 'ropa', label: '👗 Ropa y accesorios' },
    { value: 'comida', label: '🍔 Comida y bebidas' },
    { value: 'belleza', label: '💄 Belleza y cuidado' },
    { value: 'tecnologia', label: '📱 Tecnología' },
    { value: 'hogar', label: '🏠 Hogar y decoración' },
    { value: 'deporte', label: '⚽ Deporte y fitness' },
    { value: 'artesanias', label: '🎨 Artesanías' },
    { value: 'otros', label: '📦 Otros' },
]

export default function SettingsPage() {
    const supabase = createClient()
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [storeName, setStoreName] = useState('')
    const [category, setCategory] = useState('')
    const [storeId, setStoreId] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => { loadData() }, [])

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setEmail(user.email || '')
        const { data: store } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
        if (store) { setStoreId(store.id); setStoreName(store.name); setCategory(store.category) }
        setLoading(false)
    }

    async function handleSave() {
        if (!storeName.trim()) { toast.error('Ingresa el nombre del negocio'); return }
        setSaving(true)
        const { error } = await supabase.from('stores').update({ name: storeName.trim(), category, updated_at: new Date().toISOString() }).eq('id', storeId)
        if (error) toast.error('Error al guardar')
        else toast.success('Cambios guardados ✅')
        setSaving(false)
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 fade-in">
            <div className="mb-6">
                <p className="text-xs uppercase tracking-widest font-medium mb-0.5" style={{ color: 'var(--toul-text-subtle)' }}>Configuración</p>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--toul-text)' }}>Mi negocio</h1>
            </div>

            {/* Account */}
            <div className="toul-card mb-4">
                <div className="flex items-center gap-3 mb-0">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                        <User size={18} />
                    </div>
                    <div>
                        <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>Cuenta</p>
                        <p className="font-medium text-sm" style={{ color: 'var(--toul-text)' }}>{email}</p>
                    </div>
                </div>
            </div>

            {/* Appearance Link */}
            <Link href="/settings/appearance" className="block toul-card mb-4 toul-card-interactive" style={{ textDecoration: 'none' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                            <Palette size={18} />
                        </div>
                        <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--toul-text)' }}>Apariencia</p>
                            <p className="text-xs" style={{ color: 'var(--toul-text-muted)' }}>Personaliza temas y colores</p>
                        </div>
                    </div>
                    <ChevronRight size={18} style={{ color: 'var(--toul-text-subtle)' }} />
                </div>
            </Link>

            {/* Store */}
            <div className="toul-card mb-4">
                <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--toul-text-muted)' }}>
                    <Store size={16} />
                    <p className="text-sm font-semibold">Información del negocio</p>
                </div>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Nombre del negocio</label>
                        <input className="toul-input" type="text" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre de tu negocio" disabled={loading} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Categoría</label>
                        <select className="toul-input" value={category} onChange={e => setCategory(e.target.value)} disabled={loading}>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                    <button onClick={handleSave} disabled={saving || loading} className="toul-btn-primary">
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>
            </div>

            {/* Logout */}
            <button onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors"
                style={{ background: 'var(--toul-error-dim)', color: 'var(--toul-error)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <LogOut size={16} /> Cerrar sesión
            </button>
        </div>
    )
}
