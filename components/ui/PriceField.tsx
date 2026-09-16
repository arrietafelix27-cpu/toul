'use client'
import { useState } from 'react'

export interface PriceFieldProps {
    label: string
    required?: boolean
    hint?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    min?: number
    step?: number
    disabled?: boolean
}

/**
 * PriceField — money input con prefijo `$` y tipografía grande.
 * Mismo patrón "active container" que Field.
 * El `$` también cambia a verde cuando el campo está focuseado.
 * Sin spinners webkit (gestionado en globals.css).
 * tabular-nums para alineación numérica.
 */
export function PriceField({
    label, required, hint, value, onChange,
    placeholder = '0', min = 0, step = 100, disabled,
}: PriceFieldProps) {
    const [focused, setFocused] = useState(false)

    return (
        <div style={{
            flex: 1,
            minWidth: 0,
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
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 3,
                marginTop: 4,
            }}>
                <span style={{
                    fontSize: 13,
                    color: focused ? 'var(--toul-accent)' : 'rgba(255,255,255,0.3)',
                    fontWeight: 500,
                    transition: 'color var(--toul-transition)',
                    userSelect: 'none',
                }}>
                    $
                </span>
                <input
                    type="number"
                    inputMode="numeric"
                    min={min}
                    step={step}
                    placeholder={placeholder}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    disabled={disabled}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: 0,
                        fontSize: 22,
                        fontWeight: 600,
                        letterSpacing: '-0.03em',
                        color: 'var(--toul-text)',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'inherit',
                    }}
                />
            </div>
        </div>
    )
}
