'use client'

import { motion } from 'framer-motion'

/** Interruptor de encender/apagar, igual en toda la app. */
export function Switch({ checked, onChange, label, disabled }: {
    checked: boolean
    onChange: (next: boolean) => void
    label?: string
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            style={{
                width: 48, height: 29, borderRadius: 999, border: 'none', padding: 3, flexShrink: 0,
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
                background: checked ? 'var(--toul-accent)' : 'rgba(255,255,255,0.14)',
                transition: 'background 220ms cubic-bezier(0.4,0,0.2,1)',
                display: 'flex', justifyContent: checked ? 'flex-end' : 'flex-start', alignItems: 'center',
            }}>
            <motion.span
                layout
                transition={{ type: 'spring', stiffness: 560, damping: 34 }}
                style={{ width: 23, height: 23, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }}
            />
        </button>
    )
}
