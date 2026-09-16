-- =================================================================
-- TOUL — DEPLOY MODO ISLA (archivo único para el SQL Editor de Supabase)
-- Generado de: migration_v10_isla.sql + rpc/process_sale.sql + rpc/process_purchase.sql
-- Se puede ejecutar más de una vez sin problema.
-- =================================================================

-- =================================================================
-- TOUL Migration v10 — Modo isla
-- =================================================================
-- Roles (administrador / vendedor), turnos de caja, aprobaciones,
-- anulación de ventas, datos de tirilla y notificaciones push.
--
-- 100% aditiva: no borra ni modifica las políticas existentes del
-- dueño. Agrega políticas nuevas para miembros (vendedores).
--
-- Orden de ejecución: esta migración → rpc/process_sale.sql →
-- rpc/process_purchase.sql (o simplemente deploy_isla.sql, que las une).
-- =================================================================


-- ─── 1. Miembros del negocio ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL CHECK (role IN ('admin', 'seller')),
  display_name TEXT        NOT NULL,
  email        TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una cuenta pertenece a un solo negocio
  CONSTRAINT store_members_user_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_store_members_store_id ON store_members(store_id);
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS store_invites (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code         TEXT        NOT NULL UNIQUE,
  role         TEXT        NOT NULL DEFAULT 'seller' CHECK (role IN ('admin', 'seller')),
  display_name TEXT        NOT NULL,
  created_by   UUID        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  used_by      UUID,
  used_at      TIMESTAMPTZ,
  revoked      BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_store_invites_store_id ON store_invites(store_id);
ALTER TABLE store_invites ENABLE ROW LEVEL SECURITY;

-- Dueños actuales como administradores
INSERT INTO store_members (store_id, user_id, role, display_name, email)
SELECT DISTINCT ON (s.owner_id) s.id, s.owner_id, 'admin', 'Administrador', u.email
  FROM stores s
  LEFT JOIN auth.users u ON u.id = s.owner_id
 ORDER BY s.owner_id, s.created_at
ON CONFLICT (user_id) DO NOTHING;


-- ─── 2. Funciones de identidad (usadas por RLS y RPCs) ───────────
CREATE OR REPLACE FUNCTION public.toul_member_store_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id FROM stores WHERE owner_id = auth.uid()
  UNION
  SELECT store_id FROM store_members WHERE user_id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.toul_admin_store_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT id FROM stores WHERE owner_id = auth.uid()
  UNION
  SELECT store_id FROM store_members WHERE user_id = auth.uid() AND is_active AND role = 'admin'
$$;

CREATE OR REPLACE FUNCTION public.toul_current_store_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT id FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1),
    (SELECT store_id FROM store_members WHERE user_id = auth.uid() AND is_active LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.toul_current_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM stores WHERE owner_id = auth.uid()) THEN 'admin'
    ELSE (SELECT role FROM store_members WHERE user_id = auth.uid() AND is_active LIMIT 1)
  END
$$;

CREATE OR REPLACE FUNCTION public.toul_current_member_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT display_name FROM store_members WHERE user_id = auth.uid() LIMIT 1),
    'Administrador'
  )
$$;

-- Contexto de sesión para middleware y frontend
CREATE OR REPLACE FUNCTION public.toul_session_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id uuid;
  v_role     text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  v_store_id := toul_current_store_id();
  IF v_store_id IS NULL THEN
    RETURN NULL;
  END IF;
  v_role := toul_current_role();
  RETURN jsonb_build_object(
    'userId',      auth.uid(),
    'storeId',     v_store_id,
    'storeName',   (SELECT name FROM stores WHERE id = v_store_id),
    'role',        v_role,
    'displayName', toul_current_member_name()
  );
END;
$$;

-- Nuevo negocio → su dueño queda como administrador
CREATE OR REPLACE FUNCTION public.toul_add_owner_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO store_members (store_id, user_id, role, display_name, email)
  VALUES (NEW.id, NEW.owner_id, 'admin', 'Administrador',
          (SELECT email FROM auth.users WHERE id = NEW.owner_id))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_toul_add_owner_member ON stores;
CREATE TRIGGER trg_toul_add_owner_member
AFTER INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION toul_add_owner_member();

