'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/monitoring/report'

/* La última red: si la app se cae entera, al menos el usuario ve algo
   que entiende y el error queda guardado para poder mirarlo después. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => { reportError(error, { tipo: 'pantalla', digest: error.digest }) }, [error])

    return (
        <html lang="es">
            <body style={{ margin: 0, background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
                <div style={{
                    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center',
                }}>
                    <p style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
                        Algo se rompió
                    </p>
                    <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.6)', margin: 0, maxWidth: 340, lineHeight: 1.55 }}>
                        No perdiste nada de lo que ya habías guardado. Vuelve a cargar y sigue trabajando.
                    </p>
                    <button onClick={reset}
                        style={{
                            marginTop: 6, height: 46, padding: '0 22px', borderRadius: 14, border: 'none',
                            background: '#4ADE80', color: '#000', fontFamily: 'inherit',
                            fontSize: 15, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Volver a cargar
                    </button>
                </div>
            </body>
        </html>
    )
}
