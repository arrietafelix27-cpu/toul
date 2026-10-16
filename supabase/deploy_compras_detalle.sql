-- =================================================================
-- TOUL v18 — Historial de compras
-- =================================================================
-- La pantalla de compras solo servía para corregir el proveedor.
-- Ahora es el historial completo, y para eso hacen falta dos cosas
-- que la pantalla sola no puede resolver:
--
--   1. El detalle de una compra en una sola consulta, con lo que
--      te costó cada producto LA VEZ ANTERIOR. Ese es el dato que
--      avisa que un proveedor te está subiendo los precios.
--   2. Los totales del período sin traer todas las compras: el
--      gasto, cuántas fueron y cuánto le debes todavía a tus
--      proveedores.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. El detalle de una compra ──────────────────────────────────
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

-- ── 2. Los totales de arriba ─────────────────────────────────────
-- El gasto y el número de compras son del período que estés viendo.
-- Lo que le debes a proveedores NO: eso es de hoy, no del período,
-- porque es plata que sigue debiendo sin importar cuándo compraste.
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
