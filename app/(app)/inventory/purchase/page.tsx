'use client'
import { useState, useCallback } from 'react'
import { onlyDigits, toMoneyDigits, withThousands } from '@/lib/format/text'
import { Thumb } from '@/components/ui/Thumb'
import { formatCOP } from '@/lib/utils'
import {
    ArrowLeft, Package, CreditCard, CheckCircle2, Navigation,
    Trash2, Plus, Search, Layers, ChevronRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { AddedMark } from '@/components/inventory/AddedMark'
import { fadeUp } from '@/lib/motion'
import { useIsMobile } from '@/lib/hooks/useIsMobile'
import { DesktopPurchase } from '@/components/inventory/DesktopPurchase'
import { Sheet } from '@/components/isla/Sheet'
import { CuentaChips } from '@/components/movimientos/CuentaChips'
import { useCompra } from '@/lib/inventory/useCompra'
import { cantidadValida, saldoPendiente, soloCantidad } from '@/lib/inventory/calculos'
import { ConfirmSheet } from '@/components/isla/ConfirmSheet'
import { SinInternet } from '@/components/ui/SinInternet'
import { diaColombia, formatoColombia, instanteDeDia } from '@/lib/periodos'

// ─── Page ────────────────────────────────────────────────────

export default function NewPurchaseFlow() {
    const router = useRouter()
    const compra = useCompra()
    const {
        loading, sinDatos, reintentar, productsToShow, variantsByProduct, providers,
        searchQuery, setSearchQuery, sortBy, setSortBy, expandedInPicker, toggleExpand,
        selectedItems, addItem, updateItem, removeItem,
        paymentMethod, setPaymentMethod, initialPayment, setInitialPayment,
        selectedProviderId, setSelectedProviderId, dueDate, setDueDate,
        cuenta, setCuenta, nombreCuenta,
        total, abono, pagado, abonoDemasiado, faltaCuenta, puedeVerResumen, cantidadesBien,
        saving, guardar, avisoCero, nombresEnCero, guardarIgual, cerrarAvisoCero,
    } = compra

    // Celular: la compra va en 3 pasos
    const [step, setStep] = useState<1 | 2 | 3>(1)
    // Celular: con productos ya agregados, la lista para agregar más se abre en una hoja
    const [pickerOpen, setPickerOpen] = useState(false)
    const cerrarPicker = useCallback(() => setPickerOpen(false), [])
    // "Revisar costos": vuelve al paso 1, donde están los costos
    const revisarCostos = useCallback(() => { cerrarAvisoCero(); setStep(1) }, [cerrarAvisoCero])
    const isMobile = useIsMobile()

    // Sin internet no se puede armar la compra: se dice, no se queda cargando
    if (sinDatos) return <SinInternet onRetry={reintentar} que="tus productos y proveedores" />

    if (!isMobile) {
        if (loading) return (
            <div className="px-8 pt-6 pb-8 max-w-6xl mx-auto animate-pulse space-y-6">
                <div className="h-8 w-48 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                <div className="grid gap-8" style={{ gridTemplateColumns: '1fr 380px' }}>
                    <div className="space-y-4">
                        <div className="h-12 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                        <div className="h-72 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                    </div>
                    <div className="h-80 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                </div>
            </div>
        )
        return <DesktopPurchase compra={compra} />
    }

    // Buscador + lista para agregar productos. Sin productos va en la
    // pantalla; con productos, en una hoja que se abre con "Agregar más"
    const picker = (
        <div className="space-y-4">
                            {/* Search and Sort */}
                            <div className="flex flex-col gap-3">
                                <div className="relative">
                                    <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--toul-text-dim)', pointerEvents: 'none' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto para agregar..."
                                        className="toul-input w-full"
                                        style={{ paddingLeft: 42 }}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                    <span className="text-xs font-semibold whitespace-nowrap pl-1" style={{ color: 'var(--toul-text-subtle)' }}>Ordenar por:</span>
                                    {(['A-Z', 'Stock', 'Recientes'] as const).map(opt => (
                                        <button key={opt}
                                            onClick={() => setSortBy(opt)}
                                            className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition"
                                            style={{
                                                background: sortBy === opt ? 'var(--toul-accent-dim)' : 'var(--toul-surface-2)',
                                                color: sortBy === opt ? 'var(--toul-accent)' : 'var(--toul-text-muted)',
                                            }}>
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Product List */}
                            <div className="toul-card overflow-hidden">
                                {productsToShow.map(product => {
                                    const productVariants = variantsByProduct[product.id]
                                    const hasVariants = productVariants && productVariants.length > 0
                                    const isExpanded = expandedInPicker.has(product.id)
                                    const added = !hasVariants && selectedItems.some(i => i.itemKey === `${product.id}:`)

                                    return (
                                        <div key={product.id} className="border-b last:border-0" style={{ borderColor: 'var(--toul-border)' }}>
                                            {/* Product row */}
                                            <button
                                                onClick={() => hasVariants ? toggleExpand(product.id) : (!added && addItem(product))}
                                                className="w-full p-3 text-left flex items-center gap-3 transition active:scale-[0.99]">
                                                <Thumb src={product.images?.[0] ?? product.image_url} name={product.name} size={40} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 mb-0.5">
                                                        <p className="text-sm font-bold truncate" style={{ color: 'var(--toul-text)' }}>{product.name}</p>
                                                        {hasVariants && (
                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                                                                style={{ background: 'rgba(50,215,75,0.12)', color: 'var(--toul-accent)' }}>
                                                                <Layers size={10} className="inline mr-0.5" />
                                                                {productVariants.length}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs flex gap-2" style={{ color: 'var(--toul-text-subtle)' }}>
                                                        <span>Stock: {product.stock}</span>
                                                        <span className="opacity-40">•</span>
                                                        <span>Costo: {formatCOP(product.cpp)}</span>
                                                    </p>
                                                </div>
                                                {hasVariants ? (
                                                    <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
                                                        <ChevronRight size={18} style={{ color: 'var(--toul-text-muted)' }} />
                                                    </motion.div>
                                                ) : (
                                                    <AddedMark added={added} size={18} />
                                                )}
                                            </button>

                                            {/* Variant sub-rows */}
                                            <AnimatePresence>
                                                {hasVariants && isExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.18 }}
                                                        className="overflow-hidden">
                                                        <div className="pb-1" style={{ background: 'var(--toul-bg)' }}>
                                                            {productVariants.map(v => {
                                                                const itemKey = `${product.id}:${v.id}`
                                                                const alreadyAdded = selectedItems.some(i => i.itemKey === itemKey)
                                                                return (
                                                                    <button key={v.id}
                                                                        onClick={() => !alreadyAdded && addItem(product, v.id, v.name)}
                                                                        disabled={alreadyAdded}
                                                                        className="w-full px-4 py-2.5 flex items-center gap-3 transition active:scale-[0.99]"
                                                                        style={{ opacity: alreadyAdded ? 0.6 : 1 }}>
                                                                        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'var(--toul-text-muted)' }} />
                                                                        <div className="flex-1 min-w-0 text-left">
                                                                            <p className="text-sm font-medium truncate" style={{ color: 'var(--toul-text)' }}>{v.name}</p>
                                                                            <p className="text-xs" style={{ color: 'var(--toul-text-subtle)' }}>Costo: {formatCOP(v.cpp)}</p>
                                                                        </div>
                                                                        <AddedMark added={alreadyAdded} size={16} />
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )
                                })}
                                {productsToShow.length === 0 && (
                                    <div className="p-8 flex flex-col items-center text-center">
                                        <Package size={32} className="mb-2 opacity-20" />
                                        <p className="text-sm font-semibold" style={{ color: 'var(--toul-text-muted)' }}>No hay resultados</p>
                                    </div>
                                )}
                            </div>
        </div>
    )

    return (
        <div className="px-4 md:px-8 pt-6 pb-28 max-w-2xl mx-auto" style={{ position: 'relative' }}>
            <div className="toul-ambient" />

            {/* Header */}
            <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 mb-6" style={{ position: 'relative' }}>
                <button onClick={() => step > 1 ? setStep(step - 1 as 1 | 2) : router.push('/inventory')}
                    className="flex items-center justify-center transition active:scale-90"
                    style={{
                        width: 36, height: 36, borderRadius: 12,
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.7)',
                        border: 'none',
                    }}>
                    <ArrowLeft size={17} strokeWidth={2} />
                </button>
                <div className="flex-1">
                    <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--toul-text-faint)', margin: '0 0 3px 0' }}>
                        Paso {step} de 3
                    </p>
                    <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0 }}>
                        {step === 1 ? 'Seleccionar productos' : step === 2 ? 'Pago y proveedor' : 'Resumen de compra'}
                    </h1>
                </div>
            </motion.div>

            {loading ? (
                <div className="animate-pulse space-y-4">
                    <div className="h-12 rounded-xl" style={{ background: 'var(--toul-surface-2)' }} />
                    <div className="h-32 rounded-2xl" style={{ background: 'var(--toul-surface-2)' }} />
                </div>
            ) : (
                <AnimatePresence mode="wait">

                    {/* ── STEP 1: SELECT ITEMS ─────────────────────────────── */}
                    {step === 1 && (
                        <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            {/* Sin productos todavía: la lista va directo en la pantalla,
                                sin cajita con scroll propio */}
                            {selectedItems.length === 0 && picker}

                            {/* Selected Items */}
                            {selectedItems.length > 0 && (
                                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--toul-text-faint)', margin: '0 0 10px' }}>
                                    En esta compra · {selectedItems.length}
                                </p>
                            )}
                            <div className="space-y-3">
                                {selectedItems.map(item => (
                                    <div key={item.itemKey} className="toul-card p-3">
                                        <div className="flex items-start justify-between gap-3 mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                                                    style={{ background: 'var(--toul-surface-2)' }}>
                                                    {(item.product.images?.[0] || item.product.image_url)
                                                        ? <img src={item.product.images?.[0] ?? item.product.image_url!} alt="" className="w-full h-full object-cover" />
                                                        : <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--toul-text-faint)' }}>
                                                            {item.product.name.trim().charAt(0).toUpperCase()}
                                                          </span>
                                                    }
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm leading-tight" style={{ color: 'var(--toul-text)' }}>{item.product.name}</p>
                                                    {item.variantName && (
                                                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--toul-accent)' }}>{item.variantName}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => removeItem(item.itemKey)} className="p-1 rounded-md" style={{ color: 'var(--toul-error)' }}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Cantidad</label>
                                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={item.quantity}
                                                    onChange={e => updateItem(item.itemKey, 'quantity', soloCantidad(e.target.value))}
                                                    aria-invalid={!cantidadValida(item.quantity)}
                                                    className="toul-input w-full py-1.5 min-h-[36px]"
                                                    style={cantidadValida(item.quantity) ? undefined : { borderColor: 'var(--toul-error)' }} />
                                            </div>
                                            <div>
                                                <label className="text-[10px] uppercase font-bold tracking-wider mb-1 block" style={{ color: 'var(--toul-text-subtle)' }}>Costo unitario</label>
                                                <input type="text" inputMode="numeric" value={withThousands(toMoneyDigits(item.cost))}
                                                    onChange={e => updateItem(item.itemKey, 'cost', onlyDigits(e.target.value))}
                                                    className="toul-input w-full py-1.5 min-h-[36px]" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {selectedItems.length > 0 && (
                                <button onClick={() => setPickerOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed font-semibold text-sm transition-transform active:scale-[0.98]"
                                    style={{ height: 52, color: 'var(--toul-accent)', borderColor: 'var(--toul-border-focused)', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    <Plus size={17} strokeWidth={2.4} /> Agregar más productos
                                </button>
                            )}
                        </motion.div>
                    )}

                    {/* ── STEP 2: PAYMENT & PROVIDER ───────────────────────── */}
                    {step === 2 && (
                        <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            <div className="space-y-3">
                                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>¿Cómo vas a pagar esta compra?</label>

                                <div className="space-y-2">
                                    {([
                                        { value: 'cash' as const, title: 'Ya la pagué', text: 'La compra queda saldada.', color: 'var(--toul-accent)', dim: 'var(--toul-accent-dim)' },
                                        { value: 'credit' as const, title: 'Queda debiendo', text: 'Genera una deuda con el proveedor.', color: 'var(--toul-warning)', dim: 'var(--toul-warning-dim)' },
                                    ]).map(option => {
                                        const active = paymentMethod === option.value
                                        return (
                                            <button key={option.value} onClick={() => setPaymentMethod(option.value)}
                                                className="w-full toul-card flex items-center justify-between"
                                                style={{
                                                    padding: 16, minHeight: 72, textAlign: 'left',
                                                    background: active ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
                                                    borderColor: active ? 'var(--toul-border-focused)' : 'var(--toul-border)',
                                                    transition: 'background var(--toul-transition), border-color var(--toul-transition)',
                                                }}>
                                                <span className="flex items-center gap-3">
                                                    <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                                        style={{ background: option.dim, color: option.color }}>
                                                        {option.value === 'cash' ? <CreditCard size={19} /> : <Package size={19} />}
                                                    </span>
                                                    <span>
                                                        <span className="block font-semibold text-sm" style={{ color: 'var(--toul-text)' }}>{option.title}</span>
                                                        <span className="block text-xs" style={{ color: 'var(--toul-text-subtle)' }}>{option.text}</span>
                                                    </span>
                                                </span>
                                                {active && <CheckCircle2 size={20} style={{ color: option.color }} />}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                <div>
                                    <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                        Proveedor {paymentMethod === 'credit' && <span style={{ color: 'var(--toul-error)' }}>*</span>}
                                    </label>
                                    <select
                                        className="toul-input w-full"
                                        value={selectedProviderId}
                                        onChange={(e) => setSelectedProviderId(e.target.value)}
                                        required={paymentMethod === 'credit'}>
                                        <option value="">Selecciona un proveedor (opcional)</option>
                                        {providers.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {paymentMethod === 'credit' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                                Abono Inicial <span className="text-xs font-normal" style={{ color: 'var(--toul-text-subtle)' }}>(opcional)</span>
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="toul-input w-full"
                                                placeholder="Ej. 50.000"
                                                value={withThousands(onlyDigits(initialPayment))}
                                                onChange={(e) => setInitialPayment(onlyDigits(e.target.value))}
                                            />
                                            {abonoDemasiado && (
                                                <p className="text-xs mt-1.5" style={{ color: 'var(--toul-error)' }}>
                                                    El abono no puede ser mayor que la compra ({formatCOP(total)}).
                                                </p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                                Plazo <span style={{ color: 'var(--toul-error)' }}>*</span>
                                            </label>
                                            <input
                                                type="date"
                                                className="toul-input w-full"
                                                value={dueDate}
                                                onChange={(e) => setDueDate(e.target.value)}
                                                min={diaColombia(new Date())}
                                                required
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {pagado > 0 && (
                                <div className="pt-4 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                    <p className="block text-sm font-semibold mb-2" style={{ color: 'var(--toul-text-muted)' }}>
                                        {paymentMethod === 'credit' ? '¿Con qué pagaste el abono?' : '¿Con qué pagaste?'}
                                    </p>
                                    <CuentaChips valor={cuenta} onChange={setCuenta} recordar="compra" />
                                </div>
                            )}

                            <button
                                disabled={!puedeVerResumen}
                                onClick={() => setStep(3)}
                                className="toul-btn-primary w-full mt-6 flex items-center justify-center gap-2">
                                Revisar resumen <Navigation size={18} />
                            </button>
                        </motion.div>
                    )}

                    {/* ── STEP 3: SUMMARY & CONFIRM ────────────────────────── */}
                    {step === 3 && (
                        <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

                            <div className="toul-card overflow-hidden">
                                <div className="p-4 border-b flex justify-between items-center"
                                    style={{ background: 'var(--toul-bg)', borderColor: 'var(--toul-border)' }}>
                                    <span className="font-medium text-sm" style={{ color: 'var(--toul-text-muted)' }}>Monto de la compra</span>
                                    <span className="font-bold text-xl" style={{ color: 'var(--toul-text)' }}>{formatCOP(total)}</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Pago</span>
                                        <span className="font-medium text-right" style={{ color: 'var(--toul-text)' }}>
                                            {paymentMethod === 'cash' ? 'Ya la pagué' : 'Queda debiendo'}
                                        </span>
                                    </div>
                                    {pagado > 0 && cuenta && (
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--toul-text-muted)' }}>Con qué</span>
                                            <span className="font-medium text-right" style={{ color: 'var(--toul-text)' }}>{nombreCuenta}</span>
                                        </div>
                                    )}
                                    {selectedProviderId && (
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--toul-text-muted)' }}>Proveedor</span>
                                            <span className="font-medium" style={{ color: 'var(--toul-text)' }}>
                                                {providers.find(p => p.id === selectedProviderId)?.name}
                                            </span>
                                        </div>
                                    )}
                                    {paymentMethod === 'credit' && abono > 0 && (
                                        <>
                                            <div className="flex justify-between text-sm">
                                                <span style={{ color: 'var(--toul-text-muted)' }}>Abono inicial</span>
                                                <span className="font-medium" style={{ color: 'var(--toul-accent)' }}>
                                                    {formatCOP(abono)}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-sm font-bold pt-2 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                                <span style={{ color: 'var(--toul-text-muted)' }}>Saldo Pendiente</span>
                                                <span style={{ color: 'var(--toul-error)' }}>
                                                    {formatCOP(saldoPendiente(total, abono))}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    {paymentMethod === 'credit' && dueDate && (
                                        <div className="flex justify-between text-sm">
                                            <span style={{ color: 'var(--toul-text-muted)' }}>Plazo</span>
                                            <span className="font-medium" style={{ color: 'var(--toul-error)' }}>
                                                {formatoColombia(instanteDeDia(dueDate), { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm pt-2 border-t" style={{ borderColor: 'var(--toul-border)' }}>
                                        <span style={{ color: 'var(--toul-text-muted)' }}>Productos</span>
                                        <span className="font-medium" style={{ color: 'var(--toul-text)' }}>
                                            {selectedItems.length} {selectedItems.length === 1 ? 'ítem' : 'ítems'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl text-sm" style={{ background: 'var(--toul-surface)', color: 'var(--toul-text-muted)', border: '1px solid var(--toul-border)' }}>
                                Al confirmar, los productos entran al inventario y se recalcula su costo promedio.
                                {paymentMethod === 'credit' && ' La deuda queda registrada con el proveedor.'}
                            </div>

                            <button
                                disabled={saving || faltaCuenta || !cantidadesBien}
                                onClick={guardar}
                                className="toul-btn-primary w-full flex items-center justify-center gap-2"
                                style={{ background: 'var(--toul-accent)', boxShadow: '0 4px 16px rgba(16,185,129,0.3)' }}>
                                {saving ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Registrando...
                                    </span>
                                ) : (
                                    <>Finalizar Compra <CheckCircle2 size={18} /></>
                                )}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            )}

            {/* Paso 1: el total y el botón de seguir quedan siempre a la mano */}
            {step === 1 && !loading && (
                <div style={{
                    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
                    padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
                    background: 'rgba(10,10,10,0.88)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                    borderTop: '1px solid var(--toul-border)',
                }}>
                    <div className="max-w-2xl mx-auto" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, color: cantidadesBien ? 'var(--toul-text-dim)' : 'var(--toul-error)', margin: 0 }}>
                                {selectedItems.length === 0 ? 'Elige qué compraste'
                                    : !cantidadesBien ? 'Cada producto necesita 1 o más'
                                    : selectedItems.length === 1 ? '1 producto' : `${selectedItems.length} productos`}
                            </p>
                            <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--toul-text)', margin: 0, lineHeight: 1.2 }}>
                                {formatCOP(Math.round(total))}
                            </p>
                        </div>
                        <button disabled={selectedItems.length === 0 || !cantidadesBien} onClick={() => setStep(2)}
                            className="toul-btn-primary flex items-center justify-center gap-2"
                            style={{ width: 'auto', padding: '0 22px', flexShrink: 0 }}>
                            Siguiente <Navigation size={17} />
                        </button>
                    </div>
                </div>
            )}

            <ConfirmSheet open={avisoCero} onClose={revisarCostos} onConfirm={guardarIgual}
                title="Hay productos con costo $0"
                message={`${nombresEnCero.join(', ')} ${nombresEnCero.length === 1 ? 'va' : 'van'} con costo $0. Si la guardas así, su costo promedio baja y la ganancia se verá más alta de lo que es.`}
                confirmLabel="Guardar igual" cancelLabel="Revisar costos" />

            <Sheet open={pickerOpen} onClose={cerrarPicker} title="Agregar productos" width={520}
                footer={<button className="toul-btn-primary" onClick={cerrarPicker}>Listo</button>}>
                {picker}
            </Sheet>
        </div>
    )
}
