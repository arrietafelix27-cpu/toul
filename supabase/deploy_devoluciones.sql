-- ══════════════════════════════════════════════════════════════
-- TOUL — Devoluciones parciales
--
-- Hasta ahora solo se podía anular la venta completa. Con esto, un
-- cliente puede devolver una parte: las unidades vuelven al inventario,
-- la plata sale de la caja (o se le baja la deuda si era fiado) y la
-- venta queda con la devolución anotada, sin borrarse.
--
-- Reglas:
--   · Hasta 30 días después de la venta.
--   · Nunca más de lo que se vendió menos lo ya devuelto.
--   · Venta con descuento: se devuelve en proporción.
--   · Fiado: primero baja lo que todavía debe de esa venta; el resto,
--     en plata.
--   · La plata sale por el mismo método por defecto; se puede elegir otro.
--   · El vendedor necesita aprobación del administrador.
--   · Una venta con devoluciones ya no se puede anular completa.
--
-- Se puede correr más de una vez sin dañar nada.
-- ══════════════════════════════════════════════════════════════


-- ─── 1. Tablas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_returns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id           UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  total             NUMERIC(12,2) NOT NULL CHECK (total > 0),  -- lo devuelto, a precio de venta
  cost_total        NUMERIC(12,2) NOT NULL DEFAULT 0,         -- lo que costó esa mercancía
  refunded          NUMERIC(12,2) NOT NULL DEFAULT 0,         -- plata que salió de la caja
  debt_reduced      NUMERIC(12,2) NOT NULL DEFAULT 0,         -- deuda que se le bajó al cliente (si era fiado)
  refund_method_id  UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  reason            TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  cash_session_id   UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  requested_by      UUID,
  requested_by_name TEXT,
  approved_by       UUID,
  approved_by_name  TEXT,
  approval_id       UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  return_id     UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id  UUID NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL,
  unit_cost     NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_store_date ON sale_returns(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_session ON sale_returns(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_return ON sale_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_item ON sale_return_items(sale_item_id);

-- Cada negocio solo ve las suyas; escribir, solo con la función de devolución
ALTER TABLE sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_return_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_select_sale_returns ON sale_returns;
CREATE POLICY member_select_sale_returns ON sale_returns
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));
DROP POLICY IF EXISTS member_select_sale_return_items ON sale_return_items;
CREATE POLICY member_select_sale_return_items ON sale_return_items
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

-- Las aprobaciones ahora también pueden ser de devolución (vendedores)
ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_type_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_type_check
  CHECK (type IN ('void_sale', 'credit_sale', 'return_sale'));


