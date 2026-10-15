'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { SegmentedTabs } from '@/components/customers/SegmentedTabs'
import { Directory } from '@/components/customers/Directory'
import { Receivables } from '@/components/customers/Receivables'
import { fadeUp } from '@/lib/motion'

const supabase = createClient()

/* ══════════════════════════════════════════════════════════════
   Clientes — dos puertas, un módulo.

     Mis clientes        quiénes son, qué compran, quién vuelve
     Cuentas por cobrar  dónde está la plata y a quién cobrarle hoy

   Son dos trabajos distintos que antes se estorbaban: la deuda
   tapaba el valor del cliente y el cliente diluía la urgencia
   del cobro. El número en la pestaña existe para que la plata
   afuera se vea sin tener que entrar a buscarla.

   /customers?ver=cobros abre directo en la cartera, para que el
   widget del inicio y un link de WhatsApp caigan donde deben.
   ══════════════════════════════════════════════════════════════ */

type Vista = 'clientes' | 'cobros'

export default function CustomersPage() {
    const [vista, setVista] = useState<Vista>('clientes')

    // Misma llave que usa la cartera: SWR hace una sola consulta
    // y las dos pantallas comparten la respuesta
    const { data: cartera } = useSWR('cartera', async () => {
        const { data, error } = await supabase.rpc('toul_receivables')
        if (error) throw error
        return data as { clientes: unknown[] }
    }, { revalidateOnFocus: true })

    useEffect(() => {
        const ver = new URLSearchParams(window.location.search).get('ver')
        if (ver === 'cobros' || ver === 'deben') setVista('cobros')
    }, [])

    function cambiar(key: string) {
        setVista(key as Vista)
        const url = key === 'cobros' ? '/customers?ver=cobros' : '/customers'
        window.history.replaceState(null, '', url)
    }

    return (
        <div className="px-4 md:px-8 pt-6 pb-24" style={{ position: 'relative' }}>
            <div className="toul-ambient" />
            <div style={{ position: 'relative', maxWidth: 760, margin: '0 auto' }}>

                <motion.h1 variants={fadeUp} initial="hidden" animate="visible"
                    style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: '0 0 14px' }}>
                    Clientes
                </motion.h1>

                <motion.div variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 18 }}>
                    <SegmentedTabs
                        value={vista}
                        onChange={cambiar}
                        items={[
                            { key: 'clientes', label: 'Mis clientes' },
                            { key: 'cobros', label: 'Cuentas por cobrar', count: cartera?.clientes?.length ?? 0 },
                        ]} />
                </motion.div>

                {vista === 'clientes' ? <Directory /> : <Receivables />}
            </div>
        </div>
    )
}
