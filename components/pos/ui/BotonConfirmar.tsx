'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import s from './pos.module.css'
import { DURACION, useQuieto } from './movimiento'

/** Lo que el botón sabe de la venta (lo decide quien cobra) */
export type EstadoConfirmar = 'listo' | 'bloqueado' | 'enviando' | 'hecho'

type Fase = 'idle' | 'ld' | 'bs'

// Las 8 chispas: ángulo y color (los verdes de TOUL y el blanco)
const CHISPAS = [
    ['0deg', 'var(--toul-accent-claro)'], ['45deg', 'var(--toul-text)'], ['90deg', 'var(--toul-accent)'], ['135deg', 'var(--toul-accent-menta)'],
    ['180deg', 'var(--toul-accent-claro)'], ['225deg', 'var(--toul-text)'], ['270deg', 'var(--toul-accent)'], ['315deg', 'var(--toul-accent-menta)'],
] as const

/**
 * "Confirmar venta" / "Registrar crédito".
 * - Bloqueado: gris, y dice por qué ("Selecciona el método de pago").
 * - Al tocarlo: el texto se va, el botón se encoge a un círculo y salen
 *   tres puntos. Se ven al menos 750 ms, o lo que tarde de verdad.
 * - Cuando quien cobra pasa a "hecho": estalla con 8 chispas y avisa
 *   con onTerminado (ahí entra "Venta registrada").
 * - Si falla y vuelve a "listo", el botón crece otra vez.
 * - Un segundo toque, o Enter con el botón enfocado, no repite la venta.
 * El registro, el tiempo de espera y la cola sin internet siguen en useCobro.
 */
export function BotonConfirmar({ estado, texto, razon, onConfirmar, onTerminado }: {
    estado: EstadoConfirmar
    texto: string
    /** Lo que dice cuando está bloqueado */
    razon?: string
    onConfirmar: () => void
    onTerminado: () => void
}) {
    const quieto = useQuieto()
    const boton = useRef<HTMLButtonElement>(null)
    const inicio = useRef(0)
    const terminado = useRef(onTerminado)
    useEffect(() => { terminado.current = onTerminado }, [onTerminado])

    const [fase, setFase] = useState<Fase>('idle')
    const [previo, setPrevio] = useState(estado)
    if (previo !== estado) {
        setPrevio(estado)
        // Falló el registro: vuelve a ser botón
        if (previo === 'enviando' && (estado === 'listo' || estado === 'bloqueado')) setFase('idle')
    }
    // Si quien cobra empieza a enviar sin el toque (por ejemplo con Enter), también se encoge
    if (estado === 'enviando' && fase === 'idle') setFase('ld')

    // Cuánto se encoge el fondo: del ancho del botón a los 58 px del círculo
    useLayoutEffect(() => {
        if (fase !== 'ld') return
        inicio.current = performance.now()
        const ancho = boton.current?.getBoundingClientRect().width || 58
        boton.current?.style.setProperty('--k', String(Math.min(1, 58 / ancho)))
    }, [fase])

    // Registrada: espera a que los puntos se hayan visto y estalla
    useEffect(() => {
        if (estado !== 'hecho' || fase !== 'ld') return
        const espera = quieto ? 0 : Math.max(0, DURACION.confirmarPuntos - (performance.now() - inicio.current))
        const t = setTimeout(() => setFase('bs'), espera)
        return () => clearTimeout(t)
    }, [estado, fase, quieto])

    // Estalló: al terminar el estallido entra "Venta registrada".
    // Va aparte: si estuviera en el efecto de arriba, cambiar a 'bs' lo cancelaría
    useEffect(() => {
        if (fase !== 'bs') return
        const t = setTimeout(() => { setFase('idle'); terminado.current() }, quieto ? 0 : DURACION.confirmarEstallido)
        return () => clearTimeout(t)
    }, [fase, quieto])

    const bloqueado = estado === 'bloqueado' && fase === 'idle'
    const ocupado = fase !== 'idle'

    return (
        <button ref={boton} type="button" className={s.confirmar} data-fase={fase}
            disabled={bloqueado} aria-disabled={ocupado || undefined} aria-busy={ocupado || undefined}
            onClick={() => {
                if (ocupado || estado !== 'listo') return
                setFase('ld')
                onConfirmar()
            }}>
            <span className={s.confirmarFondo} aria-hidden="true" />
            <span className={s.confirmarCirculo} aria-hidden="true" />
            <span className={s.confirmarTexto}>{bloqueado ? (razon ?? texto) : ocupado ? 'Registrando…' : texto}</span>
            <span className={s.puntos} aria-hidden="true"><i /><i /><i /></span>
            {CHISPAS.map(([a, c], i) => (
                <span key={i} className={s.chispa} aria-hidden="true" style={{ ['--a' as string]: a, ['--c' as string]: c }} />
            ))}
        </button>
    )
}
