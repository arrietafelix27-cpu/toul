-- =================================================================
-- TOUL — Cuentas por cobrar sin fiados anulados ni devueltos
-- =================================================================
-- Al anular una venta fiada, la venta se borra y la deuda queda
-- cancelada con un movimiento de "Anulación". El saldo de cada
-- cliente ya daba bien, pero Cuentas por cobrar seguía contando
-- ese fiado en otras cosas:
--
--   1. "Fiaste este mes" lo sumaba. Ahora un fiado anulado no
--      cuenta, y lo que el cliente devolvió de un fiado se resta
--      (si te devolvieron el producto, ese fiado no se quedó).
--   2. "Fiados sin pagar" contaba todos los fiados del cliente,
--      también los anulados y los ya pagados. Ahora cuenta solo
--      los que siguen abiertos.
--   3. Para saber cuál fiado "sigue abierto" (de ahí sale la fecha
--      en que vence), la anulación contaba como si el cliente
--      hubiera abonado. Ahora no: la anulación solo cancela su
--      fiado, y una devolución baja el fiado de esa misma venta.
--
-- Un fiado anulado es el que perdió su venta (anular la borra).
-- No cambia ningún saldo ni el total por cobrar.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

CREATE OR REPLACE FUNCTION toul_receivables()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store  UUID;
    v_days   INTEGER;
    v_hoy    DATE := (now() - interval '5 hours')::date;
    v_mes    DATE := date_trunc('month', (now() - interval '5 hours'))::date;
    v_rows   JSONB;
    v_total  NUMERIC := 0;
    v_vieja  INTEGER := 0;
    v_fiado  NUMERIC := 0;
    v_recup  NUMERIC := 0;
    v_hoy_n  INTEGER := 0;
