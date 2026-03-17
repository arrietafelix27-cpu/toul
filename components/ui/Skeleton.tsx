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
