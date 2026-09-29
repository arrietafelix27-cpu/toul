-- =================================================================
-- TOUL — Compras sin elegir 'de dónde sale el dinero'
-- Los métodos de pago quedan solo para las ventas.
-- Pegar en el SQL Editor de Supabase. Se puede ejecutar varias veces.
-- =================================================================

-- =================================================================
-- RPC: process_purchase(payload jsonb) RETURNS jsonb
-- =================================================================
-- Procesa una compra completa de forma atómica.
-- Reemplaza la lógica secuencial de /api/purchases/route.ts, que
-- ignoraba errores intermedios y podía dejar compras a medio crear.
--
-- Pasos (todos en una sola transacción):
--   1. Validar auth, tienda, ítems y pagos
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
-- Payload esperado:
--   { providerId, isCredit, dueDate, paidNow,
--     items: [{ productId, variantId?, quantity, unitCost }] }
--
-- `paidNow` solo aplica a compras a crédito (abono inicial). De contado
-- se paga el total. Ya no se elige "de dónde sale el dinero": los métodos
-- de pago describen cómo te pagan a ti en una venta, no cómo pagas tú.
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

    v_product_id    uuid;
    v_variant_id    uuid;
    v_quantity      numeric;
    v_unit_cost     numeric;
    v_stock         numeric;
    v_cpp           numeric;
    v_new_cpp       numeric;
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

    -- Cuánto se pagó ahora. `paidNow` es el contrato actual; `payments[]`
    -- se sigue aceptando por compatibilidad con versiones anteriores.
    IF payload ? 'paidNow' THEN
        v_paid := round(GREATEST(0, COALESCE((payload->>'paidNow')::numeric, 0)));
    ELSE
        SELECT COALESCE(SUM(round((p->>'amount')::numeric)), 0)
          INTO v_paid
          FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
         WHERE COALESCE((p->>'amount')::numeric, 0) > 0;
    END IF;

    -- De contado se paga todo
    IF NOT v_is_credit THEN
        v_paid := v_total;
    END IF;

    IF v_paid > v_total + 1 THEN
        RAISE EXCEPTION 'El abono no puede ser mayor que el total de la compra';
    END IF;

    -- ─── 3. INSERT purchases ─────────────────────────────────────
    INSERT INTO purchases (store_id, provider_id, subtotal, total, payment_method, is_credit, status)
    VALUES (
        v_store_id,
        v_provider_id,
        v_total,
        v_total,
        CASE
            WHEN v_is_credit THEN 'credit'
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

    -- ─── 6. Pago ─────────────────────────────────────────────────
    -- Los métodos de pago solo describen cómo te pagan a ti en una venta.
    -- En una compra basta con cuánto pagaste: el resto queda como deuda.
    IF v_paid > 0 THEN
        INSERT INTO purchase_payments (purchase_id, amount, payment_method)
        VALUES (v_purchase_id, v_paid, 'General');

        INSERT INTO payments (store_id, type, method, amount, reference_id, notes)
        VALUES (v_store_id, 'purchase', 'General', v_paid, v_purchase_id,
                format('Compra #%s', v_short_id));
    END IF;

    RETURN jsonb_build_object('success', true, 'purchaseId', v_purchase_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
