# TOUL — Contexto completo del producto

## Qué es TOUL

TOUL no es un SaaS convencional. Es una herramienta operativa para emprendedores colombianos que venden productos físicos por Instagram y WhatsApp — personas que hoy manejan su negocio con cuadernos, Excel o simplemente de memoria.

El objetivo es simple: que el emprendedor tenga su negocio en la palma de su mano. Control real de caja, inventario y ventas. Entender qué está pasando con su negocio en tiempo real, sin necesidad de conocimientos contables.

TOUL reemplaza el cuaderno, el Excel y el desorden.

---

## Filosofía del producto

- **Simplicidad operativa** — no es contabilidad compleja, es control real y fácil de entender
- **Datos accionables** — cada número en pantalla debe responder una pregunta concreta del usuario, no decorar
- **Flujo rápido en ventas** — registrar una venta debe tomar menos de 20 segundos
- **Todo conectado** — una acción en un módulo se refleja automáticamente en todos los demás
- **Mobile-first** — la mayoría de usuarios van a usar TOUL desde el celular mientras atienden clientes

---

## Stack técnico

- **Framework:** Next.js (App Router)
- **Base de datos:** Supabase (PostgreSQL)
- **Estilos:** CSS con tokens globales en `globals.css`
- **Componentes UI:** propios, sin librerías de UI externas
- **Autenticación:** Supabase Auth
- **IA:** hoy usa OpenAI (`gpt-4o-mini`) vía Vercel AI SDK — frontend usa `useChat`, backend en `app/api/toul-ai/`. Migración a Claude pendiente

---

## Diseño

- Tema oscuro fijo — no hay tema claro ni personalización de tema
- Color de acción principal: verde (`--toul-primary: #4ade80`)
- Tokens CSS definidos en `app/globals.css` — todos los colores usan variables, cero hardcodeados en componentes
- Desde v5.0 la caja (POS) usa el mismo lenguaje visual: los tokens `--toul-pos-*` apuntan al sistema global
- Border-radius consistente, tipografía Inter, espaciados en múltiplos de 4px
- Mobile: press states, no hover states. Sin modales pesados. Flujos en pasos.

---

## Módulos actuales

### POS / Ventas
Flujo de 3 pasos en móvil (Productos → Pago → Confirmación). En desktop, layout de 2 columnas simultáneas.
- Venta de contado o crédito
- Múltiples métodos de pago (cargados dinámicamente desde la tabla `payment_methods`)
- Cliente opcional en contado, obligatorio en crédito
- Descuento por monto o porcentaje
- Al confirmar (transacción atómica):
  - Crea registro en `sales` + `sale_items`
  - Descuenta inventario
  - Registra movimiento en caja por cada método de pago
  - Si es crédito: crea cuenta por cobrar, asocia cliente
  - Actualiza historial del cliente

### Productos
Catálogo visual con imagen, nombre, precio de venta, costo, margen.
- Creación y edición con imagen desde galería o cámara
- Exportación del catálogo en PDF
- Un producto existe independientemente de su stock — Producto ≠ Inventario

### Inventario
Control de stock con movimientos detallados por producto.
- Stock actual, entradas, salidas, movimientos
- **CPP (Costo Promedio Ponderado)** calculado automáticamente con cada compra
- El CPP no se edita manualmente si ya hay historial de movimientos
- Detalle de movimientos de cada producto
- No se puede eliminar un producto que tenga stock

### Caja
Control del dinero del negocio distribuido por método de pago.
- Capital propio incluido
- Movimientos automáticos al registrar ventas y compras
- Registro de gastos manuales
- Vista por método de pago: Efectivo, Nequi, Daviplata, Bancolombia, y cualquier método que el usuario configure
- Los métodos de pago son configurables por el usuario — nunca hardcodeados

### Compras
Registro de compras a proveedores.
- Genera entrada de inventario automáticamente
- Recalcula CPP del producto
- Mueve caja (si es de contado)
- Crea cuenta por pagar (si es a crédito) con fecha límite

### Clientes
Directorio de clientes con historial de compras y cuentas por cobrar.
- Deuda pendiente por cliente
- Historial de ventas asociadas
- Registro de abonos

