-- =================================================================
-- TOUL — Inventario con las cuentas correctas (Paso 2)
-- =================================================================
-- Siete cosas que cambian números:
--
--   1. Combos con costo: al vender un combo se guarda lo que cuestan
--      sus productos (antes quedaba en $0 y la ganancia salía inflada).
--      Las ventas de combos viejas se corrigen con el costo de hoy.
--   2. Unidades vendidas con combos: lo que sale dentro de un combo
--      cuenta como venta de cada producto (días que dura, mínimos,
--      Quietos, ventas de 30 días).
--   3. Compras anuladas: no cuentan en "Comprado" y el costo promedio
--      vuelve a lo que sería sin esa compra.
--   4. Contar mientras vendes: cada renglón guarda cuánto decía el
--      sistema al contarlo; al aplicar solo se ajusta la diferencia.
--   5. Mercancía perdida: cada ajuste guarda su costo promedio y
--      Ganaste = ganancia en ventas − gastos − perdida + recuperada.
--   6. Reportes, Mes a mes y la auditoría usan la misma función.
--   7. El vendedor solo mueve inventario vendiendo, devolviendo o
--      anulando una venta.
--
-- Se puede correr más de una vez sin dañar nada.
-- =================================================================


-- =================================================================
-- 1. Lo que cuesta un combo
-- =================================================================
-- process_sale es igual a la de deploy_caja_permisos.sql, salvo dos
-- cosas: calcula el costo del combo (lo que cuestan hoy sus productos)
-- y lo guarda en la venta. Antes guardaba 0.
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

    -- permisos del vendedor y vuelto
    v_needs_credit   boolean := false;
    v_needs_discount boolean := false;
    v_disc_max       numeric;
    v_is_cash        boolean;
    v_cash_part      numeric := 0;
    v_cash_received  numeric;
    v_change         numeric;
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
            -- Lo que cuesta el combo: lo que cuestan hoy sus productos
            SELECT COALESCE(SUM(ci.quantity * COALESCE(CASE WHEN ci.variant_id IS NOT NULL THEN pv.cpp ELSE pr.cpp END, 0)), 0)
              INTO v_unit_cost
              FROM combo_items ci
              LEFT JOIN product_variants pv ON pv.id = ci.variant_id
              LEFT JOIN products pr ON pr.id = ci.product_id
             WHERE ci.combo_id = v_combo_id;
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
        SELECT (pm.is_cash OR lower(pm.name) LIKE '%efectivo%')
          INTO v_is_cash
          FROM payment_methods pm
         WHERE pm.id = NULLIF(v_pay->>'methodId', '')::uuid AND pm.store_id = v_store_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El método de pago % no existe', COALESCE(v_pay->>'methodName', '');
        END IF;
        v_paid_now := v_paid_now + v_amount;
        IF v_is_cash THEN
            v_cash_part := v_cash_part + v_amount;
        END IF;
    END LOOP;

    v_is_credit := COALESCE((payload->>'isCredit')::boolean, false);
    IF v_is_credit THEN
        IF v_paid_now > v_total THEN
            RAISE EXCEPTION 'El abono no puede ser mayor que la venta';
        END IF;
    ELSIF abs(v_paid_now - v_total) >= 1 THEN
        RAISE EXCEPTION 'Los pagos (%) no suman el total de la venta (%)', toul_cop(v_paid_now), toul_cop(v_total);
    END IF;

    -- Efectivo recibido y vuelto. Sin dato, pagó exacto. El cuadre de
    -- caja sigue contando lo que vale la venta, no lo recibido.
    IF v_cash_part > 0 THEN
        v_cash_received := round(COALESCE(NULLIF(payload->>'cashReceived', '')::numeric, v_cash_part));
        IF v_cash_received < v_cash_part THEN
            RAISE EXCEPTION 'Lo recibido en efectivo (%) no alcanza para lo que se paga en efectivo (%)',
                toul_cop(v_cash_received), toul_cop(v_cash_part);
        END IF;
        IF v_cash_received - v_cash_part > 10000000 THEN
            RAISE EXCEPTION 'Revisa con cuánto te pagó: el vuelto sería de %', toul_cop(v_cash_received - v_cash_part);
        END IF;
        v_change := v_cash_received - v_cash_part;
    END IF;

    -- ─── Permisos del vendedor (el administrador los elige) ──────
    IF v_role <> 'admin' THEN
        IF v_is_credit THEN
            CASE toul_seller_permission(v_store_id, 'fiar')
                WHEN 'no' THEN
                    RAISE EXCEPTION 'No tienes permiso para fiar. Cobra de contado o pide ayuda al administrador.';
                WHEN 'aprobacion' THEN
                    v_needs_credit := true;
                ELSE
                    NULL;
            END CASE;
        END IF;
        -- Un descuento en pesos cuenta como el porcentaje que es de la venta
        v_disc_max := COALESCE(NULLIF(toul_seller_permission(v_store_id, 'descuento_max'), '')::numeric, 10);
        IF v_discount > round(v_subtotal * v_disc_max / 100) THEN
            v_needs_discount := true;
        END IF;
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
        IF v_role <> 'admin' AND toul_seller_permission(v_store_id, 'crear_clientes') = 'no' THEN
            -- Sin permiso para crear clientes: solo uno que ya exista
            v_customer_id := toul_find_customer(v_store_id, payload->>'customerName', payload->>'customerPhone');
            IF v_customer_id IS NULL AND v_is_credit THEN
                RAISE EXCEPTION 'No tienes permiso para crear clientes. Elige uno que ya exista.';
            END IF;
        ELSE
            v_customer_id := toul_find_or_create_customer(
                v_store_id,
                payload->>'customerName',
                payload->>'customerPhone'
            );
        END IF;
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

    -- Fiado o descuento del vendedor que necesita aprobación vigente del
    -- administrador (se valida y consume en toul_consume_sale_approval,
    -- después del INSERT)
    IF v_needs_credit OR v_needs_discount THEN
        v_approval_id := NULLIF(payload->>'approvalId', '')::uuid;
        IF v_approval_id IS NULL THEN
            IF v_needs_credit THEN
                RAISE EXCEPTION 'Esta venta a crédito necesita aprobación del administrador';
            END IF;
            RAISE EXCEPTION '%', format('Un descuento de más del %s%% necesita aprobación del administrador', v_disc_max);
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
        price_review, cash_received, change_given
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
        CASE WHEN jsonb_array_length(v_review) > 0 THEN v_review END,
        v_cash_received,
        v_change
    );

    IF v_approval_id IS NOT NULL THEN
        PERFORM toul_consume_sale_approval(v_approval_id, v_total, v_discount,
                                           v_needs_credit, v_needs_discount, v_sale_id);
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
                     VALUES ($1, $2, NULL, NULL, $3, $4, $5, $7, $6)'
                )
                USING v_store_id, v_sale_id, v_combo_id, v_quantity, v_unit_price, round(v_unit_price * v_quantity),
                      COALESCE(v_unit_cost, 0);
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
        'priceReview', jsonb_array_length(v_review) > 0,
        'change', v_change
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale(jsonb) TO authenticated;

-- Las ventas de combos que ya están guardadas: con el costo de hoy de
-- sus productos. Solo las que quedaron en $0.
WITH costo AS (
    SELECT ci.combo_id,
           SUM(ci.quantity * COALESCE(CASE WHEN ci.variant_id IS NOT NULL THEN pv.cpp ELSE pr.cpp END, 0)) AS costo
      FROM combo_items ci
      LEFT JOIN product_variants pv ON pv.id = ci.variant_id
      LEFT JOIN products pr ON pr.id = ci.product_id
     GROUP BY ci.combo_id
)
UPDATE sale_items si
   SET unit_cost = c.costo
  FROM costo c
 WHERE si.combo_id = c.combo_id
   AND COALESCE(si.unit_cost, 0) = 0
   AND c.costo > 0;

-- Y lo devuelto de esos combos, con el mismo costo
UPDATE sale_return_items ri
   SET unit_cost = si.unit_cost
  FROM sale_items si
 WHERE si.id = ri.sale_item_id
   AND si.combo_id IS NOT NULL
   AND COALESCE(ri.unit_cost, 0) = 0
   AND COALESCE(si.unit_cost, 0) > 0;

UPDATE sale_returns r
   SET cost_total = (SELECT round(COALESCE(SUM(ri.quantity * ri.unit_cost), 0))
                       FROM sale_return_items ri WHERE ri.return_id = r.id)
 WHERE EXISTS (SELECT 1
                 FROM sale_return_items ri JOIN sale_items si ON si.id = ri.sale_item_id
                WHERE ri.return_id = r.id AND si.combo_id IS NOT NULL);