-- ─── 2. Cuánto se devuelve (y si se puede) ───────────────────────
-- Valida cada producto y cantidad contra lo vendido y lo ya devuelto.
-- Devuelve {total, cost}: el total va en proporción al descuento.
CREATE OR REPLACE FUNCTION public.toul_return_amount(p_sale_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_sale    sales%ROWTYPE;
  v_factor  numeric;
  v_gross   numeric := 0;
  v_cost    numeric := 0;
  v_item    jsonb;
  v_si      sale_items%ROWTYPE;
  v_qty     integer;
  v_done    integer;
  v_name    text;
  v_seen    uuid[] := '{}';
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada o ya anulada';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Elige qué productos devuelve';
  END IF;

  -- Si la venta tuvo descuento, cada peso devuelto lleva el mismo descuento
  SELECT CASE WHEN COALESCE(SUM(subtotal), 0) > 0 THEN v_sale.total / SUM(subtotal) ELSE 1 END
    INTO v_factor FROM sale_items WHERE sale_id = p_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;
    SELECT * INTO v_si FROM sale_items
     WHERE id = NULLIF(v_item->>'saleItemId', '')::uuid AND sale_id = p_sale_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ese producto no es de esta venta';
    END IF;
    IF v_si.id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Un producto aparece dos veces en la devolución';
    END IF;
    v_seen := v_seen || v_si.id;

    SELECT COALESCE(SUM(quantity), 0) INTO v_done FROM sale_return_items WHERE sale_item_id = v_si.id;
    IF v_qty > v_si.quantity - v_done THEN
      SELECT COALESCE(p.name, c.name, 'ese producto') INTO v_name
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id
        LEFT JOIN combos c ON c.id = si.combo_id
       WHERE si.id = v_si.id;
      RAISE EXCEPTION 'De % solo quedan % por devolver', v_name, v_si.quantity - v_done;
    END IF;

    v_gross := v_gross + v_qty * v_si.unit_price;
    v_cost  := v_cost + v_qty * v_si.unit_cost;
  END LOOP;

  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Elige qué productos devuelve';
  END IF;
  RETURN jsonb_build_object('total', round(v_gross * v_factor), 'cost', round(v_cost));
END;
$$;


-- ─── 3. La devolución ────────────────────────────────────────────
-- Interna: la ejecutan toul_return_sale (admin) y toul_resolve_approval.
-- Todo pasa junto o no pasa nada.
CREATE OR REPLACE FUNCTION public.toul_return_sale_internal(
  p_sale_id uuid, p_items jsonb, p_method_id uuid, p_reason text,
  p_requested_by uuid, p_requested_by_name text, p_approval_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id  uuid := toul_current_store_id();
  v_sale      sales%ROWTYPE;
  v_short_id  text;
  v_calc      jsonb;
  v_total     numeric;
  v_cost      numeric;
  v_prev      numeric;
  v_pending   numeric := 0;
  v_debt      numeric := 0;
  v_refund    numeric := 0;
  v_method_id uuid := p_method_id;
  v_method    text;
  v_session   uuid;
  v_return_id uuid;
  v_item      jsonb;
  v_si        sale_items%ROWTYPE;
  v_qty       integer;
  r           record;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada o ya anulada';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Escribe el motivo de la devolución';
  END IF;
  IF v_sale.created_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Solo se pueden hacer devoluciones hasta 30 días después de la venta';
  END IF;

  v_calc  := toul_return_amount(p_sale_id, p_items);
  v_total := (v_calc->>'total')::numeric;
  v_cost  := (v_calc->>'cost')::numeric;

  -- Por los redondeos, nunca más de lo que se cobró en total
  SELECT COALESCE(SUM(total), 0) INTO v_prev FROM sale_returns WHERE sale_id = p_sale_id;
  v_total := LEAST(v_total, GREATEST(v_sale.total - v_prev, 0));
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Esta venta ya fue devuelta completa';
  END IF;

  v_short_id := substr(v_sale.id::text, 1, 8);

  -- Fiado: primero baja lo que todavía debe de esta venta, sin pasar de
  -- lo que la persona debe hoy en total (los abonos no van atados a una venta)
  IF v_sale.is_credit AND v_sale.customer_id IS NOT NULL THEN
    SELECT COALESCE(SUM(CASE WHEN type = 'debt' THEN amount WHEN type = 'return' THEN -amount ELSE 0 END), 0)
      INTO v_pending FROM credits WHERE sale_id = v_sale.id;
    SELECT LEAST(v_pending, GREATEST(COALESCE(total_debt, 0), 0)) INTO v_pending
      FROM customers WHERE id = v_sale.customer_id FOR UPDATE;
    v_debt := GREATEST(LEAST(v_total, COALESCE(v_pending, 0)), 0);
    IF v_debt > 0 THEN
      UPDATE customers SET total_debt = GREATEST(COALESCE(total_debt, 0) - v_debt, 0)
       WHERE id = v_sale.customer_id;
      INSERT INTO credits (store_id, customer_id, sale_id, type, amount, notes)
      VALUES (v_store_id, v_sale.customer_id, v_sale.id, 'return', v_debt,
              format('Devolución venta #%s', v_short_id));
    END IF;
  END IF;
  v_refund := v_total - v_debt;

  -- La plata: por el mismo medio por defecto; se puede elegir otro
  IF v_refund > 0 THEN
    IF v_method_id IS NOT NULL THEN
      SELECT name INTO v_method FROM payment_methods WHERE id = v_method_id AND store_id = v_store_id;
      IF v_method IS NULL THEN
        RAISE EXCEPTION 'Ese método de pago no existe';
      END IF;
    ELSE
      SELECT method INTO v_method FROM payments
       WHERE store_id = v_store_id AND reference_id = v_sale.id AND type = 'sale'
       ORDER BY amount DESC LIMIT 1;
      IF v_method IS NULL THEN
        RAISE EXCEPTION 'Elige por dónde le devuelves la plata';
      END IF;
      SELECT id INTO v_method_id FROM payment_methods
       WHERE store_id = v_store_id AND lower(name) = lower(v_method) LIMIT 1;
    END IF;

    -- Sale del turno de la venta si sigue abierto; si no, del turno abierto de quien la pidió
    SELECT id INTO v_session FROM cash_sessions
     WHERE id = v_sale.cash_session_id AND status = 'open';
    IF v_session IS NULL THEN
      SELECT id INTO v_session FROM cash_sessions
       WHERE store_id = v_store_id AND status = 'open' AND opened_by = p_requested_by;
    END IF;

    INSERT INTO payments (store_id, type, method, amount, reference_id, notes, cash_session_id)
    VALUES (v_store_id, 'sale_refund', v_method, -v_refund, v_sale.id,
            format('Devolución venta #%s', v_short_id), v_session);
  END IF;

  INSERT INTO sale_returns (store_id, sale_id, total, cost_total, refunded, debt_reduced, refund_method_id,
                            reason, cash_session_id, requested_by, requested_by_name,
                            approved_by, approved_by_name, approval_id)
  VALUES (v_store_id, v_sale.id, v_total, v_cost, v_refund, v_debt, CASE WHEN v_refund > 0 THEN v_method_id END,
          trim(p_reason), v_session, p_requested_by, p_requested_by_name,
          auth.uid(), toul_current_member_name(), p_approval_id)
  RETURNING id INTO v_return_id;

  -- Lo devuelto vuelve al inventario. Un combo devuelve sus productos.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);
    CONTINUE WHEN v_qty <= 0;
    SELECT * INTO v_si FROM sale_items
     WHERE id = NULLIF(v_item->>'saleItemId', '')::uuid AND sale_id = v_sale.id;

    INSERT INTO sale_return_items (store_id, return_id, sale_item_id, quantity, unit_price, unit_cost)
    VALUES (v_store_id, v_return_id, v_si.id, v_qty, v_si.unit_price, v_si.unit_cost);

    IF v_si.combo_id IS NOT NULL THEN
      FOR r IN SELECT product_id, variant_id, quantity FROM combo_items WHERE combo_id = v_si.combo_id
      LOOP
        INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
        VALUES (v_store_id,
                COALESCE(r.product_id, (SELECT product_id FROM product_variants WHERE id = r.variant_id)),
                r.variant_id, r.quantity * v_qty, 'return',
                format('Devolución venta #%s', v_short_id), v_sale.id);
      END LOOP;
    ELSIF v_si.product_id IS NOT NULL THEN
      INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
      VALUES (v_store_id, v_si.product_id, v_si.variant_id, v_qty, 'return',
              format('Devolución venta #%s', v_short_id), v_sale.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'returnId', v_return_id, 'total', v_total,
                            'refunded', v_refund, 'debtReduced', v_debt, 'method', v_method);
END;
$$;

-- El administrador devuelve directo; el vendedor pide aprobación
CREATE OR REPLACE FUNCTION public.toul_return_sale(p_sale_id uuid, p_items jsonb, p_method_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede hacer devoluciones. Pide aprobación.';
  END IF;
  RETURN toul_return_sale_internal(p_sale_id, p_items, p_method_id, p_reason,
                                   auth.uid(), toul_current_member_name(), NULL);
END;
$$;


-- ─── 4. Anular: ya no si tiene devoluciones ──────────────────────
CREATE OR REPLACE FUNCTION public.toul_void_sale_internal(
  p_sale_id uuid, p_reason text, p_requested_by uuid, p_requested_by_name text, p_approval_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id  uuid := toul_current_store_id();
  v_sale      sales%ROWTYPE;
  v_short_id  text;
  v_debt      numeric;
  v_customer_debt numeric;
  v_refunded  numeric := 0;
  v_found     boolean := false;
  v_snapshot  jsonb;
  v_session   uuid;
  v_void_id   uuid;
  r           record;
BEGIN
  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = v_store_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada o ya anulada';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación';
  END IF;
  -- Con devoluciones, anularla devolvería dos veces la misma plata y los mismos productos
  IF EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = v_sale.id) THEN
    RAISE EXCEPTION 'Esta venta ya tiene devoluciones: devuelve lo que falta en vez de anularla';
  END IF;

  v_short_id := substr(v_sale.id::text, 1, 8);

  -- El dinero se devuelve desde la caja donde se hizo la venta (si el turno sigue abierto);
  -- si ya cerró, desde el turno abierto de quien pidió la anulación.
  SELECT id INTO v_session FROM cash_sessions
   WHERE id = v_sale.cash_session_id AND status = 'open';
  IF v_session IS NULL THEN
    SELECT id INTO v_session FROM cash_sessions
     WHERE store_id = v_store_id AND status = 'open' AND opened_by = p_requested_by;
  END IF;

  -- Deuda del cliente (ventas a crédito)
  SELECT COALESCE(SUM(amount), 0) INTO v_debt
    FROM credits WHERE sale_id = v_sale.id AND type = 'debt';

  IF v_debt > 0 AND v_sale.customer_id IS NOT NULL THEN
    SELECT total_debt INTO v_customer_debt FROM customers WHERE id = v_sale.customer_id FOR UPDATE;
    IF COALESCE(v_customer_debt, 0) < v_debt THEN
      RAISE EXCEPTION 'No se puede anular: el cliente ya abonó a esta deuda';
    END IF;
    UPDATE customers SET total_debt = total_debt - v_debt WHERE id = v_sale.customer_id;
    INSERT INTO credits (store_id, customer_id, sale_id, type, amount, notes)
    VALUES (v_store_id, v_sale.customer_id, NULL, 'void', v_debt,
            format('Anulación venta #%s', v_short_id));
  END IF;

  -- Foto completa de la venta antes de borrarla
  v_snapshot := jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'productId', si.product_id, 'variantId', si.variant_id, 'comboId', si.combo_id,
               'name', COALESCE(p.name, c.name, 'Producto'), 'variantName', v.name,
               'quantity', si.quantity, 'unitPrice', si.unit_price, 'unitCost', si.unit_cost, 'subtotal', si.subtotal))
        FROM sale_items si
        LEFT JOIN products p ON p.id = si.product_id
        LEFT JOIN product_variants v ON v.id = si.variant_id
        LEFT JOIN combos c ON c.id = si.combo_id
       WHERE si.sale_id = v_sale.id), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('method', pm.name, 'amount', sp.amount))
        FROM sale_payments sp
        LEFT JOIN payment_methods pm ON pm.id = sp.method_id
       WHERE sp.sale_id = v_sale.id), '[]'::jsonb)
  );

  -- Inventario: devolver exactamente lo que salió
  FOR r IN
    SELECT product_id, variant_id, quantity
      FROM inventory_adjustments
     WHERE store_id = v_store_id
       AND reason = 'sale'
       AND (reference_id = v_sale.id
            OR (reference_id IS NULL
                AND notes LIKE '%Venta #' || v_short_id
                AND created_at BETWEEN v_sale.created_at - interval '10 minutes'
                                   AND v_sale.created_at + interval '10 minutes'))
  LOOP
    v_found := true;
    INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
    VALUES (v_store_id, r.product_id, r.variant_id, -r.quantity, 'void',
            format('Anulación venta #%s', v_short_id), v_sale.id);
  END LOOP;

  -- Ventas antiguas sin movimientos de inventario: reconstruir desde los ítems
  IF NOT v_found THEN
    FOR r IN SELECT product_id, variant_id, quantity FROM sale_items
              WHERE sale_id = v_sale.id AND product_id IS NOT NULL
    LOOP
      INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
      VALUES (v_store_id, r.product_id, r.variant_id, r.quantity, 'void',
              format('Anulación venta #%s', v_short_id), v_sale.id);
    END LOOP;
  END IF;

  -- Caja: devolver el dinero por el mismo método en que entró
  FOR r IN SELECT method, amount FROM payments
            WHERE store_id = v_store_id AND reference_id = v_sale.id AND type = 'sale'
  LOOP
    INSERT INTO payments (store_id, type, method, amount, reference_id, notes, cash_session_id)
    VALUES (v_store_id, 'sale_refund', r.method, -r.amount, v_sale.id,
            format('Anulación venta #%s', v_short_id), v_session);
    v_refunded := v_refunded + r.amount;
  END LOOP;

  INSERT INTO sale_voids (store_id, sale_id, sale_created_at, total, refunded, reason, snapshot, seller_name,
                          requested_by, requested_by_name, approved_by, approved_by_name, approval_id, cash_session_id)
  VALUES (v_store_id, v_sale.id, v_sale.created_at, v_sale.total, v_refunded, trim(p_reason), v_snapshot, v_sale.seller_name,
          p_requested_by, p_requested_by_name, auth.uid(), toul_current_member_name(), p_approval_id, v_session)
  RETURNING id INTO v_void_id;

  -- Al borrar la venta salen de todos los reportes (sale_items y sale_payments en cascada)
  DELETE FROM sales WHERE id = v_sale.id;

  RETURN jsonb_build_object('success', true, 'voidId', v_void_id, 'refunded', v_refunded, 'total', v_sale.total);
