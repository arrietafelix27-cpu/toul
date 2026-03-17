'use client'
import React, { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { useStore } from '@/lib/hooks/useData'

type Theme = 'light' | 'dark' | 'custom'

interface Appearance {
    theme: Theme
    colors: {
        primary: string
        secondary: string
        accent: string
    }
}

const DEFAULT_COLORS = {
    primary: '#10B981',
    secondary: '#A855F7',
    accent: '#6366F1'
}

const defaultAppearance: Appearance = {
    theme: 'dark', // Changed to dark to maintain continuity
    colors: DEFAULT_COLORS
}

interface ThemeContextType {
    appearance: Appearance
    setAppearance: (appearance: Appearance) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const { data: store } = useStore()
    const [appearance, setAppearance] = useState<Appearance>(defaultAppearance)

    // Sync from Supabase or LocalStorage if possible
    useEffect(() => {
        if (store?.appearance) {
            const data = store.appearance as any
            setAppearance({
                theme: data.theme || 'dark',
                colors: {
                    primary: data.colors?.primary || DEFAULT_COLORS.primary,
                    secondary: data.colors?.secondary || DEFAULT_COLORS.secondary,
                    accent: data.colors?.accent || DEFAULT_COLORS.accent,
                }
            })
        }
    }, [store])

    useEffect(() => {
        if (typeof window === 'undefined') return
        const root = window.document.documentElement

        // Remove existing theme classes
        root.classList.remove('theme-light', 'theme-dark')

        // Apply theme class
        const currentTheme = appearance?.theme || 'dark'
        if (currentTheme === 'light') {
            root.classList.add('theme-light')
        } else {
            root.classList.add('theme-dark') // Default or specific dark
        }

        // Apply custom colors as CSS variables
        const colors = appearance?.colors || DEFAULT_COLORS
        root.style.setProperty('--toul-primary', colors.primary)
        root.style.setProperty('--toul-secondary', colors.secondary)
        root.style.setProperty('--toul-accent', colors.accent)

        // Calculate hover and dim versions manually to ensure they exist
        // Only if it's a valid hex
        if (colors.primary?.startsWith('#')) {
            const dimOpacity = currentTheme === 'dark' ? '33' : '1f' // 20% vs 12%
            const glowOpacity = currentTheme === 'dark' ? '59' : '40' // 35% vs 25%
            root.style.setProperty('--toul-primary-dim', `${colors.primary}${dimOpacity}`)
            root.style.setProperty('--toul-primary-glow', `${colors.primary}${glowOpacity}`)
            root.style.setProperty('--toul-accent-dim', `${colors.primary}${dimOpacity}`)
            root.style.setProperty('--toul-accent-glow', `${colors.primary}${glowOpacity}`)
        }

    }, [appearance])

    const value = useMemo(() => ({ appearance, setAppearance }), [appearance])

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useAppearance = () => {
    const context = useContext(ThemeContext)
    if (!context) throw new Error('useAppearance must be used within ThemeProvider')
    return context
}
