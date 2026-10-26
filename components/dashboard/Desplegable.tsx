'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as TeclaReact, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, ChevronLeft } from 'lucide-react'
import { Sheet } from '@/components/isla/Sheet'
import { ease } from '@/lib/motion'

/* ══════════════════════════════════════════════════════════════
   El menú del Inicio.

   Lo abren "Hoy ⌄" y "Más vendidos ⌄". En el celular es una hoja
   que sube desde abajo, cerca del pulgar; en el computador, un menú
   que se despliega justo debajo de lo que tocaste y crece desde ahí.
   Los dos marcan con un check lo que estás viendo.
   ══════════════════════════════════════════════════════════════ */

export type Variante = 'movil' | 'pc'
export type Periodo = 'today' | 'week' | 'month' | 'total' | 'custom'
export type Rango = { from: string; to: string } | null

export interface Opcion<T extends string> {
    valor: T
    etiqueta: string
}

const CSS = `
.dz-raiz { position: relative; display: inline-block; max-width: 100%; }

.dz-periodo { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 0; border: none; background: none;
    font: inherit; color: var(--toul-text); cursor: pointer; text-align: left;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation;
    transition: transform 160ms var(--toul-ease-emil); }
.dz-periodo:active { transform: scale(0.97); }
.dz-periodo-texto { font-weight: 700; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dz-periodo[data-variante="movil"] .dz-periodo-texto { font-size: 32px; letter-spacing: -1px; }
.dz-periodo[data-variante="pc"] .dz-periodo-texto { font-size: 28px; letter-spacing: -0.9px; }
.dz-flecha { flex-shrink: 0; color: var(--toul-text-subtle); transition: transform 200ms var(--toul-ease-emil); }
[aria-expanded="true"] > .dz-flecha { transform: rotate(180deg); }

/* En PC el periodo va en una píldora pequeña al lado de "Vendiste" */
.dz-periodo-pildora { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 8px 0 11px; border: none;
    border-radius: 999px; background: var(--toul-surface-2); color: var(--toul-text);
    font: inherit; font-size: 12px; font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; cursor: pointer;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation;
    transition: background-color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
.dz-periodo-pildora:active { transform: scale(0.96); }
.dz-periodo-pildora .dz-flecha { color: var(--toul-text-muted); }

.dz-pildora { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px 0 14px; border: none;
    border-radius: 999px; background: var(--toul-surface-2); color: var(--toul-text);
    font: inherit; font-size: 13px; font-weight: 500; letter-spacing: -0.01em; white-space: nowrap; cursor: pointer;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation;
    transition: background-color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
.dz-pildora:active { transform: scale(0.97); }
.dz-pildora .dz-flecha { color: var(--toul-text-muted); }

.dz-menu { position: absolute; z-index: 30; top: calc(100% + 8px); left: 0; min-width: 232px; padding: 6px;
    border-radius: 16px; background: var(--toul-surface-overlay); border: 1px solid var(--toul-border-2);
    box-shadow: 0 18px 48px color-mix(in srgb, var(--toul-bg) 72%, transparent);
    transform-origin: top left; }

.dz-opcion { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
    min-height: 40px; padding: 0 12px; border: none; border-radius: 10px; background: none;
    font: inherit; font-size: 14px; color: var(--toul-text-muted); text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: background-color 120ms var(--toul-ease-emil), color 120ms var(--toul-ease-emil); }
.dz-opcion[aria-selected="true"] { color: var(--toul-text); font-weight: 600; }
.dz-opcion:focus-visible { outline: none; background: var(--toul-surface-2); color: var(--toul-text); }
.dz-check { flex-shrink: 0; color: var(--toul-text); }

/* En la hoja del celular: renglones altos, para el pulgar */
.dz-lista[data-variante="movil"] .dz-opcion { min-height: 56px; padding: 0 2px; border-radius: 0; font-size: 16px; }
.dz-lista[data-variante="movil"] .dz-opcion + .dz-opcion { border-top: 1px solid var(--toul-divider); }
.dz-lista[data-variante="movil"] .dz-opcion:active { background: var(--toul-surface-3); }

.dz-fechas { display: flex; flex-direction: column; gap: 12px; }
.dz-fechas[data-variante="pc"] { width: 264px; padding: 6px; }
.dz-volver { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; padding: 4px 0; border: none;
    background: none; font: inherit; font-size: 13px; font-weight: 500; color: var(--toul-text-subtle); cursor: pointer;
    transition: color 120ms var(--toul-ease-emil); }
.dz-campo { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--toul-text-subtle); }
.dz-campo input { color-scheme: dark; }

@media (hover: hover) and (pointer: fine) {
    .dz-pildora:hover, .dz-periodo-pildora:hover { background: var(--toul-border-2); }
    .dz-periodo:hover .dz-flecha { color: var(--toul-text-muted); }
    .dz-opcion:hover { background: var(--toul-surface); color: var(--toul-text); }
    .dz-volver:hover { color: var(--toul-text); }
}
@media (prefers-reduced-motion: reduce) {
    .dz-periodo:active, .dz-pildora:active, .dz-periodo-pildora:active { transform: none; }
}
`

