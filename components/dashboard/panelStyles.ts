/* ══════════════════════════════════════════════════════════════
   El lenguaje visual del inicio.
   Nada de cajas: el contenido se apoya en el fondo y lo que
   separa son líneas que se desvanecen. Un solo estilo de título,
   un solo estilo de botón, en todos los paneles.
   ══════════════════════════════════════════════════════════════ */

export const PANEL_CSS = `
.pnl { position: relative; height: 100%; display: flex; flex-direction: column; min-width: 0; }

.pnl-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em;
    color: var(--toul-text-faint); margin: 0; }

.pnl-pill { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
    height: 30px; padding: 0 12px; border-radius: 10px; text-decoration: none; white-space: nowrap;
    max-width: 100%; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.055);
    color: var(--toul-text-muted); font-family: inherit; font-size: 11.5px; font-weight: 600; letter-spacing: -0.01em;
    cursor: pointer;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), color 160ms cubic-bezier(0.23,1,0.32,1), border-color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pnl-pill:active { transform: scale(0.96); }

.pnl-link { display: inline-flex; align-items: center; gap: 6px; text-decoration: none;
    font-size: 12.5px; font-weight: 500; color: var(--toul-text-dim);
    transition: color 160ms cubic-bezier(0.23,1,0.32,1); }

.pnl-row { display: flex; align-items: center; gap: 11px; padding: 8px 10px; border-radius: 12px;
    text-decoration: none; position: relative;
    transition: background-color 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1); }
.pnl-row:active { transform: scale(0.985); }

@media (hover: hover) and (pointer: fine) {
    .pnl-pill:hover { background: rgba(255,255,255,0.1); color: var(--toul-text); border-color: rgba(255,255,255,0.16); }
    .pnl-link:hover { color: var(--toul-accent); }
    .pnl-row:hover { background: rgba(255,255,255,0.04); }
}
@media (prefers-reduced-motion: reduce) {
    .pnl-pill:active, .pnl-row:active { transform: none; }
}
`
