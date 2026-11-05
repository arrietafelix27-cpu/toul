-- =================================================================
-- deploy_caja_permisos.sql — Caja, fase 3
-- =================================================================
-- Correr DESPUÉS de deploy_caja_segura.sql.
--
--   1. Permisos del vendedor: fiar, anular, devolver, descuento máximo,
--      ver el efectivo esperado y crear clientes. El administrador los
--      elige en Ajustes; los valores por defecto son los de hoy (el
--      descuento, 10%). Todo se valida aquí, no solo en la pantalla.
--   2. Efectivo recibido y vuelto: se guardan con la venta. El cuadre
--      sigue contando el valor de la venta, no lo recibido.
--   3. Descuento con aprobación: el mismo flujo que ya tiene el fiado.
--   4. Comprobante: qué botones salen al terminar una venta.
--
-- Se puede correr más de una vez.
-- =================================================================


-- ── 1. Columnas nuevas ───────────────────────────────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS seller_permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS receipt_buttons    text  NOT NULL DEFAULT 'ambos';
ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_receipt_buttons_check;
ALTER TABLE stores ADD CONSTRAINT stores_receipt_buttons_check
    CHECK (receipt_buttons IN ('whatsapp', 'tirilla', 'ambos'));

-- Lo que entregó el cliente en efectivo y lo que se le devolvió
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_received numeric(12,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS change_given  numeric(12,2);

ALTER TABLE approval_requests DROP CONSTRAINT IF EXISTS approval_requests_type_check;
ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_type_check
    CHECK (type IN ('void_sale', 'credit_sale', 'return_sale', 'discount_sale'));


-- ── 2. Permisos ──────────────────────────────────────────────────
-- 'solo' = puede hacerlo solo · 'aprobacion' = necesita aprobación ·
-- 'no' = no permitido. descuento_max: % que puede descontar solo.
CREATE OR REPLACE FUNCTION public.toul_seller_permission(p_store_id uuid, p_key text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT COALESCE(
        (SELECT seller_permissions->>p_key FROM stores WHERE id = p_store_id),
        CASE p_key
            WHEN 'fiar'           THEN 'aprobacion'
            WHEN 'anular'         THEN 'aprobacion'
            WHEN 'devolver'       THEN 'aprobacion'
            WHEN 'descuento_max'  THEN '10'
            WHEN 'ver_efectivo'   THEN 'no'
            WHEN 'crear_clientes' THEN 'solo'
        END
    );
$$;

-- El vendedor puede hacer esto sin pedir nada (el administrador siempre)
CREATE OR REPLACE FUNCTION public.toul_can_alone(p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT toul_current_role() = 'admin'
        OR toul_seller_permission(toul_current_store_id(), p_key) = 'solo';
$$;

CREATE OR REPLACE FUNCTION public.toul_set_seller_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_store_id uuid := toul_current_store_id();
    v_clean    jsonb := '{}'::jsonb;
    v_key      text;
    v_value    text;
    v_max      numeric;
BEGIN
    IF toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede cambiar los permisos';
    END IF;
    IF COALESCE((SELECT plan FROM stores WHERE id = v_store_id), 'basico') <> 'pro' THEN
        RAISE EXCEPTION 'Los permisos del equipo son del plan Pro';
    END IF;

    FOREACH v_key IN ARRAY ARRAY['fiar', 'anular', 'devolver'] LOOP
        v_value := COALESCE(p_permissions->>v_key, toul_seller_permission(v_store_id, v_key));
        IF v_value NOT IN ('solo', 'aprobacion', 'no') THEN
            RAISE EXCEPTION 'Permiso no válido para %', v_key;
        END IF;
        v_clean := v_clean || jsonb_build_object(v_key, v_value);
    END LOOP;

    FOREACH v_key IN ARRAY ARRAY['ver_efectivo', 'crear_clientes'] LOOP
        v_value := COALESCE(p_permissions->>v_key, toul_seller_permission(v_store_id, v_key));
        IF v_value NOT IN ('solo', 'no') THEN
            RAISE EXCEPTION 'Permiso no válido para %', v_key;
        END IF;
        v_clean := v_clean || jsonb_build_object(v_key, v_value);
    END LOOP;

    BEGIN
        v_max := round(COALESCE(p_permissions->>'descuento_max', toul_seller_permission(v_store_id, 'descuento_max'))::numeric);
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'El descuento máximo tiene que ser un número entre 0 y 100';
    END;
    IF v_max < 0 OR v_max > 100 THEN
        RAISE EXCEPTION 'El descuento máximo tiene que ser un número entre 0 y 100';
    END IF;
    v_clean := v_clean || jsonb_build_object('descuento_max', v_max::text);

    UPDATE stores SET seller_permissions = v_clean WHERE id = v_store_id;
    RETURN v_clean;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_seller_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_can_alone(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_set_seller_permissions(jsonb) TO authenticated;

-- Crear clientes: el vendedor solo si tiene permiso (también por fuera de la caja)
DROP POLICY IF EXISTS member_insert_customers ON customers;
CREATE POLICY member_insert_customers ON customers
    FOR INSERT WITH CHECK (
        store_id IN (SELECT toul_admin_store_ids())
        OR (store_id IN (SELECT toul_member_store_ids()) AND toul_can_alone('crear_clientes'))
    );

-- Buscar sin crear: para el vendedor que no puede crear clientes
-- Con los permisos de quien vende: solo ve los clientes de su negocio
CREATE OR REPLACE FUNCTION public.toul_find_customer(p_store_id uuid, p_name text, p_phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_id    uuid;
    v_name  text := trim(COALESCE(p_name, ''));
    v_phone text := NULLIF(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), '');
BEGIN
    IF v_phone IS NOT NULL THEN
        SELECT id INTO v_id FROM customers
         WHERE store_id = p_store_id
           AND regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = v_phone
         ORDER BY is_active DESC, created_at
         LIMIT 1;
        IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    END IF;
    IF v_name = '' THEN RETURN NULL; END IF;
    SELECT id INTO v_id FROM customers
     WHERE store_id = p_store_id
       AND lower(regexp_replace(name, '\s+', ' ', 'g')) = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
     ORDER BY is_active DESC, created_at
     LIMIT 1;
    RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.toul_find_customer(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toul_find_customer(uuid, text, text) TO authenticated;


-- ── 3. Aprobación de la venta (fiado y descuento) ────────────────
-- Reemplaza a toul_consume_credit_approval: además del total, revisa
-- que el descuento aprobado cubra el que se está dando.
CREATE OR REPLACE FUNCTION public.toul_consume_sale_approval(
    p_approval_id uuid, p_total numeric, p_discount numeric,
    p_needs_credit boolean, p_needs_discount boolean, p_sale_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_req approval_requests%ROWTYPE;
BEGIN
    SELECT * INTO v_req FROM approval_requests
     WHERE id = p_approval_id
       AND store_id = toul_current_store_id()
       AND type IN ('credit_sale', 'discount_sale')
       AND requested_by = auth.uid()
       FOR UPDATE;

    IF NOT FOUND OR v_req.status <> 'approved' THEN
        RAISE EXCEPTION '%', CASE WHEN p_needs_credit
            THEN 'Esta venta a crédito necesita aprobación del administrador'
            ELSE 'Este descuento necesita aprobación del administrador' END;
    END IF;
    -- Fiar lo tiene que haber aprobado como fiado
    IF p_needs_credit AND v_req.type <> 'credit_sale' THEN
        RAISE EXCEPTION 'Esta venta a crédito necesita aprobación del administrador';
    END IF;
    IF v_req.resolved_at < now() - interval '60 minutes' THEN
        RAISE EXCEPTION 'La aprobación venció. Pide aprobación de nuevo.';
    END IF;
    IF abs(COALESCE(v_req.amount, 0) - p_total) > 1 THEN
        RAISE EXCEPTION 'El total cambió después de la aprobación. Pide aprobación de nuevo.';
    END IF;
    IF p_needs_discount
       AND COALESCE(NULLIF(v_req.details->>'discount', '')::numeric, 0) < p_discount - 1 THEN
        RAISE EXCEPTION 'El descuento cambió después de la aprobación. Pide aprobación de nuevo.';
    END IF;

    UPDATE approval_requests SET status = 'used', used_sale_id = p_sale_id WHERE id = p_approval_id;
END;
$$;
REVOKE ALL ON FUNCTION public.toul_consume_sale_approval(uuid, numeric, numeric, boolean, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toul_consume_sale_approval(uuid, numeric, numeric, boolean, boolean, uuid) TO authenticated;


-- ── 4. Pedir aprobación: respeta "No permitido" y suma descuentos ─
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
  v_seller   boolean := toul_current_role() IS DISTINCT FROM 'admin';
BEGIN
  IF auth.uid() IS NULL OR v_store_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_type = 'void_sale' THEN
    IF v_seller AND toul_seller_permission(v_store_id, 'anular') = 'no' THEN
      RAISE EXCEPTION 'No tienes permiso para anular ventas';
    END IF;
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
    IF v_seller AND toul_seller_permission(v_store_id, 'devolver') = 'no' THEN
      RAISE EXCEPTION 'No tienes permiso para hacer devoluciones';
    END IF;
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
  ELSIF p_type IN ('credit_sale', 'discount_sale') THEN
    IF p_type = 'credit_sale' THEN
      IF v_seller AND toul_seller_permission(v_store_id, 'fiar') = 'no' THEN
        RAISE EXCEPTION 'No tienes permiso para fiar';
      END IF;
      IF v_amount IS NULL OR v_amount <= 0 THEN
        RAISE EXCEPTION 'Monto inválido';
      END IF;
      IF COALESCE(length(trim(p_details->>'customerName')), 0) = 0 THEN
        RAISE EXCEPTION 'Selecciona el cliente antes de pedir aprobación';
      END IF;
    ELSE
      IF v_amount IS NULL OR v_amount < 0 THEN
        RAISE EXCEPTION 'Monto inválido';
      END IF;
      IF COALESCE(NULLIF(p_details->>'discount', '')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Escribe el descuento antes de pedir aprobación';
      END IF;
    END IF;
    -- Una sola solicitud de venta pendiente por vendedor
    UPDATE approval_requests SET status = 'cancelled'
     WHERE requested_by = auth.uid() AND type IN ('credit_sale', 'discount_sale')
       AND status IN ('pending', 'approved');
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
GRANT EXECUTE ON FUNCTION public.toul_request_approval(text, uuid, numeric, text, jsonb) TO authenticated;


-- ── 5. Anular y devolver directo si el permiso lo deja ───────────
CREATE OR REPLACE FUNCTION public.toul_void_sale(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT toul_can_alone('anular') THEN
    RAISE EXCEPTION 'Solo el administrador puede anular ventas. Pide aprobación.';
  END IF;
  RETURN toul_void_sale_internal(p_sale_id, p_reason, auth.uid(), toul_current_member_name(), NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toul_void_sale(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.toul_return_sale(p_sale_id uuid, p_items jsonb, p_method_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NOT toul_can_alone('devolver') THEN
    RAISE EXCEPTION 'Solo el administrador puede hacer devoluciones. Pide aprobación.';
  END IF;
  RETURN toul_return_sale_internal(p_sale_id, p_items, p_method_id, p_reason,
                                   auth.uid(), toul_current_member_name(), NULL);
END;
$$;
GRANT EXECUTE ON FUNCTION public.toul_return_sale(uuid, jsonb, uuid, text) TO authenticated;


-- ── 6. Cierre: vueltos del turno y efectivo esperado ─────────────
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
    'returnTotal',   (SELECT COALESCE(round(SUM(total)), 0) FROM sale_returns WHERE cash_session_id = p_session_id),
    -- Solo informativo: el efectivo esperado ya cuenta el valor de cada venta
    'changeCount',   (SELECT count(*) FROM sales WHERE cash_session_id = p_session_id AND change_given > 0),
    'changeTotal',   (SELECT COALESCE(round(SUM(change_given)), 0) FROM sales WHERE cash_session_id = p_session_id),
    'cashReceived',  (SELECT COALESCE(round(SUM(cash_received)), 0) FROM sales WHERE cash_session_id = p_session_id)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.toul_cash_session_totals(uuid) FROM PUBLIC, anon, authenticated;

-- El vendedor ve el efectivo esperado de su turno abierto solo con permiso
CREATE OR REPLACE FUNCTION public.toul_cash_session_summary(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session cash_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM cash_sessions
   WHERE id = p_session_id AND store_id = toul_current_store_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;

  IF toul_current_role() = 'admin' THEN
    IF v_session.status = 'closed' AND v_session.summary IS NOT NULL THEN
      RETURN v_session.summary || jsonb_build_object('countedCash', v_session.counted_cash, 'difference', v_session.difference);
    END IF;
    RETURN toul_cash_session_totals(p_session_id);
  END IF;

  IF v_session.status = 'closed' AND v_session.opened_by = auth.uid() THEN
    RETURN v_session.summary || jsonb_build_object('countedCash', v_session.counted_cash, 'difference', v_session.difference);
  END IF;

  IF v_session.status = 'open' AND v_session.opened_by = auth.uid() AND toul_can_alone('ver_efectivo') THEN
    RETURN toul_cash_session_totals(p_session_id);
  END IF;

  RAISE EXCEPTION 'El resumen está disponible al cerrar el turno';
END;
$$;
GRANT EXECUTE ON FUNCTION public.toul_cash_session_summary(uuid) TO authenticated;


-- ── 7. process_sale: permisos, descuento con aprobación y vuelto ─
-- Igual a la de deploy_caja_segura.sql, más:
--   · fiar según el permiso del vendedor (solo, con aprobación, no)
--   · descuento por encima del máximo del vendedor → aprobación
--   · cliente nuevo solo si el vendedor puede crear clientes
--   · efectivo recibido y vuelto guardados con la venta
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
        'priceReview', jsonb_array_length(v_review) > 0,
        'change', v_change
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sale(jsonb) TO authenticated;
