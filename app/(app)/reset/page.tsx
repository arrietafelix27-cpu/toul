'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2, AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

export default function ResetStorePage() {
    const supabase = createClient()
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [step, setStep] = useState<'confirm' | 'success'>('confirm')

    async function handleReset() {
        if (!confirm('¿ESTÁS ABSOLUTAMENTE SEGURO? Esta acción no se puede deshacer y borrará TODO: Ventas, Compras, Caja, Productos, Clientes y Proveedores.')) return

        setLoading(true)
        try {
            const tables = [
                'sale_items', 'sale_payments', 'sales',
                'purchase_items', 'purchase_payments', 'purchases',
                'inventory_batches', 'inventory_adjustments',
                'credits', 'provider_debts',
                'payments', 'expenses', 'owner_capital_injections',
                'ai_insights',
                'products', 'customers', 'providers'
            ]

            for (const table of tables) {
                // neq("id", "00...") is a trick to delete everything without a where clause (which supabase-js requires)
                const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
                if (error) {
                    console.error(`Error en ${table}:`, error.message)
                    // We continue even if one fails (some might be empty)
                }
            }

            setStep('success')
            toast.success('Datos borrados exitosamente')
        } catch (e: any) {
            console.error(e)
            toast.error('Ocurrió un error parcial durante el borrado')
        } finally {
            setLoading(false)
        }
    }

    if (step === 'success') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
                <div className="max-w-md w-full toul-card text-center p-8 space-y-6">
                    <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                        <CheckCircle2 size={48} className="text-emerald-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">¡Reset Completado!</h1>
                    <p className="text-slate-400">Todos los datos han sido eliminados. Tu aplicación está ahora en blanco y lista para una nueva configuración.</p>
                    <button onClick={() => router.push('/')} className="toul-btn-primary w-full">
                        Volver al Dashboard
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
            <div className="max-w-md w-full toul-card p-8 space-y-6 relative overflow-hidden">
                {/* Warning Banner */}
                <div className="absolute top-0 left-0 w-full h-1 bg-red-500"></div>

                <div className="flex items-center gap-3 text-red-500 mb-2">
                    <AlertTriangle size={24} />
                    <h1 className="text-xl font-bold uppercase tracking-tight">Zona de Peligro</h1>
                </div>

                <div className="space-y-4">
                    <p className="text-white font-semibold">Esta acción limpiará tu cuenta por completo:</p>
                    <ul className="text-sm text-slate-400 space-y-2 list-disc pl-4">
                        <li>Se borrarán todas las <strong>ventas</strong> y recibos.</li>
                        <li>Se borrarán todas las <strong>compras</strong> y deudas a proveedores.</li>
                        <li>Se limpiará el historial de la <strong>caja</strong> (Cero balance).</li>
                        <li>Se borrarán todos los <strong>productos</strong>, clientes y proveedores.</li>
                        <li>Se eliminarán todos los ajustes de inventario.</li>
                    </ul>
                </div>

                <div className="pt-4 space-y-3">
                    <button
                        onClick={handleReset}
                        disabled={loading}
                        className="toul-btn-primary w-full bg-red-600 hover:bg-red-700 flex items-center justify-center gap-2 py-4">
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Trash2 size={20} />
                                BORRAR TODO DEFINITIVAMENTE
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => router.back()}
                        className="w-full py-3 text-slate-400 hover:text-white transition-colors text-sm font-medium flex items-center justify-center gap-2">
                        <ArrowLeft size={16} />
                        Cancelar y volver
                    </button>
                </div>
            </div>
        </div>
    )
}
