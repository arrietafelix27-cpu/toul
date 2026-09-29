'use client'
import { BottomNav, Sidebar } from '@/components/layout/BottomNav'
import { POSProvider } from '@/components/pos/POSContext'
import { AnimatePresence } from 'framer-motion'
import PageWrapper from '@/components/ui/PageWrapper'

function AppInner({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh" style={{ background: 'var(--toul-bg)' }}>
            <Sidebar />
            {/* Main content: padded left on desktop for sidebar */}
            <div className="md:ml-60 pb-20 md:pb-8">
                <AnimatePresence mode="wait">
                    <PageWrapper key={typeof window !== 'undefined' ? window.location.pathname : 'page'}>
                        {children}
                    </PageWrapper>
                </AnimatePresence>
            </div>
            {/* La venta vive en /caja — una sola caja para toda la app */}
            <BottomNav />
        </div>
    )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <POSProvider>
            <AppInner>{children}</AppInner>
        </POSProvider>
    )
}
