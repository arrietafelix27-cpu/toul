# TOUL · Nueva venta (POS) — Design & Build Spec

Approved by the founder on 2026-11-18. This folder is the single source of truth for the POS redesign.
If anything here conflicts with the current code, **this spec wins for UI/UX**; the current code wins for business rules, money math, offline queue and server validations (those must not regress).

## 0. What is in this folder

| Path | What it is | How to use it |
|---|---|---|
| `prototipos/pos-celular.html` | Approved phone prototype (390×844). Fully interactive. | Open in a browser (or Playwright). This is the visual + motion reference. |
| `prototipos/pos-pc.html` | Approved desktop prototype (1440×900), includes PC Inicio + opening. | Same. Keyboard shortcuts work (`N`, `/`, `Enter`, `Esc`). |
| `capturas/celular-*.png`, `capturas/pc-*.png` | 28 reference screenshots of every state, in flow order. | Visual acceptance targets. Compare your build against them. |
| `videos/flujo-celular.webm`, `videos/flujo-pc.webm` | Recording of the full flow in the prototypes. | Motion reference (timing, order, feel). |
| `referencias/` | The founder's original inspiration (videos + images). | Context only. The prototypes are what was approved. |

**Important:** the prototype JS/CSS is a *design reference*, not production code. Re-implement inside the existing Next.js 15 + Supabase architecture, reusing existing hooks, data layer, `process_sale`, offline queue and validations. Copy exact values (colors, radii, sizes, durations, easings, keyframes) from the prototype CSS — do not eyeball them.

## 1. Non-negotiables

1. **Numbers are sacred.** No total, stock, debt, cash or report number may change behavior unintentionally. Measure before and after. Run `SELECT * FROM toul_auditoria_todas() WHERE NOT ok;` → must return 0 rows before and after.
2. Do **not** modify `process_sale` semantics or the offline queue logic. Any DB change → show the SQL first and wait for approval.
3. All user-facing text in **Spanish**, professional tone (see §9 copy). No slang ("vuelto", "fiado" are replaced).
4. Motion: only `transform` and `opacity` (plus `grid-template-rows` for accordions). 60 fps on a mid-range Android. Respect `prefers-reduced-motion` (all motion → instant, liquid drop → simple fade).
5. TOUL design system wins over any skill's defaults.

## 2. Design tokens (from prototype)

- Background `#0a0a0a`. Text `#ffffff`. Secondary text `rgba(255,255,255,.55)`; muted `.4`.
- Green TOUL `#32d74b` (key figures, primary action, active states). Liquid drop green `#28b73f`. Text on green `#06210c`.
- Amber `#ffb340` = at minimum / pending debt. Red `#ff453a` = sold out / delete.
- Surfaces: `rgba(255,255,255,.04–.08)`, no bordered boxes; separators 1px `rgba(255,255,255,.07)`.
- Money format: `$200.000` (no space, es-CO thousands).
- Radii: chips 99px; fields 16px; method tiles 16px; cards 22–24px; sheets 30px; confirm button 20px.
- Key sizes: payment total 52px/700; Inicio "Vendiste" 46px (PC 64px); sheet hero number 48px; confirm button 58px tall; FAB 58px; row 60px; product tile 58px.
- Easing: `cubic-bezier(.23,1,.32,1)` (default out), `cubic-bezier(.32,.72,0,1)` (layers/sheets), `cubic-bezier(.34,1.56,.64,1)` (pop/bump), `cubic-bezier(.34,1.3,.64,1)` (sliding pills).
- Press feedback on **every** button: scale .86–.97 in 160ms.

## 3. Opening animation (approved — do not redesign)

