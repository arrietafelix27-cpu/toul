-- =================================================================
-- TOUL v22 — Básico y Pro
-- =================================================================
-- TOUL va a tener dos planes: el básico y el Pro. Lo que los separa
-- es el punto físico —turnos de caja y aprobaciones—, porque es lo
-- único que solo necesita quien vende en un local o una isla. Quien
-- vende por Instagram no tiene un cajón que cuadrar.
--
-- Esto solo marca qué plan tiene cada tienda. El cobro todavía no
-- existe: cuando exista, lo único que cambia es quién escribe esta
-- columna.
--
-- Las tiendas que ya venían usando la isla quedan en Pro, para que
-- a nadie se le apague algo que ya estaba usando.
--
-- Se puede ejecutar varias veces sin romper nada.
-- =================================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basico';

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_plan_check;
ALTER TABLE stores ADD CONSTRAINT stores_plan_check CHECK (plan IN ('basico', 'pro'));

-- Nadie pierde lo que ya estaba usando: si la tienda tiene turnos
-- de caja o vendedores, es porque tiene un punto físico
UPDATE stores s
   SET plan = 'pro'
 WHERE s.plan = 'basico'
   AND (
        EXISTS (SELECT 1 FROM cash_sessions c WHERE c.store_id = s.id)
     OR EXISTS (SELECT 1 FROM store_members m WHERE m.store_id = s.id)
   );

COMMENT ON COLUMN stores.plan IS
    'basico | pro — Pro incluye el punto físico: turnos de caja y aprobaciones';
