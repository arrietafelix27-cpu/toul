'use client'
import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { entrarDeCero, limpiarDatosDeCuenta, marcarCuenta } from '@/lib/session/limpiarCuenta'
import { AceptarTerminos, datosDeAceptacion } from '@/components/auth/AceptarTerminos'
import { CodigoCorreo } from '@/components/auth/CodigoCorreo'
import { BotonGoogle } from '@/components/auth/BotonGoogle'
import { Eye, EyeOff } from 'lucide-react'

/** Cuenta nueva en un equipo que pudo tener otra: se entra de cero */
async function entrar(userId: string) {
    await limpiarDatosDeCuenta()
    marcarCuenta(userId)
    entrarDeCero('/onboarding')
}

export default function RegisterPage() {
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [aceptado, setAceptado] = useState(false)
    const [faltaAceptar, setFaltaAceptar] = useState(false)
    const [loading, setLoading] = useState(false)
    /** Correo al que se mandó el código para activar la cuenta */
    const [pendiente, setPendiente] = useState<string | null>(null)

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault()
        if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
        if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return }
        if (!aceptado) { setFaltaAceptar(true); return }
        setLoading(true)
        const correo = email.trim()
        const { data, error } = await supabase.auth.signUp({
            email: correo,
            password,
            // Queda en la cuenta qué versión de los términos aceptó y cuándo
            options: { data: datosDeAceptacion() },
        })
        if (error) {
            setLoading(false)
            toast.error(explainError(error, 'No se pudo crear la cuenta. Intenta de nuevo.'))
            return
        }
        // Con la confirmación encendida, Supabase no avisa que el correo ya
        // existía (para no revelar quién tiene cuenta): devuelve una cuenta
        // vacía, sin forma de entrar
        if (data.user && data.user.identities?.length === 0) {
            setLoading(false)
            toast.error(explainError({ code: 'user_already_exists' }))
            return
        }
        // Sin confirmación de correo, la cuenta ya quedó lista
        if (data.session) { await entrar(data.session.user.id); return }
        setLoading(false)
        setPendiente(correo)
    }

    const verificarCodigo = useCallback(async (codigo: string) => {
        if (!pendiente) return null
        const { data, error } = await supabase.auth.verifyOtp({ email: pendiente, token: codigo, type: 'signup' })
        if (error || !data.user) return explainError(error, 'El código no es correcto o ya venció.')
        await entrar(data.user.id)
        return null
    }, [pendiente, supabase])

    const reenviarCodigo = useCallback(async () => {
        if (!pendiente) return null
        const { error } = await supabase.auth.resend({ type: 'signup', email: pendiente })
        return error ? explainError(error) : null
    }, [pendiente, supabase])

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
                <p className="text-sm mt-1" style={{ color: 'var(--toul-text-muted)' }}>Tu negocio, bajo control</p>
            </div>

            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                {pendiente ? (
                    <div className="fade-in">
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Revisa tu correo</h2>
                        <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                            Escribe el código de 6 números para activar tu cuenta.
                        </p>
                        <div style={{ height: 8 }} />
                        <CodigoCorreo email={pendiente} onVerificar={verificarCodigo} onReenviar={reenviarCodigo} onCambiarCorreo={cambiarCorreo} />
                    </div>
                ) : (
                <>
                <h2 className="text-xl font-bold mb-5" style={{ color: 'var(--toul-text)' }}>Crear cuenta</h2>

                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="correo" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                        <input id="correo" className="toul-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                            placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="clave" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Contraseña</label>
                        <div className="relative">
                            <input id="clave" className="toul-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                                placeholder="Mínimo 8 caracteres" value={password} onChange={e => setPassword(e.target.value)} required />
                            <button type="button" onClick={() => setShowPassword(v => !v)}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--toul-text-subtle)' }}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="confirmar" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Confirmar contraseña</label>
                        <input id="confirmar" className="toul-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
                            placeholder="Repite tu contraseña" value={confirm} onChange={e => setConfirm(e.target.value)} required />
                    </div>
                    <AceptarTerminos aceptado={aceptado} onCambio={setAceptado} error={faltaAceptar} />
                    <button type="submit" className="toul-btn-primary mt-1" disabled={loading}>
                        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                    </button>
                </form>

                <BotonGoogle />

                <p className="text-center text-sm mt-5" style={{ color: 'var(--toul-text-muted)' }}>
                    ¿Ya tienes cuenta?{' '}
                    <Link href="/login" className="font-semibold hover:underline" style={{ color: 'var(--toul-accent)' }}>Entra aquí</Link>
                </p>
                </>
                )}
            </div>
        </div>
    )
}
