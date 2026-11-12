/* ══════════════════════════════════════════════════════════════
   Las cuentas de Inventario, sin pantallas.

   Todo lo que Inventario calcula en el equipo vive aquí: cuánto
   aguanta la bodega, cuánto pedir, el mínimo, los filtros, el costo
   de un producto con tallas, los totales de una compra y lo del
   conteo. Las pantallas solo dibujan lo que sale de aquí, así se
   pueden rediseñar sin tocar un solo número.

   Sin imports a propósito: así las pruebas corren con node directo.
   La plata se escribe con la función que se le pase (formatCOP).
   ══════════════════════════════════════════════════════════════ */

const DIA = 86_400_000
/** La barra del medidor se mide contra un mes */
export const HORIZONTE_MEDIDOR = 30

export type Clase = 'producto' | 'presentacion'
export type Dinero = (valor: number) => string
export type Tono = 'dim' | 'warn' | 'error'

/* ── Lo que manda la base (toul_inventory_overview) ─────────── */

export interface Alerta {
    id: string
    kind: Clase
    product_id: string
    product_name: string
    variant_name: string | null
    /** La referencia del producto (para buscar por referencia en los filtros) */
    reference?: string | null
    image_url: string | null
    stock: number
    cost: number
    min_stock: number
    sold_30d: number
}

export interface Quieto {
    id: string
    kind: Clase
    product_id: string
    product_name: string
    variant_name: string | null
    reference?: string | null
    image_url: string | null
    stock: number
    cost: number
    idle_days: number
    never_sold: boolean
}

export interface ResumenInventario {
    coverageDays: number
    idleDays: number
    value: number
    retailValue: number
    units: number
    soldUnits30: number
    items: number
    references: number
    outOfStock: number
    lowStock: number
    alerts: Alerta[]
    dormantValue: number
    dormantCount: number
    dormant: Quieto[]
}

/* ── Cuánto aguanta ─────────────────────────────────────────── */

/** Días que dura lo que hay al ritmo de los últimos 30 días. null si no se ha vendido nada */
export function diasQueAguanta(unidades: number, vendidas30: number): number | null {
    const porDia = Number(vendidas30) / 30
    if (!(porDia > 0)) return null
    return Math.floor(Number(unidades) / porDia)
}

/** "2": lo que sale por semana, en entero. Si no alcanza a 1 por
 *  semana, "menos de 1". null si no se ha vendido */
export function ritmoSemanal(vendidas30: number, dias = 30): string | null {
    const porSemana = (Number(vendidas30) || 0) / dias * 7
    if (porSemana <= 0) return null
    return porSemana < 1 ? 'menos de 1' : String(Math.round(porSemana))
}

/** "Se están vendiendo 2 unidades por semana" (el Catálogo mira 14 días).
 *  null si no se vendió nada */
export function fraseRitmo(unidades: number, dias: number): string | null {
    const ritmo = ritmoSemanal(unidades, dias)
    if (ritmo === null) return null
    if (ritmo === 'menos de 1') return 'Se vende menos de 1 unidad por semana'
    if (ritmo === '1') return 'Se está vendiendo 1 unidad por semana'
    return `Se están vendiendo ${ritmo} unidades por semana`
}

export type NivelMedidor = 'sin-ventas' | 'corto' | 'justo' | 'bien'

/** El medidor: color, cuánto se llena la barra y dónde va la marca del respaldo */
export function medidor(dias: number | null, respaldo: number) {
    const sinVentas = dias === null
    const d = dias ?? 0
    const nivel: NivelMedidor = sinVentas ? 'sin-ventas'
        : d < respaldo ? 'corto'
            : d < respaldo * 2 ? 'justo'
                : 'bien'
    const relleno = Math.min(Math.max(d / HORIZONTE_MEDIDOR, 0), 1)
    const marca = Math.min(Math.max(respaldo / HORIZONTE_MEDIDOR, 0), 1)
    return {
        nivel,
        dias: d,
        relleno,
        marca,
        verMarca: !sinVentas && marca > 0 && marca < 1,
        menosDelRespaldo: !sinVentas && d < respaldo,
    }
}

/* ── Hay que reponer ────────────────────────────────────────── */

export interface ParaReponer {
    id: string
    kind: Clase
    productId: string
    title: string
    subtitle: string | null
    image: string | null
    stock: number
    /** Cuántas sugiere pedir */
    toOrder: number
    /** Lo que cuesta cada una */
    cost: number
}

/** "Compra N": lo que falta para llegar al doble del mínimo, y nunca menos
 *  de 1. Así, después de comprarlo, el producto sale de la lista. Con stock
 *  en negativo también cuenta lo que se debe, para que la compra lo saque. */
