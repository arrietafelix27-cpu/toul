'use client'

import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ChevronRight, MessageCircle } from 'lucide-react'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrecio } from '@/lib/utils'
import type { Variante } from './Desplegable'

/* ══════════════════════════════════════════════════════════════
   Plata pendiente.

   Arriba lo que te deben y lo que debes, y una barra que dice cuál
   pesa más. Debajo, un repaso rápido: los primeros tres. Tocar
   "Debes" cambia la lista a tus proveedores, sin salir del Inicio;
   a un cliente con número se le puede recordar por WhatsApp desde
   aquí mismo.
   ══════════════════════════════════════════════════════════════ */

export interface PendingParty {
    id: string
    name: string
    amount: number
    phone: string | null
    /** Días desde que quedó debiendo. null si no se sabe. */
    days: number | null
}

export interface PendingData {
    customerDebts: PendingParty[]
    providerDebts: PendingParty[]
    /** Cuántos son en total, no cuántos alcanzaron a cargarse */
    customerCount?: number
    providerCount?: number
}

type Lado = 'cobrar' | 'pagar'

const CSS = `
.pl-titulo { display: inline-flex; align-items: center; gap: 4px; margin: 0 0 14px; text-decoration: none;
    font-weight: 700; letter-spacing: -0.5px; line-height: 1.2; color: var(--toul-text);
    -webkit-tap-highlight-color: transparent; transition: opacity 160ms var(--toul-ease-emil); }
.pl-titulo[data-variante="movil"] { font-size: 20px; }
.pl-titulo[data-variante="pc"] { font-size: 17px; }
.pl-titulo svg { color: var(--toul-text-subtle); transition: transform 160ms var(--toul-ease-emil); }
.pl-titulo:active { opacity: 0.7; }

.pl-totales { display: flex; align-items: stretch; gap: 18px; }
.pl-linea { width: 1px; flex-shrink: 0; background: var(--toul-border); }
.pl-total { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; padding: 0; border: none;
    background: none; font: inherit; text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; touch-action: manipulation;
    transition: transform 160ms var(--toul-ease-emil); }
.pl-total:active { transform: scale(0.98); }
.pl-rotulo { font-size: 13px; color: var(--toul-text-subtle); transition: color 160ms var(--toul-ease-emil); }
.pl-total[aria-pressed="true"] .pl-rotulo { color: var(--toul-text-muted); }
.pl-monto { margin-top: 4px; font-weight: 700; letter-spacing: -0.6px; line-height: 1.15; font-variant-numeric: tabular-nums;
    white-space: nowrap; }
.pl-totales[data-variante="movil"] .pl-monto { font-size: 24px; }
/* En PC la columna se angosta con la pantalla: el monto también, para que quepan los dos */
.pl-totales[data-variante="pc"] .pl-monto { font-size: clamp(17px, 1.45vw, 21px); }
.pl-cuantos { margin-top: 3px; font-size: 12.5px; color: var(--toul-text-subtle); white-space: nowrap; }

/* La barra: cuánto pesa cada lado. El que estás viendo va entero, el otro tenue */
.pl-barra { display: flex; gap: 3px; height: 6px; margin: 16px 0 6px; border-radius: 999px; overflow: hidden;
    background: var(--toul-surface-2); }
.pl-barra > span { min-width: 6px; border-radius: 999px; transition: opacity 200ms var(--toul-ease-emil); }

.pl-lista { display: flex; flex-direction: column; margin-top: 8px; }
/* En el computador: 3 deudores, y 5 en pantallas grandes */
.pl-lista[data-variante="pc"] > .pl-item:nth-child(n+4) { display: none; }
@media (min-width: 1440px) {
    .pl-lista[data-variante="pc"] > .pl-item:nth-child(n+4) { display: flex; }
}
.pl-item { display: flex; align-items: center; gap: 6px; }
.pl-item[data-entra="true"] { animation: pl-entra 260ms cubic-bezier(0.23, 1, 0.32, 1) backwards; }
@keyframes pl-entra { from { opacity: 0; transform: translateY(6px); } }
.pl-fila { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 9px 0; text-decoration: none;
    color: inherit; -webkit-tap-highlight-color: transparent; transition: opacity 160ms var(--toul-ease-emil); }
.pl-fila:active { opacity: 0.7; }
.pl-avatar { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
.pl-avatar[data-lado="cobrar"] { color: var(--toul-accent);
    background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--toul-accent) 34%, transparent), color-mix(in srgb, var(--toul-accent) 8%, transparent) 75%); }
.pl-avatar[data-lado="pagar"] { color: var(--toul-warning);
    background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--toul-warning) 30%, transparent), color-mix(in srgb, var(--toul-warning) 7%, transparent) 75%); }
.pl-quien { flex: 1; min-width: 0; }
.pl-nombre { display: block; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: var(--toul-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-cuando { display: block; margin-top: 1px; font-size: 12.5px; color: var(--toul-text-subtle); white-space: nowrap; }
.pl-valor { flex-shrink: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.3px; font-variant-numeric: tabular-nums; }
.pl-wa { width: 36px; height: 36px; border-radius: 12px; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: var(--toul-surface); color: var(--toul-text-subtle); -webkit-tap-highlight-color: transparent;
    transition: background-color 160ms var(--toul-ease-emil), color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }
.pl-wa:active { transform: scale(0.94); }
.pl-vacia { margin: 14px 0 0; font-size: 13px; color: var(--toul-text-subtle); }

@media (hover: hover) and (pointer: fine) {
    .pl-titulo:hover svg { transform: translateX(2px); }
    .pl-fila:hover .pl-nombre { color: var(--toul-accent); }
    .pl-wa:hover { background: var(--toul-accent-dim); color: var(--toul-accent); }
}
@media (prefers-reduced-motion: reduce) {
    .pl-item[data-entra="true"] { animation: none; }
    .pl-total:active, .pl-wa:active { transform: none; }
}
`

