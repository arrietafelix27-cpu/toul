import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { ErrorWatcher } from '@/components/ErrorWatcher'
import { AccountWatcher } from '@/components/AccountWatcher'
import { ActualizarVersion } from '@/components/ActualizarVersion'
import { MotionConfig } from 'framer-motion'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'TOUL — Sistema Operativo para Emprendedores',
  description: 'Controla tu negocio en tiempo real. Ventas, inventario, caja y gastos en una sola app.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TOUL',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} bg-slate-950 text-white antialiased`}>
        <ErrorWatcher />
        <AccountWatcher />
        <ActualizarVersion />
        {/* Si el celular tiene activado "reducir movimiento", las animaciones
            dejan de desplazar cosas y solo aparecen/desaparecen */}
        <MotionConfig reducedMotion="user">
          {children}
        </MotionConfig>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: 'var(--toul-surface)',
              color: 'var(--toul-text)',
              border: '1px solid var(--toul-border)',
              borderRadius: '12px',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: 'var(--toul-accent)', secondary: '#fff' } },
            error: { iconTheme: { primary: 'var(--toul-error)', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
