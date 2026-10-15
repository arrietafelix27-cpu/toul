'use client'

/* ══════════════════════════════════════════════════════════════
   Las dos puertas del módulo.
   La corredera se mueve con transform, que es lo único que el
   navegador puede animar sin repintar; y como es una transición
   y no un keyframe, se puede interrumpir a mitad de camino si
   tocas la otra pestaña antes de que termine.
   ══════════════════════════════════════════════════════════════ */

export interface Segment {
    key: string
    label: string
    /** Un número al lado del nombre: dice que hay algo sin resolver */
    count?: number
}

const CSS = `
.seg { position: relative; display: grid; padding: 3px; border-radius: 14px;
    background: var(--toul-surface); border: 1px solid var(--toul-border); }

.seg-slider { position: absolute; top: 3px; bottom: 3px; left: 3px; border-radius: 11px;
    background: var(--toul-surface-focused); border: 1px solid var(--toul-border-focused);
    transition: transform 240ms cubic-bezier(0.23, 1, 0.32, 1);
    pointer-events: none; }

.seg-btn { position: relative; z-index: 1; height: 38px; display: inline-flex;
    align-items: center; justify-content: center; gap: 7px;
    border: none; background: none; cursor: pointer; font-family: inherit;
    font-size: 13.5px; font-weight: 500; letter-spacing: -0.01em;
    color: var(--toul-text-dim); -webkit-tap-highlight-color: transparent;
    transition: color 180ms cubic-bezier(0.23, 1, 0.32, 1); }
.seg-btn[data-on="true"] { color: var(--toul-text); font-weight: 600; }
.seg-btn:active { transform: scale(0.98); }

.seg-count { display: inline-flex; align-items: center; justify-content: center;
    min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px;
    font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
    background: var(--toul-error-dim, rgba(239,68,68,0.14)); color: var(--toul-error); }

@media (prefers-reduced-motion: reduce) {
    .seg-slider { transition: none; }
    .seg-btn:active { transform: none; }
}
`

export function SegmentedTabs({ items, value, onChange }: {
    items: Segment[]
    value: string
    onChange: (key: string) => void
}) {
    const index = Math.max(0, items.findIndex(i => i.key === value))
    const ancho = `calc((100% - 6px) / ${items.length})`

    return (
        <>
            <style>{CSS}</style>
            <div className="seg" role="tablist"
                style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
                <span className="seg-slider" aria-hidden
                    style={{ width: ancho, transform: `translateX(calc(${index} * 100%))` }} />
                {items.map(item => {
                    const on = item.key === value
                    return (
                        <button key={item.key} role="tab" aria-selected={on}
                            className="seg-btn" data-on={on}
                            onClick={() => onChange(item.key)}>
                            {item.label}
                            {!!item.count && item.count > 0 && (
                                <span className="seg-count">{item.count}</span>
                            )}
                        </button>
                    )
                })}
            </div>
        </>
    )
}
