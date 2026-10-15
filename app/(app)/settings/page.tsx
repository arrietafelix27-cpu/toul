'use client'
import { useEffect, useState } from 'react'
import { capitalizeFirst } from '@/lib/format/text'
import { explainError } from '@/lib/errors'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import Link from 'next/link'
import { ChevronRight, Link2 as LinkIcon, LogOut, Store, User } from 'lucide-react'
import { TeamSection } from '@/components/isla/TeamSection'
import { ReceiptSettings } from '@/components/isla/ReceiptSettings'
import { PushPrompt } from '@/components/isla/PushPrompt'

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
    const [coverageDays, setCoverageDays] = useState(7)
    const [creditDays, setCreditDays] = useState(30)

    useEffect(() => { loadData() }, [])

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setEmail(user.email || '')
        const { data: store } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
        if (store) {
            setStoreId(store.id); setStoreName(store.name); setCategory(store.category)
            setCoverageDays(store.stock_coverage_days ?? 7)
            setCreditDays(store.credit_default_days ?? 30)
        }
        setLoading(false)
    }

    async function handleSave() {
        if (!storeName.trim()) { toast.error('Ingresa el nombre del negocio'); return }
        setSaving(true)
        const { error } = await supabase.from('stores').update({
            name: storeName.trim(), category,
            stock_coverage_days: coverageDays,
            credit_default_days: creditDays,
            updated_at: new Date().toISOString(),
        }).eq('id', storeId)
        if (error) toast.error(explainError(error, 'No se pudieron guardar los datos del negocio.'))
        else toast.success('Cambios guardados ✅')
        setSaving(false)
    }

    async function handleLogout() {
        await supabase.auth.signOut()
        router.push('/login')
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-8 fade-in" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            <div className="mb-6" style={{ position: 'relative' }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--toul-text-dim)', margin: '0 0 4px 0' }}>Sistema</p>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>Mi negocio</h1>
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

            {/* Store */}
            <div className="toul-card mb-4">
                <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--toul-text-muted)' }}>
                    <Store size={16} />
                    <p className="text-sm font-semibold">Información del negocio</p>
                </div>
                <div className="flex flex-col gap-3">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Nombre del negocio</label>
                        <input className="toul-input" type="text" autoCapitalize="sentences" value={storeName} onChange={e => setStoreName(capitalizeFirst(e.target.value))} placeholder="Nombre de tu negocio" disabled={loading} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Categoría</label>
                        <select className="toul-input" value={category} onChange={e => setCategory(e.target.value)} disabled={loading}>
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Avisarme cuando me quede menos de
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[7, 15, 30].map(days => {
                                const active = coverageDays === days
                                return (
                                    <button key={days} type="button" onClick={() => setCoverageDays(days)}
                                        style={{
                                            height: 38, padding: '0 14px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                                            fontSize: 13.5, fontWeight: active ? 600 : 500,
                                            background: active ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
                                            border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                            color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                            transition: 'all 160ms cubic-bezier(0.23,1,0.32,1)',
                                        }}>
                                        {days === 7 ? 'una semana' : days === 15 ? 'quince días' : 'un mes'}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--toul-text-dim)', lineHeight: 1.5 }}>
                            TOUL mira cuánto vendes de cada producto y te avisa cuando lo que queda no alcanza
                            para ese tiempo. Si un producto necesita otro número, lo cambias en ese producto.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>
                            Un fiado sin plazo se vence a los
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[8, 15, 30, 60].map(days => {
                                const active = creditDays === days
                                return (
                                    <button key={days} type="button" onClick={() => setCreditDays(days)}
                                        style={{
                                            height: 38, padding: '0 14px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                                            fontSize: 13.5, fontWeight: active ? 600 : 500,
                                            background: active ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
                                            border: `1px solid ${active ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
                                            color: active ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                            transition: 'background-color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1)',
                                        }}>
                                        {days === 8 ? 'ocho días' : days === 15 ? 'quince días' : days === 30 ? 'un mes' : 'dos meses'}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="text-xs mt-1.5" style={{ color: 'var(--toul-text-dim)', lineHeight: 1.5 }}>
                            Cuando fías sin ponerle fecha, Cuentas por cobrar usa este plazo para saber
                            qué está vencido. Si a una venta le pones plazo, manda el de la venta.
                        </p>
                    </div>

                    <button onClick={handleSave} disabled={saving || loading} className="toul-btn-primary">
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                </div>
            </div>

            {/* Catálogo por link */}
            <Link href="/settings/catalogo" className="toul-card mb-4"
                style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                    <LinkIcon size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>Catálogo por link</p>
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>Comparte tus productos por WhatsApp e Instagram</p>
                </div>
                <ChevronRight size={16} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
            </Link>

            {/* Modo isla */}
            <p className="toul-section-label" style={{ marginTop: 24 }}>Punto de venta (isla)</p>
            <PushPrompt />
            {storeId && <TeamSection storeId={storeId} />}
            {storeId && <ReceiptSettings storeId={storeId} />}

            {/* Logout */}
            <button onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors"
                style={{ background: 'var(--toul-error-dim)', color: 'var(--toul-error)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <LogOut size={16} /> Cerrar sesión
            </button>
        </div>
    )
}
