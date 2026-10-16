'use client'

/* ══════════════════════════════════════════════════════════════
   La foto de un producto.
   Cuando no hay foto, un cuadro blanco vacío grita "falta algo".
   La inicial del producto no: se ve puesta a propósito.
   ══════════════════════════════════════════════════════════════ */

export function Thumb({ src, name, size = 36, radius }: {
    src?: string | null
    name?: string | null
    size?: number
    radius?: number
}) {
    const letra = (name ?? '').trim().charAt(0).toUpperCase()
    const r = radius ?? Math.round(size * 0.3)

    return (
        <span
            aria-hidden
            style={{
                width: size, height: size, borderRadius: r, flexShrink: 0,
                overflow: 'hidden', position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(155deg, rgba(255,255,255,0.075), rgba(255,255,255,0.02))',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.045)',
            }}>
            {src ? (
                <img src={src} alt="" loading="lazy"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <span style={{
                    fontSize: Math.max(11, Math.round(size * 0.38)),
                    fontWeight: 600,
                    letterSpacing: '-0.02em',
                    color: 'var(--toul-text-faint)',
                    lineHeight: 1,
                }}>
                    {letra || '·'}
                </span>
            )}
        </span>
    )
}