/** El botón y lo que abre. `contenido` recibe con qué cerrarlo. */
export function Desplegable({ variante, titulo, boton, claseBoton, alAbrir, contenido }: {
    variante: Variante
    /** Título de la hoja en el celular, y nombre del menú para los lectores de pantalla */
    titulo: string
    boton: ReactNode
    claseBoton: string
    alAbrir?: () => void
    contenido: (cerrar: () => void) => ReactNode
}) {
    const [abierto, setAbierto] = useState(false)
    const raiz = useRef<HTMLDivElement>(null)
    const idBoton = useId()

    const cerrar = useCallback(() => setAbierto(false), [])
    // Al cerrar con el teclado, el foco vuelve al botón que abrió el menú
    const cerrarYVolver = useCallback(() => {
        setAbierto(false)
        document.getElementById(idBoton)?.focus()
    }, [idBoton])

    // En el computador: se cierra tocando afuera o con Escape, y el foco
    // arranca en la opción que estás viendo
    useEffect(() => {
        if (!abierto || variante !== 'pc') return
        const afuera = (e: PointerEvent) => {
            if (!raiz.current?.contains(e.target as Node)) setAbierto(false)
        }
        const tecla = (e: KeyboardEvent) => {
            if (e.key === 'Escape') cerrarYVolver()
        }
        const foco = requestAnimationFrame(() => {
            const menu = raiz.current?.querySelector('.dz-menu')
            const elegida = menu?.querySelector<HTMLElement>('[aria-selected="true"]') ?? menu?.querySelector<HTMLElement>('button')
            elegida?.focus()
        })
        document.addEventListener('pointerdown', afuera)
        document.addEventListener('keydown', tecla)
        return () => {
            cancelAnimationFrame(foco)
            document.removeEventListener('pointerdown', afuera)
            document.removeEventListener('keydown', tecla)
        }
    }, [abierto, variante, cerrarYVolver])

    return (
        <div ref={raiz} className="dz-raiz">
            <style>{CSS}</style>
            <button id={idBoton} type="button" className={claseBoton} data-variante={variante}
                aria-haspopup="dialog" aria-expanded={abierto}
                onClick={() => {
                    if (!abierto) alAbrir?.()
                    setAbierto(v => !v)
                }}>
                {boton}
            </button>

            {variante === 'movil' ? (
                <Sheet open={abierto} onClose={cerrar} title={titulo}>
                    {contenido(cerrar)}
                </Sheet>
            ) : (
                <AnimatePresence>
                    {abierto && (
                        <motion.div className="dz-menu" role="dialog" aria-label={titulo}
                            initial={{ opacity: 0, transform: 'translateY(-4px) scale(0.97)' }}
                            animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
                            exit={{ opacity: 0, transform: 'translateY(-4px) scale(0.97)', transition: { duration: 0.12, ease: ease.out } }}
                            transition={{ duration: 0.18, ease: ease.out }}>
                            {contenido(cerrarYVolver)}
                        </motion.div>
                    )}
                </AnimatePresence>
            )}
        </div>
    )
}

/** Las opciones, con un check en la que estás viendo. Flechas arriba/abajo para moverse. */
export function Opciones<T extends string>({ variante, opciones, activo, onElegir }: {
    variante: Variante
    opciones: Opcion<T>[]
    activo: T
    onElegir: (valor: T) => void
}) {
    function mover(e: TeclaReact<HTMLDivElement>) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const botones = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.dz-opcion')]
        const actual = botones.indexOf(document.activeElement as HTMLButtonElement)
        const paso = e.key === 'ArrowDown' ? 1 : -1
        botones[(actual + paso + botones.length) % botones.length]?.focus()
    }

    return (
        <div role="listbox" className="dz-lista" data-variante={variante} onKeyDown={mover}>
            {opciones.map(opcion => {
                const activa = opcion.valor === activo
                return (
                    <button key={opcion.valor} type="button" role="option" aria-selected={activa}
                        className="dz-opcion" onClick={() => onElegir(opcion.valor)}>
                        <span>{opcion.etiqueta}</span>
                        {activa && <Check size={17} strokeWidth={2.4} className="dz-check" />}
                    </button>
                )
            })}
        </div>
    )
}

