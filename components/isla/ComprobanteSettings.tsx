'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ReceiptText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Field } from '@/components/ui'

type Botones = 'whatsapp' | 'tirilla' | 'ambos'

const OPCIONES: { valor: Botones; label: string; detalle: string }[] = [
    { valor: 'whatsapp', label: 'WhatsApp', detalle: 'El comprobante se manda al chat del cliente' },
    { valor: 'tirilla', label: 'Tirilla', detalle: 'Se imprime en la impresora de la caja' },
    { valor: 'ambos', label: 'Los dos', detalle: 'Salen los dos botones al terminar la venta' },
]

/** Comprobante de la venta: qué botones salen al terminar y qué datos lleva. */
export function ComprobanteSettings({ storeId, isPro }: { storeId: string; isPro: boolean }) {
    const [form, setForm] = useState({ nit: '', address: '', phone: '', receipt_footer: '' })
    const [botones, setBotones] = useState<Botones>('ambos')
    // Sin el SQL nuevo la base no tiene dónde guardar los botones
    const [conBotones, setConBotones] = useState(false)
    const [available, setAvailable] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        createClient().from('stores').select('*').eq('id', storeId).single().then(({ data, error }) => {
            if (error || !data) return
            const fila = data as Record<string, unknown>
            const texto = (k: string) => (typeof fila[k] === 'string' ? fila[k] as string : '')
            setAvailable(true)
            setConBotones('receipt_buttons' in fila)
            const b = fila.receipt_buttons
            setBotones(b === 'whatsapp' || b === 'tirilla' ? b : 'ambos')
            setForm({ nit: texto('nit'), address: texto('address'), phone: texto('phone'), receipt_footer: texto('receipt_footer') })
        })
    }, [storeId])

    async function save() {
        setSaving(true)
        const cambios: Record<string, unknown> = {
            nit: form.nit.trim() || null,
            address: form.address.trim() || null,
            phone: form.phone.trim() || null,
            receipt_footer: form.receipt_footer.trim() || null,
        }
        if (conBotones && isPro) cambios.receipt_buttons = botones
        const { error } = await createClient().from('stores').update(cambios).eq('id', storeId)
        setSaving(false)
        if (error) toast.error('No se pudo guardar')
        else toast.success('Comprobante guardado')
    }

    if (!available) return null
    const set = (key: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [key]: v }))

    return (
        <div className="toul-card mb-4">
            <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--toul-text-muted)' }}>
                <ReceiptText size={16} />
                <p className="text-sm font-semibold">Comprobante</p>
            </div>
            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 14px', lineHeight: 1.5 }}>
                {isPro ? 'Lo que sale al terminar cada venta en la caja.' : 'Al terminar cada venta sale el botón para mandarlo por WhatsApp.'}
            </p>

            {isPro && conBotones && (
                <div role="radiogroup" aria-label="Botones del comprobante" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {OPCIONES.map(o => {
                        const on = botones === o.valor
                        return (
                            <button key={o.valor} type="button" role="radio" aria-checked={on} onClick={() => setBotones(o.valor)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                                    background: on ? 'var(--toul-surface-2)' : 'transparent', border: `1px solid ${on ? 'var(--toul-border-2)' : 'var(--toul-border)'}`,
                                }}>
                                <span aria-hidden style={{
                                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                                    boxShadow: on ? 'inset 0 0 0 5px var(--toul-accent)' : 'inset 0 0 0 1.5px var(--toul-text-faint)',
                                }} />
                                <span style={{ minWidth: 0 }}>
                                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--toul-text)' }}>{o.label}</span>
                                    <span style={{ display: 'block', fontSize: 12.5, color: 'var(--toul-text-dim)' }}>{o.detalle}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            <div className="flex flex-col gap-3">
                <Field label="Mensaje final" capitalize value={form.receipt_footer} onChange={set('receipt_footer')} placeholder="¡Gracias por tu compra!" maxLength={120} />
                <Field label="NIT o cédula" value={form.nit} onChange={set('nit')} placeholder="900.123.456-7" maxLength={30} />
                <Field label="Dirección" capitalize value={form.address} onChange={set('address')} placeholder="C.C. Buenavista · Isla 12" maxLength={80} />
                <Field label="Teléfono" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} placeholder="300 123 4567" maxLength={20} />
                <button onClick={save} disabled={saving} className="toul-btn-primary">{saving ? 'Guardando…' : 'Guardar comprobante'}</button>
            </div>
        </div>
    )
}