### Proveedores
Directorio de proveedores con historial de compras y cuentas por pagar.
- Deuda pendiente por proveedor
- Historial de compras asociadas
- Registro de abonos

### TOUL AI
Copiloto inteligente (hoy OpenAI `gpt-4o-mini`; migración a Claude pendiente).
- Insights accionables basados en los datos reales del negocio
- Chat directo con contexto del negocio cargado
- Acceso rápido desde el dashboard

### Reportes
Área financiera completa.
- Rendimientos, márgenes, flujo de caja
- Comparativas por período
- Todo lo financiero en un solo lugar

---

## Reglas de negocio críticas

Estas reglas no se negocian. Antes de tocar cualquier lógica relacionada, confirmar:

1. **CPP no se edita manualmente** si el producto tiene historial de movimientos de inventario
2. **Producto ≠ Inventario** — son módulos separados. Un producto puede existir con stock 0
3. **No eliminar productos con stock** — mostrar error claro si se intenta
4. **Compras generan siempre:** entrada de inventario + recálculo de CPP + movimiento de caja (si contado) + cuenta por pagar (si crédito)
5. **Ventas generan siempre:** salida de inventario + movimiento de caja por método de pago + cuenta por cobrar (si crédito) + actualización de historial de cliente
6. **Métodos de pago son dinámicos** — vienen siempre de la tabla `payment_methods`, nunca hardcodeados en el frontend
7. **Todos los números en pantalla** pasan por `Math.round()` antes de renderizarse — sin decimales inesperados

---

## Tablas principales en Supabase

| Tabla | Uso principal |
|-------|--------------|
| `sales` | Ventas registradas |
| `sale_items` | Productos/variantes de cada venta (`variant_id` nullable) |
| `products` | Catálogo de productos (`stock` existe como caché del trigger — ver migration_v5_hotfix + v6) |
| `product_variants` | Variantes de producto (talla, color, etc.) — sin stock column |
| `product_variant_attributes` | Atributos de variante por producto (ej: "Talla", "Color") |
| `inventory_adjustments` | Toda entrada/salida de inventario — fuente única de stock |
| `combos` | Paquetes de productos/variantes vendidos juntos |
| `combo_items` | Ítems de cada combo (product_id XOR variant_id) |
| `purchases` | Compras a proveedores |
| `purchase_items` | Productos de cada compra (`variant_id` nullable) |
| `customers` | Clientes |
| `suppliers` | Proveedores |
| `credits` | Movimientos de cuentas por cobrar |
| `provider_debts` | Movimientos de cuentas por pagar |
| `payments` | Movimientos de caja por método de pago |
| `payment_methods` | Métodos de pago configurados por el usuario |
| `stores` | Datos del negocio del usuario (+ `nit`, `address`, `phone`, `receipt_footer` para la tirilla) |
| `store_members` / `store_invites` | Equipo (admin/vendedor) e invitaciones por código |
| `cash_sessions` | Turnos de caja |
| `approval_requests` | Solicitudes de anulación y crédito |
| `sale_voids` | Ventas anuladas (foto completa) |
| `push_subscriptions` | Dispositivos que reciben notificaciones |

**Regla de stock:** `products.stock` es un caché mantenido automáticamente por el trigger `trg_sync_product_stock`. El frontend lee siempre `products.stock` directamente — el trigger lo mantiene al día. Las variantes NO tienen columna `stock`: su stock se calcula como `SUM(quantity) FROM inventory_adjustments WHERE product_id = X AND variant_id = Y`.

---

## Estructura de archivos clave

```
app/
  (app)/
    page.tsx              — Dashboard principal
    pos/                  — Módulo POS
    products/             — Módulo Productos
    inventory/            — Módulo Inventario
    purchases/            — Módulo Compras
    cash/                 — Módulo Caja
    customers/            — Módulo Clientes
    suppliers/            — Módulo Proveedores
    sales/                — Historial de ventas
    reports/              — Reportes financieros
    settings/             — Configuración
  api/
    sales/route.ts        — Llama al RPC `process_sale` (NO TOCAR sin autorización)
    purchases/route.ts    — Llama al RPC `process_purchase`
    pos-data/route.ts     — Datos para el POS
    payment-methods/      — CRUD métodos de pago
components/
  dashboard/              — Widgets del dashboard
  pos/                    — Componentes del POS
  ui/                     — Componentes base
lib/
  utils.ts                — Utilidades globales (incluye formatCOP, roundCOP)
app/
  globals.css             — Tokens CSS globales de TOUL
```

