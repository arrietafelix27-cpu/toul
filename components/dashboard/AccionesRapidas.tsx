'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronRight, Receipt, Sparkles, Truck, Undo2 } from 'lucide-react'
import { Sheet } from '@/components/isla/Sheet'
import { DevolucionSheet } from '@/components/ventas/DevolucionSheet'
import { EASE_OUT_EMIL, SPRING_PRESS } from '@/components/ui'
import { PANEL_CSS } from './panelStyles'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   Acciones rápidas del inicio: lo que se hace a diario sin ir a
   buscarlo al menú. Gasto, Compra y Devolución.

   En el celular son tres círculos parejos, para el pulgar. En el
   computador son tres filas dentro de su panel, con una línea que
   dice para qué es cada una: la misma acción, pensada para el mouse
   y para el espacio que hay, no el celular estirado.

   Debajo va TOUL AI, reducido a una línea: solo aparece cuando hay
   algo que decir, y la observación completa se abre al tocarla.
   ══════════════════════════════════════════════════════════════ */

const ACCIONES = [
    { key: 'gasto', label: 'Gasto', hint: 'Registrar un gasto', Icon: Receipt, href: '/expenses?nuevo=1' },
    { key: 'compra', label: 'Compra', hint: 'Entró mercancía', Icon: Truck, href: '/inventory/purchase' },
    { key: 'devolucion', label: 'Devolución', hint: 'Un cliente devolvió algo', Icon: Undo2, href: null },
] as const

const CSS = PANEL_CSS + `
/* ── Celular ── */
.ar-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ar-item { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%;
    padding: 2px 0; border: none; background: none; font: inherit; color: inherit;
    text-decoration: none; cursor: pointer; -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none; user-select: none; touch-action: manipulation; }
/* El verde entra por arriba a la izquierda, como la luz del encabezado */
.ar-circulo, .ar-cuadro { display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--toul-accent);
    background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--toul-accent) 22%, transparent), var(--toul-surface) 70%); }
.ar-circulo { width: 58px; height: 58px; border-radius: 50%; }
.ar-etiqueta { font-size: 13px; font-weight: 500; color: var(--toul-text-muted); letter-spacing: -0.01em; }

/* ── Computador ── */
.ar-titulo { font-size: 17px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2; color: var(--toul-text); margin: 0 0 10px; }
.ar-filas { display: flex; flex-direction: column; }
.ar-fila { display: flex; align-items: center; gap: 14px; width: calc(100% + 16px); padding: 10px 8px; margin: 0 -8px;
    border: none; background: none; border-radius: 14px; font: inherit; color: inherit; text-align: left;
    text-decoration: none; cursor: pointer;
    transition: background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.ar-fila:active { transform: scale(0.98); }
.ar-fila + .ar-fila { margin-top: 2px; }
.ar-cuadro { width: 44px; height: 44px; border-radius: 13px; }
.ar-flecha { color: var(--toul-text-faint); flex-shrink: 0;
    transition: color 160ms var(--toul-ease-emil), transform 160ms var(--toul-ease-emil); }

/* ── TOUL AI en una línea ──
   El borde es un degradado más grande que la línea que gira detrás de
   ella; el fondo de adentro lo tapa todo menos 1 px. Girar es solo
   transform: no le cuesta nada al celular. */
.oa-linea { position: relative; isolation: isolate; overflow: hidden; display: flex; align-items: center; gap: 11px;
    width: 100%; padding: 14px 16px; border: none; border-radius: 16px; background: none;
    font: inherit; color: inherit; text-align: left; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    transition: transform 140ms var(--toul-ease-emil); }
.oa-linea::before { content: ''; position: absolute; z-index: -2; left: 50%; top: 50%; width: 200%; aspect-ratio: 1;
    transform: translate(-50%, -50%) rotate(0turn);
    background: conic-gradient(
        color-mix(in srgb, var(--toul-accent) 10%, transparent) 0turn,
        color-mix(in srgb, var(--toul-accent) 70%, transparent) 0.5turn,
        color-mix(in srgb, var(--toul-accent) 10%, transparent) 1turn);
    animation: oa-vuelta 3.2s linear infinite; }
.oa-linea::after { content: ''; position: absolute; z-index: -1; inset: 1px; border-radius: 15px;
    background: color-mix(in srgb, var(--toul-accent) 7%, var(--toul-bg));
    transition: background-color 160ms var(--toul-ease-emil); }
@keyframes oa-vuelta { to { transform: translate(-50%, -50%) rotate(1turn); } }
.oa-linea:active { transform: scale(0.98); }

.oa-rotulo { font-size: 13px; font-weight: 600; color: var(--toul-text-muted); margin: 0 0 6px; }

@media (hover: hover) and (pointer: fine) {
    .ar-item:hover .ar-circulo, .ar-fila:hover .ar-cuadro {
        background: radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--toul-accent) 30%, transparent), var(--toul-surface-2) 70%); }
    .ar-fila:hover { background: var(--toul-surface-3); }
    .ar-fila:hover .ar-flecha { color: var(--toul-text-muted); transform: translateX(2px); }
    .oa-linea:hover::after { background: color-mix(in srgb, var(--toul-accent) 10%, var(--toul-bg)); }
}
@media (prefers-reduced-motion: reduce) {
    .ar-fila:active, .oa-linea:active { transform: none; }
    .oa-linea::before { animation: none; background: color-mix(in srgb, var(--toul-accent) 35%, transparent); }
}
`

