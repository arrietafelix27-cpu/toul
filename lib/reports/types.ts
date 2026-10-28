/** Lo que devuelve toul_reporte(desde, hasta): ver supabase/deploy_reportes.sql */
export interface ReporteSQL {
    ventas: {
        /** Vendiste, antes de devoluciones */
        total: number
        cantidad: number
        /** Pagado al momento de la venta (incluye el abono inicial de un fiado) */
        contado: number
        /** total − contado */
        credito: number
        /** Lo que costó la mercancía vendida */
        costo: number
    }
    devoluciones: { total: number; costo: number; reembolsado: number }
    /** Abonos que te hicieron en el periodo, de fiados de cualquier fecha */
    abonos: number
    gastos: number
    gastosPorCategoria: { categoria: string; monto: number }[]
    /** Compras pagadas + abonos a proveedores */
    mercanciaPagada: number
    /** La plata que entró, por método. Los abonos viejos sin método van como "Abonos" */
    metodos: { nombre: string; monto: number }[]
    /** Los 5 que más te dejaron, ya restado lo devuelto */
    productos: { id: string; nombre: string; ventas: number; ganancia: number; margen: number }[]
}

/** Una barra de "Mes a mes": toul_reporte_meses() */
export interface MesReporte {
    /** '2026-10-01' */
    mes: string
    /** Ventas sin devoluciones */
    ventas: number
    /** Ganaste: ganancia en ventas − gastos */
    ganancia: number
}

export const REPORTE_VACIO: ReporteSQL = {
    ventas: { total: 0, cantidad: 0, contado: 0, credito: 0, costo: 0 },
    devoluciones: { total: 0, costo: 0, reembolsado: 0 },
    abonos: 0, gastos: 0, gastosPorCategoria: [], mercanciaPagada: 0, metodos: [], productos: [],
}