export function cuantoPedir(stock: number, minimo: number): number {
    return Math.max(Math.ceil(2 * (Number(minimo) || 0) - (Number(stock) || 0)), 1)
}

export function paraReponer(alertas: Alerta[]): ParaReponer[] {
    return alertas.map(alerta => ({
        id: alerta.id,
        kind: alerta.kind,
        productId: alerta.product_id,
        title: alerta.product_name,
        subtitle: alerta.variant_name,
        image: alerta.image_url,
        stock: Math.max(Number(alerta.stock) || 0, 0),
        toOrder: cuantoPedir(alerta.stock, alerta.min_stock),
        cost: Number(alerta.cost) || 0,
    }))
}

/** "Te costaría unos $X": todo el pedido, no solo lo que se ve */
export function costoDelPedido(items: ParaReponer[]): number {
    return items.reduce((sum, item) => sum + item.toOrder * item.cost, 0)
}

/** Las líneas que viajan a Nueva compra */
export function lineasDelPedido(items: ParaReponer[]): { productId: string; variantId: string | null; quantity: number }[] {
    return items.map(item => ({
        productId: item.productId,
        variantId: item.kind === 'presentacion' ? item.id : null,
        quantity: item.toOrder,
    }))
}

/* ── El mínimo y el estado ──────────────────────────────────── */

/** Lo que se vende en tus días de respaldo, y nunca menos de 1.
 *  Multiplica antes de dividir, igual que la base (toul_estado_stock):
 *  dividir primero deja restos como 31,000000000000004 y el mínimo
 *  saldría con 1 de más. */
export function minimoAutomatico(vendidas30: number, respaldo: number): number {
    return Math.max(Math.ceil((vendidas30 * respaldo) / 30), 1)
}

export type EstadoStock = 'agotado' | 'pocas' | 'bien'

export function estadoDelStock(stock: number, minimo: number): EstadoStock {
    return stock <= 0 ? 'agotado' : stock <= minimo ? 'pocas' : 'bien'
}

/** Un producto entero, por lo que dice cada presentación (toul_estado_stock):
 *  "agotado" solo si se agotaron todas; "pocas" si alguna está en su mínimo
 *  o agotada. null si no hay nada que contar */
export function estadoDelProducto(estados: EstadoStock[]): EstadoStock | null {
    if (estados.length === 0) return null
    if (estados.every(e => e === 'agotado')) return 'agotado'
    return estados.some(e => e !== 'bien') ? 'pocas' : 'bien'
}

export function vendidasEn30(items: { quantity: number }[]): number {
    return items.reduce((sum, item) => sum + Number(item.quantity), 0)
}

/* ── Productos con tallas ───────────────────────────────────── */

/** Con tallas, el stock es la suma de las que se venden; sin tallas, el del producto */
export function stockDeProducto(presentaciones: { stock: number | null }[], stockProducto: number | null | undefined): number {
    return presentaciones.length > 0
        ? presentaciones.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
        : Number(stockProducto) || 0
}

/** Con tallas, el costo es el promedio de lo guardado en cada una */
export function costoDeProducto(presentaciones: { stock: number | null; cpp: number | null }[], cppProducto: number | null | undefined): number {
    if (presentaciones.length === 0) return Number(cppProducto) || 0
    const stock = stockDeProducto(presentaciones, 0)
    return stock > 0
        ? presentaciones.reduce((sum, v) => sum + (Number(v.stock) || 0) * (Number(v.cpp) || 0), 0) / stock
        : 0
}

/** "$X en bodega": lo que hay por lo que costó */
export function enBodega(stock: number, cpp: number | null | undefined): number {
    return Math.round(stock * (Number(cpp) || 0))
}

/* ── La lista de "Todo lo que tienes" ───────────────────────── */

export type Filtro = 'todo' | 'agotados' | 'pocos' | 'quietos'

export interface FilaInventario {
    key: string
    href: string
    image: string | null
    title: string
    subtitle: string
    subtitleTone: Tono
    stock: number
    /** Cuántas debería haber. Sin esto no se dibuja la barra de nivel. */
    target?: number
}

export const enlaceDeStock = (kind: Clase, id: string) =>
    kind === 'presentacion' ? `/inventory/variant/${id}` : `/inventory/${id}`

/** Lo que se escribe en el buscador, sin lo que rompe el filtro de la base
    (comas, paréntesis, comillas, barras y comodines) */
