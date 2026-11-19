/* ══════════════════════════════════════════════════════════════
   La gota: del "+" a la caja y de vuelta (diseno/pos/SPEC.md §3).

   La caja es otra página, así que la gota se dibuja en <body> (fuera de
   React) y sobrevive al cambio de página:
   1. Crece desde el centro del botón con los 6 lóbulos del prototipo.
   2. Cuando ya tapa toda la pantalla se cambia a la caja (así no se ve
      ningún salto debajo).
   3. La caja, oscura, entra ENCIMA de la gota (opacidad 0 → 1, desde
      el 55 % de --d). La gota queda tapada debajo: la caja nunca se ve verde.
   Al cerrar es la misma película al revés: la caja se desvanece encima
   de la gota, debajo vuelve Inicio y cada lóbulo se recoge en el "+"
   con sus propios tiempos (--k, --w), con el filtro líquido puesto.
   Con "reducir movimiento" es solo un fundido.

   En PC no hay gota: la caja crece desde "Nueva venta" (0,92 → 1 y de
   transparente a visible, 350 ms) y al cerrar vuelve hacia el botón
   (280 ms). Usa la transición de vista del navegador: Inicio queda como
   foto debajo mientras la caja crece encima, sin ningún salto.
   ══════════════════════════════════════════════════════════════ */
import s from './pos.module.css'

/** [tamaño, escala inicial, x, y, k (duración), w (retraso)] en el lienzo del prototipo */
type Lobo = readonly [number, number, number, number, number, number]
type Molde = { ancho: number; alto: number; desvio: number; lobos: readonly Lobo[] }

const CELULAR: Molde = {
    ancho: 390, alto: 844, desvio: 14, lobos: [
        [1800, 0.032, 0, 0, 1, 0.06],
        [720, 0.08, -150, -430, 0.62, 0],
        [560, 0.1, 160, -260, 0.55, 0.04],
        [520, 0.11, -70, -660, 0.78, 0.08],
        [430, 0.135, 175, -610, 0.7, 0.12],
        [360, 0.16, -175, -120, 0.5, 0.02],
    ],
}
const PC: Molde = {
    ancho: 1440, alto: 900, desvio: 16, lobos: [
        [3200, 0.02, 0, 0, 1, 0.06],
        [1300, 0.05, 520, 260, 0.62, 0],
        [1000, 0.062, 260, 560, 0.55, 0.04],
        [1100, 0.056, 980, 380, 0.78, 0.08],
        [900, 0.07, 1200, 700, 0.7, 0.12],
        [700, 0.09, 120, 300, 0.5, 0.02],
    ],
}

/** Duración de la gota (--d del prototipo) */
export const DURACION_GOTA = 540
/** Si la otra página tarda (primera carga del día), la gota no se queda pegada */
const MAXIMO_ESPERA = 900
/** La caja entra encima de la gota en 180 ms, desde el 55 % de --d (como el prototipo) */
const ENTRA = 180
const ENTRA_DESDE = 0.55
/** La caja se desvanece encima de la gota en 120 ms al cerrar */
const SALE = 120
/**
 * Momento de la apertura en que la caja ya tapa todo (55 % de --d + 180 ms).
 * Lo que la gota hace después nunca se ve, así que el cierre es la película
 * al revés DESDE ese punto: sin rato verde quieto antes de recogerse.
 */
const ESPEJO = DURACION_GOTA * ENTRA_DESDE + ENTRA
/** La curva de la apertura, al revés (espejo de cubic-bezier(.23,1,.32,1)) */
const CURVA_ESPEJO = 'cubic-bezier(.68, 0, .77, 0)'

/** PC: el zoom desde "Nueva venta" */
const ZOOM_ENTRA = 350
const ZOOM_SALE = 280
const ZOOM_ESCALA = 0.92
const ZOOM_CURVA = 'cubic-bezier(.23, 1, .32, 1)'

type Gota = { raiz: HTMLDivElement; lobos: HTMLDivElement[]; tams: number[]; cx: number; cy: number; molde: Molde }

let activa = false
let ultimoOrigen: { rect: DOMRect; pc: boolean } | null = null
let avisoCaja: (() => void) | null = null
let avisoInicio: (() => void) | null = null
/** Hora en que empezó la gota, mientras la caja tiene que entrar encima de ella */
let entrada: number | null = null
/** Quien espera a que la gota se quite (la caja, para dejar su capa de encima) */
const alQuitarse = new Set<() => void>()

