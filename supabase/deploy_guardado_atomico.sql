-- =================================================================
-- TOUL v19 — Guardar de una sola vez
-- =================================================================
-- Dos pantallas guardaban en varios pasos desde el navegador, y un
-- error en la mitad dejaba daño:
--
--   1. Editar un combo borraba TODOS sus productos y después
--      insertaba los nuevos. Si fallaba el segundo paso, el combo
--      quedaba vacío y no había vuelta atrás.
--   2. Crear un producto con presentaciones eran tres escrituras
--      seguidas. Si se caía en la mitad, borraba el producto —pero
--      el aviso decía "se creó, edítalo"— y si se cerraba el
--      navegador justo ahí, quedaba un producto sin presentaciones.
--
-- Una función de base de datos corre dentro de una transacción: o
-- queda todo, o no queda nada. No hay estado a medias.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. Guardar un combo completo ─────────────────────────────────
CREATE OR REPLACE FUNCTION toul_save_combo(
    p_combo_id    UUID,
    p_name        TEXT,
    p_category_id UUID,
    p_sale_price  NUMERIC,
    p_image_url   TEXT,
    p_items       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   UUID;
    v_cuantos INTEGER;
BEGIN
    SELECT store_id INTO v_store FROM combos WHERE id = p_combo_id;
    IF v_store IS NULL THEN
        RAISE EXCEPTION 'Ese combo no existe';
    END IF;

    -- Un combo sin productos adentro no es un combo
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'El combo necesita al menos un producto';
    END IF;

    UPDATE combos
       SET name        = trim(p_name),
           category_id = p_category_id,
           sale_price  = p_sale_price,
           image_url   = p_image_url
     WHERE id = p_combo_id;

    -- Si algo de aquí abajo falla, el DELETE se deshace solo
    DELETE FROM combo_items WHERE combo_id = p_combo_id;

    INSERT INTO combo_items (combo_id, product_id, variant_id, quantity)
    SELECT p_combo_id,
           (i->>'productId')::uuid,
           NULLIF(i->>'variantId', '')::uuid,
           GREATEST((i->>'quantity')::int, 1)
      FROM jsonb_array_elements(p_items) i;

    GET DIAGNOSTICS v_cuantos = ROW_COUNT;
    RETURN jsonb_build_object('success', true, 'items', v_cuantos);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_save_combo(UUID, TEXT, UUID, NUMERIC, TEXT, JSONB) TO authenticated;

-- ── 2. Crear un producto con presentaciones ──────────────────────
-- payload: { name, reference, categoryId, imageUrl,
--            attributes: ["Tamaño", ...],
--            variants: [{ name, price, cost }] }
CREATE OR REPLACE FUNCTION toul_create_variant_product(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   UUID;
    v_product UUID;
    v_name    TEXT := trim(COALESCE(payload->>'name', ''));
    v_ref     TEXT := NULLIF(trim(COALESCE(payload->>'reference', '')), '');
    v_vars    JSONB := COALESCE(payload->'variants', '[]'::jsonb);
    v_attrs   JSONB := COALESCE(payload->'attributes', '[]'::jsonb);
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    IF v_store IS NULL THEN
        RAISE EXCEPTION 'No encontramos tu tienda';
    END IF;

    IF v_name = '' THEN
        RAISE EXCEPTION 'El producto necesita un nombre';
    END IF;
    IF jsonb_array_length(v_vars) = 0 THEN
        RAISE EXCEPTION 'El producto necesita al menos una presentación';
    END IF;

    INSERT INTO products (store_id, name, reference, category_id, sale_price,
                          cost_price, cpp, stock, image_url, is_active)
    VALUES (v_store, v_name, v_ref,
            NULLIF(payload->>'categoryId', '')::uuid,
            0, 0, 0, 0,
            NULLIF(payload->>'imageUrl', ''), true)
    RETURNING id INTO v_product;

    IF jsonb_array_length(v_attrs) > 0 THEN
        INSERT INTO product_variant_attributes (product_id, name)
        SELECT v_product, trim(a#>>'{}')
          FROM jsonb_array_elements(v_attrs) a
         WHERE trim(a#>>'{}') <> '';
    END IF;

    INSERT INTO product_variants (store_id, product_id, name, sale_price, cost_price, cpp, is_active)
    SELECT v_store, v_product,
           trim(v->>'name'),
           COALESCE((v->>'price')::numeric, 0),
           COALESCE((v->>'cost')::numeric, 0),
           COALESCE((v->>'cost')::numeric, 0),
           true
      FROM jsonb_array_elements(v_vars) v
     WHERE trim(COALESCE(v->>'name', '')) <> '';

    RETURN jsonb_build_object('success', true, 'productId', v_product);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_create_variant_product(JSONB) TO authenticated;