export function limpiarBusqueda(texto: string): string {
    return texto.replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "Producto · presentación" */
export const nombreCompleto = (producto: string, presentacion: string | null) =>
    presentacion ? `${producto} · ${presentacion}` : producto

/** La plata quieta de un producto quieto */
export const valorQuieto = (stock: number, costo: number) => Math.round(stock * costo)

/** Agotados, Por acabarse y Quietos. null en "Todo" o mientras carga */
export function filasDeFiltro(resumen: ResumenInventario | undefined, filtro: Filtro, busqueda: string, dinero: Dinero): FilaInventario[] | null {
    if (filtro === 'todo' || !resumen) return null
    const texto = busqueda.trim().toLowerCase()
    const coincide = (titulo: string, referencia?: string | null) =>
        !texto || titulo.toLowerCase().includes(texto) || (referencia ?? '').toLowerCase().includes(texto)

    if (filtro === 'quietos') {
        return resumen.dormant
            .filter(row => coincide(nombreCompleto(row.product_name, row.variant_name), row.reference))
            .map((row): FilaInventario => ({
                key: `q-${row.kind}-${row.id}`,
                href: enlaceDeStock(row.kind, row.id),
                image: row.image_url,
                title: nombreCompleto(row.product_name, row.variant_name),
                subtitle: `${textoQuieto(row.idle_days, row.never_sold)} · ${dinero(valorQuieto(row.stock, row.cost))} quietos`,
                subtitleTone: 'warn',
                stock: Math.max(Number(row.stock) || 0, 0),
                // Un producto quieto no tiene un nivel "correcto" contra
                // el cual medirse: el problema no es cuánto hay
            }))
    }

    return resumen.alerts
        .filter(alerta => filtro === 'agotados' ? alerta.stock <= 0 : alerta.stock > 0)
        .filter(alerta => coincide(nombreCompleto(alerta.product_name, alerta.variant_name), alerta.reference))
        .map((alerta): FilaInventario => ({
            key: `${alerta.kind}-${alerta.id}`,
            href: enlaceDeStock(alerta.kind, alerta.id),
            image: alerta.image_url,
            title: nombreCompleto(alerta.product_name, alerta.variant_name),
            subtitle: alerta.stock <= 0 ? 'se agotó' : `quedan ${alerta.stock}, deberías tener ${alerta.min_stock}`,
            subtitleTone: alerta.stock <= 0 ? 'error' : 'warn',
            stock: Math.max(Number(alerta.stock) || 0, 0),
            target: Math.max(Number(alerta.min_stock) || 0, 1),
        }))
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`

/** "lleva 61 días sin venderse" o, si nunca se vendió,
 *  "nunca se ha vendido · llegó hace 75 días" */
export function textoQuieto(diasQuieto: number, nuncaVendido: boolean): string {
    return nuncaVendido ? `nunca se ha vendido · llegó hace ${dias(diasQuieto)}` : `lleva ${dias(diasQuieto)} sin venderse`
}

export interface ProductoEstante {
    id: string
    name: string
    reference: string | null
    image_url: string | null
    images: string[] | null
    stock: number | null
    cpp: number | null
}

export interface PresentacionEstante {
    id: string
    product_id: string
    name: string
    stock: number | null
    cpp: number | null
}

/** Una fila de "Todo": un producto, con o sin tallas */
export function filaDeEstante(producto: ProductoEstante, presentaciones: PresentacionEstante[], dinero: Dinero) {
    const conTallas = presentaciones.length > 0
    const stock = stockDeProducto(presentaciones, producto.stock)
    const agotadas = presentaciones.filter(v => (Number(v.stock) || 0) <= 0).length
    const subtitle = conTallas
        ? agotadas > 0
            ? `${presentaciones.length} presentaciones · ${agotadas} sin existencias`
            : `${presentaciones.length} presentaciones`
        : `${dinero(enBodega(stock, producto.cpp))} en bodega`
    return {
        conTallas,
        stock,
        agotadas,
        subtitle,
        tone: (agotadas > 0 ? 'error' : 'dim') as Tono,
        image: (producto.images?.[0] as string | undefined) ?? producto.image_url,
    }
}

/** Una talla dentro de un producto abierto */
export function filaDePresentacion(presentacion: PresentacionEstante, dinero: Dinero) {
    const stock = Number(presentacion.stock) || 0
    return {
        stock,
        texto: stock <= 0 ? 'se agotó' : `${dinero(enBodega(stock, presentacion.cpp))} en bodega`,
    }
}

/** Las tallas de cada producto, en el orden en que llegaron */
export function presentacionesPorProducto<T extends { product_id: string }>(presentaciones: T[]): Map<string, T[]> {
    const mapa = new Map<string, T[]>()
    for (const v of presentaciones) {
        const lista = mapa.get(v.product_id)
        if (lista) lista.push(v); else mapa.set(v.product_id, [v])
    }
    return mapa
}

/* ── "Tus productos": la lista con la regla única ────────────── */

/** Una fila de toul_estado_stock: cada presentación y cada producto sin
 *  presentaciones, con su estado ya decidido por la base */
export interface UnidadDeStock {
    kind: Clase
    id: string
    product_id: string
    variant_id: string | null
    product_name: string
    variant_name: string | null
    reference: string | null
    image_url: string | null
    stock: number
    /** El costo promedio de cada una (cpp), el mismo de "Te cuesta" */
    cost?: number | null
    sold_30d: number
    estado: EstadoStock
}

/** Lo que la lista necesita del producto y la regla no trae */
export interface FichaDeProducto {
    id: string
    images: string[] | null
    image_url: string | null
    category_id: string | null
}

export interface UnidadEnLista {
    /** `${kind}-${id}`, la misma llave de Quietos */
    key: string
    id: string
    kind: Clase
    productId: string
    producto: string
    /** Solo la presentación ("100ml"), para dentro del producto abierto */
    presentacion: string | null
    /** "carneguey · 100ml" */
    nombre: string
    referencia: string | null
    imagen: string | null
    categoria: string | null
    stock: number
    vendidas30: number
    estado: EstadoStock
    href: string
    /** "Costo c/u": el costo promedio */
    costo: number
    /** "Plata en el producto": lo que hay por lo que costó (lo negativo no cuenta) */
    plata: number
}

export interface ProductoEnLista {
    id: string
    nombre: string
    referencia: string | null
    imagen: string | null
    categoria: string | null
    conPresentaciones: boolean
    unidades: UnidadEnLista[]
    stock: number
    vendidas30: number
    estado: EstadoStock
    /** El costo más bajo y el más alto de sus presentaciones (iguales si no tiene) */
    costoMin: number
    costoMax: number
    /** La plata de todas sus presentaciones */
    plata: number
}

export type Orden = 'nombre' | 'menos' | 'mas' | 'vendidos'
export type Mostrar = 'todos' | 'por-comprar' | 'quietos' | 'con-stock' | 'sin-stock'

export interface VistaDeLista {
    orden: Orden
    mostrar: Mostrar
    /** El id de la categoría; null es "Todas" */
    categoria: string | null
    busqueda: string
}

export type ResultadoDeLista =
    | { agrupada: true; productos: ProductoEnLista[] }
    | { agrupada: false; unidades: UnidadEnLista[] }

/** Los productos con sus presentaciones, cada uno con el estado que le da
 *  la regla única (estadoDelProducto) y su stock de siempre (stockDeProducto) */
export function armarLista(unidades: UnidadDeStock[], fichas: FichaDeProducto[]): ProductoEnLista[] {
    const ficha = new Map(fichas.map(f => [f.id, f]))
    const lista: ProductoEnLista[] = []
    for (const [productId, suyas] of presentacionesPorProducto(unidades)) {
        const f = ficha.get(productId)
        const imagen = (f?.images?.[0] as string | undefined) ?? f?.image_url ?? suyas[0].image_url
        const categoria = f?.category_id ?? null
        const conPresentaciones = suyas[0].kind === 'presentacion'
        const ordenadas = conPresentaciones
            ? [...suyas].sort((a, b) => (a.variant_name ?? '').localeCompare(b.variant_name ?? '', 'es'))
            : suyas
        const filas: UnidadEnLista[] = ordenadas.map(u => ({
            key: `${u.kind}-${u.id}`,
            id: u.id,
            kind: u.kind,
            productId,
            producto: u.product_name,
            presentacion: u.variant_name,
            nombre: nombreCompleto(u.product_name, u.variant_name),
            referencia: u.reference,
            imagen,
            categoria,
            stock: Number(u.stock) || 0,
            vendidas30: Number(u.sold_30d) || 0,
            estado: u.estado,
            href: enlaceDeStock(u.kind, u.id),
            costo: Number(u.cost) || 0,
            plata: plataEnProducto([{ stock: u.stock, cpp: u.cost ?? null }]),
        }))
        const costos = filas.map(u => u.costo)
        lista.push({
            id: productId,
            nombre: suyas[0].product_name,
            referencia: suyas[0].reference,
            imagen,
            categoria,
            conPresentaciones,
            unidades: filas,
            stock: stockDeProducto(conPresentaciones ? filas : [], filas[0].stock),
            vendidas30: filas.reduce((sum, u) => sum + u.vendidas30, 0),
            estado: estadoDelProducto(filas.map(u => u.estado)) ?? 'bien',
            costoMin: Math.min(...costos),
            costoMax: Math.max(...costos),
            plata: plataEnProducto(ordenadas.map(u => ({ stock: u.stock, cpp: u.cost ?? null }))),
        })
    }
    return lista
}

/** "Costo c/u" de un producto: "$60.000" o, si sus presentaciones cuestan
 *  distinto, "$60.000 – $85.000" */
export function textoCosto(minimo: number, maximo: number, dinero: Dinero): string {
    return Math.round(minimo) === Math.round(maximo) ? dinero(minimo) : `${dinero(minimo)} – ${dinero(maximo)}`
}

/** Lo que está en "Quietos" (toul_inventory_overview), con la llave de la lista */
export const llavesQuietas = (quietos: { kind: Clase; id: string }[]) =>
    new Set(quietos.map(q => `${q.kind}-${q.id}`))

/** Busca por nombre, presentación o referencia ("XL", "carneguey 100") */
export function coincideUnidad(unidad: UnidadEnLista, busqueda: string): boolean {
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return `${unidad.producto} ${unidad.presentacion ?? ''}`.toLowerCase().includes(q)
        || unidad.nombre.toLowerCase().includes(q)
        || (unidad.referencia ?? '').toLowerCase().includes(q)
}

export function pasaMostrar(unidad: UnidadEnLista, mostrar: Mostrar, quietos: ReadonlySet<string>): boolean {
    switch (mostrar) {
        case 'por-comprar': return unidad.estado !== 'bien'
        case 'quietos': return quietos.has(unidad.key)
        case 'con-stock': return unidad.stock > 0
        case 'sin-stock': return unidad.stock <= 0
        default: return true
    }
}

/** Nombre (A–Z), menos o más unidades, o más vendidos; los empates por nombre */
export function ordenarPor<T extends { nombre: string; stock: number; vendidas30: number }>(filas: T[], orden: Orden): T[] {
    const az = (a: T, b: T) => a.nombre.localeCompare(b.nombre, 'es')
    const comparar: Record<Orden, (a: T, b: T) => number> = {
        nombre: az,
        menos: (a, b) => a.stock - b.stock || az(a, b),
        mas: (a, b) => b.stock - a.stock || az(a, b),
        vendidos: (a, b) => b.vendidas30 - a.vendidas30 || az(a, b),
    }
    return [...filas].sort(comparar[orden])
}

/** Sin filtro ni búsqueda, los productos con sus presentaciones adentro.
 *  Con filtro o búsqueda, cada presentación sale suelta ("carneguey · 100ml") */
export function verLista(productos: ProductoEnLista[], vista: VistaDeLista, quietos: ReadonlySet<string>): ResultadoDeLista {
    const enCategoria = (categoria: string | null) => vista.categoria === null || categoria === vista.categoria
    if (vista.mostrar === 'todos' && !vista.busqueda.trim()) {
        return { agrupada: true, productos: ordenarPor(productos.filter(p => enCategoria(p.categoria)), vista.orden) }
    }
    const unidades = productos.flatMap(p => p.unidades).filter(u =>
        enCategoria(u.categoria) && pasaMostrar(u, vista.mostrar, quietos) && coincideUnidad(u, vista.busqueda))
    return { agrupada: false, unidades: ordenarPor(unidades, vista.orden) }
}

export const cuantosEnLista = (resultado: ResultadoDeLista) =>
    resultado.agrupada ? resultado.productos.length : resultado.unidades.length

/** Cuántas cosas hay en cada opción de "Mostrar", en toda la bodega */
export function cuantosPorMostrar(productos: ProductoEnLista[], quietos: ReadonlySet<string>): Record<Mostrar, number> {
    const unidades = productos.flatMap(p => p.unidades)
    const contar = (mostrar: Mostrar) => unidades.filter(u => pasaMostrar(u, mostrar, quietos)).length
    return {
        'todos': unidades.length,
        'por-comprar': contar('por-comprar'),
        'quietos': contar('quietos'),
        'con-stock': contar('con-stock'),
        'sin-stock': contar('sin-stock'),
    }
}

/* ── El detalle de un producto ──────────────────────────────── */

/** Desde cuántos días está quieto algo para contarlo como "Quieto":
 *  el mismo de toul_inventory_overview (p_idle_days), que usa el filtro */
export const DIAS_QUIETO = 60

/** Días sin venderse, como los cuenta la base: desde la última venta y,
 *  si nunca se vendió, desde que llegó la mercancía. null si no hay fecha */
export function diasSinVenderse(ultimaVenta: string | null, llegada: string | null, ahora: number = Date.now()): number | null {
    const desde = ultimaVenta ?? llegada
    if (!desde) return null
    return Math.max(Math.floor((ahora - new Date(desde).getTime()) / 86400000), 0)
}

/** "Plata en este producto": lo que hay por lo que costó, como "Tienes en
 *  mercancía" (lo que está en negativo no cuenta). Con presentaciones, todas */
export function plataEnProducto(unidades: { stock: number | null; cpp: number | null }[]): number {
    return Math.round(unidades.reduce((sum, u) => sum + Math.max(Number(u.stock) || 0, 0) * (Number(u.cpp) || 0), 0))
}

/** Una cosa del detalle, con lo que dice la regla única (toul_estado_stock) */
export interface UnidadDelDetalle {
    productId: string
    variantId: string | null
    stock: number
    minimo: number
    estado: EstadoStock
    diasQuieto: number | null
}

export interface ResumenDelDetalle {
    estado: EstadoStock
    /** La línea debajo del número grande */
    linea: string
    /** Cuántas comprar: lo mismo que suma Compra sugerida para esto */
    comprar: number
    /** Lo que se lleva a Nueva compra con "Comprar N" */
    pedido: { productId: string; variantId: string | null; quantity: number }[]
}

/** El estado del detalle. Un producto sin presentaciones es una sola cosa;
 *  con presentaciones se juntan como en la lista: se acabó si se acabaron
 *  todas y quedan pocas si alguna llegó a su mínimo. Quieto, solo si todo
 *  lo que tiene existencias lleva DIAS_QUIETO o más sin venderse */
export function resumenDelDetalle(unidades: UnidadDelDetalle[]): ResumenDelDetalle | null {
    const estado = estadoDelProducto(unidades.map(u => u.estado))
    if (!estado) return null
    const pedido = unidades
        .filter(u => u.estado !== 'bien')
        .map(u => ({ productId: u.productId, variantId: u.variantId, quantity: cuantoPedir(u.stock, u.minimo) }))
    const comprar = pedido.reduce((sum, linea) => sum + linea.quantity, 0)

    if (estado === 'agotado') return { estado, linea: `Se acabó · compra ${comprar}`, comprar, pedido }
    if (estado === 'pocas') return { estado, linea: `Quedan pocas · compra ${comprar}`, comprar, pedido }

    const conStock = unidades.filter(u => u.stock > 0)
    const quietos = conStock.filter(u => u.diasQuieto !== null && u.diasQuieto >= DIAS_QUIETO)
    const linea = conStock.length > 0 && quietos.length === conStock.length
        ? `Lleva ${Math.min(...quietos.map(u => u.diasQuieto as number))} días sin venderse`
        : 'Bien de existencias'
    return { estado, linea, comprar, pedido }
}

/** "Te dura": "Ya se acabó", "unos 12 días" o "Sin ventas en 30 días" */
export function textoTeDura(stock: number, vendidas30: number): string {
    if (stock <= 0) return 'Ya se acabó'
    const dias = diasQueAguanta(stock, vendidas30)
    if (dias === null) return 'Sin ventas en 30 días'
    if (dias === 0) return 'menos de un día'
    return dias === 1 ? '1 día' : `unos ${dias} días`
}

/* ── Hace N días ────────────────────────────────────────────── */

/** Días completos de 24 horas desde ese momento, con el reloj del equipo */
export function diasDesde(iso: string, ahora: number = Date.now()): number {
    return Math.floor((ahora - new Date(iso).getTime()) / DIA)
}

/** El botón "Contar": undefined mientras carga (o si nunca se ha terminado un conteo) */
export function textoContar(ultimoConteo: string | null | undefined, ahora: number = Date.now()): string {
    if (ultimoConteo === undefined) return 'Contar'
    if (!ultimoConteo) return 'Contar · nunca'
    const dias = diasDesde(ultimoConteo, ahora)
    return `Contar · hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

/* ── Nueva compra ───────────────────────────────────────────── */

export type OrdenCompra = 'A-Z' | 'Stock' | 'Recientes'
export type FormaDePago = 'cash' | 'credit'

/** La lista para elegir productos: ordenada y buscada por nombre o referencia */
export function productosParaElegir<T extends { name: string; reference: string | null; stock: number; created_at: string }>(
    productos: T[], orden: OrdenCompra, busqueda: string,
): T[] {
    const q = busqueda.toLowerCase()
    return [...productos]
        .sort((a, b) => {
            if (orden === 'A-Z') return a.name.localeCompare(b.name)
            if (orden === 'Stock') return a.stock - b.stock
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        .filter(p => busqueda === '' ? true : (
            p.name.toLowerCase().includes(q) ||
            !!(p.reference && p.reference.toLowerCase().includes(q))
        ))
}

/** El costo con el que arranca una línea: el promedio de hoy */
export function costoSugerido(
    producto: { cpp: number | null; cost_price?: number | null },
    presentacion: { cpp: number | null } | null | undefined,
    esPresentacion: boolean,
): number | null {
    return esPresentacion
        ? (presentacion?.cpp ?? producto.cpp)
        : (producto.cpp || producto.cost_price || 0)
}

export interface LineaCompra<P> {
    itemKey: string          // `${productId}:${variantId ?? ''}`
    product: P
    variantId?: string
    variantName?: string
    quantity: string
    cost: string
}

export const llaveDeLinea = (productId: string, variantId?: string | null) => `${productId}:${variantId ?? ''}`

/** El pedido armado en Inventario, convertido en líneas de la compra.
 *  Lo que ya no se vende se salta */
export function lineasDeUnPedido<P extends { id: string; cpp: number | null; cost_price?: number | null }>(
    pedido: { productId: string; variantId: string | null; quantity: number }[],
    productos: P[],
    presentaciones: { id: string; name: string; cpp: number | null }[],
): LineaCompra<P>[] {
    const porProducto = new Map(productos.map(p => [p.id, p]))
    const porPresentacion = new Map(presentaciones.map(v => [v.id, v]))
    const lineas: LineaCompra<P>[] = []
    for (const linea of pedido) {
        const product = porProducto.get(linea.productId)
        if (!product) continue
        const variant = linea.variantId ? porPresentacion.get(linea.variantId) : null
        if (linea.variantId && !variant) continue
        lineas.push({
            itemKey: llaveDeLinea(product.id, linea.variantId),
            product,
            variantId: variant?.id,
            variantName: variant?.name,
            quantity: String(Math.max(Math.round(linea.quantity), 1)),
            cost: String(costoSugerido(product, variant, !!variant)),
        })
    }
    return lineas
}

/** La compra que se dejó a medias, de vuelta en líneas: cantidades y costos
 *  quedan como el dueño los escribió (aunque estén a medio escribir).
 *  Lo que ya no se vende se salta, igual que en el pedido */
export function lineasDeUnBorrador<P extends { id: string; cpp: number | null; cost_price?: number | null }>(
    borrador: { productId: string; variantId: string | null; quantity: string; cost: string }[],
    productos: P[],
    presentaciones: { id: string; name: string; cpp: number | null }[],
): LineaCompra<P>[] {
    const escrito = new Map(borrador.map(l => [llaveDeLinea(l.productId, l.variantId), l]))
    return lineasDeUnPedido(
        borrador.map(l => ({ productId: l.productId, variantId: l.variantId, quantity: 1 })),
        productos, presentaciones,
    ).map(linea => {
        const suyo = escrito.get(linea.itemKey)
        return suyo ? { ...linea, quantity: String(suyo.quantity), cost: String(suyo.cost) } : linea
    })
}

/** Una cantidad de compra: entera y de 1 en adelante */
export function cantidadValida(cantidad: string): boolean {
    return /^\d+$/.test(cantidad.trim()) && Number(cantidad) >= 1
}

/** Lo que se puede escribir en una cantidad: dígitos, sin ceros adelante.
    El punto o la coma se dejan a la vista (y la cantidad queda inválida):
    si se borraran, "2.5" se volvería 25 sin que nadie lo note */
export function soloCantidad(texto: string): string {
    return texto.replace(/[^\d.,]/g, '').replace(/^0+(?=\d)/, '').slice(0, 7)
}

/** Las líneas que van con costo $0 (hay que avisar antes de guardar) */
export function lineasEnCero<T extends { cost: string }>(lineas: T[]): T[] {
    return lineas.filter(l => (Number(l.cost) || 0) === 0)
}

/** Cantidad por costo de cada línea, sumado */
export function totalDeCompra(lineas: { quantity: string; cost: string }[]): number {
    return lineas.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.cost)), 0)
}

/** Cuánto se paga hoy y si falta algo para poder guardar */
export function pagoDeCompra(forma: FormaDePago, abono: number, total: number, cuenta: string | null) {
    // Abonar más de lo que vale la compra deja un saldo negativo en
    // pantalla y el servidor lo rechaza con un error crudo
    const abonoDemasiado = forma === 'credit' && abono > total
    // Lo que se paga hoy tiene que decir de dónde salió
    const pagado = forma === 'credit' ? Math.round(abono) : Math.round(total)
    return { abonoDemasiado, pagado, faltaCuenta: pagado > 0 && !cuenta }
}

/** Lo que queda debiendo después del abono */
export const saldoPendiente = (total: number, abono: number) => Math.max(0, total - abono)

/* ── Historial de compras ───────────────────────────────────── */

// Los periodos del historial son los de Reportes (lib/periodos)
export type FiltroCompras = 'todas' | 'contado' | 'credito' | 'debiendo'

export function unidadesDeCompra(items: { quantity: number }[] | null | undefined): number {
    return (items ?? []).reduce((sum, item) => sum + Number(item.quantity), 0)
}

export interface CompraEnLista {
    id: string
    providers: { name: string } | null
    purchase_items: { quantity: number; products: { name: string } | null }[]
}

/** "Sin pagar" y la búsqueda corren sobre lo ya cargado */
export function filtrarCompras<T extends CompraEnLista>(
    compras: T[] | undefined,
    filtro: FiltroCompras,
    deudas: Map<string, { falta: number }> | undefined,
    busqueda: string,
): T[] {
    const filas = compras ?? []
    const conDeuda = filtro === 'debiendo'
        ? filas.filter(c => (deudas?.get(c.id)?.falta ?? 0) > 0)
        : filas
    if (!busqueda.trim()) return conDeuda
    const t = busqueda.toLowerCase()
    return conDeuda.filter(c =>
        (c.providers?.name ?? '').toLowerCase().includes(t) ||
        (c.purchase_items ?? []).some(i => (i.products?.name ?? '').toLowerCase().includes(t)))
}

/* ── Conteo ─────────────────────────────────────────────────── */

export interface FilaConteo {
    key: string
    productId: string
    variantId: string | null
    name: string
    reference: string | null
    expected: number
    cost: number
}

export const llaveDeConteo = (productId: string, variantId: string | null) =>
    variantId ? `${productId}:${variantId}` : productId

/** El stock de cada talla, sumando sus movimientos */
export function stockPorPresentacion(ajustes: { variant_id: string | null; quantity: number }[]): Record<string, number> {
    const stock: Record<string, number> = {}
    for (const adj of ajustes) {
        if (adj.variant_id) stock[adj.variant_id] = (stock[adj.variant_id] ?? 0) + Number(adj.quantity)
    }
    return stock
}

/** Una casilla por talla y una por producto sin tallas */
export function filasDelConteo(
    productos: { id: string; name: string; reference: string | null; stock: number | null; cpp: number | null }[],
    presentaciones: { id: string; product_id: string; name: string; cpp: number | null }[],
    stockPorTalla: Record<string, number>,
): FilaConteo[] {
    const porProducto: Record<string, { id: string; name: string; cpp: number | null }[]> = {}
    for (const v of presentaciones) (porProducto[v.product_id] ??= []).push(v)

    const filas: FilaConteo[] = []
    for (const p of productos) {
        const tallas = porProducto[p.id]
        if (tallas?.length) {
            for (const v of tallas) {
                filas.push({
                    key: llaveDeConteo(p.id, v.id), productId: p.id, variantId: v.id,
                    name: `${p.name} · ${v.name}`, reference: p.reference,
                    expected: Math.max(0, stockPorTalla[v.id] ?? 0), cost: Number(v.cpp) || 0,
                })
            }
        } else {
            filas.push({
                key: llaveDeConteo(p.id, null), productId: p.id, variantId: null, name: p.name, reference: p.reference,
                expected: Number(p.stock) || 0, cost: Number(p.cpp) || 0,
            })
        }
    }
    return filas
}

/** Lo que ya se había contado: el valor de cada casilla y el renglón guardado */
export function yaContado(items: { id: string; product_id: string; variant_id: string | null; counted_qty: number }[]) {
    const valores: Record<string, string> = {}
    const ids: Record<string, string> = {}
    for (const item of items) {
        const key = llaveDeConteo(item.product_id, item.variant_id)
        valores[key] = String(Math.round(Number(item.counted_qty)))
        ids[key] = item.id
    }
    return { valores, ids }
}

/** Lo que decía el sistema cuando se contó cada renglón (los de antes de
 *  guardarlo en la base no lo tienen: se comparan con el stock de ahora) */
export function fotosDelConteo(items: { product_id: string; variant_id: string | null; expected_qty?: number | null }[]): Record<string, number> {
    const fotos: Record<string, number> = {}
    for (const item of items) {
        if (item.expected_qty === null || item.expected_qty === undefined) continue
        fotos[llaveDeConteo(item.product_id, item.variant_id)] = Math.round(Number(item.expected_qty))
    }
    return fotos
}

export function buscarEnConteo(filas: FilaConteo[], busqueda: string): FilaConteo[] {
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(r => r.name.toLowerCase().includes(q) || r.reference?.toLowerCase().includes(q))
}

export const cuantosContados = (valores: Record<string, string>) =>
    Object.values(valores).filter(v => v !== '').length

/** Solo lo que no cuadró, de la diferencia más grande a la más chica */
export function diferenciasDelConteo<T extends { difference: number | null }>(items: T[]): T[] {
    return items
        .filter(i => Number(i.difference ?? 0) !== 0)
        .sort((a, b) => Math.abs(Number(b.difference)) - Math.abs(Number(a.difference)))
}
