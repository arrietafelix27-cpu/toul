-- =================================================================
-- TOUL v21 — Enterarse cuando algo se rompe
-- =================================================================
-- Hoy, si la app falla para un usuario, nadie se entera. Él ve una
-- pantalla rara, cierra, y sigue con su día. Con usuarios pagando
-- eso es volar a ciegas.
--
-- Esto guarda los errores en tu propia base. No hay que crear
-- cuenta en ningún lado ni pagar nada: los ves en Supabase.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

CREATE TABLE IF NOT EXISTS app_errors (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,
    user_id     UUID,
    message     TEXT NOT NULL,
    stack       TEXT,
    url         TEXT,
    user_agent  TEXT,
    extra       JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created ON app_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_errors_store   ON app_errors(store_id, created_at DESC);

ALTER TABLE app_errors ENABLE ROW LEVEL SECURITY;

-- Cada quien ve los errores de su tienda
DROP POLICY IF EXISTS "store_isolation_app_errors" ON app_errors;
CREATE POLICY "store_isolation_app_errors"
    ON app_errors FOR SELECT USING (
        store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    );

-- Escribir: cualquiera que haya entrado. Un error se reporta aunque
-- el fallo sea justo que no se pudo resolver la tienda.
DROP POLICY IF EXISTS "app_errors_insert" ON app_errors;
CREATE POLICY "app_errors_insert"
    ON app_errors FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Quién y de qué tienda lo pone la base, no la pantalla
CREATE OR REPLACE FUNCTION toul_error_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
    IF NEW.store_id IS NULL THEN
        SELECT id INTO NEW.store_id FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    END IF;
    -- Un stack gigante no sirve de nada y llena la tabla
    NEW.message := left(NEW.message, 500);
    NEW.stack   := left(COALESCE(NEW.stack, ''), 4000);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_error_context ON app_errors;
CREATE TRIGGER trg_error_context
    BEFORE INSERT ON app_errors
    FOR EACH ROW EXECUTE FUNCTION toul_error_context();

-- Los errores viejos se borran solos: con 90 días sobra para
-- entender qué pasó, y la tabla no crece para siempre
CREATE OR REPLACE FUNCTION toul_prune_errors()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n INTEGER;
BEGIN
    DELETE FROM app_errors WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END;
$$;

-- Lo que pasó últimamente, en una sola consulta
CREATE OR REPLACE FUNCTION toul_recent_errors(p_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_rows  JSONB;
BEGIN
    SELECT id INTO v_store FROM stores WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1;
    IF v_store IS NULL THEN RETURN jsonb_build_object('total', 0, 'errores', '[]'::jsonb); END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', id, 'mensaje', message, 'url', url,
               'cuando', created_at, 'veces', veces
           ) ORDER BY ultimo DESC), '[]'::jsonb)
      INTO v_rows
      FROM (
        -- Postgres no sabe sacar el mínimo de un uuid: se toma el id
        -- del más reciente, que además es el que uno querría mirar
        SELECT (array_agg(id ORDER BY created_at DESC))[1] AS id,
               message,
               (array_agg(url ORDER BY created_at DESC))[1] AS url,
               max(created_at) AS created_at,
               count(*) AS veces, max(created_at) AS ultimo
          FROM app_errors
         WHERE store_id = v_store AND created_at > now() - interval '30 days'
         GROUP BY message
         ORDER BY max(created_at) DESC
         LIMIT GREATEST(COALESCE(p_limit, 50), 1)
      ) t;

    RETURN jsonb_build_object(
        'total', (SELECT count(*) FROM app_errors WHERE store_id = v_store AND created_at > now() - interval '30 days'),
        'errores', v_rows
    );
END;
$$;

GRANT EXECUTE ON FUNCTION toul_recent_errors(INTEGER) TO authenticated;
