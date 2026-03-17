'use client'
import { usePOS } from '@/components/pos/POSContext'

function ShoppingBagCheckIcon() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            width="26" height="26" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
            <polyline points="9 14 11 16 15 12" />
        </svg>
    )
}

interface FABProps { onClick?: () => void }

export default function FAB({ onClick }: FABProps) {
    return (
        <div className="fixed bottom-20 right-5 z-50 md:hidden">
            <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'var(--toul-accent)', opacity: 0.2, animationDuration: '2.5s' }} />
            <button
                onClick={onClick}
                aria-label="Nueva venta"
                className="relative w-14 h-14 rounded-full text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95"
                style={{
                    background: 'var(--toul-accent)',
                    boxShadow: '0 8px 32px var(--toul-accent-glow)',
                }}>
                <ShoppingBagCheckIcon />
            </button>
        </div>
    )
}