-- =================================================================
-- 2. Unidades vendidas, con lo que salió dentro de los combos
-- =================================================================
-- Por producto y presentación: cuánto se vendió desde `p_desde` y la
-- última vez que se vendió (sin límite de tiempo). Lo de un combo cuenta
-- como vendido de cada producto que trae, con lo que trae hoy (igual que
-- las devoluciones de combos). Las ventas anuladas no están: se borran.
-- Con `p_producto` solo cuenta ese producto (para su ficha).
CREATE OR REPLACE FUNCTION public.toul_unidades_vendidas(p_store uuid, p_desde timestamptz, p_producto uuid DEFAULT NULL)
RETURNS TABLE (product_id uuid, variant_id uuid, unidades numeric, ultima_venta timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH lineas AS (
        -- Lo que se vendió suelto
        SELECT si.product_id, si.variant_id, si.quantity::numeric AS unidades, s.created_at
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
         WHERE s.store_id = p_store
           AND si.product_id IS NOT NULL
           AND (p_producto IS NULL OR si.product_id = p_producto)
        UNION ALL
        -- Lo que salió dentro de un combo
        SELECT COALESCE(ci.product_id, pv.product_id), ci.variant_id,
               (ci.quantity * si.quantity)::numeric, s.created_at
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          JOIN combo_items ci ON ci.combo_id = si.combo_id
          LEFT JOIN product_variants pv ON pv.id = ci.variant_id
         WHERE s.store_id = p_store
           AND si.combo_id IS NOT NULL
           AND (p_producto IS NULL OR COALESCE(ci.product_id, pv.product_id) = p_producto)
    )
    SELECT l.product_id, l.variant_id,
           COALESCE(SUM(l.unidades) FILTER (WHERE l.created_at >= p_desde), 0),
           MAX(l.created_at)
      FROM lineas l
     GROUP BY l.product_id, l.variant_id
$$;

-- Lo vendido en 30 días de un producto (todas sus presentaciones) o de
-- una presentación. Lo usan las fichas de Inventario
CREATE OR REPLACE FUNCTION public.toul_vendido_30d(p_product_id uuid, p_variant_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(u.unidades), 0)
      FROM toul_unidades_vendidas(toul_current_store_id(), now() - interval '30 days', p_product_id) u
     WHERE p_variant_id IS NULL OR u.variant_id = p_variant_id
$$;

GRANT EXECUTE ON FUNCTION public.toul_vendido_30d(uuid, uuid) TO authenticated;

-- toul_inventory_overview igual a la de deploy_reportes.sql, salvo de
-- dónde salen las unidades vendidas y la última venta
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

    -- Lo vendido en 30 días y la última venta (sin límite de tiempo),
    -- contando lo que salió dentro de los combos
    WITH ventas AS (
        SELECT * FROM toul_unidades_vendidas(v_store, v_since)
    ),
    vendido AS (
        SELECT product_id, variant_id, unidades AS units FROM ventas
    ),
    ultima_venta AS (
        SELECT product_id, variant_id, ultima_venta AS last_sale FROM ventas
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
        -- Plata en mercancía: también lo escondido que todavía tiene stock
        -- (toul_plata_en_mercancia). El resto de esta función sigue siendo
        -- solo lo que está a la venta
        'value',     (toul_plata_en_mercancia(v_store)->>'costo')::numeric,
        -- Lo mismo pero a lo que lo vendes, no a lo que te costó
        'retailValue', (toul_plata_en_mercancia(v_store)->>'venta')::numeric,
        'hiddenValue', (toul_plata_en_mercancia(v_store)->>'escondido')::numeric,
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


-- =================================================================
-- 3. Compras anuladas
-- =================================================================
-- Cada movimiento de inventario puede guardar lo que valía cada unidad.
-- La usan la mercancía perdida (punto 5) y la anulación de compras.
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS unit_cost numeric;

-- "Comprado" y el número de compras ya no cuentan las anuladas.
-- (El resto de la función es igual a deploy_compras_detalle.sql.)
CREATE OR REPLACE FUNCTION toul_purchases_summary(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store    UUID;
    v_hoy      DATE := (now() - interval '5 hours')::date;
    v_gastado  NUMERIC := 0;
    v_cuantas  INTEGER := 0;
    v_credito  NUMERIC := 0;
    v_pagar    NUMERIC := 0;
    v_vencidas INTEGER := 0;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    IF v_store IS NULL THEN
        RETURN jsonb_build_object('gastado', 0, 'compras', 0, 'aCredito', 0,
                                  'porPagar', 0, 'vencidas', 0);
    END IF;

    SELECT COALESCE(round(SUM(total)), 0),
           COUNT(*),
           COALESCE(round(SUM(CASE WHEN is_credit THEN total ELSE 0 END)), 0)
      INTO v_gastado, v_cuantas, v_credito
      FROM purchases
     WHERE store_id = v_store
       AND status IS DISTINCT FROM 'voided'
       AND (p_from IS NULL OR created_at >= p_from)
       AND (p_to   IS NULL OR created_at <= p_to);

    SELECT COALESCE(round(SUM(remaining_amount)), 0),
           COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date::date < v_hoy)
      INTO v_pagar, v_vencidas
      FROM provider_debts
     WHERE store_id = v_store
       AND status <> 'paid'
       AND remaining_amount > 0;

    RETURN jsonb_build_object(
        'gastado',  v_gastado,
        'compras',  v_cuantas,
        'aCredito', v_credito,
        'porPagar', v_pagar,
        'vencidas', v_vencidas
    );
END;
$$;

GRANT EXECUTE ON FUNCTION toul_purchases_summary(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- El detalle de una compra dice si está anulada, y "lo que costaba la vez
-- anterior" no sale de una compra anulada.
-- (El resto de la función es igual a deploy_compras_detalle.sql.)
CREATE OR REPLACE FUNCTION toul_purchase_detail(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_when  TIMESTAMPTZ;
    v_res   JSONB;
BEGIN
    SELECT store_id, created_at INTO v_store, v_when
      FROM purchases WHERE id = p_purchase_id;
    IF v_store IS NULL THEN RETURN NULL; END IF;

    SELECT jsonb_build_object(
        'id',        p.id,
        'fecha',     p.created_at,
        'subtotal',  round(p.subtotal),
        'total',     round(p.total),
        'metodo',    p.payment_method,
        'credito',   p.is_credit,
        'anulada',   p.status IS NOT DISTINCT FROM 'voided',
        'proveedor', CASE WHEN pr.id IS NULL THEN NULL ELSE
                        jsonb_build_object('id', pr.id, 'nombre', pr.name, 'telefono', pr.phone) END,
        -- Si quedó a crédito: cuánto falta y cuándo vence
        'deuda', (
            SELECT jsonb_build_object(
                       'monto',  round(d.amount),
                       'falta',  round(d.remaining_amount),
                       'vence',  d.due_date,
                       'estado', d.status)
              FROM provider_debts d
             WHERE d.purchase_id = p.id
             ORDER BY d.created_at
             LIMIT 1
        ),
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',            pi.id,
                       'nombre',        pd.name,
                       'imagen',        pd.image_url,
                       'cantidad',      pi.quantity,
                       'costo',         round(pi.unit_cost),
                       'total',         round(pi.total_cost),
                       -- Lo que costaba la última vez que lo compraste
                       'costoAnterior', round(ant.unit_cost),
                       'fechaAnterior', ant.created_at
                   ) ORDER BY pd.name)
              FROM purchase_items pi
              JOIN products pd ON pd.id = pi.product_id
              LEFT JOIN LATERAL (
                  SELECT pi2.unit_cost, p2.created_at
                    FROM purchase_items pi2
                    JOIN purchases p2 ON p2.id = pi2.purchase_id
                   WHERE pi2.product_id = pi.product_id
                     AND p2.store_id = v_store
                     AND p2.created_at < v_when
                     AND p2.status IS DISTINCT FROM 'voided'
                   ORDER BY p2.created_at DESC
                   LIMIT 1
              ) ant ON true
             WHERE pi.purchase_id = p.id
        ), '[]'::jsonb)
    )
      INTO v_res
      FROM purchases p
      LEFT JOIN providers pr ON pr.id = p.provider_id
     WHERE p.id = p_purchase_id;

    RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_purchase_detail(UUID) TO authenticated;

