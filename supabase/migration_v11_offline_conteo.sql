-- =================================================================
-- TOUL Migration v11 — Ventas sin internet + Conteo de inventario
-- =================================================================
-- 1. Ventas offline: la caja guarda la venta en el computador y la
--    envía cuando vuelve la señal. `client_sale_id` evita duplicados
--    si el envío se reintenta.
-- 2. Conteo de inventario: contar el stock físico, ver diferencias
--    y ajustar el inventario en una sola operación.
--
-- 100% aditiva. Se puede ejecutar más de una vez.
-- =================================================================


-- ─── 1. Ventas sin internet ──────────────────────────────────────
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_sale_id TEXT;

-- Una venta creada offline solo puede entrar una vez, aunque se reintente
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_client_sale_id
  ON sales(store_id, client_sale_id) WHERE client_sale_id IS NOT NULL;


-- ─── 2. Conteo de inventario ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_counts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  status          TEXT          NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'cancelled')),
  started_by      UUID          NOT NULL,
  started_by_name TEXT,
  started_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  applied_at      TIMESTAMPTZ,
  applied_by_name TEXT,
  notes           TEXT,
  counted_items   INTEGER       NOT NULL DEFAULT 0,
  diff_units      NUMERIC(12,2) NOT NULL DEFAULT 0,
  diff_value      NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_store ON inventory_counts(store_id, started_at DESC);
ALTER TABLE inventory_counts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS inventory_count_items (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id     UUID          NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  store_id     UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id   UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id   UUID          REFERENCES product_variants(id) ON DELETE CASCADE,
  counted_qty  NUMERIC(12,2) NOT NULL,
  expected_qty NUMERIC(12,2),
  difference   NUMERIC(12,2),
  unit_cost    NUMERIC(12,2),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_count_items_count ON inventory_count_items(count_id);
-- Un renglón por producto/variante dentro de cada conteo
CREATE UNIQUE INDEX IF NOT EXISTS uq_count_items_unique
  ON inventory_count_items(count_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE inventory_count_items ENABLE ROW LEVEL SECURITY;

-- Solo administradores hacen conteos
DROP POLICY IF EXISTS admin_inventory_counts ON inventory_counts;
CREATE POLICY admin_inventory_counts ON inventory_counts
  FOR ALL USING (store_id IN (SELECT toul_admin_store_ids()))
  WITH CHECK (store_id IN (SELECT toul_admin_store_ids()));

DROP POLICY IF EXISTS admin_inventory_count_items ON inventory_count_items;
CREATE POLICY admin_inventory_count_items ON inventory_count_items
  FOR ALL USING (store_id IN (SELECT toul_admin_store_ids()))
  WITH CHECK (store_id IN (SELECT toul_admin_store_ids()));


-- Aplica el conteo: compara con el stock del momento y ajusta el inventario.
-- Los productos que no se contaron NO se tocan.
CREATE OR REPLACE FUNCTION public.toul_apply_inventory_count(p_count_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_store_id    uuid := toul_current_store_id();
  v_count       inventory_counts%ROWTYPE;
  v_short_id    text;
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
    SELECT id, product_id, variant_id, counted_qty
      FROM inventory_count_items
     WHERE count_id = p_count_id
     ORDER BY created_at
  LOOP
    -- Stock actual (el conteo pudo durar horas y haber ventas en el medio)
    IF r.variant_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity), 0) INTO v_expected
        FROM inventory_adjustments WHERE variant_id = r.variant_id;
      SELECT COALESCE(cpp, 0) INTO v_cost FROM product_variants WHERE id = r.variant_id;
    ELSE
      SELECT COALESCE(stock, 0), COALESCE(cpp, 0) INTO v_expected, v_cost
        FROM products WHERE id = r.product_id AND store_id = v_store_id;
      IF NOT FOUND THEN
        CONTINUE;
      END IF;
    END IF;

    v_diff := round(r.counted_qty) - v_expected;

    UPDATE inventory_count_items
       SET expected_qty = v_expected, difference = v_diff, unit_cost = v_cost
     WHERE id = r.id;

    IF v_diff <> 0 THEN
      INSERT INTO inventory_adjustments (store_id, product_id, variant_id, quantity, reason, notes, reference_id)
      VALUES (v_store_id, r.product_id, r.variant_id, v_diff, 'count',
              format('Conteo #%s', v_short_id), p_count_id);
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
