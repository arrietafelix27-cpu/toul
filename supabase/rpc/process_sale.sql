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

    -- Turno de caja abierto (el vendedor solo vende dentro de su turno)
    SELECT id, opened_by, opened_by_name
      INTO v_session_id, v_session_owner, v_session_name
      FROM cash_sessions
     WHERE store_id = v_store_id AND status = 'open';

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
        INSERT INTO customers (store_id, name, phone, total_debt)
        VALUES (
            v_store_id,
            trim(payload->>'customerName'),
            NULLIF(trim(payload->>'customerPhone'), ''),
            0
        )
        RETURNING id INTO v_customer_id;
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
        seller_id, seller_name, cash_session_id
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
        v_session_id
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
