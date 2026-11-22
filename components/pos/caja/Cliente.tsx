'use client'

import { useMemo, useState } from 'react'
import type { Customer } from '@/lib/types'
import type { POSDataState } from '@/lib/pos/usePOSData'
import type { POSPaymentState } from '@/lib/pos/usePOSPayment'
import { buscarClientes, clienteConTelefono, normalizar, pareceTelefono, soloDigitos } from '@/lib/pos/clientes'
import { BotonFantasma, BotonPrincipal, BotonSecundario, CampoBusqueda, CampoTexto, Hoja, IcoMas, Nota, avisar } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import { formatCOP } from '@/lib/utils'

/** Cuántos se pintan sin buscar (los demás aparecen al escribir) */
const SIN_BUSCAR = 120

const iniciales = (nombre: string) => {
    const p = nombre.trim().split(/\s+/).filter(Boolean)
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '·'
}
const deuda = (c: Customer) => Math.max(0, Math.round(Number(c.total_debt) || 0))

/** El WhatsApp sirve si tiene 10 dígitos (con o sin el +57) */
function whatsappValido(texto: string) {
    let d = soloDigitos(texto)
    if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
    return d.length === 10
}

/**
 * Hoja de Cliente (SPEC §6), 86 % de alto.
 * Buscar por nombre o teléfono; tocar uno lo elige y cierra.
 * "Crear cliente" abre el formulario en la misma hoja. Nombres y
 * teléfonos no se repiten: si ya existe, "Usar este". El servidor lo
 * vuelve a revisar al crear.
 * El cliente de la venta es solo el que se elige aquí: un nombre escrito
 * sin elegir nunca crea ni busca clientes al registrar la venta.
 */
