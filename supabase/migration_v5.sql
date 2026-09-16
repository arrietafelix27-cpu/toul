-- ============================================================
-- TOUL Migration v5 — Variantes, Combos y Stock centralizado
-- ============================================================

-- PASO 1: Migrar stock actual a inventory_adjustments como ajuste inicial
INSERT INTO inventory_adjustments (store_id, product_id, quantity, reason, notes, created_at)
SELECT store_id, id, stock, 'initial', 'Stock inicial migrado desde tabla products (migration v5)', now()
FROM products WHERE stock > 0;

-- PASO 2: Eliminar columna stock de products (mantenemos low_stock_threshold)
ALTER TABLE products DROP COLUMN IF EXISTS stock;

-- PASO 3: product_variants — sin columna stock (stock vive en inventory_adjustments)
CREATE TABLE IF NOT EXISTS product_variants (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id          UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  sale_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price          NUMERIC(12,2) NOT NULL DEFAULT 0,
  cpp                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER       DEFAULT 5,
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_store_id   ON product_variants(store_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_isolation_product_variants ON product_variants
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- PASO 4: product_variant_attributes — atributos de variante (ej: "Talla", "Color")
CREATE TABLE IF NOT EXISTS product_variant_attributes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pva_product_id ON product_variant_attributes(product_id);

ALTER TABLE product_variant_attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_isolation_pva ON product_variant_attributes
  USING (product_id IN (SELECT id FROM products WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())));

-- PASO 5: combos
CREATE TABLE IF NOT EXISTS combos (
  id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID          NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT          NOT NULL,
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url  TEXT,
  is_active  BOOLEAN       NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combos_store_id ON combos(store_id);

ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_isolation_combos ON combos
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- PASO 6: combo_items — exactamente un producto O una variante por fila
CREATE TABLE IF NOT EXISTS combo_items (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id   UUID    NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  product_id UUID    REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID    REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity   INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT combo_item_single_ref CHECK (
    (product_id IS NOT NULL AND variant_id IS NULL) OR
    (product_id IS NULL  AND variant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo_id   ON combo_items(combo_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_product_id ON combo_items(product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_variant_id ON combo_items(variant_id);

ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_isolation_combo_items ON combo_items
  USING (combo_id IN (SELECT id FROM combos WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())));

-- PASO 7: Agregar variant_id a tablas existentes
ALTER TABLE sale_items             ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE purchase_items         ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE inventory_adjustments  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
