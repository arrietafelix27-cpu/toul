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
        SELECT COALESCE(NULLIF(trim(payment_method), ''), 'Abonos'), amount,
               CASE WHEN NULLIF(trim(payment_method), '') IS NULL THEN 2 ELSE 0 END
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
    -- que devolvieron en el periodo. El descuento de una venta se reparte
    -- entre sus productos en proporción a lo que valía cada uno (igual que
    -- en una devolución): así lo que dejó cada producto es lo que de verdad
    -- pagaron por él. Los combos no tienen ficha de producto
    WITH vendido AS (
        SELECT si.product_id,
               SUM(si.unit_price * si.quantity * f.factor) AS ventas,
               SUM((si.unit_price * f.factor - si.unit_cost) * si.quantity) AS ganancia
          FROM sale_items si
          JOIN toul_reporte_ventas(v_store, v_desde, v_hasta) v ON v.id = si.sale_id
          CROSS JOIN LATERAL (
              SELECT CASE WHEN SUM(x.subtotal) > 0 THEN v.total / SUM(x.subtotal) ELSE 1 END AS factor
                FROM sale_items x WHERE x.sale_id = v.id) f
         WHERE si.product_id IS NOT NULL
         GROUP BY si.product_id
    ),
    devuelto AS (
        SELECT si.product_id,
               SUM(ri.unit_price * ri.quantity * f.factor) AS ventas,
               SUM((ri.unit_price * f.factor - ri.unit_cost) * ri.quantity) AS ganancia
          FROM sale_return_items ri
          JOIN sale_returns r ON r.id = ri.return_id
          JOIN sale_items si ON si.id = ri.sale_item_id
          JOIN sales s ON s.id = si.sale_id
          CROSS JOIN LATERAL (
              SELECT CASE WHEN SUM(x.subtotal) > 0 THEN s.total / SUM(x.subtotal) ELSE 1 END AS factor
                FROM sale_items x WHERE x.sale_id = s.id) f
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
-- Los últimos 6 meses hasta el mes de hoy (o hasta `p_hasta`), en hora
-- de Colombia, o desde el primer mes con ventas si el negocio es más
-- nuevo. Ventas ya sin devoluciones y lo que ganaste después de gastos.
-- No depende del periodo elegido.
-- Antes no tenía `p_hasta`: se borra la versión vieja para que no haya
-- dos funciones con el mismo nombre
DROP FUNCTION IF EXISTS public.toul_reporte_meses(integer);

CREATE OR REPLACE FUNCTION public.toul_reporte_meses(p_meses integer DEFAULT 6, p_hasta date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store   uuid := toul_current_store_id();
    v_actual  date := date_trunc('month', COALESCE(p_hasta, (now() AT TIME ZONE 'America/Bogota')::date))::date;
    v_desde   date;
    v_primero date;
    v_rows    jsonb;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;

    v_desde := (v_actual - make_interval(months => GREATEST(COALESCE(p_meses, 6), 1) - 1))::date;

    SELECT date_trunc('month', min(created_at) AT TIME ZONE 'America/Bogota')::date
      INTO v_primero
      FROM sales WHERE store_id = v_store;

    IF v_primero IS NULL OR v_primero > v_actual THEN
        RETURN '[]'::jsonb;
    END IF;
    v_desde := GREATEST(v_desde, v_primero);

    WITH meses AS (
        SELECT generate_series(v_desde, v_actual, interval '1 month')::date AS mes
    ),
    -- Inicio y fin de cada mes en hora de Colombia, como instantes
    limites AS (
        SELECT mes,
               mes::timestamp AT TIME ZONE 'America/Bogota' AS desde,
               (mes + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota' AS hasta
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
    -- Cada suma se redondea por separado, igual que en toul_reporte: así
    -- el mes completo da exactamente lo mismo en las dos funciones
    SELECT jsonb_agg(jsonb_build_object(
               'mes',      to_char(m.mes, 'YYYY-MM-DD'),
               'ventas',   round(COALESCE(v.total, 0)) - round(COALESCE(d.total, 0)),
               'ganancia', (round(COALESCE(v.total, 0)) - round(COALESCE(d.total, 0)))
                         - (round(COALESCE(v.costo, 0)) - round(COALESCE(d.costo, 0)))
                         - round(COALESCE(g.total, 0)))
           ORDER BY m.mes)
      INTO v_rows
      FROM meses m
      LEFT JOIN ventas v ON v.mes = m.mes
      LEFT JOIN devoluciones d ON d.mes = m.mes
      LEFT JOIN gastos g ON g.mes = m.mes;

    RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte_meses(integer, date) TO authenticated;


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

    -- Abonos viejos: hasta el 14 oct de 2026 entraban como 'credit_payment'
    -- ("Abono cliente: …", con el cliente como referencia); después, como
    -- 'sale_payment' sin referencia ("Abono del cliente: …")
    IF NOT FOUND THEN
        DELETE FROM payments
         WHERE id IN (
            SELECT id FROM payments
             WHERE store_id = v_store
               AND ((type = 'sale_payment' AND reference_id IS NULL AND notes LIKE 'Abono del cliente:%')
                 OR (type = 'credit_payment' AND (reference_id IS NULL OR reference_id = v_customer) AND notes LIKE 'Abono cliente:%'))
               AND round(amount) = round(v_monto)
               AND created_at BETWEEN v_cuando - interval '2 minutes' AND v_cuando + interval '2 minutes'
             ORDER BY created_at
             LIMIT 1
         );
    END IF;

    RETURN jsonb_build_object('success', true, 'amount', round(v_monto), 'customer', v_nombre);
END;
$$;

GRANT EXECUTE ON FUNCTION toul_undo_payment(UUID) TO authenticated;


-- ─── 5. Auditoría de números (solo lectura) ──────────────────────
-- Revisa, mes por mes desde la primera venta, que los números de
-- Reportes cuadren entre sí y contra los movimientos, y que el Inicio y
-- el Excel den lo mismo. Al final revisa lo de hoy: te deben, debes,
-- inventario y que no haya negativos.
--
-- No escribe nada: STABLE no deja insertar, borrar ni cambiar datos.
--
--   Tu tienda (desde la app):   SELECT * FROM toul_auditoria();
--   Todas (en el SQL Editor):   SELECT * FROM toul_auditoria_todas() WHERE NOT ok;
CREATE OR REPLACE FUNCTION public.toul_auditoria()
RETURNS TABLE (tienda text, periodo text, chequeo text, esperado numeric, obtenido numeric, ok boolean, detalle text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    v_store   uuid := toul_current_store_id();
    v_m       jsonb;
    v_mes     date;
    v_desde   timestamptz;
    v_hasta   timestamptz;
    v_r       jsonb;
    v_total   numeric; v_contado numeric; v_credito numeric; v_costo numeric;
    v_dtotal  numeric; v_dcosto numeric; v_abonos numeric; v_gastos numeric;
    v_netas   numeric; v_costo_neto numeric; v_ganancia numeric; v_ganaste numeric;
    v_x       numeric; v_y numeric; v_n integer; v_txt text;
    v_c       numeric; v_g numeric; v_q numeric; v_suma integer;
    v_cartera jsonb;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede correr la auditoría';
    END IF;
    SELECT name INTO tienda FROM stores WHERE id = v_store;

    -- ── Mes por mes, desde el mes de la primera venta ──
    FOR v_m IN SELECT * FROM jsonb_array_elements(toul_reporte_meses(1200)) LOOP
        v_mes   := (v_m->>'mes')::date;
        periodo := to_char(v_mes, 'YYYY-MM');
        v_desde := v_mes::timestamp AT TIME ZONE 'America/Bogota';
        v_hasta := ((v_mes + interval '1 month')::timestamp AT TIME ZONE 'America/Bogota') - interval '1 millisecond';
        v_r := toul_reporte(v_desde, v_hasta);

        v_total   := (v_r->'ventas'->>'total')::numeric;
        v_contado := (v_r->'ventas'->>'contado')::numeric;
        v_credito := (v_r->'ventas'->>'credito')::numeric;
        v_costo   := (v_r->'ventas'->>'costo')::numeric;
        v_dtotal  := (v_r->'devoluciones'->>'total')::numeric;
        v_dcosto  := (v_r->'devoluciones'->>'costo')::numeric;
        v_abonos  := (v_r->>'abonos')::numeric;
        v_gastos  := (v_r->>'gastos')::numeric;
        -- Las mismas cuentas de la pantalla (lib/reports/calculos.ts → resumir)
        v_netas      := v_total - v_dtotal;
        v_costo_neto := v_costo - v_dcosto;
        v_ganancia   := v_netas - v_costo_neto;
        v_ganaste    := v_ganancia - v_gastos;

        chequeo := 'De contado + A crédito = Vendiste';
        esperado := v_total; obtenido := v_contado + v_credito; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- Lo fiado de esas ventas, según los movimientos de los clientes
        SELECT round(COALESCE(SUM(c.amount), 0)) INTO v_x
          FROM credits c JOIN sales s ON s.id = c.sale_id
         WHERE s.store_id = v_store AND c.type = 'debt' AND s.created_at >= v_desde AND s.created_at <= v_hasta;
        SELECT count(*) INTO v_n FROM sales s
         WHERE s.store_id = v_store AND s.is_credit AND s.created_at >= v_desde AND s.created_at <= v_hasta
           AND NOT EXISTS (SELECT 1 FROM credits c WHERE c.sale_id = s.id AND c.type = 'debt')
           AND s.total > (SELECT COALESCE(SUM(sp.amount), 0) FROM sale_payments sp WHERE sp.sale_id = s.id);
        chequeo := 'A crédito = lo fiado que quedó en los clientes';
        esperado := v_credito; obtenido := v_x; ok := esperado = obtenido;
        detalle := CASE WHEN v_n > 0 THEN v_n || ' venta(s) a crédito sin fiado registrado' END;
        RETURN NEXT;

        SELECT COALESCE(SUM((m->>'monto')::numeric), 0) INTO v_x FROM jsonb_array_elements(v_r->'metodos') m;
        chequeo := 'Plata que entró (de contado + abonos) = suma de la dona';
        esperado := v_contado + v_abonos; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- Hasta el 14 oct de 2026 los abonos entraban a la caja como 'credit_payment'
        SELECT round(COALESCE(SUM(amount), 0)) INTO v_x FROM payments
         WHERE store_id = v_store AND type IN ('sale_payment', 'credit_payment') AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Abonos de clientes = abonos que entraron a la caja';
        esperado := v_abonos; obtenido := v_x; ok := esperado = obtenido;
        detalle := CASE WHEN NOT ok THEN 'Movimientos muestra otro total de abonos este mes' END;
        RETURN NEXT;

        chequeo := 'Ganaste = Ganancia en ventas − Gastos (Reportes = Mes a mes)';
        esperado := v_ganaste; obtenido := (v_m->>'ganancia')::numeric; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        chequeo := 'Vendiste sin devoluciones (Reportes = Mes a mes)';
        esperado := v_netas; obtenido := (v_m->>'ventas')::numeric; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;

        -- De cada $100, con la misma regla de la pantalla: se reparte 100
        -- redondeando hacia abajo y el que perdió más decimales se lleva lo que falta
        IF v_netas > 0 THEN
            v_c := GREATEST(v_costo_neto, 0);
            v_g := GREATEST(v_gastos, 0);
            v_q := v_netas - v_c - v_g;
            IF v_q < 0 THEN v_q := 0; END IF;
            WITH partes(valor) AS (VALUES (v_c), (v_g), (v_q)),
                 exactos AS (SELECT valor * 100 / NULLIF(v_c + v_g + v_q, 0) AS x FROM partes),
                 pisos AS (SELECT floor(x) AS piso, x - floor(x) AS resto FROM exactos),
                 falta AS (SELECT 100 - SUM(piso)::integer AS n FROM pisos),
                 orden AS (SELECT piso, row_number() OVER (ORDER BY resto DESC) AS pos FROM pisos)
            SELECT SUM(piso + CASE WHEN pos <= (SELECT n FROM falta) THEN 1 ELSE 0 END)::integer INTO v_suma FROM orden;
            chequeo := 'De cada $100: mercancía + gastos + te quedó = 100';
            esperado := 100; obtenido := v_suma; ok := esperado = obtenido; detalle := NULL;
            RETURN NEXT;
        END IF;

        -- El Inicio: las mismas filas que pide app/(app)/page.tsx, sumadas
        -- y redondeadas como lo hace metricasInicio
        SELECT round(COALESCE(SUM(s.total), 0)),
               round(COALESCE(SUM((SELECT COALESCE(SUM(i.unit_cost * i.quantity), 0) FROM sale_items i WHERE i.sale_id = s.id)), 0))
          INTO v_x, v_y
          FROM sales s WHERE s.store_id = v_store AND s.created_at >= v_desde AND s.created_at <= v_hasta;
        SELECT v_x - round(COALESCE(SUM(total), 0)), v_y - round(COALESCE(SUM(cost_total), 0)) INTO v_x, v_y
          FROM sale_returns WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Inicio = Reportes: Vendiste';
        esperado := v_netas; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Inicio = Reportes: Ganancia en ventas';
        esperado := v_ganancia; obtenido := v_x - v_y; ok := esperado = obtenido;
        RETURN NEXT;
        SELECT round(COALESCE(SUM(amount), 0)) INTO v_x FROM expenses
         WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Inicio = Reportes: Gastos';
        esperado := v_gastos; obtenido := v_x; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Inicio = Reportes: Ganancia después de gastos';
        esperado := v_ganaste; obtenido := v_ganancia - v_x; ok := esperado = obtenido;
        RETURN NEXT;

        -- La hoja "Ventas" del Excel: una fila por venta con la regla de
        -- lib/reports/descargar.ts, sumada
        WITH filas AS (
            SELECT s.total,
                   (SELECT COALESCE(SUM(i.unit_cost * i.quantity), 0) FROM sale_items i WHERE i.sale_id = s.id) AS costo,
                   CASE WHEN s.is_credit
                        THEN LEAST(GREATEST((SELECT COALESCE(SUM(sp.amount), 0) FROM sale_payments sp WHERE sp.sale_id = s.id), 0), s.total)
                        ELSE s.total END AS contado
              FROM sales s WHERE s.store_id = v_store AND s.created_at >= v_desde AND s.created_at <= v_hasta
        )
        SELECT round(COALESCE(SUM(total), 0)), round(COALESCE(SUM(costo), 0)), round(COALESCE(SUM(contado), 0)), count(*)::integer
          INTO v_x, v_y, v_c, v_n FROM filas;
        chequeo := 'Excel: la columna Total suma lo mismo que Vendiste';
        esperado := v_total; obtenido := v_x; ok := esperado = obtenido; detalle := v_n || ' ventas en la hoja';
        RETURN NEXT;
        chequeo := 'Excel: la columna Costo suma lo mismo que el resumen';
        esperado := v_costo; obtenido := v_y; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Excel: De contado y A crédito suman lo mismo que el resumen';
        esperado := v_contado + v_credito; obtenido := v_c + (v_x - v_c); ok := v_c = v_contado AND (v_x - v_c) = v_credito;
        detalle := CASE WHEN NOT ok THEN 'de contado ' || v_c || ' vs ' || v_contado END;
        RETURN NEXT;
    END LOOP;

    -- ── Lo de hoy ──
    periodo := 'Hoy';
    v_cartera := toul_receivables();

    WITH saldos AS (
        SELECT customer_id, round(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)) AS saldo
          FROM credits WHERE store_id = v_store GROUP BY customer_id
    )
    SELECT COALESCE(SUM(saldo) FILTER (WHERE saldo > 0), 0), COALESCE(SUM(saldo), 0), count(*) FILTER (WHERE saldo < 0)::integer
      INTO v_x, v_y, v_n FROM saldos;
    chequeo := 'Te deben (Cuentas por cobrar) = suma de los saldos de los clientes';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;
    chequeo := 'Te deben = lo fiado − lo abonado, histórico';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_y; ok := esperado = obtenido;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' cliente(s) con saldo a favor (abonaron de más)' END;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(total_debt), 0)) INTO v_x FROM customers WHERE store_id = v_store;
    SELECT count(*)::integer INTO v_n FROM customers cu
     WHERE cu.store_id = v_store
       AND round(COALESCE(cu.total_debt, 0)) <> round(COALESCE((SELECT SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)
                                                              FROM credits c WHERE c.customer_id = cu.id), 0));
    chequeo := 'Te deben = lo guardado en cada cliente';
    esperado := round((v_cartera->>'total')::numeric); obtenido := v_x; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' cliente(s) descuadrado(s): se arreglan con "Cuadrar" en su ficha' END;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(total_debt), 0)) INTO v_x FROM providers WHERE store_id = v_store;
    SELECT round(COALESCE(SUM(remaining_amount), 0)) INTO v_y FROM provider_debts WHERE store_id = v_store AND status <> 'paid';
    chequeo := 'Debes: el Inicio (proveedores) = Proveedores (deudas por compra)';
    esperado := v_y; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(p.total - (SELECT COALESCE(SUM(pp.amount), 0) FROM purchase_payments pp WHERE pp.purchase_id = p.id)), 0))
      INTO v_x FROM purchases p
     WHERE p.store_id = v_store AND p.is_credit AND p.status IS DISTINCT FROM 'voided';
    SELECT v_x - round(COALESCE(SUM(amount), 0)) INTO v_x FROM payments WHERE store_id = v_store AND type = 'provider_payment';
    chequeo := 'Debes = lo comprado a crédito − lo pagado, histórico';
    esperado := v_y; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

    -- Plata en mercancía, contada aparte: cada presentación con su costo
    SELECT round(COALESCE(SUM(GREATEST(stock, 0) * cpp), 0)) INTO v_x FROM (
        SELECT v.stock, v.cpp FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.store_id = v_store AND v.is_active AND p.is_active
        UNION ALL
        SELECT p.stock, p.cpp FROM products p
         WHERE p.store_id = v_store AND p.is_active
           AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
    ) u;
    SELECT round(COALESCE(SUM(GREATEST(stock, 0) * cpp), 0)) INTO v_y FROM products
     WHERE store_id = v_store AND NOT is_active AND stock > 0;
    chequeo := 'Plata en mercancía = stock × costo, con presentaciones';
    esperado := round((toul_inventory_overview(1)->>'value')::numeric); obtenido := v_x; ok := esperado = obtenido;
    detalle := CASE WHEN v_y > 0 THEN 'No cuenta $' || v_y || ' de productos escondidos que todavía tienen stock' END;
    RETURN NEXT;

    SELECT count(*)::integer, string_agg(nombre, ', ') INTO v_n, v_txt FROM (
        SELECT p.name AS nombre FROM products p WHERE p.store_id = v_store AND p.stock < 0
        UNION ALL
        SELECT p.name || ' · ' || v.name FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.store_id = v_store AND v.stock < 0
        LIMIT 10
    ) x;
    chequeo := 'Ningún stock negativo';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := v_txt;
    RETURN NEXT;

    SELECT count(*)::integer, string_agg(nombre, ', ') INTO v_n, v_txt FROM (
        SELECT cu.name AS nombre FROM customers cu
         WHERE cu.store_id = v_store
           AND COALESCE((SELECT SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END) FROM credits c WHERE c.customer_id = cu.id), 0) < -0.5
        LIMIT 10
    ) x;
    chequeo := 'Ningún cliente con saldo negativo';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := v_txt;
    RETURN NEXT;

    SELECT count(*)::integer INTO v_n FROM (
        SELECT 1 FROM provider_debts WHERE store_id = v_store AND remaining_amount < 0
        UNION ALL
        SELECT 1 FROM providers WHERE store_id = v_store AND total_debt < 0
    ) x;
    chequeo := 'Ninguna deuda negativa con proveedores';
    esperado := 0; obtenido := v_n; ok := v_n = 0; detalle := NULL;
    RETURN NEXT;

    -- Algunas funciones viejas pasan la hora a Colombia restando 5 horas:
    -- eso solo da bien si la base trabaja en UTC
    chequeo := 'La base de datos trabaja en hora UTC';
    esperado := NULL; obtenido := NULL;
    ok := current_setting('TimeZone') IN ('UTC', 'Etc/UTC', 'GMT', 'Etc/GMT', 'UCT', 'Etc/UCT', 'Universal', 'Zulu');
    detalle := current_setting('TimeZone');
    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_auditoria() TO authenticated;

