-- =================================================================
-- TOUL — Un cliente, un registro
-- =================================================================
-- Al vender a crédito escribiendo el nombre (en vez de escogerlo de
-- la lista), se creaba un cliente NUEVO cada vez. El mismo señor
-- quedaba partido en varios registros, cada uno con su pedazo de la
-- deuda, y al abrir uno "faltaban" sus otras ventas.
--
--   1. La venta ahora reutiliza el cliente que ya existe.
--   2. Se pueden unir los que ya quedaron repetidos.
--   3. Se le puede cambiar el cliente a una venta ya hecha.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. Buscar antes de crear ─────────────────────────────────────
CREATE OR REPLACE FUNCTION toul_find_or_create_customer(
    p_store_id UUID,
    p_name     TEXT,
    p_phone    TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id    UUID;
    v_name  TEXT := trim(COALESCE(p_name, ''));
    v_phone TEXT := NULLIF(trim(COALESCE(p_phone, '')), '');
BEGIN
    IF v_name = '' THEN RETURN NULL; END IF;

    -- El teléfono manda: es lo único que de verdad identifica a alguien
    IF v_phone IS NOT NULL THEN
        SELECT id INTO v_id FROM customers
         WHERE store_id = p_store_id
           AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = regexp_replace(v_phone, '\D', '', 'g')
           AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') <> ''
         ORDER BY is_active DESC, created_at
         LIMIT 1;
        IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    END IF;

    -- Si no, por nombre, sin importar mayúsculas ni espacios de más
    SELECT id INTO v_id FROM customers
     WHERE store_id = p_store_id
       AND lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
     ORDER BY is_active DESC, created_at
     LIMIT 1;
    IF v_id IS NOT NULL THEN
        -- Si llega con teléfono y el registro no lo tenía, se completa
        IF v_phone IS NOT NULL THEN
            UPDATE customers SET phone = v_phone
             WHERE id = v_id AND COALESCE(trim(phone), '') = '';
        END IF;
        RETURN v_id;
    END IF;

    INSERT INTO customers (store_id, name, phone, total_debt)
    VALUES (p_store_id, v_name, v_phone, 0)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_find_or_create_customer(UUID, TEXT, TEXT) TO authenticated;

-- ── 2. Unir los que ya quedaron repetidos ────────────────────────
CREATE OR REPLACE FUNCTION toul_merge_customers(p_keep UUID, p_merge UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store  UUID;
    v_debt   NUMERIC(12,2);
    v_sales  INTEGER;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() LIMIT 1;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF p_keep = p_merge THEN RAISE EXCEPTION 'Son el mismo cliente'; END IF;

    IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_keep  AND store_id = v_store)
    OR NOT EXISTS (SELECT 1 FROM customers WHERE id = p_merge AND store_id = v_store) THEN
        RAISE EXCEPTION 'Ese cliente no existe';
    END IF;

    SELECT COALESCE(total_debt, 0) INTO v_debt FROM customers WHERE id = p_merge;
    SELECT COUNT(*) INTO v_sales FROM sales WHERE customer_id = p_merge AND store_id = v_store;

    UPDATE sales   SET customer_id = p_keep WHERE customer_id = p_merge AND store_id = v_store;
    UPDATE credits SET customer_id = p_keep WHERE customer_id = p_merge AND store_id = v_store;

    UPDATE customers
       SET total_debt = COALESCE(total_debt, 0) + v_debt,
           phone = COALESCE(NULLIF(trim(phone), ''), (SELECT NULLIF(trim(phone), '') FROM customers WHERE id = p_merge))
     WHERE id = p_keep;

    DELETE FROM customers WHERE id = p_merge AND store_id = v_store;

    RETURN jsonb_build_object('success', true, 'movedSales', v_sales, 'movedDebt', v_debt);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_merge_customers(UUID, UUID) TO authenticated;

-- ── 3. Cambiarle el cliente a una venta ya hecha ─────────────────
-- Si la venta fue a crédito, la deuda se muda con ella.
CREATE OR REPLACE FUNCTION toul_change_sale_customer(p_sale_id UUID, p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store    UUID;
    v_sale     sales%ROWTYPE;
    v_pending  NUMERIC(12,2);
    v_name     TEXT;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() LIMIT 1;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = v_store;
    IF NOT FOUND THEN RAISE EXCEPTION 'Esa venta no existe'; END IF;

    IF p_customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM customers WHERE id = p_customer_id AND store_id = v_store
    ) THEN
        RAISE EXCEPTION 'Ese cliente no existe';
    END IF;

    IF v_sale.is_credit AND p_customer_id IS NULL THEN
        RAISE EXCEPTION 'Una venta a crédito tiene que quedar con un cliente';
    END IF;

    IF v_sale.customer_id IS NOT DISTINCT FROM p_customer_id THEN
        RETURN jsonb_build_object('success', true, 'changed', false);
    END IF;

    -- Lo que quedó debiendo esta venta. Los abonos del cliente no
    -- van atados a una venta, así que nunca se mueve más de lo que
    -- esa persona todavía debe en total.
    SELECT COALESCE(SUM(amount), 0) INTO v_pending
      FROM credits
     WHERE sale_id = p_sale_id AND store_id = v_store AND type = 'debt';

    IF v_sale.customer_id IS NOT NULL THEN
        SELECT LEAST(v_pending, GREATEST(COALESCE(total_debt, 0), 0))
          INTO v_pending
          FROM customers WHERE id = v_sale.customer_id;
    END IF;
    IF v_pending IS NULL OR v_pending < 0 THEN v_pending := 0; END IF;

    IF v_pending > 0 AND v_sale.customer_id IS NOT NULL THEN
        UPDATE customers SET total_debt = GREATEST(COALESCE(total_debt, 0) - v_pending, 0)
         WHERE id = v_sale.customer_id AND store_id = v_store;
    END IF;
    IF v_pending > 0 AND p_customer_id IS NOT NULL THEN
        UPDATE customers SET total_debt = COALESCE(total_debt, 0) + v_pending
         WHERE id = p_customer_id AND store_id = v_store;
    END IF;

    UPDATE credits SET customer_id = p_customer_id
     WHERE sale_id = p_sale_id AND store_id = v_store AND p_customer_id IS NOT NULL;

    SELECT name INTO v_name FROM customers WHERE id = p_customer_id;

    UPDATE sales
       SET customer_id = p_customer_id,
           customer_name = COALESCE(v_name, customer_name)
     WHERE id = p_sale_id;

    RETURN jsonb_build_object('success', true, 'changed', true, 'movedDebt', v_pending, 'name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_change_sale_customer(UUID, UUID) TO authenticated;

-- ── 4. Cuadrar la deuda con los movimientos ──────────────────────
-- La deuda vive en un campo aparte y se iba actualizando a mano
-- desde el navegador: si una de las escrituras fallaba, o la
-- pantalla llevaba rato abierta, el número quedaba desfasado.
-- Esto la vuelve a calcular desde los movimientos, que son la
-- verdad: fiados menos abonos menos anulaciones.
CREATE OR REPLACE FUNCTION toul_recalc_customer_debt(p_customer_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   UUID;
    v_result  JSONB;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() LIMIT 1;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    WITH real AS (
        SELECT c.id,
               c.name,
               COALESCE(c.total_debt, 0) AS antes,
               GREATEST(COALESCE((
                   SELECT SUM(CASE WHEN cr.type = 'debt' THEN cr.amount ELSE -cr.amount END)
                     FROM credits cr
                    WHERE cr.customer_id = c.id AND cr.store_id = v_store
               ), 0), 0) AS despues
          FROM customers c
         WHERE c.store_id = v_store
           AND (p_customer_id IS NULL OR c.id = p_customer_id)
    ),
    cambiados AS (
        SELECT * FROM real WHERE antes <> despues
    ),
    aplicado AS (
        UPDATE customers c
           SET total_debt = r.despues
          FROM cambiados r
         WHERE c.id = r.id AND c.store_id = v_store
        RETURNING c.id
    )
    SELECT jsonb_build_object(
        'fixed', (SELECT COUNT(*) FROM aplicado),
        'changes', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', name, 'antes', antes, 'despues', despues))
            FROM cambiados
        ), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_recalc_customer_debt(UUID) TO authenticated;
