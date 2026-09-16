-- migration_v8.sql — category_id en combos
--
-- Antes de v8 los combos no podían pertenecer a una categoría.
-- Esto agrega la columna category_id a combos con FK a product_categories,
-- mismo patrón que products (migración v7).
-- ON DELETE SET NULL: si se borra la categoría, los combos quedan "Sin categoría"
-- (no se eliminan en cascada).

ALTER TABLE combos
  ADD COLUMN IF NOT EXISTS category_id UUID
  REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_combos_category_id ON combos(category_id);
