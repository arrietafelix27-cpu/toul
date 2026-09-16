'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'
import { Zap, Check, KeyRound, Store } from 'lucide-react'

const CATEGORIES = [
    { value: 'ropa', emoji: '👗', label: 'Ropa y accesorios' },
    { value: 'comida', emoji: '🍔', label: 'Comida y bebidas' },
    { value: 'belleza', emoji: '💄', label: 'Belleza y cuidado' },
    { value: 'tecnologia', emoji: '📱', label: 'Tecnología' },
    { value: 'hogar', emoji: '🏠', label: 'Hogar y decoración' },
    { value: 'deporte', emoji: '⚽', label: 'Deporte y fitness' },
    { value: 'artesanias', emoji: '🎨', label: 'Artesanías' },
    { value: 'otros', emoji: '📦', label: 'Otros productos' },
]

export default function OnboardingPage() {
    const router = useRouter()
    const supabase = createClient()
    // 0 = elegir camino, 1-2 = crear negocio, 'join' = vendedor con código
    const [step, setStep] = useState<0 | 1 | 2 | 'join'>(0)
    const [inviteCode, setInviteCode] = useState('')
    const [storeName, setStoreName] = useState('')
    const [category, setCategory] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleFinish() {
        if (!storeName.trim()) { toast.error('Ingresa el nombre de tu negocio'); return }
        if (!category) { toast.error('Elige una categoría'); return }
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { error } = await supabase.from('stores').insert({
            owner_id: user.id, name: storeName.trim(), category,
        })
        if (error) {
            toast.error('Error al crear el negocio')
            setLoading(false)
            return
        }
        toast.success('¡Negocio creado! Bienvenido a TOUL 🎉')
        router.push('/')
    }

    async function handleJoin() {
        const code = inviteCode.trim().toUpperCase()
        if (code.length !== 6) { toast.error('El código tiene 6 caracteres'); return }
        setLoading(true)
        const { error } = await supabase.rpc('toul_accept_invite', { p_code: code })
        if (error) {
            toast.error(error.message || 'Código inválido')
            setLoading(false)
            return
        }
        toast.success('¡Listo! Ya eres parte del equipo')
        // Recarga completa: el middleware vuelve a leer el rol y lleva a la caja
        window.location.href = '/caja'
    }

    return (
        <div className="min-h-dvh flex flex-col px-5 py-10" style={{ background: 'var(--toul-bg)' }}>
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px var(--toul-accent-glow)' }}>
                    <Zap size={20} fill="white" className="text-white" />
                </div>
                <span className="text-xl font-bold gradient-text">TOUL</span>
            </div>

            {/* Step 0 — ¿Dueño o vendedor? */}
            {step === 0 && (
                <div className="flex-1 flex flex-col fade-in">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>¿Cómo vas a usar TOUL?</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Puedes crear tu negocio o unirte al de alguien más.</p>
                    <div className="flex flex-col gap-3">
                        {[
                            { key: 1 as const, icon: Store, title: 'Tengo un negocio', text: 'Crea tu negocio y administra todo.' },
                            { key: 'join' as const, icon: KeyRound, title: 'Soy vendedor', text: 'Tengo un código que me dio el administrador.' },
                        ].map(opt => (
                            <button key={String(opt.key)} onClick={() => setStep(opt.key)}
                                className="flex items-center gap-4 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
                                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text)' }}>
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                    <opt.icon size={20} />
                                </div>
                                <div>
                                    <p className="font-semibold" style={{ fontSize: 15 }}>{opt.title}</p>
                                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>{opt.text}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Vendedor — código de invitación */}
            {step === 'join' && (
                <div className="flex-1 flex flex-col fade-in">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>Código de vendedor</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Escribe el código de 6 caracteres que te dio el administrador.</p>
                    <input className="toul-input mb-4 text-center" type="text" placeholder="ABC123" value={inviteCode}
                        onChange={e => setInviteCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                        autoFocus autoCapitalize="characters" autoComplete="off"
                        style={{ fontSize: 28, letterSpacing: '0.3em', fontWeight: 700 }} />
                    <div className="mt-auto flex flex-col gap-2">
                        <button className="toul-btn-primary" onClick={handleJoin} disabled={loading || inviteCode.length !== 6}>
                            {loading ? 'Verificando...' : 'Unirme al negocio'}
                        </button>
                        <button className="toul-btn-ghost" onClick={() => setStep(0)} disabled={loading}>Volver</button>
                    </div>
                </div>
            )}

            {/* Progress */}
            {(step === 1 || step === 2) && <div className="flex gap-2 mb-8">
                {[1, 2].map(n => (
                    <div key={n} className="h-1 flex-1 rounded-full transition-all"
                        style={{ background: (step as number) >= n ? 'var(--toul-accent)' : 'var(--toul-border)' }} />
                ))}
            </div>}

            {/* Step 1 */}
            {step === 1 && (
                <div className="flex-1 flex flex-col fade-in">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>¿Cómo se llama tu negocio?</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Así aparecerá en tus registros y reportes.</p>
                    <input className="toul-input mb-4 text-lg" type="text" placeholder="Ej: Tienda de Valentina" value={storeName}
                        onChange={e => setStoreName(e.target.value)} maxLength={50} autoFocus />
                    <button className="toul-btn-primary mt-auto" onClick={() => {
                        if (!storeName.trim()) { toast.error('Ingresa el nombre'); return }
                        setStep(2)
                    }}>
                        Continuar
                    </button>
                </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
                <div className="flex-1 flex flex-col fade-in">
                    <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>¿Qué vendes?</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Elige la categoría de tu negocio.</p>
                    <div className="grid grid-cols-2 gap-2 mb-6">
                        {CATEGORIES.map(cat => (
                            <button key={cat.value} onClick={() => setCategory(cat.value)}
                                className="flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                                style={{
                                    background: category === cat.value ? 'var(--toul-accent-dim)' : 'var(--toul-surface)',
                                    border: `1px solid ${category === cat.value ? 'var(--toul-accent)' : 'var(--toul-border)'}`,
                                    color: category === cat.value ? 'var(--toul-accent)' : 'var(--toul-text)',
                                }}>
                                <span className="text-xl">{cat.emoji}</span>
                                <span className="text-sm font-medium">{cat.label}</span>
                                {category === cat.value && <Check size={14} className="ml-auto flex-shrink-0" />}
                            </button>
                        ))}
                    </div>
                    <button className="toul-btn-primary mt-auto" onClick={handleFinish} disabled={loading}>
                        {loading ? 'Creando tu negocio...' : '¡Empezar ahora!'}
                    </button>
                </div>
            )}
        </div>
    )
}