---

## Archivos que NUNCA se tocan sin autorización explícita

- `app/api/sales/route.ts` — wrapper del RPC atómico de ventas (`supabase/rpc/process_sale.sql`)
- `app/globals.css` — tokens de diseño globales
- `middleware.ts` — autenticación y rutas protegidas

---

## Cómo trabajar en este proyecto

1. **Antes de modificar cualquier archivo:** mostrar qué archivos se van a tocar y esperar confirmación
2. **Antes de escribir cualquier query:** confirmar nombres exactos de tablas y campos
3. **Antes de crear un endpoint nuevo:** preguntar si se puede reutilizar uno existente
4. **Cambios visuales:** nunca hardcodear colores — usar siempre los tokens CSS de `globals.css`
5. **Cambios de lógica:** aislar cada mejora en su propio paso, no mezclar múltiples cambios
6. **Si algo no está claro:** preguntar antes de asumir

---

## Caso de uso actual: isla de perfumes en centro comercial

TOUL se está preparando para operar como sistema de una isla de perfumes (negocio nuevo, apertura aprox. mediados de noviembre de 2026).

- **Equipo:** computador POS táctil + impresora de tirilla 80 mm
- **Productos:** solo frascos completos (TOUL = reventa de productos físicos, sin decants)
- **Pagos:** efectivo, datáfono, Nequi, transferencias (ya configurable)
- **Facturación DIAN:** el dueño la emite desde el portal de la DIAN cuando el cliente la pide. La tirilla de TOUL no es factura electrónica y debe decirlo
- **Dos roles:** administrador (ve todo) y vendedor (solo caja). Cada uno con su propia cuenta; al inicio habrá un solo vendedor
- **Requieren aprobación del administrador** (notificación al celular): anular/devolver una venta y vender a crédito
- **Descuentos:** el vendedor puede darlos; quedan registrados y visibles en el historial como venta con descuento

### Cómo funciona el modo isla (implementado)

- **Roles:** `toul_session_context()` devuelve `{ storeId, role, displayName }`. Dueño = admin. Vendedores en `store_members`, invitados con código (`store_invites`)
- **Vendedor** solo accede a `/caja` (middleware). Vende con turno propio abierto (`cash_sessions`)
- **Anulación**: la venta se borra de `sales` y queda en `sale_voids`; inventario vuelve con `reason = 'void'`, dinero sale con `payments.type = 'sale_refund'` (negativo)
- **Aprobaciones** (`approval_requests`): anular y crédito de vendedor. Aviso push al admin (`POST /api/approvals`)
- **Turnos**: cada movimiento de `payments` entra al turno abierto de quien lo registra. Cierre a ciegas con diferencia
- Todo SQL del modo isla: `supabase/migration_v10_isla.sql`; despliegue en un solo archivo: `supabase/deploy_isla.sql`

### Ventas sin internet y conteo de inventario (implementado)

- **Sin señal la caja sigue vendiendo de contado**: la venta se guarda en el computador (`lib/isla/offline.ts`) y se envía sola al volver el internet. `sales.client_sale_id` garantiza que reintentar no duplique
- El crédito requiere internet (necesita cliente y aprobación)
- **Conteo de inventario** (`/inventory/conteo`, solo admin): conteo a ciegas, ajusta con `reason = 'count'` vía `toul_apply_inventory_count`. Lo no contado no se toca
- SQL: `supabase/migration_v11_offline_conteo.sql`; despliegue: `supabase/deploy_offline_conteo.sql`
- **Pruebas:** `npm run test:db` (PGlite + RLS real, `supabase/tests/`)

## Visión a futuro

TOUL va a ser la app indispensable para cada emprendedor que quiera tener el control de su negocio. Modelo de suscripción mensual. Fácil de entender, fácil de usar, poderosa por dentro. La herramienta que hace que un emprendedor que vende por WhatsApp tenga el mismo control que una empresa grande, sin la complejidad.

El norte siempre es: simplicidad en la superficie, potencia por dentro.
