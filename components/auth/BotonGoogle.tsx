'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { explainError } from '@/lib/errors'
import { EASE_OUT_EMIL } from '@/components/ui'

/* ══════════════════════════════════════════════════════════════
   Entrar con Google.

   Solo aparece si Google está encendido en Supabase. Mientras no
   se configure, la pantalla queda igual que antes: nunca hay un
   botón que lleve a un error.

   Google devuelve al usuario a /login, y ahí la pantalla de
   entrada termina el trabajo (limpia lo de otra cuenta y entra).
   ══════════════════════════════════════════════════════════════ */

let consulta: Promise<boolean> | null = null

/** Se pregunta una vez por visita */
function googleEncendido(): Promise<boolean> {
    if (!consulta) {
        consulta = fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
            headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        })
            .then(r => (r.ok ? r.json() : null))
            .then(d => !!d?.external?.google)
            .catch(() => { consulta = null; return false })
    }
    return consulta
}

const CSS = `
.bg-boton { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 52px;
    border-radius: 16px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
    background: var(--toul-surface); border: 1px solid var(--toul-border-2); color: var(--toul-text);
    transition: background-color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
.bg-boton:active:not(:disabled) { transform: scale(0.97); }
.bg-boton:disabled { opacity: 0.55; cursor: default; }
@media (hover: hover) and (pointer: fine) { .bg-boton:hover:not(:disabled) { background: var(--toul-surface-2); } }
`

export function BotonGoogle() {
    const [encendido, setEncendido] = useState(false)
    const [yendo, setYendo] = useState(false)

    useEffect(() => {
        let vigente = true
        googleEncendido().then(v => { if (vigente) setEncendido(v) })
        return () => { vigente = false }
    }, [])

    async function entrar() {
        setYendo(true)
        const { error } = await createClient().auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/login` },
        })
        // Si salió bien, el navegador ya se está yendo a Google
        if (error) {
            toast.error(explainError(error, 'No se pudo abrir Google. Intenta de nuevo.'))
            setYendo(false)
        }
    }

    if (!encendido) return null

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT_EMIL }}>
            <style>{CSS}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }} aria-hidden>
                <span style={{ flex: 1, height: 1, background: 'var(--toul-divider)' }} />
                <span style={{ fontSize: 12, color: 'var(--toul-text-dim)' }}>o</span>
                <span style={{ flex: 1, height: 1, background: 'var(--toul-divider)' }} />
            </div>
            <button type="button" className="bg-boton" onClick={entrar} disabled={yendo}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/google.svg" alt="" width={18} height={18} />
                {yendo ? 'Abriendo Google…' : 'Continuar con Google'}
            </button>
        </motion.div>
    )
}
