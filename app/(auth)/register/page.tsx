'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Zap } from 'lucide-react'

export default function RegisterPage() {
    const supabase = createClient()
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault()
        if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return }
        if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
        setLoading(true)
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
            toast.error(error.message)
        } else {
            router.push('/onboarding')
        }
        setLoading(false)
    }

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
            style={{ background: 'var(--toul-bg)' }}>
            <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-xl"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 8px 32px var(--toul-accent-glow)' }}>
                    <Zap size={26} fill="white" className="text-white" />
                </div>
                <h1 className="text-3xl font-bold gradient-text">TOUL</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--toul-text-muted)' }}>Crea tu cuenta gratis</p>
            </div>

            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Crear cuenta</h2>
                <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Empieza a controlar tu negocio hoy</p>

                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                        <input className="toul-input" type="email" placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Contraseña</label>
                        <div className="relative">
                            <input className="toul-input pr-10" type={showPassword ? 'text' : 'password'} placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} required />
                            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Confirmar contraseña</label>
                        <input className="toul-input" type={showPassword ? 'text' : 'password'} placeholder="Repite tu contraseña" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                    </div>
                    <button type="submit" className="toul-btn-primary mt-1" disabled={loading}>
                        {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
                    </button>
                </form>

                <p className="text-center text-sm mt-4" style={{ color: 'var(--toul-text-muted)' }}>
                    ¿Ya tienes cuenta?{' '}
                    <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--toul-accent)' }}>Ingresa aquí</Link>
                </p>
            </div>
        </div>
    )
}
