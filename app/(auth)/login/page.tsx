'use client'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { explainError } from '@/lib/errors'
import { entrarDeCero, limpiarDatosDeCuenta, marcarCuenta } from '@/lib/session/limpiarCuenta'
import { CodigoCorreo } from '@/components/auth/CodigoCorreo'
import { BotonGoogle } from '@/components/auth/BotonGoogle'
import { Eye, EyeOff } from 'lucide-react'

/** Se entra de cero: si en este equipo quedó algo de otra cuenta
 *  —porque la sesión venció en vez de cerrarse—, se borra antes
 *  de mostrar nada */
async function entrar(userId: string) {
    await limpiarDatosDeCuenta()
    marcarCuenta(userId)
    entrarDeCero('/')
}

const sinCambios = () => () => {}

export default function LoginPage() {
    const supabase = createClient()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    /** Correo que todavía no se confirmó: se pide el código aquí mismo */
    const [pendiente, setPendiente] = useState<string | null>(null)

    // Google devuelve aquí con ?code=…; Supabase lo canjea solo al arrancar
    const busqueda = useSyncExternalStore(sinCambios, () => window.location.search, () => '')
    const vuelta = useMemo(() => new URLSearchParams(busqueda), [busqueda])
    const [googleFallo, setGoogleFallo] = useState(false)
    const volviendoDeGoogle = vuelta.has('code') && !googleFallo

    useEffect(() => {
        if (vuelta.get('error')) {
            toast.error(vuelta.get('error') === 'access_denied'
                ? 'No se completó la entrada con Google.'
                : 'No se pudo entrar con Google. Intenta de nuevo.')
            window.history.replaceState(null, '', '/login')
            return
        }
        if (!vuelta.has('code')) return
        let vigente = true
        supabase.auth.getSession().then(({ data }) => {
            if (!vigente) return
            if (data.session) { void entrar(data.session.user.id); return }
            toast.error('No se pudo entrar con Google. Intenta de nuevo.')
            window.history.replaceState(null, '', '/login')
            setGoogleFallo(true)
        })
        return () => { vigente = false }
    }, [vuelta, supabase])

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        const correo = email.trim()
        const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password })
        if (error) {
            // Se registró pero no puso el código: se le manda otro y se pide aquí
            if (error.code === 'email_not_confirmed') {
                const reenvio = await supabase.auth.resend({ type: 'signup', email: correo })
                // Si se mandó uno hace poco, ese mismo sigue sirviendo
                if (reenvio.error && reenvio.error.code !== 'over_email_send_rate_limit') {
                    toast.error(explainError(reenvio.error))
                } else {
                    setPendiente(correo)
                }
            } else {
                toast.error(explainError(error, 'No se pudo entrar. Intenta de nuevo.'))
            }
            setLoading(false)
            return
        }
        await entrar(data.user.id)
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
            {/* Logo */}
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

            {/* Card */}
            <div className="w-full max-w-sm rounded-3xl p-6"
                style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                {volviendoDeGoogle ? (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div style={{ width: 22, height: 22, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        <p className="text-sm" style={{ color: 'var(--toul-text-muted)' }}>Entrando con Google…</p>
                    </div>
                ) : pendiente ? (
                    <div className="fade-in">
                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--toul-text)' }}>Confirma tu correo</h2>
                        <p className="text-sm mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                            Falta un paso: escribe el código de 6 números que te enviamos.
                        </p>
                        <div style={{ height: 8 }} />
                        <CodigoCorreo email={pendiente} onVerificar={verificarCodigo} onReenviar={reenviarCodigo} onCambiarCorreo={cambiarCorreo} />
                    </div>
                ) : (
                    <>
                        <h2 className="text-xl font-bold mb-5" style={{ color: 'var(--toul-text)' }}>Bienvenido de nuevo</h2>

                        <form onSubmit={handleLogin} className="flex flex-col gap-4">
                            <div>
                                <label htmlFor="correo" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Correo</label>
                                <input id="correo" className="toul-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
                                    placeholder="hola@minegocio.com" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                            <div>
                                <label htmlFor="clave" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>Contraseña</label>
                                <div className="relative">
                                    <input id="clave" className="toul-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
                                        placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                                    <button type="button" onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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

                        <BotonGoogle />

                        <p className="text-center text-sm mt-5" style={{ color: 'var(--toul-text-muted)' }}>
                            ¿No tienes cuenta?{' '}
                            <Link href="/register" className="font-semibold hover:underline" style={{ color: 'var(--toul-accent)' }}>
                                Crea tu cuenta
                            </Link>
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
