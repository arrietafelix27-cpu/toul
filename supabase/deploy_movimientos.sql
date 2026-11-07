-- =================================================================
-- TOUL — Movimientos: Gasto, Metí plata y Saqué plata
-- =================================================================
-- Todo vive en un solo libro de plata (payments): ventas, abonos,
-- gastos, compras, pagos a proveedor y ahora "Metí plata" y "Saqué
-- plata". El historial, los turnos y Reportes leen de ahí.
--
--   Gasto        resta de lo que ganaste
--   Metí plata   el dueño mete plata suya al negocio  (owner_in)
--   Saqué plata  el dueño saca plata para él          (owner_out)
--
-- Metí y Saqué plata NUNCA cambian "Ganaste", ni el margen, ni "Plata
-- que entró" ni "Plata que salió". Se ven aparte, en Reportes, en
-- "Entre tú y tu negocio".
--
-- Reglas:
--   · Sin saldos por cuenta y sin traslados nuevos.
--   · La cuenta se guarda por su número (method_id). El nombre es solo
--     una copia: renombrar una cuenta no cambia el historial.
--   · Cada escritura es todo o nada (una sola transacción).
--   · "Plata mía" en un gasto, compra o pago a proveedor crea su
--     "Metí plata" atado, por el mismo monto. Lo hace la base.
--   · Con un turno abierto, lo que entra o sale en efectivo cuenta en
--     el efectivo esperado. Un turno cerrado no cambia: de lo suyo solo
--     se puede cambiar la nota o la categoría.
--   · El vendedor solo anota gastos, con el permiso "Registrar gastos".
--
-- Pegar en el SQL Editor de Supabase. Se puede correr varias veces.
-- =================================================================


-- =================================================================
-- 1. Columnas nuevas del libro
-- =================================================================
-- La cuenta, por su número (el nombre queda solo como copia)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method_id uuid REFERENCES payment_methods(id);
-- "Plata mía": lo pagó el dueño de su bolsillo, no salió de una cuenta
ALTER TABLE payments ADD COLUMN IF NOT EXISTS own_money boolean NOT NULL DEFAULT false;
-- El "Metí plata" que nace de una compra, gasto o pago con plata mía.
-- Si se borra lo que pagó, se borra con él
ALTER TABLE payments ADD COLUMN IF NOT EXISTS linked_payment_id uuid REFERENCES payments(id) ON DELETE CASCADE;
-- Quién lo anotó
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_name text;
-- De qué registro viejo de capital propio viene (para no copiarlo dos veces)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS legacy_capital_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS payments_legacy_capital_uq ON payments(legacy_capital_id) WHERE legacy_capital_id IS NOT NULL;
-- Un solo "Metí plata" por cada cosa pagada con plata mía
CREATE UNIQUE INDEX IF NOT EXISTS payments_linked_uq ON payments(linked_payment_id) WHERE linked_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_method_id ON payments(method_id);
CREATE INDEX IF NOT EXISTS idx_payments_store_type_fecha ON payments(store_id, type, created_at);


-- =================================================================
-- 2. Reglas que la base no deja romper
-- =================================================================
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_reglas_dueno;
ALTER TABLE payments ADD CONSTRAINT payments_reglas_dueno CHECK (
    -- Metí y Saqué plata: monto positivo
    (type NOT IN ('owner_in', 'owner_out') OR amount > 0)
    -- Metí o Saqué plata de una cuenta: dice cuál
    AND (type NOT IN ('owner_in', 'owner_out') OR own_money OR method_id IS NOT NULL)
    -- Plata mía: solo en gastos, compras, pagos a proveedor y su Metí plata; sin cuenta y positiva
    AND (NOT own_money OR (type IN ('expense', 'purchase', 'provider_payment', 'owner_in')
                           AND method_id IS NULL AND amount > 0))
    -- Un Metí plata con plata mía siempre está atado a lo que pagó (o viene del capital viejo)
    AND (type <> 'owner_in' OR NOT own_money OR linked_payment_id IS NOT NULL OR legacy_capital_id IS NOT NULL)
    -- Solo un Metí plata con plata mía puede ir atado a otro movimiento
    AND (linked_payment_id IS NULL OR (type = 'owner_in' AND own_money))
);

-- Ningún tipo desconocido (antes todo lo que no fuera salida se contaba
-- como entrada) y ningún traslado nuevo. Solo frena lo nuevo: los
-- traslados de antes se quedan como están y se ven como "Traslado"
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_tipo_conocido;

CREATE OR REPLACE FUNCTION public.toul_payment_tipo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.type NOT IN ('sale', 'sale_payment', 'sale_refund', 'expense', 'purchase', 'provider_payment',
                        'owner_in', 'owner_out',
                        'credit_payment') THEN   -- abonos de antes del 14 oct
        RAISE EXCEPTION 'Ese tipo de movimiento ya no existe: anota un gasto, Metí plata o Saqué plata';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_tipo ON payments;
CREATE TRIGGER trg_payments_tipo BEFORE INSERT OR UPDATE OF type ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_payment_tipo();