-- El costo promedio repasando la historia en orden: cada compra mezcla
-- su costo con lo que había; todo lo demás (ventas, ajustes, conteos)
-- solo mueve unidades. Es la misma cuenta de process_purchase.
--   · p_sin_compra: hace de cuenta que esa compra nunca existió.
--   · Las compras ya anuladas tampoco existieron. Con p_como_antes se
--     repasa como lo dejaba la anulación vieja: la compra entró y su
--     mercancía salió, sin tocar el costo.
-- Arranca con el costo con que se creó el producto o la presentación.
CREATE OR REPLACE FUNCTION public.toul_cpp_repasado(
    p_product_id  uuid,
    p_variant_id  uuid,
    p_sin_compra  uuid DEFAULT NULL,
    p_como_antes  boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_stock numeric := 0;
    v_cpp   numeric;
    r       record;
BEGIN
    IF p_variant_id IS NOT NULL THEN
        SELECT COALESCE(cost_price, 0) INTO v_cpp FROM product_variants WHERE id = p_variant_id;
    ELSE
        SELECT COALESCE(cost_price, 0) INTO v_cpp FROM products WHERE id = p_product_id;
    END IF;
    v_cpp := COALESCE(v_cpp, 0);

    FOR r IN
        SELECT e.cantidad, e.costo
          FROM (
            SELECT pu.created_at AS t, 1 AS orden, pi.quantity AS cantidad, pi.unit_cost AS costo
              FROM purchase_items pi
              JOIN purchases pu ON pu.id = pi.purchase_id
             WHERE CASE WHEN p_variant_id IS NOT NULL THEN pi.variant_id = p_variant_id
                        ELSE pi.product_id = p_product_id END
               AND (p_como_antes OR pu.status IS DISTINCT FROM 'voided')
               AND pu.id IS DISTINCT FROM p_sin_compra
            UNION ALL
            SELECT ia.created_at, 0, ia.quantity, NULL
              FROM inventory_adjustments ia
             WHERE CASE WHEN p_variant_id IS NOT NULL THEN ia.variant_id = p_variant_id
                        ELSE ia.product_id = p_product_id END
               AND ia.reason <> 'purchase'
               AND (p_como_antes OR ia.reason <> 'compra_anulada')
          ) e
         ORDER BY e.t, e.orden
    LOOP
        IF r.costo IS NOT NULL THEN
            v_cpp := CASE
                WHEN v_stock > 0 THEN round(((v_stock * v_cpp) + (r.cantidad * r.costo)) / (v_stock + r.cantidad))
                ELSE round(r.costo)
            END;
        END IF;
        v_stock := v_stock + r.cantidad;
    END LOOP;

    RETURN v_cpp;
END;
$$;

-- El costo promedio sin una compra. Si al repasar toda la historia da
-- el costo de hoy, la historia está completa y se usa el repaso. Si no
-- (datos de antes), se saca la compra del promedio y nunca queda negativo.
CREATE OR REPLACE FUNCTION public.toul_cpp_sin_compra(
    p_product_id uuid, p_variant_id uuid, p_compra uuid,
    p_stock numeric, p_cpp numeric, p_cantidad numeric, p_valor numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    IF toul_cpp_repasado(p_product_id, p_variant_id) = round(COALESCE(p_cpp, 0)) THEN
        RETURN toul_cpp_repasado(p_product_id, p_variant_id, p_compra);
    END IF;
    IF p_stock - p_cantidad > 0 AND p_stock * p_cpp - p_valor >= 0 THEN
        RETURN round((p_stock * p_cpp - p_valor) / (p_stock - p_cantidad));
    END IF;
    RETURN p_cpp;
END;
$$;

-- Anular una compra: igual a la de deploy_deshacer.sql, más el costo
-- promedio, que vuelve a lo que sería sin esta compra
CREATE OR REPLACE FUNCTION toul_void_purchase(p_purchase_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store    UUID;
    v_provider UUID;
    v_estado   TEXT;
    v_total    NUMERIC;
    v_deuda    RECORD;
    v_it       RECORD;
    v_hay      NUMERIC;
    v_cpp      NUMERIC;
BEGIN
    SELECT store_id, provider_id, status, total
      INTO v_store, v_provider, v_estado, v_total
      FROM purchases WHERE id = p_purchase_id;

    IF v_store IS NULL THEN RAISE EXCEPTION 'Esa compra no existe'; END IF;
    IF v_estado = 'voided' THEN RAISE EXCEPTION 'Esa compra ya está anulada'; END IF;

    -- ¿Ya le abonaste algo al proveedor por esta compra?
    SELECT * INTO v_deuda FROM provider_debts WHERE purchase_id = p_purchase_id LIMIT 1;
    IF FOUND AND round(v_deuda.remaining_amount) < round(v_deuda.amount) THEN
        RAISE EXCEPTION 'Ya le abonaste a esta compra. Arregla el abono antes de anularla.';
    END IF;

    -- ¿Todavía tienes la mercancía que entró?
    FOR v_it IN
        SELECT pi.product_id, pi.variant_id, pi.quantity, p.name
          FROM purchase_items pi JOIN products p ON p.id = pi.product_id
         WHERE pi.purchase_id = p_purchase_id
    LOOP
        IF v_it.variant_id IS NOT NULL THEN
            SELECT COALESCE(SUM(quantity), 0) INTO v_hay
              FROM inventory_adjustments WHERE variant_id = v_it.variant_id;
        ELSE
            SELECT COALESCE(stock, 0) INTO v_hay FROM products WHERE id = v_it.product_id;
        END IF;

        IF v_hay < v_it.quantity THEN
            RAISE EXCEPTION 'No se puede anular: de % ya vendiste parte de lo que entró', v_it.name;
        END IF;
    END LOOP;

    -- El costo promedio vuelve a lo que sería sin esta compra. Se calcula
    -- antes de sacar la mercancía: con el stock que hay ahora
    FOR v_it IN
        SELECT product_id, variant_id, SUM(quantity) AS cantidad, SUM(quantity * unit_cost) AS valor
          FROM purchase_items
         WHERE purchase_id = p_purchase_id AND variant_id IS NOT NULL
         GROUP BY product_id, variant_id
    LOOP
        SELECT COALESCE(SUM(quantity), 0) INTO v_hay FROM inventory_adjustments WHERE variant_id = v_it.variant_id;
        SELECT COALESCE(cpp, 0) INTO v_cpp FROM product_variants WHERE id = v_it.variant_id FOR UPDATE;
        UPDATE product_variants
           SET cpp = toul_cpp_sin_compra(v_it.product_id, v_it.variant_id, p_purchase_id, v_hay, v_cpp, v_it.cantidad, v_it.valor)
         WHERE id = v_it.variant_id;
    END LOOP;

    FOR v_it IN
        SELECT product_id, SUM(quantity) AS cantidad, SUM(quantity * unit_cost) AS valor
          FROM purchase_items
         WHERE purchase_id = p_purchase_id
         GROUP BY product_id
    LOOP
        SELECT COALESCE(stock, 0), COALESCE(cpp, 0) INTO v_hay, v_cpp FROM products WHERE id = v_it.product_id FOR UPDATE;
        UPDATE products
           SET cpp = toul_cpp_sin_compra(v_it.product_id, NULL, p_purchase_id, v_hay, v_cpp, v_it.cantidad, v_it.valor),
               updated_at = now()
         WHERE id = v_it.product_id;
    END LOOP;

    -- Saca la mercancía. Guarda lo que costó: así se distingue de una
    -- anulación de antes, que no devolvía el costo promedio
    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, unit_cost)
    SELECT v_store, pi.product_id, pi.variant_id, -pi.quantity, 'compra_anulada',
           COALESCE(NULLIF(trim(p_reason), ''), 'Compra anulada'), pi.unit_cost
      FROM purchase_items pi WHERE pi.purchase_id = p_purchase_id;

    -- Borra la deuda con el proveedor
    IF v_provider IS NOT NULL THEN
        UPDATE providers
           SET total_debt = GREATEST(COALESCE(total_debt, 0) - COALESCE((
                   SELECT SUM(remaining_amount) FROM provider_debts WHERE purchase_id = p_purchase_id
               ), 0), 0)
         WHERE id = v_provider;
    END IF;
    DELETE FROM provider_debts WHERE purchase_id = p_purchase_id;

    -- Devuelve la plata a la caja
    DELETE FROM payments WHERE reference_id = p_purchase_id AND type = 'purchase';

    UPDATE purchases SET status = 'voided' WHERE id = p_purchase_id;

    RETURN jsonb_build_object('success', true, 'total', round(v_total));
END;
$$;

GRANT EXECUTE ON FUNCTION toul_void_purchase(UUID, TEXT) TO authenticated;

-- Las compras que ya se anularon antes de esto: su costo promedio nunca
-- volvió. Se arregla solo donde la historia está completa (al repasarla
-- como la dejaba la anulación vieja da el costo de hoy); lo demás queda igual.
-- Solo los productos con una anulación de antes (sin costo guardado): las
-- de ahora ya devolvieron el costo, y correr esto otra vez no las toca
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT DISTINCT pi.product_id, pi.variant_id
          FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
         WHERE pu.status = 'voided' AND pi.variant_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM inventory_adjustments ia
                        WHERE ia.variant_id = pi.variant_id
                          AND ia.reason = 'compra_anulada' AND ia.unit_cost IS NULL)
    LOOP
        UPDATE product_variants v
           SET cpp = toul_cpp_repasado(r.product_id, r.variant_id)
         WHERE v.id = r.variant_id
           AND toul_cpp_repasado(r.product_id, r.variant_id, NULL, true) = round(COALESCE(v.cpp, 0))
           AND toul_cpp_repasado(r.product_id, r.variant_id) <> round(COALESCE(v.cpp, 0));
    END LOOP;

    FOR r IN
        SELECT DISTINCT pi.product_id
          FROM purchase_items pi JOIN purchases pu ON pu.id = pi.purchase_id
         WHERE pu.status = 'voided'
           AND EXISTS (SELECT 1 FROM inventory_adjustments ia
                        WHERE ia.product_id = pi.product_id
                          AND ia.reason = 'compra_anulada' AND ia.unit_cost IS NULL)
    LOOP
        UPDATE products p
           SET cpp = toul_cpp_repasado(r.product_id, NULL)
         WHERE p.id = r.product_id
           AND toul_cpp_repasado(r.product_id, NULL, NULL, true) = round(COALESCE(p.cpp, 0))
           AND toul_cpp_repasado(r.product_id, NULL) <> round(COALESCE(p.cpp, 0));
    END LOOP;
END;
$$;


-- =================================================================
-- 4. Contar mientras vendes
-- =================================================================
-- Al contar un renglón la base anota cuánto decía el sistema en ese
-- momento. Al aplicar, se ajusta solo la diferencia contra ese número:
-- lo que se vendió (o entró) después de contarlo no se toca.
ALTER TABLE inventory_count_items ADD COLUMN IF NOT EXISTS counted_at timestamptz;

CREATE OR REPLACE FUNCTION public.toul_count_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.counted_qty IS DISTINCT FROM OLD.counted_qty THEN
        IF NEW.variant_id IS NOT NULL THEN
            SELECT COALESCE(SUM(quantity), 0) INTO NEW.expected_qty
              FROM inventory_adjustments WHERE variant_id = NEW.variant_id;
        ELSE
            SELECT COALESCE(stock, 0) INTO NEW.expected_qty
              FROM products WHERE id = NEW.product_id;
        END IF;
        NEW.expected_qty := COALESCE(NEW.expected_qty, 0);
        NEW.difference   := NULL;
        NEW.counted_at   := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_count_snapshot ON inventory_count_items;
CREATE TRIGGER trg_count_snapshot
    BEFORE INSERT OR UPDATE OF counted_qty ON inventory_count_items
    FOR EACH ROW EXECUTE FUNCTION toul_count_snapshot();

-- Aplica el conteo: igual a la de deploy_offline_conteo.sql, salvo que la
-- diferencia es contra lo que decía el sistema al contar cada renglón
CREATE OR REPLACE FUNCTION public.toul_apply_inventory_count(p_count_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id    uuid := toul_current_store_id();
  v_count       inventory_counts%ROWTYPE;
  v_short_id    text;
  v_now         numeric;
  v_expected    numeric;
  v_diff        numeric;
  v_cost        numeric;
  v_items       integer := 0;
  v_diff_units  numeric := 0;
  v_diff_value  numeric := 0;
  r             record;
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede aplicar un conteo';
  END IF;

  SELECT * INTO v_count FROM inventory_counts
   WHERE id = p_count_id AND store_id = v_store_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conteo no encontrado';
  END IF;
  IF v_count.status <> 'open' THEN
    RAISE EXCEPTION 'Este conteo ya fue cerrado';
  END IF;

  v_short_id := substr(p_count_id::text, 1, 8);

  FOR r IN
    SELECT id, product_id, variant_id, counted_qty, expected_qty
      FROM inventory_count_items
     WHERE count_id = p_count_id
     ORDER BY created_at
  LOOP
    IF r.variant_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_now
        FROM inventory_adjustments WHERE variant_id = r.variant_id;
      SELECT COALESCE(cpp, 0) INTO v_cost FROM product_variants WHERE id = r.variant_id;
    ELSE
      SELECT COALESCE(stock, 0), COALESCE(cpp, 0) INTO v_now, v_cost
        FROM products WHERE id = r.product_id AND store_id = v_store_id;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
    END IF;

    -- Lo que decía el sistema al contarlo (los renglones de antes de este
    -- cambio no lo tienen: se compara con el stock de ahora, como antes)
    v_expected := COALESCE(r.expected_qty, v_now);
    v_diff := round(r.counted_qty) - v_expected;

    UPDATE inventory_count_items
       SET expected_qty = v_expected, difference = v_diff, unit_cost = v_cost
     WHERE id = r.id;

    IF v_diff <> 0 THEN
      INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id, unit_cost)
      VALUES (v_store_id, r.product_id, r.variant_id, v_diff, 'count',
              format('Conteo #%s', v_short_id), p_count_id, v_cost);
    END IF;

    v_items      := v_items + 1;
    v_diff_units := v_diff_units + v_diff;
    v_diff_value := v_diff_value + round(v_diff * COALESCE(v_cost, 0));
  END LOOP;

  UPDATE inventory_counts
     SET status = 'applied', applied_at = now(), applied_by_name = toul_current_member_name(),
         notes = COALESCE(NULLIF(trim(p_notes), ''), notes),
         counted_items = v_items, diff_units = v_diff_units, diff_value = v_diff_value
   WHERE id = p_count_id;

  RETURN jsonb_build_object(
    'success', true,
    'countedItems', v_items,
    'diffUnits', v_diff_units,
    'diffValue', v_diff_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_apply_inventory_count(uuid, text) TO authenticated;


-- =================================================================
-- 5. Mercancía perdida y recuperada
-- =================================================================
-- Cada ajuste guarda lo que valía cada unidad (su costo promedio) en el
-- momento en que pasó (la columna se crea en el punto 3). Solo los que
-- cuentan como pérdida o recuperación.

CREATE OR REPLACE FUNCTION public.toul_adjustment_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.unit_cost IS NULL
       AND NEW.reason IN ('damage', 'loss', 'theft', 'expired', 'other', 'reduction', 'count', 'found', 'gift') THEN
        IF NEW.variant_id IS NOT NULL THEN
            SELECT cpp INTO NEW.unit_cost FROM product_variants WHERE id = NEW.variant_id;
        ELSE
            SELECT cpp INTO NEW.unit_cost FROM products WHERE id = NEW.product_id;
        END IF;
        NEW.unit_cost := COALESCE(NEW.unit_cost, 0);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjustment_cost ON inventory_adjustments;
CREATE TRIGGER trg_adjustment_cost
    BEFORE INSERT ON inventory_adjustments
    FOR EACH ROW EXECUTE FUNCTION toul_adjustment_cost();

-- Los ajustes de antes no lo guardaron. Los de un conteo sí tienen su
-- costo en el renglón del conteo; los demás van con el costo de hoy
UPDATE inventory_adjustments ia
   SET unit_cost = ci.unit_cost
  FROM inventory_count_items ci
 WHERE ia.unit_cost IS NULL
   AND ia.reason = 'count'
   AND ci.count_id = ia.reference_id
   AND ci.product_id = ia.product_id
   AND ci.variant_id IS NOT DISTINCT FROM ia.variant_id
   AND ci.unit_cost IS NOT NULL;

UPDATE inventory_adjustments ia
   SET unit_cost = COALESCE(CASE WHEN ia.variant_id IS NOT NULL
                                 THEN (SELECT cpp FROM product_variants WHERE id = ia.variant_id)
                                 ELSE (SELECT cpp FROM products WHERE id = ia.product_id) END, 0)
 WHERE ia.unit_cost IS NULL
   AND ia.reason IN ('damage', 'loss', 'theft', 'expired', 'other', 'reduction', 'count', 'found', 'gift');

-- Lo perdido y lo recuperado de un periodo, a costo promedio. Es la
-- única cuenta: la usan Reportes, Mes a mes, el Inicio, el Excel, TOUL AI
-- y la auditoría.
--   · Perdida:    salidas por daño, pérdida, robo, vencimiento, "Otro" y
--                 "Baja o merma" (el nombre viejo), y lo que faltó al contar.
--   · Recuperada: lo que apareció, el regalo del proveedor, un "Otro" de
--                 entrada y lo que sobró al contar.
CREATE OR REPLACE FUNCTION public.toul_mercancia_perdida(p_store uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS TABLE (perdida numeric, recuperada numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT round(COALESCE(SUM(-quantity * COALESCE(unit_cost, 0))
                 FILTER (WHERE quantity < 0 AND reason IN ('damage', 'loss', 'theft', 'expired', 'other', 'reduction', 'count')), 0)),
           round(COALESCE(SUM(quantity * COALESCE(unit_cost, 0))
                 FILTER (WHERE quantity > 0 AND reason IN ('count', 'found', 'gift', 'other')), 0))
      FROM inventory_adjustments
     WHERE store_id = p_store
       AND created_at >= p_desde AND created_at <= p_hasta
       AND reason IN ('damage', 'loss', 'theft', 'expired', 'other', 'reduction', 'count', 'found', 'gift')
$$;

-- toul_reporte devuelve además 'mercanciaPerdida' y 'mercanciaRecuperada'.
-- (El resto de la función es igual a deploy_movimientos.sql.)
CREATE OR REPLACE FUNCTION public.toul_reporte(p_desde timestamptz, p_hasta timestamptz, p_paso text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store      uuid := toul_current_store_id();
    v_desde      timestamptz := COALESCE(p_desde, '-infinity'::timestamptz);
    v_hasta      timestamptz := COALESCE(p_hasta, now());
    v_ventas     jsonb;
    v_devol      jsonb;
    v_abonos     numeric;
    v_gastos     numeric;
    v_categorias jsonb;
    v_mercancia  numeric;
    v_metodos    jsonb;
    v_metodos_venta jsonb;
    v_productos  jsonb;
    v_linea      jsonb := '{}'::jsonb;
    v_metiste    numeric;
    v_sacaste    numeric;
    v_perdida    numeric;
    v_recuperada numeric;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;
    IF v_hasta < v_desde THEN
        RAISE EXCEPTION 'Elige un rango de fechas válido';
    END IF;
    IF p_paso IS NOT NULL AND p_paso NOT IN ('hora', 'dia') THEN
        RAISE EXCEPTION 'La línea va por hora o por día';
    END IF;

    SELECT jsonb_build_object(
               'total',    round(COALESCE(SUM(total), 0)),
               'cantidad', COUNT(*),
               'contado',  round(COALESCE(SUM(contado), 0)),
               'credito',  round(COALESCE(SUM(total), 0)) - round(COALESCE(SUM(contado), 0)),
               'costo',    round(COALESCE(SUM(costo), 0)))
      INTO v_ventas
      FROM toul_reporte_ventas(v_store, v_desde, v_hasta);

    -- Devoluciones hechas en el periodo
    SELECT jsonb_build_object(
               'total',       round(COALESCE(SUM(total), 0)),
               'costo',       round(COALESCE(SUM(cost_total), 0)),
               'reembolsado', round(COALESCE(SUM(refunded), 0)))
      INTO v_devol
      FROM sale_returns
     WHERE store_id = v_store
       AND created_at >= v_desde AND created_at <= v_hasta;

    -- Abonos que te hicieron en el periodo (de fiados de cualquier fecha)
    SELECT round(COALESCE(SUM(amount), 0)) INTO v_abonos
      FROM credits
     WHERE store_id = v_store AND type = 'payment'
       AND created_at >= v_desde AND created_at <= v_hasta;

    -- Gastos, en total y por categoría
    SELECT round(COALESCE(SUM(amount), 0)) INTO v_gastos
      FROM expenses
     WHERE store_id = v_store
       AND created_at >= v_desde AND created_at <= v_hasta;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('categoria', categoria, 'monto', monto) ORDER BY monto DESC, categoria), '[]'::jsonb)
      INTO v_categorias
      FROM (SELECT COALESCE(NULLIF(trim(category), ''), 'otros') AS categoria, round(SUM(amount)) AS monto
              FROM expenses
             WHERE store_id = v_store
               AND created_at >= v_desde AND created_at <= v_hasta
             GROUP BY 1) c
     WHERE monto > 0;

    -- Mercancía que pagaste: lo pagado al comprar (de contado o el abono
    -- inicial de una compra a crédito) y lo que después le abonaste al proveedor
    SELECT round(COALESCE(SUM(amount), 0)) INTO v_mercancia
      FROM payments
     WHERE store_id = v_store AND type IN ('purchase', 'provider_payment')
       AND created_at >= v_desde AND created_at <= v_hasta;

    -- Entre tú y tu negocio: lo que metiste y lo que sacaste para ti. No es
    -- ganancia ni gasto: no entra en Ganaste ni en la plata que entró o salió
    SELECT round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_in'), 0)),
           round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_out'), 0))
      INTO v_metiste, v_sacaste
      FROM payments
     WHERE store_id = v_store AND type IN ('owner_in', 'owner_out')
       AND created_at >= v_desde AND created_at <= v_hasta;

    -- Mercancía perdida y recuperada, a costo promedio (toul_mercancia_perdida)
    SELECT perdida, recuperada INTO v_perdida, v_recuperada
      FROM toul_mercancia_perdida(v_store, v_desde, v_hasta);

    -- Cómo te pagan: la plata que entró, por método. Lo de cada venta sale
    -- de sus pagos; si una venta de contado no tiene el detalle (ventas
    -- viejas), va al método que quedó anotado en la venta. Los abonos van
    -- por el método que se eligió; los de antes no lo tenían y van como "Abonos".
    -- En la misma pasada, lo vendido por método para el Inicio: solo lo
    -- pagado al vender, menos la plata que se devolvió por cada método.
    -- Suma De contado − lo reembolsado
    WITH pagos AS (
        SELECT v.id, pm.name AS nombre, sp.amount AS monto,
               SUM(sp.amount) OVER (PARTITION BY v.id) AS pagado, v.contado
          FROM toul_reporte_ventas(v_store, v_desde, v_hasta) v
          JOIN sale_payments sp ON sp.sale_id = v.id
          LEFT JOIN payment_methods pm ON pm.id = sp.method_id
         WHERE sp.amount > 0
    ),
    ajustados AS (
        -- Si se pagó más de lo que costó la venta, cada método se ajusta en proporción
        SELECT id, COALESCE(nombre, 'Otros') AS nombre,
               CASE WHEN pagado > contado AND pagado > 0 THEN monto * contado / pagado ELSE monto END AS monto
          FROM pagos
    ),
    resto AS (
        -- Lo de contado que no tiene detalle de pagos
        SELECT CASE WHEN v.metodo IS NULL OR trim(v.metodo) = '' THEN 'Otros'
                    WHEN v.metodo = lower(v.metodo) THEN initcap(v.metodo)
                    ELSE v.metodo END AS nombre,
               v.contado - COALESCE((SELECT SUM(a.monto) FROM ajustados a WHERE a.id = v.id), 0) AS monto
          FROM toul_reporte_ventas(v_store, v_desde, v_hasta) v
    ),
    al_vender AS (
        SELECT nombre, monto, 0 AS prioridad FROM ajustados
        UNION ALL
        SELECT nombre, monto, 1 FROM resto WHERE monto > 0
    ),
    entradas AS (
        SELECT nombre, monto, prioridad FROM al_vender
        UNION ALL
        -- Los abonos de antes no tenían método: del 29 sep al 14 oct de 2026
        -- quedaron como "General" y después sin nada. Todos van como "Abonos"
        SELECT CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 'Abonos' ELSE payment_method END,
               amount,
               CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 2 ELSE 0 END
          FROM credits
         WHERE store_id = v_store AND type = 'payment'
           AND created_at >= v_desde AND created_at <= v_hasta
    ),
    devuelto AS (
        -- La plata devuelta en el periodo, por el método con que salió
        SELECT COALESCE(pm.name, 'Otros') AS nombre, -r.refunded AS monto, 2 AS prioridad
          FROM sale_returns r
          LEFT JOIN payment_methods pm ON pm.id = r.refund_method_id
         WHERE r.store_id = v_store AND r.refunded > 0
           AND r.created_at >= v_desde AND r.created_at <= v_hasta
    ),
    por_metodo AS (
        -- "Efectivo" y "efectivo" son el mismo método
        SELECT (array_agg(nombre ORDER BY prioridad))[1] AS nombre, round(SUM(monto)) AS monto
          FROM entradas
         GROUP BY lower(trim(nombre))
    ),
    por_metodo_venta AS (
        SELECT (array_agg(nombre ORDER BY prioridad))[1] AS nombre, round(SUM(monto)) AS monto
          FROM (SELECT nombre, monto, prioridad FROM al_vender
                UNION ALL
                SELECT nombre, monto, prioridad FROM devuelto) m
         GROUP BY lower(trim(nombre))
    )
    SELECT (SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'monto', monto) ORDER BY monto DESC, nombre), '[]'::jsonb)
              FROM por_metodo WHERE monto > 0),
           -- Un método puede quedar en negativo si se devolvió más de lo que entró por él
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'monto', monto) ORDER BY monto DESC, nombre), '[]'::jsonb)
              FROM por_metodo_venta WHERE monto <> 0)
      INTO v_metodos, v_metodos_venta;

    -- Qué te dejó más: los 5 productos con más ganancia, ya restado lo
    -- que devolvieron en el periodo. El descuento de una venta se reparte
    -- entre sus productos en proporción a lo que valía cada uno (igual que
    -- en una devolución): así lo que dejó cada producto es lo que de verdad
    -- pagaron por él. Los combos no tienen ficha de producto
    WITH vendido AS (
        SELECT si.product_id,
               SUM(si.unit_price * si.quantity * f.factor) AS ventas,
               SUM((si.unit_price * f.factor - si.unit_cost) * si.quantity) AS ganancia
          FROM sale_items si
          JOIN toul_reporte_ventas(v_store, v_desde, v_hasta) v ON v.id = si.sale_id
          CROSS JOIN LATERAL (
              SELECT CASE WHEN SUM(x.subtotal) > 0 THEN v.total / SUM(x.subtotal) ELSE 1 END AS factor
                FROM sale_items x WHERE x.sale_id = v.id) f
         WHERE si.product_id IS NOT NULL
         GROUP BY si.product_id
    ),
    devuelto AS (
        SELECT si.product_id,
               SUM(ri.unit_price * ri.quantity * f.factor) AS ventas,
               SUM((ri.unit_price * f.factor - ri.unit_cost) * ri.quantity) AS ganancia
          FROM sale_return_items ri
          JOIN sale_returns r ON r.id = ri.return_id
          JOIN sale_items si ON si.id = ri.sale_item_id
          JOIN sales s ON s.id = si.sale_id
          CROSS JOIN LATERAL (
              SELECT CASE WHEN SUM(x.subtotal) > 0 THEN s.total / SUM(x.subtotal) ELSE 1 END AS factor
                FROM sale_items x WHERE x.sale_id = s.id) f
         WHERE r.store_id = v_store
           AND r.created_at >= v_desde AND r.created_at <= v_hasta
           AND si.product_id IS NOT NULL
         GROUP BY si.product_id
    ),
    neto AS (
        SELECT COALESCE(a.product_id, d.product_id) AS product_id,
               COALESCE(a.ventas, 0) - COALESCE(d.ventas, 0) AS ventas,
               COALESCE(a.ganancia, 0) - COALESCE(d.ganancia, 0) AS ganancia
          FROM vendido a
          FULL JOIN devuelto d ON d.product_id = a.product_id
    )
    SELECT COALESCE(jsonb_agg(fila ORDER BY (fila->>'ganancia')::numeric DESC, fila->>'nombre'), '[]'::jsonb)
      INTO v_productos
      FROM (
        SELECT jsonb_build_object(
                   'id',       n.product_id,
                   'nombre',   COALESCE(p.name, 'Producto'),
                   'ventas',   round(n.ventas),
                   'ganancia', round(n.ganancia),
                   'margen',   CASE WHEN n.ventas > 0 THEN round(n.ganancia / n.ventas * 100) ELSE 0 END) AS fila
          FROM neto n
          LEFT JOIN products p ON p.id = n.product_id
         WHERE round(n.ganancia) > 0
         ORDER BY n.ganancia DESC, p.name
         LIMIT 5
      ) t;

    -- La línea del Inicio. Cada venta cuenta en la hora o el día de
    -- Colombia en que se hizo, y cada devolución resta en el suyo. El
    -- acumulado se redondea igual que Vendiste (ventas y devoluciones por
    -- separado), así el último punto da exacto lo mismo. `t` es el momento
    -- en que empieza esa hora o ese día; solo vienen los que tuvieron algo.
    -- `primeraVenta`: si nunca ha vendido, el Inicio no dibuja la línea
    IF p_paso IS NOT NULL THEN
        WITH movimientos AS (
            SELECT date_trunc(CASE WHEN p_paso = 'hora' THEN 'hour' ELSE 'day' END, s.created_at AT TIME ZONE 'America/Bogota') AS tramo,
                   v.total AS vendido, 0::numeric AS devuelto, 1 AS ventas
              FROM toul_reporte_ventas(v_store, v_desde, v_hasta) v
              JOIN sales s ON s.id = v.id
            UNION ALL
            SELECT date_trunc(CASE WHEN p_paso = 'hora' THEN 'hour' ELSE 'day' END, r.created_at AT TIME ZONE 'America/Bogota'),
                   0, r.total, 0
              FROM sale_returns r
             WHERE r.store_id = v_store
               AND r.created_at >= v_desde AND r.created_at <= v_hasta
        ),
        por_tramo AS (
            SELECT tramo, SUM(vendido) AS vendido, SUM(devuelto) AS devuelto, SUM(ventas)::integer AS ventas
              FROM movimientos GROUP BY tramo
        ),
        acumulado AS (
            SELECT tramo, ventas,
                   round(SUM(vendido) OVER w) - round(SUM(devuelto) OVER w) AS acumulado
              FROM por_tramo
            WINDOW w AS (ORDER BY tramo ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        )
        SELECT jsonb_build_object(
                   'serie', COALESCE(jsonb_agg(jsonb_build_object(
                                't', tramo AT TIME ZONE 'America/Bogota', 'acumulado', acumulado, 'ventas', ventas) ORDER BY tramo), '[]'::jsonb),
                   'primeraVenta', (SELECT min(created_at) FROM sales WHERE store_id = v_store))
          INTO v_linea
          FROM acumulado;
    END IF;

    RETURN jsonb_build_object(
        'ventas',             v_ventas,
        'devoluciones',       v_devol,
        'abonos',             v_abonos,
        'gastos',             v_gastos,
        'gastosPorCategoria', v_categorias,
        'mercanciaPagada',    v_mercancia,
        'metodos',            v_metodos,
        'metodosVenta',       v_metodos_venta,
        'productos',          v_productos,
        'metiste',            v_metiste,
        'sacaste',            v_sacaste,
        'mercanciaPerdida',   v_perdida,
        'mercanciaRecuperada', v_recuperada
    ) || v_linea;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte(timestamptz, timestamptz, text) TO authenticated;

-- Mes a mes: la ganancia también resta lo perdido y suma lo recuperado.
-- (El resto de la función es igual a deploy_reportes.sql.)
CREATE OR REPLACE FUNCTION public.toul_reporte_meses(p_meses integer DEFAULT 6, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   uuid := toul_current_store_id();
    v_actual  date := date_trunc('month', COALESCE(p_hasta, (now() AT TIME ZONE 'America/Bogota')::date))::date;
    v_desde   date;
    v_primero date;
    v_rows    jsonb;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;

    v_desde := (v_actual - make_interval(months => GREATEST(COALESCE(p_meses, 6), 1) - 1))::date;

    SELECT date_trunc('month', min(created_at) AT TIME ZONE 'America/Bogota')::date
      INTO v_primero
      FROM sales WHERE store_id = v_store;

    IF v_primero IS NULL OR v_primero > v_actual THEN
        RETURN '[]'::jsonb;
    END IF;
    v_desde := GREATEST(v_desde, v_primero);

    WITH meses AS (
        SELECT generate_series(v_desde, v_actual, interval '1 month')::date AS mes
    ),
    -- Inicio y fin de cada mes en hora de Colombia, como instantes
    limites AS (
        SELECT mes,
               mes::timestamp AT TIME ZONE 'America/Bogota' AS desde,
               (mes + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota' AS hasta
          FROM meses
    ),
    ventas AS (
        SELECT l.mes, SUM(s.total) AS total,
               SUM((SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id)) AS costo
          FROM limites l
          JOIN sales s ON s.store_id = v_store AND s.created_at >= l.desde AND s.created_at < l.hasta
         GROUP BY l.mes
    ),
    devoluciones AS (
        SELECT l.mes, SUM(r.total) AS total, SUM(r.cost_total) AS costo
          FROM limites l
          JOIN sale_returns r ON r.store_id = v_store AND r.created_at >= l.desde AND r.created_at < l.hasta
         GROUP BY l.mes
    ),
    gastos AS (
        SELECT l.mes, SUM(e.amount) AS total
          FROM limites l
          JOIN expenses e ON e.store_id = v_store AND e.created_at >= l.desde AND e.created_at < l.hasta
         GROUP BY l.mes
    ),
    -- La misma cuenta de toul_reporte, con el mes completo
    perdidas AS (
        SELECT l.mes, m.perdida, m.recuperada
          FROM limites l
          CROSS JOIN LATERAL toul_mercancia_perdida(v_store, l.desde, l.hasta - interval '1 millisecond') m
    )
    -- Cada suma se redondea por separado, igual que en toul_reporte: así
    -- el mes completo da exactamente lo mismo en las dos funciones
    SELECT jsonb_agg(jsonb_build_object(
               'mes',      to_char(m.mes, 'YYYY-MM-DD'),
               'ventas',   round(COALESCE(v.total, 0)) - round(COALESCE(d.total, 0)),
               'ganancia', (round(COALESCE(v.total, 0)) - round(COALESCE(d.total, 0)))
                         - (round(COALESCE(v.costo, 0)) - round(COALESCE(d.costo, 0)))
                         - round(COALESCE(g.total, 0))
                         - COALESCE(pe.perdida, 0) + COALESCE(pe.recuperada, 0))
           ORDER BY m.mes)
      INTO v_rows
      FROM meses m
      LEFT JOIN ventas v ON v.mes = m.mes
      LEFT JOIN devoluciones d ON d.mes = m.mes
      LEFT JOIN gastos g ON g.mes = m.mes
      LEFT JOIN perdidas pe ON pe.mes = m.mes;

    RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte_meses(integer, date) TO authenticated;


-- =================================================================
-- 6. Auditoría: mercancía perdida, De cada $100 y combos
-- =================================================================
-- (El resto de la función es igual a deploy_movimientos.sql.)
CREATE OR REPLACE FUNCTION public.toul_auditoria()
RETURNS TABLE (tienda text, periodo text, chequeo text, esperado numeric, obtenido numeric, ok boolean, detalle text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_store   uuid := toul_current_store_id();
    v_m       jsonb;
    v_mes     date;
    v_desde   timestamptz;
    v_hasta   timestamptz;
    v_r       jsonb;
    v_total   numeric; v_contado numeric; v_credito numeric; v_costo numeric;
    v_dtotal  numeric; v_dcosto numeric; v_abonos numeric; v_gastos numeric;
    v_netas   numeric; v_costo_neto numeric; v_ganancia numeric; v_ganaste numeric;
    v_x       numeric; v_y numeric; v_n integer; v_txt text;
    v_c       numeric; v_g numeric; v_q numeric; v_suma integer;
    v_cartera jsonb;
    v_perdida numeric; v_recuperada numeric; v_pe numeric; v_pd numeric; v_rd numeric;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede correr la auditoría';
    END IF;
    SELECT name INTO tienda FROM stores WHERE id = v_store;

    -- ── Mes por mes, desde el mes de la primera venta ──
    FOR v_m IN SELECT * FROM jsonb_array_elements(toul_reporte_meses(1200)) LOOP
        v_mes   := (v_m->>'mes')::date;
        periodo := to_char(v_mes, 'YYYY-MM');
        v_desde := v_mes::timestamp AT TIME ZONE 'America/Bogota';
        v_hasta := ((v_mes + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota') - interval '1 millisecond';
        v_r := toul_reporte(v_desde, v_hasta);

        v_total   := (v_r->'ventas'->>'total')::numeric;
        v_contado := (v_r->'ventas'->>'contado')::numeric;
        v_credito := (v_r->'ventas'->>'credito')::numeric;
        v_costo   := (v_r->'ventas'->>'costo')::numeric;
        v_dtotal  := (v_r->'devoluciones'->>'total')::numeric;
        v_dcosto  := (v_r->'devoluciones'->>'costo')::numeric;
        v_abonos  := (v_r->>'abonos')::numeric;
        v_gastos  := (v_r->>'gastos')::numeric;
        v_perdida    := COALESCE((v_r->>'mercanciaPerdida')::numeric, 0);
        v_recuperada := COALESCE((v_r->>'mercanciaRecuperada')::numeric, 0);
        -- Las mismas cuentas de la pantalla (lib/reports/calculos.ts → resumir)
        v_netas      := v_total - v_dtotal;
        v_costo_neto := v_costo - v_dcosto;
        v_ganancia   := v_netas - v_costo_neto;
        v_ganaste    := v_ganancia - v_gastos - v_perdida + v_recuperada;

        chequeo := 'De contado + A crédito = Ventas antes de devoluciones';
        esperado := v_total; obtenido := v_contado + v_credito; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- Lo fiado de esas ventas, según los movimientos de los clientes
        SELECT round(COALESCE(SUM(c.amount), 0)) INTO v_x
          FROM credits c JOIN sales s ON s.id = c.sale_id
         WHERE s.store_id = v_store AND c.type = 'debt' AND s.created_at >= v_desde AND s.created_at <= v_hasta;
        SELECT count(*) INTO v_n FROM sales s
         WHERE s.store_id = v_store AND s.is_credit AND s.created_at >= v_desde AND s.created_at <= v_hasta
           AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.sale_id = s.id AND c.type = 'debt')
           AND s.total > (SELECT COALESCE(SUM(sp.amount), 0) FROM sale_payments sp WHERE sp.sale_id = s.id);
        chequeo := 'A crédito = lo fiado que quedó en los clientes';
        esperado := v_credito; obtenido := v_x; ok := esperado = obtenido;
        detalle := CASE WHEN v_n > 0 THEN v_n || ' venta(s) a crédito sin fiado registrado' END;
        RETURN NEXT;

        SELECT COALESCE(SUM((m->>'monto')::numeric), 0) INTO v_x FROM jsonb_array_elements(v_r->'metodos') m;
        chequeo := 'Plata que entró (de contado + abonos) = suma de la dona';
        esperado := v_contado + v_abonos; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- Hasta el 14 oct de 2026 los abonos entraban a la caja como 'credit_payment'
        SELECT round(COALESCE(SUM(amount), 0)) INTO v_x FROM payments
         WHERE store_id = v_store AND type IN ('sale_payment', 'credit_payment') AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Abonos de clientes = abonos que entraron a la caja';
        esperado := v_abonos; obtenido := v_x; ok := esperado = obtenido;
        detalle := CASE WHEN NOT ok THEN 'Movimientos muestra otro total de abonos este mes' END;
        RETURN NEXT;

        chequeo := 'Ganaste = Ganancia en ventas − Gastos − Mercancía perdida + recuperada (Reportes = Mes a mes)';
        esperado := v_ganaste; obtenido := (v_m->>'ganancia')::numeric; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        chequeo := 'Vendiste sin devoluciones (Reportes = Mes a mes)';
        esperado := v_netas; obtenido := (v_m->>'ventas')::numeric; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- La línea del gráfico del Inicio, día por día, termina en Vendiste
        SELECT COALESCE((SELECT (e->>'acumulado')::numeric FROM jsonb_array_elements(toul_reporte(v_desde, v_hasta, 'dia')->'serie') e
                          ORDER BY (e->>'t')::timestamptz DESC LIMIT 1), 0) INTO v_x;
        chequeo := 'Gráfico del Inicio: la línea termina en Vendiste';
        esperado := v_netas; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- De cada $100, con la misma regla de la pantalla: se reparte 100
        -- redondeando hacia abajo y el que perdió más decimales se lleva lo que falta
        IF v_netas > 0 THEN
            v_c := GREATEST(v_costo_neto, 0);
            v_g := GREATEST(v_gastos, 0);
            -- "Se perdió": solo si en el periodo se perdió más de lo que se recuperó
            v_pe := GREATEST(v_perdida - v_recuperada, 0);
            v_q := v_netas - v_c - v_g - v_pe;
            IF v_q < 0 THEN v_q := 0; END IF;
            WITH partes(valor) AS (VALUES (v_c), (v_g), (v_pe), (v_q)),
                 exactos AS (SELECT valor * 100 / NULLIF(v_c + v_g + v_pe + v_q, 0) AS x FROM partes),
                 pisos AS (SELECT floor(x) AS piso, x - floor(x) AS resto FROM exactos),
                 falta AS (SELECT 100 - SUM(piso)::integer AS n FROM pisos),
                 orden AS (SELECT piso, row_number() OVER (ORDER BY resto DESC) AS pos FROM pisos)
            SELECT SUM(piso + CASE WHEN pos <= (SELECT n FROM falta) THEN 1 ELSE 0 END)::integer INTO v_suma FROM orden;
            chequeo := 'De cada $100: mercancía + gastos + se perdió + te quedó = 100';
            esperado := 100; obtenido := v_suma; ok := esperado = obtenido; detalle := NULL;
            RETURN NEXT;
        END IF;

        -- El Inicio usa esta misma función. Aparte, se suman directo las
        -- ventas, devoluciones y gastos del mes: tienen que dar lo mismo
        SELECT round(COALESCE(SUM(s.total), 0)),
               round(COALESCE(SUM((SELECT COALESCE(SUM(i.unit_cost * i.quantity), 0) FROM sale_items i WHERE i.sale_id = s.id)), 0))
          INTO v_x, v_y
          FROM sales s WHERE s.store_id = v_store AND s.created_at >= v_desde AND s.created_at <= v_hasta;
        SELECT v_x - round(COALESCE(SUM(total), 0)), v_y - round(COALESCE(SUM(cost_total), 0)) INTO v_x, v_y
          FROM sale_returns WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Vendiste (después de devoluciones) = suma directa';
        esperado := v_netas; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Ganancia en ventas = suma directa';
        esperado := v_ganancia; obtenido := v_x - v_y; ok := esperado = obtenido;
        RETURN NEXT;
        SELECT round(COALESCE(SUM(amount), 0)) INTO v_x FROM expenses
         WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Gastos = suma directa';
        esperado := v_gastos; obtenido := v_x; ok := esperado = obtenido;
        RETURN NEXT;
        -- Lo perdido y lo recuperado, sumado directo de los ajustes del mes
        SELECT round(COALESCE(SUM(-quantity * COALESCE(unit_cost, 0))
                     FILTER (WHERE quantity < 0 AND reason IN ('damage', 'loss', 'theft', 'expired', 'other', 'reduction', 'count')), 0)),
               round(COALESCE(SUM(quantity * COALESCE(unit_cost, 0))
                     FILTER (WHERE quantity > 0 AND reason IN ('count', 'found', 'gift', 'other')), 0))
          INTO v_pd, v_rd
          FROM inventory_adjustments
         WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Mercancía perdida = suma directa de los ajustes';
        esperado := v_perdida; obtenido := v_pd; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Mercancía recuperada = suma directa de los ajustes';
        esperado := v_recuperada; obtenido := v_rd; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Ganaste = ganancia en ventas − gastos − mercancía perdida + mercancía recuperada (suma directa)';
        esperado := v_ganaste; obtenido := v_ganancia - v_x - v_pd + v_rd; ok := esperado = obtenido;
        detalle := CASE WHEN v_pd > 0 OR v_rd > 0 THEN 'Este mes se perdió $' || v_pd || ' y se recuperó $' || v_rd || ' en mercancía' END;
        RETURN NEXT;
        detalle := NULL;

        -- Metí y Saqué plata: van aparte y no tocan lo que ganaste
        v_g := v_x;   -- los gastos del mes, sumados directo
        SELECT round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_in'), 0)),
               round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_out'), 0))
          INTO v_x, v_y
          FROM payments
         WHERE store_id = v_store AND type IN ('owner_in', 'owner_out')
           AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Metiste (Entre tú y tu negocio) = suma directa de "Metí plata"';
        esperado := COALESCE((v_r->>'metiste')::numeric, 0); obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Sacaste para ti (Entre tú y tu negocio) = suma directa de "Saqué plata"';
        esperado := COALESCE((v_r->>'sacaste')::numeric, 0); obtenido := v_y; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Metí y Saqué plata no cambian Ganaste';
        esperado := v_ganaste; obtenido := v_netas - v_costo_neto - v_g - v_pd + v_rd; ok := esperado = obtenido;
        detalle := CASE WHEN v_x > 0 OR v_y > 0 THEN 'Este mes metiste $' || v_x || ' y sacaste $' || v_y || ': no entran en la cuenta' END;
        RETURN NEXT;

        -- La hoja "Ventas" del Excel, tal cual la arma toul_reporte_detalle
        SELECT round(COALESCE(SUM((f->>'total')::numeric), 0)), round(COALESCE(SUM((f->>'costo')::numeric), 0)),
               round(COALESCE(SUM((f->>'contado')::numeric), 0)), count(*)::integer
          INTO v_x, v_y, v_c, v_n
          FROM jsonb_array_elements(toul_reporte_detalle(v_desde, v_hasta)) f;
        chequeo := 'Excel: la columna Total suma lo mismo que Ventas antes de devoluciones';
        esperado := v_total; obtenido := v_x; ok := esperado = obtenido; detalle := v_n || ' ventas en la hoja';
        RETURN NEXT;
        chequeo := 'Excel: la columna Costo suma lo mismo que el resumen';
        esperado := v_costo; obtenido := v_y; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Excel: De contado y A crédito suman lo mismo que el resumen';
        esperado := v_contado + v_credito; obtenido := v_c + (v_x - v_c); ok := v_c = v_contado AND (v_x - v_c) = v_credito;
        detalle := CASE WHEN NOT ok THEN 'de contado ' || v_c || ' vs ' || v_contado END;
        RETURN NEXT;
    END LOOP;

    -- ── Lo de hoy ──
    periodo := 'Hoy';
    v_cartera := toul_receivables();

    -- La línea de Hoy va por hora: también termina en Vendiste
    v_desde := date_trunc('day', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
    v_r := toul_reporte(v_desde, now(), 'hora');
    SELECT COALESCE((SELECT (e->>'acumulado')::numeric FROM jsonb_array_elements(v_r->'serie') e
                      ORDER BY (e->>'t')::timestamptz DESC LIMIT 1), 0) INTO v_x;
    chequeo := 'Gráfico del Inicio: la línea de hoy termina en Vendiste';
    esperado := (v_r->'ventas'->>'total')::numeric - (v_r->'devoluciones'->>'total')::numeric;
    obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

    WITH saldos AS (
        SELECT customer_id, round(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)) AS saldo
          FROM credits WHERE store_id = v_store GROUP BY customer_id
    )
    SELECT COALESCE(SUM(saldo) FILTER (WHERE saldo > 0), 0), COALESCE(SUM(saldo), 0), count(*) FILTER (WHERE saldo < 0)::integer
      INTO v_x, v_y, v_n FROM saldos;
    chequeo := 'Te deben (Cuentas por cobrar) = suma de los saldos de los clientes';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;
    chequeo := 'Te deben = lo fiado − lo abonado, histórico';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_y; ok := esperado = obtenido;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' cliente(s) con saldo a favor (abonaron de más)' END;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(total_debt), 0)) INTO v_x FROM customers WHERE store_id = v_store;
    SELECT count(*)::integer INTO v_n FROM customers cu
     WHERE cu.store_id = v_store
       AND round(COALESCE(cu.total_debt, 0)) <> round(COALESCE((SELECT SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)
                                                              FROM credits c WHERE c.customer_id = cu.id), 0));
    chequeo := 'Te deben = lo guardado en cada cliente';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_x; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' cliente(s) descuadrado(s): se arreglan con "Cuadrar" en su ficha' END;
    RETURN NEXT;

    -- Debes: el Inicio y Proveedores usan toul_payables
    v_y := round((toul_payables()->>'total')::numeric);
    SELECT round(COALESCE(SUM(total_debt), 0)) INTO v_x FROM providers WHERE store_id = v_store;
    SELECT count(*)::integer INTO v_n FROM providers pr
     WHERE pr.store_id = v_store
       AND round(COALESCE(pr.total_debt, 0)) <> round(COALESCE((SELECT SUM(remaining_amount) FROM provider_debts d
                                                               WHERE d.provider_id = pr.id AND d.status <> 'paid'), 0));
    chequeo := 'Debes = lo guardado en cada proveedor';
    esperado := v_y; obtenido := v_x; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' proveedor(es) con la copia descuadrada' END;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(p.total - (SELECT COALESCE(SUM(pp.amount), 0) FROM purchase_payments pp WHERE pp.purchase_id = p.id)), 0))
      INTO v_x FROM purchases p
     WHERE p.store_id = v_store AND p.is_credit AND p.status IS DISTINCT FROM 'voided';
    SELECT v_x - round(COALESCE(SUM(amount), 0)) INTO v_x FROM payments WHERE store_id = v_store AND type = 'provider_payment';
    chequeo := 'Debes = lo comprado a crédito − lo pagado, histórico';
    esperado := v_y; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

    -- Plata en mercancía, contada aparte: cada presentación con su costo,
    -- también lo escondido que tiene stock
    SELECT round(COALESCE(SUM(GREATEST(v.stock, 0) * COALESCE(v.cpp, 0)), 0)) INTO v_x
      FROM product_variants v WHERE v.store_id = v_store;
    SELECT v_x + round(COALESCE(SUM(GREATEST(p.stock, 0) * COALESCE(p.cpp, 0)), 0)) INTO v_x
      FROM products p WHERE p.store_id = v_store
       AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);
    v_y := round((toul_inventory_overview(1)->>'hiddenValue')::numeric);
    chequeo := 'Plata en mercancía = stock × costo, con presentaciones y lo escondido';
    esperado := round((toul_inventory_overview(1)->>'value')::numeric); obtenido := v_x; ok := esperado = obtenido;
    detalle := CASE WHEN v_y > 0 THEN 'Incluye $' || v_y || ' de productos escondidos con stock' END;
    RETURN NEXT;

    -- Cada combo vendido guarda lo que costaron sus productos
    SELECT count(*)::integer INTO v_n
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
     WHERE s.store_id = v_store AND si.combo_id IS NOT NULL AND COALESCE(si.unit_cost, 0) = 0
       AND EXISTS (SELECT 1 FROM combo_items ci
                     LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                     LEFT JOIN products pr ON pr.id = ci.product_id
                    WHERE ci.combo_id = si.combo_id
                      AND COALESCE(CASE WHEN ci.variant_id IS NOT NULL THEN pv.cpp ELSE pr.cpp END, 0) > 0);
    chequeo := 'Cada combo vendido tiene su costo';
    esperado := 0; obtenido := v_n; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' venta(s) de combos con costo $0' END;
    RETURN NEXT;

    SELECT count(*)::integer, string_agg(nombre, ', ') INTO v_n, v_txt FROM (
        SELECT p.name AS nombre FROM products p WHERE p.store_id = v_store AND p.stock < 0
        UNION ALL
        SELECT p.name || ' · ' || v.name FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.store_id = v_store AND v.stock < 0
        LIMIT 10
    ) x;
    chequeo := 'Ningún stock negativo';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := v_txt;
    RETURN NEXT;

    SELECT count(*)::integer, string_agg(nombre, ', ') INTO v_n, v_txt FROM (
        SELECT cu.name AS nombre FROM customers cu
         WHERE cu.store_id = v_store
           AND COALESCE((SELECT SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END) FROM credits c WHERE c.customer_id = cu.id), 0) < -0.5
        LIMIT 10
    ) x;
    chequeo := 'Ningún cliente con saldo negativo';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := v_txt;
    RETURN NEXT;

    SELECT count(*)::integer INTO v_n FROM (
        SELECT 1 FROM provider_debts WHERE store_id = v_store AND remaining_amount < 0
        UNION ALL
        SELECT 1 FROM providers WHERE store_id = v_store AND total_debt < 0
    ) x;
    chequeo := 'Ninguna deuda negativa con proveedores';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := NULL;
    RETURN NEXT;

    -- Cada pago con plata mía tiene su "Metí plata" atado, por el mismo
    -- monto y la misma fecha; y ningún Metí plata atado se quedó sin lo que pagó
    SELECT round(COALESCE(SUM(p.amount), 0)), round(COALESCE(SUM(m.amount), 0)),
           (count(*) FILTER (WHERE m.id IS NULL OR m.amount <> p.amount OR m.created_at <> p.created_at OR NOT m.own_money))::integer
      INTO v_x, v_y, v_n
      FROM payments p
      LEFT JOIN payments m ON m.linked_payment_id = p.id AND m.type = 'owner_in'
     WHERE p.store_id = v_store AND p.own_money AND p.type IN ('expense', 'purchase', 'provider_payment');
    SELECT v_n + count(*)::integer INTO v_n FROM payments m
     WHERE m.store_id = v_store AND m.linked_payment_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = m.linked_payment_id AND p.own_money);
    chequeo := 'Cada pago con "Plata mía" tiene su "Metí plata" por el mismo monto';
    esperado := v_x; obtenido := v_y; ok := v_n = 0 AND v_x = v_y;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' pago(s) con plata mía sin su Metí plata, o al revés' END;
    RETURN NEXT;

    -- Cada turno cuenta el efectivo que se movió mientras estaba abierto:
    -- gastos, compras, pagos, Metí y Saqué plata anotados desde la app
    SELECT count(*)::integer INTO v_n FROM payments p
     WHERE p.store_id = v_store
       AND p.type IN ('expense', 'purchase', 'provider_payment', 'owner_in', 'owner_out')
       AND p.created_by IS NOT NULL
       AND p.cash_session_id IS DISTINCT FROM (
           CASE WHEN NOT p.own_money AND toul_es_efectivo(p.store_id, p.method_id, p.method) THEN
               (SELECT cs.id FROM cash_sessions cs
                 WHERE cs.store_id = p.store_id AND cs.opened_at <= p.created_at
                   AND (cs.closed_at IS NULL OR cs.closed_at > p.created_at)
                 ORDER BY cs.opened_at DESC LIMIT 1)
           END);
    chequeo := 'Cada turno cuenta el efectivo que se movió mientras estaba abierto';
    esperado := 0; obtenido := v_n; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' movimiento(s) en efectivo fuera del turno en que pasaron' END;
    RETURN NEXT;

    -- Lo que se contó al cerrar un turno no cambia después
    SELECT count(*)::integer, string_agg(to_char(cs.opened_at AT TIME ZONE 'America/Bogota', 'DD/MM HH24:MI'), ', ')
      INTO v_n, v_txt
      FROM cash_sessions cs
     WHERE cs.store_id = v_store AND cs.status = 'closed' AND cs.expected_cash IS NOT NULL
       AND round(cs.expected_cash) <> (toul_cash_session_totals(cs.id)->>'expectedCash')::numeric;
    chequeo := 'Los turnos cerrados siguen dando lo mismo que al cerrarlos';
    esperado := 0; obtenido := v_n; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN 'Turnos que cambiaron después de cerrarse: ' || v_txt END;
    RETURN NEXT;

    -- Algunas funciones viejas pasan la hora a Colombia restando 5 horas:
    -- eso solo da bien si la base trabaja en UTC
    chequeo := 'La base de datos trabaja en hora UTC';
    esperado := NULL; obtenido := NULL;
    ok := current_setting('TimeZone') IN ('UTC', 'Etc/UTC', 'GMT', 'Etc/GMT', 'UCT', 'Etc/UCT', 'Universal', 'Zulu');
    detalle := current_setting('TimeZone');
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_auditoria() TO authenticated;


