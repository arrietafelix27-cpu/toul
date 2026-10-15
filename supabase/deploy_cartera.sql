-- =================================================================
-- TOUL v17 — Cuentas por cobrar
-- =================================================================
-- Clientes se parte en dos: quién es la gente (Mis clientes) y
-- dónde está la plata (Cuentas por cobrar).
--
-- Lo que faltaba para que la cartera fuera exacta:
--
--   1. El plazo de un fiado se guardaba como texto dentro de la
--      nota ("Vence: 2026-10-30"). Ahora es una fecha de verdad,
--      así se puede saber qué está vencido y qué no.
--   2. No había dónde anotar que le escribiste a alguien ni que
--      quedó de pagar un día. Sin eso le escribes dos veces al
--      mismo y nunca al que sí tocaba.
--   3. Los abonos no estaban amarrados a un fiado puntual. Se
--      aplican al más viejo primero, que es como se cobra en la
--      vida real, y de ahí sale el plazo que de verdad corre.
--
-- Colombia no tiene horario de verano: el día se calcula como
-- UTC−5 fijo, sin depender de la zona del servidor.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

-- ── 1. El plazo pasa a ser una fecha ─────────────────────────────
ALTER TABLE credits ADD COLUMN IF NOT EXISTS due_date DATE;

-- Las deudas que ya existen traen el plazo escondido en la nota
UPDATE credits
   SET due_date = (regexp_match(notes, 'Vence:\s*(\d{4}-\d{2}-\d{2})'))[1]::date
 WHERE due_date IS NULL
   AND notes ~ 'Vence:\s*\d{4}-\d{2}-\d{2}';

-- Y las que entren de aquí en adelante lo hacen solas, sin tocar
-- la venta: process_sale sigue escribiendo la nota como siempre
CREATE OR REPLACE FUNCTION toul_credits_due_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.due_date IS NULL AND NEW.notes ~ 'Vence:\s*\d{4}-\d{2}-\d{2}' THEN
        NEW.due_date := (regexp_match(NEW.notes, 'Vence:\s*(\d{4}-\d{2}-\d{2})'))[1]::date;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credits_due_date ON credits;
CREATE TRIGGER trg_credits_due_date
    BEFORE INSERT OR UPDATE OF notes ON credits
    FOR EACH ROW EXECUTE FUNCTION toul_credits_due_date();

-- Cuánto dura un fiado al que no le pusieron plazo
ALTER TABLE stores ADD COLUMN IF NOT EXISTS credit_default_days INTEGER NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_credits_due_date ON credits(store_id, due_date);

-- ── 2. Lo que le has dicho y lo que quedó de pagar ───────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('contacto', 'compromiso')),
    channel         TEXT,
    promised_date   DATE,
    promised_amount NUMERIC(12,2),
    notes           TEXT,
    settled_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer
    ON customer_contacts(customer_id, created_at DESC);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_customer_contacts" ON customer_contacts;
CREATE POLICY "store_isolation_customer_contacts"
    ON customer_contacts FOR ALL USING (
        store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    );

-- La tienda se deduce del cliente: la pantalla no tiene que mandarla
CREATE OR REPLACE FUNCTION toul_contact_store()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.store_id IS NULL THEN
        SELECT store_id INTO NEW.store_id FROM customers WHERE id = NEW.customer_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_store ON customer_contacts;
CREATE TRIGGER trg_contact_store
    BEFORE INSERT ON customer_contacts
    FOR EACH ROW EXECUTE FUNCTION toul_contact_store();

-- Un compromiso nuevo reemplaza al anterior que siga abierto
CREATE OR REPLACE FUNCTION toul_promise_replaces_old()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.kind = 'compromiso' THEN
        UPDATE customer_contacts
           SET settled_at = now()
         WHERE customer_id = NEW.customer_id
           AND kind = 'compromiso'
           AND settled_at IS NULL
           AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promise_replaces_old ON customer_contacts;
CREATE TRIGGER trg_promise_replaces_old
    AFTER INSERT ON customer_contacts
    FOR EACH ROW EXECUTE FUNCTION toul_promise_replaces_old();

-- Cuando el cliente queda en cero, el compromiso ya se cumplió
CREATE OR REPLACE FUNCTION toul_promise_settled_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_saldo NUMERIC;
BEGIN
    IF NEW.type = 'debt' THEN RETURN NEW; END IF;

    SELECT round(COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END), 0))
      INTO v_saldo
      FROM credits WHERE customer_id = NEW.customer_id;

    IF v_saldo <= 0 THEN
        UPDATE customer_contacts
           SET settled_at = now()
         WHERE customer_id = NEW.customer_id
           AND kind = 'compromiso'
           AND settled_at IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promise_settled ON credits;