BEGIN
    SELECT id, GREATEST(COALESCE(credit_default_days, 30), 0)
      INTO v_store, v_days
      FROM stores WHERE owner_id = auth.uid()
     ORDER BY created_at LIMIT 1;

    IF v_store IS NULL THEN
        RETURN jsonb_build_object('total', 0, 'clientes', '[]'::jsonb,
            'fiadoMes', 0, 'recuperadoMes', 0, 'diasMasVieja', 0, 'hoy', 0);
    END IF;

    WITH saldo AS (
        SELECT customer_id,
               round(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)) AS balance
          FROM credits
         WHERE store_id = v_store
         GROUP BY customer_id
        HAVING round(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)) > 0
    ),
    -- Los abonos. La anulación no es un abono (solo cancela su fiado)
    -- y la devolución tampoco (baja el fiado de su misma venta)
    pagado AS (
        SELECT customer_id, SUM(amount) AS monto
          FROM credits
         WHERE store_id = v_store AND type NOT IN ('debt', 'void', 'return')
         GROUP BY customer_id
    ),
    devuelto AS (
        SELECT sale_id, SUM(amount) AS monto
          FROM credits
         WHERE store_id = v_store AND type = 'return' AND sale_id IS NOT NULL
         GROUP BY sale_id
    ),
    -- Cada fiado que no se anuló (sin venta = anulado), menos lo que se devolvió de él
    fiados AS (
        SELECT c.customer_id, c.id, c.created_at,
               COALESCE(c.due_date, ((c.created_at - interval '5 hours')::date + v_days)) AS vence,
               GREATEST(c.amount - COALESCE(d.monto, 0), 0) AS monto,
               SUM(GREATEST(c.amount - COALESCE(d.monto, 0), 0))
                   OVER (PARTITION BY c.customer_id ORDER BY c.created_at, c.id) AS acumulado
          FROM credits c
          LEFT JOIN devuelto d ON d.sale_id = c.sale_id
         WHERE c.store_id = v_store AND c.type = 'debt' AND c.sale_id IS NOT NULL
    ),
    -- El primer fiado que los abonos no alcanzan a cubrir: ese es el
    -- que sigue abierto, y su plazo es el que de verdad corre
    abierto AS (
        SELECT DISTINCT ON (f.customer_id)
               f.customer_id, f.vence, f.created_at
          FROM fiados f
          LEFT JOIN pagado p ON p.customer_id = f.customer_id
         WHERE f.monto > 0 AND f.acumulado > COALESCE(p.monto, 0)
         ORDER BY f.customer_id, f.acumulado
    ),
    contacto AS (
        SELECT customer_id, max(created_at) AS cuando
          FROM customer_contacts
         WHERE store_id = v_store AND kind = 'contacto'
         GROUP BY customer_id
    ),
    promesa AS (
        SELECT DISTINCT ON (customer_id)
               customer_id, promised_date, promised_amount
          FROM customer_contacts
         WHERE store_id = v_store AND kind = 'compromiso' AND settled_at IS NULL
         ORDER BY customer_id, created_at DESC
    ),
    -- "Fiados sin pagar": los que los abonos todavía no alcanzan a cubrir
    cuantos AS (
        SELECT f.customer_id, count(*) AS n
          FROM fiados f
          LEFT JOIN pagado p ON p.customer_id = f.customer_id
         WHERE f.monto > 0 AND f.acumulado > COALESCE(p.monto, 0)
         GROUP BY f.customer_id
    ),
    base AS (
        SELECT cu.id, cu.name, cu.phone, s.balance,
               ab.vence,
               (v_hoy - ab.vence)                                   AS dias_vencido,
               (v_hoy - (ab.created_at - interval '5 hours')::date)  AS dias_fiado,
               co.cuando                                            AS ultimo_contacto,
               (v_hoy - (co.cuando - interval '5 hours')::date)      AS dias_contacto,
               pr.promised_date, pr.promised_amount,
               COALESCE(q.n, 0)                                     AS fiados
          FROM saldo s
          JOIN customers cu        ON cu.id = s.customer_id
          LEFT JOIN abierto ab     ON ab.customer_id = s.customer_id
          LEFT JOIN contacto co    ON co.customer_id = s.customer_id
          LEFT JOIN promesa pr     ON pr.customer_id = s.customer_id
          LEFT JOIN cuantos q      ON q.customer_id = s.customer_id
    ),
    clasificado AS (
        SELECT b.*,
            CASE
                WHEN b.promised_date IS NOT NULL AND b.promised_date >  v_hoy THEN 'espera'
                WHEN b.promised_date IS NOT NULL                              THEN 'hoy'
                WHEN COALESCE(b.dias_vencido, 0) >= 0
                     AND COALESCE(b.dias_contacto, 999) <= 2                  THEN 'espera'
                WHEN COALESCE(b.dias_vencido, 0) >= 0                         THEN 'hoy'
                ELSE 'plazo'
            END AS grupo,
            CASE
                WHEN b.promised_date >  v_hoy                                 THEN 'promesa'
                WHEN b.promised_date =  v_hoy                                 THEN 'promesa_hoy'
                WHEN b.promised_date <  v_hoy                                 THEN 'promesa_rota'
                WHEN COALESCE(b.dias_vencido, 0) > 0
                     AND COALESCE(b.dias_contacto, 999) <= 2                  THEN 'escrito'
                WHEN COALESCE(b.dias_vencido, 0) > 0                          THEN 'vencida'
                WHEN COALESCE(b.dias_vencido, 0) = 0                          THEN 'vence_hoy'
                ELSE 'dentro'
            END AS motivo
        FROM base b
    )
    SELECT
        COALESCE(jsonb_agg(jsonb_build_object(
            'id',             id,
            'nombre',         name,
            'telefono',       phone,
            'saldo',          balance,
            'vence',          vence,
            'diasVencido',    dias_vencido,
            'diasFiado',      dias_fiado,
            'fiados',         fiados,
            'ultimoContacto', ultimo_contacto,
            'diasContacto',   dias_contacto,
            'promesa',        promised_date,
            'promesaMonto',   promised_amount,
            'grupo',          grupo,
            'motivo',         motivo
        ) ORDER BY CASE grupo WHEN 'hoy' THEN 0 WHEN 'espera' THEN 1 ELSE 2 END,
                   COALESCE(dias_vencido, 0) DESC, balance DESC), '[]'::jsonb),
        COALESCE(SUM(balance), 0),
        COALESCE(MAX(dias_fiado), 0),
        COALESCE(SUM(CASE WHEN grupo = 'hoy' THEN 1 ELSE 0 END), 0)
      INTO v_rows, v_total, v_vieja, v_hoy_n
      FROM clasificado;

    -- ¿Estás fiando más de lo que recuperas? Es la única cuenta
    -- que dice si la cartera te está ayudando o descapitalizando
    -- Un fiado anulado no cuenta (es como si no se hubiera fiado) y lo
    -- que se devolvió de un fiado se le resta
    SELECT COALESCE(SUM(GREATEST(c.amount - COALESCE(d.monto, 0), 0)), 0)
      INTO v_fiado
      FROM credits c
      LEFT JOIN (SELECT sale_id, SUM(amount) AS monto
                   FROM credits
                  WHERE store_id = v_store AND type = 'return' AND sale_id IS NOT NULL
                  GROUP BY sale_id) d ON d.sale_id = c.sale_id
     WHERE c.store_id = v_store AND c.type = 'debt'
       AND c.sale_id IS NOT NULL
       AND (c.created_at - interval '5 hours')::date >= v_mes;

    SELECT COALESCE(SUM(amount), 0)
      INTO v_recup
      FROM credits
     WHERE store_id = v_store AND type = 'payment'
       AND (created_at - interval '5 hours')::date >= v_mes;

    RETURN jsonb_build_object(
        'total',         round(v_total),
        'clientes',      v_rows,
        'hoy',           v_hoy_n,
        'diasMasVieja',  v_vieja,
        'fiadoMes',      round(v_fiado),
        'recuperadoMes', round(v_recup)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION toul_receivables() TO authenticated;
