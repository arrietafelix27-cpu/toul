-- ============================================================
-- TOUL — Schema SQL v1.0 (MVP) — CORREGIDO
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ORDEN CORRECTO: customers debe existir antes que sales
-- ============================================================

-- ============================================================
-- 1. TABLA: stores (negocios)
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general',
  currency     TEXT NOT NULL DEFAULT 'COP',
  logo_url     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners can manage their store"
  ON stores FOR ALL USING (owner_id = auth.uid());

-- ============================================================
-- 2. TABLA: products (productos del catálogo)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  sale_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  cpp           NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER DEFAULT 5,
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_store_id ON products(store_id);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_products"
  ON products FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 3. TABLA: inventory_batches (lotes de compra)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity      INTEGER NOT NULL,
  unit_cost     NUMERIC(12,2) NOT NULL,
  supplier      TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batches_store_id ON inventory_batches(store_id);
CREATE INDEX idx_batches_product_id ON inventory_batches(product_id);
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_batches"
  ON inventory_batches FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 4. TABLA: customers (clientes) — DEBE IR ANTES DE sales
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  total_debt  NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_store_id ON customers(store_id);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_customers"
  ON customers FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 5. TABLA: sales (ventas) — después de customers
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id    UUID REFERENCES customers(id) ON DELETE SET NULL,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  is_credit      BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_store_id ON sales(store_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_sales"
  ON sales FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 6. TABLA: sale_items (ítems de cada venta)
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id     UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL,
  unit_price  NUMERIC(12,2) NOT NULL,
  unit_cost   NUMERIC(12,2) NOT NULL,
  subtotal    NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_sale_items_store_id ON sale_items(store_id);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_sale_items"
  ON sale_items FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 7. TABLA: payments (movimientos de caja)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  method        TEXT NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  reference_id  UUID,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_store_id ON payments(store_id);
CREATE INDEX idx_payments_created_at ON payments(created_at);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_payments"
  ON payments FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 8. TABLA: expenses (gastos)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category       TEXT NOT NULL DEFAULT 'otros',
  description    TEXT,
  amount         NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'efectivo',
  receipt_url    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_store_id ON expenses(store_id);
CREATE INDEX idx_expenses_created_at ON expenses(created_at);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_expenses"
  ON expenses FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 9. TABLA: credits (créditos y abonos de clientes)
-- ============================================================
CREATE TABLE IF NOT EXISTS credits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id        UUID REFERENCES sales(id) ON DELETE SET NULL,
  type           TEXT NOT NULL,
  amount         NUMERIC(12,2) NOT NULL,
  payment_method TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credits_store_id ON credits(store_id);
CREATE INDEX idx_credits_customer_id ON credits(customer_id);
ALTER TABLE credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_credits"
  ON credits FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- ============================================================
-- 10. TABLA: ai_insights (cache del AI Manager)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_insights (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  insights     JSONB NOT NULL DEFAULT '[]',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_isolation_ai_insights"
  ON ai_insights FOR ALL USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );
