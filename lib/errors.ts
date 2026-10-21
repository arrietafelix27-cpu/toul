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

        // Cuentas: entrar, registrarse, códigos y contraseñas.
        // Supabase los manda en inglés; aquí se dicen como los diría una persona
        case 'invalid_credentials':
            return 'Correo o contraseña incorrectos.'
        case 'email_not_confirmed':
            return 'Falta confirmar tu correo con el código que te enviamos.'
        case 'user_already_exists':
        case 'email_exists':
            return 'Ya hay una cuenta con este correo. Entra o recupera tu contraseña.'
        case 'weak_password':
            return 'Esa contraseña es muy fácil de adivinar. Usa al menos 8 caracteres y mezcla letras y números.'
        case 'same_password':
            return 'La contraseña nueva tiene que ser distinta a la que tienes.'
        case 'otp_expired':
            return 'El código no es correcto o ya venció. Revísalo o pide uno nuevo.'
        case 'over_email_send_rate_limit':
            return 'Ya te enviamos un código hace poco. Espera un minuto y vuelve a pedirlo.'
        case 'over_request_rate_limit':
            return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.'
        case 'email_address_invalid':
        case 'validation_failed':
            return 'Revisa que el correo esté bien escrito.'
        case 'email_address_not_authorized':
            return 'No pudimos enviar el correo a esa dirección. Escríbenos a hola@toul.app.'
        case 'signup_disabled':
            return 'Por ahora no se pueden crear cuentas nuevas.'
        case 'user_banned':
            return 'Esta cuenta está suspendida. Escríbenos a hola@toul.app.'
        case 'provider_disabled':
        case 'oauth_provider_not_supported':
            return 'Entrar con Google no está disponible por ahora. Usa tu correo.'
        case 'reauthentication_needed':
        case 'session_not_found':
        case 'session_expired':
        case 'refresh_token_not_found':
            return 'Tu sesión se venció. Vuelve a entrar.'
    }

    if (err.status === 429) return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.'

    if (err.status === 401 || raw.includes('unauthorized')) return 'Tu sesión se venció. Vuelve a entrar.'
    if (err.status === 403) return 'Tu cuenta no tiene permiso para hacer esto.'
    if (raw.includes('stock insuficiente')) return err.message || 'No hay suficiente stock.'
    if (raw.includes('duplicate key')) return 'Ya existe un registro con ese nombre. Usa otro.'
    if (raw.includes('timeout')) return 'El servidor tardó demasiado. Intenta de nuevo.'

    // Los mensajes propios de TOUL ya están escritos para el usuario
    if (err.message && /[áéíóúñ¿]|no se|debes|selecciona|escribe/i.test(err.message)) return err.message

    return fallback
}
