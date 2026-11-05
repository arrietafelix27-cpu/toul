-- Copia de referencia. La versión vigente se instala con
-- supabase/deploy_caja_segura.sql (necesita su historial de precios).
-- =================================================================
-- RPC: process_sale(payload jsonb) RETURNS jsonb
-- =================================================================
-- Procesa una venta completa de forma atómica. Si cualquier paso
-- falla, ROLLBACK automático: no quedan ventas a medio crear ni stock
-- huérfano.
--
-- Pasos (en orden, todos atómicos):
--   1. Quién vende, en qué tienda y en qué turno
--   2. Cada línea con su precio de la base (ventas sin internet: lo
--      cobrado, y si no era el precio de esa hora, queda para revisar)
--   3. Descuento, total y pagos validados contra ese precio
--   4. Resolver/crear el cliente
--   5. INSERT sales (con el número que traía la caja sin internet)
--   6. Por cada línea: validar stock + sale_items + inventory_adjustments
--      (combos: por cada componente)
--   7. Por cada pago: sale_payments + payments (ledger)
--   8. Si es crédito: credits + customers.total_debt
--
-- Ventas sin internet:
--   - `clientSaleId`: si la venta ya entró, devuelve la misma sin
--     duplicar; si es un identificador válido, es el número de la venta
--   - `soldAt`: guarda la hora real de la venta, no la del envío
--   - `cashSessionId`: la venta queda en el turno donde se hizo
--   - `offline`: la caja la guardó sin internet. Una venta que llega
--     más de 2 minutos después de hecha se trata igual (las que
--     quedaron guardadas antes de esta versión no traen la marca)
--
-- Modo isla:
--   - Resuelve el negocio también para vendedores (store_members)
--   - Registra vendedor (seller_id, seller_name) y turno (cash_session_id)
--   - Vendedor: requiere turno abierto propio; crédito requiere aprobación
--   - inventory_adjustments.reference_id = sale_id (permite anular la venta)
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
    v_plan           text;
    v_customer_id    uuid;
    v_sale_id        uuid;
    v_primary_method text;
    v_is_credit      boolean;
    v_subtotal       numeric;
    v_discount       numeric;
    v_total          numeric;
    v_client_total   numeric;
    v_paid_now       numeric;
    v_debt_amount    numeric;
    v_amount         numeric;
    v_due_date       text;
    v_has_combo_col  boolean;

    -- iteration vars
    v_item           jsonb;
    v_line           jsonb;
    v_lines          jsonb := '[]'::jsonb;
    v_pay            jsonb;
    v_ci             record;

    -- product/variant lookup vars
    v_product_id     uuid;
    v_variant_id     uuid;
    v_combo_id       uuid;
    v_qty_raw        numeric;
    v_quantity       integer;
    v_db_price       numeric;
    v_client_price   numeric;
    v_then_price     numeric;
    v_unit_price     numeric;
    v_unit_cost      numeric;
    v_product_stock  integer;
    v_variant_stock  integer;
    v_product_name   text;
    v_line_name      text;
    v_component_name text;
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
    v_offline        boolean;
    v_review         jsonb := '[]'::jsonb;
