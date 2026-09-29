/**
 * Mensajes de error que explican qué hacer.
 *
 * Antes casi todo decía "Error al guardar", que no le sirve a nadie.
 * Aquí se traducen los errores técnicos a algo accionable en español.
 */

interface ErrorLike {
    message?: string
    code?: string
    details?: string
    status?: number
}

export function explainError(error: unknown, fallback = 'No se pudo completar. Intenta de nuevo.'): string {
    if (!error) return fallback

    const err = (typeof error === 'object' ? error : {}) as ErrorLike
    const raw = (err.message || String(error) || '').toLowerCase()

    // Sin conexión
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return 'Sin internet. Revisa la conexión e intenta de nuevo.'
    }
    if (raw.includes('failed to fetch') || raw.includes('networkerror') || raw.includes('load failed')) {
        return 'No hubo respuesta del servidor. Revisa tu internet e intenta de nuevo.'
    }

    switch (err.code) {
        // Reglas de negocio de TOUL (ya vienen en español desde la base de datos)
        case 'P0001':
            return err.message || fallback
        case '23505':
            return 'Ya existe un registro con ese nombre. Usa otro.'
        case '23503':
            return 'No se puede: hay movimientos que dependen de esto.'
        case '23514':
            return 'Hay un dato inválido. Revisa las cantidades y los precios.'
        case '22P02':
            return 'Hay un dato con formato inválido. Revisa los números.'
        case '42501':
            return 'Tu cuenta no tiene permiso para hacer esto.'
        case 'PGRST301':
        case '401':
            return 'Tu sesión se venció. Vuelve a entrar.'
    }

    if (err.status === 401 || raw.includes('unauthorized')) return 'Tu sesión se venció. Vuelve a entrar.'
    if (err.status === 403) return 'Tu cuenta no tiene permiso para hacer esto.'
    if (raw.includes('stock insuficiente')) return err.message || 'No hay suficiente stock.'
    if (raw.includes('duplicate key')) return 'Ya existe un registro con ese nombre. Usa otro.'
    if (raw.includes('timeout')) return 'El servidor tardó demasiado. Intenta de nuevo.'

    // Los mensajes propios de TOUL ya están escritos para el usuario
    if (err.message && /[áéíóúñ¿]|no se|debes|selecciona|escribe/i.test(err.message)) return err.message

    return fallback
}
