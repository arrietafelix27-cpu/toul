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


-- =================================================================
-- process_sale actualizado: reutiliza el cliente
-- =================================================================

-- =================================================================
-- RPC: process_sale(payload jsonb) RETURNS jsonb
-- =================================================================
-- Procesa una venta completa de forma atómica.
-- TODA la lógica que antes vivía en /api/sales/route.ts ahora corre
-- dentro de una sola transacción PostgreSQL. Si cualquier paso falla,
-- ROLLBACK automático — no más ventas a medio crear ni stock huérfano.
--
-- Pasos (en orden, todos atómicos):
--   1. Resolver/crear customer (si solo viene name sin id)
--   2. INSERT sales
--   3. Por cada item del cart:
--      - Si combo: validar stock de componentes + INSERT sale_items (con combo_id, requiere migration_v9)
--                  + INSERT inventory_adjustments por cada componente
--      - Si producto/variante: validar stock + INSERT sale_items + INSERT inventory_adjustments
--   4. Por cada PaymentSplit: INSERT sale_payments + INSERT payments (ledger legacy)
--   5. Si crédito: INSERT credits + UPDATE customers.total_debt
--
-- Ventas sin internet (migration_v11):
--   - `clientSaleId`: si la venta ya entró, devuelve la misma sin duplicar
--   - `soldAt`: guarda la hora real de la venta, no la del envío
--   - `cashSessionId`: la venta queda en el turno donde se hizo
--
-- Modo isla (migration_v10):
--   - Resuelve el negocio también para vendedores (store_members)
--   - Registra vendedor (seller_id, seller_name) y turno (cash_session_id)
--   - Vendedor: requiere turno abierto propio; crédito requiere aprobación
--   - inventory_adjustments.reference_id = sale_id (permite anular la venta)
--
-- Cualquier RAISE EXCEPTION revierte TODO automáticamente.
--
-- SECURITY INVOKER + verificación explícita de auth.uid() — respeta RLS del caller.
-- =================================================================

