'use client'
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Zap, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

function ResetPasswordForm() {
    const supabase = createClient()
    const router = useRouter()
    const params = useSearchParams()
    const [status, setStatus] = useState<Status>('checking')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        async function verify() {
            // El enlace del correo trae ?code= (PKCE). Se canjea por una sesión temporal.
            const code = params.get('code')
            if (code) {
                const { error } = await supabase.auth.exchangeCodeForSession(code)
                if (!cancelled) setStatus(error ? 'invalid' : 'ready')
                return
            }
            const { data: { session } } = await supabase.auth.getSession()
            if (!cancelled) setStatus(session ? 'ready' : 'invalid')
        }
        verify()
        return () => { cancelled = true }
    }, [params, supabase])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
        if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return }
        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSaving(false)
        if (error) { toast.error('No se pudo cambiar la contraseña. Pide un enlace nuevo.'); return }
        setStatus('done')
        toast.success('Contraseña actualizada')
        setTimeout(() => router.push('/'), 1200)
    }

    return (
        <div className="w-full max-w-sm rounded-3xl p-6"
            style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
            {status === 'checking' && (
                <div className="flex justify-center py-8">
                    <div style={{ width: 24, height: 24, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                </div>
            )}

            {status === 'invalid' && (
                <div className="text-center py-4">
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>Enlace vencido</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>
                        Este enlace ya no sirve. Pide uno nuevo para cambiar tu contraseña.
                    </p>
                    <Link href="/forgot-password" className="toul-btn-primary" style={{ textDecoration: 'none' }}>
                        Pedir enlace nuevo
                    </Link>
                </div>
            )}

            {status === 'ready' && (
                <>
                    <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Nueva contraseña</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Escribe la contraseña que vas a usar desde ahora.</p>
                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Contraseña</label>
                            <div className="relative">
                                <input className="toul-input pr-10" type={showPassword ? 'text' : 'password'} placeholder="Mínimo 8 caracteres"
                                    value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
                                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2"
                                    style={{ color: 'var(--toul-text-subtle)' }} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Confirmar contraseña</label>
                            <input className="toul-input" type={showPassword ? 'text' : 'password'} placeholder="Repite la contraseña"
                                value={confirm} onChange={e => setConfirm(e.target.value)} required />
                        </div>
                        <button type="submit" className="toul-btn-primary" disabled={saving}>
                            {saving ? 'Guardando...' : 'Guardar contraseña'}
                        </button>
                    </form>
                </>
            )}

            {status === 'done' && (
                <div className="text-center py-6">
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>¡Listo!</h2>
                    <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Tu contraseña fue actualizada. Entrando...</p>
                </div>
            )}

            {status !== 'done' && (
                <Link href="/login" className="flex items-center gap-1.5 justify-center text-sm mt-4 hover:underline"
                    style={{ color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={14} /> Volver al login
                </Link>
            )}
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10" style={{ background: 'var(--toul-bg)' }}>
            <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 8px 32px var(--toul-accent-glow)' }}>
                    <Zap size={26} fill="black" className="text-black" />
                </div>
                <h1 className="text-3xl font-bold gradient-text">TOUL</h1>
            </div>
            <Suspense>
                <ResetPasswordForm />
            </Suspense>
        </div>
    )
}
