-- ============================================================
-- TOUL Migration v6 — Centralización completa del stock
-- inventory_adjustments es la única fuente de verdad
-- Cantidades signadas: positivo = entrada, negativo = salida
-- products.stock se mantiene como caché via trigger
-- ============================================================

-- PASO 1: Voltear registros de ajuste existentes (positivos → negativos)
-- Solo los de type='reduction' que ya existían con cantidad positiva
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_adjustments' AND column_name = 'type'
  ) THEN
    UPDATE inventory_adjustments
    SET quantity = -quantity
    WHERE type = 'reduction' AND quantity > 0;
  END IF;
END $$;

-- PASO 2: Insertar registro de reconciliación por cada producto
-- Cubre la brecha entre inventory_adjustments (incompleto) y products.stock (correcto)
-- Resultado: SUM(inventory_adjustments) = products.stock para cada producto
INSERT INTO inventory_adjustments (store_id, product_id, quantity, reason, notes, created_at)
SELECT
  p.store_id,
  p.id,
  p.stock - COALESCE((SELECT SUM(ia.quantity) FROM inventory_adjustments ia WHERE ia.product_id = p.id), 0),
  'reconciliation',
  'Reconciliación migration v6 — alineación con stock real antes de centralizar',
  now()
FROM products p
WHERE p.stock - COALESCE((SELECT SUM(ia.quantity) FROM inventory_adjustments ia WHERE ia.product_id = p.id), 0) != 0;

-- PASO 3: Crear trigger que mantiene products.stock sincronizado automáticamente
CREATE OR REPLACE FUNCTION sync_product_stock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE products SET stock = COALESCE(
      (SELECT SUM(quantity) FROM inventory_adjustments WHERE product_id = OLD.product_id), 0
    ) WHERE id = OLD.product_id;
    RETURN OLD;
  ELSE
    UPDATE products SET stock = COALESCE(
      (SELECT SUM(quantity) FROM inventory_adjustments WHERE product_id = NEW.product_id), 0
    ) WHERE id = NEW.product_id;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock ON inventory_adjustments;
CREATE TRIGGER trg_sync_product_stock
AFTER INSERT OR UPDATE OR DELETE ON inventory_adjustments
FOR EACH ROW EXECUTE FUNCTION sync_product_stock();