- Phone: tapping the green `+` FAB grows a gooey liquid drop (`#28b73f`) from the button. 6 lobes, SVG goo filter (`feGaussianBlur stdDeviation 14` + `feColorMatrix alpha 0 0 0 24 -10`). Lobe values are in the prototype (`.lobe` CSS vars `--s --z --x --y --k --w`). Duration `--d: 640ms`. No flash.
- The POS layer is **not green**: it is `#0a0a0a`, fades in at 55% of `--d`. Rows cascade in (`pin` keyframe, 34ms stagger after `--d * .6`).
- Close (X, or Salir after a sale) plays the reverse back into the `+`.
- PC: same drop, born from the sidebar "Nueva venta" button (larger lobes, see `pos-pc.html`), keyboard `N`. Right panel slides in from the right at 55%.
- **Performance task:** SVG blur filters on large layers can drop frames on low-end Android. Measure with CPU 4× throttling. If < 50 fps, keep the look but optimise (smaller filter region, render the lobes on a canvas/WebGL layer, or a pre-rendered fallback). Report numbers before choosing.

## 4. Product screen

**Header:** only the X (exit) on the left; an amber "Sin conexión" pill on the right only when offline. No Vender/Ventas switch, no profile circle, no circle menu (Gasto/Panel/Cerrar sesión move out of the POS).

**Search** (50px field, clear button appears with pop) + **Filtrar** + **Ordenar** buttons (50px, green when active with a dot badge). Each opens a small popover (scale-in from the button corner).
- Filtrar: Todos los productos · Productos individuales · Con presentaciones · Combos.
- Ordenar: Más vendidos (default, last 30 days, fixed while the caja is open) · Más recientes · Nombre (A–Z) · Menor precio · Mayor precio. "Más stock" is removed.
- Sold-out items always last, dimmed, not tappable.

**Categories:** 62px circles with label below (Todos uses a grid icon; categories use the photo of the best seller — prototype uses an initial). Selected = white ring that pops in.

**Rows:** 58px tile (product photo in production), name 16px, price 15px. Low stock shows `· Quedan N` in amber **only when stock ≤ that product's own minimum** (not a fixed 3). Sold out shows `· Agotado` in red, row dimmed, no button.
- Normal product: `+` (42px circle). After the first tap it morphs into the stepper pill `[− | N | +]` (grow animation). The number is an input (inputmode numeric) styled as the number itself — tap to type wholesale quantities; select-all on focus. At 1, `−` becomes a red trash. Number bumps on every change.
- Product with presentations: subtitle `Desde $X`; a chevron button expands the presentations **inline** (accordion with `grid-template-rows`, staggered rows). Each presentation has its own stepper. The chevron button shows the total units of that product in green when > 0. Searching "carneguey 100" auto-expands it.
- Combo: `Combo` tag; stock = how many can be assembled (existing logic).
- Stock limit = real stock minus what's in the cart (existing logic incl. combos). Notice: "Ya tienes en la venta todo el stock de X".
- Scroll: rows leaving the top shrink/fade (scroll-driven `animation-timeline: view()`, with `@supports` fallback = none).

**Cart bar** (floating, glass, 70px): stacked mini tiles · **total (20px) with "N productos" below it** · green `Cobrar →`. Springs up when the first item is added, bumps on change.

## 5. Payment screen

Pushes in from the right (POS layer slides -24% and dims).
- Back arrow. Centered: "Total" label, **total 52px**, **directly below it the pill `N productos ⌄`** that expands an editable breakdown (each line has a mini stepper; emptying the cart returns to products). If there's a discount: strikethrough subtotal + green `−$X` under the pill.
- Segmented control `Contado | A crédito` (sliding white pill). Offline: "A crédito" shows a lock and a toast "Las ventas a crédito requieren conexión a internet".

**Contado**
- Payment methods 2×2 tiles from the business's table (color dot + name). **No method is preselected** (founder decision: accuracy over one tap). Selected = green outline + check pop.
- Cash portion > 0 → "Recibido" block: big right-aligned editable amount (placeholder = exact), quick chips (Exacto, next 10.000/20.000/50.000/100.000 notes, max 4), then "Cambio $X" (green, bumps) or "Falta $X" (amber, blocks confirm).
- Rows (60px, icon tile, value on the right, chevron; value animates in when it changes):
  - **Cliente** — "Opcional" → opens the client sheet.
  - **Dividir pago** → expands inline: second method chips + amount field; first method takes the rest; warning "El monto supera el total." Two methods in the prototype; keep existing N-method support.
  - **Descuento** — "Agregar" / green `−$X` → opens the discount sheet.