/* ── El periodo: "Hoy ⌄" ─────────────────────────────────────── */

const PERIODOS: Opcion<Periodo>[] = [
    { valor: 'today', etiqueta: 'Hoy' },
    { valor: 'week', etiqueta: 'Esta semana' },
    { valor: 'month', etiqueta: 'Este mes' },
    { valor: 'custom', etiqueta: 'Elegir fechas' },
]

const mes = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')

/** "15 – 20 oct", "28 sep – 3 oct" o "26 oct" si es un solo día */
export function textoRango(desde: Date, hasta: Date): string {
    if (desde.toDateString() === hasta.toDateString()) return `${desde.getDate()} ${mes(desde)}`
    return desde.getMonth() === hasta.getMonth() && desde.getFullYear() === hasta.getFullYear()
        ? `${desde.getDate()} – ${hasta.getDate()} ${mes(hasta)}`
        : `${desde.getDate()} ${mes(desde)} – ${hasta.getDate()} ${mes(hasta)}`
}

/** Lo que dice el título: "Hoy", "Esta semana"… o las fechas elegidas */
export function tituloPeriodo(period: Periodo, rango: Rango): string {
    if (period === 'today') return 'Hoy'
    if (period === 'week') return 'Esta semana'
    if (period === 'month') return 'Este mes'
    if (period === 'total') return 'Todo'
    if (!rango) return 'Estas fechas'
    return textoRango(new Date(rango.from), new Date(rango.to))
}

/** 2026-10-26, en la hora del equipo (toISOString daría la fecha de Londres) */
const diaLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function SelectorPeriodo({ variante, forma = 'titulo', period, setPeriod, rango, setRango }: {
    variante: Variante
    /** El título grande del celular, o la píldora pequeña del computador */
    forma?: 'titulo' | 'pildora'
    period: Periodo
    setPeriod: (p: Periodo) => void
    rango: Rango
    setRango: (r: Rango) => void
}) {
    const [conFechas, setConFechas] = useState(false)
    const [desde, setDesde] = useState('')
    const [hasta, setHasta] = useState('')
    const hoy = diaLocal(new Date())

    // Cada vez que se abre, arranca en la lista
    const alAbrir = useCallback(() => setConFechas(false), [])

    function elegirFechas() {
        setDesde(rango ? diaLocal(new Date(rango.from)) : hoy)
        setHasta(rango ? diaLocal(new Date(rango.to)) : hoy)
        setConFechas(true)
    }

    function aplicar(cerrar: () => void) {
        if (!desde || !hasta) return
        // Si las pusieron al revés, se entiende igual
        const [inicio, fin] = desde <= hasta ? [desde, hasta] : [hasta, desde]
        setRango({
            from: new Date(`${inicio}T00:00:00`).toISOString(),
            to: new Date(`${fin}T23:59:59`).toISOString(),
        })
        setPeriod('custom')
        cerrar()
    }

    return (
        <Desplegable variante={variante} titulo={conFechas ? 'Elegir fechas' : 'Periodo'} alAbrir={alAbrir}
            claseBoton={forma === 'pildora' ? 'dz-periodo-pildora' : 'dz-periodo'}
            boton={forma === 'pildora' ? <>
                {tituloPeriodo(period, rango)}
                <ChevronDown size={13} strokeWidth={2.4} className="dz-flecha" />
            </> : <>
                <span className="dz-periodo-texto">{tituloPeriodo(period, rango)}</span>
                <ChevronDown size={variante === 'movil' ? 24 : 22} strokeWidth={2.2} className="dz-flecha" />
            </>}
            contenido={cerrar => conFechas ? (
                <div className="dz-fechas" data-variante={variante}>
                    <button type="button" className="dz-volver" onClick={() => setConFechas(false)}>
                        <ChevronLeft size={15} /> Periodos
                    </button>
                    <label className="dz-campo">
                        Desde
                        <input type="date" className="toul-input" value={desde} max={hoy} onChange={e => setDesde(e.target.value)} />
                    </label>
                    <label className="dz-campo">
                        Hasta
                        <input type="date" className="toul-input" value={hasta} max={hoy} onChange={e => setHasta(e.target.value)} />
                    </label>
                    <button type="button" className="toul-btn-primary" disabled={!desde || !hasta} onClick={() => aplicar(cerrar)}>
                        Ver estas fechas
                    </button>
                </div>
            ) : (
                <Opciones variante={variante} opciones={PERIODOS} activo={period}
                    onElegir={valor => {
                        if (valor === 'custom') { elegirFechas(); return }
                        setPeriod(valor)
                        cerrar()
                    }} />
            )} />
    )
}
