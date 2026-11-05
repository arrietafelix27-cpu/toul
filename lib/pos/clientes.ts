/* ══════════════════════════════════════════════════════════════
   Clientes en la caja: buscar por nombre o teléfono, y no crear
   dos veces a la misma persona.

   El teléfono es lo que identifica a alguien (la misma regla de
   toul_find_or_create_customer al fiar). Sin dependencias: lo usan
   la caja y el servidor, y se prueba con node --test.
   ══════════════════════════════════════════════════════════════ */

interface ClienteBuscable {
    name: string
    phone?: string | null
}

export const soloDigitos = (texto: string | null | undefined) => (texto ?? '').replace(/\D/g, '')

/** "Ána  María" y "ana maria" son lo mismo para buscar */
export const normalizar = (texto: string) =>
    texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Dos teléfonos son el mismo si tienen los mismos dígitos, con o sin el +57 */
export function mismoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = soloDigitos(a)
    const y = soloDigitos(b)
    if (x.length < 7 || y.length < 7) return false
    if (x === y) return true
    return x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10)
}

/** Lo que se escribió es un número de teléfono, no un nombre */
export function pareceTelefono(consulta: string): boolean {
    const q = consulta.trim()
    return /^[\d\s+()-]+$/.test(q) && soloDigitos(q).length >= 3
}

/** El cliente que ya tiene ese teléfono, si hay alguno */
export function clienteConTelefono<T extends ClienteBuscable>(clientes: T[], telefono: string | null | undefined): T | undefined {
    return clientes.find(c => mismoTelefono(c.phone, telefono))
}

/** Busca por nombre o por teléfono. Primero los que empiezan así. */
export function buscarClientes<T extends ClienteBuscable>(clientes: T[], consulta: string, limite = 50): T[] {
    const q = normalizar(consulta)
    if (!q) return []
    const digitos = soloDigitos(consulta)
    const porTelefono = digitos.length >= 3

    const puntaje = (c: T): number => {
        const nombre = normalizar(c.name)
        if (nombre.startsWith(q)) return 0
        if (nombre.split(' ').some(palabra => palabra.startsWith(q))) return 1
        if (nombre.includes(q)) return 2
        if (porTelefono && soloDigitos(c.phone).includes(digitos)) return 3
        return -1
    }

    return clientes
        .map(c => ({ c, p: puntaje(c) }))
        .filter(x => x.p >= 0)
        .sort((a, b) => a.p - b.p || a.c.name.localeCompare(b.c.name, 'es'))
        .slice(0, limite)
        .map(x => x.c)
}
