'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import toast from 'react-hot-toast'
import { ArrowDownLeft, ArrowUpRight, Info, Receipt, X, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { onlyDigits, withThousands } from '@/lib/format/text'
import { EXPENSE_CATEGORIES } from '@/lib/types'
import { explainError } from '@/lib/errors'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { EASE_OUT_EMIL } from '@/components/ui'
import { CuentaChips, cuentaParaGuardar, recordarCuenta } from './CuentaChips'

/* ══════════════════════════════════════════════════════════════
   La hoja para anotar plata que no es venta: un Gasto, "Metí plata"
   o "Saqué plata". También corrige uno que ya existe.

   La usan Movimientos, Gastos y la caja (el vendedor con permiso,
   solo gastos y sin "Plata mía"). Lo que se puede y lo que no lo
   decide el servidor; aquí solo se pregunta bien.
   ══════════════════════════════════════════════════════════════ */

export type TipoMovimiento = 'gasto' | 'meti' | 'saque'

/** Algo que ya existe y se va a corregir */
export interface MovimientoAEditar {
    tipo: TipoMovimiento
    /** Gasto: el id del gasto. Metí y Saqué plata: el id del movimiento */
    id: string
    monto: number
    nota: string | null
    categoria?: string
    /** El número de la cuenta, PLATA_MIA, o nada si es de antes ("Sin cuenta") */
    cuenta: string | null
    /** Quedó en un turno que ya se cerró: solo la nota o la categoría */
    turnoCerrado: boolean
}

export interface MovimientoGuardado {
    tipo: TipoMovimiento
    editado: boolean
    /** Metí y Saqué plata nuevos */
    paymentId?: string
    /** Gasto nuevo */
    expenseId?: string
}

export const TIPOS_MOVIMIENTO: Record<TipoMovimiento, { titulo: string; Icon: LucideIcon; verde: boolean }> = {
    gasto: { titulo: 'Gasto', Icon: Receipt, verde: false },
    meti: { titulo: 'Metí plata', Icon: ArrowDownLeft, verde: true },
    saque: { titulo: 'Saqué plata', Icon: ArrowUpRight, verde: false },
}

const PREGUNTA_CUENTA: Record<TipoMovimiento, string> = {
    gasto: '¿Con qué pagaste?',
    meti: '¿A dónde la metiste?',
    saque: '¿De dónde la sacaste?',
}

const EJEMPLO_NOTA: Record<TipoMovimiento, string> = {
    gasto: 'Ej: domicilio a Malambo',
    meti: 'Ej: inversión para mercancía',
    saque: 'Ej: mi sueldo de la semana',
}

const QUE_HACE: Record<TipoMovimiento, string> = {
    gasto: 'Resta de lo que ganaste. Lo verás en Reportes, en "En qué gastaste".',
    meti: 'No cambia lo que ganaste. Lo verás en Reportes, en "Tú y tu negocio".',
    saque: 'No cambia lo que ganaste. Es plata que tomas para ti, y la verás en Reportes, en "Tú y tu negocio".',
}

const TURNO_CERRADO = 'Esto quedó en un turno que ya se cerró: solo puedes cambiar la nota o la categoría. Para corregirlo, anota un movimiento nuevo'

const CSS = `
.rm-capa { position: fixed; inset: 0; z-index: 120; display: flex; justify-content: center; align-items: flex-end; }
@media (min-width: 768px) { .rm-capa { align-items: center; padding: 24px; } }
.rm-fondo { position: absolute; inset: 0; background: color-mix(in srgb, var(--toul-bg) 55%, transparent);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.rm-hoja { position: relative; width: 100%; max-width: 460px; max-height: 92dvh; display: flex; flex-direction: column;
    background: var(--toul-surface-overlay); border-radius: 26px 26px 0 0;
    box-shadow: 0 -20px 60px color-mix(in srgb, var(--toul-bg) 60%, transparent); }
@media (min-width: 768px) { .rm-hoja { border-radius: 24px; border: 1px solid var(--toul-border); } }
.rm-cuerpo { overflow-y: auto; overscroll-behavior: contain; padding: 18px 18px 4px; }
.rm-pie { padding: 12px 18px calc(18px + env(safe-area-inset-bottom, 0px)); }
.rm-cabeza { display: flex; align-items: center; gap: 10px; }
.rm-icono { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); }
.rm-titulo { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: var(--toul-text); }
.rm-cerrar { margin-left: auto; width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; color: var(--toul-text-subtle);
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); touch-action: manipulation; }
.rm-rotulo { display: block; margin: 16px 0 8px; font-size: 12px; color: var(--toul-text-subtle); }
.rm-monto { width: 100%; box-sizing: border-box; padding: 0; border: none; outline: none; background: transparent;
    font: inherit; font-size: 40px; font-weight: 700; letter-spacing: -1.5px; color: var(--toul-text);
    font-variant-numeric: tabular-nums; }
.rm-monto::placeholder { color: var(--toul-text-faint); }
.rm-monto:disabled { color: var(--toul-text-muted); }
.rm-nota { width: 100%; box-sizing: border-box; padding: 10px 12px; border: none; border-radius: 11px; outline: none;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); color: var(--toul-text);
    font: inherit; font-size: 16px; }
.rm-nota::placeholder { color: var(--toul-text-dim); }
.rm-nota:focus-visible { box-shadow: 0 0 0 1px var(--toul-border-2); }
.rm-info { display: flex; gap: 8px; margin-top: 14px; font-size: 12px; line-height: 1.45; color: var(--toul-text-muted); }
.rm-info svg { flex-shrink: 0; margin-top: 1px; }
.rm-guardar { height: 50px; border-radius: 14px; font-size: 15px; font-weight: 700; box-shadow: none; }
.rm-guardar:disabled { opacity: 0.3; cursor: default; }
.rm-guardar:not(:disabled):active { transform: scale(0.98); }
@media (prefers-reduced-motion: reduce) { .rm-guardar:not(:disabled):active { transform: none; } }
`

const supabase = createClient()

/** La curva de los cajones de iOS (--toul-ease-drawer) */
const EASE_DRAWER: [number, number, number, number] = [0.32, 0.72, 0, 1]

export function RegistrarMovimiento({ abierto, tipo, editar = null, conPlataMia = false, onCerrar, onGuardado }: {
    abierto: boolean
    tipo: TipoMovimiento
    /** Para corregir uno que ya existe */
    editar?: MovimientoAEditar | null
    /** Solo el administrador paga un gasto con plata suya */
    conPlataMia?: boolean
    onCerrar: () => void
    onGuardado?: (r: MovimientoGuardado) => void
}) {
    const movil = useIsMobile(768)
    const reducir = useReducedMotion()
    const [guardando, setGuardando] = useState(false)
    const cerrar = useCallback(() => { if (!guardando) onCerrar() }, [guardando, onCerrar])

    // Mientras está abierta, la página de atrás no se mueve y Escape la cierra
    useEffect(() => {
        if (!abierto) return
        const antes = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
        window.addEventListener('keydown', tecla)
        return () => { document.body.style.overflow = antes; window.removeEventListener('keydown', tecla) }
    }, [abierto, cerrar])

    // En el celular sube desde abajo; en el computador aparece en el centro
    const hoja = reducir
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.2 } }
        : movil
            ? {
                initial: { transform: 'translateY(100%)' }, animate: { transform: 'translateY(0%)' },
                exit: { transform: 'translateY(100%)', transition: { duration: 0.28, ease: EASE_DRAWER } },
                transition: { duration: 0.4, ease: EASE_DRAWER },
            }
            : {
                initial: { opacity: 0, transform: 'translateY(16px) scale(0.98)' }, animate: { opacity: 1, transform: 'translateY(0px) scale(1)' },
                exit: { opacity: 0, transform: 'translateY(10px) scale(0.98)', transition: { duration: 0.16, ease: EASE_OUT_EMIL } },
                transition: { duration: 0.24, ease: EASE_OUT_EMIL },
            }

    return (
        <AnimatePresence>
            {abierto && (
                <div className="rm-capa">
                    <style>{CSS}</style>
                    <motion.div className="rm-fondo" onClick={cerrar}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE_OUT_EMIL } }}
                        transition={{ duration: 0.25, ease: EASE_OUT_EMIL }} />
                    <motion.div className="rm-hoja" role="dialog" aria-modal="true" aria-label={TIPOS_MOVIMIENTO[tipo].titulo} {...hoja}>
                        <Formulario tipo={editar?.tipo ?? tipo} editar={editar} conPlataMia={conPlataMia}
                            guardando={guardando} setGuardando={setGuardando}
                            onCerrar={cerrar} onGuardado={r => { onGuardado?.(r); onCerrar() }} />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}

