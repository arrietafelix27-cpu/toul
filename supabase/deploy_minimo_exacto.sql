-- =================================================================
-- TOUL · Inventario: el mínimo automático, exacto
-- =================================================================
-- La regla de stock (toul_estado_stock) sacaba el mínimo automático
-- dividiendo primero lo vendido entre 30. Esa división se redondea en
-- el decimal 20 y a veces hacia arriba: con 30 días de respaldo, 5
-- vendidas daban 5,0000000000000000001 y el mínimo salía 6.
-- Pasaba cuando lo vendido en 30 días es 2, 5, 8, 11, 14…: el mínimo
-- salía con 1 de más y "Compra N" pedía 2 de más.
--
-- Ahora multiplica primero y divide al final: 5 × 30 / 30 = 5 exacto.
-- Es la misma cuenta, sin el redondeo. Lo demás de la regla queda igual.
--
-- Qué cambia: el mínimo automático de los productos afectados (baja 1),
-- su "Compra N" en Compra sugerida (baja 2) y, si estaban justo en el
-- mínimo, pasan de "quedan pocas" a "bien". El mínimo que puso el dueño
-- no cambia. No cambia ningún dato guardado, ni ventas, ni Ganaste, ni
-- el valor del inventario, ni ningún reporte: solo esta función.
--
-- Requiere deploy_inventario_consistencia.sql. Se puede correr más de
-- una vez.
-- =================================================================

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
               COALESCE(u.manual_min, GREATEST(CEIL(u.sold_30d * t.dias / 30)::integer, 1)) AS minimo
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

SELECT 'Listo: el mínimo automático ya no sale con 1 de más' AS resultado;