CREATE OR REPLACE FUNCTION public.process_sale(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_user_id        uuid;
    v_store_id       uuid;
    v_customer_id    uuid;
    v_sale_id        uuid;
    v_primary_method text;
    v_is_credit      boolean;
    v_total          numeric;
    v_paid_now       numeric;
    v_debt_amount    numeric;
    v_due_date       text;
    v_has_combo_col  boolean;

    -- iteration vars
    v_item           jsonb;
    v_pay            jsonb;
    v_ci             record;

    -- product/variant lookup vars
    v_product_id     uuid;
    v_variant_id     uuid;
    v_combo_id       uuid;
    v_quantity       integer;
    v_unit_price     numeric;
    v_unit_cost      numeric;
    v_product_stock  integer;
    v_variant_stock  integer;
    v_product_name   text;
    v_variant_name   text;
    v_total_qty      integer;
    v_short_id       text;

    -- modo isla
    v_role           text;
    v_seller_name    text;
    v_session_id     uuid;
    v_session_owner  uuid;
    v_session_name   text;
    v_approval_id    uuid;

    -- ventas sin internet
    v_client_id      text;
    v_existing_id    uuid;
    v_sold_at        timestamptz;
    v_offline_sess   uuid;
BEGIN
    -- ─── 1. Auth & store ─────────────────────────────────────────
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    v_store_id := toul_current_store_id();
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'Store not found';
    END IF;

    v_role        := toul_current_role();
    v_seller_name := toul_current_member_name();

    -- Venta enviada desde la caja offline: si ya entró, no se duplica
    v_client_id := NULLIF(payload->>'clientSaleId', '');
    IF v_client_id IS NOT NULL THEN
        SELECT id INTO v_existing_id
          FROM sales
         WHERE store_id = v_store_id AND client_sale_id = v_client_id;
        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'saleId', v_existing_id, 'duplicate', true);
        END IF;
    END IF;

    -- Hora real de la venta (máximo 7 días atrás, nunca en el futuro)
    v_sold_at := NULLIF(payload->>'soldAt', '')::timestamptz;
    IF v_sold_at IS NULL OR v_sold_at > now() OR v_sold_at < now() - interval '7 days' THEN
        v_sold_at := now();
    END IF;

    -- Turno de caja abierto (el vendedor solo vende dentro de su turno)
    SELECT id, opened_by, opened_by_name
      INTO v_session_id, v_session_owner, v_session_name
      FROM cash_sessions
     WHERE store_id = v_store_id AND status = 'open';

    -- Turno en el que se hizo la venta offline (aunque ya esté cerrado)
    v_offline_sess := NULLIF(payload->>'cashSessionId', '')::uuid;
    IF v_offline_sess IS NOT NULL THEN
        SELECT id INTO v_offline_sess
          FROM cash_sessions
         WHERE id = v_offline_sess AND store_id = v_store_id AND opened_by = v_user_id;
        IF v_offline_sess IS NOT NULL THEN
            v_session_id    := v_offline_sess;
            v_session_owner := v_user_id;
        END IF;
    END IF;

    IF v_role <> 'admin' THEN
        IF v_session_id IS NULL THEN
            RAISE EXCEPTION 'Abre tu turno de caja antes de vender';
        END IF;
        IF v_session_owner <> v_user_id THEN
            RAISE EXCEPTION 'Hay un turno abierto por %. Pide al administrador que lo cierre.',
                COALESCE(v_session_name, 'otra persona');
        END IF;
    ELSIF v_session_owner IS DISTINCT FROM v_user_id THEN
        -- Admin vendiendo fuera de la isla (ej. WhatsApp): no entra al turno de otra persona
        v_session_id := NULL;
    END IF;

    -- Detect whether migration_v9 (combo_id on sale_items) has been applied.
    -- Used to decide whether combos should insert into sale_items.
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sale_items' AND column_name = 'combo_id'
    ) INTO v_has_combo_col;

    -- ─── 2. Resolve / create customer ────────────────────────────
    v_customer_id := NULLIF(payload->>'customerId', '')::uuid;

    IF v_customer_id IS NULL
       AND payload->>'customerName' IS NOT NULL
       AND length(trim(payload->>'customerName')) > 0
    THEN
        -- Buscar antes de crear: escribir el nombre en la caja estaba
        -- creando un cliente nuevo en cada venta, y la deuda del mismo
        -- señor quedaba partida en varios registros
        v_customer_id := toul_find_or_create_customer(
            v_store_id,
            payload->>'customerName',
            payload->>'customerPhone'
        );
    END IF;

    -- ─── 3. Primary method (largest split, lowercased) ───────────
    SELECT lower(p->>'methodName')
      INTO v_primary_method
      FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
     WHERE (p->>'amount')::numeric > 0
     ORDER BY (p->>'amount')::numeric DESC
     LIMIT 1;
    v_primary_method := COALESCE(v_primary_method, 'efectivo');

    -- ─── 4. INSERT sales ─────────────────────────────────────────
    v_is_credit := COALESCE((payload->>'isCredit')::boolean, false);
    v_total     := round(COALESCE((payload->>'total')::numeric, 0));
    v_due_date  := payload->>'dueDate';

    IF v_is_credit AND v_customer_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona un cliente para vender a crédito';
    END IF;

    -- Crédito de un vendedor: requiere aprobación vigente del administrador
    -- (se valida y consume en toul_consume_credit_approval, después del INSERT)
    IF v_is_credit AND v_role <> 'admin' THEN
        v_approval_id := NULLIF(payload->>'approvalId', '')::uuid;
        IF v_approval_id IS NULL THEN
            RAISE EXCEPTION 'Esta venta a crédito necesita aprobación del administrador';
        END IF;
    END IF;

    INSERT INTO sales (
        store_id, customer_id, customer_name, customer_phone,
        subtotal, discount, total,
        payment_method, is_credit, initial_payment, notes,
        seller_id, seller_name, cash_session_id, client_sale_id, created_at
    ) VALUES (
        v_store_id,
        v_customer_id,
        NULLIF(trim(payload->>'customerName'), ''),
        NULLIF(trim(payload->>'customerPhone'), ''),
        round(COALESCE((payload->>'subtotal')::numeric, 0)),
        round(COALESCE((payload->>'discount')::numeric, 0)),
        v_total,
        v_primary_method,
        v_is_credit,
        round(COALESCE((payload->>'initialPayment')::numeric, 0)),
        payload->>'notes',
        v_user_id,
        v_seller_name,
        v_session_id,
        v_client_id,
        v_sold_at
    )
    RETURNING id INTO v_sale_id;

    IF v_approval_id IS NOT NULL THEN
        PERFORM toul_consume_credit_approval(v_approval_id, v_total, v_sale_id);
    END IF;

    v_short_id := substr(v_sale_id::text, 1, 8);

    -- ─── 5. Process cart items ───────────────────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'cart', '[]'::jsonb))
    LOOP
        v_quantity   := COALESCE((v_item->>'quantity')::integer, 0);
        v_unit_price := COALESCE((v_item->>'unitPrice')::numeric, 0);

        -- ── COMBO branch ────────────────────────────────────────
        IF COALESCE((v_item->>'isCombo')::boolean, false) = true THEN
            v_combo_id := (v_item->>'comboId')::uuid;
            v_product_name := COALESCE(v_item->'product'->>'name', '(combo)');

            IF v_combo_id IS NULL THEN
                RAISE EXCEPTION 'Combo sin ID: %', v_product_name;
            END IF;

            -- Validate & decrement each component's stock
            FOR v_ci IN
                SELECT product_id, variant_id, quantity
                  FROM combo_items
                 WHERE combo_id = v_combo_id
            LOOP
                v_total_qty := v_ci.quantity * v_quantity;

                IF v_ci.variant_id IS NOT NULL THEN
                    SELECT COALESCE(SUM(quantity), 0)
                      INTO v_variant_stock
                      FROM inventory_adjustments
                     WHERE variant_id = v_ci.variant_id;
                    IF v_variant_stock < v_total_qty THEN
                        RAISE EXCEPTION 'Stock insuficiente en componente del combo: %', v_product_name;
                    END IF;
                    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
                    VALUES (v_store_id,
                            (SELECT product_id FROM product_variants WHERE id = v_ci.variant_id),
                            v_ci.variant_id, -v_total_qty, 'sale',
                            format('Combo: %s · Venta #%s', v_product_name, v_short_id), v_sale_id);
                ELSIF v_ci.product_id IS NOT NULL THEN
                    SELECT stock INTO v_product_stock FROM products WHERE id = v_ci.product_id;
                    IF v_product_stock IS NULL OR v_product_stock < v_total_qty THEN
                        RAISE EXCEPTION 'Stock insuficiente en componente del combo: %', v_product_name;
                    END IF;
                    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
                    VALUES (v_store_id, v_ci.product_id, NULL, -v_total_qty, 'sale',
                            format('Combo: %s · Venta #%s', v_product_name, v_short_id), v_sale_id);
                END IF;
            END LOOP;

            -- Insert sale_items row for the combo ONLY if migration_v9 has been applied
            IF v_has_combo_col THEN
                EXECUTE format(
                    'INSERT INTO sale_items (store_id, sale_id, product_id, variant_id, combo_id, quantity, unit_price, unit_cost, subtotal)
                     VALUES ($1, $2, NULL, NULL, $3, $4, $5, 0, $6)'
                )
                USING v_store_id, v_sale_id, v_combo_id, v_quantity, v_unit_price, round(v_unit_price * v_quantity);
            END IF;

            CONTINUE;
        END IF;

        -- ── PRODUCT / VARIANT branch ────────────────────────────
        v_product_id := (v_item->'product'->>'id')::uuid;
        v_variant_id := NULLIF(v_item->>'variantId', '')::uuid;
        v_product_name := COALESCE(v_item->'product'->>'name', '(producto)');
        v_variant_name := v_item->>'variantName';

        SELECT stock, cpp, sale_price
          INTO v_product_stock, v_unit_cost, v_unit_price
          FROM products
         WHERE id = v_product_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', v_product_name;
        END IF;

        -- Override unitPrice from payload if provided (frontend authoritative)
        IF (v_item->>'unitPrice') IS NOT NULL THEN
            v_unit_price := (v_item->>'unitPrice')::numeric;
        END IF;

        IF v_variant_id IS NOT NULL THEN
            -- Variant case: use variant cpp + variant stock
            SELECT COALESCE(cpp, 0), COALESCE(sale_price, 0)
              INTO v_unit_cost, v_unit_price
              FROM product_variants
             WHERE id = v_variant_id;
            IF (v_item->>'unitPrice') IS NOT NULL THEN
                v_unit_price := (v_item->>'unitPrice')::numeric;
            END IF;

            SELECT COALESCE(SUM(quantity), 0)
              INTO v_variant_stock
              FROM inventory_adjustments
             WHERE variant_id = v_variant_id;
            IF v_variant_stock < v_quantity THEN
                RAISE EXCEPTION 'Stock insuficiente para % %', v_product_name,
                    COALESCE('(' || v_variant_name || ')', '');
            END IF;
        ELSE
            -- Pure product (no variant)
            IF v_product_stock < v_quantity THEN
                RAISE EXCEPTION 'Stock insuficiente para %. Disponible: %', v_product_name, v_product_stock;
            END IF;
        END IF;

        INSERT INTO sale_items (
            store_id, sale_id, product_id, variant_id, quantity, unit_price, unit_cost, subtotal
        ) VALUES (
            v_store_id, v_sale_id, v_product_id, v_variant_id,
            v_quantity, v_unit_price, COALESCE(v_unit_cost, 0),
            round(v_unit_price * v_quantity)
        );

        INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
        VALUES (v_store_id, v_product_id, v_variant_id, -v_quantity, 'sale',
                format('Venta #%s', v_short_id), v_sale_id);
    END LOOP;

    -- ─── 6. Payment splits ───────────────────────────────────────
    FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb))
    LOOP
        IF COALESCE((v_pay->>'amount')::numeric, 0) <= 0 THEN
            CONTINUE;
        END IF;

        INSERT INTO sale_payments (sale_id, store_id, method_id, amount)
        VALUES (
            v_sale_id,
            v_store_id,
            (v_pay->>'methodId')::uuid,
            round((v_pay->>'amount')::numeric)
        );

        INSERT INTO payments (store_id, type, method, amount, reference_id, notes, cash_session_id)
        VALUES (
            v_store_id,
            'sale',
            v_pay->>'methodName',
            round((v_pay->>'amount')::numeric),
            v_sale_id,
            format('Venta%s #%s',
                CASE WHEN payload->>'customerName' IS NOT NULL AND length(trim(payload->>'customerName')) > 0
                     THEN ' - ' || trim(payload->>'customerName')
                     ELSE '' END,
                v_short_id),
            v_session_id
        );
    END LOOP;

    -- ─── 7. Credit / debt handling ───────────────────────────────
    IF v_is_credit AND v_customer_id IS NOT NULL THEN
        SELECT COALESCE(SUM((p->>'amount')::numeric), 0)
          INTO v_paid_now
          FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p;
        v_debt_amount := round(GREATEST(0, v_total - v_paid_now));

        IF v_debt_amount > 0 THEN
            INSERT INTO credits (store_id, customer_id, sale_id, type, amount, notes)
            VALUES (
                v_store_id,
                v_customer_id,
                v_sale_id,
                'debt',
                v_debt_amount,
                format('Deuda - Venta #%s%s',
                    v_short_id,
                    CASE WHEN v_due_date IS NOT NULL AND length(v_due_date) > 0
                         THEN ' - Vence: ' || v_due_date
                         ELSE '' END)
            );

            UPDATE customers
               SET total_debt = COALESCE(total_debt, 0) + v_debt_amount
             WHERE id = v_customer_id;
        END IF;
    END IF;

    -- ─── 8. Return ───────────────────────────────────────────────
    RETURN jsonb_build_object('success', true, 'saleId', v_sale_id);
END;
$$;

-- Grant execute to authenticated users (they still need RLS to allow each underlying table)
GRANT EXECUTE ON FUNCTION public.process_sale(jsonb) TO authenticated;