const quieto = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pausa = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
// Dos cuadros (para que el navegador pinte el estado inicial). Con la pestaña
// oculta los cuadros se frenan: el tiempo máximo evita quedarse esperando
const dosCuadros = () => new Promise<void>(r => {
    const t = setTimeout(r, 120)
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r() }))
})

/** Pone los lóbulos alrededor del centro del botón, a la escala de esta pantalla */
function ubicar(g: Gota, rect: DOMRect) {
    const { molde } = g
    const vw = window.innerWidth, vh = window.innerHeight
    const fx = vw / molde.ancho, fy = vh / molde.alto, fs = Math.max(fx, fy)
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
    molde.lobos.forEach(([tam, z, x, y, k, w], i) => {
        const el = g.lobos[i], t = tam * fs
        el.style.setProperty('--s', `${t}px`)
        el.style.setProperty('--z', String(z))
        el.style.setProperty('--x', `${x * fx}px`)
        el.style.setProperty('--y', `${y * fy}px`)
        el.style.setProperty('--k', String(k))
        el.style.setProperty('--w', String(w))
        el.style.left = `${cx - t / 2}px`
        el.style.top = `${cy - t / 2}px`
    })

    g.tams = molde.lobos.map(([tam]) => tam * fs)
    g.cx = cx
    g.cy = cy
}

/** ¿Cada esquina de la pantalla ya está debajo de algún lóbulo? Entonces no se ve nada debajo */
function tapaTodo(g: Gota) {
    const vw = window.innerWidth, vh = window.innerHeight
    const circulos = g.lobos.map((el, i) => {
        const m = new DOMMatrix(getComputedStyle(el).transform)
        return { x: g.cx + m.e, y: g.cy + m.f, r: (g.tams[i] / 2) * m.a }
    })
    return [[0, 0], [vw, 0], [0, vh], [vw, vh]].every(([x, y]) => circulos.some(c => Math.hypot(x - c.x, y - c.y) <= c.r))
}

function crear(rect: DOMRect, pc: boolean): Gota {
    const molde = pc ? PC : CELULAR
    const raiz = document.createElement('div')
    raiz.className = s.gota
    raiz.setAttribute('aria-hidden', 'true')
    raiz.style.setProperty('--d', `${DURACION_GOTA}ms`)
    const id = `toul-gota-${Date.now()}`
    // El filtro "goo": desenfoca y vuelve a cortar el borde, así los lóbulos se funden como líquido
    raiz.innerHTML = `<svg width="0" height="0" style="position:absolute"><filter id="${id}"><feGaussianBlur in="SourceGraphic" stdDeviation="${molde.desvio}" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10"/></filter></svg>`
    const capa = document.createElement('div')
    capa.className = s.lobos
    capa.style.filter = `url(#${id})`
    const lobos = molde.lobos.map(() => {
        const el = document.createElement('div')
        el.className = s.lobo
        capa.appendChild(el)
        return el
    })
    raiz.appendChild(capa)
    const g: Gota = { raiz, lobos, tams: [], cx: 0, cy: 0, molde }
    raiz.style.setProperty('--d', `${DURACION_GOTA}ms`)
    ubicar(g, rect)
    return g
}

/** Espera a que la otra página avise, sin quedarse pegada si no lo hace */
function esperar(cual: 'caja' | 'inicio') {
    const aviso = new Promise<void>(r => { if (cual === 'caja') avisoCaja = r; else avisoInicio = r })
    return Promise.race([aviso, pausa(MAXIMO_ESPERA)])
}

/** Fundido simple (reducir movimiento): el fondo tapa, se cambia de página y se destapa */
async function fundido(navegar: () => void, cual: 'caja' | 'inicio') {
    const raiz = document.createElement('div')
    raiz.className = s.gotaQuieta
    raiz.setAttribute('aria-hidden', 'true')
    document.body.appendChild(raiz)
    await dosCuadros()
    raiz.dataset.on = '1'
    await pausa(160)
    const listo = esperar(cual)
    navegar()
    await listo
    await dosCuadros()
    raiz.dataset.on = ''
    await pausa(200)
    raiz.remove()
}

/**
 * Abre la caja con la gota. `boton` es el "+" (o "Nueva venta" en PC).
 * `navegar` cambia a /caja; se llama solo cuando la gota ya tapa todo.
 */