END;
$$;


-- ─── 5. Aprobaciones: también de devolución ──────────────────────
CREATE OR REPLACE FUNCTION public.toul_request_approval(
  p_type text, p_sale_id uuid, p_amount numeric, p_reason text, p_details jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id uuid := toul_current_store_id();
  v_sale     sales%ROWTYPE;
  v_amount   numeric := p_amount;
  v_id       uuid;
BEGIN
  IF auth.uid() IS NULL OR v_store_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_type = 'void_sale' THEN
    SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = v_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venta no encontrada o ya anulada';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'Escribe el motivo de la anulación';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests
                WHERE sale_id = p_sale_id AND type = 'void_sale' AND status = 'pending') THEN
      RAISE EXCEPTION 'Ya hay una solicitud pendiente para esta venta';
    END IF;
    IF EXISTS (SELECT 1 FROM sale_returns WHERE sale_id = p_sale_id) THEN
      RAISE EXCEPTION 'Esta venta ya tiene devoluciones: devuelve lo que falta en vez de anularla';
    END IF;
    v_amount := v_sale.total;
  ELSIF p_type = 'return_sale' THEN
    SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND store_id = v_store_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Venta no encontrada o ya anulada';
    END IF;
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
      RAISE EXCEPTION 'Escribe el motivo de la devolución';
    END IF;
    IF v_sale.created_at < now() - interval '30 days' THEN
      RAISE EXCEPTION 'Solo se pueden hacer devoluciones hasta 30 días después de la venta';
    END IF;
    IF EXISTS (SELECT 1 FROM approval_requests
                WHERE sale_id = p_sale_id AND type = 'return_sale' AND status = 'pending') THEN
      RAISE EXCEPTION 'Ya hay una solicitud de devolución pendiente para esta venta';
    END IF;
    -- Valida productos y cantidades, y calcula cuánto se devolvería
    v_amount := (toul_return_amount(p_sale_id, p_details->'items')->>'total')::numeric;
  ELSIF p_type = 'credit_sale' THEN
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Monto inválido';
    END IF;
    IF COALESCE(length(trim(p_details->>'customerName')), 0) = 0 THEN
      RAISE EXCEPTION 'Selecciona el cliente antes de pedir aprobación';
    END IF;
    -- Una sola solicitud de crédito pendiente por vendedor
    UPDATE approval_requests SET status = 'cancelled'
     WHERE requested_by = auth.uid() AND type = 'credit_sale' AND status IN ('pending', 'approved');
  ELSE
    RAISE EXCEPTION 'Tipo de solicitud inválido';
  END IF;

  INSERT INTO approval_requests (store_id, type, requested_by, requested_by_name, sale_id, amount, reason, details)
  VALUES (v_store_id, p_type, auth.uid(), toul_current_member_name(),
          CASE WHEN p_type IN ('void_sale', 'return_sale') THEN p_sale_id END,
          round(v_amount), NULLIF(trim(p_reason), ''), COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_resolve_approval(p_request_id uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_req    approval_requests%ROWTYPE;
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede aprobar';
  END IF;

  SELECT * INTO v_req FROM approval_requests
   WHERE id = p_request_id AND store_id = toul_current_store_id()
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue resuelta';
  END IF;

  IF NOT p_approve THEN
    UPDATE approval_requests
       SET status = 'rejected', resolved_by = auth.uid(), resolved_by_name = toul_current_member_name(),
           resolved_at = now(), resolution_note = NULLIF(trim(p_note), '')
     WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'rejected');
  END IF;

  IF v_req.type = 'void_sale' THEN
    v_result := toul_void_sale_internal(v_req.sale_id, v_req.reason, v_req.requested_by, v_req.requested_by_name, v_req.id);
    UPDATE approval_requests
       SET status = 'used', resolved_by = auth.uid(), resolved_by_name = toul_current_member_name(),
           resolved_at = now(), resolution_note = NULLIF(trim(p_note), '')
     WHERE id = p_request_id;
    RETURN v_result || jsonb_build_object('status', 'used');
  END IF;

  IF v_req.type = 'return_sale' THEN
    v_result := toul_return_sale_internal(v_req.sale_id, v_req.details->'items',
                  NULLIF(v_req.details->>'methodId', '')::uuid, v_req.reason,
                  v_req.requested_by, v_req.requested_by_name, v_req.id);
    UPDATE approval_requests
       SET status = 'used', resolved_by = auth.uid(), resolved_by_name = toul_current_member_name(),
           resolved_at = now(), resolution_note = NULLIF(trim(p_note), '')
     WHERE id = p_request_id;
    RETURN v_result || jsonb_build_object('status', 'used');
  END IF;

  -- credit_sale: queda aprobada para que el vendedor confirme la venta
  IF v_req.requested_at < now() - interval '60 minutes' THEN
    UPDATE approval_requests SET status = 'expired' WHERE id = p_request_id;
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  UPDATE approval_requests
     SET status = 'approved', resolved_by = auth.uid(), resolved_by_name = toul_current_member_name(),
         resolved_at = now(), resolution_note = NULLIF(trim(p_note), '')
   WHERE id = p_request_id;
  RETURN jsonb_build_object('status', 'approved');
END;
$$;


-- ─── 6. Cierre de caja: las devoluciones del turno ───────────────
CREATE OR REPLACE FUNCTION public.toul_cash_session_totals(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session  cash_sessions%ROWTYPE;
  v_methods  jsonb;
  v_cash_net numeric;
BEGIN
  SELECT * INTO v_session FROM cash_sessions WHERE id = p_session_id;

  WITH movements AS (
    SELECT p.method,
           CASE WHEN p.type IN ('transfer_out', 'expense', 'purchase', 'provider_payment')
                THEN -p.amount ELSE p.amount END AS net,
           (lower(p.method) LIKE '%efectivo%' OR EXISTS (
              SELECT 1 FROM payment_methods pm
               WHERE pm.store_id = p.store_id AND lower(pm.name) = lower(p.method) AND pm.is_cash
           )) AS is_cash
      FROM payments p
     WHERE p.cash_session_id = p_session_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method, 'isCash', is_cash, 'net', net) ORDER BY is_cash DESC, method), '[]'::jsonb),
         COALESCE(SUM(net) FILTER (WHERE is_cash), 0)
    INTO v_methods, v_cash_net
    FROM (SELECT method, bool_or(is_cash) AS is_cash, round(SUM(net)) AS net FROM movements GROUP BY method) m;

  RETURN jsonb_build_object(
    'openingCash',   v_session.opening_cash,
    'expectedCash',  round(v_session.opening_cash + v_cash_net),
    'byMethod',      v_methods,
    'salesCount',    (SELECT count(*) FROM sales WHERE cash_session_id = p_session_id),
    'salesTotal',    (SELECT COALESCE(round(SUM(total)), 0) FROM sales WHERE cash_session_id = p_session_id),
    'discountTotal', (SELECT COALESCE(round(SUM(discount)), 0) FROM sales WHERE cash_session_id = p_session_id),
    'discountCount', (SELECT count(*) FROM sales WHERE cash_session_id = p_session_id AND discount > 0),
    'creditCount',   (SELECT count(*) FROM sales WHERE cash_session_id = p_session_id AND is_credit),
    'voidCount',     (SELECT count(*) FROM sale_voids WHERE cash_session_id = p_session_id),
    'voidTotal',     (SELECT COALESCE(round(SUM(total)), 0) FROM sale_voids WHERE cash_session_id = p_session_id),
    'returnCount',   (SELECT count(*) FROM sale_returns WHERE cash_session_id = p_session_id),
    'returnTotal',   (SELECT COALESCE(round(SUM(total)), 0) FROM sale_returns WHERE cash_session_id = p_session_id)
  );
END;
$$;


-- ─── 7. Permisos ─────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.toul_void_sale_internal(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toul_cash_session_totals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toul_return_amount(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toul_return_sale_internal(uuid, jsonb, uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toul_return_sale(uuid, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_request_approval(text, uuid, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_resolve_approval(uuid, boolean, text) TO authenticated;
