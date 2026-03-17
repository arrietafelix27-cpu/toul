'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Zap, ArrowLeft } from 'lucide-react'

export default function ForgotPasswordPage() {
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)

    async function handleReset(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) toast.error('Error al enviar el correo')
        else setSent(true)
        setLoading(false)
    }

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
            style={{ background: 'var(--toul-bg)' }}>
            <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                    style={{ background: 'var(--toul-accent)', boxShadow: '0 8px 32px var(--toul-accent-glow)' }}>
                    <Zap size={26} fill="white" className="text-white" />
                </div>
                <h1 className="text-3xl font-bold gradient-text">TOUL</h1>
            </div>

            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                {sent ? (
                    <div className="text-center py-4">
                        <div className="text-4xl mb-4">📬</div>
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--toul-text)' }}>¡Correo enviado!</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>
                            Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
                        </p>
                        <Link href="/login" className="toul-btn-secondary" style={{ textDecoration: 'none' }}>
                            Volver al inicio
                        </Link>
                    </div>
                ) : (
                    <>
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Recuperar contraseña</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Te enviaremos un enlace para restablecer tu contraseña.</p>
                        <form onSubmit={handleReset} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                                <input className="toul-input" type="email" placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                            <button type="submit" className="toul-btn-primary" disabled={loading}>
                                {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                            </button>
                        </form>
                    </>
                )}
                <Link href="/login" className="flex items-center gap-1.5 justify-center text-sm mt-4 hover:underline"
                    style={{ color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={14} /> Volver al login
                </Link>
            </div>
        </div>
    )
}
