-- ============================================================
-- TOUL 2.0 — Migration v2
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. New columns on products
ALTER TABLE products ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';

-- 2. New columns on sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS initial_payment NUMERIC(12,2) NOT NULL DEFAULT 0;

-- 3. payment_methods table (store-configurable)
CREATE TABLE IF NOT EXISTS payment_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#10B981',
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_store_id ON payment_methods(store_id);
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_payment_methods"
  ON payment_methods FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- 4. sale_payments table (multi-method per sale)
CREATE TABLE IF NOT EXISTS sale_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  method_id  UUID NOT NULL REFERENCES payment_methods(id),
  amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_store_id ON sale_payments(store_id);
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_sale_payments"
  ON sale_payments FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );
