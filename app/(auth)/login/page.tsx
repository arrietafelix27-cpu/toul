'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Zap } from 'lucide-react'

export default function LoginPage() {
    const supabase = createClient()
    const router = useRouter()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            toast.error('Correo o contraseña incorrectos')
        } else {
            router.push('/')
            router.refresh()
        }
        setLoading(false)
    }

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
            style={{ background: 'var(--toul-bg)' }}>
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-xl"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 8px 32px var(--toul-accent-glow)' }}>
                    <Zap size={26} fill="white" className="text-white" />
                </div>
                <h1 className="text-3xl font-bold gradient-text">TOUL</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--toul-text-muted)' }}>Tu negocio, bajo control</p>
            </div>

            {/* Card */}
            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Bienvenido de nuevo</h2>
                <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Ingresa para ver tu negocio</p>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                        <input className="toul-input" type="email" placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Contraseña</label>
                        <div className="relative">
                            <input className="toul-input pr-10" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                style={{ color: 'var(--toul-text-subtle)' }}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        <div className="text-right mt-1.5">
                            <Link href="/forgot-password" className="text-xs hover:underline" style={{ color: 'var(--toul-accent)' }}>
                                ¿Olvidaste tu contraseña?
                            </Link>
                        </div>
                    </div>
                    <button type="submit" className="toul-btn-primary mt-1" disabled={loading}>
                        {loading ? 'Ingresando...' : 'Entrar'}
                    </button>
                </form>

                <p className="text-center text-sm mt-4" style={{ color: 'var(--toul-text-muted)' }}>
                    ¿No tienes cuenta?{' '}
                    <Link href="/register" className="font-semibold hover:underline" style={{ color: 'var(--toul-accent)' }}>
                        Regístrate gratis
                    </Link>
                </p>
            </div>
        </div>
    )
}
