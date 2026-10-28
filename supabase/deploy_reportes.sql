-- ══════════════════════════════════════════════════════════════
-- TOUL — Reportes
--
-- Cuatro cosas:
--
--   1. toul_reporte(desde, hasta): todo lo que muestra la pantalla de
--      Reportes para un periodo, calculado en un solo lugar.
--   2. toul_reporte_meses(): ventas y ganancia de los últimos 6 meses,
--      para "Mes a mes".
--   3. toul_registrar_abono(...): el abono de un cliente ahora dice por
--      dónde te pagó y se guarda en una sola transacción (antes eran
--      tres escrituras sueltas: si una fallaba, la deuda y la caja
--      quedaban descuadradas).
--   4. toul_undo_payment: deshacer un abono saca exactamente su entrada
--      de caja (antes la buscaba por monto y hora).
--
-- Definiciones (las mismas del Inicio):
--   · Vendiste        = lo vendido en el periodo, antes de devoluciones.
--   · De contado      = lo que te pagaron al momento de la venta (incluye
--                       el abono inicial de un fiado).
--   · A crédito       = Vendiste − De contado.
--   · Ganancia        = (ventas − devoluciones) − (costo − costo devuelto).
--   · Plata que entró = De contado + abonos que te hicieron.
--   · Mercancía que pagaste = compras pagadas + abonos a proveedores.
--   · Lo devuelto resta el día en que se devuelve.
--
-- Se puede correr más de una vez sin dañar nada.
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_credits_store_created ON credits(store_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_store_type_created ON payments(store_id, type, created_at);


-- ─── 1. El reporte de un periodo ─────────────────────────────────
-- Las ventas del periodo y cuánto se pagó de cada una al momento.
-- Una venta de contado se cuenta completa aunque sea vieja y no tenga
-- el detalle de pagos; de un fiado solo cuenta el abono inicial.
CREATE OR REPLACE FUNCTION public.toul_reporte_ventas(p_store uuid, p_desde timestamptz, p_hasta timestamptz)
RETURNS TABLE (id uuid, total numeric, costo numeric, contado numeric, metodo text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT s.id, s.total,
           COALESCE((SELECT SUM(si.unit_cost * si.quantity) FROM sale_items si WHERE si.sale_id = s.id), 0),
           CASE WHEN s.is_credit
                THEN LEAST(GREATEST(COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0), 0), s.total)
                ELSE s.total END,
           s.payment_method
      FROM sales s
     WHERE s.store_id = p_store
       AND s.created_at >= p_desde AND s.created_at <= p_hasta
$$;

CREATE OR REPLACE FUNCTION public.toul_reporte(p_desde timestamptz, p_hasta timestamptz)
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
    v_productos  jsonb;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;
    IF v_hasta < v_desde THEN
        RAISE EXCEPTION 'Elige un rango de fechas válido';
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

    -- Cómo te pagan: la plata que entró, por método. Lo de cada venta sale
    -- de sus pagos; si una venta de contado no tiene el detalle (ventas
    -- viejas), va al método que quedó anotado en la venta. Los abonos van
    -- por el método que se eligió; los de antes no lo tenían y van como "Abonos"
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
    entradas AS (
        SELECT nombre, monto, 0 AS prioridad FROM ajustados
        UNION ALL
        SELECT nombre, monto, 1 FROM resto WHERE monto > 0
        UNION ALL
        -- Los de antes quedaron sin método o como "General"
        SELECT CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 'Abonos' ELSE payment_method END,
               amount,
               CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 2 ELSE 0 END
          FROM credits
         WHERE store_id = v_store AND type = 'payment'
           AND created_at >= v_desde AND created_at <= v_hasta
    ),
    por_metodo AS (
        -- "Efectivo" y "efectivo" son el mismo método
        SELECT (array_agg(nombre ORDER BY prioridad))[1] AS nombre, round(SUM(monto)) AS monto
          FROM entradas
         GROUP BY lower(trim(nombre))
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'monto', monto) ORDER BY monto DESC, nombre), '[]'::jsonb)
      INTO v_metodos
      FROM por_metodo
     WHERE monto > 0;

    -- Qué te dejó más: los 5 productos con más ganancia, ya restado lo
    -- que devolvieron en el periodo. Los combos no tienen ficha de producto
    WITH vendido AS (
        SELECT si.product_id,
               SUM(si.unit_price * si.quantity) AS ventas,
               SUM((si.unit_price - si.unit_cost) * si.quantity) AS ganancia
          FROM sale_items si
          JOIN toul_reporte_ventas(v_store, v_desde, v_hasta) v ON v.id = si.sale_id
         WHERE si.product_id IS NOT NULL
         GROUP BY si.product_id
    ),
    devuelto AS (
        SELECT si.product_id,
               SUM(ri.unit_price * ri.quantity) AS ventas,
               SUM((ri.unit_price - ri.unit_cost) * ri.quantity) AS ganancia
          FROM sale_return_items ri
          JOIN sale_returns r ON r.id = ri.return_id
          JOIN sale_items si ON si.id = ri.sale_item_id
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

    RETURN jsonb_build_object(
        'ventas',             v_ventas,
        'devoluciones',       v_devol,
        'abonos',             v_abonos,
        'gastos',             v_gastos,
        'gastosPorCategoria', v_categorias,
        'mercanciaPagada',    v_mercancia,
        'metodos',            v_metodos,
        'productos',          v_productos
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte(timestamptz, timestamptz) TO authenticated;


-- ─── 2. Mes a mes ────────────────────────────────────────────────
-- Los últimos 6 meses (hora de Colombia), o desde el primer mes con
-- ventas si el negocio es más nuevo. Ventas ya sin devoluciones y lo
-- que ganaste después de gastos. No depende del periodo elegido.
CREATE OR REPLACE FUNCTION public.toul_reporte_meses(p_meses integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   uuid := toul_current_store_id();
    v_actual  date := date_trunc('month', (now() AT TIME ZONE 'UTC') - interval '5 hours')::date;
    v_desde   date;
    v_primero date;
    v_rows    jsonb;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;

    v_desde := (v_actual - make_interval(months => GREATEST(COALESCE(p_meses, 6), 1) - 1))::date;

    SELECT date_trunc('month', (min(created_at) AT TIME ZONE 'UTC') - interval '5 hours')::date
      INTO v_primero
      FROM sales WHERE store_id = v_store;

    IF v_primero IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;
    v_desde := GREATEST(v_desde, v_primero);

    WITH meses AS (
        SELECT generate_series(v_desde, v_actual, interval '1 month')::date AS mes
    ),
    -- Inicio de cada mes en hora de Colombia, como instante
    limites AS (
        SELECT mes,
               (mes::timestamp + interval '5 hours') AT TIME ZONE 'UTC' AS desde,
               ((mes + interval '1 month')::timestamp + interval '5 hours') AT TIME ZONE 'UTC' AS hasta
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
    )
    SELECT jsonb_agg(jsonb_build_object(
               'mes',      to_char(m.mes, 'YYYY-MM-DD'),
               'ventas',   round(COALESCE(v.total, 0) - COALESCE(d.total, 0)),
               'ganancia', round((COALESCE(v.total, 0) - COALESCE(d.total, 0))
                               - (COALESCE(v.costo, 0) - COALESCE(d.costo, 0))
                               - COALESCE(g.total, 0)))
           ORDER BY m.mes)
      INTO v_rows
      FROM meses m
      LEFT JOIN ventas v ON v.mes = m.mes
      LEFT JOIN devoluciones d ON d.mes = m.mes
      LEFT JOIN gastos g ON g.mes = m.mes;

    RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte_meses(integer) TO authenticated;


-- ─── 3. Registrar un abono ───────────────────────────────────────
-- Todo o nada: el movimiento del cliente, la entrada a la caja (por el
-- método que eligió) y su deuda. La deuda se valida contra los
-- movimientos, no contra el número guardado en el cliente, y no se
-- puede abonar más de lo que debe.
CREATE OR REPLACE FUNCTION public.toul_registrar_abono(
    p_customer_id uuid,
    p_amount      numeric,
    p_method_id   uuid,
    p_notes       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store  uuid := toul_current_store_id();
    v_monto  numeric := round(COALESCE(p_amount, 0));
    v_nombre text;
    v_metodo text;
    v_saldo  numeric;
    v_credit uuid;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede registrar abonos';
    END IF;

    -- Bloquea al cliente: dos abonos al mismo tiempo no pueden pasarse de la deuda
    SELECT name INTO v_nombre
      FROM customers
     WHERE id = p_customer_id AND store_id = v_store
       FOR UPDATE;
    IF v_nombre IS NULL THEN
        RAISE EXCEPTION 'Cliente no encontrado';
    END IF;

    IF v_monto <= 0 THEN
        RAISE EXCEPTION 'Escribe cuánto te abonó';
    END IF;

    SELECT name INTO v_metodo
      FROM payment_methods
     WHERE id = p_method_id AND store_id = v_store;
    IF v_metodo IS NULL THEN
        RAISE EXCEPTION 'Elige por dónde te pagó';
    END IF;

    SELECT round(COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END), 0))
      INTO v_saldo
      FROM credits
     WHERE store_id = v_store AND customer_id = p_customer_id;

    IF v_saldo <= 0 THEN
        RAISE EXCEPTION '% no te debe nada', v_nombre;
    END IF;
    IF v_monto > v_saldo THEN
        RAISE EXCEPTION 'El abono no puede ser mayor a lo que debe: $%',
            replace(to_char(v_saldo, 'FM999,999,999,999'), ',', '.');
    END IF;

    INSERT INTO credits (store_id, customer_id, type, amount, payment_method, notes)
    VALUES (v_store, p_customer_id, 'payment', v_monto, v_metodo,
            COALESCE(NULLIF(trim(p_notes), ''), 'Abono de cliente: ' || v_nombre))
    RETURNING id INTO v_credit;

    -- La entrada a la caja queda atada al abono (reference_id) para que
    -- deshacerlo encuentre exactamente esta
    INSERT INTO payments (store_id, type, method, amount, reference_id, notes)
    VALUES (v_store, 'sale_payment', v_metodo, v_monto, v_credit, 'Abono del cliente: ' || v_nombre);

    UPDATE customers SET total_debt = v_saldo - v_monto WHERE id = p_customer_id;

    RETURN jsonb_build_object(
        'success',  true,
        'creditId', v_credit,
        'amount',   v_monto,
        'method',   v_metodo,
        'saldo',    v_saldo - v_monto
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_registrar_abono(uuid, numeric, uuid, text) TO authenticated;


-- ─── 4. Deshacer un abono ────────────────────────────────────────
-- Igual que antes, pero la entrada a la caja se busca primero por el
-- abono al que quedó atada; solo los abonos viejos se buscan por monto
-- y momento. La deuda del cliente se recalcula desde los movimientos.
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

    SELECT name INTO v_nombre FROM customers WHERE id = v_customer FOR UPDATE;

    DELETE FROM credits WHERE id = p_credit_id;

    UPDATE customers
       SET total_debt = GREATEST((
               SELECT round(COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END), 0))
                 FROM credits WHERE store_id = v_store AND customer_id = v_customer), 0)
     WHERE id = v_customer;

    DELETE FROM payments WHERE store_id = v_store AND type = 'sale_payment' AND reference_id = p_credit_id;

    IF NOT FOUND THEN
        DELETE FROM payments
         WHERE id IN (
            SELECT id FROM payments
             WHERE store_id = v_store
               AND type = 'sale_payment'
               AND reference_id IS NULL
               AND round(amount) = round(v_monto)
               AND notes LIKE 'Abono del cliente:%'
               AND created_at BETWEEN v_cuando - interval '2 minutes' AND v_cuando + interval '2 minutes'
             ORDER BY created_at
             LIMIT 1
         );
    END IF;

    RETURN jsonb_build_object('success', true, 'amount', round(v_monto), 'customer', v_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_undo_payment(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
