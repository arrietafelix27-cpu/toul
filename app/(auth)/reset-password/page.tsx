'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { explainError } from '@/lib/errors'
import { entrarDeCero, limpiarDatosDeCuenta, marcarCuenta } from '@/lib/session/limpiarCuenta'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

function ResetPasswordForm() {
    const supabase = createClient()
    const [status, setStatus] = useState<Status>('checking')
    const [userId, setUserId] = useState<string | null>(null)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        // Se llega aquí con la cuenta ya abierta por el código del correo.
        // (Si llega un enlace viejo con ?code=, Supabase lo canjea solo al
        // arrancar; canjearlo otra vez a mano era lo que lo hacía fallar.)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (cancelled) return
            if (window.location.search) window.history.replaceState(null, '', '/reset-password')
            setUserId(session?.user.id ?? null)
            setStatus(session ? 'ready' : 'invalid')
        })
        return () => { cancelled = true }
    }, [supabase])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
        if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return }
        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSaving(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar la contraseña. Intenta de nuevo.')); return }
        setStatus('done')
        toast.success('Contraseña actualizada')
        // Se entra de cero, como en cualquier entrada
        await limpiarDatosDeCuenta()
        if (userId) marcarCuenta(userId)
        setTimeout(() => entrarDeCero('/'), 900)
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
                    <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>Primero confirma que eres tú</h2>
                    <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>
                        Para poner una contraseña nueva te enviamos un código a tu correo.
                    </p>
                    <Link href="/forgot-password" className="toul-btn-primary" style={{ textDecoration: 'none' }}>
                        Pedir código
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
                                <input className="toul-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Mínimo 8 caracteres"
                                    value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
                                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2"
                                    style={{ color: 'var(--toul-text-subtle)' }} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Confirmar contraseña</label>
                            <input className="toul-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repite la contraseña"
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
                    <ArrowLeft size={14} /> Volver a entrar
                </Link>
            )}
        </div>
    )
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10" style={{ background: 'var(--toul-bg)' }}>
            <div className="flex flex-col items-center mb-8">
                <div style={{
                    width: 52, height: 52, borderRadius: 16, background: 'var(--toul-accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 32px var(--toul-accent-glow)',
                }}>
                    <span style={{ color: '#000', fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>T</span>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '12px 0 0' }}>TOUL</h1>
            </div>
            <ResetPasswordForm />
        </div>
    )
}
