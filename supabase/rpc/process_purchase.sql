-- =================================================================
-- RPC: process_purchase(payload jsonb) RETURNS jsonb
-- =================================================================
-- Procesa una compra completa de forma atómica.
-- Reemplaza la lógica secuencial de /api/purchases/route.ts, que
-- ignoraba errores intermedios y podía dejar compras a medio crear.
--
-- Pasos (todos en una sola transacción):
--   1. Validar auth, tienda, ítems y pagos
--   2. Validar saldo de cada billetera usada (excepto capital propio)
--   3. INSERT purchases
--   4. Por cada ítem:
--      - INSERT purchase_items
--      - Recalcular CPP del producto (y de la variante si aplica)
--      - INSERT inventory_adjustments (el trigger actualiza products.stock)
--   5. Si crédito: INSERT provider_debts + UPDATE providers.total_debt
--   6. Por cada pago: INSERT purchase_payments + (payments | owner_capital_injections)
--
-- Cualquier RAISE EXCEPTION revierte TODO.
--
-- Payload esperado (el mismo que ya envía inventory/purchase/page.tsx):
--   { providerId, isCredit, dueDate,
--     payments: [{ methodId, methodName, amount, isCapital }],
--     items:    [{ productId, variantId?, quantity, unitCost }] }
--
-- SECURITY INVOKER + auth.uid() — respeta RLS del usuario.
-- =================================================================

