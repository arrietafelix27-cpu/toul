# TOUL — Estado actual del proyecto

*Última actualización: 14 de mayo de 2026 (sesión 6 — rediseño TOUL completo aplicado a toda la app)*

---

## Estado general

MVP funcional en desarrollo activo. Un usuario real (negocio de perfumes) está usando la versión desplegada. La versión en desarrollo tiene mejoras significativas sobre la desplegada.

---

## Módulos completados ✅

### POS / Nueva venta
- Flujo móvil de 3 pasos: Productos → Pago → Confirmación
- Lista de productos con buscador, ordenamiento y controles de cantidad
- Tap agrega producto, aparecen controles − cantidad + en la card
- Producto seleccionado sube al tope de la lista
- Si cantidad = 1, el − se convierte en ícono de eliminar
- Métodos de pago dinámicos desde `payment_methods`
- Contado y crédito con campos condicionales
- Multi-selección de métodos de pago con splits editables
- En modo crédito, el split toma el valor del abono inicial, no el total
- Descuento por % o $ oculto por defecto
- Transacción atómica en `app/api/sales/route.ts`
- Manejo de errores con carrito intacto si falla
- Ventas a crédito aparecen en historial con badge "Crédito"
- **Crear cliente durante la venta** — mini-form inline en Step2 y DesktopPOS: nombre obligatorio, teléfono opcional, auto-selección al guardar

### POS Desktop
- Layout 2 columnas (60/40): productos a la izquierda, carrito + pago a la derecha
- Toda la lógica compartida con móvil via `POSFlowProvider` + hooks `usePOSCart`, `usePOSData`, `usePOSPayment` — sin duplicación de código
- Spinner del botón Confirmar funcional (keyframes en globals.css)
- Misma arquitectura de Section cards, row-list y monospace prices que móvil

### Dashboard
- Gráfico de ventas con tabs Hoy/Semana/Mes
- Promedio 7d como texto debajo del monto principal
- Badge de racha de ventas (ícono de llama + días consecutivos)
- Etiqueta "ayer $X" flotante en el eje Y (solo vista Hoy)
- Resumen financiero: ventas registradas, gastos, ganancia neta
- Widget Productos inteligentes con tabs: Más vendidos, Más rentables, Stock bajo (con punto rojo cuando hay alertas), Sin rotación
- Widget TOUL AI dividido: insight + recomendación + botón chat arriba / cobros pendientes con toggle Por cobrar/Por pagar abajo
- Widget Liquidez disponible con donut chart y desglose por método de pago

### Otros módulos
- Productos: catálogo rediseñado (ver sección abajo). Foto desde galería o cámara al crear y editar
- Inventario: rediseño completo (ver sección abajo)
- Caja: balance por método de pago, gastos, movimientos
- Clientes: historial, cuentas por cobrar. API completa (GET + POST)
- Proveedores: historial, cuentas por pagar
- Ventas: historial completo incluyendo ventas a crédito con badge visual
- TOUL AI: copiloto con chat y contexto del negocio (businessSnapshot con 11 queries paralelas)
- Reportes: área financiera

