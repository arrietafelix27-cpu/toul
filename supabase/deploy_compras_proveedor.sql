-- =================================================================
-- TOUL — Corregir el proveedor de una compra ya hecha
-- =================================================================
-- Si se escogió mal el proveedor, cambiarlo no es solo cambiar un
-- nombre: si la compra quedó a crédito, la deuda tiene que pasarse
-- de un proveedor al otro. Por eso va en una sola transacción.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

CREATE OR REPLACE FUNCTION toul_change_purchase_provider(
    p_purchase_id UUID,
    p_provider_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store     UUID;
    v_purchase  purchases%ROWTYPE;
    v_pending   NUMERIC(12,2);
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() LIMIT 1;
    IF v_store IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT * INTO v_purchase FROM purchases
     WHERE id = p_purchase_id AND store_id = v_store;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Esa compra no existe';
    END IF;

    IF p_provider_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM providers WHERE id = p_provider_id AND store_id = v_store
    ) THEN
        RAISE EXCEPTION 'Ese proveedor no existe';
    END IF;

    -- Una compra a crédito sin proveedor dejaría la deuda sin dueño
    IF v_purchase.is_credit AND p_provider_id IS NULL THEN
        RAISE EXCEPTION 'Una compra a crédito tiene que quedar con un proveedor';
    END IF;

    IF v_purchase.provider_id IS NOT DISTINCT FROM p_provider_id THEN
        RETURN jsonb_build_object('success', true, 'changed', false);
    END IF;

    -- La deuda que todavía se debe por esta compra se muda con ella
    SELECT COALESCE(SUM(remaining_amount), 0) INTO v_pending
      FROM provider_debts
     WHERE purchase_id = p_purchase_id AND store_id = v_store AND status <> 'paid';

    IF v_pending > 0 AND v_purchase.provider_id IS NOT NULL THEN
        UPDATE providers
           SET total_debt = GREATEST(COALESCE(total_debt, 0) - v_pending, 0)
         WHERE id = v_purchase.provider_id AND store_id = v_store;
    END IF;

    IF v_pending > 0 AND p_provider_id IS NOT NULL THEN
        UPDATE providers
           SET total_debt = COALESCE(total_debt, 0) + v_pending
         WHERE id = p_provider_id AND store_id = v_store;
    END IF;

    UPDATE provider_debts
       SET provider_id = p_provider_id
     WHERE purchase_id = p_purchase_id AND store_id = v_store AND p_provider_id IS NOT NULL;

    UPDATE purchases SET provider_id = p_provider_id WHERE id = p_purchase_id;

    RETURN jsonb_build_object('success', true, 'changed', true, 'movedDebt', v_pending);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_change_purchase_provider(UUID, UUID) TO authenticated;
