'use client'
import { useState } from 'react'

export interface FieldProps {
    label: string
    required?: boolean
    hint?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    maxLength?: number
    type?: 'text' | 'email' | 'tel' | 'url' | 'password'
    inputMode?: 'numeric' | 'text' | 'email' | 'tel' | 'decimal'
    disabled?: boolean
    autoFocus?: boolean
    name?: string
}

/**
 * Field — input con label INTERNO y patrón "active container".
 * El container completo cambia bg + border + label color al focusear.
 * Required marker: dot verde `·` (no asterisco).
 */
export function Field({
    label, required, hint, value, onChange,
    placeholder, maxLength, type = 'text',
    inputMode, disabled, autoFocus, name,
}: FieldProps) {
    const [focused, setFocused] = useState(false)

    return (
        <div style={{
            borderRadius: 14,
            padding: '12px 16px 14px',
            background: focused ? 'var(--toul-surface-focused)' : 'var(--toul-surface)',
            border: `1px solid ${focused ? 'var(--toul-border-focused)' : 'var(--toul-border)'}`,
            transition: 'background var(--toul-transition), border-color var(--toul-transition)',
            opacity: disabled ? 0.5 : 1,
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.01em',
                color: focused ? 'var(--toul-accent)' : 'var(--toul-text-dim)',
                transition: 'color var(--toul-transition)',
            }}>
                <span>{label}</span>
                {required && (
                    <span style={{ color: 'var(--toul-accent)' }}>·</span>
                )}
                {hint && (
                    <span style={{
                        color: 'var(--toul-text-faint)',
                        fontWeight: 500,
                    }}>
                        · {hint}
                    </span>
                )}
            </div>
            <input
                type={type}
                name={name}
                value={value}
                onChange={e => onChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                maxLength={maxLength}
                inputMode={inputMode}
                disabled={disabled}
                autoFocus={autoFocus}
                style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: 0,
                    marginTop: 4,
                    fontSize: 16,
                    color: 'var(--toul-text)',
                    fontFamily: 'inherit',
                }}
            />
        </div>
    )
}
