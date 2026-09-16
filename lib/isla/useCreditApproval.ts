'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type CreditApprovalStatus = 'idle' | 'requesting' | 'pending' | 'approved' | 'rejected'

export interface CreditApprovalState {
    status: CreditApprovalStatus
    requestId: string | null
    message: string | null
    request: () => Promise<void>
    cancel: () => Promise<void>
    reset: () => void
}

interface Params {
    enabled: boolean
    total: number
    customerName: string
    dueDate: string
    initialPayment: number
    items: { name: string; quantity: number }[]
}

const supabase = createClient()

/**
 * Venta a crédito de un vendedor: pide aprobación al administrador y espera la respuesta.
 * Si el total cambia después de pedirla, la solicitud se cancela (el servidor también lo valida).
 */
export function useCreditApproval({ enabled, total, customerName, dueDate, initialPayment, items }: Params): CreditApprovalState {
    const [status, setStatus] = useState<CreditApprovalStatus>('idle')
    const [requestId, setRequestId] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const approvedTotal = useRef<number | null>(null)

    const reset = useCallback(() => {
        setStatus('idle')
        setRequestId(null)
        setMessage(null)
        approvedTotal.current = null
    }, [])

    const request = useCallback(async () => {
        setStatus('requesting')
        setMessage(null)
        try {
            const res = await fetch('/api/approvals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'credit_sale',
                    amount: total,
                    details: { customerName, dueDate, initialPayment, items },
                }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'No se pudo enviar la solicitud')
            approvedTotal.current = total
            setRequestId(data.id)
            setStatus('pending')
        } catch (err) {
            setStatus('idle')
            setMessage(err instanceof Error ? err.message : 'No se pudo enviar la solicitud')
        }
    }, [total, customerName, dueDate, initialPayment, items])

    const cancel = useCallback(async () => {
        if (requestId) await supabase.rpc('toul_cancel_approval', { p_request_id: requestId })
        reset()
    }, [requestId, reset])

    // Esperar respuesta del administrador
    useEffect(() => {
        if (status !== 'pending' || !requestId) return
        const timer = setInterval(async () => {
            const { data } = await supabase
                .from('approval_requests')
                .select('status, resolution_note, resolved_by_name')
                .eq('id', requestId)
                .single()
            if (!data) return
            if (data.status === 'approved') {
                setStatus('approved')
                setMessage(`Aprobado por ${data.resolved_by_name || 'el administrador'}`)
            } else if (data.status === 'rejected') {
                setStatus('rejected')
                setMessage(data.resolution_note ? `Rechazado: ${data.resolution_note}` : 'El administrador rechazó el crédito')
            } else if (data.status === 'expired' || data.status === 'cancelled') {
                reset()
                setMessage('La solicitud venció. Pide aprobación de nuevo.')
            }
        }, 3000)
        return () => clearInterval(timer)
    }, [status, requestId, reset])

    // Si cambia el total o se sale del modo crédito, la aprobación deja de servir
    useEffect(() => {
        if (!enabled && status !== 'idle') { void cancel(); return }
        if ((status === 'pending' || status === 'approved') && approvedTotal.current !== null && approvedTotal.current !== total) {
            void cancel().then(() => setMessage('El total cambió. Pide aprobación de nuevo.'))
        }
    }, [enabled, total, status, cancel])

    return { status, requestId, message, request, cancel, reset }
}