export function AccionesRapidas({ variante }: { variante: 'movil' | 'pc' }) {
    const [devolucion, setDevolucion] = useState(false)
    const cerrarDevolucion = useCallback(() => setDevolucion(false), [])

    return (
        <>
            <style>{CSS}</style>
            {variante === 'movil' ? (
                <div className="ar-grid">
                    {ACCIONES.map(({ key, label, Icon, href }) => {
                        const cuerpo = (
                            <>
                                <span className="ar-circulo"><Icon size={24} strokeWidth={2} /></span>
                                <span className="ar-etiqueta">{label}</span>
                            </>
                        )
                        return (
                            <motion.div key={key} whileTap={{ scale: 0.95 }} transition={SPRING_PRESS}>
                                {href
                                    ? <Link href={href} className="ar-item">{cuerpo}</Link>
                                    : <button type="button" className="ar-item" onClick={() => setDevolucion(true)}>{cuerpo}</button>}
                            </motion.div>
                        )
                    })}
                </div>
            ) : (
                <div>
                    <h2 className="ar-titulo">Acciones rápidas</h2>
                    <div className="ar-filas">
                        {ACCIONES.map(({ key, label, hint, Icon, href }) => {
                            const cuerpo = (
                                <>
                                    <span className="ar-cuadro"><Icon size={20} strokeWidth={2} /></span>
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: 'block', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--toul-text)' }}>{label}</span>
                                        <span style={{ display: 'block', fontSize: 14, color: 'var(--toul-text-subtle)', marginTop: 1 }}>{hint}</span>
                                    </span>
                                    <ChevronRight size={18} className="ar-flecha" />
                                </>
                            )
                            return href
                                ? <Link key={key} href={href} className="ar-fila">{cuerpo}</Link>
                                : <button key={key} type="button" className="ar-fila" onClick={() => setDevolucion(true)}>{cuerpo}</button>
                        })}
                    </div>
                </div>
            )}
            {/* El inicio es solo del administrador (los vendedores van a la
                caja): la devolución se hace de una, sin pedir aprobación */}
            <DevolucionSheet open={devolucion} onClose={cerrarDevolucion} isAdmin />
        </>
    )
}

const TONO: Record<string, { color: string; dim: string }> = {
    health: { color: 'var(--toul-accent)', dim: 'var(--toul-accent-dim)' },
    attention: { color: 'var(--toul-warning)', dim: 'var(--toul-warning-dim)' },
    alert: { color: 'var(--toul-error)', dim: 'var(--toul-error-dim)' },
    info: { color: 'var(--toul-text-muted)', dim: 'var(--toul-surface-2)' },
}

/** TOUL AI en una línea. Con menos de 8 ventas la IA no opina (eso lo
 *  decide el servidor y llega como "starting"): ahí la línea no sale. */
export function ObservacionAI({ insight, loading }: { insight: AIInsight | null; loading: boolean }) {
    const [abierta, setAbierta] = useState(false)
    const cerrar = useCallback(() => setAbierta(false), [])
    const visible = !loading && !!insight && insight.id !== 'starting'
    const tono = TONO[insight?.severity ?? 'info'] ?? TONO.info

    return (
        <>
            <style>{CSS}</style>
            <AnimatePresence initial={false}>
                {visible && (
                    <motion.button type="button" className="oa-linea" onClick={() => setAbierta(true)}
                        initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
                        transition={{ duration: 0.22, ease: EASE_OUT_EMIL }}>
                        <Sparkles size={18} style={{ color: 'var(--toul-accent)', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--toul-text)' }}>
                            TOUL AI tiene 1 observación
                        </span>
                        <ChevronRight size={18} style={{ color: 'var(--toul-text-subtle)', flexShrink: 0 }} />
                    </motion.button>
                )}
            </AnimatePresence>

            <Sheet open={abierta && !!insight} onClose={cerrar} title="TOUL AI" width={460}>
                {insight && (
                    <div>
                        {insight.verdict && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999,
                                background: tono.dim, fontSize: 12, fontWeight: 600, color: tono.color, marginBottom: 12,
                            }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: tono.color }} />
                                {insight.verdict}
                            </span>
                        )}
                        <p style={{ fontSize: 16.5, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.4 }}>
                            {insight.interpretation}
                        </p>
                        {insight.implication && (
                            <p style={{ fontSize: 14, color: 'var(--toul-text-dim)', margin: '8px 0 0', lineHeight: 1.5 }}>
                                {insight.implication}
                            </p>
                        )}
                        {insight.suggestion && (
                            <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--toul-divider)' }}>
                                <p className="oa-rotulo">Qué hacer</p>
                                <p style={{ fontSize: 14.5, color: 'var(--toul-text-muted)', margin: 0, lineHeight: 1.5 }}>
                                    {insight.suggestion}
                                </p>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 18 }}>
                            {insight.action && (
                                <Link href={insight.action.href} className="pnl-pill" onClick={cerrar}>
                                    {insight.action.label} <ArrowRight size={14} />
                                </Link>
                            )}
                            <Link href={`/toul-ai${insight.question ? `?q=${encodeURIComponent(insight.question)}` : ''}`}
                                className="pnl-link" onClick={cerrar}>
                                Preguntar a TOUL AI <ArrowRight size={13} />
                            </Link>
                        </div>
                    </div>
                )}
            </Sheet>
        </>
    )
}
