/* ══════════════════════════════════════════════════════════════
   Texto y números como se escriben en el negocio.
   ══════════════════════════════════════════════════════════════ */

/**
 * Primera letra en mayúscula, el resto como lo escribió el dueño.
 * No se toca nada más: "100ml", "iPhone" o "REF-001" quedan igual.
 */
export function capitalizeFirst(text: string): string {
    const trimmed = text.trimStart()
    if (!trimmed) return text
    const leading = text.slice(0, text.length - trimmed.length)
    return leading + trimmed.charAt(0).toLocaleUpperCase('es-CO') + trimmed.slice(1)
}

/** Solo los dígitos: lo que se guarda y con lo que se hacen las cuentas. */
export function onlyDigits(text: string): string {
    return text.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

/**
 * Lo que se ve mientras escribe: 85250 → 85.250
 * En Colombia el separador de miles es el punto.
 */
export function withThousands(digits: string): string {
    if (!digits) return ''
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Lo que llega de la base puede traer decimales: 85250.00
 * Si se leyera tal cual, el campo mostraría 8.525.000.
 * Lo que el dueño escribe nunca tiene decimales, así que solo se
 * recorta cuando el texto es una cifra con uno o dos decimales.
 */
export function toMoneyDigits(value: string | number | null | undefined): string {
    const text = String(value ?? '').trim()
    if (!text) return ''
    const entero = /^\d+[.,]\d{1,2}$/.test(text) ? text.split(/[.,]/)[0] : text
    return onlyDigits(entero)
}
