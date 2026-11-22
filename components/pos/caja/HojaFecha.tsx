'use client'

import { useState } from 'react'
import { BotonPrincipal, Chip, Chips, Hoja, IcoDerecha, IcoIzquierda, cx, useRebote } from '@/components/pos/ui'
import s from '@/components/pos/ui/pos.module.css'
import { diasHasta, fechaEnDias, fechaPagoValida, leerFecha } from '@/lib/pos/pagos'

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const PLAZOS = [8, 15, 30]

const dosCifras = (n: number) => String(n).padStart(2, '0')
const aTexto = (d: Date) => `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`

/** "jue 3 dic" (la fila del cobro) o "Sin fecha" */
export function fechaCorta(texto: string): string {
    const d = leerFecha(texto)
    return d ? `${DIAS_CORTOS[d.getDay()]} ${d.getDate()} ${MESES_CORTOS[d.getMonth()]}` : 'Sin fecha'
}

/** "Viernes 27 de noviembre" */
function fechaLarga(d: Date) {
    return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`
}

/**
 * Fecha de pago de la venta a crédito (SPEC §6).
 * Solo deja elegir de mañana en adelante, o "Sin fecha": hoy y los días
 * pasados se ven apagados y no se pueden tocar.
 */
export function HojaFecha({ abierta, onCerrar, fecha, onCambiar }: {
    abierta: boolean
    onCerrar: () => void
    /** "AAAA-MM-DD" o vacía (sin fecha) */
    fecha: string
    onCambiar: (fecha: string) => void
}) {
    const hoy = new Date()
    const manana = fechaEnDias(1, hoy)
    const elegida = fechaPagoValida(fecha, hoy) ? leerFecha(fecha) : null
    const dias = fecha ? diasHasta(fecha, hoy) : null

    // El mes que se ve: el de la fecha elegida, o el de mañana
    const base = elegida ?? leerFecha(manana)!
    const [mes, setMes] = useState({ a: base.getFullYear(), m: base.getMonth(), dx: 0 })
    const [previa, setPrevia] = useState(fecha)
    // Un chip mueve el calendario a esa fecha (ajuste en el render, sin efecto)
    if (previa !== fecha) {
        setPrevia(fecha)
        if (elegida && (elegida.getFullYear() !== mes.a || elegida.getMonth() !== mes.m)) {
            const adelante = elegida.getFullYear() * 12 + elegida.getMonth() > mes.a * 12 + mes.m
            setMes({ a: elegida.getFullYear(), m: elegida.getMonth(), dx: adelante ? 24 : -24 })
        }
    }
    const reboteMes = useRebote(`${mes.a}-${mes.m}`)
    const reboteFecha = useRebote(fecha)

    const primerMes = leerFecha(manana)!
    const hayAntes = mes.a * 12 + mes.m > primerMes.getFullYear() * 12 + primerMes.getMonth()
    const moverMes = (paso: number) => setMes(x => {
        const d = new Date(x.a, x.m + paso, 1)
        return { a: d.getFullYear(), m: d.getMonth(), dx: paso > 0 ? 24 : -24 }
    })

    // La rejilla empieza en lunes
    const primero = new Date(mes.a, mes.m, 1)
    const vacios = (primero.getDay() + 6) % 7
    const total = new Date(mes.a, mes.m + 1, 0).getDate()
    const textoHoy = aTexto(hoy)

    const plazoElegido = fecha === '' ? 'sin' : PLAZOS.find(n => fechaEnDias(n, hoy) === fecha) ?? null

    return (
        <Hoja abierta={abierta} onCerrar={onCerrar} titulo="Fecha de pago"
            pie={<BotonPrincipal ancho onClick={onCerrar} style={{ marginTop: 18 }}>Listo</BotonPrincipal>}>
            <span className={s.fechaGrande} data-tono={elegida ? undefined : 'apagado'}
                data-rebote={reboteFecha ?? undefined}>
                {elegida ? fechaLarga(elegida) : 'Sin fecha límite'}
            </span>
            <div className={s.hojaPista} style={{ marginTop: 2 }}>
                {elegida && dias != null ? (dias === 1 ? 'Mañana' : `En ${dias} días`) : ' '}
            </div>

            <Chips centrado style={{ marginTop: 16 }}>
                {PLAZOS.map(n => (
                    <Chip key={n} activo={plazoElegido === n} onClick={() => onCambiar(fechaEnDias(n, hoy))}>{n} días</Chip>
                ))}
                <Chip activo={plazoElegido === 'sin'} onClick={() => onCambiar('')}>Sin fecha</Chip>
            </Chips>

            <div className={s.cal}>
                <div className={s.calCabeza}>
                    <button type="button" className={s.calNav} onClick={() => moverMes(-1)} disabled={!hayAntes} aria-label="Mes anterior">
                        <IcoIzquierda size={16} grosor={2.4} />
                    </button>
                    <span>{MESES[mes.m][0].toUpperCase() + MESES[mes.m].slice(1)} {mes.a}</span>
                    <button type="button" className={s.calNav} onClick={() => moverMes(1)} aria-label="Mes siguiente">
                        <IcoDerecha size={16} grosor={2.4} />
                    </button>
                </div>
                <div className={s.calRejilla} aria-hidden="true">
                    {SEMANA.map((l, i) => <span key={i} className={s.calSemana}>{l}</span>)}
                </div>
                <div key={`${mes.a}-${mes.m}`} className={cx(s.calRejilla, s.calMes)} role="grid"
                    aria-label={`${MESES[mes.m]} de ${mes.a}`}
                    data-rebote={reboteMes ?? undefined} style={{ ['--dx' as string]: `${mes.dx}px` }}>
                    {Array.from({ length: vacios }, (_, i) => <span key={`v${i}`} />)}
                    {Array.from({ length: total }, (_, i) => {
                        const d = new Date(mes.a, mes.m, i + 1)
                        const texto = aTexto(d)
                        // Solo de mañana en adelante
                        const sirve = texto >= manana
                        return (
                            <button key={texto} type="button" className={s.calDia} disabled={!sirve}
                                data-hoy={texto === textoHoy ? '1' : undefined}
                                data-on={texto === fecha ? '1' : undefined}
                                aria-pressed={texto === fecha}
                                aria-label={fechaLarga(d)}
                                onClick={() => sirve && onCambiar(texto)}>
                                {i + 1}
                            </button>
                        )
                    })}
                </div>
            </div>
        </Hoja>
    )
}
