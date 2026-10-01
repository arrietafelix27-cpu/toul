-- =================================================================
-- TOUL — Catálogo por link (vitrina pública)
-- =================================================================
-- Un link tipo /t/mi-tienda que cualquiera abre sin cuenta.
-- Muestra solo lo que el dueño marca. Nunca costos, nunca stock.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. La tienda: dirección del link y si está prendido ──────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS public_slug     TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS catalog_public  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS catalog_note    TEXT;
-- Para cuando el catálogo pase de vitrina a recibir pedidos
ALTER TABLE stores ADD COLUMN IF NOT EXISTS catalog_whatsapp TEXT;

-- La dirección no se puede repetir entre tiendas
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_public_slug
    ON stores (lower(public_slug)) WHERE public_slug IS NOT NULL;

-- Solo letras, números y guiones: lo que se puede escribir en un link
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_public_slug_format;
ALTER TABLE stores ADD CONSTRAINT stores_public_slug_format
    CHECK (public_slug IS NULL OR public_slug ~ '^[a-z0-9]([a-z0-9-]{1,30})[a-z0-9]$');

-- ── 2. Qué se publica ────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE combos   ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_public ON products (store_id) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_combos_public   ON combos   (store_id) WHERE is_public;

-- ── 3. Lo único que ve un visitante ──────────────────────────────
-- SECURITY DEFINER: salta las reglas de aislamiento porque devuelve
-- a mano solo los campos públicos. No expone costo, stock ni ventas.
CREATE OR REPLACE FUNCTION toul_public_catalog(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store   stores%ROWTYPE;
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

    WITH producto AS (
        SELECT
            p.id,
            'producto'::TEXT AS kind,
            p.name,
            p.description,
            p.image_url,
            COALESCE(p.images, '{}') AS images,
            c.name AS category,
            p.created_at,
            -- Con presentaciones el precio es un rango
            COALESCE(
                (SELECT min(v.sale_price) FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active),
                p.sale_price
            ) AS price_min,
            COALESCE(
                (SELECT max(v.sale_price) FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active),
                p.sale_price
            ) AS price_max,
            COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('name', v.name, 'price', v.sale_price) ORDER BY v.sale_price)
                   FROM product_variants v
                  WHERE v.product_id = p.id AND v.is_active),
                '[]'::JSONB
            ) AS presentations
        FROM products p
        LEFT JOIN product_categories c ON c.id = p.category_id
        WHERE p.store_id = v_store.id AND p.is_active AND p.is_public
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