export async function abrirCaja(boton: HTMLElement, navegar: () => void, pc = false) {
    if (activa) return
    activa = true
    const rect = boton.getBoundingClientRect()
    ultimoOrigen = { rect, pc }
    try {
        if (quieto()) { await fundido(navegar, 'caja'); return }
        if (pc) { await zoom(rect, navegar, 'caja'); return }

        const g = crear(rect, pc)
        document.body.appendChild(g.raiz)
        await dosCuadros()
        g.raiz.dataset.on = '1'
        const t0 = performance.now()

        // Cambia de página apenas la gota tapa las cuatro esquinas
        await new Promise<void>(r => {
            const vigilar = () => {
                if (tapaTodo(g) || performance.now() - t0 > DURACION_GOTA) { clearTimeout(tope); r() }
                else requestAnimationFrame(vigilar)
            }
            const tope = setTimeout(r, DURACION_GOTA + 60)
            requestAnimationFrame(vigilar)
        })
        // La caja entra encima de la gota (ver retrasoEntradaCaja)
        entrada = t0
        const listo = esperar('caja')
        navegar()
        await listo
        // Cuando la caja ya terminó de entrar, la gota (tapada) se quita
        await pausa(Math.max(0, DURACION_GOTA * ENTRA_DESDE - (performance.now() - t0)) + ENTRA + 30)
        // Primero se quita la gota y DESPUÉS la caja deja su capa de encima:
        // al revés, la gota se vería un instante sobre la caja
        g.raiz.remove()
    } finally {
        entrada = null
        activa = false
        alQuitarse.forEach(f => f())
    }
}

/** La caja se entera de cuándo la gota ya no está (devuelve cómo dejar de escuchar) */
export function alQuitarseGota(f: () => void) {
    alQuitarse.add(f)
    return () => { alQuitarse.delete(f) }
}

/**
 * Para la raíz de la caja al montarse: si viene con la gota, cuántos ms
 * esperar antes de entrar (para arrancar en el 55 % de --d). null = sin gota.
 */
export function retrasoEntradaCaja(): number | null {
    if (entrada == null || typeof performance === 'undefined') return null
    return Math.max(0, Math.round(DURACION_GOTA * ENTRA_DESDE - (performance.now() - entrada)))
}

/**
 * La raíz de la caja entra ENCIMA de la gota: capa de encima (z 95) y de
 * opacidad 0 a 1 en 180 ms, empezando en `desde` (performance.now). Si
 * `desde` ya pasó (la carga se cambió por la caja), sigue a mitad de camino.
 * Va directo en el elemento (no por clase) para no depender de que llegue
 * la hoja de estilos de la página nueva.
 */
export function entrarEncimaDeGota(el: HTMLElement, desde: number) {
    el.style.position = 'relative'
    el.style.zIndex = '95'
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTRA, delay: desde - performance.now(), easing: 'ease', fill: 'backwards' })
}

/** Ya no hay gota: la caja deja la capa de encima (para no tapar las hojas que se abren sobre ella) */
export function soltarCapaDeGota(el: HTMLElement) {
    el.style.zIndex = ''
    el.style.position = ''
}

/** Lo que mide la zona segura de abajo (la barra del iPhone) */
function seguroAbajo() {
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'
    document.body.appendChild(sonda)
    const h = sonda.getBoundingClientRect().height
    sonda.remove()
    return h
}

/**
 * Origen si se entró a la caja sin pasar por el "+" (un enlace, recargar):
 * donde está el botón en el menú (celular: centro de la barra de abajo;
 * PC: "Nueva venta" de la barra lateral)
 */
function origenSupuesto(): { rect: DOMRect; pc: boolean } {
    const pc = window.matchMedia('(min-width: 768px)').matches
    const vw = window.innerWidth, vh = window.innerHeight
    if (pc) return { rect: new DOMRect(12, 64, 216, 40), pc }
    // El "+" mide 56 y su centro queda 41 px arriba del borde de la barra
    const cy = vh - seguroAbajo() - 41
    return { rect: new DOMRect(vw / 2 - 28, cy - 28, 56, 56), pc }
}

/**
 * Cierra la caja: la gota tapa la caja, se vuelve a Inicio y se recoge
 * en el "+". `navegar` cambia de página.
 */