BEGIN
    -- ─── 1. Auth, store y turno ──────────────────────────────────
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
    SELECT plan INTO v_plan FROM stores WHERE id = v_store_id;

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

    v_offline := COALESCE((payload->>'offline')::boolean, false)
                 OR v_sold_at < now() - interval '2 minutes';

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
    ELSIF v_session_owner IS DISTINCT FROM v_user_id OR COALESCE(v_plan, 'basico') <> 'pro' THEN
        -- Admin vendiendo fuera de la isla (ej. WhatsApp): no entra al
        -- turno de otra persona. En el plan Básico no hay turnos.
        v_session_id := NULL;
    END IF;

    -- Detect whether migration_v9 (combo_id on sale_items) has been applied.
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sale_items' AND column_name = 'combo_id'
    ) INTO v_has_combo_col;

    -- ─── 2. Líneas: el precio lo pone la base, no la caja ────────
    IF jsonb_typeof(payload->'cart') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'cart') = 0 THEN
        RAISE EXCEPTION 'La venta no tiene productos';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'cart')
    LOOP
        v_combo_id   := NULL;
        v_product_id := NULL;
        v_variant_id := NULL;
        v_unit_cost  := 0;

        IF COALESCE((v_item->>'isCombo')::boolean, false) THEN
            v_combo_id := NULLIF(v_item->>'comboId', '')::uuid;
            SELECT name, sale_price INTO v_line_name, v_db_price
              FROM combos
             WHERE id = v_combo_id AND store_id = v_store_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Combo no encontrado: %', COALESCE(v_item->'product'->>'name', '(combo)');
            END IF;
        ELSE
            v_product_id := NULLIF(v_item->'product'->>'id', '')::uuid;
            v_variant_id := NULLIF(v_item->>'variantId', '')::uuid;

            SELECT name, sale_price, COALESCE(cpp, 0) INTO v_product_name, v_db_price, v_unit_cost
              FROM products
             WHERE id = v_product_id AND store_id = v_store_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Producto no encontrado: %', COALESCE(v_item->'product'->>'name', '(producto)');
            END IF;
            v_line_name := v_product_name;

            IF v_variant_id IS NOT NULL THEN
                -- La presentación tiene que ser de ese producto
                SELECT v_product_name || ' · ' || name, COALESCE(sale_price, 0), COALESCE(cpp, 0)
                  INTO v_line_name, v_db_price, v_unit_cost
                  FROM product_variants
                 WHERE id = v_variant_id AND product_id = v_product_id;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Esa presentación no es de %', v_product_name;
                END IF;
            END IF;
        END IF;

        -- Cantidad: entera y mayor que cero. Una negativa sumaba stock.
        v_qty_raw := NULLIF(v_item->>'quantity', '')::numeric;
        IF v_qty_raw IS NULL OR v_qty_raw <= 0 OR v_qty_raw <> trunc(v_qty_raw) OR v_qty_raw > 100000 THEN
            RAISE EXCEPTION 'Cantidad no válida para %', v_line_name;
        END IF;
        v_quantity := v_qty_raw::integer;

        v_db_price     := COALESCE(v_db_price, 0);
        v_unit_price   := v_db_price;
        v_client_price := NULLIF(v_item->>'unitPrice', '')::numeric;

        IF v_client_price IS NOT NULL AND v_client_price < 0 THEN
            RAISE EXCEPTION 'Precio no válido para %', v_line_name;
        END IF;

        IF v_client_price IS NOT NULL AND round(v_client_price) <> round(v_db_price) THEN
            IF NOT v_offline THEN
                -- La caja tenía un precio viejo: se rechaza y la caja se actualiza
                RAISE EXCEPTION 'El precio de % cambió a %. Revisa la venta y vuelve a cobrar.',
                    v_line_name, toul_cop(v_db_price);
            END IF;

            -- Sin internet lo cobrado manda: la plata ya se recibió. Si
            -- no era el precio que tenía a esa hora, queda para revisar.
            v_unit_price := v_client_price;
            v_then_price := toul_price_at(
                CASE WHEN v_combo_id IS NOT NULL THEN 'combo'
                     WHEN v_variant_id IS NOT NULL THEN 'variant'
                     ELSE 'product' END,
                COALESCE(v_combo_id, v_variant_id, v_product_id),
                v_sold_at);
            IF v_then_price IS NULL OR round(v_then_price) <> round(v_client_price) THEN
                v_review := v_review || jsonb_build_array(jsonb_build_object(
                    'name', v_line_name,
                    'quantity', v_quantity,
                    'charged', round(v_client_price),
                    'price', round(COALESCE(v_then_price, v_db_price))
                ));
            END IF;
        END IF;

        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
            'comboId', v_combo_id,
            'productId', v_product_id,
            'variantId', v_variant_id,
            'name', v_line_name,
            'quantity', v_quantity,
            'price', v_unit_price,
            'cost', v_unit_cost
        ));
    END LOOP;

    -- ─── 3. Descuento, total y pagos ─────────────────────────────
    SELECT round(COALESCE(SUM((l->>'price')::numeric * (l->>'quantity')::integer), 0))
      INTO v_subtotal
      FROM jsonb_array_elements(v_lines) l;

    v_discount := round(COALESCE(NULLIF(payload->>'discount', '')::numeric, 0));
    IF v_discount < 0 THEN
        RAISE EXCEPTION 'El descuento no es válido';
    END IF;
    IF v_discount > v_subtotal THEN
        RAISE EXCEPTION 'El descuento no puede ser mayor que la venta';
    END IF;
    v_total := v_subtotal - v_discount;

    v_client_total := round(NULLIF(payload->>'total', '')::numeric);
    IF v_client_total IS NULL OR abs(v_client_total - v_total) >= 1 THEN
        RAISE EXCEPTION 'El total de la venta no cuadra: la caja dice % y los productos suman %. Vuelve a cobrar.',
            toul_cop(v_client_total), toul_cop(v_total);
    END IF;

    v_paid_now := 0;
    FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb))
    LOOP
        v_amount := round(COALESCE(NULLIF(v_pay->>'amount', '')::numeric, 0));
        IF v_amount < 0 THEN
            RAISE EXCEPTION 'Un pago no puede ser negativo';
        END IF;
        CONTINUE WHEN v_amount = 0;
        IF NOT EXISTS (
            SELECT 1 FROM payment_methods
             WHERE id = NULLIF(v_pay->>'methodId', '')::uuid AND store_id = v_store_id
        ) THEN
            RAISE EXCEPTION 'El método de pago % no existe', COALESCE(v_pay->>'methodName', '');
        END IF;
        v_paid_now := v_paid_now + v_amount;
    END LOOP;

    v_is_credit := COALESCE((payload->>'isCredit')::boolean, false);
    IF v_is_credit THEN
        IF v_paid_now > v_total THEN
            RAISE EXCEPTION 'El abono no puede ser mayor que la venta';
        END IF;
    ELSIF abs(v_paid_now - v_total) >= 1 THEN
        RAISE EXCEPTION 'Los pagos (%) no suman el total de la venta (%)', toul_cop(v_paid_now), toul_cop(v_total);
    END IF;

    -- ─── 4. Resolve / create customer ────────────────────────────
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

    -- Primary method (largest split, lowercased)
    SELECT lower(p->>'methodName')
      INTO v_primary_method
      FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
     WHERE (p->>'amount')::numeric > 0
     ORDER BY (p->>'amount')::numeric DESC
     LIMIT 1;
    v_primary_method := COALESCE(v_primary_method, 'efectivo');

    v_due_date := payload->>'dueDate';

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

    -- ─── 5. INSERT sales ─────────────────────────────────────────
    -- La venta guardada sin internet ya tiene número (salió en su
    -- tirilla): entra con ese mismo
    IF v_client_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT EXISTS (SELECT 1 FROM sales WHERE id = v_client_id::uuid) THEN
        v_sale_id := v_client_id::uuid;
    ELSE
        v_sale_id := gen_random_uuid();
    END IF;

    INSERT INTO sales (
        id, store_id, customer_id, customer_name, customer_phone,
        subtotal, discount, total,
        payment_method, is_credit, initial_payment, notes,
        seller_id, seller_name, cash_session_id, client_sale_id, created_at,
        price_review
    ) VALUES (
        v_sale_id,
        v_store_id,
        v_customer_id,
        NULLIF(trim(payload->>'customerName'), ''),
        NULLIF(trim(payload->>'customerPhone'), ''),
        v_subtotal,
        v_discount,
        v_total,
        v_primary_method,
        v_is_credit,
        v_paid_now,
        payload->>'notes',
        v_user_id,
        v_seller_name,
        v_session_id,
        v_client_id,
        v_sold_at,
        CASE WHEN jsonb_array_length(v_review) > 0 THEN v_review END
    );

    IF v_approval_id IS NOT NULL THEN
        PERFORM toul_consume_credit_approval(v_approval_id, v_total, v_sale_id);
    END IF;

    v_short_id := substr(v_sale_id::text, 1, 8);

    -- ─── 6. Lines: stock, sale_items, inventory_adjustments ──────
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_quantity   := (v_line->>'quantity')::integer;
        v_unit_price := (v_line->>'price')::numeric;
        v_unit_cost  := (v_line->>'cost')::numeric;
        v_line_name  := v_line->>'name';
        v_combo_id   := NULLIF(v_line->>'comboId', '')::uuid;

        -- ── COMBO branch ────────────────────────────────────────
        IF v_combo_id IS NOT NULL THEN
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
                        SELECT p.name || ' · ' || v.name INTO v_component_name
                          FROM product_variants v JOIN products p ON p.id = v.product_id
                         WHERE v.id = v_ci.variant_id;
                        RAISE EXCEPTION 'Stock insuficiente en el combo %: falta %', v_line_name, COALESCE(v_component_name, 'un producto');
                    END IF;
                    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
                    VALUES (v_store_id,
                            (SELECT product_id FROM product_variants WHERE id = v_ci.variant_id),
                            v_ci.variant_id, -v_total_qty, 'sale',
                            format('Combo: %s · Venta #%s', v_line_name, v_short_id), v_sale_id);
                ELSIF v_ci.product_id IS NOT NULL THEN
                    SELECT stock, name INTO v_product_stock, v_component_name FROM products WHERE id = v_ci.product_id;
                    IF v_product_stock IS NULL OR v_product_stock < v_total_qty THEN
                        RAISE EXCEPTION 'Stock insuficiente en el combo %: falta %', v_line_name, COALESCE(v_component_name, 'un producto');
                    END IF;
                    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
                    VALUES (v_store_id, v_ci.product_id, NULL, -v_total_qty, 'sale',
                            format('Combo: %s · Venta #%s', v_line_name, v_short_id), v_sale_id);
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
        v_product_id := (v_line->>'productId')::uuid;
        v_variant_id := NULLIF(v_line->>'variantId', '')::uuid;

        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(SUM(quantity), 0)
              INTO v_variant_stock
              FROM inventory_adjustments
             WHERE variant_id = v_variant_id;
            IF v_variant_stock < v_quantity THEN
                RAISE EXCEPTION 'Stock insuficiente para %. Disponible: %', v_line_name, v_variant_stock;
            END IF;
        ELSE
            SELECT stock INTO v_product_stock FROM products WHERE id = v_product_id;
            IF v_product_stock IS NULL OR v_product_stock < v_quantity THEN
                RAISE EXCEPTION 'Stock insuficiente para %. Disponible: %', v_line_name, COALESCE(v_product_stock, 0);
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

    -- ─── 7. Payment splits ───────────────────────────────────────
    FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb))
    LOOP
        v_amount := round(COALESCE(NULLIF(v_pay->>'amount', '')::numeric, 0));
        CONTINUE WHEN v_amount <= 0;

        INSERT INTO sale_payments (sale_id, store_id, method_id, amount)
        VALUES (v_sale_id, v_store_id, (v_pay->>'methodId')::uuid, v_amount);

        INSERT INTO payments (store_id, type, method, amount, reference_id, notes, cash_session_id)
        VALUES (
            v_store_id,
            'sale',
            v_pay->>'methodName',
            v_amount,
            v_sale_id,
            format('Venta%s #%s',
                CASE WHEN payload->>'customerName' IS NOT NULL AND length(trim(payload->>'customerName')) > 0
                     THEN ' - ' || trim(payload->>'customerName')
                     ELSE '' END,
                v_short_id),
            v_session_id
        );
    END LOOP;

    -- ─── 8. Credit / debt handling ───────────────────────────────
    IF v_is_credit AND v_customer_id IS NOT NULL THEN
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

    -- ─── 9. Return ───────────────────────────────────────────────
    RETURN jsonb_build_object(
        'success', true,
        'saleId', v_sale_id,
        'priceReview', jsonb_array_length(v_review) > 0
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale(jsonb) TO authenticated;
