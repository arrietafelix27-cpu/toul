-- =================================================================
-- TOUL — Que los días sean de verdad, y poder quitar un cliente
-- =================================================================
-- 1. "Sin venderse" se contaba desde que se creó la ficha del
--    producto, no desde la última venta. Y se marcaba como dormido
--    lo que acababa de llegar a la bodega. Ahora:
--      · días = desde la última venta real
--      · si nunca se ha vendido = desde que la mercancía entró
--      · nada se marca dormido antes de cumplir ese tiempo
-- 2. Un cliente se puede quitar: si nunca se le vendió se borra,
--    y si ya tiene historial se archiva para no dañar las ventas.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(store_id) WHERE is_active;

-- ── 1. El resumen del inventario, con días reales ────────────────
-- La versión anterior recibía un solo parámetro: si se deja, una
-- llamada sin argumentos queda ambigua y falla.
DROP FUNCTION IF EXISTS toul_inventory_overview(INTEGER);

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
    v_since    TIMESTAMPTZ;
    v_result   JSONB;
BEGIN
    SELECT id, GREATEST(stock_coverage_days, 1) INTO v_store, v_days
    FROM stores WHERE owner_id = auth.uid() LIMIT 1;

    IF v_store IS NULL THEN RETURN NULL; END IF;

    v_since := now() - INTERVAL '30 days';

    WITH vendido AS (
        SELECT si.product_id, si.variant_id, SUM(si.quantity) AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = v_store AND s.created_at >= v_since
        GROUP BY si.product_id, si.variant_id
    ),
    -- La última vez que se vendió cada cosa, sin límite de tiempo
    ultima_venta AS (
        SELECT si.product_id, si.variant_id, MAX(s.created_at) AS last_sale
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = v_store
        GROUP BY si.product_id, si.variant_id
    ),
    -- Desde cuándo está la mercancía en la bodega: la primera entrada
    desde AS (
        SELECT product_id, variant_id, MIN(created_at) AS owned_since
        FROM inventory_adjustments
        WHERE store_id = v_store AND quantity > 0
        GROUP BY product_id, variant_id
    ),
    unidades AS (
        SELECT
            v.id                   AS id,
            'presentacion'::TEXT   AS kind,
            p.id                   AS product_id,
            p.name                 AS product_name,
            v.name                 AS variant_name,
            p.image_url,
            v.stock                AS stock,
            v.cpp                  AS cost,
            v.sale_price           AS price,
            v.low_stock_threshold  AS manual_min,
            COALESCE((SELECT units FROM vendido WHERE variant_id = v.id), 0) AS sold_30d,
            (SELECT last_sale FROM ultima_venta WHERE variant_id = v.id) AS last_sale,
            COALESCE((SELECT owned_since FROM desde WHERE variant_id = v.id), p.created_at) AS owned_since
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.store_id = v_store AND v.is_active AND p.is_active

        UNION ALL

        SELECT
            p.id, 'producto'::TEXT, p.id, p.name, NULL, p.image_url,
            p.stock, p.cpp, p.sale_price, p.low_stock_threshold,
            COALESCE((SELECT units FROM vendido WHERE product_id = p.id AND variant_id IS NULL), 0),
            (SELECT last_sale FROM ultima_venta WHERE product_id = p.id AND variant_id IS NULL),
            COALESCE((SELECT owned_since FROM desde WHERE product_id = p.id AND variant_id IS NULL), p.created_at)
        FROM products p
        WHERE p.store_id = v_store AND p.is_active
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
    ),
    calculado AS (
        SELECT *,
            COALESCE(
                manual_min,
                GREATEST(CEIL((sold_30d::NUMERIC / 30) * v_days)::INTEGER, 1)
            ) AS min_stock,
            -- Días quieto: desde la última venta; si nunca se vendió,
            -- desde que la mercancía llegó. Nunca desde que se creó la ficha.
            GREATEST(
                FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(last_sale, owned_since))) / 86400)::INTEGER,
                0
            ) AS idle_days
        FROM unidades
    )
    SELECT jsonb_build_object(
        'coverageDays', v_days,
        'idleDays',  p_idle_days,
        'value',     COALESCE(SUM(GREATEST(stock, 0) * cost), 0),
        -- Lo mismo pero a lo que lo vendes, no a lo que te costó
        'retailValue', COALESCE(SUM(GREATEST(stock, 0) * COALESCE(price, 0)), 0),
        'units',     COALESCE(SUM(GREATEST(stock, 0)), 0),
        -- Cuánto sale al día, para saber cuánto dura la bodega
        'soldUnits30', COALESCE(SUM(sold_30d), 0),
        'items',     COUNT(*),
        'references', COUNT(DISTINCT product_id),
        'outOfStock', COUNT(*) FILTER (WHERE stock <= 0),
        'lowStock',   COUNT(*) FILTER (WHERE stock > 0 AND stock <= min_stock),
        'alerts', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.stock, a.sold_30d DESC)
            FROM (
                SELECT id, kind, product_id, product_name, variant_name, image_url,
                       stock, cost, min_stock, sold_30d, idle_days
                FROM calculado
                WHERE stock <= min_stock
                ORDER BY stock, sold_30d DESC
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
                SELECT id, kind, product_id, product_name, variant_name, image_url,
                       stock, cost, idle_days, (last_sale IS NULL) AS never_sold
                FROM calculado
                WHERE stock > 0 AND idle_days >= p_idle_days
                ORDER BY idle_days DESC
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

-- ── 2. Quitar un cliente sin dañar el historial ──────────────────
CREATE OR REPLACE FUNCTION toul_remove_customer(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   UUID;
    v_name    TEXT;
    v_debt    NUMERIC(12,2);
    v_sales   INTEGER;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() LIMIT 1;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT name, COALESCE(total_debt, 0) INTO v_name, v_debt
    FROM customers WHERE id = p_customer_id AND store_id = v_store;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese cliente no existe'; END IF;

    IF v_debt > 0 THEN
        RAISE EXCEPTION 'Ese cliente todavía te debe. Registra el abono antes de quitarlo.';
    END IF;

    SELECT COUNT(*) INTO v_sales FROM sales WHERE customer_id = p_customer_id AND store_id = v_store;

    IF v_sales = 0 THEN
        DELETE FROM credits   WHERE customer_id = p_customer_id AND store_id = v_store;
        DELETE FROM customers WHERE id = p_customer_id AND store_id = v_store;
        RETURN jsonb_build_object('success', true, 'deleted', true, 'name', v_name);
    END IF;

    -- Con ventas encima no se borra: se archiva, para que el
    -- historial y los reportes sigan cuadrando
    UPDATE customers SET is_active = false WHERE id = p_customer_id AND store_id = v_store;
    RETURN jsonb_build_object('success', true, 'deleted', false, 'name', v_name, 'sales', v_sales);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_remove_customer(UUID) TO authenticated;