**A crédito**
- Rows: **Cliente** (green "Seleccionar" until chosen) · **Fecha de pago** (`jue 3 dic`) · **Abono** ("Sin abono" / green amount) · **Descuento**.
- Amber block: "Saldo anterior" (if the client already owes) + **Saldo pendiente** (26px amber, bumps).

**Confirm button** (58px, full width): disabled state is grey with the reason as label: "Selecciona el método de pago", "Monto recibido insuficiente", "Revisa los montos del pago", "Selecciona un cliente", "Selecciona la fecha de pago". Enabled: "Confirmar venta" / "Registrar crédito". On tap: label fades, button shrinks to a 58px circle, 3 bouncing dots (~750ms or real request time), bursts with 8 sparks, then the success screen. Keep the existing "Registrando…"/timeout→offline behavior underneath.

## 6. Sheets (bottom sheets on phone, centered modals on PC)

Scrim fades to `rgba(0,0,0,.55)`; panel slides up 500ms `(.32,.72,0,1)`; content fades up 80ms later. Title 20px + close X. Keep the content mounted while closing.
- **Cliente** (86% tall): search by name or phone; full scrollable list (bottom fade mask), staggered rows, amber balance only for clients who owe; selected row tinted green. Picking closes the sheet. "Crear cliente "X"" / "Crear cliente con el número X" → inline form (Nombre, WhatsApp opcional) with Cancelar / Crear cliente.
  - **Names are unique** (case/space/accent-insensitive) and so are phones (with or without +57). Duplicate → amber notice "Ya existe "X"… agrega su apellido" with **Usar este**. Server double-checks (existing).
  - A name can't be a phone number. Remove the current behavior where a typed-but-not-selected name silently creates/finds a client on the server.
- **Fecha de pago:** big date "Viernes 27 de noviembre" + "En 9 días"; chips 8 días · 15 días (default) · 30 días · Sin fecha; month calendar (Mon-first, past days disabled, today ringed, selected green pop, month slide animation). Chips move the calendar to that date. "Listo".
- **Abono inicial:** hero amount input (auto width), hint "Saldo pendiente $X"; chips Sin abono · La mitad; "Método del abono" chips; if cash → the same Recibido/Cambio block. Never more than the total.
- **Descuento:** `$ | %` switch, hero input with `$` or `%`, quick chips (5/10/15/20% or $5.000/$10.000/$20.000), Subtotal + Nuevo total, Quitar / Aplicar. Never more than the sale. Keep existing approval rules (hidden today).

## 7. Success screen ("logro")

Soft green radial glow; 96px green circle pops in, ring pulse, check draws (stroke-dashoffset), ~12 confetti pieces for ~1.1s (short on purpose — sellers do 30 sales/day).
- Title "Venta registrada" / "Venta a crédito registrada" (20px), amount 46px, one summary line ("Efectivo · Cambio $5.000 · Andrés Pérez" or "Andrés Pérez · Vence el vie 27 nov").
- **"¿Te equivocaste? Deshacer"** chip for 5 seconds with a draining ring (admin only, existing void logic "Deshecha al registrar" / remove from offline queue; products return to the cart).
- Offline: amber note "Guardada en el teléfono. Se enviará automáticamente al recuperar la conexión."
- Card: first 4 products + "y N productos más", discount, (credit: Abono, Saldo pendiente), Total.
- Buttons: **Enviar comprobante** (secondary) · **Salir** · **Nueva venta** (primary). PC: `Enter` = Nueva venta.
- **Salir** → liquid closes into the `+`, Inicio "Vendiste" counts up to the new value with a `+$X` chip. **Inicio, Reportes, Inventario, Movimientos and Cuentas por cobrar must show the new numbers immediately** (revalidate/mutate SWR caches on sale success and on undo).

