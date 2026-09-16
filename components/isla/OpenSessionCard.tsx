'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { KeyRound } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PriceField, EASE_OUT_EMIL } from '@/components/ui'

/** Apertura de turno: se registra con cuánto efectivo arranca la caja. */
export function OpenSessionCard({ name, onOpened }: { name: string; onOpened: () => void }) {
    const [base, setBase] = useState('')
    const [opening, setOpening] = useState(false)

    async function open() {
        setOpening(true)
        const { error } = await createClient().rpc('toul_open_cash_session', { p_opening_cash: Math.round(Number(base) || 0) })
        setOpening(false)
        if (error) { toast.error(error.message); return }
        toast.success('Turno abierto. ¡Buenas ventas!')
        onOpened()
    }

    return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
            <div className="toul-ambient" />
            <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE_OUT_EMIL }}
                style={{ width: '100%', maxWidth: 420, position: 'relative' }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--toul-accent-dim)', border: '1px solid var(--toul-border-focused)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                    <KeyRound size={24} style={{ color: 'var(--toul-accent)' }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--toul-text-dim)', margin: 0 }}>Hola, {name}</p>
                <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '2px 0 8px' }}>Abre tu turno</h1>
                <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
                    Cuenta el efectivo que hay en la caja antes de empezar. Con esto se cuadra la caja al cerrar.
                </p>
                <PriceField label="Base en efectivo" value={base} onChange={setBase} step={1000} />
                <button className="toul-btn-primary" onClick={open} disabled={opening} style={{ marginTop: 16, height: 58, fontSize: 17 }}>
                    {opening ? 'Abriendo…' : 'Abrir turno'}
                </button>
            </motion.div>
        </div>
    )
}
