'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatCOP } from '@/lib/utils'
import { usePOS } from './POSContext'
import { POSFlowProvider, usePOSFlow } from './POSFlowProvider'
import { useSWRConfig } from 'swr'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import Step1Products from './mobile/Step1Products'
import Step2Payment from './mobile/Step2Payment'
import Step3Confirmation, { type SaleSnapshot } from './mobile/Step3Confirmation'
import DesktopPOS from './desktop/DesktopPOS'

/* ── Progress Pills ──────────────────────────────────────── */
function pillColor(pill: number, step: number): string {
    if (step >= 3) return 'var(--toul-primary)'
    if (pill < step) return 'var(--toul-pos-pill-done)'
    if (pill === step) return 'var(--toul-primary)'
    return 'var(--toul-pos-border)'
}

function ProgressBar({ step }: { step: number }) {
    return (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', padding: '10px 0 4px' }}>
            {[1, 2, 3].map(i => (
                <div key={i} style={{
                    width: 48, height: 4, borderRadius: 2,
                    background: pillColor(i, step),
                    transition: 'background 200ms ease',
                }} />
            ))}
        </div>
    )
}

/* ── Step Headers ────────────────────────────────────────── */
const HEADERS: Record<number, { title: (total: string) => string; subtitle: string }> = {
    1: { title: () => 'Nueva venta', subtitle: 'Selecciona productos' },
    2: { title: (t) => t, subtitle: 'Total a cobrar' },
    3: { title: () => '¡Venta lista!', subtitle: 'Inventario y caja actualizados' },
}