-- Todas las tiendas, una por una, como si entrara su dueño. Solo para el
-- SQL Editor: nadie desde la app puede ver las tiendas de otros
CREATE OR REPLACE FUNCTION public.toul_auditoria_todas()
RETURNS TABLE (tienda text, periodo text, chequeo text, esperado numeric, obtenido numeric, ok boolean, detalle text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_s     record;
    v_sub   text := current_setting('request.jwt.claim.sub', true);
    v_jwt   text := current_setting('request.jwt.claims', true);
BEGIN
    -- La primera tienda de cada dueño: la misma que ve en la app
    FOR v_s IN SELECT DISTINCT ON (owner_id) id, owner_id, name FROM stores WHERE owner_id IS NOT NULL ORDER BY owner_id, created_at LOOP
        PERFORM set_config('request.jwt.claim.sub', v_s.owner_id::text, true);
        PERFORM set_config('request.jwt.claims', json_build_object('sub', v_s.owner_id, 'role', 'authenticated')::text, true);
        BEGIN
            RETURN QUERY SELECT * FROM toul_auditoria();
        EXCEPTION WHEN OTHERS THEN
            tienda := v_s.name; periodo := '—'; chequeo := 'La auditoría no pudo correr en esta tienda';
            esperado := NULL; obtenido := NULL; ok := false; detalle := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_sub, ''), true);
    PERFORM set_config('request.jwt.claims', COALESCE(v_jwt, ''), true);
END;
$$;

REVOKE ALL ON FUNCTION public.toul_auditoria_todas() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
