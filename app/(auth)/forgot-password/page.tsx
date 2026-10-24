'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { entrarDeCero, limpiarDatosDeCuenta, marcarCuenta } from '@/lib/session/limpiarCuenta'
import { CodigoCorreo } from '@/components/auth/CodigoCorreo'
import { ArrowLeft } from 'lucide-react'

/* Recuperar la contraseña con un código de 6 números.
   Antes era un enlace que solo servía en el mismo navegador: casi
   siempre terminaba en "Enlace vencido". El código sirve en
   cualquier equipo. Con el código bien, se pasa a escribir la
   contraseña nueva. */

export default function ForgotPasswordPage() {
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    /** Correo al que se mandó el código */
    const [pendiente, setPendiente] = useState<string | null>(null)

    const enviarCodigo = useCallback((correo: string) =>
        supabase.auth.resetPasswordForEmail(correo, {
            // Por si el correo trae el enlace viejo en vez del código
            redirectTo: `${window.location.origin}/reset-password`,
        }), [supabase])

    async function handleReset(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const correo = email.trim()
        const { error } = await enviarCodigo(correo)
        setLoading(false)
        if (error) { toast.error(explainError(error, 'No se pudo enviar el código. Intenta de nuevo.')); return }
        setPendiente(correo)
    }

    const verificarCodigo = useCallback(async (codigo: string) => {
        if (!pendiente) return null
        const { data, error } = await supabase.auth.verifyOtp({ email: pendiente, token: codigo, type: 'recovery' })
        if (error || !data.user) return explainError(error, 'El código no es correcto o ya venció.')
        // El código ya abrió la cuenta: se entra de cero y se pide la contraseña nueva
        await limpiarDatosDeCuenta()
        marcarCuenta(data.user.id)
        entrarDeCero('/reset-password')
        return null
    }, [pendiente, supabase])

    const reenviarCodigo = useCallback(async () => {
        if (!pendiente) return null
        const { error } = await enviarCodigo(pendiente)
        return error ? explainError(error) : null
    }, [pendiente, enviarCodigo])

    const cambiarCorreo = useCallback(() => setPendiente(null), [])

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10"
            style={{ background: 'var(--toul-bg)' }}>
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

            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                {pendiente ? (
                    <div className="fade-in">
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Revisa tu correo</h2>
                        <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                            Si hay una cuenta con ese correo, te llega un código de 6 números.
                        </p>
                        <div style={{ height: 8 }} />
                        <CodigoCorreo email={pendiente} onVerificar={verificarCodigo} onReenviar={reenviarCodigo} onCambiarCorreo={cambiarCorreo} />
                    </div>
                ) : (
                    <>
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Recuperar contraseña</h2>
                        <p className="text-sm mb-6" style={{ color: 'var(--toul-text-muted)' }}>Te enviamos un código para que puedas poner una contraseña nueva.</p>
                        <form onSubmit={handleReset} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="correo" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                                <input id="correo" className="toul-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                                    placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                            <button type="submit" className="toul-btn-primary" disabled={loading}>
                                {loading ? 'Enviando...' : 'Enviar código'}
                            </button>
                        </form>
                    </>
                )}
                <Link href="/login" className="flex items-center gap-1.5 justify-center text-sm mt-5 hover:underline"
                    style={{ color: 'var(--toul-text-muted)' }}>
                    <ArrowLeft size={14} /> Volver a entrar
                </Link>
            </div>
        </div>
    )
}
