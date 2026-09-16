'use client'

import { useState } from 'react'
import useSWR from 'swr'
import toast from 'react-hot-toast'
import { Users, UserPlus, Copy, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Field } from '@/components/ui'
import { Sheet } from './Sheet'

const supabase = createClient()

interface Member { id: string; user_id: string; role: 'admin' | 'seller'; display_name: string; email: string | null; is_active: boolean }
interface Invite { id: string; code: string; display_name: string; expires_at: string }

/** Equipo: vendedores con cuenta propia, códigos de invitación y desactivación. */
export function TeamSection({ storeId }: { storeId: string }) {
    const [inviteOpen, setInviteOpen] = useState(false)
    const [name, setName] = useState('')
    const [creating, setCreating] = useState(false)
    const [created, setCreated] = useState<{ code: string; name: string } | null>(null)

    const { data, mutate } = useSWR(['team', storeId], async () => {
        const [members, invites] = await Promise.all([
            supabase.from('store_members').select('*').eq('store_id', storeId).order('created_at'),
            supabase.from('store_invites').select('id, code, display_name, expires_at')
                .eq('store_id', storeId).is('used_at', null).eq('revoked', false).gt('expires_at', new Date().toISOString()),
        ])
        return { members: (members.data ?? []) as Member[], invites: (invites.data ?? []) as Invite[], ready: !members.error }
    })

    async function createInvite() {
        if (!name.trim()) return
        setCreating(true)
        const { data: res, error } = await supabase.rpc('toul_create_invite', { p_display_name: name.trim() })
        setCreating(false)
        if (error) { toast.error(error.message); return }
        setCreated({ code: (res as { code: string }).code, name: name.trim() })
        setName('')
        mutate()
    }

    async function setActive(member: Member, active: boolean) {
        const { error } = await supabase.rpc('toul_set_member_active', { p_member_id: member.id, p_active: active })
        if (error) { toast.error(error.message); return }
        toast.success(active ? `${member.display_name} puede volver a vender` : `${member.display_name} ya no tiene acceso`)
        mutate()
    }

    async function revoke(invite: Invite) {
        await supabase.rpc('toul_revoke_invite', { p_invite_id: invite.id })
        mutate()
    }

    const shareText = (code: string, who: string) =>
        `Hola ${who}, para entrar a la caja de TOUL:\n1. Crea tu cuenta en ${typeof window !== 'undefined' ? window.location.origin : ''}/register\n2. Elige "Soy vendedor" y escribe este código: ${code}\n(El código vence en 7 días)`

    if (data && !data.ready) return null

    return (
        <div className="toul-card mb-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2" style={{ color: 'var(--toul-text-muted)' }}>
                    <Users size={16} />
                    <p className="text-sm font-semibold">Equipo</p>
                </div>
                <button onClick={() => { setInviteOpen(true); setCreated(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--toul-accent)', color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <UserPlus size={15} /> Agregar vendedor
                </button>
            </div>

            {(data?.members ?? []).map((m, i) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid var(--toul-divider)' : 'none', opacity: m.is_active ? 1 : 0.5 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.role === 'admin' ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: m.role === 'admin' ? 'var(--toul-accent)' : 'var(--toul-text-muted)', flexShrink: 0 }}>
                        {m.display_name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{m.display_name}</p>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>
                            {m.role === 'admin' ? 'Administrador' : 'Vendedor'}{m.email ? ` · ${m.email}` : ''}{!m.is_active ? ' · Sin acceso' : ''}
                        </p>
                    </div>
                    {m.role === 'seller' && (
                        <button onClick={() => setActive(m, !m.is_active)}
                            style={{ height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--toul-border)', background: 'transparent', color: m.is_active ? 'var(--toul-error)' : 'var(--toul-accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {m.is_active ? 'Quitar acceso' : 'Reactivar'}
                        </button>
                    )}
                </div>
            ))}

            {(data?.invites ?? []).map(inv => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--toul-divider)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', margin: 0 }}>{inv.display_name} <span style={{ fontWeight: 500, color: 'var(--toul-warning)', fontSize: 12 }}>· invitación pendiente</span></p>
                        <p style={{ fontSize: 12, color: 'var(--toul-text-dim)', margin: 0 }}>Código <strong style={{ letterSpacing: '0.12em', color: 'var(--toul-text-muted)' }}>{inv.code}</strong></p>
                    </div>
                    <button onClick={() => revoke(inv)} style={{ background: 'none', border: 'none', color: 'var(--toul-text-dim)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                </div>
            ))}

            <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)}
                title={created ? `Código para ${created.name}` : 'Agregar vendedor'}
                subtitle={created ? 'Compártelo por WhatsApp. Vence en 7 días y sirve una sola vez.' : 'Cada vendedor entra con su propia cuenta.'}
                footer={created ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="toul-btn-secondary" style={{ color: 'var(--toul-text)' }}
                            onClick={async () => { try { await navigator.clipboard.writeText(shareText(created.code, created.name)); toast.success('Copiado') } catch { toast.error('No se pudo copiar') } }}>
                            <Copy size={17} /> Copiar
                        </button>
                        <a className="toul-btn-primary" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                            href={`https://wa.me/?text=${encodeURIComponent(shareText(created.code, created.name))}`}>
                            <MessageCircle size={17} /> WhatsApp
                        </a>
                    </div>
                ) : (
                    <button className="toul-btn-primary" disabled={!name.trim() || creating} onClick={createInvite}>
                        {creating ? 'Creando…' : 'Crear código'}
                    </button>
                )}>
                {created ? (
                    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
                        <p style={{ fontSize: 44, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--toul-accent)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{created.code}</p>
                        <p style={{ fontSize: 14, color: 'var(--toul-text-muted)', margin: '10px 0 0', lineHeight: 1.5 }}>
                            {created.name} debe crear su cuenta, elegir <strong style={{ color: 'var(--toul-text)' }}>“Soy vendedor”</strong> y escribir este código.
                        </p>
                    </div>
                ) : (
                    <Field label="Nombre del vendedor" required value={name} onChange={setName} placeholder="Ej: Laura" maxLength={40} autoFocus />
                )}
            </Sheet>
        </div>
    )
}
