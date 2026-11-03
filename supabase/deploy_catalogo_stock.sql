-- =================================================================
-- TOUL — Catálogo por link: solo lo que tiene stock
-- =================================================================
-- Un switch por tienda. Encendido (así arrancan todas), el link
-- esconde lo agotado:
--   · productos sin stock
--   · presentaciones sin stock (el producto sale si le queda alguna)
--   · combos que no alcanzan a armarse ni una vez
-- Apagado, el link muestra todo lo publicado, como antes.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. La elección de cada tienda ────────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS catalog_in_stock_only BOOLEAN NOT NULL DEFAULT true;

-- ── 2. Qué tiene stock ───────────────────────────────────────────
-- La misma regla del inventario (toul_inventory_overview): si el
-- producto tiene presentaciones activas cuenta cada presentación; si
-- no, cuenta el producto. Un combo se puede armar si cada componente
-- alcanza para uno, como lo valida la venta.
-- SECURITY INVOKER: el dueño solo ve su tienda (RLS). El link la usa
-- desde toul_public_catalog, que ya entra con permisos propios.
CREATE OR REPLACE FUNCTION toul_catalogo_con_stock(p_store UUID)
RETURNS TABLE (kind TEXT, id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT 'producto'::TEXT, p.id
      FROM products p
     WHERE p.store_id = p_store AND p.is_active
       AND CASE
               WHEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
               THEN EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.stock > 0)
               ELSE p.stock > 0
           END

    UNION ALL

    SELECT 'combo'::TEXT, cb.id
      FROM combos cb
     WHERE cb.store_id = p_store AND cb.is_active
       AND EXISTS (SELECT 1 FROM combo_items ci WHERE ci.combo_id = cb.id)
       -- Si el mismo componente va en dos filas, se suma lo que pide
       AND NOT EXISTS (
           SELECT 1
             FROM (SELECT ci.product_id, ci.variant_id, SUM(ci.quantity) AS pide
                     FROM combo_items ci
                    WHERE ci.combo_id = cb.id
                    GROUP BY ci.product_id, ci.variant_id) c
             LEFT JOIN product_variants v ON v.id = c.variant_id
             LEFT JOIN products pr ON pr.id = c.product_id
            WHERE COALESCE(CASE WHEN c.variant_id IS NOT NULL THEN v.stock ELSE pr.stock END, 0) < c.pide
       )
$$;

REVOKE ALL ON FUNCTION toul_catalogo_con_stock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toul_catalogo_con_stock(UUID) TO authenticated;

-- ── 3. El link usa esa regla ─────────────────────────────────────
-- Igual que en deploy_catalogo_publico.sql, más el filtro de stock.
-- Sigue sin entregar costos ni cuántas unidades hay.
CREATE OR REPLACE FUNCTION toul_public_catalog(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store   stores%ROWTYPE;
    v_solo    BOOLEAN;
    v_items   JSONB;
BEGIN
    SELECT * INTO v_store
    FROM stores
    WHERE lower(public_slug) = lower(trim(p_slug))
      AND catalog_public
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_solo := v_store.catalog_in_stock_only;

    WITH disponible AS (
        SELECT d.kind, d.id FROM toul_catalogo_con_stock(v_store.id) d
    ),
    producto AS (
        SELECT
            p.id,
            'producto'::TEXT AS kind,
            p.name,
            p.description,
            p.image_url,
            COALESCE(p.images, '{}') AS images,
            c.name AS category,
            p.created_at,
            -- Con presentaciones el precio es un rango, solo de las que se muestran
            COALESCE(
                (SELECT min(v.sale_price) FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active AND (NOT v_solo OR v.stock > 0)),
                p.sale_price
            ) AS price_min,
            COALESCE(
                (SELECT max(v.sale_price) FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active AND (NOT v_solo OR v.stock > 0)),
                p.sale_price
            ) AS price_max,
            COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('name', v.name, 'price', v.sale_price) ORDER BY v.sale_price)
                   FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active AND (NOT v_solo OR v.stock > 0)),
                '[]'::JSONB
            ) AS presentations
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE p.store_id = v_store.id AND p.is_active AND p.is_public
          AND (NOT v_solo OR p.id IN (SELECT d.id FROM disponible d WHERE d.kind = 'producto'))
    ),
    combo AS (
        SELECT
            cb.id,
            'combo'::TEXT AS kind,
            cb.name,
            NULL::TEXT AS description,
            cb.image_url,
            '{}'::TEXT[] AS images,
            cc.name AS category,
            cb.created_at,
            cb.sale_price AS price_min,
            cb.sale_price AS price_max,
            '[]'::JSONB AS presentations
        FROM combos cb
        LEFT JOIN product_categories cc ON cc.id = cb.category_id
        WHERE cb.store_id = v_store.id AND cb.is_active AND cb.is_public
          AND (NOT v_solo OR cb.id IN (SELECT d.id FROM disponible d WHERE d.kind = 'combo'))
    ),
    todo AS (
        SELECT * FROM producto
        UNION ALL
        SELECT * FROM combo
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', id,
            'kind', kind,
            'name', name,
            'description', description,
            'image', image_url,
            'images', to_jsonb(images),
            'category', category,
            'priceMin', price_min,
            'priceMax', price_max,
            'presentations', presentations
        ) ORDER BY name
    ), '[]'::JSONB)
    INTO v_items
    FROM todo;

    RETURN jsonb_build_object(
        'store', jsonb_build_object(
            'name', v_store.name,
            'logo', v_store.logo_url,
            'note', v_store.catalog_note,
            'whatsapp', v_store.catalog_whatsapp,
            'slug', v_store.public_slug
        ),
        'items', v_items
    );
END;
$$;

REVOKE ALL ON FUNCTION toul_public_catalog(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toul_public_catalog(TEXT) TO anon, authenticated;
