'use client'

import Link from 'next/link'
import { ChevronRight, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useStore } from '@/lib/hooks/useData'
import { useOpenCashSession, usePendingApprovalsCount } from '@/lib/isla/useSession'
import { ZONA_COLOMBIA, diaColombia, formatoColombia } from '@/lib/periodos'
import { CountBadge } from '@/components/layout/BottomNav'
import { useEnLinea } from '@/components/ui/SinInternet'
import { redirect } from 'next/navigation'
import { PUNTO_FISICO } from '@/lib/puntoFisico'

/* ══════════════════════════════════════════════════════════════
   Punto físico: lo del local o la isla, en un solo lugar.
   Turnos de caja y Aprobaciones, cada uno con cómo está ahora.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.pf { max-width: 620px; position: relative; }
.pf-titulo { font-size: 26px; font-weight: 700; letter-spacing: -0.035em; color: var(--toul-text); margin: 0 0 18px; }
.pf-fila { display: flex; align-items: center; gap: 14px; padding: 12px 10px; margin: 0 -10px; border-radius: 14px;
    color: var(--toul-text); text-decoration: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
    -webkit-user-select: none; user-select: none;
    transition: background-color 160ms var(--toul-ease-emil), transform 140ms var(--toul-ease-emil); }
.pf-fila + .pf-fila { margin-top: 2px; }
.pf-fila:active { transform: scale(0.985); }
.pf-fila:focus-visible { outline: 2px solid var(--toul-accent); outline-offset: -2px; }
.pf-circulo { width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--toul-text) 6%, transparent); color: color-mix(in srgb, var(--toul-text) 85%, transparent); }
.pf-nombre { display: block; font-size: 16px; letter-spacing: -0.01em; }
.pf-estado { display: block; font-size: 13px; color: var(--toul-text-subtle); margin-top: 2px; min-height: 18px; }
.pf-chev { flex-shrink: 0; color: color-mix(in srgb, var(--toul-text) 30%, transparent); }
@media (hover: hover) and (pointer: fine) { .pf-fila:hover { background: color-mix(in srgb, var(--toul-text) 4%, transparent); } }
@media (prefers-reduced-motion: reduce) { .pf-fila:active { transform: none; } }
`

/** "Caja abierta desde las 9:12 a. m." (o con la fecha, si se abrió otro día) */
function textoTurno(abiertaDesde: string): string {
    const hora = new Date(abiertaDesde).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA_COLOMBIA })
    const articulo = hora.startsWith('1:') ? 'la' : 'las'
    if (diaColombia(abiertaDesde) === diaColombia(new Date())) return `Caja abierta desde ${articulo} ${hora}`
    const dia = formatoColombia(abiertaDesde, { day: 'numeric', month: 'short' })
    return `Caja abierta desde el ${dia}, ${hora}`
}

export default function PuntoFisicoPage() {
    // El punto físico está en pausa (lib/puntoFisico.ts): quien llegue con
    // un enlace viejo o una notificación va al inicio
    if (!PUNTO_FISICO) redirect('/')
    return <PuntoFisico />
}

function PuntoFisico() {
    const { data: store } = useStore()
    const { data: turno, error: errorTurno } = useOpenCashSession(store?.id)
    const { data: pendientes, error: errorPendientes, isLoading: cargandoPendientes } = usePendingApprovalsCount(true)
    const enLinea = useEnLinea()

    // Es un menú: no se tapa con el aviso. Lo que no se puede saber sin
    // internet dice eso, no "Nada pendiente" o "Caja cerrada" inventados.
    // El turno sí se recuerda en el equipo (la caja funciona sin internet)
    const estadoTurno = turno !== undefined ? (turno ? textoTurno(turno.opened_at) : 'Caja cerrada')
        : errorTurno || !enLinea ? 'Sin internet' : ''
    const estadoAprobaciones = errorPendientes || !enLinea ? 'Sin internet'
        : cargandoPendientes || pendientes === undefined ? ''
        : pendientes > 0 ? `${pendientes} por revisar` : 'Nada pendiente'

    return (
        <div className="pf px-4 md:px-8 pt-6 pb-8">
            <style>{CSS}</style>
            <div className="toul-ambient" />
            <h1 className="pf-titulo">Punto físico</h1>

            <Link href="/turnos" className="pf-fila">
                <span className="pf-circulo"><LockKeyhole size={19} strokeWidth={1.9} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="pf-nombre">Turnos de caja</span>
                    <span className="pf-estado">{estadoTurno}</span>
                </span>
                <ChevronRight size={17} className="pf-chev" aria-hidden />
            </Link>

            <Link href="/aprobaciones" className="pf-fila">
                <span className="pf-circulo"><ShieldCheck size={19} strokeWidth={1.9} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="pf-nombre">Aprobaciones</span>
                    <span className="pf-estado">{estadoAprobaciones}</span>
                </span>
                <CountBadge count={errorPendientes || !enLinea ? 0 : pendientes ?? 0} />
                <ChevronRight size={17} className="pf-chev" aria-hidden />
            </Link>
        </div>
    )
}
