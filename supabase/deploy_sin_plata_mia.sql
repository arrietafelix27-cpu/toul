-- =================================================================
-- TOUL · Sin "Plata mía" para lo nuevo
-- =================================================================
-- Desde ahora, un gasto, una compra pagada o un pago a proveedor se
-- pagan siempre con una cuenta del negocio. "Plata mía" ya no se puede
-- elegir y ya no se crea ningún "Metí plata" automático.
--
-- Lo viejo no cambia: lo que ya dice "Plata mía" se sigue viendo igual,
-- con su Metí plata al lado. Si se le corrige el monto, su Metí plata
-- lo sigue; y se puede pasar a una cuenta del negocio (como siempre).
-- Lo que no se puede es volver algo a "Plata mía".
--
-- No cambia ningún dato guardado, ni Ganaste, ni ventas, ni inventario,
-- ni ningún reporte, ni los turnos. Solo frena lo nuevo, y lo hace la
-- base: vale aunque alguien se salte la pantalla.
--
-- Va en la misma regla que ya obliga a decir con qué se pagó
-- (deploy_movimientos_cuentas.sql). Correrlo dos veces no hace nada nuevo.
-- Requiere deploy_movimientos_cuentas.sql.
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

    IF NEW.type IN ('expense', 'purchase', 'provider_payment') THEN
        -- "Plata mía" ya no existe para lo nuevo: ni al anotar, ni al
        -- cambiarle la cuenta a algo que ya estaba anotado
        IF NEW.own_money AND (TG_OP = 'INSERT' OR NOT OLD.own_money) THEN
            RAISE EXCEPTION 'Elige con qué cuenta del negocio pagaste';
        END IF;
        -- Lo nuevo siempre dice con qué se pagó (lo viejo "Sin cuenta" se
        -- puede corregir sin elegirle una)
        IF TG_OP = 'INSERT' AND NEW.method_id IS NULL THEN
            RAISE EXCEPTION 'Elige con qué pagaste';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Corre después de trg_payments_account, que ya resolvió la cuenta.
-- Ahora también al cambiar "Plata mía" en algo ya anotado
DROP TRIGGER IF EXISTS trg_payments_cuenta_obligatoria ON payments;
CREATE TRIGGER trg_payments_cuenta_obligatoria BEFORE INSERT OR UPDATE OF own_money ON payments
    FOR EACH ROW EXECUTE FUNCTION toul_cuenta_obligatoria();

SELECT 'Listo: "Plata mía" ya no se puede elegir. Lo viejo sigue igual' AS resultado;
