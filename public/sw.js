// TOUL — Service worker
// 1. Notificaciones de aprobaciones.
// 2. Que la caja abra y funcione aunque se caiga el internet.
//
// Antes guardaba una copia de TODO lo que la app pedía al servidor,
// sin saber de qué cuenta era —incluido el archivo de exportar con
// todas las ventas—, y esa copia sobrevivía al cerrar sesión. Ahora
// solo guarda lo que la caja necesita para vender sin señal, y la app
// la borra al cerrar sesión. Al subir esta versión, la copia vieja
// (v2) se borra sola.

const SHELL_CACHE = 'toul-shell-v2'
const DATA_CACHE = 'toul-data-v3'
const KEEP = [SHELL_CACHE, DATA_CACHE]

/** Lo único del servidor que vale la pena tener sin internet */
const SIN_INTERNET = ['/api/pos-data', '/api/payment-methods', '/api/customers']

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(['/caja']).catch(() => undefined))
            .then(() => self.skipWaiting())
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    )
})

// ─── Caché ────────────────────────────────────────────────────
async function networkFirst(request, cacheName, fallbackUrl) {
    const cache = await caches.open(cacheName)
    try {
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
    } catch (err) {
        const cached = await cache.match(request)
        if (cached) return cached
        if (fallbackUrl) {
            const shell = await cache.match(fallbackUrl)
            if (shell) return shell
        }
        throw err
    }
}

async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName)
    const cached = await cache.match(request)
    if (cached) return cached
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
}

self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return

    const url = new URL(request.url)
    if (url.origin !== self.location.origin) return
    // Las navegaciones internas de Next (?_rsc) no se guardan
    if (url.searchParams.has('_rsc')) return

    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, SHELL_CACHE, '/caja'))
        return
    }

    if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons/')) {
        event.respondWith(cacheFirst(request, SHELL_CACHE))
        return
    }

    // Catálogo, métodos de pago y clientes: última copia buena si no hay
    // señal. Todo lo demás —exportaciones incluidas— va directo al servidor
    // y no se guarda.
    if (SIN_INTERNET.includes(url.pathname)) {
        event.respondWith(networkFirst(request, DATA_CACHE))
    }
})

// ─── Notificaciones ───────────────────────────────────────────
self.addEventListener('push', (event) => {
    let data = { title: 'TOUL', body: 'Tienes una notificación', url: '/', tag: undefined }
    try {
        data = { ...data, ...event.data.json() }
    } catch {
        // payload vacío o texto plano
    }

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            tag: data.tag,
            renotify: Boolean(data.tag),
            requireInteraction: true,
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-96.png',
            data: { url: data.url },
        })
    )
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = (event.notification.data && event.notification.data.url) || '/'

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if ('focus' in client) {
                    client.navigate(url)
                    return client.focus()
                }
            }
            return self.clients.openWindow(url)
        })
    )
})
