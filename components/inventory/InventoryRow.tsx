'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Thumb } from '@/components/ui/Thumb'

/* ══════════════════════════════════════════════════════════════
   Una línea del inventario.

   La barra de nivel solo aparece cuando hay contra qué medir —el
   mínimo que debería haber—. En la lista completa no hay ese
   número para todo, y una barra sin escala es un adorno que
   miente. Donde no se sabe, no se dibuja.
   ══════════════════════════════════════════════════════════════ */

export const ROW_CSS = `
.ivr { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px;
    border-radius: 14px; text-decoration: none; text-align: left; font: inherit; color: inherit;
    background: none; border: none; cursor: pointer; -webkit-tap-highlight-color: transparent;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1),
                transform 160ms cubic-bezier(0.23,1,0.32,1); }
.ivr:active { transform: scale(0.99); }

.ivr-nivel { display: block; width: 46px; height: 3px; border-radius: 999px; margin: 5px 0 0 auto;
    background: rgba(255,255,255,0.08); overflow: hidden; }
.ivr-nivel > i { display: block; height: 100%; width: 100%; border-radius: 999px;
    transform-origin: left center; transform: scaleX(0);
    animation: ivr-llenar 620ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
@keyframes ivr-llenar { to { transform: scaleX(var(--nivel, 0)); } }

.ivr-item { opacity: 0; transform: translateY(6px);
    animation: ivr-entrar 260ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
@keyframes ivr-entrar { to { opacity: 1; transform: translateY(0); } }

@media (hover: hover) and (pointer: fine) {
    .ivr:hover { background: rgba(255,255,255,0.038); }
}
@media (prefers-reduced-motion: reduce) {
    .ivr:active { transform: none; }
    .ivr-item { animation: none; opacity: 1; transform: none; }
    .ivr-nivel > i { animation: none; transform: scaleX(var(--nivel, 0)); }
}
`

export function InventoryRow({
    href, onClick, image, name, title, subtitle, tone = 'dim', stock, target, trailing, delay = 0,
}: {
    href?: string
    onClick?: () => void
    image?: string | null
    name?: string | null
    title: string
    subtitle: string
    tone?: 'dim' | 'warn' | 'error'
    stock: number
    /** Cuántas debería haber. Sin esto no se dibuja la barra. */
    target?: number
    trailing?: ReactNode
    delay?: number
}) {
    const colorSub = tone === 'error' ? 'var(--toul-error)'
        : tone === 'warn' ? 'var(--toul-warning)'
            : 'var(--toul-text-dim)'

    // Sin un mínimo contra el cual medir no hay escala, y con cero
    // unidades la barra vacía se lee como un error de la pantalla
    const nivel = target && target > 0 && stock > 0
        ? Math.min(stock / target, 1)
        : null
    const colorNivel = nivel !== null && nivel < 1 ? 'var(--toul-warning)' : 'var(--toul-accent)'

    const dentro = (
        <>
            <Thumb src={image} name={name ?? title} size={40} />
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                    display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.015em',
                    color: 'var(--toul-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {title}
                </span>
                <span style={{
                    display: 'block', fontSize: 12, color: colorSub, marginTop: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {subtitle}
                </span>
            </span>

            {trailing ?? (
                <span style={{ flexShrink: 0, textAlign: 'right' }}>
                    <span style={{
                        display: 'block', fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em',
                        color: stock <= 0 ? 'var(--toul-error)' : 'var(--toul-text)',
                        fontVariantNumeric: 'tabular-nums',
                    }}>
                        {stock}
                    </span>
                    {nivel !== null && (
                        <span className="ivr-nivel">
                            <i style={{ background: colorNivel, ['--nivel' as string]: nivel, animationDelay: `${delay}ms` }} />
                        </span>
                    )}
                </span>
            )}
        </>
    )

    const estilo = { animationDelay: `${delay}ms` }

    if (href) {
        return <Link href={href} className="ivr ivr-item" style={estilo}>{dentro}</Link>
    }
    return <button onClick={onClick} className="ivr ivr-item" style={estilo}>{dentro}</button>
}
