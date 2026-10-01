import { Store } from 'lucide-react'

/** Link equivocado o catálogo apagado — sin jerga ni códigos de error. */
export function StoreClosed() {
    return (
        <main style={{
            minHeight: '100dvh', background: 'var(--toul-bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 14, padding: 24, textAlign: 'center',
        }}>
            <div style={{
                width: 56, height: 56, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--toul-surface)', border: '1px solid var(--toul-border)',
            }}>
                <Store size={24} style={{ color: 'var(--toul-text-faint)' }} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>
                Este catálogo no está disponible
            </h1>
            <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', margin: 0, maxWidth: 330, lineHeight: 1.5 }}>
                El link puede estar mal escrito, o la tienda lo apagó por ahora.
            </p>
        </main>
    )
}
