-- migration_v9.sql — Combos en sale_items
--
-- Antes de v9, sale_items.product_id era NOT NULL, lo que impedía registrar
-- combos como filas en sale_items. El POS los procesaba pero NO aparecían en
-- el historial de ventas (solo se descontaba el stock de los componentes).
--
-- Esta migración:
--   1. Hace product_id NULLABLE
--   2. Agrega columna combo_id con FK a combos
--   3. Agrega CHECK constraint: exactamente uno de los dos debe ser NOT NULL
--   4. Crea índice en combo_id para queries del historial
--
-- DEBE aplicarse ANTES del RPC process_sale (migration v10) si quieres que
-- el RPC inserte filas para combos. El RPC valida la columna y la usa solo
-- si existe.

-- 1. Agregar columna combo_id
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS combo_id UUID
  REFERENCES combos(id) ON DELETE SET NULL;

-- 2. Quitar NOT NULL de product_id (sólo si todavía está NOT NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sale_items'
      AND column_name = 'product_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL;
  END IF;
END $$;

-- 3. CHECK constraint: exactamente UNO de product_id / combo_id debe ser NOT NULL.
--    (variant_id sigue siendo opcional dentro del caso product_id.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'sale_items'
      AND constraint_name = 'sale_items_product_or_combo'
  ) THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT sale_items_product_or_combo CHECK (
        (product_id IS NOT NULL AND combo_id IS NULL) OR
        (product_id IS NULL  AND combo_id IS NOT NULL)
      );
  END IF;
END $$;

-- 4. Índice en combo_id
CREATE INDEX IF NOT EXISTS idx_sale_items_combo_id ON sale_items(combo_id);
