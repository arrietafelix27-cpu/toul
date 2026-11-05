/* ══════════════════════════════════════════════════════════════
   Permisos del vendedor (plan Pro). El administrador los elige en
   Ajustes → Punto físico → Permisos del equipo.

   La pantalla los usa para mostrar u ocultar botones; quien manda es
   el servidor (toul_seller_permission en la base), con los mismos
   valores por defecto de aquí.
   ══════════════════════════════════════════════════════════════ */

export type Nivel = 'solo' | 'aprobacion' | 'no'
export type SiNo = 'solo' | 'no'

export interface PermisosVendedor {
    fiar: Nivel
    anular: Nivel
    devolver: Nivel
    /** Porcentaje que puede descontar sin pedir aprobación */
    descuento_max: number
    ver_efectivo: SiNo
    crear_clientes: SiNo
}

/** Lo de siempre: fiar, anular y devolver con aprobación, cierre a ciegas */
export const PERMISOS_POR_DEFECTO: PermisosVendedor = {
    fiar: 'aprobacion',
    anular: 'aprobacion',
    devolver: 'aprobacion',
    descuento_max: 10,
    ver_efectivo: 'no',
    crear_clientes: 'solo',
}

/** Todo permitido: así trabaja el administrador */
export const PERMISOS_ADMIN: PermisosVendedor = {
    fiar: 'solo', anular: 'solo', devolver: 'solo', descuento_max: 100, ver_efectivo: 'solo', crear_clientes: 'solo',
}

/** La base todavía no tiene permisos guardados (falta correr el SQL): todo
 *  queda como estaba, también el descuento libre */
export const PERMISOS_SIN_CONFIGURAR: PermisosVendedor = { ...PERMISOS_POR_DEFECTO, descuento_max: 100 }

const nivel = (v: unknown, def: Nivel): Nivel => v === 'solo' || v === 'aprobacion' || v === 'no' ? v : def
const siNo = (v: unknown, def: SiNo): SiNo => v === 'solo' || v === 'no' ? v : def

export function leerPermisos(raw: unknown): PermisosVendedor {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    const d = PERMISOS_POR_DEFECTO
    const max = Number(r.descuento_max)
    return {
        fiar: nivel(r.fiar, d.fiar),
        anular: nivel(r.anular, d.anular),
        devolver: nivel(r.devolver, d.devolver),
        descuento_max: Number.isFinite(max) && r.descuento_max !== null && r.descuento_max !== '' ? Math.min(100, Math.max(0, Math.round(max))) : d.descuento_max,
        ver_efectivo: siNo(r.ver_efectivo, d.ver_efectivo),
        crear_clientes: siNo(r.crear_clientes, d.crear_clientes),
    }
}

/** Los permisos de quien vende. `raw` undefined: la tienda no trae la columna */
export function permisosDe(rol: 'admin' | 'seller' | string, raw: unknown): PermisosVendedor {
    if (rol === 'admin') return PERMISOS_ADMIN
    if (raw === undefined) return PERMISOS_SIN_CONFIGURAR
    return leerPermisos(raw)
}

/** El descuento más grande que puede dar solo (igual que en el servidor) */
export function descuentoPermitido(subtotal: number, porcentaje: number): number {
    return Math.round(Math.max(0, subtotal) * porcentaje / 100)
}

export interface Revision {
    /** El fiado necesita aprobación */
    fiado: boolean
    /** El descuento necesita aprobación */
    descuento: boolean
    /** No se puede hacer, ni pidiendo aprobación */
    bloqueo: string | null
}

export function revisarVenta({ permisos, esFiado, subtotal, descuento }: {
    permisos: PermisosVendedor; esFiado: boolean; subtotal: number; descuento: number
}): Revision {
    const bloqueo = esFiado && permisos.fiar === 'no' ? 'No tienes permiso para fiar' : null
    return {
        fiado: esFiado && permisos.fiar === 'aprobacion',
        descuento: Math.round(descuento) > descuentoPermitido(subtotal, permisos.descuento_max),
        bloqueo,
    }
}