-- Políticas de miembros e invitaciones (escritura solo vía RPC)
DROP POLICY IF EXISTS member_select_store_members ON store_members;
CREATE POLICY member_select_store_members ON store_members
  FOR SELECT USING (
    store_id IN (SELECT toul_admin_store_ids()) OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS admin_select_store_invites ON store_invites;
CREATE POLICY admin_select_store_invites ON store_invites
  FOR SELECT USING (store_id IN (SELECT toul_admin_store_ids()));


-- ─── 3. Datos de la tirilla y métodos de efectivo ────────────────
ALTER TABLE stores ADD COLUMN IF NOT EXISTS nit            TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone          TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS receipt_footer TEXT;

ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS is_cash BOOLEAN NOT NULL DEFAULT false;
UPDATE payment_methods SET is_cash = true WHERE lower(name) LIKE '%efectivo%';

CREATE OR REPLACE FUNCTION public.toul_detect_cash_method()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF lower(NEW.name) LIKE '%efectivo%' THEN
    NEW.is_cash := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_toul_detect_cash_method ON payment_methods;
CREATE TRIGGER trg_toul_detect_cash_method
BEFORE INSERT ON payment_methods
FOR EACH ROW EXECUTE FUNCTION toul_detect_cash_method();


-- ─── 4. Turnos de caja ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_sessions (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status          TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by       UUID          NOT NULL,
  opened_by_name  TEXT,
  opened_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  opening_cash    NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_by       UUID,
  closed_by_name  TEXT,
  closed_at       TIMESTAMPTZ,
  counted_cash    NUMERIC(12,2),
  expected_cash   NUMERIC(12,2),
  difference      NUMERIC(12,2),
  notes           TEXT,
  summary         JSONB
);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_store_id ON cash_sessions(store_id, opened_at DESC);
-- Un solo turno abierto por negocio
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open ON cash_sessions(store_id) WHERE status = 'open';
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_select_cash_sessions ON cash_sessions;
CREATE POLICY member_select_cash_sessions ON cash_sessions
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));


-- ─── 5. Columnas nuevas en ventas, caja e inventario ─────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id       UUID;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_name     TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sales_cash_session_id ON sales(cash_session_id);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_cash_session_id ON payments(cash_session_id);

ALTER TABLE inventory_adjustments ADD COLUMN IF NOT EXISTS reference_id UUID;
CREATE INDEX IF NOT EXISTS idx_ia_reference_id ON inventory_adjustments(reference_id);

-- Todo movimiento de caja queda en el turno abierto del momento
CREATE OR REPLACE FUNCTION public.toul_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF NEW.cash_session_id IS NULL THEN
    SELECT id INTO NEW.cash_session_id
      FROM cash_sessions
     WHERE store_id = NEW.store_id AND status = 'open'
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_toul_attach_cash_session ON payments;
CREATE TRIGGER trg_toul_attach_cash_session
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION toul_attach_cash_session();

-- El caché de stock debe actualizarse aunque venda un vendedor
-- (que no tiene permiso de escritura sobre products)
ALTER FUNCTION public.sync_product_stock() SECURITY DEFINER;
ALTER FUNCTION public.sync_product_stock() SET search_path = public, pg_catalog;


-- ─── 6. Aprobaciones, anulaciones y notificaciones ───────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type              TEXT          NOT NULL CHECK (type IN ('void_sale', 'credit_sale')),
  status            TEXT          NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'approved', 'rejected', 'used', 'cancelled', 'expired')),
  requested_by      UUID          NOT NULL,
  requested_by_name TEXT,
  requested_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  sale_id           UUID,
  amount            NUMERIC(12,2),
  reason            TEXT,
  details           JSONB         NOT NULL DEFAULT '{}'::jsonb,
  resolved_by       UUID,
  resolved_by_name  TEXT,
  resolved_at       TIMESTAMPTZ,
  resolution_note   TEXT,
  used_sale_id      UUID
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_store ON approval_requests(store_id, status, requested_at DESC);
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_select_approval_requests ON approval_requests;
CREATE POLICY member_select_approval_requests ON approval_requests
  FOR SELECT USING (
    store_id IN (SELECT toul_admin_store_ids())
    OR (requested_by = auth.uid() AND store_id IN (SELECT toul_member_store_ids()))
  );

