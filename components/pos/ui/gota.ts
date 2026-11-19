/* ══════════════════════════════════════════════════════════════
   La gota: del "+" a la caja y de vuelta (diseno/pos/SPEC.md §3).

   La caja es otra página, así que la gota se dibuja encima de toda
   la app (fuera de React) y sobrevive al cambio de página:
   1. Crece desde el botón con los 6 lóbulos del prototipo.
   2. Solo cuando ya tapa toda la pantalla se cambia a la caja, así
      no se ve ningún salto debajo.
   3. Cuando la caja ya está pintada debajo, la gota se desvanece.
   Al cerrar es al revés: la gota tapa la caja, se vuelve a Inicio
   y se recoge en el "+".
   Con "reducir movimiento" es solo un fundido.
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
export const DURACION_GOTA = 640
/** Si la otra página tarda (primera carga del día), la gota no se queda pegada: se desvanece igual */
const MAXIMO_ESPERA = 900
const FUNDIDO = 180

type Gota = { raiz: HTMLDivElement; lobos: HTMLDivElement[]; tams: number[]; cx: number; cy: number; molde: Molde }

let activa = false
let ultimoOrigen: { rect: DOMRect; pc: boolean } | null = null
let avisoCaja: (() => void) | null = null
let avisoInicio: (() => void) | null = null

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
        const listo = esperar('caja')
        navegar()
        await listo
        // La caja ya está pintada debajo: la gota se desvanece y la caja queda
        await dosCuadros()
        g.raiz.dataset.sale = '1'
        await pausa(FUNDIDO + 40)
        g.raiz.remove()
    } finally {
        activa = false
    }
}

/** Busca el "+" visible en esta pantalla (en PC, "Nueva venta" de la barra lateral) */
function origenVisible(): { rect: DOMRect; pc: boolean } | null {
    for (const el of document.querySelectorAll<HTMLElement>('[data-gota-origen]')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return { rect: r, pc: el.dataset.gotaOrigen === 'pc' }
    }
    return null
}

/** Origen por si se entró a la caja sin pasar por el "+" (un enlace, recargar la página) */
function origenSupuesto(): { rect: DOMRect; pc: boolean } {
    const pc = window.matchMedia('(min-width: 768px)').matches
    const vw = window.innerWidth, vh = window.innerHeight
    return pc ? { rect: new DOMRect(12, 64, 216, 40), pc } : { rect: new DOMRect(vw / 2 - 28, vh - 70, 56, 56), pc }
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
        const g = crear(desde.rect, desde.pc)
        // Nace ya extendida e invisible; aparece encima de la caja
        g.raiz.dataset.fijo = '1'
        g.raiz.dataset.on = '1'
        g.raiz.dataset.sale = '1'
        document.body.appendChild(g.raiz)
        await dosCuadros()
        g.raiz.dataset.fijo = ''
        g.raiz.style.transition = 'opacity 120ms linear'
        g.raiz.dataset.sale = ''
        await pausa(130)

        const listo = esperar('inicio')
        navegar()
        await listo
        await dosCuadros()
        // Se recoge hacia el "+" donde esté ahora
        const destino = origenVisible()
        if (destino && destino.pc === desde.pc) ubicar(g, destino.rect)
        g.raiz.style.transition = ''
        g.raiz.dataset.on = ''
        await pausa(DURACION_GOTA + 40)
        g.raiz.remove()
    } finally {
        activa = false
    }
}

/** La caja ya pintó su contenido: la gota se puede ir */
export function avisarCajaLista() { avisoCaja?.(); avisoCaja = null }
/** Inicio (o la pantalla con el "+") ya está: la gota se puede recoger */
export function avisarInicioListo() { avisoInicio?.(); avisoInicio = null }
