'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Printer } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Field } from '@/components/ui'

/** Datos que salen en la tirilla impresa. */
export function ReceiptSettings({ storeId }: { storeId: string }) {
    const supabase = createClient()
    const [form, setForm] = useState({ nit: '', address: '', phone: '', receipt_footer: '' })
    const [available, setAvailable] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        supabase.from('stores').select('nit, address, phone, receipt_footer').eq('id', storeId).single().then(({ data, error }) => {
            if (error) return // migración del modo isla aún no aplicada
            setAvailable(true)
            setForm({ nit: data?.nit ?? '', address: data?.address ?? '', phone: data?.phone ?? '', receipt_footer: data?.receipt_footer ?? '' })
        })
    }, [storeId, supabase])

    async function save() {
        setSaving(true)
        const { error } = await supabase.from('stores').update({
            nit: form.nit.trim() || null,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            receipt_footer: form.receipt_footer.trim() || null,
        }).eq('id', storeId)
        setSaving(false)
        if (error) toast.error('No se pudo guardar')
        else toast.success('Datos de la tirilla guardados')
    }

    if (!available) return null
    const set = (key: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [key]: v }))

    return (
        <div className="toul-card mb-4">
            <div className="flex items-center gap-2 mb-4" style={{ color: 'var(--toul-text-muted)' }}>
                <Printer size={16} />
                <p className="text-sm font-semibold">Tirilla impresa</p>
            </div>
            <div className="flex flex-col gap-3">
                <Field label="NIT o cédula" value={form.nit} onChange={set('nit')} placeholder="900.123.456-7" maxLength={30} />
                <Field label="Dirección" value={form.address} onChange={set('address')} placeholder="C.C. Buenavista · Isla 12" maxLength={80} />
                <Field label="Teléfono" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="300 123 4567" maxLength={20} />
                <Field label="Mensaje final" value={form.receipt_footer} onChange={set('receipt_footer')} placeholder="¡Gracias por tu compra!" maxLength={80} />
                <button onClick={save} disabled={saving} className="toul-btn-primary">{saving ? 'Guardando…' : 'Guardar datos de tirilla'}</button>
            </div>
        </div>
    )
}
