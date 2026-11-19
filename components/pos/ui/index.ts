/* Piezas compartidas de Nueva venta (celular y PC). Ver diseno/pos/SPEC.md */
import s from './pos.module.css'

/** Clase para la raíz de la caja: trae las transparencias y curvas del prototipo, y recorta sin desplazarse */
export const raizPos = `${s.pos} ${s.raiz}`

export { CURVA, DURACION, useQuieto, useRebote, useMontado, cx } from './movimiento'
export * from './Iconos'
export { BotonPrincipal, BotonSecundario, BotonFantasma, BotonIcono, BotonVolver, BotonCerrar } from './Botones'
export { Chip, Chips } from './Chip'
export { Segmentado, SegmentadoMini, type OpcionSegmento } from './Segmentado'
export { Paso, PasoMini } from './Paso'
export { Fila, GrupoFilas, type TonoValor } from './Fila'
export { MontoCampo, MontoGrande } from './Montos'
export { CampoBusqueda, CampoTexto } from './Campo'
export { Nota, NotaGuardada, PildoraSinConexion } from './Nota'
export { avisar, Avisos } from './Aviso'
export { Desplegable, Escalon, Chevron, Rebota, FilaPresentacion, avisoStock } from './Desplegable'
export { Hoja, EtiquetaHoja } from './Hoja'
export { Menu, type OpcionMenu } from './Menu'
export { Capa } from './Capa'
export { abrirCaja, cerrarCaja, avisarCajaLista, avisarInicioListo, DURACION_GOTA } from './gota'
export { BotonConfirmar, type EstadoConfirmar } from './BotonConfirmar'
