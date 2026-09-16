-- migration_v7_hotfix.sql
-- Fix: FOR ALL USING sin WITH CHECK no aplica para INSERT en Supabase.
-- Se reemplaza la política única por 4 políticas separadas.
-- IMPORTANTE: stores usa owner_id, no user_id.

DROP POLICY IF EXISTS "Users manage own categories" ON product_categories;

CREATE POLICY "select_own_categories" ON product_categories
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "insert_own_categories" ON product_categories
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "update_own_categories" ON product_categories
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  ) WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "delete_own_categories" ON product_categories
  FOR DELETE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );
