'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { UserX } from 'lucide-react'
import DesktopPOS from '@/components/pos/desktop/DesktopPOS'
import { POSFlowProvider } from '@/components/pos/POSFlowProvider'
import { POSModeProvider, type POSModeValue } from '@/components/pos/POSMode'
import { useCaja } from '@/components/isla/CajaContext'
import { OpenSessionCard } from '@/components/isla/OpenSessionCard'

export default function CajaPage() {
    const router = useRouter()
    const { ctx, session, sessionLoading, refreshSession, autoPrint } = useCaja()

    const mode = useMemo<POSModeValue>(() => ({
        mode: 'caja',
        role: ctx.role,
        autoPrint,
        cashSessionId: session?.id ?? null,
        sellerName: ctx.displayName,
        onViewHistory: () => router.push('/caja/ventas'),
    }), [ctx.role, autoPrint, session?.id, ctx.displayName, router])

    if (sessionLoading) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 24, height: 24, border: '2.5px solid var(--toul-border)', borderTopColor: 'var(--toul-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
        )
    }

    if (!session) {
        return <OpenSessionCard name={ctx.displayName} onOpened={() => refreshSession()} />
    }

    if (ctx.role === 'seller' && session.opened_by !== ctx.userId) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <div style={{ maxWidth: 420, textAlign: 'center' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--toul-warning-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                        <UserX size={24} style={{ color: 'var(--toul-warning)' }} />
                    </div>
                    <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: '0 0 8px' }}>
                        Hay un turno abierto por {session.opened_by_name || 'otra persona'}
                    </h1>
                    <p style={{ fontSize: 15, color: 'var(--toul-text-muted)', lineHeight: 1.5, margin: 0 }}>
                        Para vender necesitas tu propio turno. Pide a {session.opened_by_name || 'esa persona'} que cierre el suyo, o al administrador.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <POSModeProvider value={mode}>
            <POSFlowProvider enabled>
                <div style={{ height: '100%', background: 'var(--toul-pos-bg-main)' }}>
                    <DesktopPOS />
                </div>
            </POSFlowProvider>
        </POSModeProvider>
    )
}