CREATE TRIGGER trg_promise_settled
    AFTER INSERT ON credits
    FOR EACH ROW EXECUTE FUNCTION toul_promise_settled_on_payment();

-- ── 3. La cartera ────────────────────────────────────────────────
-- Cada cliente con saldo cae en uno de tres grupos:
--
--   hoy    → le toca hoy. Se le venció y no le has escrito, o
--            quedó de pagar hoy, o prometió y no cumplió.
--   espera → ya le escribiste hace poco, o quedó de pagar un día
--            que todavía no llega. No está olvidado.
--   plazo  → todavía está dentro del plazo. No se le cobra.
--
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
    pagado AS (
        SELECT customer_id, SUM(amount) AS monto
          FROM credits
         WHERE store_id = v_store AND type <> 'debt'
         GROUP BY customer_id
    ),
    fiados AS (
        SELECT c.customer_id, c.id, c.created_at,
               COALESCE(c.due_date, ((c.created_at - interval '5 hours')::date + v_days)) AS vence,
               SUM(c.amount) OVER (PARTITION BY c.customer_id ORDER BY c.created_at, c.id) AS acumulado
          FROM credits c
         WHERE c.store_id = v_store AND c.type = 'debt'
    ),
    -- El primer fiado que los abonos no alcanzan a cubrir: ese es el
    -- que sigue abierto, y su plazo es el que de verdad corre
    abierto AS (
        SELECT DISTINCT ON (f.customer_id)
               f.customer_id, f.vence, f.created_at
          FROM fiados f
          LEFT JOIN pagado p ON p.customer_id = f.customer_id
         WHERE f.acumulado > COALESCE(p.monto, 0)
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
    cuantos AS (
        SELECT customer_id, count(*) AS n
          FROM credits
         WHERE store_id = v_store AND type = 'debt'
         GROUP BY customer_id
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
    SELECT COALESCE(SUM(CASE WHEN type = 'debt' THEN amount ELSE 0 END), 0)
      INTO v_fiado
      FROM credits
     WHERE store_id = v_store AND (created_at - interval '5 hours')::date >= v_mes;

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

-- ── 4. Mis clientes ─────────────────────────────────────────────
-- La lista deja de ser nombre + deuda. Lo que importa de un
-- cliente es cuánto te ha comprado, cuántas veces y hace cuánto.
--
--   recurrente → te ha comprado 3 veces o más y sigue viniendo
--   inactivo   → llevaba comprando y lleva más de N días sin volver
--   nuevo      → entró hace menos de 30 días
--
CREATE OR REPLACE FUNCTION toul_customers_overview(p_inactive_days INTEGER DEFAULT 60)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_hoy   DATE := (now() - interval '5 hours')::date;
    v_mes   DATE := date_trunc('month', (now() - interval '5 hours'))::date;
    v_dias  INTEGER := GREATEST(COALESCE(p_inactive_days, 60), 1);
    v_rows  JSONB;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    IF v_store IS NULL THEN
        RETURN jsonb_build_object('clientes', '[]'::jsonb, 'total', 0,
            'compraronMes', 0, 'inactivos', 0, 'recurrentes', 0, 'nuevos', 0);
    END IF;

    WITH compras AS (
        SELECT customer_id,
               count(*)                AS n,
               round(SUM(total))       AS gastado,
               MAX(created_at)         AS ultima,
               MIN(created_at)         AS primera
          FROM sales
         WHERE store_id = v_store AND customer_id IS NOT NULL
         GROUP BY customer_id
    ),
    saldo AS (
        SELECT customer_id,
               round(SUM(CASE WHEN type = 'debt' THEN amount ELSE -amount END)) AS balance
          FROM credits
         WHERE store_id = v_store
         GROUP BY customer_id
    ),
    base AS (
        SELECT cu.id, cu.name, cu.phone, cu.notes, cu.created_at,
               COALESCE(c.n, 0)                                      AS compras,
               COALESCE(c.gastado, 0)                                AS gastado,
               c.ultima,
               (v_hoy - (c.ultima - interval '5 hours')::date)        AS dias,
               (v_hoy - (cu.created_at - interval '5 hours')::date)   AS antiguedad,
               GREATEST(COALESCE(s.balance, 0), 0)                    AS saldo,
               round(COALESCE(cu.total_debt, 0))                       AS guardado
          FROM customers cu
          LEFT JOIN compras c ON c.customer_id = cu.id
          LEFT JOIN saldo s   ON s.customer_id = cu.id
         WHERE cu.store_id = v_store
           AND COALESCE(cu.is_active, true) = true
    ),
    etiquetado AS (
        SELECT b.*,
            CASE
                WHEN b.compras = 0                            THEN 'sincompras'
                WHEN b.dias > v_dias                          THEN 'inactivo'
                WHEN b.compras >= 3                           THEN 'recurrente'
                WHEN b.antiguedad <= 30                       THEN 'nuevo'
                ELSE ''
            END AS etiqueta
        FROM base b
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id',       id,
            'nombre',   name,
            'telefono', phone,
            'nota',     notes,
            'compras',  compras,
            'gastado',  gastado,
            'ticket',   CASE WHEN compras > 0 THEN round(gastado / compras) ELSE 0 END,
            'ultima',   ultima,
            'dias',     dias,
            'saldo',    saldo,
            'guardado', guardado,
            'etiqueta', etiqueta
        ) ORDER BY ultima DESC NULLS LAST, name), '[]'::jsonb)
      INTO v_rows
      FROM etiquetado;

    RETURN jsonb_build_object(
        'clientes',     v_rows,
        'total',        jsonb_array_length(v_rows),
        'inactivoDias', v_dias,
        'compraronMes', (SELECT count(DISTINCT customer_id) FROM sales
                          WHERE store_id = v_store AND customer_id IS NOT NULL
                            AND (created_at - interval '5 hours')::date >= v_mes),
        'recurrentes',  (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'etiqueta' = 'recurrente'),
        'inactivos',    (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'etiqueta' = 'inactivo'),
        'nuevos',       (SELECT count(*) FROM jsonb_array_elements(v_rows) e WHERE e->>'etiqueta' = 'nuevo')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION toul_customers_overview(INTEGER) TO authenticated;

-- ── 5. La ficha ──────────────────────────────────────────────────
-- Todo lo de un cliente en una sola ida a la base: cuánto ha
-- comprado, qué compra siempre, y qué le has dicho.
CREATE OR REPLACE FUNCTION toul_customer_profile(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_hoy   DATE := (now() - interval '5 hours')::date;
    v_days  INTEGER;
    v_res   JSONB;
BEGIN
    SELECT store_id INTO v_store FROM customers WHERE id = p_customer_id;
    IF v_store IS NULL THEN RETURN NULL; END IF;

    SELECT GREATEST(COALESCE(credit_default_days, 30), 0) INTO v_days
      FROM stores WHERE id = v_store;

    SELECT jsonb_build_object(
        'compras',  COALESCE(c.n, 0),
        'gastado',  COALESCE(c.gastado, 0),
        'ticket',   CASE WHEN COALESCE(c.n, 0) > 0 THEN round(c.gastado / c.n) ELSE 0 END,
        'primera',  c.primera,
        'ultima',   c.ultima,
        'dias',     (v_hoy - (c.ultima - interval '5 hours')::date),
        'favoritos', COALESCE((
            SELECT jsonb_agg(f ORDER BY (f->>'unidades')::int DESC)
              FROM (
                SELECT jsonb_build_object(
                           'nombre',   p.name,
                           'unidades', SUM(si.quantity),
                           'monto',    round(SUM(si.subtotal))) AS f
                  FROM sale_items si
                  JOIN sales s    ON s.id = si.sale_id
                  JOIN products p ON p.id = si.product_id
                 WHERE s.customer_id = p_customer_id
                 GROUP BY p.id, p.name
                 ORDER BY SUM(si.quantity) DESC
                 LIMIT 3
              ) t
        ), '[]'::jsonb),
        'contactos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'id',       cc.id,
                       'tipo',     cc.kind,
                       'canal',    cc.channel,
                       'promesa',  cc.promised_date,
                       'monto',    cc.promised_amount,
                       'nota',     cc.notes,
                       'cerrado',  cc.settled_at,
                       'cuando',   cc.created_at) ORDER BY cc.created_at DESC)
              FROM customer_contacts cc
             WHERE cc.customer_id = p_customer_id
        ), '[]'::jsonb),
        'plazoDias', v_days
    )
      INTO v_res
      FROM (SELECT 1) dummy
      LEFT JOIN (
        SELECT count(*) AS n, round(SUM(total)) AS gastado,
               MAX(created_at) AS ultima, MIN(created_at) AS primera
          FROM sales WHERE customer_id = p_customer_id
      ) c ON true;

    RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION toul_customer_profile(UUID) TO authenticated;
