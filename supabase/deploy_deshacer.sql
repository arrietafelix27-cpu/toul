-- =================================================================
-- TOUL v20 — Poder corregir un error
-- =================================================================
-- Hasta ahora lo único reversible en toda la app era anular una
-- venta. Todo lo demás quedaba para siempre: un gasto mal digitado
-- dañaba la utilidad, un abono mal puesto descuadraba al cliente,
-- una compra equivocada metía mercancía que nunca llegó, y un
-- producto creado por error se quedaba en el catálogo.
--
-- Cada una de estas cosas toca más de una tabla a la vez —un gasto
-- vive en `expenses` y en `payments`, una compra mueve inventario,
-- deuda y caja— así que deshacerlas desde el navegador dejaría
-- medio arreglo. Por eso van aquí.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 0. Quién movió el inventario ─────────────────────────────────
-- Sin esto, cuando abra la isla con vendedores, un ajuste de stock
-- no tiene nombre y no hay a quién preguntarle.
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS created_by_name TEXT;

CREATE OR REPLACE FUNCTION toul_adjustment_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
    IF NEW.created_by_name IS NULL THEN
        BEGIN
            NEW.created_by_name := toul_current_member_name();
        EXCEPTION WHEN undefined_function THEN
            NEW.created_by_name := NULL;
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjustment_author ON inventory_adjustments;
CREATE TRIGGER trg_adjustment_author
    BEFORE INSERT ON inventory_adjustments
    FOR EACH ROW EXECUTE FUNCTION toul_adjustment_author();

-- ── 1. Corregir un gasto ─────────────────────────────────────────
-- El gasto vive en dos tablas: el gasto en sí y su salida de caja.
-- Si se arregla solo una, la caja deja de cuadrar.
CREATE OR REPLACE FUNCTION toul_update_expense(
    p_expense_id  UUID,
    p_category    TEXT,
    p_description TEXT,
    p_amount      NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
BEGIN
    SELECT store_id INTO v_store FROM expenses WHERE id = p_expense_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Ese gasto no existe'; END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'El monto tiene que ser mayor que cero'; END IF;

    UPDATE expenses
       SET category    = COALESCE(NULLIF(trim(p_category), ''), category),
           description = NULLIF(trim(COALESCE(p_description, '')), ''),
           amount      = round(p_amount)
     WHERE id = p_expense_id;

    UPDATE payments
       SET amount = round(p_amount),
           notes  = 'Gasto: ' || COALESCE(NULLIF(trim(COALESCE(p_description, '')), ''), p_category)
     WHERE reference_id = p_expense_id AND type = 'expense';

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_update_expense(UUID, TEXT, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION toul_delete_expense(p_expense_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_monto NUMERIC;
BEGIN
    SELECT store_id, amount INTO v_store, v_monto FROM expenses WHERE id = p_expense_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Ese gasto no existe'; END IF;

    DELETE FROM payments WHERE reference_id = p_expense_id AND type = 'expense';
    DELETE FROM expenses WHERE id = p_expense_id;

    RETURN jsonb_build_object('success', true, 'amount', round(v_monto));
END;
$$;

GRANT EXECUTE ON FUNCTION toul_delete_expense(UUID) TO authenticated;

-- ── 2. Deshacer un abono ─────────────────────────────────────────
-- Devuelve la deuda al cliente y saca la plata de la caja.
CREATE OR REPLACE FUNCTION toul_undo_payment(p_credit_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store    UUID;
    v_customer UUID;
    v_monto    NUMERIC;
    v_tipo     TEXT;
    v_cuando   TIMESTAMPTZ;
    v_nombre   TEXT;
BEGIN
    SELECT store_id, customer_id, amount, type, created_at
      INTO v_store, v_customer, v_monto, v_tipo, v_cuando
      FROM credits WHERE id = p_credit_id;

    IF v_store IS NULL THEN RAISE EXCEPTION 'Ese movimiento no existe'; END IF;
    IF v_tipo <> 'payment' THEN
        RAISE EXCEPTION 'Solo se puede deshacer un abono. Un fiado se quita anulando su venta.';
    END IF;

    SELECT name INTO v_nombre FROM customers WHERE id = v_customer;

    DELETE FROM credits WHERE id = p_credit_id;

    UPDATE customers
       SET total_debt = GREATEST(COALESCE(total_debt, 0) + v_monto, 0)
     WHERE id = v_customer;

    -- La salida de caja de ese abono: se busca por monto y momento
    -- porque el abono no guardaba a qué movimiento correspondía
    DELETE FROM payments
     WHERE id IN (
        SELECT id FROM payments
         WHERE store_id = v_store
           AND type = 'sale_payment'
           AND round(amount) = round(v_monto)
           AND notes LIKE 'Abono del cliente:%'
           AND created_at BETWEEN v_cuando - interval '2 minutes' AND v_cuando + interval '2 minutes'
         ORDER BY created_at
         LIMIT 1
     );

    RETURN jsonb_build_object('success', true, 'amount', round(v_monto), 'customer', v_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_undo_payment(UUID) TO authenticated;

-- ── 3. Anular una compra ─────────────────────────────────────────
-- Saca la mercancía que entró, borra la deuda con el proveedor y
-- devuelve la plata a la caja. No se puede si ya vendiste lo que
-- entró, ni si ya le abonaste al proveedor: eso hay que resolverlo
-- a mano y la app no debe adivinar.
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

    -- Saca la mercancía
    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes)
    SELECT v_store, pi.product_id, pi.variant_id, -pi.quantity, 'compra_anulada',
           COALESCE(NULLIF(trim(p_reason), ''), 'Compra anulada')
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

-- ── 4. Esconder un producto sin borrar su historia ───────────────
-- Borrarlo rompería las ventas viejas, así que desaparece del
-- catálogo y del inventario pero sus ventas siguen contando.
CREATE OR REPLACE FUNCTION toul_set_product_active(p_product_id UUID, p_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store  UUID;
    v_nombre TEXT;
BEGIN
    SELECT store_id, name INTO v_store, v_nombre FROM products WHERE id = p_product_id;
    IF v_store IS NULL THEN RAISE EXCEPTION 'Ese producto no existe'; END IF;

    UPDATE products SET is_active = p_active WHERE id = p_product_id;
    UPDATE product_variants SET is_active = p_active WHERE product_id = p_product_id;

    RETURN jsonb_build_object('success', true, 'name', v_nombre, 'active', p_active);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_set_product_active(UUID, BOOLEAN) TO authenticated;