CREATE TABLE IF NOT EXISTS sale_voids (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id           UUID          NOT NULL,
  sale_created_at   TIMESTAMPTZ,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  refunded          NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason            TEXT,
  snapshot          JSONB         NOT NULL,
  seller_name       TEXT,
  requested_by      UUID,
  requested_by_name TEXT,
  approved_by       UUID,
  approved_by_name  TEXT,
  approval_id       UUID,
  cash_session_id   UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
  voided_at         TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_voids_store ON sale_voids(store_id, voided_at DESC);
ALTER TABLE sale_voids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_select_sale_voids ON sale_voids;
CREATE POLICY member_select_sale_voids ON sale_voids
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL,
  store_id   UUID        REFERENCES stores(id) ON DELETE CASCADE,
  endpoint   TEXT        NOT NULL UNIQUE,
  p256dh     TEXT        NOT NULL,
  auth       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_push_subscriptions ON push_subscriptions;
CREATE POLICY own_push_subscriptions ON push_subscriptions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ─── 7. Permisos del vendedor sobre tablas existentes ────────────
-- Las políticas del dueño no se tocan. Estas se suman (OR).

-- Lectura del negocio y catálogo
DROP POLICY IF EXISTS member_select_stores ON stores;
CREATE POLICY member_select_stores ON stores
  FOR SELECT USING (id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_products ON products;
CREATE POLICY member_select_products ON products
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_product_variants ON product_variants;
CREATE POLICY member_select_product_variants ON product_variants
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_pva ON product_variant_attributes;
CREATE POLICY member_select_pva ON product_variant_attributes
  FOR SELECT USING (product_id IN (SELECT id FROM products WHERE store_id IN (SELECT toul_member_store_ids())));

DROP POLICY IF EXISTS member_select_combos ON combos;
CREATE POLICY member_select_combos ON combos
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_combo_items ON combo_items;
CREATE POLICY member_select_combo_items ON combo_items
  FOR SELECT USING (combo_id IN (SELECT id FROM combos WHERE store_id IN (SELECT toul_member_store_ids())));

DROP POLICY IF EXISTS member_select_product_categories ON product_categories;
CREATE POLICY member_select_product_categories ON product_categories
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_payment_methods ON payment_methods;
CREATE POLICY member_select_payment_methods ON payment_methods
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

-- Clientes: consultar, crear y actualizar deuda en ventas a crédito
DROP POLICY IF EXISTS member_select_customers ON customers;
CREATE POLICY member_select_customers ON customers
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_customers ON customers;
CREATE POLICY member_insert_customers ON customers
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_update_customers ON customers;
CREATE POLICY member_update_customers ON customers
  FOR UPDATE USING (store_id IN (SELECT toul_member_store_ids()))
  WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

-- Ventas: registrar y consultar
DROP POLICY IF EXISTS member_select_sales ON sales;
CREATE POLICY member_select_sales ON sales
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_sales ON sales;
CREATE POLICY member_insert_sales ON sales
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_sale_items ON sale_items;
CREATE POLICY member_select_sale_items ON sale_items
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_sale_items ON sale_items;
CREATE POLICY member_insert_sale_items ON sale_items
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_sale_payments ON sale_payments;
CREATE POLICY member_select_sale_payments ON sale_payments
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_sale_payments ON sale_payments;
CREATE POLICY member_insert_sale_payments ON sale_payments
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

-- Movimientos generados por la venta (sin lectura de la caja completa)
DROP POLICY IF EXISTS member_insert_payments ON payments;
CREATE POLICY member_insert_payments ON payments
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_credits ON credits;
CREATE POLICY member_insert_credits ON credits
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_select_inventory_adjustments ON inventory_adjustments;
CREATE POLICY member_select_inventory_adjustments ON inventory_adjustments
  FOR SELECT USING (store_id IN (SELECT toul_member_store_ids()));

DROP POLICY IF EXISTS member_insert_inventory_adjustments ON inventory_adjustments;
CREATE POLICY member_insert_inventory_adjustments ON inventory_adjustments
  FOR INSERT WITH CHECK (store_id IN (SELECT toul_member_store_ids()));


-- ─── 8. RPCs: equipo ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toul_create_invite(p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id uuid;
  v_code     text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_expires  timestamptz := now() + interval '7 days';
  i          int;
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede invitar vendedores';
  END IF;
  IF p_display_name IS NULL OR length(trim(p_display_name)) = 0 THEN
    RAISE EXCEPTION 'Escribe el nombre del vendedor';
  END IF;
  v_store_id := toul_current_store_id();

  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM store_invites WHERE code = v_code);
  END LOOP;

  INSERT INTO store_invites (store_id, code, role, display_name, created_by, expires_at)
  VALUES (v_store_id, v_code, 'seller', trim(p_display_name), auth.uid(), v_expires);

  RETURN jsonb_build_object('code', v_code, 'expiresAt', v_expires);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_accept_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_invite store_invites%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF EXISTS (SELECT 1 FROM stores WHERE owner_id = v_uid) THEN
    RAISE EXCEPTION 'Esta cuenta ya tiene su propio negocio. Usa otra cuenta para el vendedor.';
  END IF;
  IF EXISTS (SELECT 1 FROM store_members WHERE user_id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'Esta cuenta ya pertenece a un negocio';
  END IF;

  SELECT * INTO v_invite
    FROM store_invites
   WHERE code = upper(trim(p_code))
     FOR UPDATE;

  IF NOT FOUND OR v_invite.revoked OR v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Código inválido o ya usado';
  END IF;
  IF v_invite.expires_at < now() THEN
    RAISE EXCEPTION 'Este código ya venció. Pide uno nuevo al administrador.';
  END IF;

  INSERT INTO store_members (store_id, user_id, role, display_name, email, is_active)
  VALUES (v_invite.store_id, v_uid, v_invite.role, v_invite.display_name,
          (SELECT email FROM auth.users WHERE id = v_uid), true)
  ON CONFLICT (user_id) DO UPDATE
     SET store_id = EXCLUDED.store_id, role = EXCLUDED.role,
         display_name = EXCLUDED.display_name, is_active = true;

  UPDATE store_invites SET used_by = v_uid, used_at = now() WHERE id = v_invite.id;

  RETURN jsonb_build_object('storeId', v_invite.store_id, 'role', v_invite.role);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_revoke_invite(p_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede hacer esto';
  END IF;
  UPDATE store_invites SET revoked = true
   WHERE id = p_invite_id AND store_id = toul_current_store_id() AND used_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_set_member_active(p_member_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_member store_members%ROWTYPE;
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede hacer esto';
  END IF;
  SELECT * INTO v_member FROM store_members
   WHERE id = p_member_id AND store_id = toul_current_store_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Miembro no encontrado';
  END IF;
  IF v_member.user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM stores WHERE id = v_member.store_id AND owner_id = v_member.user_id) THEN
    RAISE EXCEPTION 'No puedes desactivar al dueño del negocio';
  END IF;
  UPDATE store_members SET is_active = p_active WHERE id = p_member_id;
END;
$$;


-- ─── 9. RPCs: turnos de caja ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toul_open_cash_session(p_opening_cash numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id uuid := toul_current_store_id();
  v_open     cash_sessions%ROWTYPE;
  v_id       uuid;
BEGIN
  IF auth.uid() IS NULL OR v_store_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_opening_cash IS NULL OR p_opening_cash < 0 THEN
    RAISE EXCEPTION 'La base de efectivo no puede ser negativa';
  END IF;

  SELECT * INTO v_open FROM cash_sessions WHERE store_id = v_store_id AND status = 'open';
  IF FOUND THEN
    RAISE EXCEPTION 'Ya hay un turno abierto por %', COALESCE(v_open.opened_by_name, 'otra persona');
  END IF;

  INSERT INTO cash_sessions (store_id, opened_by, opened_by_name, opening_cash)
  VALUES (v_store_id, auth.uid(), toul_current_member_name(), round(p_opening_cash))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- Cálculo interno (no expuesto): lo que debería haber en caja
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
    'voidTotal',     (SELECT COALESCE(round(SUM(total)), 0) FROM sale_voids WHERE cash_session_id = p_session_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_close_cash_session(p_session_id uuid, p_counted_cash numeric, p_notes text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session cash_sessions%ROWTYPE;
  v_totals  jsonb;
  v_diff    numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'Escribe cuánto efectivo contaste';
  END IF;

  SELECT * INTO v_session FROM cash_sessions
   WHERE id = p_session_id AND store_id = toul_current_store_id()
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno no encontrado';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Este turno ya está cerrado';
  END IF;
  IF v_session.opened_by <> auth.uid() AND toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo quien abrió el turno o el administrador pueden cerrarlo';
  END IF;

  v_totals := toul_cash_session_totals(p_session_id);
  v_diff   := round(p_counted_cash) - (v_totals->>'expectedCash')::numeric;

  UPDATE cash_sessions
     SET status         = 'closed',
         closed_by      = auth.uid(),
         closed_by_name = toul_current_member_name(),
         closed_at      = now(),
         counted_cash   = round(p_counted_cash),
         expected_cash  = (v_totals->>'expectedCash')::numeric,
         difference     = v_diff,
         notes          = NULLIF(trim(p_notes), ''),
         summary        = v_totals
   WHERE id = p_session_id;

  RETURN v_totals || jsonb_build_object('countedCash', round(p_counted_cash), 'difference', v_diff);
END;
$$;

-- Resumen: el admin lo ve en vivo; el vendedor solo después de cerrar (conteo a ciegas)
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

  RAISE EXCEPTION 'El resumen está disponible al cerrar el turno';
END;
$$;


-- ─── 10. RPCs: anulación de ventas ───────────────────────────────
-- Interna: la ejecutan toul_void_sale (admin) y toul_resolve_approval
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

  v_short_id := substr(v_sale.id::text, 1, 8);
  SELECT id INTO v_session FROM cash_sessions WHERE store_id = v_store_id AND status = 'open';

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

REVOKE ALL ON FUNCTION public.toul_void_sale_internal(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.toul_cash_session_totals(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.toul_void_sale(p_sale_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF toul_current_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo el administrador puede anular ventas. Pide aprobación.';
  END IF;
  RETURN toul_void_sale_internal(p_sale_id, p_reason, auth.uid(), toul_current_member_name(), NULL);
END;
$$;


-- ─── 11. RPCs: aprobaciones ──────────────────────────────────────
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
    v_amount := v_sale.total;
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
          CASE WHEN p_type = 'void_sale' THEN p_sale_id END,
          round(v_amount), NULLIF(trim(p_reason), ''), COALESCE(p_details, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_cancel_approval(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  UPDATE approval_requests SET status = 'cancelled'
   WHERE id = p_request_id AND requested_by = auth.uid() AND status IN ('pending', 'approved');
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


-- Valida y consume la aprobación de crédito dentro de process_sale.
-- SECURITY DEFINER porque el vendedor no tiene permiso de UPDATE sobre approval_requests.
CREATE OR REPLACE FUNCTION public.toul_consume_credit_approval(p_approval_id uuid, p_total numeric, p_sale_id uuid)
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
     AND type = 'credit_sale'
     AND requested_by = auth.uid()
     FOR UPDATE;

  IF NOT FOUND OR v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'Esta venta a crédito necesita aprobación del administrador';
  END IF;
  IF v_req.resolved_at < now() - interval '60 minutes' THEN
    RAISE EXCEPTION 'La aprobación venció. Pide aprobación de nuevo.';
  END IF;
  IF abs(COALESCE(v_req.amount, 0) - p_total) > 1 THEN
    RAISE EXCEPTION 'El total cambió después de la aprobación. Pide aprobación de nuevo.';
  END IF;

  UPDATE approval_requests SET status = 'used', used_sale_id = p_sale_id WHERE id = p_approval_id;
END;
$$;


-- ─── 12. RPCs: notificaciones push ───────────────────────────────
CREATE OR REPLACE FUNCTION public.toul_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint;
  INSERT INTO push_subscriptions (user_id, store_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), toul_current_store_id(), p_endpoint, p_p256dh, p_auth);
END;
$$;

-- Destinos para avisar a los administradores de una solicitud recién creada
CREATE OR REPLACE FUNCTION public.toul_push_targets(p_request_id uuid)
RETURNS TABLE (endpoint text, p256dh text, auth text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_req approval_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM approval_requests
   WHERE id = p_request_id
     AND requested_by = auth.uid()
     AND status = 'pending'
     AND requested_at > now() - interval '5 minutes';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ps.endpoint, ps.p256dh, ps.auth
    FROM push_subscriptions ps
   WHERE ps.user_id IN (
           SELECT owner_id FROM stores WHERE id = v_req.store_id
           UNION
           SELECT user_id FROM store_members
            WHERE store_id = v_req.store_id AND role = 'admin' AND is_active
         );
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Se usa al detectar suscripciones vencidas (410 Gone) al enviar
  DELETE FROM push_subscriptions
   WHERE endpoint = p_endpoint AND store_id = toul_current_store_id();
END;
$$;


-- ─── 13. Permisos de ejecución ───────────────────────────────────
GRANT EXECUTE ON FUNCTION public.toul_session_context()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_create_invite(text)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_accept_invite(text)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_revoke_invite(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_set_member_active(uuid, boolean)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_open_cash_session(numeric)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_close_cash_session(uuid, numeric, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_cash_session_summary(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_void_sale(uuid, text)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_request_approval(text, uuid, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_cancel_approval(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_resolve_approval(uuid, boolean, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_consume_credit_approval(uuid, numeric, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_save_push_subscription(text, text, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_push_targets(uuid)                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_delete_push_subscription(text)              TO authenticated;

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

NOTIFY pgrst, 'reload schema';