export function HojaCliente({ abierta, onCerrar, data, payment, puedeCrear }: {
    abierta: boolean
    onCerrar: () => void
    data: POSDataState
    payment: POSPaymentState
    /** El vendedor sin permiso solo puede elegir clientes que ya existen */
    puedeCrear: boolean
}) {
    const [q, setQ] = useState('')
    const [creando, setCreando] = useState(false)
    const [nombre, setNombre] = useState('')
    const [telefono, setTelefono] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // El que ya existía, según el servidor
    const [existente, setExistente] = useState<Customer | null>(null)

    const elegido = payment.selectedCustomer
    // Mientras llegan los clientes no se ofrece crear: podría estar repetido
    const cargando = data.customersLoading
    const porTelefono = pareceTelefono(q)

    const lista = useMemo(
        () => q.trim() ? buscarClientes(data.customers, q, 200) : data.customers.slice(0, SIN_BUSCAR),
        [data.customers, q]
    )

    // Mismo nombre sin importar mayúsculas, espacios ni tildes: es la misma persona
    const conNombre = (texto: string) => {
        const n = normalizar(texto)
        return n ? data.customers.find(c => normalizar(c.name) === n) : undefined
    }
    const nombreBuscado = !porTelefono ? conNombre(q) : undefined
    const telefonoBuscado = porTelefono ? clienteConTelefono(data.customers, q) : undefined
    const puedeOfrecer = puedeCrear && !!q.trim() && !cargando && !nombreBuscado && !telefonoBuscado

    // En el formulario: repetido por nombre o por teléfono
    const repetidoNombre = creando ? conNombre(nombre) : undefined
    const repetidoTelefono = creando && soloDigitos(telefono).length >= 7 ? clienteConTelefono(data.customers, telefono) : undefined
    const repetido = existente ?? repetidoNombre ?? repetidoTelefono

    const limpiar = () => {
        setQ(''); setCreando(false); setNombre(''); setTelefono(''); setError(null); setExistente(null)
    }
    const cerrar = () => { onCerrar(); setTimeout(limpiar, 500) }
    const elegir = (c: Customer) => { payment.setSelectedCustomer(c); cerrar() }

    const empezarCrear = () => {
        if (porTelefono) { setNombre(''); setTelefono(q.trim()) }
        else { setNombre(q.trim().replace(/\s+/g, ' ')); setTelefono('') }
        setError(null); setExistente(null); setCreando(true)
    }

    const crear = async () => {
        const n = nombre.trim().replace(/\s+/g, ' ')
        if (!n || guardando || repetido || cargando) return
        if (pareceTelefono(n)) { setError('El nombre no puede ser un número de teléfono'); return }
        if (telefono.trim() && !whatsappValido(telefono)) { setError('El número de WhatsApp debe tener 10 dígitos'); return }
        setGuardando(true)
        setError(null)
        try {
            const res = await fetch('/api/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: n, phone: telefono.trim() || null }),
            })
            const body = await res.json()
            if (res.status === 409 && body.existing) { setExistente(body.existing); return }
            if (!res.ok) { setError(body.error || 'No se pudo crear el cliente'); return }
            avisar('Cliente creado')
            data.refreshCustomers()
            elegir(body.customer)
        } catch {
            setError('Sin conexión. Intenta de nuevo.')
        } finally {
            setGuardando(false)
        }
    }

    const avisoRepetido = (c: Customer, porNumero: boolean) => porNumero
        ? `Ya existe ${c.name} con ese número.`
        : `Ya existe “${c.name}”. Para crear otro, agrega su apellido.`

    return (
        <Hoja abierta={abierta} onCerrar={cerrar} titulo="Cliente" alta llena>
            <CampoBusqueda etiqueta="Nombre o teléfono" valor={q} data-enter="propio"
                onCambiar={v => { setQ(v); setCreando(false); setError(null); setExistente(null) }}
                onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (lista[0] && q.trim()) elegir(lista[0])
                    else if (puedeOfrecer) empezarCrear()
                }} />

            {creando ? (
                <div className={s.crearCliente}>
                    <CampoTexto etiqueta="Nombre" placeholder="Nombre y apellido" valor={nombre} autoFocus={!porTelefono}
                        autoComplete="off" autoCapitalize="words" data-enter="propio"
                        onCambiar={v => { setNombre(v); setError(null); setExistente(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }} />
                    <CampoTexto etiqueta="WhatsApp" placeholder="Opcional" valor={telefono} autoFocus={porTelefono}
                        type="tel" inputMode="tel" autoComplete="off" data-enter="propio"
                        onCambiar={v => { setTelefono(v); setError(null); setExistente(null) }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }} />
                    {repetido && (
                        <Nota accion={{ texto: 'Usar este', onClick: () => elegir(repetido) }}>
                            {avisoRepetido(repetido, conNombre(nombre)?.id !== repetido.id)}
                        </Nota>
                    )}
                    {error && <div role="alert" className={s.errorTexto}>{error}</div>}
                    <div className={s.hojaPar} style={{ marginTop: 4 }}>
                        <BotonSecundario onClick={() => { setCreando(false); setError(null); setExistente(null) }}>Cancelar</BotonSecundario>
                        <BotonPrincipal onClick={() => void crear()} disabled={!nombre.trim() || guardando || !!repetido}>
                            {guardando ? 'Creando…' : 'Crear cliente'}
                        </BotonPrincipal>
                    </div>
                </div>
            ) : (<>
                {nombreBuscado && (
                    <Nota accion={{ texto: 'Usar este', onClick: () => elegir(nombreBuscado) }}>
                        {avisoRepetido(nombreBuscado, false)}
                    </Nota>
                )}
                {elegido && !q.trim() && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                        <BotonFantasma onClick={() => { payment.setSelectedCustomer(null); cerrar() }}>Quitar cliente</BotonFantasma>
                    </div>
                )}
                <div className={s.clientes} role="listbox" aria-label="Clientes">
                    {puedeOfrecer && (
                        <button type="button" className={`${s.cliente} ${s.clienteCrear}`} onClick={empezarCrear}>
                            <span className={`${s.avatar} ${s.avatarVerde}`}><IcoMas /></span>
                            <span className={s.clienteNombre}>
                                {porTelefono ? `Crear cliente con el número ${q.trim()}` : `Crear cliente “${q.trim()}”`}
                            </span>
                        </button>
                    )}
                    {lista.map((c, i) => {
                        const debe = deuda(c)
                        const on = elegido?.id === c.id
                        return (
                            <button key={c.id} type="button" role="option" aria-selected={on} className={s.cliente}
                                data-on={on ? '1' : undefined} style={{ ['--k' as string]: Math.min(i + 1, 12) }}
                                onClick={() => elegir(c)}>
                                <span className={s.avatar} aria-hidden="true">{iniciales(c.name)}</span>
                                <span className={s.clienteNombre}>
                                    {c.name}
                                    {c.phone && <span className={s.clienteSub}>{c.phone}</span>}
                                </span>
                                {debe > 0 && <span className={s.clienteDeuda}>{formatCOP(debe)}</span>}
                            </button>
                        )
                    })}
                    {lista.length === 0 && !puedeOfrecer && (
                        <div className={s.clientesVacio}>
                            {cargando ? 'Cargando clientes…' : q.trim() ? 'Sin resultados' : 'Todavía no hay clientes'}
                        </div>
                    )}
                </div>
            </>)}
        </Hoja>
    )
}
