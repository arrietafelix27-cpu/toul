'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion'
import toast from 'react-hot-toast'

/* ══════════════════════════════════════════════════════════════
   El código de 6 números que llega al correo.

   Antes las cuentas se confirmaban con un enlace. El enlace solo
   servía en el mismo navegador donde se pidió: si lo pedías en el
   computador y lo abrías en el celular, decía "Enlace vencido".
   El código sirve en cualquier equipo: lo lees y lo escribes.

   Una sola casilla de verdad detrás de las 6 cajitas: así pegar el
   código y el autocompletar del celular funcionan sin trucos.
   ══════════════════════════════════════════════════════════════ */

const LARGO = 6
/** Supabase no deja pedir otro código antes de un minuto */
const ESPERA = 60

const CSS = `
.cc-cajas { position: relative; display: grid; grid-template-columns: repeat(${LARGO}, 1fr); gap: 8px; }
.cc-caja { height: 58px; border-radius: 14px; display: flex; align-items: center; justify-content: center;
    font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--toul-text);
    background: var(--toul-surface); border: 1px solid var(--toul-border);
    transition: border-color 160ms var(--toul-ease-emil), background-color 160ms var(--toul-ease-emil), opacity 200ms var(--toul-ease-emil); }
.cc-caja[data-activa="1"] { border-color: var(--toul-border-focused); background: var(--toul-surface-focused); }
.cc-caja[data-error="1"] { border-color: var(--toul-error); }
.cc-cajas[data-ocupado="1"] .cc-caja { opacity: 0.45; }
.cc-cursor { width: 2px; height: 26px; border-radius: 1px; background: var(--toul-accent); animation: cc-parpadeo 1.1s steps(1) infinite; }
@keyframes cc-parpadeo { 50% { opacity: 0; } }
.cc-input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; border: 0; padding: 0;
    font-size: 16px; color: transparent; caret-color: transparent; background: transparent; cursor: text; }
.cc-reenviar { background: none; border: 0; padding: 6px 2px; font: inherit; font-size: 13.5px; font-weight: 600;
    color: var(--toul-accent); cursor: pointer; transition: opacity 160ms var(--toul-ease-emil); }
.cc-reenviar:disabled { color: var(--toul-text-dim); font-weight: 500; cursor: default; }
@media (prefers-reduced-motion: reduce) { .cc-cursor { animation: none; } }
`

function mmss(segundos: number) {
    const s = Math.max(0, Math.round(segundos))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function CodigoCorreo({ email, onVerificar, onReenviar, onCambiarCorreo }: {
    email: string
    /** Devuelve el mensaje de error para mostrar, o null si el código sirvió */
    onVerificar: (codigo: string) => Promise<string | null>
    /** Devuelve el mensaje de error, o null si se envió */
    onReenviar: () => Promise<string | null>
    onCambiarCorreo?: () => void
}) {
    const [codigo, setCodigo] = useState('')
    const [enFoco, setEnFoco] = useState(true)
    const [verificando, setVerificando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [espera, setEspera] = useState(ESPERA)
    const [reenviando, setReenviando] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const enCurso = useRef(false)
    const sacudir = useAnimationControls()
    const sinMovimiento = useReducedMotion()

    // Cuenta regresiva para poder pedir otro código
    useEffect(() => {
        if (espera <= 0) return
        const t = setTimeout(() => setEspera(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [espera])

    const verificar = useCallback(async (valor: string) => {
        if (enCurso.current) return
        enCurso.current = true
        setVerificando(true)
        setError(null)
        const fallo = await onVerificar(valor)
        enCurso.current = false
        if (!fallo) return // la pantalla que lo usa ya está cambiando
        setVerificando(false)
        setError(fallo)
        setCodigo('')
        if (!sinMovimiento) void sacudir.start({ x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.32, ease: 'easeOut' } })
        requestAnimationFrame(() => inputRef.current?.focus())
    }, [onVerificar, sacudir, sinMovimiento])

    function alEscribir(texto: string) {
        const limpio = texto.replace(/\D/g, '').slice(0, LARGO)
        setCodigo(limpio)
        if (error) setError(null)
        if (limpio.length === LARGO) void verificar(limpio)
    }

    async function reenviar() {
        setReenviando(true)
        const fallo = await onReenviar()
        setReenviando(false)
        if (fallo) { toast.error(fallo); return }
        setEspera(ESPERA)
        setError(null)
        setCodigo('')
        toast.success('Te enviamos un código nuevo')
        inputRef.current?.focus()
    }

    const activa = enFoco && !verificando ? Math.min(codigo.length, LARGO - 1) : -1

    return (
        <div>
            <style>{CSS}</style>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--toul-text-muted)', margin: '0 0 20px' }}>
                Lo enviamos a <span style={{ color: 'var(--toul-text)', fontWeight: 600, wordBreak: 'break-all' }}>{email}</span>.
                {' '}Si no lo ves, revisa en correo no deseado.
            </p>

            <motion.div animate={sacudir}>
                <div className="cc-cajas" data-ocupado={verificando ? '1' : '0'}
                    onClick={() => inputRef.current?.focus()}>
                    {Array.from({ length: LARGO }, (_, i) => (
                        <div key={i} className="cc-caja" data-activa={i === activa ? '1' : '0'} data-error={error ? '1' : '0'}>
                            {codigo[i] ?? (i === activa ? <span className="cc-cursor" /> : null)}
                        </div>
                    ))}
                    <input ref={inputRef} className="cc-input" value={codigo}
                        onChange={e => alEscribir(e.target.value)}
                        onFocus={() => setEnFoco(true)} onBlur={() => setEnFoco(false)}
                        inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
                        maxLength={LARGO} autoFocus disabled={verificando}
                        aria-label={`Código de ${LARGO} números`} />
                </div>
            </motion.div>

            <div style={{ minHeight: 22, marginTop: 10 }}>
                {error ? (
                    <p role="alert" style={{ fontSize: 13, color: 'var(--toul-error)', margin: 0, lineHeight: 1.45 }}>{error}</p>
                ) : verificando ? (
                    <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0 }}>Verificando…</p>
                ) : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 }}>
                <button type="button" className="cc-reenviar" onClick={reenviar} disabled={espera > 0 || reenviando || verificando}>
                    {reenviando ? 'Enviando…' : espera > 0 ? `Pedir otro en ${mmss(espera)}` : 'Pedir otro código'}
                </button>
                {onCambiarCorreo && (
                    <button type="button" className="cc-reenviar" onClick={onCambiarCorreo} disabled={verificando}
                        style={{ color: 'var(--toul-text-muted)', fontWeight: 500 }}>
                        Cambiar correo
                    </button>
                )}
            </div>
        </div>
    )
}
