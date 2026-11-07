'use client'

import Link from 'next/link'
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { ChevronRight, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/hooks/useData'
import type { AIInsight } from '@/lib/types'

/* ══════════════════════════════════════════════════════════════
   El botón de TOUL AI: en la barra lateral (PC) y, más grande, en
   la pantalla "Más" del celular.

   Un borde de luz que gira, un brillo que lo cruza cada 5 segundos
   y la chispa que respira. Con "reducir movimiento" queda quieto.

   "1 observación nueva" es la observación que TOUL AI ya calculó
   para el Inicio. Cuenta como nueva hasta que se abre en el Inicio
   o se entra a TOUL AI. El menú nunca la calcula (cada cálculo
   cuesta): solo lee lo que el Inicio dejó guardado en el equipo.
   ══════════════════════════════════════════════════════════════ */

// Igual que el Inicio: pasadas 6 horas la observación ya no vale
const IDEAS_VIGENCIA = 6 * 60 * 60 * 1000
const EVENTO_VISTA = 'toul-observacion-vista'
const llaveIdeas = (storeId: string) => `toul-ideas-v2:${storeId}`
// Empieza por "toul": si entra otra cuenta, se borra con todo lo demás
const llaveVista = (storeId: string) => `toul-ai-vista:${storeId}`

/** La observación que el Inicio está mostrando, si sigue vigente */
function observacionGuardada(storeId: string): AIInsight | null {
    try {
        const g = JSON.parse(localStorage.getItem(llaveIdeas(storeId)) || 'null') as { at?: number; insights?: AIInsight[] } | null
        const insight = g?.insights?.[0]
        if (!g?.at || !insight || insight.id === 'starting') return null
        if (Date.now() - g.at >= IDEAS_VIGENCIA) return null
        return insight
    } catch {
        return null
    }
}

// La misma idea vuelta a calcular no cuenta como nueva; otra distinta sí
const firma = (insight: AIInsight) => `${insight.id}|${insight.interpretation ?? ''}`

/** Marca como vista la observación de ahora (al abrirla o al entrar a TOUL AI) */
export function marcarObservacionVista(storeId: string | undefined) {
    if (!storeId) return
    const insight = observacionGuardada(storeId)
    if (!insight) return
    try { localStorage.setItem(llaveVista(storeId), firma(insight)) } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new Event(EVENTO_VISTA))
}

function suscribir(aviso: () => void) {
    window.addEventListener('storage', aviso)
    window.addEventListener(EVENTO_VISTA, aviso)
    return () => {
        window.removeEventListener('storage', aviso)
        window.removeEventListener(EVENTO_VISTA, aviso)
    }
}

/** Texto (no objeto) para que React lo compare sin volver a pintar de más */
function nuevaGuardada(storeId: string | undefined): string {
    if (!storeId) return ''
    const insight = observacionGuardada(storeId)
    if (!insight) return ''
    try { if (localStorage.getItem(llaveVista(storeId)) === firma(insight)) return '' } catch { return '' }
    return JSON.stringify({ pregunta: insight.question ?? null })
}

/** La observación sin ver, con la pregunta para abrir el chat; o null */
export function useObservacionNueva(storeId: string | undefined): { pregunta: string | null } | null {
    // Cuando el Inicio termina de calcular, esto vuelve a pintar el menú
    // (sin pedir nada: no tiene con qué calcular)
    useSWR(storeId ? ['insights', storeId] : null, null)
    const leer = useCallback(() => nuevaGuardada(storeId), [storeId])
    const texto = useSyncExternalStore(suscribir, leer, () => '')
    return useMemo(() => (texto ? JSON.parse(texto) as { pregunta: string | null } : null), [texto])
}

const CSS = `
.tai { position: relative; display: block; border-radius: 15px; padding: 1px; overflow: hidden; isolation: isolate;
    color: var(--toul-text); text-decoration: none; cursor: pointer;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: transform 200ms var(--toul-ease-emil), box-shadow 300ms ease; }
/* El borde: una luz verde que gira. Cuadrado y centrado, cubre el botón en cualquier ángulo */
.tai::before { content: ''; position: absolute; left: 50%; top: 50%; width: 160%; aspect-ratio: 1; z-index: -1;
    background: conic-gradient(from 0deg, transparent 0deg,
        color-mix(in srgb, var(--toul-accent) 15%, transparent) 40deg, var(--toul-accent) 90deg,
        var(--toul-accent-menta) 130deg, color-mix(in srgb, var(--toul-accent) 15%, transparent) 170deg,
        transparent 210deg, transparent 360deg);
    transform: translate(-50%, -50%); animation: tai-gira 4.5s linear infinite; }
@keyframes tai-gira { from { transform: translate(-50%, -50%) rotate(0deg); } to { transform: translate(-50%, -50%) rotate(360deg); } }

/* Adentro: oscuro, con un brillo verde desde la esquina de arriba */
.tai-in { position: relative; display: flex; align-items: center; gap: 11px; padding: 11px 13px; border-radius: 14px; overflow: hidden;
    background: radial-gradient(130% 160% at 0% 0%, color-mix(in srgb, var(--toul-accent) 18%, transparent),
        color-mix(in srgb, color-mix(in srgb, var(--toul-accent) 2%, var(--toul-bg)) 97%, transparent) 55%); }
/* El brillo blanco que lo cruza en diagonal cada 5 segundos */
.tai-in::after { content: ''; position: absolute; top: 0; bottom: 0; left: 0; width: 45%; pointer-events: none;
    background: linear-gradient(100deg, transparent, color-mix(in srgb, var(--toul-text) 9%, transparent), transparent);
    transform: translateX(-133.33%); animation: tai-cruza 5s ease-in-out infinite; }
@keyframes tai-cruza { 0%, 62% { transform: translateX(-133.33%); } 100% { transform: translateX(300%); } }

.tai-orbe { width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--toul-accent-menta) 45%, transparent),
        color-mix(in srgb, var(--toul-accent) 18%, transparent) 55%, color-mix(in srgb, var(--toul-accent) 5%, transparent));
    box-shadow: 0 0 16px color-mix(in srgb, var(--toul-accent) 35%, transparent); }
.tai-chispa { color: color-mix(in srgb, var(--toul-accent-menta) 22%, var(--toul-text)); animation: tai-respira 2.6s ease-in-out infinite; }
@keyframes tai-respira { 0%, 100% { transform: scale(1) rotate(0deg); } 50% { transform: scale(1.14) rotate(14deg); } }

.tai-texto { min-width: 0; }
.tai-titulo { display: block; font-size: 14px; font-weight: 600; letter-spacing: -0.1px; color: var(--toul-text); white-space: nowrap; }
.tai-sub { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 12px; color: var(--toul-accent-claro); white-space: nowrap; }
/* El punto que late: la onda crece y se apaga */
.tai-punto { position: relative; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; background: var(--toul-accent); }
.tai-punto::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--toul-accent); opacity: 0;
    animation: tai-late 1.8s ease-out infinite; }
@keyframes tai-late { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(3.33); opacity: 0; } }
.tai-flecha { margin-left: auto; flex-shrink: 0; color: color-mix(in srgb, var(--toul-text) 40%, transparent); }

/* Más grande en la pantalla "Más" */
.tai-grande .tai-in { padding: 16px; }
.tai-grande .tai-orbe { width: 44px; height: 44px; }
.tai-grande .tai-titulo { font-size: 16px; }

.tai:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; }
.tai:active { transform: scale(0.98); }
@media (hover: hover) and (pointer: fine) {
    .tai:hover { transform: translateY(-1px); box-shadow: 0 8px 28px color-mix(in srgb, var(--toul-accent) 22%, transparent); }
    .tai:active { transform: scale(0.98); }
}
@media (prefers-reduced-motion: reduce) {
    .tai::before, .tai-in::after, .tai-chispa, .tai-punto::after { animation: none; }
    .tai, .tai:hover, .tai:active { transform: none; }
}
`

// Al pasar el mouse, el borde gira más rápido (de 4,5 s a 2 s por vuelta).
// Se cambia la velocidad sin reiniciar el giro, para que la luz no salte.
const RAPIDO = 4.5 / 2
function velocidadBorde(el: HTMLElement, rapidez: number) {
    try {
        for (const a of el.getAnimations({ subtree: true })) {
            if ((a as CSSAnimation).animationName === 'tai-gira') a.updatePlaybackRate(rapidez)
        }
    } catch { /* navegador sin esta función: gira a su ritmo */ }
}

export function BotonToulAI({ grande = false, onClick }: { grande?: boolean; onClick?: () => void }) {
    const { data: store } = useStore()
    const nueva = useObservacionNueva(store?.id)
    // Con una observación sin ver, el chat abre con la pregunta sobre ella ya escrita
    const href = nueva?.pregunta ? `/toul-ai?q=${encodeURIComponent(nueva.pregunta)}` : '/toul-ai'

    return (
        <>
            <style>{CSS}</style>
            <Link href={href} onClick={onClick} className={grande ? 'tai tai-grande' : 'tai'}
                onPointerEnter={e => { if (e.pointerType === 'mouse') velocidadBorde(e.currentTarget, RAPIDO) }}
                onPointerLeave={e => { if (e.pointerType === 'mouse') velocidadBorde(e.currentTarget, 1) }}>
                <span className="tai-in">
                    <span className="tai-orbe" aria-hidden>
                        <Sparkles size={grande ? 22 : 17} strokeWidth={2} className="tai-chispa" />
                    </span>
                    <span className="tai-texto">
                        <span className="tai-titulo">Pregúntale a TOUL AI</span>
                        {nueva && (
                            <span className="tai-sub">
                                <span className="tai-punto" aria-hidden />
                                {grande ? 'Tienes 1 observación nueva' : '1 observación nueva'}
                            </span>
                        )}
                    </span>
                    {grande && <ChevronRight size={18} className="tai-flecha" aria-hidden />}
                </span>
            </Link>
        </>
    )
}
