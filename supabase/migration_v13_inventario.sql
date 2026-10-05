-- =================================================================
-- TOUL — Inventario que no miente
-- =================================================================
-- Tres cosas:
--   1. Cada presentación guarda su propio stock (antes había que
--      sumar los movimientos a mano en cada pantalla).
--   2. El mínimo de "stock bajo" se calcula solo, según lo que se
--      vende, con los días de respaldo que elija la tienda.
--   3. Una función que entrega el valor de la bodega y las alertas
--      contando las presentaciones, no solo los productos.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. Stock por presentación ────────────────────────────────────
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inv_adj_variant ON inventory_adjustments(variant_id) WHERE variant_id IS NOT NULL;

-- Ponerlo al día con lo que ya hay registrado
UPDATE product_variants v
SET stock = COALESCE((
    SELECT SUM(ia.quantity) FROM inventory_adjustments ia WHERE ia.variant_id = v.id
), 0);

-- El mismo disparador que mantiene el stock del producto mantiene
-- ahora el de la presentación
CREATE OR REPLACE FUNCTION sync_product_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_product UUID;
    v_variant UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product := OLD.product_id;
        v_variant := OLD.variant_id;
    ELSE
        v_product := NEW.product_id;
        v_variant := NEW.variant_id;
    END IF;

    IF v_product IS NOT NULL THEN
        UPDATE products SET stock = COALESCE(
            (SELECT SUM(quantity) FROM inventory_adjustments WHERE product_id = v_product), 0
        ) WHERE id = v_product;
    END IF;

    IF v_variant IS NOT NULL THEN
        UPDATE product_variants SET stock = COALESCE(
            (SELECT SUM(quantity) FROM inventory_adjustments WHERE variant_id = v_variant), 0
        ) WHERE id = v_variant;
    END IF;

    -- Si cambió de presentación, la anterior también hay que ponerla al día
    IF TG_OP = 'UPDATE' AND OLD.variant_id IS NOT NULL AND OLD.variant_id IS DISTINCT FROM NEW.variant_id THEN
        UPDATE product_variants SET stock = COALESCE(
            (SELECT SUM(quantity) FROM inventory_adjustments WHERE variant_id = OLD.variant_id), 0
        ) WHERE id = OLD.variant_id;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.sync_product_stock() SECURITY DEFINER;
ALTER FUNCTION public.sync_product_stock() SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS trg_sync_product_stock ON inventory_adjustments;
CREATE TRIGGER trg_sync_product_stock
AFTER INSERT OR UPDATE OR DELETE ON inventory_adjustments
FOR EACH ROW EXECUTE FUNCTION sync_product_stock();

-- ── 2. El mínimo se calcula solo ─────────────────────────────────
-- Cuántos días de respaldo quiere tener la tienda
ALTER TABLE stores ADD COLUMN IF NOT EXISTS stock_coverage_days INTEGER NOT NULL DEFAULT 7;

-- NULL = automático. Un número = lo puso el dueño y manda.
-- Nadie pudo fijarlo nunca desde la app, así que el 5 que traen
-- todos es el valor por defecto, no una decisión.
ALTER TABLE products         ALTER COLUMN low_stock_threshold DROP DEFAULT;
ALTER TABLE product_variants ALTER COLUMN low_stock_threshold DROP DEFAULT;
UPDATE products         SET low_stock_threshold = NULL WHERE low_stock_threshold = 5;
UPDATE product_variants SET low_stock_threshold = NULL WHERE low_stock_threshold = 5;

-- ── 3. El resumen del inventario, contando presentaciones ────────
-- Devuelve el valor de la bodega, cuánto hay y qué necesita
-- atención. Las alertas salen por presentación: en ropa, lo que se
-- acaba es la talla, no la referencia.
CREATE OR REPLACE FUNCTION toul_inventory_overview(p_limit INTEGER DEFAULT 60)
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

    -- Se mira el último mes para saber a qué ritmo sale cada cosa
    v_since := now() - INTERVAL '30 days';

    WITH vendido AS (
        SELECT si.product_id, si.variant_id, SUM(si.quantity) AS units
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.store_id = v_store AND s.created_at >= v_since
        GROUP BY si.product_id, si.variant_id
    ),
    -- Cada fila es una unidad de stock real: la presentación si el
    -- producto las tiene, o el producto mismo si no
    unidades AS (
        SELECT
            v.id                           AS id,
            'presentacion'::TEXT           AS kind,
            p.id                           AS product_id,
            p.name                         AS product_name,
            v.name                         AS variant_name,
            p.image_url,
            v.stock                        AS stock,
            v.cpp                          AS cost,
            v.low_stock_threshold          AS manual_min,
            COALESCE((SELECT units FROM vendido WHERE variant_id = v.id), 0) AS sold_30d
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.store_id = v_store AND v.is_active AND p.is_active

        UNION ALL

        SELECT
            p.id, 'producto'::TEXT, p.id, p.name, NULL, p.image_url,
            p.stock, p.cpp, p.low_stock_threshold,
            COALESCE((SELECT units FROM vendido WHERE product_id = p.id AND variant_id IS NULL), 0)
        FROM products p
        WHERE p.store_id = v_store AND p.is_active
          AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
    ),
    calculado AS (
        SELECT *,
            -- El mínimo: lo que el dueño fijó, o lo que se vende en
            -- los días de respaldo que eligió (mínimo 1)
            COALESCE(
                manual_min,
                GREATEST(CEIL((sold_30d::NUMERIC / 30) * v_days)::INTEGER, 1)
            ) AS min_stock
        FROM unidades
    )
    SELECT jsonb_build_object(
        'coverageDays', v_days,
        'value',   COALESCE(SUM(GREATEST(stock, 0) * cost), 0),
        'units',   COALESCE(SUM(GREATEST(stock, 0)), 0),
        'items',   COUNT(*),
        'outOfStock', COUNT(*) FILTER (WHERE stock <= 0),
        'lowStock',   COUNT(*) FILTER (WHERE stock > 0 AND stock <= min_stock),
        'alerts', COALESCE((
            SELECT jsonb_agg(row_to_json(a) ORDER BY a.stock, a.sold_30d DESC)
            FROM (
                SELECT id, kind, product_id, product_name, variant_name, image_url,
                       stock, cost, min_stock, sold_30d
                FROM calculado
                WHERE stock <= min_stock
                ORDER BY stock, sold_30d DESC
                LIMIT p_limit
            ) a
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM calculado;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_inventory_overview(INTEGER) TO authenticated;
