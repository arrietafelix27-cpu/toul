'use client'
/**
 * PageWrapper — wraps each page with a fade+slide entrance animation.
 * Used inside app/(app) pages. Respects prefers-reduced-motion.
 */
import { motion, useReducedMotion } from 'framer-motion'
import { pageVariants } from '@/lib/motion'

export default function PageWrapper({ children }: { children: React.ReactNode }) {
    const prefersReduced = useReducedMotion()

    if (prefersReduced) return <>{children}</>

    return (
        <motion.div
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
        >
            {children}
        </motion.div>
    )
}
