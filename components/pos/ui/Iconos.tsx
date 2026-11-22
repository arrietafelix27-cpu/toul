/* ══════════════════════════════════════════════════════════════
   Íconos de Nueva venta: los mismos trazos del prototipo aprobado
   (24×24, línea redonda). Toman el color del texto (currentColor).
   ══════════════════════════════════════════════════════════════ */

type P = { size?: number; grosor?: number; className?: string; style?: React.CSSProperties }

function Svg({ size = 18, grosor = 2, className, style, children }: P & { children: React.ReactNode }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
            {children}
        </svg>
    )
}

export const IcoMas = (p: P) => <Svg grosor={2.6} size={16} {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const IcoMenos = (p: P) => <Svg grosor={2.6} size={16} {...p}><path d="M5 12h14" /></Svg>
export const IcoBasura = (p: P) => <Svg grosor={2} size={16} {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>
export const IcoCerrar = (p: P) => <Svg grosor={2.6} size={14} {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
export const IcoCheck = (p: P) => <Svg grosor={3.2} size={12} {...p}><path d="M20 6 9 17l-5-5" /></Svg>
export const IcoLupa = (p: P) => <Svg grosor={1.9} size={18} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
export const IcoDerecha = (p: P) => <Svg grosor={2.2} size={16} {...p}><path d="m9 6 6 6-6 6" /></Svg>
export const IcoIzquierda = (p: P) => <Svg grosor={2.2} size={18} {...p}><path d="M15 18 9 12l6-6" /></Svg>
export const IcoAbajo = (p: P) => <Svg grosor={2.4} size={14} {...p}><path d="m6 9 6 6 6-6" /></Svg>
export const IcoFlecha = (p: P) => <Svg grosor={2.4} size={18} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>
export const IcoCandado = (p: P) => <Svg grosor={2.4} size={12} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
export const IcoCliente = (p: P) => <Svg grosor={1.9} size={18} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Svg>
/** Filtrar: tres líneas que se acortan */
export const IcoFiltrar = (p: P) => <Svg grosor={2} size={19} {...p}><path d="M4 6h16M7 12h10M10 18h4" /></Svg>
/** Ordenar: una flecha baja y otra sube */
export const IcoOrdenar = (p: P) => <Svg grosor={2} size={19} {...p}><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4" /></Svg>
export const IcoDividir = (p: P) => <Svg grosor={1.9} size={18} {...p}><path d="M12 21v-7l-6-6M12 14l6-6M4 4h5v5M20 4h-5v5" /></Svg>
export const IcoDescuento = (p: P) => <Svg grosor={1.9} size={18} {...p}><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></Svg>
export const IcoCalendario = (p: P) => <Svg grosor={1.9} size={18} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>
export const IcoBillete = (p: P) => <Svg grosor={1.9} size={18} {...p}><rect x="2.5" y="6" width="19" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /></Svg>
/** Aviso: triángulo con signo de admiración (avisos en ámbar) */
export const IcoAlerta = (p: P) => <Svg grosor={2.2} size={15} {...p}><path d="M10.3 4.2 2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4.2M12 17h.01" /></Svg>
/** Compartir: la flecha que sale de la bandeja */
export const IcoCompartir = (p: P) => <Svg grosor={2} size={18} {...p}><path d="M12 3v12M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></Svg>
export const IcoImpresora = (p: P) => <Svg grosor={2} size={16} {...p}><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></Svg>