CREATE OR REPLACE FUNCTION public.process_purchase(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_user_id       uuid;
    v_store_id      uuid;
    v_purchase_id   uuid;
    v_provider_id   uuid;
    v_is_credit     boolean;
    v_total         numeric := 0;
    v_paid          numeric := 0;
    v_remaining     numeric;
    v_short_id      text;

    v_item          jsonb;
    v_pay           jsonb;

    v_product_id    uuid;
    v_variant_id    uuid;
    v_quantity      numeric;
    v_unit_cost     numeric;
    v_stock         numeric;
    v_cpp           numeric;
    v_new_cpp       numeric;
    v_method_name   text;
    v_amount        numeric;
    v_balance       numeric;
BEGIN
    -- ─── 1. Auth, tienda y validaciones ──────────────────────────
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Solo administradores registran compras
    SELECT id INTO v_store_id FROM stores WHERE owner_id = v_user_id;
    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'Solo el administrador puede registrar compras';
    END IF;

    IF jsonb_array_length(COALESCE(payload->'items', '[]'::jsonb)) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos un producto';
    END IF;

    v_provider_id := NULLIF(payload->>'providerId', '')::uuid;
    v_is_credit   := COALESCE((payload->>'isCredit')::boolean, false);

    IF v_is_credit AND v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona un proveedor para registrar una compra a crédito';
    END IF;

    -- Total calculado en el servidor (no se confía en el total del cliente)
    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items')
    LOOP
        v_quantity  := COALESCE((v_item->>'quantity')::numeric, 0);
        v_unit_cost := COALESCE((v_item->>'unitCost')::numeric, -1);
        IF v_quantity <= 0 OR v_quantity <> trunc(v_quantity) THEN
            RAISE EXCEPTION 'Cantidad inválida en uno de los productos';
        END IF;
        IF v_unit_cost < 0 THEN
            RAISE EXCEPTION 'Costo inválido en uno de los productos';
        END IF;
        v_total := v_total + round(v_quantity * v_unit_cost);
    END LOOP;

    SELECT COALESCE(SUM(round((p->>'amount')::numeric)), 0)
      INTO v_paid
      FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
     WHERE COALESCE((p->>'amount')::numeric, 0) > 0;

    -- Tolerancia de $1 por redondeo entre el total del cliente y el del servidor
    IF v_paid > v_total + 1 THEN
        RAISE EXCEPTION 'Los pagos superan el total de la compra';
    END IF;
    IF NOT v_is_credit AND abs(v_paid - v_total) > 1 THEN
        RAISE EXCEPTION 'En una compra de contado el pago debe cubrir el total';
    END IF;

    -- ─── 2. Validar saldo por billetera ──────────────────────────
    -- Misma regla que el endpoint anterior: salidas = transfer_out,
    -- expense, purchase, provider_payment; todo lo demás es entrada.
    FOR v_method_name, v_amount IN
        SELECT p->>'methodName', SUM(round((p->>'amount')::numeric))
          FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
         WHERE COALESCE((p->>'isCapital')::boolean, false) = false
           AND COALESCE((p->>'amount')::numeric, 0) > 0
         GROUP BY p->>'methodName'
    LOOP
        IF v_method_name IS NULL OR length(trim(v_method_name)) = 0 THEN
            RAISE EXCEPTION 'Selecciona de dónde sale el dinero de la compra';
        END IF;

        SELECT COALESCE(SUM(
                   CASE WHEN type IN ('transfer_out', 'expense', 'purchase', 'provider_payment')
                        THEN -amount ELSE amount END
               ), 0)
          INTO v_balance
          FROM payments
         WHERE store_id = v_store_id
           AND method = v_method_name;

        IF v_balance < v_amount THEN
            RAISE EXCEPTION 'Saldo insuficiente en "%". Disponible: $%',
                v_method_name, to_char(round(v_balance), 'FM999G999G999G999');
        END IF;
    END LOOP;

    -- ─── 3. INSERT purchases ─────────────────────────────────────
    INSERT INTO purchases (store_id, provider_id, subtotal, total, payment_method, is_credit, status)
    VALUES (
        v_store_id,
        v_provider_id,
        v_total,
        v_total,
        CASE
            WHEN v_is_credit THEN 'credit'
            WHEN COALESCE((payload->'payments'->0->>'isCapital')::boolean, false) THEN 'capital'
            ELSE 'cash'
        END,
        v_is_credit,
        'completed'
    )
    RETURNING id INTO v_purchase_id;

    v_short_id := substr(v_purchase_id::text, 1, 8);

    -- ─── 4. Ítems: detalle, CPP e inventario ─────────────────────
    FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items')
    LOOP
        v_product_id := (v_item->>'productId')::uuid;
        v_variant_id := NULLIF(v_item->>'variantId', '')::uuid;
        v_quantity   := (v_item->>'quantity')::numeric;
        v_unit_cost  := (v_item->>'unitCost')::numeric;

        -- CPP del producto (stock antes de esta entrada)
        SELECT COALESCE(stock, 0), COALESCE(cpp, 0)
          INTO v_stock, v_cpp
          FROM products
         WHERE id = v_product_id AND store_id = v_store_id
           FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la compra';
        END IF;

        v_new_cpp := CASE
            WHEN v_stock > 0 THEN round(((v_stock * v_cpp) + (v_quantity * v_unit_cost)) / (v_stock + v_quantity))
            ELSE round(v_unit_cost)
        END;

        UPDATE products
           SET cpp = v_new_cpp, updated_at = now()
         WHERE id = v_product_id;

        -- CPP de la variante (su stock vive en inventory_adjustments)
        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(cpp, 0) INTO v_cpp
              FROM product_variants
             WHERE id = v_variant_id AND product_id = v_product_id
               FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Variante no encontrada en la compra';
            END IF;

            SELECT COALESCE(SUM(quantity), 0) INTO v_stock
              FROM inventory_adjustments
             WHERE variant_id = v_variant_id;

            UPDATE product_variants
               SET cpp = CASE
                   WHEN v_stock > 0 THEN round(((v_stock * v_cpp) + (v_quantity * v_unit_cost)) / (v_stock + v_quantity))
                   ELSE round(v_unit_cost)
               END
             WHERE id = v_variant_id;
        END IF;

        INSERT INTO purchase_items (purchase_id, product_id, variant_id, quantity, unit_cost, total_cost)
        VALUES (v_purchase_id, v_product_id, v_variant_id, v_quantity, v_unit_cost, round(v_quantity * v_unit_cost));

        INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes)
        VALUES (v_store_id, v_product_id, v_variant_id, v_quantity, 'purchase',
                format('Compra #%s', v_short_id));
    END LOOP;

    -- ─── 5. Deuda con el proveedor ───────────────────────────────
    IF v_is_credit THEN
        v_remaining := GREATEST(0, v_total - v_paid);

        INSERT INTO provider_debts (store_id, provider_id, purchase_id, amount, remaining_amount, due_date, status)
        VALUES (
            v_store_id,
            v_provider_id,
            v_purchase_id,
            v_total,
            v_remaining,
            NULLIF(payload->>'dueDate', '')::timestamptz,
            CASE WHEN v_remaining <= 0 THEN 'paid' ELSE 'pending' END
        );

        UPDATE providers
           SET total_debt = COALESCE(total_debt, 0) + v_remaining
         WHERE id = v_provider_id AND store_id = v_store_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Proveedor no encontrado';
        END IF;
    END IF;

    -- ─── 6. Pagos ────────────────────────────────────────────────
    FOR v_pay IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb))
    LOOP
        v_amount := round(COALESCE((v_pay->>'amount')::numeric, 0));
        IF v_amount <= 0 THEN
            CONTINUE;
        END IF;

        IF COALESCE((v_pay->>'isCapital')::boolean, false) THEN
            INSERT INTO purchase_payments (purchase_id, amount, payment_method)
            VALUES (v_purchase_id, v_amount, 'Capital Propio');

            INSERT INTO owner_capital_injections (store_id, amount, reference_type, reference_id, notes)
            VALUES (v_store_id, v_amount, 'purchase', v_purchase_id,
                    format('Compra #%s (Capital Propio)', v_short_id));
        ELSE
            INSERT INTO purchase_payments (purchase_id, amount, payment_method)
            VALUES (v_purchase_id, v_amount, v_pay->>'methodName');

            INSERT INTO payments (store_id, type, method, amount, reference_id, notes)
            VALUES (v_store_id, 'purchase', v_pay->>'methodName', v_amount, v_purchase_id,
                    format('Compra #%s', v_short_id));
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'purchaseId', v_purchase_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase(jsonb) TO authenticated;
