'use client'

import { useState } from 'react'
import type { Entrada } from '@/lib/pos/useListaProductos'
import { BotonPrincipal, FilaPresentacion, Hoja } from '@/components/pos/ui'
import type { Cambiar } from './Productos'

/**
 * PC: elegir presentación en una ventana al centro (en el celular se abren
 * en su renglón). Una fila por presentación con precio, stock y [− N +].
 */
export function Presentaciones({ entrada, onCambiar, onCerrar }: {
    entrada: Entrada | null
    onCambiar: Cambiar
    onCerrar: () => void
}) {
    // Mientras se cierra sigue mostrando la última (si no, se vaciaría de golpe)
    const [ultima, setUltima] = useState<Entrada | null>(entrada)
    if (entrada && entrada !== ultima) setUltima(entrada)
    const e = entrada ?? ultima

    return (
        <Hoja abierta={!!entrada} onCerrar={onCerrar} titulo={e?.nombre ?? ''}
            pie={<div style={{ marginTop: 20 }}><BotonPrincipal ancho onClick={onCerrar}>Listo</BotonPrincipal></div>}>
            {e?.presentaciones.map((v, i) => (
                <FilaPresentacion key={v.id} indice={i} nombre={v.nombre} precio={v.precio} stock={v.stock}
                    minimo={v.minimo ?? -1} cantidad={v.enCarrito}
                    onCambiar={n => onCambiar(v.key, n, `${e.nombre} · ${v.nombre}`)} />
            ))}
        </Hoja>
    )
}
