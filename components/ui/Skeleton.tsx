'use client'

import React from 'react'

interface SkeletonProps {
    className?: string
    width?: string | number
    height?: string | number
    circle?: boolean
}

/**
 * Skeleton — atomic building block for shimmer loading states.
 * Uses the .skeleton class defined in globals.css for shimmer.
 */
export function Skeleton({ className = '', width, height, circle }: SkeletonProps) {
    const style: React.CSSProperties = {
        width: width ?? '100%',
        height: height ?? '1rem',
        borderRadius: circle ? '9999px' : undefined,
    }

    return (
        <div
            className={`skeleton ${className}`}
            style={style}
            aria-hidden="true"
        />
    )
}

/**
 * PageSkeleton — generic skeleton for lists/grids to prevent layout shift.
 */
export function GridSkeleton({ count = 6, children }: { count?: number, children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="animate-pulse">
                    {children}
                </div>
            ))}
        </div>
    )
}

/**
 * EmptyState — standardized view for empty modules.
 */
export function EmptyState({ icon: Icon, title, description, action }: {
    icon: any,
    title: string,
    description: string,
    action?: React.ReactNode
}) {
    return (
        <div className="toul-card text-center py-16 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-2"
                style={{ background: 'var(--toul-surface-2)', color: 'var(--toul-text-muted)' }}>
                <Icon size={32} strokeWidth={1.5} />
            </div>
            <div>
                <h3 className="font-bold text-lg mb-1" style={{ color: 'var(--toul-text)' }}>{title}</h3>
                <p className="text-sm max-w-[240px] mx-auto text-balance" style={{ color: 'var(--toul-text-muted)' }}>
                    {description}
                </p>
            </div>
            {action && (
                <div className="mt-2">
                    {action}
                </div>
            )}
        </div>
    )
}
