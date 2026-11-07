'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { leerPermisos, type Nivel, type PermisosVendedor, type SiNo } from '@/lib/pos/permisos'
import { onlyDigits } from '@/lib/format/text'

const NIVELES: { valor: Nivel; label: string }[] = [
    { valor: 'solo', label: 'Puede hacerlo solo' },
    { valor: 'aprobacion', label: 'Necesita aprobación' },
    { valor: 'no', label: 'No permitido' },
]
const SI_NO: { valor: SiNo; label: string }[] = [
    { valor: 'solo', label: 'Puede hacerlo' },
    { valor: 'no', label: 'No permitido' },
]

const ACCIONES: { key: 'fiar' | 'anular' | 'devolver'; label: string }[] = [
    { key: 'fiar', label: 'Fiar' },
    { key: 'anular', label: 'Anular ventas' },
    { key: 'devolver', label: 'Hacer devoluciones' },
]

/** Lo que puede hacer el vendedor sin el administrador (plan Pro). Lo hace cumplir el servidor. */
export function PermisosEquipo({ storeId }: { storeId: string }) {
    const [permisos, setPermisos] = useState<PermisosVendedor | null>(null)
    const [sinBase, setSinBase] = useState(false)
    const [descuento, setDescuento] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        createClient().from('stores').select('*').eq('id', storeId).single().then(({ data, error }) => {
            if (error || !data) return
            const fila = data as Record<string, unknown>
            if (!('seller_permissions' in fila)) { setSinBase(true); return }
            const p = leerPermisos(fila.seller_permissions)
            setPermisos(p)
            setDescuento(String(p.descuento_max))
        })
    }, [storeId])

    if (sinBase) {
        return (
            <div className="toul-card mb-4">
                <Titulo />
                <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: 0, lineHeight: 1.5 }}>
                    Falta actualizar la base de datos para poder elegir los permisos. Mientras tanto todo sigue como siempre.
                </p>
            </div>
        )
    }
    if (!permisos) return null

    const set = <K extends keyof PermisosVendedor>(k: K, v: PermisosVendedor[K]) => setPermisos(p => p ? { ...p, [k]: v } : p)

    async function save() {
        if (!permisos) return
        setSaving(true)
        const pct = Math.min(100, Math.max(0, Math.round(Number(descuento) || 0)))
        const { error } = await createClient().rpc('toul_set_seller_permissions', { p_permissions: { ...permisos, descuento_max: pct } })
        setSaving(false)
        if (error) { toast.error(error.message || 'No se pudieron guardar los permisos'); return }
        setDescuento(String(pct))
        toast.success('Permisos guardados')
    }

    return (
        <div className="toul-card mb-4">
            <Titulo />
            <p style={{ fontSize: 13, color: 'var(--toul-text-dim)', margin: '0 0 14px', lineHeight: 1.5 }}>
                Lo que necesita aprobación te llega a Aprobaciones. Tú siempre puedes hacer todo.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {ACCIONES.map(a => (
                    <Opciones key={a.key} label={a.label} valor={permisos[a.key]} opciones={NIVELES} onChange={v => set(a.key, v)} />
                ))}

                <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: '0 0 6px' }}>Descuento sin aprobación</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ position: 'relative', width: 110 }}>
                            <input type="text" inputMode="numeric" aria-label="Porcentaje máximo de descuento" value={descuento}
                                onChange={e => { const d = onlyDigits(e.target.value); setDescuento(d ? String(Math.min(100, Number(d))) : '') }}
                                style={{
                                    width: '100%', height: 44, borderRadius: 12, padding: '0 30px 0 12px', fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
                                    background: 'var(--toul-surface-2)', border: '1px solid var(--toul-border)', color: 'var(--toul-text)', outline: 'none',
                                }} />
                            <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)' }}>%</span>
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--toul-text-dim)', lineHeight: 1.4 }}>
                            Más que eso pide aprobación. Si lo da en pesos, se cuenta como porcentaje de la venta.
                        </span>
                    </div>
                </div>

                <Opciones label="Ver el efectivo esperado al cerrar" valor={permisos.ver_efectivo} opciones={SI_NO}
                    nota="Si no, cuenta el efectivo sin saber cuánto debería haber." onChange={v => set('ver_efectivo', v)} />
                <Opciones label="Crear clientes" valor={permisos.crear_clientes} opciones={SI_NO} onChange={v => set('crear_clientes', v)} />
                <Opciones label="Registrar gastos" valor={permisos.registrar_gastos} opciones={SI_NO}
                    nota="Desde la caja y con una cuenta del negocio. Nunca puede anotar Metí plata ni Saqué plata." onChange={v => set('registrar_gastos', v)} />

                <button onClick={save} disabled={saving} className="toul-btn-primary">{saving ? 'Guardando…' : 'Guardar permisos'}</button>
            </div>
        </div>
    )
}

function Titulo() {
    return (
        <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--toul-text-muted)' }}>
            <ShieldCheck size={16} />
            <p className="text-sm font-semibold">Permisos del equipo</p>
        </div>
    )
}

function Opciones<T extends string>({ label, valor, opciones, onChange, nota }: {
    label: string; valor: T; opciones: { valor: T; label: string }[]; onChange: (v: T) => void; nota?: string
}) {
    return (
        <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text)', margin: '0 0 6px' }}>{label}</p>
            <div role="radiogroup" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {opciones.map(o => {
                    const on = o.valor === valor
                    return (
                        <button key={o.valor} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.valor)}
                            style={{
                                height: 38, padding: '0 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5,
                                fontWeight: on ? 600 : 500, color: on ? 'var(--toul-text)' : 'var(--toul-text-muted)',
                                background: on ? 'var(--toul-surface-2)' : 'transparent',
                                border: `1px solid ${on ? 'var(--toul-text)' : 'var(--toul-border)'}`,
                            }}>
                            {o.label}
                        </button>
                    )
                })}
            </div>
            {nota && <p style={{ fontSize: 12.5, color: 'var(--toul-text-dim)', margin: '6px 0 0' }}>{nota}</p>}
        </div>
    )
}
