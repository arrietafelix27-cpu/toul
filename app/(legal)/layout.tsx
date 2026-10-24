import Link from 'next/link'

/* ══════════════════════════════════════════════════════════════
   Marco de los documentos legales: términos y política de datos.
   Se abren sin cuenta (el middleware los deja pasar) y se leen
   como un documento: una sola columna, letra cómoda, sin adornos.
   ══════════════════════════════════════════════════════════════ */

const CSS = `
.lg-doc { color: var(--toul-text-muted); font-size: 15px; line-height: 1.7; }
.lg-doc h1 { font-size: 30px; line-height: 1.15; font-weight: 700; letter-spacing: -0.035em; color: var(--toul-text); margin: 0; }
.lg-doc h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.015em; color: var(--toul-text); margin: 40px 0 10px; }
.lg-doc p { margin: 0 0 12px; }
.lg-doc ul { margin: 0 0 12px; padding-left: 20px; }
.lg-doc li { margin: 0 0 6px; padding-left: 4px; }
.lg-doc li::marker { color: var(--toul-text-faint); }
.lg-doc strong { color: var(--toul-text); font-weight: 600; }
.lg-doc a { color: var(--toul-text); text-decoration: underline; text-decoration-color: var(--toul-border-2); text-underline-offset: 3px; }
.lg-meta { font-size: 13px; color: var(--toul-text-dim); margin: 10px 0 0; }
.lg-ficha { margin: 28px 0 0; padding: 16px 18px; border-radius: 14px; border: 1px solid var(--toul-border); background: var(--toul-surface-3); }
.lg-ficha p { margin: 0; font-size: 14px; }
.lg-pie a { color: var(--toul-text-muted); text-decoration: none; }
@media (hover: hover) and (pointer: fine) { .lg-doc a:hover, .lg-pie a:hover { text-decoration-color: var(--toul-text-muted); color: var(--toul-text); } }
`

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh" style={{ background: 'var(--toul-bg)' }}>
            <style>{CSS}</style>
            <div className="mx-auto px-5 md:px-8" style={{ maxWidth: 720 }}>
                <header className="flex items-center justify-between" style={{ padding: '22px 0' }}>
                    <Link href="/" className="flex items-center gap-2.5" style={{ textDecoration: 'none' }}>
                        <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--toul-accent)' }}>
                            <span style={{ color: '#000', fontWeight: 800, fontSize: 14 }}>T</span>
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)' }}>TOUL</span>
                    </Link>
                </header>

                <main className="lg-doc" style={{ padding: '32px 0 56px' }}>
                    {children}
                </main>

                <footer className="lg-pie flex flex-wrap gap-x-5 gap-y-2"
                    style={{ borderTop: '1px solid var(--toul-divider)', padding: '20px 0 40px', fontSize: 13 }}>
                    <Link href="/terminos">Términos de uso</Link>
                    <Link href="/privacidad">Política de datos</Link>
                    <a href="mailto:hola@toul.app">hola@toul.app</a>
                </footer>
            </div>
        </div>
    )
}
