'use client'
import { BottomNav, Sidebar } from '@/components/layout/BottomNav'
import { POSProvider } from '@/components/pos/POSContext'
import { AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import PageWrapper from '@/components/ui/PageWrapper'

const POSDrawer = dynamic(() => import('@/components/pos/POSDrawer'), { ssr: false })

function AppInner({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh" style={{ background: 'var(--toul-bg)' }}>
            <Sidebar />
            {/* Main content: padded left on desktop for sidebar */}
            <div className="md:ml-60 pb-20 md:pb-8">
                <div className="max-w-4xl mx-auto">
                    <AnimatePresence mode="wait">
                        <PageWrapper key={typeof window !== 'undefined' ? window.location.pathname : 'page'}>
                            {children}
                        </PageWrapper>
                    </AnimatePresence>
                </div>
            </div>
            {/* Bottom nav handles mobile POS button */}
            <BottomNav />
            <POSDrawer />
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
