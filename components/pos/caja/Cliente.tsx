'use client'

import { useMemo, useState } from 'react'
import { Search, UserPlus } from 'lucide-react'
import type { Customer } from '@/lib/types'
import type { POSDataState } from '@/lib/pos/usePOSData'
import type { POSPaymentState } from '@/lib/pos/usePOSPayment'
import { buscarClientes, clienteConTelefono, pareceTelefono } from '@/lib/pos/clientes'
import { Iniciales } from './piezas'

/** Cliente de la venta: buscar por nombre o teléfono, y "+ Crear" si no está */
export function Cliente({ data, payment, puedeCrear, esFiado }: {
    data: POSDataState
    payment: POSPaymentState
    /** El vendedor sin permiso solo puede elegir clientes que ya existen */
    puedeCrear: boolean
    esFiado: boolean
}) {
    const [creando, setCreando] = useState(false)
    const [otroDato, setOtroDato] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // El que ya tenía ese teléfono, según el servidor
    const [existente, setExistente] = useState<Customer | null>(null)

    const q = payment.customerSearch
    const elegido = payment.selectedCustomer
    const resultados = useMemo(() => buscarClientes(data.customers, q, 6), [data.customers, q])

    // Si lo que se escribió es un teléfono, se pide el nombre; si es un nombre, el teléfono
    const porTelefono = pareceTelefono(q)
    const nombre = porTelefono ? otroDato.trim() : q.trim()
    const telefono = porTelefono ? q.trim() : otroDato.trim()
    const repetido = clienteConTelefono(data.customers, telefono) ?? existente

    const limpiar = () => { setCreando(false); setOtroDato(''); setError(null); setExistente(null) }
    const elegir = (c: Customer) => { payment.setSelectedCustomer(c); payment.setCustomerSearch(''); limpiar() }

    const crear = async () => {
        if (!nombre || guardando || repetido) return
        setGuardando(true)
        setError(null)
        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: nombre, phone: telefono || null }),
            })
            const body = await res.json()
            if (res.status === 409 && body.existing) { setExistente(body.existing); return }
            if (!res.ok) { setError(body.error || 'No se pudo crear el cliente'); return }
            elegir(body.customer)
            data.refreshCustomers()
        } catch {
            setError('Sin conexión. Intenta de nuevo.')
        } finally {
            setGuardando(false)
        }
    }

    if (elegido) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Iniciales nombre={elegido.name} />
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{elegido.name}</span>
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--toul-text-subtle)' }}>{elegido.phone || 'Sin teléfono'}</span>
                </span>
                <button type="button" onClick={() => { payment.setSelectedCustomer(null); limpiar() }} className="cj-btn cj-link">Cambiar</button>
            </div>
        )
    }

    const sinResultados = !!q.trim() && resultados.length === 0

    return (
        <div>
            <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                <input
                    type="text" autoComplete="off" spellCheck={false} enterKeyHint="search" data-enter="propio"
                    aria-label="Buscar cliente por nombre o teléfono"
                    placeholder="Nombre o teléfono"
                    value={q}
                    onChange={e => { payment.setCustomerSearch(e.target.value); setExistente(null); setError(null) }}
                    onKeyDown={e => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        if (resultados[0]) elegir(resultados[0])
                        else if (puedeCrear && q.trim()) setCreando(true)
                    }}
                    className="cj-campo" style={{ paddingLeft: 40 }}
                />
            </div>

            {q.trim() && resultados.length > 0 && (
                <div role="listbox" aria-label="Clientes" style={{ marginTop: 6 }}>
                    {resultados.map(c => (
                        <button key={c.id} type="button" role="option" aria-selected={false} onClick={() => elegir(c)} className="cj-btn cj-press-suave"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '6px 4px', background: 'transparent', textAlign: 'left', borderBottom: '1px solid var(--toul-divider)' }}>
                            <Iniciales nombre={c.name} tamaño={34} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 550, color: 'var(--toul-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                            {c.phone && <span className="cj-num" style={{ fontSize: 13, color: 'var(--toul-text-subtle)', flexShrink: 0 }}>{c.phone}</span>}
                        </button>
                    ))}
                </div>
            )}

            {q.trim() && puedeCrear && !creando && (
                <button type="button" onClick={() => setCreando(true)} className="cj-btn cj-link" style={{ marginTop: 10, color: sinResultados ? 'var(--toul-text)' : undefined }}>
                    <UserPlus size={15} /> Crear {porTelefono ? 'cliente con este número' : `"${q.trim()}"`}
                </button>
            )}

            {sinResultados && !puedeCrear && (
                <p style={{ fontSize: 13, color: esFiado ? 'var(--toul-warning)' : 'var(--toul-text-subtle)', margin: '8px 2px 0' }}>
                    {esFiado ? 'No está. Para fiar elige un cliente que ya exista.' : 'No está. La venta queda con ese nombre.'}
                </p>
            )}

            {creando && puedeCrear && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input
                        type={porTelefono ? 'text' : 'tel'} inputMode={porTelefono ? 'text' : 'numeric'} autoComplete="off" autoFocus data-enter="propio"
                        aria-label={porTelefono ? 'Nombre del cliente' : 'Teléfono (opcional)'}
                        placeholder={porTelefono ? 'Nombre del cliente' : 'Teléfono (opcional)'}
                        value={otroDato}
                        onChange={e => { setOtroDato(e.target.value); setExistente(null); setError(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }}
                        className="cj-campo"
                    />
                    {repetido ? (
                        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--toul-warning)' }}>
                                Ya existe {repetido.name}{repetido.phone ? ` · ${repetido.phone}` : ''}
                            </span>
                            <button type="button" onClick={() => elegir(repetido)} className="cj-btn cj-chip" data-on="1">Usar este</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => void crear()} disabled={!nombre || guardando} className="cj-btn cj-press-suave"
                                style={{
                                    flex: 1, height: 44, borderRadius: 13, fontSize: 14.5, fontWeight: 600,
                                    background: nombre ? 'var(--toul-text)' : 'var(--toul-surface)', color: nombre ? 'var(--toul-bg)' : 'var(--toul-text-dim)',
                                }}>
                                {guardando ? 'Creando…' : 'Crear y elegir'}
                            </button>
                            <button type="button" onClick={limpiar} className="cj-btn cj-chip" style={{ height: 44 }}>Cancelar</button>
                        </div>
                    )}
                    {error && <p role="alert" style={{ fontSize: 13, color: 'var(--toul-error)', margin: 0 }}>{error}</p>}
                </div>
            )}
        </div>
    )
}