### Fixes y mejoras aplicadas ✅
- Tema único oscuro fijo — eliminados tema claro y personalización de colores
- Floating point corregido globalmente con `Math.round()` en toda la app
- Teclado móvil corregido — inputs ya no cierran el teclado al escribir
- Foto en crear producto: permite galería además de cámara
- **Tokens CSS del POS migrados a `globals.css`** — `palette.ts` eliminado, todos los colores usan `var(--toul-pos-*)`, verde unificado a `--toul-primary` (#4ade80)
- **Fix ai-insights** — JSON con markdown fences (` ```json ``` `) se limpia antes de parsear
- **Fix batch/page.tsx** — entrada de inventario ya usa `inventory_adjustments` (quantity positivo) + update cpp directo; eliminado el update manual de `products.stock` que duplicaba el efecto del trigger

### Sesión 3 — 28 de abril de 2026 ✅

**POS — Soporte completo de variantes (Bug 3):**
- `Step1Products.tsx` y `DesktopPOS.tsx`: clave de carrito compuesta `productId:variantId` para variantes; productos con variantes expanden sub-filas con controles independientes por variante
- `DesktopPOS.tsx`: overlay picker de variantes al tocar card de producto con variantes

**Catálogo de productos — 6 cambios UI:**
1. **Padding buscadores globales** — raíz: `.toul-input` en globals.css sobreescribe `pl-*` de Tailwind (carga después). Fix: inline `style={{ paddingLeft }}` en `products`, `inventory`, `customers`, `providers`. Íconos todos a `left-3` (12px)
2. **Desktop hover** — scale(1.02) puro, clic navega a detalle. Sin overlay de acciones
3. **Variantes en catálogo** — productos con variantes como filas expandibles (`1/-1` removido); en desktop: dos secciones — grid para simples/combos + lista "Con variantes" debajo sin romper el grid
4. **`/products/variant/[variantId]`** — precio hero, métricas 2×2 (margen, ganancia/ud, und. vendidas con selector 7d/14d/30d en memoria, stock), ventas recientes
5. **`/inventory/variant/[variantId]`** — mirror de `/inventory/[id]` para variantes; sub-rows del inventario ahora son links clickeables con ChevronRight
6. **`/products/combo/[comboId]`** — imagen o placeholder `Layers`, precio con tachado si hay ahorro, lista de productos incluidos, resumen financiero (precio regular, costo, ganancia, ahorro cliente)

**Combos en el POS:**
- `pos-data/route.ts`: expone `combos` con sus `combo_items` (joined a products y product_variants)
- `usePOSData.ts`: tipos `POSCombo` + `POSComboItem`, estado `combos`
- `lib/types.ts`: `CartItem` extendido con `isCombo?` y `comboId?`
- `usePOSCart.ts`: tercer param `combos`, función `addCombo`, clave `combo:id`, memo detecta prefijo `combo:`
- `POSFlowProvider.tsx`: pasa `data.combos` al cart
- UI mobile (`Step1Products`) y desktop (`DesktopPOS`): sección "Combos" debajo de productos con card/stepper idéntico al de productos simples
- `sales/route.ts` (autorizado): detecta `item.isCombo`, fetch combo_items de DB, inserta `inventory_adjustments` negativos por cada componente con validación de stock

**Limitación conocida de combos V1**: `sale_items` requiere `product_id NOT NULL` (schema) → los combos no generan filas en `sale_items`. El total de la venta y el descuento de inventario son correctos. El detalle de ítems en historial de ventas no muestra combos. Solución futura: tabla `sale_combos` o columna nullable.

### Módulo de Productos — Rediseño completo (24 abril 2026) ✅

**Cambio 1 — Selector de tipo de producto:**
- `/products/new` reemplazado por pantalla de selección: Producto simple / Con variantes / Combo/Paquete
- Cada opción es un card con ícono y descripción que navega a su formulario correspondiente

**Cambio 2 — Formulario de producto con variantes** (`/products/new/variant`):
- Constructor de atributos: nombre del atributo + chips de valores (Enter o clic en +)
- Máximo 3 atributos
- Tabla de variantes generada automáticamente por producto cartesiano de los valores
- Precio por variante editable individualmente; los precios se preservan por nombre cuando los atributos cambian
- Orden de guardado: INSERT products → INSERT product_variant_attributes → INSERT product_variants; limpieza (DELETE product) si falla en pasos 2 o 3

**Cambio 3 — Formulario de combo/paquete** (`/products/new/combo`):
- Foto opcional + nombre + categoría
- Buscador unificado: productos simples por nombre, productos con variantes como ítems separados con formato "Nombre · Variante"
- Controles de cantidad por ítem (papelera cuando qty=1, botón − cuando qty>1)
- Resumen de precios: precio regular (suma automática), precio combo (editable), ganancia y margen en tiempo real
- Orden de guardado: upload imagen → INSERT combos → INSERT combo_items; limpieza si falla
- `combo_items` respeta la restricción CHECK: `product_id` nulo para ítems de variante, `variant_id` nulo para ítems de producto

**Cambio 4 — Layout desktop 2 columnas en detalle de producto** (`/products/[id]/page.tsx`):
- En `md+`: columna izquierda con galería sticky, columna derecha con info/métricas/acciones
- En móvil: layout stacked sin cambios

**Cambio 5 — Menú 3 puntos en móvil** (`/products/page.tsx`):
- Botón `MoreVertical` visible solo en móvil (`md:hidden`), entre los botones de desktop y el botón Nuevo
- Dropdown animado con backdrop-click para cerrar
- Opciones: Categorías → abre `CategoriesModal`, Exportar catálogo → abre `CatalogExportModal`

**Cambio 6 — Toggle "Este producto tiene variantes"** (`/products/[id]/edit/page.tsx`):
- Consulta paralela en `loadProduct`: cuenta `product_variants`, `sale_items`, e `inventory_adjustments` (excluye `reason = 'reconciliation'`)
- 3 estados visuales:
  - Tiene variantes: badge verde "Con variantes", bloqueado, mensaje informativo
  - Sin variantes pero con historial: badge gris + ícono de candado "Bloqueado", explica qué tipo de historial impide la conversión
  - Sin variantes y sin historial: badge gris "Sin variantes", link activo a `/products/new/variant`

### Módulo de Inventario — Rediseño completo (24 abril 2026, sesión 2) ✅

**Cambio 1 — Lista principal (`/inventory`):**
- Card de métricas 4 en 2×2: Valor total, Productos, Sin stock (rojo si > 0), Stock bajo (amarillo si > 0)
- Header compacto: botón ghost "Ajuste" + link verde "Nueva compra" (sin action cards grandes)
- Colores de stock 3 estados: verde=ok, amarillo=bajo, gris=cero
- Productos con variantes: badge `Layers` expandible con sub-filas animadas (stock por variante calculado de `inventory_adjustments`)
- Imagen fix: `images[0] || image_url` en lugar de solo `image_url`
- Label "Costo promedio" en lugar de "CPP"
- 4 SWR hooks: productos paginados + stats agregadas + variantProductIds + variantsDetail

**Cambio 2 — Detalle producto (`/inventory/[id]`):**
- Reescritura completa desde placeholder con datos reales
- Header con botón "Comprar" → `/inventory/purchase?product={id}`
- Stock hero: número grande con color 3 estados (gris=0, amarillo=bajo, verde=ok)
- Sección variantes expandible con stock calculado de `inventory_adjustments`
- Métricas: Ventas últimos 30d + Días restantes al ritmo actual
- Tab Movimientos: `inventory_adjustments` reales con íconos semánticos (`ArrowUpRight` verde, `ArrowDownLeft` rojo, `SlidersHorizontal` amarillo)
- Tab Insights: `buildSignalContext` + `computeInsightMessage` + 3 cards fijas (stock, velocidad, rentabilidad)

**Cambio 3 — Nueva compra: variantes en picker (`/inventory/purchase`):**
- Fetch de `product_variants` en paralelo al cargar → `variantsByProduct: Record<product_id, variant[]>`
- Tipo `SelectedItem` extendido con `itemKey`, `variantId`, `variantName`
- Productos con variantes muestran badge `Layers` + `ChevronRight` expandible
- Sub-filas de variantes con estado `alreadyAdded` (checkmark cuando ya está en carrito)
- API payload incluye `variantId: item.variantId ?? null` por ítem
- Fix loading skeleton: `dark:bg-gray-800` → `var(--toul-surface-2)`

**Cambio 4 — Nueva compra: layout desktop:**
- `components/inventory/DesktopPurchase.tsx` — nuevo componente 2 columnas
- Columna izquierda: picker + ítems seleccionados (scrollable)
- Columna derecha sticky: pago + proveedor + total + botón Finalizar
- `purchase/page.tsx`: `useIsMobile()` → render condicional; `handleSubmit` extraído como función named (compartida entre mobile y desktop)
- Loading skeleton desktop propio con grid 2 columnas

**Cambio 5 — Fixes globales (aplicado en sesión anterior):**
- `AdjustInventoryModal.tsx` y `purchase/page.tsx`: todos los colores hardcodeados → tokens CSS
- `toul-context.md`: regla de stock actualizada para reflejar trigger + variantes sin columna stock

### Sesión 4 — 6 de mayo de 2026 ✅

**Catálogo de productos — Toolbar y separadores (`/products/page.tsx`):**
- **SectionDivider**: corregido — las líneas horizontales son ahora de 80px fijos (`width: 80`) en lugar de `flex-1` que las hacía ocupar todo el ancho
- **Filtro de tipo**: reemplazado el filtro por señal (Más vendidos / Sin movimiento / Sin stock) por filtro de tipo con 4 opciones: Todos / Simples / Con variantes / Combos. Se implementó como `<select>` nativo con estado `typeFilter`
- **Botón de ordenamiento**: botón `ArrowUpDown` que cicla entre 4 modos — A→Z / Z→A / Más vendidos / Menos vendidos. Label visible en desktop (`hidden sm:inline`), solo ícono en móvil
- **Fix keys React duplicadas**: contenedores de desktop y móvil usaban el mismo `key={sortOrder}` como hermanos, generando el error "Encountered two children with the same key". Corregido con prefijos distintos: `key={'desktop-' + sortOrder}` y `key={'mobile-' + sortOrder}`
- **Fix ordenamiento visual**: framer-motion cacheaba el render previo; el `key` por `sortOrder` en cada contenedor fuerza remount y re-animación al cambiar orden

**Catálogo de productos — Acceso a detalle de variantes desde móvil:**
- En `MobileProductItem`, cuando un producto con variantes está expandido, se añadió botón "Ver detalle del producto" al final del bloque de variantes
- Navega a `/products/variant-group/[id]` con fondo verde tenue (`rgba(74,222,128,0.05)`) y borde superior separador
- Ícono `Info` de lucide agregado a los imports

**Página de detalle de grupo de variantes (`/products/variant-group/[id]/page.tsx`) — reescritura completa:**
- **Fix RLS / "Producto no encontrado"**: todas las queries SWR ahora incluyen `.eq('store_id', storeId!)` y las claves están gateadas en `(storeId && id) ? [...] : null`; guard de carga incluye `!id` para evitar queries con `undefined` durante hidratación
- **Arquitectura de datos**: 4 queries SWR — producto padre, variantes activas, ajustes de inventario (últimos), ventas últimos 30d
- **Cómputos en memoria**: `stockByVariant`, `salesByVariant`, `totalStock`, `variantCount`, `totalSold30d`, `bestVariantName`
- **Header compartido**: ← (volver a /products) + nombre del producto + badge "Con variantes" + botón Editar
- **Layout móvil** (`md:hidden`): imagen 160px → métricas 2×2 → lista de variantes con cards animadas (stagger). Cards muestran nombre, precio, costo, stock con color 3 estados (verde/amarillo/gris) y badge de estado. Opacidad 0.5 para variantes sin stock
- **Layout desktop** (`hidden md:flex`): columna izquierda 260px con solo la imagen (200px, `border-right: 0.5px`) + columna derecha flex-1 con métricas 2×2 encima y tabla de variantes debajo (headers: Variante / Precio / Costo promedio / Stock / Estado). Filas clickeables via `router.push`, hover `var(--toul-surface-2)`, opacidad 0.5 sin stock
- **`paddingTop: 20`** en columna derecha para alinear el label VARIANTES con la imagen
- **Métricas en columna derecha**: el `metricsGrid` se movió de la columna izquierda a la columna derecha (encima del label VARIANTES, `marginBottom: 20`) — el layout queda simétrico: izquierda = solo imagen, derecha = métricas + tabla
- **`LoadingSkeleton`** propio que refleja el layout nuevo (header + mobile + desktop)
- **`MetricCard`** y helpers `getStockStatus` / `getStockStyle` como funciones locales del archivo

### Sesión 4 (continuación) — Rediseño móvil del catálogo de productos ✅

**Módulo Productos — Layout móvil rediseñado desde cero (`/products/page.tsx`):**

- **Header sticky**: título "Productos" 30px/800/letter-spacing −1.5px + botón "+ Nuevo" verde (#4ade80, color #060B18, border-radius 10px, height 36px). La sección header + buscador + chips es `sticky top-0 z-20` con `backdrop-filter: blur(16px)` y fondo semitransparente (`rgba(6,11,24,0.94)`)
- **Buscador mobile**: input full-width propio (sin clase `toul-input`), border-radius 12px, altura 44px, filtra client-side por nombre y referencia
- **Chips de filtro**: fila horizontal con scroll oculto (técnica padding-bottom + margin-bottom + `scrollbarWidth: none`). 4 chips: Todos / Individuales / Variantes / Combos. Estado activo: `rgba(74,222,128,0.1)` bg + borde verde + texto verde. Estado inactivo: borde `--toul-border` + texto muted
- **Efecto scroll "depth portal"**: el contenedor de la lista tiene `mask-image: linear-gradient(to bottom, transparent 0px, black 36px)`. Las cards se disuelven suavemente al subir hacia la barra sticky, sin JS en scroll, 60fps
- **`MobileProductCard`** — nueva anatomía completa:
  - Imagen 76×76px con `object-fit: cover`, o placeholder con `hashColor(name)` (6 pares bg/texto) e iniciales por palabras (`getInitials`: primera letra de cada palabra con letra, slice(0,2) para nombres con una sola palabra)
  - Separador 1px vertical `var(--toul-border)`
  - Columna info: nombre 14px/600/text-primary truncado + referencia 11px (`#334155` si existe, `#1E2D45` casi invisible si "Sin ref")
  - Columna derecha: ícono de tipo arriba (`Layers` #a78bfa para variantes, `Package` #fbbf24 para combos, vacío para individuales) + precio abajo #4ade80 16px/800 letter-spacing −0.5px
  - Active state: `onPointerDown/Up/Leave` directo en DOM — `scale(0.99)` + `border-color: rgba(74,222,128,0.4)`. Sin hover states
  - Navegación: simples → `/products/[id]`, variantes → `/products/variant-group/[id]`, combos → `/products/combo/[id]`
- **Spring animation por card**: `initial: {scale:0.88, opacity:0}` → `animate: {scale:1, opacity:1}`, `type: spring, stiffness: 260, damping: 18, delay: Math.min(index * 0.06, 0.42)`. `AnimatePresence mode="popLayout"` con `key={typeFilter}` — al cambiar chip: exit fade+scale 0.96 en 120ms, luego re-entrada con spring escalonado
- **Lista plana sin SectionDividers**: en móvil, todos los tipos aparecen en lista unificada ordenada por el chip activo. Sin separadores visuales entre tipos
- **`MobileItem` type**: unión discriminada `{ kind: 'simple' | 'variant' | 'combo'; data: Product | ComboRow; variants?: VariantRow[] }`
- **`hashColor(name)`** y **`getInitials(name)`**: funciones helpers para el placeholder. `getInitials` usa primera letra de cada palabra con contenido alfabético — "Fresh Mint" → "FM", "Rosé 212" → "RO"
- **Skeleton mobile** (`MobileListSkeleton`): 6 cards de 76px de alto con la misma anatomía del card real (imagen + separador + líneas de texto + icono + precio)
- **Desktop preservado 100%**: layout de grid, SectionDividers, DesktopProductCard, VariantDrawer, selects y sort button — sin ningún cambio

### Sesión 5 — 11 de mayo de 2026 ✅

**Rediseño final de cards móviles (`/products/page.tsx`):**

Header reorganizado en 4 filas:
1. Botones de acción (Tag + Share) — 36×36px, border con glass effect
2. Título "Productos" 22px/700/−0.8px + subtítulo con conteo
3. Buscador full-width (h:44, border-radius 13) + botón filtro mismo height
4. Botón "+ Nuevo producto" con gradiente verde y box-shadow

`MobileProductCard` — estado final:
- Left accent strip 2.5px por tipo: verde simple, violeta variante, amarillo combo
- Imagen en recessed well (Double Bezel): `boxShadow: '0 0 0 1px rgba(255,255,255,0.08)'`
- Placeholder radial-gradient con hashColor de nombre
- Referencia: texto oscuro visible si existe (`#334155`), casi invisible si no (`#1E2D45`)
- Columna derecha: ícono de tipo 13px arriba (solo SVG, sin texto) + precio 16px/800 abajo
- Press feedback via `onPointerDown/Up/Leave`: `scale(0.97)` + `opacity: 0.85`
- Spring animation por card: `duration: 0.42, bounce: 0.12`

FilterPanel — bottom sheet iOS:
- Backdrop con `backdropFilter: blur(8px)` y `rgba(2,5,14,0.72)`
- Sheet entra con curva iOS `[0.32, 0.72, 0, 1]`
- Opciones de tipo (radio) + opciones de orden (radio) + botón Aplicar con gradiente

**Fix bug referencias en cards:**
- Root cause: INSERT fallaba por columnas inexistentes (`category`, `average_cost`) → retry borraba `reference` del payload innecesariamente
- Fix aplicado en 3 archivos: `products/new/simple/page.tsx`, `products/new/variant/page.tsx`, `products/[id]/edit/page.tsx` — eliminado `delete productData.reference` del bloque retry

**Categorías de producto — migración completa a Supabase:**

Antes: localStorage (`toul_categories_${storeId}`) — no sincronizaba entre dispositivos, no se guardaba en los productos.

Después: tabla real `product_categories` en Supabase con CRUD completo.

- `supabase/migration_v7.sql` — tabla `product_categories` (id, store_id, name, sort_order, created_at) + columna `category_id UUID` en `products`; RLS con `owner_id`; índice en `store_id`
- `lib/types.ts` — tipo `ProductCategory` exportado; `products.Row` actualizado: eliminados `category: string | null` y `average_cost: number` (falsos), añadido `category_id: string | null` y `category?: ProductCategory | null` (join)
- `components/products/CategoriesModal.tsx` — reescritura completa: CRUD contra `product_categories`, seed de 8 defaults al primer uso, bloqueo de delete si algún producto usa la categoría, `onChanged` callback
- `products/new/simple/page.tsx` — carga categorías desde Supabase, guarda `category_id`
- `products/new/variant/page.tsx` — ídem
- `products/new/combo/page.tsx` — ídem
- `products/[id]/edit/page.tsx` — carga `category_id` del producto existente, guarda UUID al actualizar
- `products/page.tsx` — query con join `category:product_categories(id, name)`
- `products/CatalogExportModal.tsx` — filtra por `category_id`, muestra `category.name`

⚠️ **Pendiente de ejecutar**: `migration_v7.sql` en Supabase SQL Editor antes de probar.

### Sesión 6 — 14 de mayo de 2026 ✅

**Rediseño completo del sistema de diseño TOUL — Nuevo lenguaje visual iOS-inspired aplicado a toda la app**

Migración sistémica del lenguaje visual antiguo (azul oscuro `#060B18` + verde `#4ade80`) al nuevo sistema iOS-inspired (negro puro `#0a0a0a` + Apple System Green `#32d74b`). Toda la lógica de negocio, queries, INSERTs, validaciones y redirects se preservó al 100%. **Solo cambió la capa visual.**

**Fase 0 — Sistema base (`app/globals.css`):**

Reescritura completa de tokens manteniendo los mismos nombres (`--toul-bg`, `--toul-accent`, etc.) — cambio sistémico automático para todo lo que ya consumía tokens.

- BG: `#060B18` → `#0a0a0a` (negro puro)
- Surfaces: hex → alpha-based `rgba(255,255,255,0.04/0.05/0.07/0.08)`
- Borders: hex → alpha `rgba(255,255,255,0.07/0.12)`
- Texto: 4 tiers alpha (`text`, `text-muted`, `text-subtle`, `text-dim`, `text-faint`, `text-ghost`)
- Accent: `#4ade80` → **`#32d74b` (Apple System Green)** + hover `#28b73f`
- Semantic iOS: error `#ff453a`, warning `#ffd60a`, info `#0a84ff`, secondary purple `#bf5af2`
- Tokens nuevos: `--toul-surface-focused`, `--toul-border-focused`, `--toul-surface-overlay`, `--toul-divider`, margin tiers (`--toul-margin-high/mid/low`), easing tokens (`--toul-ease`, `--toul-ease-emil`, `--toul-ease-drawer`)
- Utility classes nuevas: `.toul-ambient` (radial green glow para tops de páginas), `.toul-divider`
- `.toul-input` actualizado al patrón "active container" (bg + border cambian en focus, no solo border)
- `.toul-btn-primary` actualizado: height 54, border-radius 16, color **negro** sobre verde (no white), scale(0.97) on active
- Body con `font-feature-settings: "tnum" on` global — tabular nums en toda la app
- Scrollbar ultra fina (3px) usando `--toul-border-2` alpha
- Webkit number spinners ocultos globalmente
- **Tokens `--toul-pos-*` preservados intactos** — POS mantiene identidad visual propia

**Fase 1 — Componentes UI reutilizables + Nav + Modals base:**

Creación de librería UI consolidada en `components/ui/`:
- `Field.tsx` — input genérico con label INTERNO y patrón "active container" (todo el container se ilumina verde al focusear). Required marker: dot verde `·` (no asterisco). Soporta text/email/tel/url/password
- `PriceField.tsx` — money input con prefijo `$` reactivo (gris → verde al focusear), tipografía 22px/600 letter-spacing −0.03em, tabular-nums
- `CategoryPicker.tsx` — dropdown genérico (cualquier `{id, name}`). NO usa select nativo. Modal central con `backdrop-filter: blur(20px)`, spring entrance, chevron rota 180° en open, check con pop spring, body scroll lock
- `index.ts` — barrel export + animation tokens (`SPRING_SOFT`, `SPRING_PRESS`, `EASE_OUT_EXPO`, `EASE_OUT_EMIL`)

`components/layout/BottomNav.tsx` — Rediseño completo iOS:
- Bottom bar mobile: **frosted glass** `rgba(10,10,10,0.78)` + `backdrop-blur(40px) saturate(1.8)`, border-top-radius 22
- Active state: bg pill `rgba(50,215,75,0.12)` 32×32 detrás del icon, icon + label verde
- FAB central: 56×56 verde Apple, **icon negro** (no white), shadow `0 8px 28px rgba(50,215,75,0.45)`, scale 0.94 on tap
- "Más" bottom sheet con backdrop-blur(20px), bg `--toul-surface-overlay`, drag handle, items como cards individuales con active container pattern, scroll lock cuando abierto
- Sidebar desktop también migrado al nuevo lenguaje (frosted glass + iOS green)

Modals base rediseñados:
- `components/products/CategoriesModal.tsx` — convertido a bottom sheet con drag handle, dots de color iOS (verde, púrpura `#bf5af2`, azul `#0a84ff`, amarillo `#ffd60a`, naranja `#ff9f0a`, rojo) rotando por índice, body scroll lock
- `components/inventory/AdjustInventoryModal.tsx` — convertido a bottom sheet, **primer consumidor** de `<Field>` y `<CategoryPicker>` desde `@/components/ui`, búsqueda con active container pattern, warning card con bg `--toul-error-dim`

`app/(app)/products/new/simple/page.tsx` — Refactor para consumir desde `@/components/ui`:
- Importa `Field`, `PriceField`, `CategoryPicker`, springs, easing desde la librería
- Reemplaza ambient inline por `<div className="toul-ambient" />`
- Reemplaza divisores inline por `<hr className="toul-divider" />`
- Usa `var(--toul-margin-high/mid/low)` para tiers semánticos del margen de ganancia
- ~150 líneas menos de código duplicado

**Fase 2 — Páginas principales mobile:**

- `components/dashboard/MobileDashboard.tsx` — ambient + tabs período active container + botón calendar con focused border + cards Gastos/Utilidad con tabular nums y `letter-spacing: -0.03em` + "Top hoy" badge en iOS yellow + botones "Habla con TOUL IA" con texto negro sobre verde + chips de método de pago con dot 6px
- `app/(app)/products/page.tsx` — migración masiva de hex via `replace_all`: `#4ade80→#32d74b`, `#22c55e→#28b73f`, `rgba(74,222,128→rgba(50,215,75`, `#060B18→#000`, `#94A3B8→rgba(255,255,255,0.45)`, `#64748B→rgba(255,255,255,0.4)`. Sticky header bg → `rgba(10,10,10,0.85)`. Backdrop modales → `rgba(0,0,0,0.5)`. Ambient agregado
- `app/(app)/inventory/page.tsx` — header tipográfico iOS + ambient
- `app/(app)/cash/page.tsx` — header iOS + botón "Capital propio" **iOS purple `#bf5af2`** (cambió de indigo `#6366f1`) + botón "Nuevo gasto" verde con texto negro + ambient
- `app/(app)/ventas/page.tsx` — header iOS + period tabs con motion + active container pattern + ambient

**Fase 3 — Forms de productos:**

- `app/(app)/products/new/variant/page.tsx` — hex verde antiguo migrado + header iOS + ambient
- `app/(app)/products/new/combo/page.tsx` — hex verde antiguo migrado + header iOS + ambient
- `app/(app)/products/[id]/edit/page.tsx` — hex verde antiguo migrado + header iOS + ambient
- `app/(app)/products/[id]/page.tsx` — header iOS + botón "Editar" verde con texto negro + glow + ambient
- `app/(app)/products/[id]/batch/page.tsx` — header iOS + ambient

**Fase 4 — Páginas secundarias:**

- `app/(app)/customers/page.tsx` — header iOS + botón "Nuevo" verde texto negro / "Cancelar" gris + ambient
- `app/(app)/expenses/page.tsx` — header iOS + botón Nuevo + ambient
- `app/(app)/providers/page.tsx` — header iOS + botón Nuevo + ambient
- `app/(app)/reportes/page.tsx` — header iOS + period tabs active container + ambient
- `app/(app)/settings/page.tsx` — header iOS + ambient
- `app/(app)/toul-ai/page.tsx` — caso especial sin ambient (chat fullscreen). Header con **frosted glass** `backdrop-blur(20px)`, back button modernizado, icon Brain en cuadrado 36×36 con `--toul-accent-dim` + `--toul-border-focused`, tipografía editorial

**Fase 5 — Detalles e inventario:**

- `app/(app)/inventory/[id]/page.tsx` — hex migrado + ambient + header iOS con eyebrow reference
- `app/(app)/inventory/purchase/page.tsx` — hex migrado + ambient + header con eyebrow "Paso X de 3"
- `app/(app)/inventory/variant/[variantId]/page.tsx` — hex migrado + ambient + header con eyebrow product name
- `app/(app)/products/combo/[comboId]/page.tsx` — ambient + header iOS + badge "Combo" pill verde con border-focused
- `app/(app)/products/variant/[variantId]/page.tsx` — ambient + header iOS
- `app/(app)/products/variant-group/[id]/page.tsx` — ambient + header iOS + badge "Con variantes" iOS blue con border 0.2

**Patrón visual consolidado en toda la app:**

1. **Headers unificados**: back button 36×36 borderRadius 12 con bg `rgba(255,255,255,0.07)` + icon `ArrowLeft size={17} strokeWidth={2}` color `rgba(255,255,255,0.7)`
2. **Tipografía editorial**: title 17–24px/600–700, letter-spacing −0.02em (sin uppercase tracking wide). Eyebrow 12–13px/500 color text-dim (sin uppercase)
3. **Botones primary**: verde Apple con texto negro, border-radius 12–16, padding 9–14px, scale(0.97) on active, box-shadow glow verde
4. **Ambient verde radial** en top de cada página (vía `<div className="toul-ambient" />`)
5. **Active container pattern** en pickers/tabs/inputs (todo el container se ilumina verde al focusear, no solo border)
6. **Frosted glass** consistente en BottomNav, sticky headers, modals
7. **Bottom sheets** iOS con drag handle 36×4 + `border-top-radius 28`
8. **Spring physics** consistente: `stiffness: 420, damping: 26` para press feedback, `240/26` para entrance
9. **Cubic-bezier custom** `(0.4, 0, 0.2, 1)` en CSS transitions
10. **Tabular nums** global — todos los números financieros se alinean perfectamente

**Total: 27 archivos modificados, 4 archivos nuevos en `components/ui/`. 0 errores de TypeScript.**

**Archivos NO tocados (preservados intencionalmente):**
- `--toul-pos-*` tokens (identidad propia del POS drawer)
- `components/pos/POSContext.tsx` (prohibido por CLAUDE.md)
- `app/(app)/layout.tsx` (prohibido por CLAUDE.md)
- `middleware.ts`, `app/api/sales/route.ts`

### Schema migrations aplicadas en Supabase ✅

**Migration v5** — Tablas para variantes y combos:
- Tablas nuevas: `product_variants`, `product_variant_attributes`, `combos`, `combo_items`
- `variant_id` (nullable) agregado a `sale_items`, `purchase_items`, `inventory_adjustments`

**Migration v6** — Centralización completa del stock:
- `inventory_adjustments` es ahora la única fuente de verdad para el stock
- Cantidades signadas: positivo = entrada, negativo = salida
- Trigger `trg_sync_product_stock` en Supabase mantiene `products.stock` como caché automático
- `app/api/sales/route.ts` — inserta en `inventory_adjustments` con `quantity: -item.quantity` en lugar de actualizar `products.stock` directamente
- `app/api/purchases/route.ts` — inserta en `inventory_adjustments` con `quantity: item.quantity`; solo actualiza `cpp` en products
- `app/api/inventory/adjust/route.ts` — ya usaba `inventory_adjustments`; ahora usa `quantity: -quantity` (negativo) y elimina el update redundante de `products`
- Todo el frontend sigue leyendo `product.stock` sin cambios — el trigger lo mantiene fresco

---

## Pendiente 🔄

### Prompt 5 — Animaciones móvil + Consistencia visual

**Consistencia visual global** ✅ Completado en sesión 6 (rediseño TOUL):
- ✅ Auditoría completa de espaciados, tipografía, border-radius y colores en todos los módulos
- ✅ Escala tipográfica fija definida y aplicada uniformemente (17–24/600–700 con letter-spacing −0.02em para titles, 12–13/500 para eyebrows)
- ✅ Tokens CSS centralizados usados en toda la app — `globals.css` v4.0
- ✅ Active container pattern + tabular nums + ambient + frosted glass en todas las páginas

**Animaciones móvil POS — Pendiente:**
- Transiciones entre pasos: paso 1 → 2 sale izquierda/entra derecha, volver es inverso, confirmación hace fade + scale up. Duración 200ms, easing `cubic-bezier(0.4, 0, 0.2, 1)` (usar el token `--toul-ease`)
- Tap en producto: scale down 0.96 en 80ms + pulso verde suave
- Botones + y −: scale down 0.90 en 60ms al presionar
- Botón Continuar y Confirmar: scale down 0.97 en 80ms
- Cards de métodos de pago: borde verde con transición 150ms, check con pop (scale 0→1.2→1) en 200ms
- Toggle Contado/Crédito: indicador se desliza suavemente en 180ms
- Campos condicionales (crédito, splits, descuento): slide down + fade in en 150-200ms
- Spinner en botón Confirmar mientras espera respuesta
- Usar framer-motion (ya instalado v11) — reutilizar springs de `@/components/ui` (`SPRING_PRESS`, `SPRING_SOFT`)
- `prefers-reduced-motion`: ya está handled globalmente en `globals.css`

**Estados vacíos dignos por módulo — Pendiente:**
- Auditoría módulo por módulo de empty states (productos sin items, inventory sin productos, ventas sin historial, etc.)

### TOUL AI — Mejoras pendientes
- **Migración de OpenAI a Claude** (Anthropic SDK, `claude-sonnet-4-6`) — actualmente usa `gpt-4o-mini`
- UI de error visible al usuario cuando el chat falla (hoy solo hay `console.error`)
- Persistencia de conversaciones en Supabase
- Caché del `businessSnapshot` — hoy se reconstruye entero en cada mensaje (costoso)
- Rate limiting por usuario

### Variantes y combos
- Las tablas `product_variants`, `product_variant_attributes`, `combos`, `combo_items` ya existen en Supabase
- ✅ UI para crear producto con variantes: `/products/new/variant`
- ✅ UI para crear combo/paquete: `/products/new/combo`
- ✅ Variantes en Nueva compra: picker expande variantes, `variantId` llega al API
- ✅ Variantes y combos en el POS (ver sesión 3)
- ✅ Página de detalle de variante: `/products/variant/[variantId]`
- ✅ Página de detalle de combo: `/products/combo/[comboId]`
- ✅ Inventario de variantes clickeable: `/inventory/variant/[variantId]`
- ✅ Página de detalle/métricas de grupo de variantes: `/products/variant-group/[id]` — acceso desde catálogo móvil (botón expandido) y desde el drawer de variantes en desktop
- Pendiente: pantalla de edición/gestión de variantes para un producto existente (agregar, desactivar, cambiar precios en lote)

---

## Decisiones de producto tomadas

- Tema único oscuro fijo — no hay tema claro ni personalización
- Métodos de pago siempre dinámicos desde DB, nunca hardcodeados
- CPP no editable manualmente si hay historial
- Venta contado sin método de pago no permitida
- Error de stock: bloquear y mostrar error, no ajustar automáticamente
- Productos sin stock: mostrar deshabilitados, no ocultar
- Descuento aplicado sobre subtotal, sin impuestos por ahora
- En modo crédito, el split del método de pago usa el abono inicial, no el total
- Paleta del POS mantiene identidad visual propia (`--toul-pos-*`) — solo el verde se unifica al global
- Stock centralizado en `inventory_adjustments` con cantidades signadas — `products.stock` es caché mantenido por trigger

---

## Contexto técnico importante

- Build debe pasar con `npm run build` sin errores antes de cada deploy
- Supabase como única fuente de verdad
- `formatCOP` y `roundCOP` en `lib/utils.ts` — usar siempre para números en pantalla. `formatCOP` ya incluye `Math.round()` internamente
- framer-motion v11 ya instalado y en uso
- TOUL AI usa Vercel AI SDK (`useChat`) en frontend — compatible con cambio de provider en backend sin tocar el frontend
- El usuario de prueba tiene un negocio de perfumes en Barranquilla, Colombia
- `@keyframes spin` definido globalmente en `globals.css` — disponible para cualquier spinner en la app
- **`components/ui/`** — librería UI consolidada (Field, PriceField, CategoryPicker) + animation tokens (SPRING_SOFT, SPRING_PRESS, EASE_OUT_EXPO, EASE_OUT_EMIL). Usar SIEMPRE estos primitives para nuevos forms en vez de inputs sueltos. Import: `import { Field, PriceField, CategoryPicker, SPRING_PRESS } from '@/components/ui'`
- **Verde acento ahora es `#32d74b`** (Apple System Green) — NO `#4ade80`. Cualquier hex hardcoded en código nuevo debe usar `var(--toul-accent)` o el hex correcto
- **Texto sobre botones verdes debe ser negro `#000`** (no blanco) — contraste correcto, el verde brillante con blanco se ve lavado
- **Ambient verde**: agregar `<div className="toul-ambient" />` como primer hijo de cualquier page wrapper nuevo (el wrapper debe ser `position: relative`)
- **Tabular nums activos globalmente** — todos los números ya se alinean automáticamente, no necesitas `fontVariantNumeric: 'tabular-nums'` inline (solo si quieres reforzarlo en un componente específico)
- Trigger `trg_sync_product_stock` en Supabase: se dispara en cada INSERT/UPDATE/DELETE en `inventory_adjustments` y recalcula `products.stock = SUM(quantity)` para el producto afectado