export async function cerrarCaja(navegar: () => void) {
    if (activa) return
    activa = true
    try {
        if (quieto()) { await fundido(navegar, 'inicio'); return }

        const desde = ultimoOrigen ?? origenSupuesto()
        if (desde.pc) { await zoom(desde.rect, navegar, 'inicio'); return }
        const g = crear(desde.rect, desde.pc)
        // La gota nace ya extendida, DEBAJO de la caja (no se ve todavía)
        g.raiz.dataset.fijo = '1'
        g.raiz.dataset.on = '1'
        document.body.appendChild(g.raiz)
        const caja = document.querySelector<HTMLElement>('[data-caja-raiz]')
        if (caja) { caja.style.position = 'relative'; caja.style.zIndex = '95' }
        await dosCuadros()
        // La película al revés desde ESPEJO: cada lóbulo deshace su camino con
        // su duración (k) y en el momento que le toca (w); el que en la apertura
        // seguía moviéndose arranca a mitad de camino (retraso negativo)
        const d = DURACION_GOTA
        const pelis = g.molde.lobos.map(([, z, , , k, w], i) => {
            const el = g.lobos[i]
            const x = el.style.getPropertyValue('--x'), y = el.style.getPropertyValue('--y')
            return el.animate([
                { transform: `translate(${x}, ${y}) scale(1)`, opacity: 1, offset: 0 },
                { opacity: 1, offset: 0.9 },
                { transform: `translate(0px, 0px) scale(${z})`, opacity: 0, offset: 1 },
            ], { duration: k * d, delay: ESPEJO - (w + k) * d, easing: CURVA_ESPEJO, fill: 'both' })
        })
        g.raiz.dataset.fijo = ''
        if (caja) { caja.style.transition = `opacity ${SALE}ms linear`; caja.style.opacity = '0' }
        await pausa(SALE + 10)
        navegar()
        // Hasta que el último lóbulo entra al "+"
        await Promise.race([Promise.all(pelis.map(p => p.finished)), pausa(ESPEJO + 200)]).catch(() => {})
        g.raiz.remove()
    } finally {
        activa = false
    }
}

type ConTransicion = Document & {
    startViewTransition?: (cb: () => Promise<void>) => { ready: Promise<void>; finished: Promise<void> }
}

/**
 * PC: la caja crece desde el botón (o vuelve hacia él al cerrar).
 * Con la transición de vista, la página que se va queda como foto y la
 * que llega se anima encima (o al revés al cerrar: la caja se encoge
 * encima de Inicio). Sin ella, se anima la caja directamente.
 */
async function zoom(rect: DOMRect, navegar: () => void, cual: 'caja' | 'inicio') {
    const entra = cual === 'caja'
    const origen = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`
    const chica = { transform: `scale(${ZOOM_ESCALA})`, opacity: 0, transformOrigin: origen }
    const grande = { transform: 'scale(1)', opacity: 1, transformOrigin: origen }
    const marcos = entra ? [chica, grande] : [grande, chica]
    const opciones: KeyframeAnimationOptions = { duration: entra ? ZOOM_ENTRA : ZOOM_SALE, easing: ZOOM_CURVA, fill: 'both' }
    const doc = document as ConTransicion

    if (!doc.startViewTransition) {
        const raizCaja = () => document.querySelector<HTMLElement>('[data-caja-raiz]')
        if (entra) {
            const listo = esperar('caja')
            navegar()
            await listo
            await raizCaja()?.animate(marcos, opciones).finished.catch(() => {})
        } else {
            await raizCaja()?.animate(marcos, opciones).finished.catch(() => {})
            navegar()
        }
        return
    }

    // Sin el fundido que trae el navegador ni su mezcla de colores: solo el zoom.
    // Al cerrar, la caja (la foto que se va) queda encima de Inicio
    const estilo = document.createElement('style')
    estilo.textContent = `::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}`
        + (entra ? '' : `::view-transition-old(root){z-index:1}`)
    document.head.appendChild(estilo)
    try {
        const t = doc.startViewTransition(async () => {
            const listo = esperar(cual)
            navegar()
            await listo
        })
        await t.ready
        document.documentElement.animate(marcos, { ...opciones, pseudoElement: entra ? '::view-transition-new(root)' : '::view-transition-old(root)' })
        await t.finished
    } catch {
        // Otra navegación la interrumpió: la página nueva ya está
    } finally {
        estilo.remove()
    }
}

/** La caja ya pintó su contenido: la gota se puede ir */
export function avisarCajaLista() { avisoCaja?.(); avisoCaja = null }
/** Inicio (o la pantalla con el "+") ya está: la gota se puede recoger */
export function avisarInicioListo() { avisoInicio?.(); avisoInicio = null }