-- =================================================================
-- 7. El vendedor no mueve inventario por su cuenta
-- =================================================================
-- Desde la app, alguien que no es administrador solo puede mover
-- inventario a través de una venta, una devolución o una anulación. Un
-- movimiento escrito directo (por ejemplo, desde la consola del navegador)
-- se rechaza. El SQL Editor y el administrador no cambian.
CREATE OR REPLACE FUNCTION public.toul_inventario_solo_por_funciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_pila text;
BEGIN
    IF COALESCE(current_setting('role', true), 'none') NOT IN ('authenticated', 'anon') THEN
        RETURN NEW;
    END IF;
    IF toul_current_role() = 'admin' THEN
        RETURN NEW;
    END IF;
    -- Quién está escribiendo: la venta, la devolución o la anulación
    GET DIAGNOSTICS v_pila = PG_CONTEXT;
    IF v_pila ~ 'function (public\.)?(process_sale|toul_return_sale_internal|toul_void_sale_internal)\(' THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'El inventario solo se mueve vendiendo, devolviendo o anulando una venta';
END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_solo_por_funciones ON inventory_adjustments;
CREATE TRIGGER trg_inventario_solo_por_funciones
    BEFORE INSERT ON inventory_adjustments
    FOR EACH ROW EXECUTE FUNCTION toul_inventario_solo_por_funciones();


NOTIFY pgrst, 'reload schema';