-- =================================================================
-- 3. Ayudantes
-- =================================================================
-- ¿Esta plata es efectivo? Por la cuenta (su marca de efectivo) o, en lo
-- de antes, por el nombre que quedó anotado. Es la misma regla que ya
-- usaban los turnos; el nombre anotado no cambia si se renombra la cuenta
CREATE OR REPLACE FUNCTION public.toul_es_efectivo(p_store uuid, p_method_id uuid, p_method text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT lower(COALESCE(p_method, '')) LIKE '%efectivo%'
        OR CASE WHEN p_method_id IS NOT NULL
                THEN COALESCE((SELECT pm.is_cash FROM payment_methods pm WHERE pm.id = p_method_id AND pm.store_id = p_store), false)
                ELSE EXISTS (SELECT 1 FROM payment_methods pm
                              WHERE pm.store_id = p_store AND lower(pm.name) = lower(p_method) AND pm.is_cash)
           END
$$;

-- ¿Cambió de verdad la cuenta? Ponerle el número a un movimiento viejo
-- que ya tenía ese mismo nombre no es un cambio
CREATE OR REPLACE FUNCTION public.toul_cambio_cuenta(p_old payments, p_new payments)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
    SELECT p_new.own_money IS DISTINCT FROM p_old.own_money
        OR (p_new.method_id IS DISTINCT FROM p_old.method_id
            AND NOT (p_old.method_id IS NULL AND lower(trim(p_new.method)) = lower(trim(p_old.method))))
$$;

-- La cuenta para un movimiento nuevo: tiene que ser de la tienda y estar
-- activa (una cuenta quitada sigue en el historial, pero ya no se usa)
CREATE OR REPLACE FUNCTION public.toul_cuenta_para_anotar(p_store uuid, p_method_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_nombre text;
    v_activa boolean;
BEGIN
    SELECT name, is_active INTO v_nombre, v_activa
      FROM payment_methods WHERE id = p_method_id AND store_id = p_store;
    IF v_nombre IS NULL THEN RAISE EXCEPTION 'Esa cuenta no es de tu negocio'; END IF;
    IF NOT v_activa THEN RAISE EXCEPTION 'Esa cuenta ya no se usa: elige otra'; END IF;
    RETURN v_nombre;
END;
$$;


-- =================================================================
-- 4. La cuenta: por número, y de la misma tienda
-- =================================================================
-- Gastos, compras, pagos, Metí y Saqué plata llegan con el número.
-- Ventas, abonos y devoluciones llegan con el nombre (no se tocan sus
-- funciones): aquí se les busca el número al guardarlas.
CREATE OR REPLACE FUNCTION public.toul_payment_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.own_money THEN
        NEW.method_id := NULL;
        NEW.method := 'Plata mía';
    ELSIF NEW.method_id IS NOT NULL THEN
        SELECT name INTO NEW.method FROM payment_methods
         WHERE id = NEW.method_id AND store_id = NEW.store_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Esa cuenta no es de tu negocio'; END IF;
    ELSIF NULLIF(trim(COALESCE(NEW.method, '')), '') IS NOT NULL THEN
        SELECT id INTO NEW.method_id FROM payment_methods
         WHERE store_id = NEW.store_id AND lower(trim(name)) = lower(trim(NEW.method))
         ORDER BY is_active DESC, created_at
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_account ON payments;
CREATE TRIGGER trg_payments_account BEFORE INSERT OR UPDATE OF method_id, own_money ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_payment_account();

-- Quién lo anotó: la misma función que ya firma los ajustes de inventario
DROP TRIGGER IF EXISTS trg_payments_author ON payments;
CREATE TRIGGER trg_payments_author BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_adjustment_author();


-- =================================================================
-- 5. Plata mía ⇒ su Metí plata, siempre y en la misma transacción
-- =================================================================
-- Lo hace la base, no cada pantalla: crear, cambiar el monto, la nota o
-- la fecha, pasar a una cuenta o borrar (esto último lo hace el CASCADE).
CREATE OR REPLACE FUNCTION public.toul_plata_mia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.type NOT IN ('expense', 'purchase', 'provider_payment') THEN
        RETURN NULL;
    END IF;

    IF NEW.own_money THEN
        INSERT INTO payments (store_id, type, method, amount, own_money, linked_payment_id,
                              reference_id, notes, created_at, created_by, created_by_name)
        VALUES (NEW.store_id, 'owner_in', 'Plata mía', NEW.amount, true, NEW.id,
                NEW.reference_id, NEW.notes, NEW.created_at, NEW.created_by, NEW.created_by_name)
        ON CONFLICT (linked_payment_id) WHERE linked_payment_id IS NOT NULL
        DO UPDATE SET amount = EXCLUDED.amount, created_at = EXCLUDED.created_at, notes = EXCLUDED.notes;
    ELSIF TG_OP = 'UPDATE' AND OLD.own_money THEN
        -- Se cambió de "Plata mía" a una cuenta del negocio
        DELETE FROM payments WHERE linked_payment_id = NEW.id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_plata_mia ON payments;
CREATE TRIGGER trg_payments_plata_mia AFTER INSERT OR UPDATE OF own_money, amount, created_at, notes ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_plata_mia();

-- El Metí plata atado no se toca por su lado: se corrige o borra la
-- compra, el gasto o el pago, y él lo sigue. Desde el SQL Editor (sin
-- usuario de la app) no se frena: la auditoría lo revisa igual
CREATE OR REPLACE FUNCTION public.toul_plata_mia_guarda()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_pagado payments%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    SELECT * INTO v_pagado FROM payments WHERE id = OLD.linked_payment_id;
    IF NOT FOUND THEN
        -- Lo que pagó ya se borró: este se va con él
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE' THEN
        -- Lo que pagó pasó a una cuenta del negocio: ya no hubo plata tuya
        IF NOT v_pagado.own_money THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'Esta plata la metiste para pagar algo: corrígelo o bórralo desde ahí';
    END IF;
    IF NEW.amount IS DISTINCT FROM v_pagado.amount OR NEW.linked_payment_id IS DISTINCT FROM OLD.linked_payment_id
       OR NOT NEW.own_money OR NEW.type <> 'owner_in' THEN
        RAISE EXCEPTION 'Esta plata la metiste para pagar algo: corrígelo o bórralo desde ahí';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_plata_mia_guarda ON payments;
CREATE TRIGGER trg_payments_plata_mia_guarda BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW WHEN (OLD.linked_payment_id IS NOT NULL)
    EXECUTE FUNCTION toul_plata_mia_guarda();


-- =================================================================
-- 6. Un turno cerrado no cambia
-- =================================================================
-- De lo que quedó en un turno cerrado solo se puede cambiar la nota (y la
-- categoría del gasto, que vive en su propia tabla). Ni el monto, ni la
-- cuenta, ni la fecha, ni borrarlo: para corregir se anota un movimiento
-- nuevo. Así lo que se contó al cerrar sigue cuadrando.
-- Lo que hace la base por su lado (borrar una tienda entera, el Metí
-- plata atado) y el SQL Editor no se frenan aquí.
CREATE OR REPLACE FUNCTION public.toul_turno_cerrado_guarda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_estado text;
BEGIN
    IF pg_trigger_depth() > 1 OR auth.uid() IS NULL THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    -- FOR SHARE: si alguien está cerrando el turno en este momento, se espera
    SELECT status INTO v_estado FROM cash_sessions WHERE id = OLD.cash_session_id FOR SHARE;
    IF v_estado IS DISTINCT FROM 'closed' THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_OP = 'DELETE'
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.store_id IS DISTINCT FROM OLD.store_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.cash_session_id IS DISTINCT FROM OLD.cash_session_id
       OR toul_cambio_cuenta(OLD, NEW) THEN
        RAISE EXCEPTION 'Esto quedó en un turno que ya se cerró: solo puedes cambiar la nota o la categoría. Para corregirlo, anota un movimiento nuevo';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_turno_cerrado ON payments;
CREATE TRIGGER trg_payments_turno_cerrado BEFORE UPDATE OR DELETE ON payments
    FOR EACH ROW WHEN (OLD.cash_session_id IS NOT NULL)
    EXECUTE FUNCTION toul_turno_cerrado_guarda();


-- =================================================================
-- 7. Con un turno abierto, el efectivo que entra o sale cuenta
-- =================================================================
-- Gastos, compras, pagos a proveedor, Metí y Saqué plata en efectivo van
-- al turno abierto de la tienda (hay uno solo a la vez), lo haya anotado
-- quien sea. Lo que no es efectivo, o es plata mía, no va a ningún turno.
-- Si se le cambia la cuenta mientras el turno sigue abierto, entra o sale
-- de él. No se puede meter efectivo en un turno que ya se cerró.
-- Ventas, abonos y devoluciones siguen como antes: van al turno de quien
-- las anota (process_sale y las demás ya mandan su turno).
CREATE OR REPLACE FUNCTION public.toul_attach_cash_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NEW.type IN ('expense', 'purchase', 'provider_payment', 'owner_in', 'owner_out') THEN
        IF TG_OP = 'UPDATE' THEN
            IF NOT toul_cambio_cuenta(OLD, NEW) THEN RETURN NEW; END IF;
            NEW.cash_session_id := NULL;
        ELSIF NEW.cash_session_id IS NOT NULL THEN
            RETURN NEW;
        END IF;

        IF NOT NEW.own_money AND toul_es_efectivo(NEW.store_id, NEW.method_id, NEW.method) THEN
            -- FOR SHARE: si alguien está cerrando el turno en este momento,
            -- se espera a que termine y entonces ya no está abierto
            SELECT id INTO NEW.cash_session_id
              FROM cash_sessions
             WHERE store_id = NEW.store_id AND status = 'open' AND opened_at <= NEW.created_at
             ORDER BY opened_at DESC
             LIMIT 1
               FOR SHARE;

            IF TG_OP = 'UPDATE' AND NEW.cash_session_id IS NULL AND auth.uid() IS NOT NULL AND EXISTS (
                SELECT 1 FROM cash_sessions
                 WHERE store_id = NEW.store_id AND status = 'closed'
                   AND opened_at <= NEW.created_at AND closed_at > NEW.created_at) THEN
                RAISE EXCEPTION 'Esto pasó durante un turno que ya se cerró: no se puede pasar a efectivo. Para corregirlo, anota un movimiento nuevo';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' AND NEW.cash_session_id IS NULL AND auth.uid() IS NOT NULL THEN
        SELECT id INTO NEW.cash_session_id
          FROM cash_sessions
         WHERE store_id = NEW.store_id AND status = 'open' AND opened_by = auth.uid()
         LIMIT 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_toul_attach_cash_session ON payments;
CREATE TRIGGER trg_toul_attach_cash_session BEFORE INSERT OR UPDATE OF method_id, own_money ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_attach_cash_session();


-- =================================================================
-- 8. El vendedor solo anota la plata de sus ventas desde el navegador
-- =================================================================
-- Sus gastos van por toul_registrar_gasto, que revisa su permiso.
DROP POLICY IF EXISTS member_insert_payments ON payments;
CREATE POLICY member_insert_payments ON payments FOR INSERT
    WITH CHECK (
        store_id IN (SELECT toul_member_store_ids())
        AND type = 'sale' AND amount > 0 AND NOT own_money
        AND reference_id IN (SELECT s.id FROM sales s WHERE s.store_id = payments.store_id)
    );


-- =================================================================
-- 9. Lo de antes: la cuenta por número y el capital propio
-- =================================================================
-- Solo donde el nombre guardado coincide con una cuenta de la tienda.
-- Lo que no coincida (gastos y compras "General") queda "Sin cuenta".
-- Los traslados de antes no se tocan.
UPDATE payments p
   SET method_id = m.id
  FROM (SELECT DISTINCT ON (store_id, lower(trim(name))) id, store_id, lower(trim(name)) AS nombre
          FROM payment_methods
         ORDER BY store_id, lower(trim(name)), is_active DESC, created_at) m
 WHERE p.method_id IS NULL AND NOT p.own_money
   AND p.type IN ('sale', 'sale_payment', 'sale_refund', 'expense', 'purchase', 'provider_payment', 'credit_payment')
   AND m.store_id = p.store_id AND m.nombre = lower(trim(p.method));

-- El capital propio de antes, al libro como "Metí plata". La tabla vieja
-- no se borra ni se cambia: queda de respaldo.
-- Lo pagado con capital propio nunca quedó como salida en el libro (por
-- eso esas compras no salían en "Mercancía que pagaste"). Se anota la
-- salida con "Plata mía" y la base le crea su "Metí plata" (punto 5).
-- No entra lo de compras anuladas ni gastos borrados.
INSERT INTO payments (store_id, type, method, amount, own_money, reference_id, notes, created_at, legacy_capital_id)
SELECT c.store_id, c.reference_type, 'Plata mía', round(c.amount), true, c.reference_id,
       COALESCE(NULLIF(trim(c.notes), ''), 'Capital propio'), c.created_at, c.id
  FROM owner_capital_injections c
  LEFT JOIN purchases p ON c.reference_type = 'purchase' AND p.id = c.reference_id
  LEFT JOIN expenses  e ON c.reference_type = 'expense'  AND e.id = c.reference_id
 WHERE round(c.amount) > 0
   AND (   (c.reference_type = 'purchase' AND p.id IS NOT NULL AND p.status IS DISTINCT FROM 'voided')
        OR (c.reference_type = 'expense'  AND e.id IS NOT NULL)
        OR  c.reference_type = 'provider_payment')
ON CONFLICT (legacy_capital_id) WHERE legacy_capital_id IS NOT NULL DO NOTHING;

-- Capital sin compra, gasto ni pago conocido: "Metí plata" suelto
INSERT INTO payments (store_id, type, method, amount, own_money, reference_id, notes, created_at, legacy_capital_id)
SELECT c.store_id, 'owner_in', 'Plata mía', round(c.amount), true, c.reference_id,
       COALESCE(NULLIF(trim(c.notes), ''), 'Capital propio'), c.created_at, c.id
  FROM owner_capital_injections c
 WHERE round(c.amount) > 0
   AND (c.reference_type IS NULL OR c.reference_type NOT IN ('purchase', 'expense', 'provider_payment'))
ON CONFLICT (legacy_capital_id) WHERE legacy_capital_id IS NOT NULL DO NOTHING;

-- Nadie escribe más en la tabla vieja
REVOKE INSERT, UPDATE, DELETE ON owner_capital_injections FROM anon, authenticated;


-- =================================================================
-- 10. Permiso "Registrar gastos" del vendedor
-- =================================================================
CREATE OR REPLACE FUNCTION public.toul_seller_permission(p_store_id uuid, p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT COALESCE(
        (SELECT seller_permissions->>p_key FROM stores WHERE id = p_store_id),
        CASE p_key
            WHEN 'fiar'             THEN 'aprobacion'
            WHEN 'anular'           THEN 'aprobacion'
            WHEN 'devolver'         THEN 'aprobacion'
            WHEN 'descuento_max'    THEN '10'
            WHEN 'ver_efectivo'     THEN 'no'
            WHEN 'crear_clientes'   THEN 'solo'
            WHEN 'registrar_gastos' THEN 'no'
        END
    );
$$;

CREATE OR REPLACE FUNCTION public.toul_set_seller_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

    FOREACH v_key IN ARRAY ARRAY['ver_efectivo', 'crear_clientes', 'registrar_gastos'] LOOP
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


-- =================================================================
-- 11. Gastos: anotar, corregir y borrar (todo o nada)
-- =================================================================
-- Antes la app guardaba el gasto y su salida en dos pasos sueltos: si el
-- segundo fallaba, el gasto quedaba sin salir de la plata.
-- El administrador puede pagar con una cuenta o con "Plata mía". El
-- vendedor solo con su permiso, con una cuenta y nunca con plata mía.
CREATE OR REPLACE FUNCTION public.toul_registrar_gasto(
    p_categoria   text,
    p_monto       numeric,
    p_descripcion text DEFAULT NULL,
    p_method_id   uuid DEFAULT NULL,
    p_plata_mia   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_store     uuid := toul_current_store_id();
    v_rol       text := toul_current_role();
    v_monto     numeric := round(COALESCE(p_monto, 0));
    v_categoria text := COALESCE(NULLIF(trim(p_categoria), ''), 'otros');
    v_desc      text := NULLIF(trim(COALESCE(p_descripcion, '')), '');
    v_plata     boolean := COALESCE(p_plata_mia, false);
    v_cuenta    text;
    v_gasto     uuid;
    v_pago      uuid;
BEGIN
    IF auth.uid() IS NULL OR v_store IS NULL OR v_rol IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;
    IF v_rol <> 'admin' THEN
        IF toul_seller_permission(v_store, 'registrar_gastos') IS DISTINCT FROM 'solo' THEN
            RAISE EXCEPTION 'No tienes permiso para anotar gastos';
        END IF;
        IF v_plata THEN
            RAISE EXCEPTION 'Solo el administrador puede pagar con plata suya';
        END IF;
        IF p_method_id IS NULL THEN
            RAISE EXCEPTION 'Elige con qué pagaste';
        END IF;
    END IF;
    IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribe cuánto gastaste'; END IF;

    IF v_plata THEN
        v_cuenta := 'Plata mía';
    ELSIF p_method_id IS NOT NULL THEN
        v_cuenta := toul_cuenta_para_anotar(v_store, p_method_id);
    ELSE
        v_cuenta := 'General';
    END IF;

    INSERT INTO expenses (store_id, category, description, amount, payment_method)
    VALUES (v_store, v_categoria, v_desc, v_monto, v_cuenta)
    RETURNING id INTO v_gasto;

    INSERT INTO payments (store_id, type, method, method_id, own_money, amount, reference_id, notes)
    VALUES (v_store, 'expense', v_cuenta, CASE WHEN v_plata THEN NULL ELSE p_method_id END, v_plata,
            v_monto, v_gasto, 'Gasto: ' || COALESCE(v_desc, v_categoria))
    RETURNING id INTO v_pago;

    RETURN jsonb_build_object('success', true, 'expenseId', v_gasto, 'paymentId', v_pago, 'amount', v_monto);
END;
$$;

-- Corregir un gasto. Sin cuenta nueva, se queda con la que tenía
DROP FUNCTION IF EXISTS public.toul_update_expense(uuid, text, text, numeric);

CREATE OR REPLACE FUNCTION public.toul_update_expense(
    p_expense_id  uuid,
    p_category    text,
    p_description text,
    p_amount      numeric,
    p_method_id   uuid DEFAULT NULL,
    p_plata_mia   boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store     uuid;
    v_pago      payments%ROWTYPE;
    v_plata     boolean;
    v_metodo    uuid;
    v_cuenta    text;
    v_desc      text := NULLIF(trim(COALESCE(p_description, '')), '');
BEGIN
    SELECT store_id INTO v_store FROM expenses WHERE id = p_expense_id;
    IF v_store IS NULL OR v_store IS DISTINCT FROM toul_current_store_id() THEN RAISE EXCEPTION 'Ese gasto no existe'; END IF;
    IF toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede corregir gastos';
    END IF;
    IF p_amount IS NULL OR round(p_amount) <= 0 THEN RAISE EXCEPTION 'El monto tiene que ser mayor que cero'; END IF;

    SELECT * INTO v_pago FROM payments WHERE reference_id = p_expense_id AND type = 'expense' ORDER BY created_at LIMIT 1;

    -- La cuenta: plata mía, otra cuenta o la misma de antes
    v_plata  := COALESCE(p_plata_mia, CASE WHEN p_method_id IS NOT NULL THEN false END, v_pago.own_money, false);
    v_metodo := CASE WHEN v_plata THEN NULL ELSE COALESCE(p_method_id, v_pago.method_id) END;
    IF v_metodo IS NOT NULL AND v_metodo IS DISTINCT FROM v_pago.method_id THEN
        v_cuenta := toul_cuenta_para_anotar(v_store, v_metodo);
    ELSIF v_plata THEN
        v_cuenta := 'Plata mía';
    ELSIF v_metodo IS NULL AND v_pago.own_money THEN
        v_cuenta := 'General';   -- dejó de ser plata mía sin elegir cuenta: "Sin cuenta"
    END IF;

    UPDATE expenses
       SET category       = COALESCE(NULLIF(trim(p_category), ''), category),
           description    = v_desc,
           amount         = round(p_amount),
           payment_method = COALESCE(v_cuenta, payment_method)
     WHERE id = p_expense_id;

    -- Si quedó en un turno cerrado, la base no deja cambiar el monto ni la cuenta
    UPDATE payments
       SET amount    = round(p_amount),
           notes     = 'Gasto: ' || COALESCE(v_desc, NULLIF(trim(p_category), ''), (SELECT category FROM expenses WHERE id = p_expense_id)),
           own_money = v_plata,
           method_id = v_metodo,
           method    = COALESCE(v_cuenta, method)
     WHERE reference_id = p_expense_id AND type = 'expense';

    RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_delete_expense(p_expense_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store UUID;
    v_monto NUMERIC;
BEGIN
    SELECT store_id, amount INTO v_store, v_monto FROM expenses WHERE id = p_expense_id;
    IF v_store IS NULL OR v_store IS DISTINCT FROM toul_current_store_id() THEN RAISE EXCEPTION 'Ese gasto no existe'; END IF;
    IF toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede borrar gastos';
    END IF;

    -- Si quedó en un turno cerrado, la base no deja borrarlo.
    -- Si se pagó con plata mía, su Metí plata se va con él
    DELETE FROM payments WHERE reference_id = p_expense_id AND type = 'expense';
    DELETE FROM expenses WHERE id = p_expense_id;

    RETURN jsonb_build_object('success', true, 'amount', round(v_monto));
END;
$$;


-- =================================================================
-- 12. Metí plata y Saqué plata (solo el administrador)
-- =================================================================
CREATE OR REPLACE FUNCTION public.toul_registrar_movimiento(
    p_tipo      text,      -- 'meti' | 'saque'
    p_monto     numeric,
    p_method_id uuid,
    p_nota      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store uuid := toul_current_store_id();
    v_monto numeric := round(COALESCE(p_monto, 0));
    v_tipo  text;
    v_id    uuid;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede anotar plata que mete o saca';
    END IF;
    v_tipo := CASE p_tipo WHEN 'meti' THEN 'owner_in' WHEN 'saque' THEN 'owner_out' END;
    IF v_tipo IS NULL THEN RAISE EXCEPTION 'Elige si metiste o sacaste plata'; END IF;
    IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribe cuánto'; END IF;
    IF p_method_id IS NULL THEN
        RAISE EXCEPTION '%', CASE v_tipo WHEN 'owner_in' THEN 'Elige a dónde la metiste' ELSE 'Elige de dónde la sacaste' END;
    END IF;

    INSERT INTO payments (store_id, type, method, method_id, amount, notes)
    VALUES (v_store, v_tipo, toul_cuenta_para_anotar(v_store, p_method_id), p_method_id, v_monto,
            NULLIF(trim(COALESCE(p_nota, '')), ''))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('success', true, 'id', v_id, 'amount', v_monto);
END;
$$;

-- Corregir un Metí o Saqué plata. El que nació de pagar algo con plata
-- mía se corrige desde lo que pagó
CREATE OR REPLACE FUNCTION public.toul_editar_movimiento(
    p_id        uuid,
    p_monto     numeric,
    p_method_id uuid,
    p_nota      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store uuid := toul_current_store_id();
    v_mov   payments%ROWTYPE;
    v_monto numeric := round(COALESCE(p_monto, 0));
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede corregir plata que mete o saca';
    END IF;
    SELECT * INTO v_mov FROM payments
     WHERE id = p_id AND store_id = v_store AND type IN ('owner_in', 'owner_out');
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese movimiento no existe'; END IF;
    IF v_mov.linked_payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta plata la metiste para pagar algo: corrígelo o bórralo desde ahí';
    END IF;
    IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribe cuánto'; END IF;
    IF p_method_id IS NOT NULL AND p_method_id IS DISTINCT FROM v_mov.method_id THEN
        PERFORM toul_cuenta_para_anotar(v_store, p_method_id);
    END IF;

    -- Si quedó en un turno cerrado, la base solo deja cambiar la nota
    UPDATE payments
       SET amount    = v_monto,
           method_id = COALESCE(p_method_id, method_id),
           own_money = CASE WHEN p_method_id IS NULL THEN own_money ELSE false END,
           notes     = NULLIF(trim(COALESCE(p_nota, '')), '')
     WHERE id = p_id;

    RETURN jsonb_build_object('success', true, 'amount', v_monto);
END;
$$;

CREATE OR REPLACE FUNCTION public.toul_borrar_movimiento(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store uuid := toul_current_store_id();
    v_mov   payments%ROWTYPE;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede borrar plata que mete o saca';
    END IF;
    SELECT * INTO v_mov FROM payments
     WHERE id = p_id AND store_id = v_store AND type IN ('owner_in', 'owner_out');
    IF NOT FOUND THEN RAISE EXCEPTION 'Ese movimiento no existe'; END IF;
    IF v_mov.linked_payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta plata la metiste para pagar algo: corrígelo o bórralo desde ahí';
    END IF;

    -- Si quedó en un turno cerrado, la base no deja borrarlo
    DELETE FROM payments WHERE id = p_id;

    RETURN jsonb_build_object('success', true, 'amount', round(v_mov.amount));
END;
$$;


-- =================================================================
-- 13. Compra y pago a proveedor: "¿Con qué pagaste?"
-- =================================================================
-- La compra acepta methodId (una cuenta de la tienda) o plataMia. Sin
-- ninguno queda como antes ("Sin cuenta"). Lo demás no cambia.
CREATE OR REPLACE FUNCTION public.process_purchase(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
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
    v_method_id     uuid;
    v_plata_mia     boolean;
    v_cuenta        text := 'General';

    v_item          jsonb;

    v_product_id    uuid;
    v_variant_id    uuid;
    v_quantity      numeric;
    v_unit_cost     numeric;
    v_stock         numeric;
    v_cpp           numeric;
    v_new_cpp       numeric;
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
    v_plata_mia   := COALESCE((payload->>'plataMia')::boolean, false);
    v_method_id   := CASE WHEN v_plata_mia THEN NULL ELSE NULLIF(payload->>'methodId', '')::uuid END;

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

    -- Cuánto se pagó ahora. `paidNow` es el contrato actual; `payments[]`
    -- se sigue aceptando por compatibilidad con versiones anteriores.
    IF payload ? 'paidNow' THEN
        v_paid := round(GREATEST(0, COALESCE((payload->>'paidNow')::numeric, 0)));
    ELSE
        SELECT COALESCE(SUM(round((p->>'amount')::numeric)), 0)
          INTO v_paid
          FROM jsonb_array_elements(COALESCE(payload->'payments', '[]'::jsonb)) p
         WHERE COALESCE((p->>'amount')::numeric, 0) > 0;
    END IF;

    -- De contado se paga todo
    IF NOT v_is_credit THEN
        v_paid := v_total;
    END IF;

    IF v_paid > v_total + 1 THEN
        RAISE EXCEPTION 'El abono no puede ser mayor que el total de la compra';
    END IF;

    -- Con qué pagaste: una cuenta activa de la tienda o plata tuya
    IF v_paid > 0 THEN
        IF v_plata_mia THEN
            v_cuenta := 'Plata mía';
        ELSIF v_method_id IS NOT NULL THEN
            v_cuenta := toul_cuenta_para_anotar(v_store_id, v_method_id);
        END IF;
    END IF;

    -- ─── 3. INSERT purchases ─────────────────────────────────────
    INSERT INTO purchases (store_id, provider_id, subtotal, total, payment_method, is_credit, status)
    VALUES (
        v_store_id,
        v_provider_id,
        v_total,
        v_total,
        CASE
            WHEN v_is_credit THEN 'credit'
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

    -- ─── 6. Pago ─────────────────────────────────────────────────
    -- Con plata mía, la base le anota su "Metí plata" en esta misma transacción
    IF v_paid > 0 THEN
        INSERT INTO purchase_payments (purchase_id, amount, payment_method)
        VALUES (v_purchase_id, v_paid, v_cuenta);

        INSERT INTO payments (store_id, type, method, method_id, own_money, amount, reference_id, notes)
        VALUES (v_store_id, 'purchase', v_cuenta, v_method_id, v_plata_mia, v_paid, v_purchase_id,
                format('Compra #%s', v_short_id));
    END IF;

    RETURN jsonb_build_object('success', true, 'purchaseId', v_purchase_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_purchase(jsonb) TO authenticated;

-- Pago a proveedor con cuenta o plata mía. Lo demás no cambia
DROP FUNCTION IF EXISTS public.toul_pagar_proveedor(uuid, numeric, text);

CREATE OR REPLACE FUNCTION public.toul_pagar_proveedor(
    p_provider_id uuid,
    p_amount      numeric,
    p_notes       text DEFAULT NULL,
    p_method_id   uuid DEFAULT NULL,
    p_plata_mia   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_store  uuid := toul_current_store_id();
    v_monto  numeric := round(COALESCE(p_amount, 0));
    v_plata  boolean := COALESCE(p_plata_mia, false);
    v_metodo uuid := CASE WHEN COALESCE(p_plata_mia, false) THEN NULL ELSE p_method_id END;
    v_cuenta text := 'General';
    v_nombre text;
    v_saldo  numeric;
    v_falta  numeric;
    v_d      record;
    v_baja   numeric;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede registrar pagos a proveedores';
    END IF;

    -- Bloquea al proveedor: dos pagos al mismo tiempo no pueden pasarse de la deuda
    SELECT name INTO v_nombre FROM providers WHERE id = p_provider_id AND store_id = v_store FOR UPDATE;
    IF v_nombre IS NULL THEN RAISE EXCEPTION 'Proveedor no encontrado'; END IF;
    IF v_monto <= 0 THEN RAISE EXCEPTION 'Escribe cuánto le pagaste'; END IF;

    IF v_plata THEN
        v_cuenta := 'Plata mía';
    ELSIF v_metodo IS NOT NULL THEN
        v_cuenta := toul_cuenta_para_anotar(v_store, v_metodo);
    END IF;

    SELECT round(COALESCE(SUM(remaining_amount), 0)) INTO v_saldo
      FROM provider_debts
     WHERE store_id = v_store AND provider_id = p_provider_id AND status <> 'paid' AND remaining_amount > 0;
    IF v_saldo <= 0 THEN RAISE EXCEPTION 'A % no le debes nada', v_nombre; END IF;
    IF v_monto > v_saldo THEN
        RAISE EXCEPTION 'El pago no puede ser mayor a lo que le debes: $%', replace(to_char(v_saldo, 'FM999,999,999,999'), ',', '.');
    END IF;

    v_falta := v_monto;
    FOR v_d IN
        SELECT id, remaining_amount FROM provider_debts
         WHERE store_id = v_store AND provider_id = p_provider_id AND status <> 'paid' AND remaining_amount > 0
         ORDER BY created_at, id
           FOR UPDATE
    LOOP
        EXIT WHEN v_falta <= 0;
        v_baja := LEAST(v_falta, v_d.remaining_amount);
        UPDATE provider_debts
           SET remaining_amount = remaining_amount - v_baja,
               status = CASE WHEN remaining_amount - v_baja <= 0 THEN 'paid' ELSE 'pending' END
         WHERE id = v_d.id;
        v_falta := v_falta - v_baja;
    END LOOP;

    -- Con plata mía, la base le anota su "Metí plata" en esta misma transacción
    INSERT INTO payments (store_id, type, method, method_id, own_money, amount, reference_id, notes)
    VALUES (v_store, 'provider_payment', v_cuenta, v_metodo, v_plata, v_monto, p_provider_id,
            COALESCE(NULLIF(trim(p_notes), ''), 'Abono a proveedor: ' || v_nombre));

    UPDATE providers SET total_debt = v_saldo - v_monto WHERE id = p_provider_id;

    RETURN jsonb_build_object('success', true, 'amount', v_monto, 'saldo', v_saldo - v_monto);
END;
$$;


-- =================================================================
-- 14. Lo que cuenta un turno
-- =================================================================
-- Cada tipo con su signo, sin adivinar: salen gastos, compras, pagos a
-- proveedor y Saqué plata; entran ventas, abonos y Metí plata (las
-- devoluciones ya vienen en negativo). Cada cuenta con su nombre de hoy.
-- Aparte, cuánto se metió, se sacó y se gastó en efectivo en el turno.
CREATE OR REPLACE FUNCTION public.toul_cash_session_totals(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_session  cash_sessions%ROWTYPE;
  v_methods  jsonb;
  v_cash_net numeric;
  v_extra    jsonb;
BEGIN
  SELECT * INTO v_session FROM cash_sessions WHERE id = p_session_id;

  WITH movements AS (
    SELECT COALESCE(p.method_id::text, p.method) AS clave,
           COALESCE(pm.name, p.method) AS method,
           p.type,
           p.amount,
           CASE WHEN p.type IN ('expense', 'purchase', 'provider_payment', 'owner_out', 'transfer_out')
                THEN -p.amount
                -- ventas, abonos, devoluciones (ya en negativo), Metí plata y lo de antes
                ELSE p.amount END AS net,
           toul_es_efectivo(p.store_id, p.method_id, p.method) AS is_cash
      FROM payments p
      LEFT JOIN payment_methods pm ON pm.id = p.method_id
     WHERE p.cash_session_id = p_session_id
  ),
  por_cuenta AS (
    SELECT (array_agg(method))[1] AS method, bool_or(is_cash) AS is_cash, round(SUM(net)) AS net
      FROM movements GROUP BY clave
  )
  SELECT (SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method, 'isCash', is_cash, 'net', net) ORDER BY is_cash DESC, method), '[]'::jsonb)
            FROM por_cuenta),
         (SELECT COALESCE(SUM(net) FILTER (WHERE is_cash), 0) FROM por_cuenta),
         (SELECT jsonb_build_object(
                   'ownerInCash',     round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_in'), 0)),
                   'ownerOutCash',    round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_out'), 0)),
                   'expenseCash',     round(COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0)),
                   'merchandiseCash', round(COALESCE(SUM(amount) FILTER (WHERE type IN ('purchase', 'provider_payment')), 0)))
            FROM movements WHERE is_cash)
    INTO v_methods, v_cash_net, v_extra;

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
  ) || v_extra;
END;
$$;


-- =================================================================
-- 15. Reportes: "Entre tú y tu negocio"
-- =================================================================
-- toul_reporte devuelve además 'metiste' y 'sacaste' del periodo. No
-- entran en Ganaste, ni en Plata que entró, ni en Plata que salió.
-- (El resto de la función es igual a deploy_reportes.sql.)
CREATE OR REPLACE FUNCTION public.toul_reporte(p_desde timestamptz, p_hasta timestamptz, p_paso text DEFAULT NULL)
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
    v_metodos_venta jsonb;
    v_productos  jsonb;
    v_linea      jsonb := '{}'::jsonb;
    v_metiste    numeric;
    v_sacaste    numeric;
BEGIN
    IF v_store IS NULL OR toul_current_role() IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Solo el administrador puede ver los reportes';
    END IF;
    IF v_hasta < v_desde THEN
        RAISE EXCEPTION 'Elige un rango de fechas válido';
    END IF;
    IF p_paso IS NOT NULL AND p_paso NOT IN ('hora', 'dia') THEN
        RAISE EXCEPTION 'La línea va por hora o por día';
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

    -- Entre tú y tu negocio: lo que metiste y lo que sacaste para ti. No es
    -- ganancia ni gasto: no entra en Ganaste ni en la plata que entró o salió
    SELECT round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_in'), 0)),
           round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_out'), 0))
      INTO v_metiste, v_sacaste
      FROM payments
     WHERE store_id = v_store AND type IN ('owner_in', 'owner_out')
       AND created_at >= v_desde AND created_at <= v_hasta;

    -- Cómo te pagan: la plata que entró, por método. Lo de cada venta sale
    -- de sus pagos; si una venta de contado no tiene el detalle (ventas
    -- viejas), va al método que quedó anotado en la venta. Los abonos van
    -- por el método que se eligió; los de antes no lo tenían y van como "Abonos".
    -- En la misma pasada, lo vendido por método para el Inicio: solo lo
    -- pagado al vender, menos la plata que se devolvió por cada método.
    -- Suma De contado − lo reembolsado
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
    al_vender AS (
        SELECT nombre, monto, 0 AS prioridad FROM ajustados
        UNION ALL
        SELECT nombre, monto, 1 FROM resto WHERE monto > 0
    ),
    entradas AS (
        SELECT nombre, monto, prioridad FROM al_vender
        UNION ALL
        -- Los abonos de antes no tenían método: del 29 sep al 14 oct de 2026
        -- quedaron como "General" y después sin nada. Todos van como "Abonos"
        SELECT CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 'Abonos' ELSE payment_method END,
               amount,
               CASE WHEN NULLIF(trim(payment_method), '') IS NULL OR lower(trim(payment_method)) = 'general'
                    THEN 2 ELSE 0 END
          FROM credits
         WHERE store_id = v_store AND type = 'payment'
           AND created_at >= v_desde AND created_at <= v_hasta
    ),
    devuelto AS (
        -- La plata devuelta en el periodo, por el método con que salió
        SELECT COALESCE(pm.name, 'Otros') AS nombre, -r.refunded AS monto, 2 AS prioridad
          FROM sale_returns r
          LEFT JOIN payment_methods pm ON pm.id = r.refund_method_id
         WHERE r.store_id = v_store AND r.refunded > 0
           AND r.created_at >= v_desde AND r.created_at <= v_hasta
    ),
    por_metodo AS (
        -- "Efectivo" y "efectivo" son el mismo método
        SELECT (array_agg(nombre ORDER BY prioridad))[1] AS nombre, round(SUM(monto)) AS monto
          FROM entradas
         GROUP BY lower(trim(nombre))
    ),
    por_metodo_venta AS (
        SELECT (array_agg(nombre ORDER BY prioridad))[1] AS nombre, round(SUM(monto)) AS monto
          FROM (SELECT nombre, monto, prioridad FROM al_vender
                UNION ALL
                SELECT nombre, monto, prioridad FROM devuelto) m
         GROUP BY lower(trim(nombre))
    )
    SELECT (SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'monto', monto) ORDER BY monto DESC, nombre), '[]'::jsonb)
              FROM por_metodo WHERE monto > 0),
           -- Un método puede quedar en negativo si se devolvió más de lo que entró por él
           (SELECT COALESCE(jsonb_agg(jsonb_build_object('nombre', nombre, 'monto', monto) ORDER BY monto DESC, nombre), '[]'::jsonb)
              FROM por_metodo_venta WHERE monto <> 0)
      INTO v_metodos, v_metodos_venta;

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

    -- La línea del Inicio. Cada venta cuenta en la hora o el día de
    -- Colombia en que se hizo, y cada devolución resta en el suyo. El
    -- acumulado se redondea igual que Vendiste (ventas y devoluciones por
    -- separado), así el último punto da exacto lo mismo. `t` es el momento
    -- en que empieza esa hora o ese día; solo vienen los que tuvieron algo.
    -- `primeraVenta`: si nunca ha vendido, el Inicio no dibuja la línea
    IF p_paso IS NOT NULL THEN
        WITH movimientos AS (
            SELECT date_trunc(CASE WHEN p_paso = 'hora' THEN 'hour' ELSE 'day' END, s.created_at AT TIME ZONE 'America/Bogota') AS tramo,
                   v.total AS vendido, 0::numeric AS devuelto, 1 AS ventas
              FROM toul_reporte_ventas(v_store, v_desde, v_hasta) v
              JOIN sales s ON s.id = v.id
            UNION ALL
            SELECT date_trunc(CASE WHEN p_paso = 'hora' THEN 'hour' ELSE 'day' END, r.created_at AT TIME ZONE 'America/Bogota'),
                   0, r.total, 0
              FROM sale_returns r
             WHERE r.store_id = v_store
               AND r.created_at >= v_desde AND r.created_at <= v_hasta
        ),
        por_tramo AS (
            SELECT tramo, SUM(vendido) AS vendido, SUM(devuelto) AS devuelto, SUM(ventas)::integer AS ventas
              FROM movimientos GROUP BY tramo
        ),
        acumulado AS (
            SELECT tramo, ventas,
                   round(SUM(vendido) OVER w) - round(SUM(devuelto) OVER w) AS acumulado
              FROM por_tramo
            WINDOW w AS (ORDER BY tramo ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        )
        SELECT jsonb_build_object(
                   'serie', COALESCE(jsonb_agg(jsonb_build_object(
                                't', tramo AT TIME ZONE 'America/Bogota', 'acumulado', acumulado, 'ventas', ventas) ORDER BY tramo), '[]'::jsonb),
                   'primeraVenta', (SELECT min(created_at) FROM sales WHERE store_id = v_store))
          INTO v_linea
          FROM acumulado;
    END IF;

    RETURN jsonb_build_object(
        'ventas',             v_ventas,
        'devoluciones',       v_devol,
        'abonos',             v_abonos,
        'gastos',             v_gastos,
        'gastosPorCategoria', v_categorias,
        'mercanciaPagada',    v_mercancia,
        'metodos',            v_metodos,
        'metodosVenta',       v_metodos_venta,
        'productos',          v_productos,
        'metiste',            v_metiste,
        'sacaste',            v_sacaste
    ) || v_linea;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toul_reporte(timestamptz, timestamptz, text) TO authenticated;


-- =================================================================
-- 16. Auditoría: Metí y Saqué plata, Plata mía y turnos
-- =================================================================
-- (El resto de la función es igual a deploy_reportes.sql.)
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

        chequeo := 'De contado + A crédito = Ventas antes de devoluciones';
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

        -- La línea del gráfico del Inicio, día por día, termina en Vendiste
        SELECT COALESCE((SELECT (e->>'acumulado')::numeric FROM jsonb_array_elements(toul_reporte(v_desde, v_hasta, 'dia')->'serie') e
                          ORDER BY (e->>'t')::timestamptz DESC LIMIT 1), 0) INTO v_x;
        chequeo := 'Gráfico del Inicio: la línea termina en Vendiste';
        esperado := v_netas; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
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

        -- El Inicio usa esta misma función. Aparte, se suman directo las
        -- ventas, devoluciones y gastos del mes: tienen que dar lo mismo
        SELECT round(COALESCE(SUM(s.total), 0)),
               round(COALESCE(SUM((SELECT COALESCE(SUM(i.unit_cost * i.quantity), 0) FROM sale_items i WHERE i.sale_id = s.id)), 0))
          INTO v_x, v_y
          FROM sales s WHERE s.store_id = v_store AND s.created_at >= v_desde AND s.created_at <= v_hasta;
        SELECT v_x - round(COALESCE(SUM(total), 0)), v_y - round(COALESCE(SUM(cost_total), 0)) INTO v_x, v_y
          FROM sale_returns WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Vendiste (después de devoluciones) = suma directa';
        esperado := v_netas; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Ganancia en ventas = suma directa';
        esperado := v_ganancia; obtenido := v_x - v_y; ok := esperado = obtenido;
        RETURN NEXT;
        SELECT round(COALESCE(SUM(amount), 0)) INTO v_x FROM expenses
         WHERE store_id = v_store AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Gastos = suma directa';
        esperado := v_gastos; obtenido := v_x; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Ganancia después de gastos = suma directa';
        esperado := v_ganaste; obtenido := v_ganancia - v_x; ok := esperado = obtenido;
        RETURN NEXT;

        -- Metí y Saqué plata: van aparte y no tocan lo que ganaste
        v_g := v_x;   -- los gastos del mes, sumados directo
        SELECT round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_in'), 0)),
               round(COALESCE(SUM(amount) FILTER (WHERE type = 'owner_out'), 0))
          INTO v_x, v_y
          FROM payments
         WHERE store_id = v_store AND type IN ('owner_in', 'owner_out')
           AND created_at >= v_desde AND created_at <= v_hasta;
        chequeo := 'Metiste (Entre tú y tu negocio) = suma directa de "Metí plata"';
        esperado := COALESCE((v_r->>'metiste')::numeric, 0); obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
        RETURN NEXT;
        chequeo := 'Sacaste para ti (Entre tú y tu negocio) = suma directa de "Saqué plata"';
        esperado := COALESCE((v_r->>'sacaste')::numeric, 0); obtenido := v_y; ok := esperado = obtenido;
        RETURN NEXT;
        chequeo := 'Metí y Saqué plata no cambian Ganaste';
        esperado := v_ganaste; obtenido := v_netas - v_costo_neto - v_g; ok := esperado = obtenido;
        detalle := CASE WHEN v_x > 0 OR v_y > 0 THEN 'Este mes metiste $' || v_x || ' y sacaste $' || v_y || ': no entran en la cuenta' END;
        RETURN NEXT;

        -- La hoja "Ventas" del Excel, tal cual la arma toul_reporte_detalle
        SELECT round(COALESCE(SUM((f->>'total')::numeric), 0)), round(COALESCE(SUM((f->>'costo')::numeric), 0)),
               round(COALESCE(SUM((f->>'contado')::numeric), 0)), count(*)::integer
          INTO v_x, v_y, v_c, v_n
          FROM jsonb_array_elements(toul_reporte_detalle(v_desde, v_hasta)) f;
        chequeo := 'Excel: la columna Total suma lo mismo que Ventas antes de devoluciones';
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

    -- La línea de Hoy va por hora: también termina en Vendiste
    v_desde := date_trunc('day', now() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota';
    v_r := toul_reporte(v_desde, now(), 'hora');
    SELECT COALESCE((SELECT (e->>'acumulado')::numeric FROM jsonb_array_elements(v_r->'serie') e
                      ORDER BY (e->>'t')::timestamptz DESC LIMIT 1), 0) INTO v_x;
    chequeo := 'Gráfico del Inicio: la línea de hoy termina en Vendiste';
    esperado := (v_r->'ventas'->>'total')::numeric - (v_r->'devoluciones'->>'total')::numeric;
    obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

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

    -- Debes: el Inicio y Proveedores usan toul_payables
    v_y := round((toul_payables()->>'total')::numeric);
    SELECT round(COALESCE(SUM(total_debt), 0)) INTO v_x FROM providers WHERE store_id = v_store;
    SELECT count(*)::integer INTO v_n FROM providers pr
     WHERE pr.store_id = v_store
       AND round(COALESCE(pr.total_debt, 0)) <> round(COALESCE((SELECT SUM(remaining_amount) FROM provider_debts d
                                                               WHERE d.provider_id = pr.id AND d.status <> 'paid'), 0));
    chequeo := 'Debes = lo guardado en cada proveedor';
    esperado := v_y; obtenido := v_x; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' proveedor(es) con la copia descuadrada' END;
    RETURN NEXT;

    SELECT round(COALESCE(SUM(p.total - (SELECT COALESCE(SUM(pp.amount), 0) FROM purchase_payments pp WHERE pp.purchase_id = p.id)), 0))
      INTO v_x FROM purchases p
     WHERE p.store_id = v_store AND p.is_credit AND p.status IS DISTINCT FROM 'voided';
    SELECT v_x - round(COALESCE(SUM(amount), 0)) INTO v_x FROM payments WHERE store_id = v_store AND type = 'provider_payment';
    chequeo := 'Debes = lo comprado a crédito − lo pagado, histórico';
    esperado := v_y; obtenido := v_x; ok := esperado = obtenido; detalle := NULL;
    RETURN NEXT;

    -- Plata en mercancía, contada aparte: cada presentación con su costo,
    -- también lo escondido que tiene stock
    SELECT round(COALESCE(SUM(GREATEST(v.stock, 0) * COALESCE(v.cpp, 0)), 0)) INTO v_x
      FROM product_variants v WHERE v.store_id = v_store;
    SELECT v_x + round(COALESCE(SUM(GREATEST(p.stock, 0) * COALESCE(p.cpp, 0)), 0)) INTO v_x
      FROM products p WHERE p.store_id = v_store
       AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);
    v_y := round((toul_inventory_overview(1)->>'hiddenValue')::numeric);
    chequeo := 'Plata en mercancía = stock × costo, con presentaciones y lo escondido';
    esperado := round((toul_inventory_overview(1)->>'value')::numeric); obtenido := v_x; ok := esperado = obtenido;
    detalle := CASE WHEN v_y > 0 THEN 'Incluye $' || v_y || ' de productos escondidos con stock' END;
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

    -- Cada pago con plata mía tiene su "Metí plata" atado, por el mismo
    -- monto y la misma fecha; y ningún Metí plata atado se quedó sin lo que pagó
    SELECT round(COALESCE(SUM(p.amount), 0)), round(COALESCE(SUM(m.amount), 0)),
           (count(*) FILTER (WHERE m.id IS NULL OR m.amount <> p.amount OR m.created_at <> p.created_at OR NOT m.own_money))::integer
      INTO v_x, v_y, v_n
      FROM payments p
      LEFT JOIN payments m ON m.linked_payment_id = p.id AND m.type = 'owner_in'
     WHERE p.store_id = v_store AND p.own_money AND p.type IN ('expense', 'purchase', 'provider_payment');
    SELECT v_n + count(*)::integer INTO v_n FROM payments m
     WHERE m.store_id = v_store AND m.linked_payment_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.id = m.linked_payment_id AND p.own_money);
    chequeo := 'Cada pago con "Plata mía" tiene su "Metí plata" por el mismo monto';
    esperado := v_x; obtenido := v_y; ok := v_n = 0 AND v_x = v_y;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' pago(s) con plata mía sin su Metí plata, o al revés' END;
    RETURN NEXT;

    -- Cada turno cuenta el efectivo que se movió mientras estaba abierto:
    -- gastos, compras, pagos, Metí y Saqué plata anotados desde la app
    SELECT count(*)::integer INTO v_n FROM payments p
     WHERE p.store_id = v_store
       AND p.type IN ('expense', 'purchase', 'provider_payment', 'owner_in', 'owner_out')
       AND p.created_by IS NOT NULL
       AND p.cash_session_id IS DISTINCT FROM (
           CASE WHEN NOT p.own_money AND toul_es_efectivo(p.store_id, p.method_id, p.method) THEN
               (SELECT cs.id FROM cash_sessions cs
                 WHERE cs.store_id = p.store_id AND cs.opened_at <= p.created_at
                   AND (cs.closed_at IS NULL OR cs.closed_at > p.created_at)
                 ORDER BY cs.opened_at DESC LIMIT 1)
           END);
    chequeo := 'Cada turno cuenta el efectivo que se movió mientras estaba abierto';
    esperado := 0; obtenido := v_n; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN v_n || ' movimiento(s) en efectivo fuera del turno en que pasaron' END;
    RETURN NEXT;

    -- Lo que se contó al cerrar un turno no cambia después
    SELECT count(*)::integer, string_agg(to_char(cs.opened_at AT TIME ZONE 'America/Bogota', 'DD/MM HH24:MI'), ', ')
      INTO v_n, v_txt
      FROM cash_sessions cs
     WHERE cs.store_id = v_store AND cs.status = 'closed' AND cs.expected_cash IS NOT NULL
       AND round(cs.expected_cash) <> (toul_cash_session_totals(cs.id)->>'expectedCash')::numeric;
    chequeo := 'Los turnos cerrados siguen dando lo mismo que al cerrarlos';
    esperado := 0; obtenido := v_n; ok := v_n = 0;
    detalle := CASE WHEN v_n > 0 THEN 'Turnos que cambiaron después de cerrarse: ' || v_txt END;
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


-- =================================================================
-- 17. Permisos
-- =================================================================
GRANT EXECUTE ON FUNCTION public.toul_registrar_gasto(text, numeric, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_update_expense(uuid, text, text, numeric, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_delete_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_registrar_movimiento(text, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_editar_movimiento(uuid, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_borrar_movimiento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_pagar_proveedor(uuid, numeric, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_cash_session_totals(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toul_set_seller_permissions(jsonb) TO authenticated;
