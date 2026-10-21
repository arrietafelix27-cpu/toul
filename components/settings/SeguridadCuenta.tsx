'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, KeyRound, MonitorSmartphone, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { explainError } from '@/lib/errors'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { Sheet } from '@/components/isla/Sheet'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'

/* ══════════════════════════════════════════════════════════════
   Seguridad de la cuenta, en Ajustes.

   - Cambiar la contraseña sin salir de la app. Pide la actual:
     si alguien agarra el celular desbloqueado, no puede quedarse
     con la cuenta.
   - Cerrar la sesión en todos los equipos, por si se perdió un
     celular o se entró en un computador ajeno.

   Quien entró con Google no tiene contraseña: aquí puede crear
   una para entrar también con su correo.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.sc-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; text-align: left;
    background: transparent; border: 0; font: inherit; cursor: pointer;
    transition: background-color 160ms var(--toul-ease-emil); }
.sc-fila:active { background: var(--toul-surface-3); }
@media (hover: hover) and (pointer: fine) { .sc-fila:hover { background: var(--toul-surface-3); } }
`

function CampoClave({ id, label, valor, onCambio, autoComplete, visible, autoFocus }: {
    id: string; label: string; valor: string; onCambio: (v: string) => void
    autoComplete: string; visible: boolean; autoFocus?: boolean
}) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--toul-text-muted)' }}>{label}</label>
            <input id={id} className="toul-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete}
                value={valor} onChange={e => onCambio(e.target.value)} autoFocus={autoFocus} />
        </div>
    )
}

export function SeguridadCuenta({ storeId, email }: { storeId: string | null; email: string }) {
    const supabase = createClient()
    /** null mientras se averigua; false si la cuenta solo entra con Google */
    const [tieneClave, setTieneClave] = useState<boolean | null>(null)
    const [abierto, setAbierto] = useState(false)
    const [actual, setActual] = useState('')
    const [nueva, setNueva] = useState('')
    const [repetida, setRepetida] = useState('')
    const [ver, setVer] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [confirmarTodos, setConfirmarTodos] = useState(false)
    const { cerrarEnTodos, cerrando, dialogo } = useCerrarSesion(storeId)

    useEffect(() => {
        let vigente = true
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!vigente || !user) return
            setTieneClave((user.identities ?? []).some(i => i.provider === 'email'))
        })
        return () => { vigente = false }
    }, [supabase])

    const cerrarHoja = useCallback(() => {
        if (guardando) return
        setAbierto(false)
        setActual(''); setNueva(''); setRepetida(''); setVer(false)
    }, [guardando])

    async function guardar() {
        if (tieneClave && !actual) { toast.error('Escribe la contraseña que tienes ahora'); return }
        if (nueva.length < 8) { toast.error('La contraseña nueva debe tener al menos 8 caracteres'); return }
        if (nueva !== repetida) { toast.error('Las contraseñas nuevas no coinciden'); return }
        setGuardando(true)
        if (tieneClave) {
            // Se comprueba la actual entrando con ella
            const { error } = await supabase.auth.signInWithPassword({ email, password: actual })
            if (error) {
                setGuardando(false)
                toast.error(error.code === 'invalid_credentials' ? 'La contraseña actual no es correcta.' : explainError(error))
                return
            }
        }
        const { error } = await supabase.auth.updateUser({ password: nueva })
        setGuardando(false)
        if (error) { toast.error(explainError(error, 'No se pudo cambiar la contraseña. Intenta de nuevo.')); return }
        toast.success(tieneClave ? 'Contraseña cambiada' : 'Contraseña creada')
        setTieneClave(true)
        setAbierto(false)
        setActual(''); setNueva(''); setRepetida(''); setVer(false)
    }

    const tituloClave = tieneClave === false ? 'Crear contraseña' : 'Cambiar contraseña'

    return (
        <>
            <style>{CSS}</style>
            <p className="toul-section-label" style={{ marginTop: 24 }}>Seguridad</p>
            <div className="toul-card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
                <button className="sc-fila" onClick={() => setAbierto(true)} disabled={tieneClave === null}>
                    <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                        <KeyRound size={17} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)' }}>{tituloClave}</span>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>
                            {tieneClave === false ? 'Para entrar también con tu correo' : 'Te pedimos la que tienes ahora'}
                        </span>
                    </span>
                    <ChevronRight size={16} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
                </button>
                <div style={{ height: 1, background: 'var(--toul-divider)', marginLeft: 68 }} />
                <button className="sc-fila" onClick={() => setConfirmarTodos(true)} disabled={cerrando}>
                    <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                        <MonitorSmartphone size={17} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)' }}>Cerrar sesión en todos los equipos</span>
                        <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-dim)' }}>Si perdiste un celular o entraste en un equipo ajeno</span>
                    </span>
                    <ChevronRight size={16} style={{ color: 'var(--toul-text-faint)', flexShrink: 0 }} />
                </button>
            </div>

            <Sheet open={abierto} onClose={cerrarHoja} title={tituloClave} subtitle={email} width={420}
                footer={
                    <button className="toul-btn-primary" onClick={guardar} disabled={guardando}>
                        {guardando ? 'Guardando…' : 'Guardar contraseña'}
                    </button>
                }>
                <form onSubmit={e => { e.preventDefault(); void guardar() }} className="flex flex-col gap-4">
                    {/* El correo va escondido para que el administrador de contraseñas sepa de qué cuenta es */}
                    <input type="email" autoComplete="username" value={email} readOnly hidden />
                    {tieneClave && (
                        <CampoClave id="clave-actual" label="Contraseña actual" valor={actual} onCambio={setActual}
                            autoComplete="current-password" visible={ver} autoFocus />
                    )}
                    <CampoClave id="clave-nueva" label="Contraseña nueva" valor={nueva} onCambio={setNueva}
                        autoComplete="new-password" visible={ver} autoFocus={!tieneClave} />
                    <CampoClave id="clave-repetida" label="Repite la contraseña nueva" valor={repetida} onCambio={setRepetida}
                        autoComplete="new-password" visible={ver} />
                    <button type="button" onClick={() => setVer(v => !v)}
                        className="flex items-center gap-2 text-sm" style={{ color: 'var(--toul-text-muted)', background: 'none', border: 0, padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }}>
                        {ver ? <EyeOff size={15} /> : <Eye size={15} />} {ver ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
                    </button>
                    <button type="submit" hidden />
                </form>
            </Sheet>

            <ConfirmSheet
                open={confirmarTodos}
                onClose={() => setConfirmarTodos(false)}
                onConfirm={() => { setConfirmarTodos(false); void cerrarEnTodos() }}
                title="¿Cerrar sesión en todos los equipos?"
                message="Sales de este equipo y de cualquier otro celular o computador donde hayas entrado con tu cuenta. En los otros puede tardar hasta una hora. Después vuelves a entrar como siempre."
                confirmLabel="Cerrar en todos"
                danger
            />
            {dialogo}
        </>
    )
}
