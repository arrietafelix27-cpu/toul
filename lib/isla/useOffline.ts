'use client'

import { useCallback, useEffect, useState } from 'react'
import { listPendingSales, syncPendingSales, type PendingSale } from './offline'

export interface OfflineState {
    online: boolean
    pending: PendingSale[]
    pendingCount: number
    failedCount: number
    syncing: boolean
    sync: (includeFailed?: boolean) => Promise<void>
    refresh: () => void
}

/** Estado de conexión y ventas guardadas esperando ser enviadas. */
export function useOfflineSales(): OfflineState {
    const [online, setOnline] = useState(true)
    const [pending, setPending] = useState<PendingSale[]>([])
    const [syncing, setSyncing] = useState(false)

    const refresh = useCallback(() => setPending(listPendingSales()), [])

    const sync = useCallback(async (includeFailed = false) => {
        if (!navigator.onLine) return
        setSyncing(true)
        try {
            await syncPendingSales(includeFailed)
        } finally {
            setSyncing(false)
            refresh()
        }
    }, [refresh])

    useEffect(() => {
        setOnline(navigator.onLine)
        refresh()

        const goOnline = () => { setOnline(true); void sync() }
        const goOffline = () => setOnline(false)
        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)

        // Reintento periódico por si el navegador no avisa del cambio de red
        const timer = setInterval(() => {
            if (navigator.onLine && listPendingSales().some(s => s.status === 'pending')) void sync()
            else refresh()
        }, 20_000)

        void sync()
        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
            clearInterval(timer)
        }
    }, [sync, refresh])

    return {
        online,
        pending,
        pendingCount: pending.filter(s => s.status === 'pending').length,
        failedCount: pending.filter(s => s.status === 'failed').length,
        syncing,
        sync,
        refresh,
    }
}