/** 3002223344 → 573002223344 (Colombia) */
function whatsappLink(phone: string, message: string) {
    const digits = phone.replace(/\D/g, '')
    const withCountry = digits.length === 10 ? `57${digits}` : digits
    return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`
}

const initialsOf = (name: string) =>
    name.trim().split(/\s+/).map(word => word[0]).join('').toUpperCase().slice(0, 2)

const sinceLabel = (days: number | null) => {
    if (days === null) return null
    if (days <= 0) return 'hoy'
    if (days === 1) return 'hace 1 día'
    if (days < 30) return `hace ${days} días`
    const months = Math.floor(days / 30)
    return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
}

export function PendingPanel({ pending, storeName, variante, loading, cuenta = false }: {
    pending: PendingData
    storeName?: string | null
    variante: Variante
    loading: boolean
    /** Los totales cuentan desde cero al aparecer (la primera vez que se abre la app) */
    cuenta?: boolean
}) {
    const [lado, setLado] = useState<Lado>('cobrar')
    const [cambiado, setCambiado] = useState(false)

    const totales = useMemo(() => ({
        cobrar: pending.customerDebts.reduce((sum, row) => sum + row.amount, 0),
        pagar: pending.providerDebts.reduce((sum, row) => sum + row.amount, 0),
    }), [pending])

    const lados = [
        {
            clave: 'cobrar' as Lado, rotulo: 'Te deben', valor: totales.cobrar, color: 'var(--toul-accent)',
            cuantos: pending.customerCount ?? pending.customerDebts.length, uno: 'cliente', varios: 'clientes',
        },
        {
            clave: 'pagar' as Lado, rotulo: 'Debes', valor: totales.pagar, color: 'var(--toul-warning)',
            cuantos: pending.providerCount ?? pending.providerDebts.length, uno: 'proveedor', varios: 'proveedores',
        },
    ]

    const esCobrar = lado === 'cobrar'
    const mostrados = (esCobrar ? pending.customerDebts : pending.providerDebts).slice(0, variante === 'movil' ? 3 : 5)
    const tono = esCobrar ? 'var(--toul-accent)' : 'var(--toul-warning)'
    // Si alguno tiene WhatsApp, todos reservan ese espacio: los montos
    // quedan alineados en vez de bailar de renglón en renglón
    const reservarWhatsApp = esCobrar && mostrados.some(p => p.phone)
    const hayDeuda = totales.cobrar + totales.pagar > 0

    function cambiar(nuevo: Lado) {
        if (nuevo === lado) return
        setLado(nuevo)
        setCambiado(true)
    }

    return (
        <section style={{ minWidth: 0 }}>
            <style>{CSS}</style>
            <Link href="/customers?ver=cobros" prefetch={false} className="pl-titulo" data-variante={variante}>
                Plata pendiente <ChevronRight size={variante === 'movil' ? 20 : 18} strokeWidth={2.2} />
            </Link>

            <div className="pl-totales" data-variante={variante}>
                {lados.map((l, i) => (
                    <Fragment key={l.clave}>
                        {i > 0 && <span className="pl-linea" aria-hidden />}
                        <button type="button" className="pl-total" aria-pressed={lado === l.clave} onClick={() => cambiar(l.clave)}>
                            <span className="pl-rotulo">{l.rotulo}</span>
                            {loading ? (
                                <span className="skeleton" style={{ display: 'block', width: 110, height: 22, borderRadius: 8, marginTop: 8 }} />
                            ) : (
                                <AnimatedNumber value={l.valor} formatter={formatPrecio} cuenta={cuenta} className="pl-monto"
                                    style={{ color: l.valor > 0 ? l.color : 'var(--toul-text-dim)' }} />
                            )}
                            <span className="pl-cuantos">
                                {loading ? '\u00a0' : l.cuantos === 0 ? 'Nadie' : `${l.cuantos} ${l.cuantos === 1 ? l.uno : l.varios}`}
                            </span>
                        </button>
                    </Fragment>
                ))}
            </div>

            <div className="pl-barra" aria-hidden>
                {hayDeuda && lados.filter(l => l.valor > 0).map(l => (
                    // En PC va siempre a todo color: el mismo amarillo del monto de "Debes"
                    <span key={l.clave} style={{ flexGrow: l.valor, background: l.color, opacity: variante === 'pc' || lado === l.clave ? 1 : 0.45 }} />
                ))}
            </div>

            {loading ? (
                <div className="pl-lista" aria-hidden>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="pl-fila">
                            <span className="pl-avatar skeleton" />
                            <span className="pl-quien"><Skeleton width="60%" height="0.9rem" /></span>
                        </div>
                    ))}
                </div>
            ) : mostrados.length === 0 ? (
                <p className="pl-vacia">{esCobrar ? 'Nadie te debe nada.' : 'No le debes nada a nadie.'}</p>
            ) : (
                <div key={lado} className="pl-lista" data-variante={variante}>
                    {mostrados.map((persona, i) => {
                        const cuando = sinceLabel(persona.days)
                        const href = esCobrar ? `/customers/${persona.id}` : `/providers/${persona.id}`
                        const mensaje = `Hola ${persona.name.split(' ')[0]}, ¿cómo vas? Te escribo${storeName ? ` de ${storeName}` : ''} para recordarte el saldo pendiente de ${formatPrecio(persona.amount)}. ¿Cuándo podemos cuadrar?`
                        return (
                            <div key={persona.id} className="pl-item" data-entra={cambiado}
                                style={cambiado ? ({ animationDelay: `${i * 45}ms` } as CSSProperties) : undefined}>
                                <Link href={href} prefetch={false} className="pl-fila">
                                    <span className="pl-avatar" data-lado={lado} aria-hidden>{initialsOf(persona.name)}</span>
                                    <span className="pl-quien">
                                        <span className="pl-nombre">{persona.name}</span>
                                        {cuando && <span className="pl-cuando">{cuando}</span>}
                                    </span>
                                    <span className="pl-valor" style={{ color: tono }}>{formatPrecio(persona.amount)}</span>
                                </Link>
                                {reservarWhatsApp && (
                                    persona.phone ? (
                                        <a className="pl-wa" href={whatsappLink(persona.phone, mensaje)}
                                            target="_blank" rel="noopener noreferrer"
                                            aria-label={`Recordarle a ${persona.name} por WhatsApp`} title="Recordar por WhatsApp">
                                            <MessageCircle size={16} />
                                        </a>
                                    ) : (
                                        <span aria-hidden style={{ width: 36, flexShrink: 0 }} />
                                    )
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