## 8. Comprobante de venta

Sheet with a white "paper" card that drops in: business logo/initials + name, "Comprobante de venta · #code", date/time, client, items, discount/method/abono rows, total, footer "Gracias por tu compra · No es factura electrónica · Hecho con TOUL".
- Primary: share as **image** (render the card to PNG, Web Share API with files; WhatsApp direct to the client's number when known → button "Enviar a {nombre}"). Secondary: **PDF**. Fallback: download.
- Never call it "factura" (DIAN electronic invoice is a different legal document).

## 9. Copy (exact Spanish strings)

Buscar producto · Sin resultados para esta búsqueda · Quedan N · Agotado · Desde $X · Combo · Cobrar · N productos · Total · Contado · A crédito · Recibido · Recibido en efectivo · Cambio · Falta · Exacto · Dividir pago · Quitar · Cliente · Opcional · Seleccionar · Descuento · Agregar · Fecha de pago · Sin fecha · Sin fecha límite · Abono · Abono inicial · Sin abono · La mitad · Método del abono · Saldo anterior · Saldo pendiente · Nuevo total · Subtotal · Aplicar · Listo · Confirmar venta · Registrar crédito · Venta registrada · Venta a crédito registrada · ¿Te equivocaste? Deshacer · Enviar comprobante · Nueva venta · Salir · Sin conexión · Ya tienes en la venta todo el stock de X · Las ventas a crédito requieren conexión a internet · Venta anulada. Los productos volvieron a la venta. · Cliente creado · El número de WhatsApp debe tener 10 dígitos · El nombre no puede ser un número de teléfono.

## 10. PC (≥1024px)

Two columns: products (search 560px max with `/` hint, filter, sort, categories, **card grid** `repeat(auto-fill, minmax(200px,1fr))`) + a **440px right panel** always visible.
- Card: 4:3 image area (tap = add 1; presentations open a centered modal), green count badge with pop, green ring when in cart, hover lift; body = name, then price + stepper.
- Right panel: "Venta" + Vaciar, editable lines, empty state ("Agrega productos · Toca un producto o búscalo con /"), Total 46px with "N productos" below, `Cobrar [Enter]`. Cobrar slides the panel to the payment view (same content as phone).
- Sheets → centered modals (480px). Success → centered card over a scrim.
- Shortcuts: `N` open caja (from Inicio) · `/` focus search · `Enter` in search adds first available result · `Enter` Cobrar / Confirmar / Nueva venta · `Esc` closes modal → back → closes caja. Enter on a focused button must not re-trigger it.
- Keep "Ver ventas de hoy" (existing PC feature) as a subtle text button in the right panel header.

## 11. Data/backend changes (show SQL first, wait for approval)

1. Store the credit **due date as a real date column** (today it lives inside the debt note text "Vence: …"). Migrate existing notes → parse dates where possible; keep the note text intact. Update Cobros to read the column.
2. Remove the implicit client creation from a typed name (§6).
3. Remove the one-tap cash shortcut and the "last method preselected" behavior.
4. Nothing else in the schema changes.

## 12. Acceptance checklist

- [ ] Screens match `capturas/` (phone 390×844, PC 1440×900) — produce side-by-side Playwright screenshots.
- [ ] Every button has press feedback; every screen/sheet/state change is animated; reduced-motion works.
- [ ] Opening ≥ 50 fps with 4× CPU throttle (report numbers).
- [ ] Audit query returns 0 rows before and after; a test sale of each type (cash with change, split, credit with abono + date, discount $ and %, presentation, combo, wholesale typed quantity, offline cash) produces identical numbers in Inicio, Reportes, Inventario, Movimientos, Cuentas por cobrar.
- [ ] Undo restores stock, debt and cart exactly.
- [ ] Duplicate client name/phone cannot be created.
- [ ] Offline: credit locked, sale saved, success note shown, sync works.