/* ── Inner Content ───────────────────────────────────────── */
function POSContent() {
    const { closePOS } = usePOS()
    const router = useRouter()
    const { cart, payment, data } = usePOSFlow()
    const { mutate: globalMutate } = useSWRConfig()

    const [step, setStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [saleSnap, setSaleSnap] = useState<SaleSnapshot | null>(null)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const handleSubmit = useCallback(async () => {
        if (submitting || cart.isEmpty) return
        setSubmitting(true)
        setSubmitError(null)

        const snapshot: SaleSnapshot = {
            items: [...cart.cartItems],
            discount: payment.discountAmount,
            total: payment.total,
            subtotal: cart.subtotal,
            payments: [...payment.paymentSplits],
            isCredit: payment.saleType === 'credito',
            customerName: payment.selectedCustomer?.name || payment.customerSearch || null,
        }

        const TIMEOUT_MS = 10000
        let timedOut = false

        const onSuccess = () => {
            setSubmitting(false)
            setSaleSnap(snapshot)
            setStep(3)
            setTimeout(() => {
                cart.clearCart()
                payment.resetPayment()
                // Filter-only mutate: revalidates without wiping cache.
                // Passing `undefined` as the data arg would clear prodData/methData/custData
                // and make usePOSData.isLoading flip to true, replacing Step3 with the spinner.
                globalMutate(() => true)
            }, 100)
        }

        try {
            const timeoutPromise = new Promise<{ success: false; timedOut: true }>(resolve =>
                setTimeout(() => { timedOut = true; resolve({ success: false, timedOut: true }) }, TIMEOUT_MS)
            )

            const result = await Promise.race([
                payment.submitSale({ cartItems: cart.cartItems, subtotal: cart.subtotal }),
                timeoutPromise,
            ])

            if (result.success) {
                onSuccess()
                return
            }

            // Result === { success: false }. Two cases:
            // (a) Genuine failure raised in submitSale (network error, server returned 5xx)
            // (b) Timeout fired — the request may have succeeded on the backend anyway
            if (timedOut) {
                // Re-check whether a matching sale was actually persisted in the last 30s
                try {
                    const recentRes = await fetch(`/api/sales/recent?total=${snapshot.total}&secondsAgo=30`, {
                        method: 'GET',
                    })
                    if (recentRes.ok) {
                        const recentData = await recentRes.json()
                        if (recentData?.sale) {
                            // Sale did persist — treat as success despite the timeout
                            onSuccess()
                            return
                        }
                    }
                } catch {
                    // Network error during recheck — fall through to error UI
                }
                setSubmitting(false)
                setSubmitError('La conexión tardó demasiado. Verifica el historial — si la venta aparece, ya fue registrada.')
                return
            }

            // Genuine failure
            setSubmitting(false)
            setSubmitError('No se pudo registrar la venta. Intenta de nuevo.')
        } catch (err: unknown) {
            setSubmitting(false)
            const message = err instanceof Error ? err.message : 'Error inesperado al procesar la venta.'
            setSubmitError(message)
        }
    }, [submitting, cart, payment, globalMutate])

    const handleOk = useCallback(() => {
        setSaleSnap(null)
        setStep(1)
        closePOS()
    }, [closePOS])

    const handleViewHistory = useCallback(() => {
        setSaleSnap(null)
        setStep(1)
        closePOS()
        router.push('/ventas')
    }, [closePOS, router])

    const headerInfo = HEADERS[step]
    const totalStr = formatCOP(payment.total)

    // Loading
    if (data.isLoading) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                    width: 24, height: 24, border: `2.5px solid var(--toul-pos-border)`,
                    borderTopColor: 'var(--toul-primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                }} />
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--toul-pos-bg-main)' }}>
            {/* Top bar */}
            <div style={{ padding: '0 16px', flexShrink: 0 }}>
                <ProgressBar step={step} />

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {step === 2 && (
                            <button
                                onClick={() => setStep(1)}
                                style={{ background: 'none', border: 'none', color: 'var(--toul-pos-text-sec)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 2, fontSize: 12 }}
                            >
                                <ChevronLeft size={16} /> volver
                            </button>
                        )}
                        <div>
                            <h1 style={{ fontSize: step === 2 ? 26 : 17, fontWeight: 800, color: 'var(--toul-pos-text-main)', margin: 0, letterSpacing: -0.3 }}>
                                {headerInfo.title(totalStr)}
                            </h1>
                            <p style={{ fontSize: 11, color: 'var(--toul-pos-text-sec)', margin: 0 }}>
                                {headerInfo.subtitle}
                            </p>
                        </div>
                    </div>
                    {step < 3 && (
                        <button
                            onClick={closePOS}
                            style={{ background: 'var(--toul-pos-bg-card)', border: `1px solid var(--toul-pos-border)`, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--toul-pos-text-sec)' }}
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* Step content with transitions */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ x: step > 1 ? 30 : -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: step > 1 ? -30 : 30, opacity: 0 }}
                        transition={{ duration: 0.13, ease: 'easeOut' }}
                        style={{ position: 'absolute', inset: 0, padding: '0 16px' }}
                    >
                        {step === 1 && <Step1Products onContinue={() => setStep(2)} />}
                        {step === 2 && <Step2Payment onBack={() => { setStep(1); setSubmitError(null) }} onConfirm={handleSubmit} submitting={submitting} error={submitError} onClearError={() => setSubmitError(null)} />}
                        {step === 3 && saleSnap && <Step3Confirmation sale={saleSnap} onNewSale={handleOk} onViewHistory={handleViewHistory} />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}

/* ── Drawer Shell ────────────────────────────────────────── */
export default function POSDrawer() {
    const { isOpen, closePOS } = usePOS()
    const isMobile = useIsMobile()

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        onClick={closePOS}
                        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
                    />
                    {/* Container — responsive */}
                    <motion.div
                        initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
                        animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
                        exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                        style={{
                            position: 'relative', zIndex: 105,
                            width: isMobile ? '100%' : '96%',
                            height: isMobile ? '96dvh' : '94dvh',
                            maxWidth: isMobile ? 500 : '100%',
                            background: 'var(--toul-pos-bg-main)',
                            borderRadius: isMobile ? '20px 20px 0 0' : 16,
                            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        }}
                    >
                        {/* Drag handle — mobile only */}
                        {isMobile && (
                            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--toul-pos-border)', margin: '8px auto 0', flexShrink: 0 }} />
                        )}

                        <POSFlowProvider enabled={isOpen}>
                            {isMobile ? <POSContent /> : <DesktopPOS />}
                        </POSFlowProvider>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    )
}
