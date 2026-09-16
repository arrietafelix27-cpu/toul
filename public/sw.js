// TOUL — Service worker
// Solo notificaciones push (sin caché offline para no mostrar datos viejos de caja).

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

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
