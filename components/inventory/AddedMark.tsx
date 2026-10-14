'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Plus } from 'lucide-react'

/* ══════════════════════════════════════════════════════════════
   El "+" se vuelve un chulo cuando el producto ya está en la
   compra. Se ve una sola vez por producto, así que vale la pena
   que el cambio se note: el más sale y el chulo entra con un
   rebote corto.
   ══════════════════════════════════════════════════════════════ */

export function AddedMark({ added, size = 16 }: { added: boolean; size?: number }) {
    return (
        <span style={{
            position: 'relative', flexShrink: 0,
            width: size + 12, height: size + 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <AnimatePresence mode="wait" initial={false}>
                {added ? (
                    <motion.span
                        key="ok"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        transition={{ type: 'spring', duration: 0.34, bounce: 0.38 }}
                        style={{
                            position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: size + 10, height: size + 10, borderRadius: '50%',
                            background: 'var(--toul-accent)',
                        }}>
                        <Check size={size - 2} strokeWidth={3} color="#000" />
                    </motion.span>
                ) : (
                    <motion.span
                        key="add"
                        initial={{ scale: 0.7, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.7, opacity: 0 }}
                        transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                        style={{ position: 'absolute', display: 'flex' }}>
                        <Plus size={size} strokeWidth={2.4} style={{ color: 'var(--toul-accent)' }} />
                    </motion.span>
                )}
            </AnimatePresence>
        </span>
    )
}