/** Lo de adentro: nace cada vez que se abre, así arranca limpio */
function Formulario({ tipo, editar, conPlataMia, guardando, setGuardando, onCerrar, onGuardado }: {
    tipo: TipoMovimiento
    editar: MovimientoAEditar | null
    conPlataMia: boolean
    guardando: boolean
    setGuardando: (v: boolean) => void
    onCerrar: () => void
    onGuardado: (r: MovimientoGuardado) => void
}) {
    const id = useId()
    const { titulo, Icon, verde } = TIPOS_MOVIMIENTO[tipo]
    const [monto, setMonto] = useState(() => editar ? String(Math.round(editar.monto)) : '')
    const [categoria, setCategoria] = useState(() => editar?.categoria || 'otros')
    const [cuenta, setCuenta] = useState<string | null>(() => editar?.cuenta ?? null)
    const [nota, setNota] = useState(() => editar?.nota ?? '')
    const montoRef = useRef<HTMLInputElement>(null)
    const cerrado = !!editar?.turnoCerrado

    // Se escribe de una el monto (al corregir, no: casi siempre es otra cosa)
    useEffect(() => {
        if (editar) return
        const t = setTimeout(() => montoRef.current?.focus({ preventScroll: true }), 60)
        return () => clearTimeout(t)
    }, [editar])

    const valor = Number(monto) || 0
    // Lo de antes sin cuenta se puede corregir sin elegirle una
    const sinCuentaDeAntes = !!editar && editar.cuenta === null && cuenta === null
    const listo = valor > 0 && (!!cuenta || sinCuentaDeAntes) && !guardando

    async function guardar() {
        if (!listo) return
        setGuardando(true)
        const cambioCuenta = !editar || cuenta !== editar.cuenta
        const { methodId, plataMia } = cuentaParaGuardar(cuenta)
        const textoNota = nota.trim() || null
        try {
            if (!editar && tipo === 'gasto') {
                const res = await fetch('/api/expenses', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: categoria, description: textoNota, amount: Math.round(valor), methodId, plataMia }),
                })
                const json = await res.json().catch(() => ({}))
                if (!res.ok) throw new Error(json.error || 'No se pudo guardar el gasto')
                recordarCuenta(tipo, cuenta)
                toast.success('Movimiento guardado')
                onGuardado({ tipo, editado: false, expenseId: json.expenseId })
            } else if (!editar) {
                const { data, error } = await supabase.rpc('toul_registrar_movimiento', {
                    p_tipo: tipo, p_monto: Math.round(valor), p_method_id: methodId, p_nota: textoNota,
                })
                if (error) throw error
                recordarCuenta(tipo, cuenta)
                toast.success('Movimiento guardado')
                onGuardado({ tipo, editado: false, paymentId: (data as { id: string }).id })
            } else if (tipo === 'gasto') {
                const { error } = await supabase.rpc('toul_update_expense', {
                    p_expense_id: editar.id, p_category: categoria, p_description: textoNota, p_amount: Math.round(valor),
                    // Sin cambiar de cuenta se queda con la suya
                    p_method_id: cambioCuenta ? methodId : null, p_plata_mia: cambioCuenta ? plataMia : null,
                })
                if (error) throw error
                toast.success('Cambios guardados')
                onGuardado({ tipo, editado: true, expenseId: editar.id })
            } else {
                const { error } = await supabase.rpc('toul_editar_movimiento', {
                    p_id: editar.id, p_monto: Math.round(valor), p_method_id: cambioCuenta ? methodId : null, p_nota: textoNota,
                })
                if (error) throw error
                toast.success('Cambios guardados')
                onGuardado({ tipo, editado: true })
            }
        } catch (err) {
            toast.error(explainError(err, 'No se pudo guardar. Intenta de nuevo.'))
        } finally {
            setGuardando(false)
        }
    }

    return (
        <>
            <div className="rm-cuerpo">
                <div className="rm-cabeza">
                    <span className="rm-icono">
                        <Icon size={19} strokeWidth={2} style={{ color: verde ? 'var(--toul-accent)' : 'var(--toul-text)' }} />
                    </span>
                    <h2 className="rm-titulo">{titulo}</h2>
                    <button type="button" className="rm-cerrar" onClick={onCerrar} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                {cerrado && (
                    <p className="rm-info" style={{ marginTop: 12 }}>
                        <Info size={15} aria-hidden />
                        <span>{tipo === 'gasto' ? TURNO_CERRADO : TURNO_CERRADO.replace('la nota o la categoría', 'la nota')}</span>
                    </p>
                )}

                <label className="rm-rotulo" htmlFor={`${id}-monto`}>¿Cuánto?</label>
                <input id={`${id}-monto`} ref={montoRef} className="rm-monto" inputMode="numeric" autoComplete="off"
                    placeholder="$0" disabled={cerrado}
                    value={monto ? `$${withThousands(monto)}` : ''}
                    onChange={e => setMonto(onlyDigits(e.target.value).replace(/^0+/, ''))}
                    onKeyDown={e => { if (e.key === 'Enter') guardar() }} />

                {tipo === 'gasto' && (
                    <>
                        <span className="rm-rotulo" id={`${id}-cat`}>¿En qué?</span>
                        <div className="cc-chips" role="radiogroup" aria-labelledby={`${id}-cat`}>
                            {EXPENSE_CATEGORIES.map(c => (
                                <button key={c.value} type="button" role="radio" className="cc-chip"
                                    aria-checked={categoria === c.value} onClick={() => setCategoria(c.value)}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <span className="rm-rotulo">{PREGUNTA_CUENTA[tipo]}</span>
                <CuentaChips valor={cuenta} onChange={setCuenta} recordar={tipo} etiqueta={PREGUNTA_CUENTA[tipo]}
                    conPlataMia={tipo === 'gasto' && conPlataMia} preseleccionar={!editar} bloqueada={cerrado} />

                <label className="rm-rotulo" htmlFor={`${id}-nota`}>Nota · opcional</label>
                <input id={`${id}-nota`} className="rm-nota" placeholder={EJEMPLO_NOTA[tipo]} maxLength={80}
                    value={nota} onChange={e => setNota(e.target.value)} enterKeyHint="done" />

                <p className="rm-info">
                    <Info size={15} aria-hidden />
                    <span>{QUE_HACE[tipo]}</span>
                </p>
            </div>

            <div className="rm-pie">
                <button type="button" className="toul-btn-primary rm-guardar" disabled={!listo} onClick={guardar}>
                    {guardando ? 'Guardando…' : editar ? 'Guardar cambios' : 'Guardar'}
                </button>
            </div>
        </>
    )
}
