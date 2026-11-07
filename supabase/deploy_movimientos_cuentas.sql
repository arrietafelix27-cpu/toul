-- =================================================================
-- TOUL · Movimientos, paso 3: la cuenta es obligatoria
-- =================================================================
-- Desde ahora, todo gasto, compra pagada y pago a proveedor dice con qué
-- se pagó: una cuenta de la tienda o "Plata mía". Ya no se puede anotar
-- sin cuenta (lo que antes quedaba como "General").
--
-- Lo viejo no cambia: lo que ya está sin cuenta se sigue viendo "Sin
-- cuenta", y se puede corregir (nota, categoría o monto) sin elegirle una.
--
-- Va en el libro de plata: así vale para la app, para cualquier función
-- que anote ahí y para lo que venga después. Correrlo dos veces no hace
-- nada nuevo.
-- Requiere deploy_movimientos.sql.
-- =================================================================

CREATE OR REPLACE FUNCTION public.toul_cuenta_obligatoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
BEGIN
    -- Lo que no viene de una persona (el editor de SQL, lo viejo que se
    -- copia) no pasa por aquí
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;

    IF NEW.type IN ('expense', 'purchase', 'provider_payment')
       AND NOT NEW.own_money AND NEW.method_id IS NULL THEN
        RAISE EXCEPTION 'Elige con qué pagaste';
    END IF;
    RETURN NEW;
END;
$$;

-- Corre después de trg_payments_account, que ya resolvió la cuenta
DROP TRIGGER IF EXISTS trg_payments_cuenta_obligatoria ON payments;
CREATE TRIGGER trg_payments_cuenta_obligatoria BEFORE INSERT ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_cuenta_obligatoria();

SELECT 'Listo: la cuenta ya es obligatoria' AS resultado;
