-- ============================================================
-- TOUL 2.0 — Migration v3 (Database Infrastructure and Storage)
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- ==========================================
-- 1. Storage Bucket & Policies for product-images
-- ==========================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true) 
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Authenticated Users can upload images" ON storage.objects;
CREATE POLICY "Authenticated Users can upload images"
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Authenticated Users can update images" ON storage.objects;
CREATE POLICY "Authenticated Users can update images"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'product-images' );

DROP POLICY IF EXISTS "Authenticated Users can delete images" ON storage.objects;
CREATE POLICY "Authenticated Users can delete images"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'product-images' );

-- ==========================================
-- 2. New Backend Infrastructure Tables
-- ==========================================

-- Providers table
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  document_id TEXT,
  total_debt NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_providers_store_id ON providers(store_id);
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_providers" ON providers;
CREATE POLICY "store_isolation_providers"
  ON providers FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL, -- 'cash', 'credit', 'capital'
  is_credit BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_store_id ON purchases(store_id);
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_purchases" ON purchases;
CREATE POLICY "store_isolation_purchases"
  ON purchases FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Purchase Items table
CREATE TABLE IF NOT EXISTS purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,2) NOT NULL,
  total_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_purchase_items" ON purchase_items;
CREATE POLICY "store_isolation_purchase_items"
  ON purchase_items FOR ALL USING (
    purchase_id IN (
      SELECT p.id FROM purchases p
      JOIN stores s ON p.store_id = s.id
      WHERE s.owner_id = auth.uid()
    )
  );

-- Purchase Payments table (for multiple payment items/abonos)
CREATE TABLE IF NOT EXISTS purchase_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_id ON purchase_payments(purchase_id);
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_purchase_payments" ON purchase_payments;
CREATE POLICY "store_isolation_purchase_payments"
  ON purchase_payments FOR ALL USING (
    purchase_id IN (
      SELECT p.id FROM purchases p
      JOIN stores s ON p.store_id = s.id
      WHERE s.owner_id = auth.uid()
    )
  );

-- Provider Debts table (Accounts Payable)
CREATE TABLE IF NOT EXISTS provider_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  remaining_amount NUMERIC(12,2) NOT NULL,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pd_store_id ON provider_debts(store_id);
ALTER TABLE provider_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_provider_debts" ON provider_debts;
CREATE POLICY "store_isolation_provider_debts"
  ON provider_debts FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Inventory Adjustments (Merma)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ia_store_id ON inventory_adjustments(store_id);
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_ia" ON inventory_adjustments;
CREATE POLICY "store_isolation_ia"
  ON inventory_adjustments FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- Owner Capital Injections
CREATE TABLE IF NOT EXISTS owner_capital_injections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reference_type TEXT, -- e.g., 'purchase', 'purchase_payment'
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oci_store_id ON owner_capital_injections(store_id);
ALTER TABLE owner_capital_injections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "store_isolation_oci" ON owner_capital_injections;
CREATE POLICY "store_isolation_oci"
  ON owner_capital_injections FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );
