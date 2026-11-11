'use client'

import Link from 'next/link'
import { ChevronRight, LogOut, Settings } from 'lucide-react'
import { useStore } from '@/lib/hooks/useData'
import { usePendingApprovalsCount } from '@/lib/isla/useSession'
import { PUNTO_FISICO } from '@/lib/puntoFisico'
import { useCerrarSesion } from '@/lib/session/useCerrarSesion'
import { BotonToulAI } from '@/components/layout/BotonToulAI'
import { CountBadge, MENU_MAS, inicialesDe, nombrePlan, seVe, usePlan } from '@/components/layout/BottomNav'

/* ══════════════════════════════════════════════════════════════
   "Más" en el celular: lo que no cabe en la barra de abajo.
   Arriba la tienda (lleva a Ajustes) y TOUL AI. Después las
   secciones, una línea, Ajustes y Cerrar sesión.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.ms { max-width: 560px; }
.ms-titulo { font-size: 32px; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--toul-text); margin: 0; }
.ms-tienda { display: flex; align-items: center; gap: 12px; margin: 18px 0; color: var(--toul-text); text-decoration: none; }
.ms-avatar { width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 10%, transparent); font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
.ms-nombre { display: block; font-size: 16px; font-weight: 600; letter-spacing: -0.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ms-plan { display: block; font-size: 13px; color: var(--toul-text-subtle); margin-top: 1px; }
.ms-lista { margin-top: 14px; }
.ms-fila { display: flex; align-items: center; gap: 14px; width: 100%; padding: 11px 0; border: none; background: none;
    font: inherit; font-size: 16px; letter-spacing: -0.01em; color: var(--toul-text); text-align: left; text-decoration: none; cursor: pointer; }
.ms-circulo { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); color: color-mix(in srgb, var(--toul-text) 85%, transparent); }
.ms-nombre-fila { flex: 1; min-width: 0; }
.ms-chev { flex-shrink: 0; color: color-mix(in srgb, var(--toul-text) 30%, transparent); }
.ms-linea { height: 1px; background: var(--toul-divider); margin: 10px 0; }
.ms-salir, .ms-salir .ms-circulo { color: var(--toul-error); }
.ms-salir:disabled { opacity: 0.6; cursor: default; }
/* Al tocar, la fila se apaga un instante: el dedo sabe que respondió */
.ms-fila, .ms-tienda { -webkit-tap-highlight-color: transparent; touch-action: manipulation; -webkit-user-select: none; user-select: none;
    transition: opacity 120ms ease; }
.ms-fila:active, .ms-tienda:active { opacity: 0.55; }
.ms-fila:focus-visible, .ms-tienda:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: 2px; border-radius: 12px; }
`

export default function MasPage() {
    const { data: store } = useStore()
    const plan = usePlan()
    // Las aprobaciones son del punto físico: en pausa, ni se preguntan
    const { data: pendientes = 0 } = usePendingApprovalsCount(PUNTO_FISICO)
    // El mismo cierre de sesión de Ajustes: carga lo pendiente y no deja nada en el equipo
    const { cerrar, cerrando, dialogo } = useCerrarSesion(store?.id)
    const nombre = store?.name || 'Mi negocio'
    const rotuloPlan = [nombrePlan(plan), 'Ajustes'].filter(Boolean).join(' · ')

    return (
        <div className="ms px-4 md:px-8 pt-6 pb-6">
            <style>{CSS}</style>
            <h1 className="ms-titulo">Más</h1>

            <Link href="/settings" className="ms-tienda">
                <span className="ms-avatar" aria-hidden>{inicialesDe(nombre)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ms-nombre">{nombre}</span>
                    <span className="ms-plan">{rotuloPlan}</span>
                </span>
                <ChevronRight size={17} className="ms-chev" aria-hidden />
            </Link>

            <BotonToulAI grande />

            <div className="ms-lista">
                {MENU_MAS.filter(item => seVe(item, plan)).map(item => {
                    const Icon = item.icon
                    return (
                        <Link key={item.href} href={item.href} className="ms-fila">
                            <span className="ms-circulo"><Icon size={19} strokeWidth={1.9} /></span>
                            <span className="ms-nombre-fila">{item.label}</span>
                            {item.badge && <CountBadge count={pendientes} />}
                            <ChevronRight size={17} className="ms-chev" aria-hidden />
                        </Link>
                    )
                })}

                <div className="ms-linea" />

                <Link href="/settings" className="ms-fila">
                    <span className="ms-circulo"><Settings size={19} strokeWidth={1.9} /></span>
                    <span className="ms-nombre-fila">Ajustes</span>
                    <ChevronRight size={17} className="ms-chev" aria-hidden />
                </Link>
                <button type="button" className="ms-fila ms-salir" disabled={cerrando} onClick={cerrar}>
                    <span className="ms-circulo"><LogOut size={19} strokeWidth={1.9} /></span>
                    <span className="ms-nombre-fila">{cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
                </button>
            </div>
            {dialogo}
        </div>
    )
}
