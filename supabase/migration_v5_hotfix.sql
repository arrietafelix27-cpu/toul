-- ============================================================
-- TOUL Migration v5 — Hotfix
-- ============================================================
-- Context: migration_v5.sql dropped products.stock but all routes
-- (sales, purchases, inventory/adjust) read and write it directly.
-- This hotfix restores the column and then drops the trigger that
-- was added as a workaround (trigger was wrong because sales and
-- purchases bypass inventory_adjustments entirely).

-- Step 1: Restore stock column
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;

-- Step 2: Recompute from inventory_adjustments (covers initial migration data)
UPDATE products p
SET stock = COALESCE((
    SELECT SUM(quantity)
    FROM inventory_adjustments
    WHERE product_id = p.id
), 0);

-- Step 3: Drop trigger (was causing incorrect stock from SUM that excluded sales/purchases)
DROP TRIGGER IF EXISTS trg_sync_product_stock ON inventory_adjustments;
DROP FUNCTION IF EXISTS sync_product_stock();

-- NOTE: Full stock centralization in inventory_adjustments requires refactoring
-- app/api/sales/route.ts and app/api/purchases/route.ts — deferred.
