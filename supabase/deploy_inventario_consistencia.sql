-- =================================================================
-- TOUL — Inventario: una sola definición (Paso 3)
-- =================================================================
-- Va después de deploy_inventario_cuentas.sql. Tres cosas:
--
--   1. Una sola regla para "agotado" y "por acabarse": la usan
--      Inventario, el Catálogo y TOUL AI. Se mira cada presentación
--      (no el producto entero), contra su mínimo (el que puso el dueño
--      o el automático por lo que se vende en 30 días, con combos), y
--      el stock negativo cuenta como agotado.
--   2. El resumen de Inventario usa esa regla y trae la referencia,
--      para que los filtros busquen también por referencia.
--   3. El detalle de una compra dice la presentación de cada renglón,
--      compara el costo solo contra la misma presentación y dice con
--      qué cuenta se pagó.
--
-- No cambia ningún dato: solo funciones. Se puede correr más de una vez.
-- =================================================================


-- =================================================================
-- 1. Agotado, por acabarse o bien
-- =================================================================
-- Una fila por cada cosa que se cuenta en la bodega: cada presentación
-- activa, y cada producto activo que no tiene presentaciones.
--   · agotado: le quedan 0 o menos
--   · pocas:   le quedan más de 0 pero no más que su mínimo
--   · bien:    tiene más que su mínimo
-- El mínimo: el que puso el dueño o, si no puso, lo que se vende en los
-- días de respaldo de la tienda (con lo que salió en combos), y nunca
-- menos de 1.
-- Con `p_producto` solo trae ese producto (para su ficha).
CREATE OR REPLACE FUNCTION public.toul_estado_stock(p_producto uuid DEFAULT NULL, p_store uuid DEFAULT NULL)
RETURNS TABLE (
    kind          text,
    id            uuid,
    product_id    uuid,
    variant_id    uuid,
    product_name  text,
    variant_name  text,
    reference     text,
    image_url     text,
    stock         numeric,
    cost          numeric,
    price         numeric,
    min_stock     integer,
    minimo_manual boolean,
    sold_30d      numeric,
    last_sale     timestamptz,
    owned_since   timestamptz,
    estado        text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH tienda AS (
        SELECT s.id AS store_id, GREATEST(s.stock_coverage_days, 1) AS dias
          FROM stores s
         WHERE s.id = COALESCE(p_store, toul_current_store_id())
    ),
    -- Lo vendido en 30 días y la última venta, con lo de los combos
    ventas AS (
        SELECT u.product_id, u.variant_id, u.unidades, u.ultima_venta
          FROM tienda t
         CROSS JOIN LATERAL toul_unidades_vendidas(t.store_id, now() - interval '30 days', p_producto) u
    ),
    -- Desde cuándo está la mercancía en la bodega: la primera entrada
    desde AS (
        SELECT ia.product_id, ia.variant_id, MIN(ia.created_at) AS owned_since
          FROM inventory_adjustments ia
          JOIN tienda t ON t.store_id = ia.store_id
         WHERE ia.quantity > 0
           AND (p_producto IS NULL OR ia.product_id = p_producto)
         GROUP BY ia.product_id, ia.variant_id
    ),
    unidades AS (
        SELECT 'presentacion'::text AS kind, v.id, p.id AS product_id, v.id AS variant_id,
               p.name AS product_name, v.name AS variant_name, p.reference, p.image_url,
               v.stock::numeric AS stock, v.cpp::numeric AS cost, v.sale_price::numeric AS price,
               v.low_stock_threshold AS manual_min,
               COALESCE((SELECT x.unidades FROM ventas x WHERE x.variant_id = v.id), 0) AS sold_30d,
               (SELECT x.ultima_venta FROM ventas x WHERE x.variant_id = v.id) AS last_sale,
               COALESCE((SELECT d.owned_since FROM desde d WHERE d.variant_id = v.id), p.created_at) AS owned_since
          FROM product_variants v
          JOIN products p ON p.id = v.product_id
          JOIN tienda t ON t.store_id = v.store_id
         WHERE v.is_active AND p.is_active
           AND (p_producto IS NULL OR p.id = p_producto)

        UNION ALL

        SELECT 'producto'::text, p.id, p.id, NULL::uuid,
               p.name, NULL::text, p.reference, p.image_url,
               p.stock::numeric, p.cpp::numeric, p.sale_price::numeric,
               p.low_stock_threshold,
               COALESCE((SELECT x.unidades FROM ventas x WHERE x.product_id = p.id AND x.variant_id IS NULL), 0),
               (SELECT x.ultima_venta FROM ventas x WHERE x.product_id = p.id AND x.variant_id IS NULL),
               COALESCE((SELECT d.owned_since FROM desde d WHERE d.product_id = p.id AND d.variant_id IS NULL), p.created_at)
          FROM products p
          JOIN tienda t ON t.store_id = p.store_id
         WHERE p.is_active
           AND (p_producto IS NULL OR p.id = p_producto)
           AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
    ),
    con_minimo AS (
        SELECT u.*,
               COALESCE(u.manual_min, GREATEST(CEIL((u.sold_30d / 30) * t.dias)::integer, 1)) AS minimo
          FROM unidades u
         CROSS JOIN tienda t
    )
    SELECT c.kind, c.id, c.product_id, c.variant_id, c.product_name, c.variant_name,
           c.reference, c.image_url, c.stock, c.cost, c.price,
           c.minimo, c.manual_min IS NOT NULL, c.sold_30d, c.last_sale, c.owned_since,
           CASE WHEN c.stock <= 0 THEN 'agotado'
                WHEN c.stock <= c.minimo THEN 'pocas'
                ELSE 'bien' END
      FROM con_minimo c
$$;

GRANT EXECUTE ON FUNCTION public.toul_estado_stock(uuid, uuid) TO authenticated;


-- =================================================================
-- 2. El resumen de Inventario, con la misma regla
-- =================================================================
-- Igual a la de deploy_inventario_cuentas.sql: los mismos números. Lo
-- único nuevo es que las alertas y los quietos traen la referencia.
CREATE OR REPLACE FUNCTION toul_inventory_overview(
    p_limit INTEGER DEFAULT 60,
    p_idle_days INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store    UUID;
    v_days     INTEGER;
    v_result   JSONB;
BEGIN
    SELECT id, GREATEST(stock_coverage_days, 1) INTO v_store, v_days
    FROM stores WHERE owner_id = auth.uid() LIMIT 1;

    IF v_store IS NULL THEN RETURN NULL; END IF;

    WITH calculado AS (
        SELECT e.*,
            -- Días quieto: desde la última venta; si nunca se vendió,
            -- desde que la mercancía llegó. Nunca desde que se creó la ficha.
            GREATEST(
                FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(e.last_sale, e.owned_since))) / 86400)::INTEGER,
                0
            ) AS idle_days
        FROM toul_estado_stock(NULL, v_store) e
    )
    SELECT jsonb_build_object(
        'coverageDays', v_days,
        'idleDays',  p_idle_days,
        -- Plata en mercancía: también lo escondido que todavía tiene stock
        -- (toul_plata_en_mercancia). El resto de esta función sigue siendo
        -- solo lo que está a la venta
        'value',     (toul_plata_en_mercancia(v_store)->>'costo')::numeric,
        -- Lo mismo pero a lo que lo vendes, no a lo que te costó
        'retailValue', (toul_plata_en_mercancia(v_store)->>'venta')::numeric,
        'hiddenValue', (toul_plata_en_mercancia(v_store)->>'escondido')::numeric,
        'units',     COALESCE(SUM(GREATEST(stock, 0)), 0),
        -- Cuánto sale al día, para saber cuánto dura la bodega
        'soldUnits30', COALESCE(SUM(sold_30d), 0),
        'items',     COUNT(*),
        'references', COUNT(DISTINCT product_id),
        'outOfStock', COUNT(*) FILTER (WHERE estado = 'agotado'),
        'lowStock',   COUNT(*) FILTER (WHERE estado = 'pocas'),
        'alerts', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.stock, a.sold_30d DESC)
            FROM (
                SELECT c.id, c.kind, c.product_id, c.product_name, c.variant_name, c.reference, c.image_url,
                       c.stock, c.cost, c.min_stock, c.sold_30d, c.idle_days
                FROM calculado c
                WHERE c.estado <> 'bien'
                ORDER BY c.stock, c.sold_30d DESC
                LIMIT p_limit
            ) a
        ), '[]'::JSONB),
        -- Plata dormida: con existencias y de verdad sin moverse
        'dormantValue', COALESCE(SUM(GREATEST(stock, 0) * cost)
                                 FILTER (WHERE stock > 0 AND idle_days >= p_idle_days), 0),
        'dormantCount', COUNT(*) FILTER (WHERE stock > 0 AND idle_days >= p_idle_days),
        'dormant', COALESCE((
            SELECT jsonb_agg(row_to_json(d) ORDER BY d.idle_days DESC)
            FROM (
                SELECT c.id, c.kind, c.product_id, c.product_name, c.variant_name, c.reference, c.image_url,
                       c.stock, c.cost, c.idle_days, (c.last_sale IS NULL) AS never_sold
                FROM calculado c
                WHERE c.stock > 0 AND c.idle_days >= p_idle_days
                ORDER BY c.idle_days DESC
                LIMIT p_limit
            ) d
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM calculado;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_inventory_overview(INTEGER, INTEGER) TO authenticated;


-- =================================================================
-- 3. El detalle de una compra
-- =================================================================
-- Igual a la de deploy_inventario_cuentas.sql, salvo tres cosas:
--   · cada renglón dice su presentación;
--   · "lo que costaba la vez anterior" es de la misma presentación
--     (antes comparaba contra cualquier presentación del producto);
--   · dice con qué cuenta se pagó lo que se pagó al comprar (por el
--     nombre de hoy de esa cuenta, o "Plata mía").
CREATE OR REPLACE FUNCTION toul_purchase_detail(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_when  TIMESTAMPTZ;
    v_res   JSONB;
BEGIN
    SELECT store_id, created_at INTO v_store, v_when
      FROM purchases WHERE id = p_purchase_id;
    IF v_store IS NULL THEN RETURN NULL; END IF;

    SELECT jsonb_build_object(
        'id',        p.id,
        'fecha',     p.created_at,
        'subtotal',  round(p.subtotal),
        'total',     round(p.total),
        'metodo',    p.payment_method,
        'credito',   p.is_credit,
        'anulada',   p.status IS NOT DISTINCT FROM 'voided',
        'proveedor', CASE WHEN pr.id IS NULL THEN NULL ELSE
                        jsonb_build_object('id', pr.id, 'nombre', pr.name, 'telefono', pr.phone) END,
        -- Con qué se pagó al comprar. NULL si no se pagó nada en ese momento
        'cuenta', (
            SELECT jsonb_build_object(
                       'nombre',    CASE WHEN pay.own_money THEN 'Plata mía' ELSE COALESCE(pm.name, pay.method) END,
                       'plataMia',  pay.own_money,
                       'monto',     round(pay.amount))
              FROM payments pay
              LEFT JOIN payment_methods pm ON pm.id = pay.method_id
             WHERE pay.reference_id = p.id
               AND pay.type = 'purchase'
             ORDER BY pay.created_at
             LIMIT 1
        ),
        -- Si quedó a crédito: cuánto falta y cuándo vence
        'deuda', (
            SELECT jsonb_build_object(
                       'monto',  round(d.amount),
                       'falta',  round(d.remaining_amount),
                       'vence',  d.due_date,
                       'estado', d.status)
              FROM provider_debts d
             WHERE d.purchase_id = p.id
             ORDER BY d.created_at
             LIMIT 1
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',            pi.id,
                       'nombre',        pd.name,
                       'presentacion',  pv.name,
                       'imagen',        pd.image_url,
                       'cantidad',      pi.quantity,
                       'costo',         round(pi.unit_cost),
                       'total',         round(pi.total_cost),
                       -- Lo que costaba la última vez que compraste ESA
                       -- presentación (o el producto, si no tiene)
                       'costoAnterior', round(ant.unit_cost),
                       'fechaAnterior', ant.created_at
                   ) ORDER BY pd.name, pv.name)
              FROM purchase_items pi
              JOIN products pd ON pd.id = pi.product_id
              LEFT JOIN product_variants pv ON pv.id = pi.variant_id
              LEFT JOIN LATERAL (
                  SELECT pi2.unit_cost, p2.created_at
                    FROM purchase_items pi2
                    JOIN purchases p2 ON p2.id = pi2.purchase_id
                   WHERE pi2.product_id = pi.product_id
                     AND pi2.variant_id IS NOT DISTINCT FROM pi.variant_id
                     AND p2.store_id = v_store
                     AND p2.created_at < v_when
                     AND p2.status IS DISTINCT FROM 'voided'
                   ORDER BY p2.created_at DESC
                   LIMIT 1
              ) ant ON true
             WHERE pi.purchase_id = p.id
        ), '[]'::jsonb)
    )
      INTO v_res
      FROM purchases p
      LEFT JOIN providers pr ON pr.id = p.provider_id
     WHERE p.id = p_purchase_id;

    RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_purchase_detail(UUID) TO authenticated;


NOTIFY pgrst, 'reload schema';
