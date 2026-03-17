-- ============================================================
-- TOUL — CLEANUP SCRIPT (RESET TO ZERO)
-- DANGER: This script deletes all transactional and master data.
-- ============================================================

-- 1. Sales & Items
DELETE FROM sale_items;
DELETE FROM sale_payments;
DELETE FROM sales;

-- 2. Purchases & Items
DELETE FROM purchase_items;
DELETE FROM purchase_payments;
DELETE FROM purchases;

-- 3. Inventory Movements
DELETE FROM inventory_batches;
DELETE FROM inventory_adjustments;

-- 4. Debts & Credits
DELETE FROM credits;
DELETE FROM provider_debts;

-- 5. Financials
DELETE FROM payments;
DELETE FROM expenses;
DELETE FROM owner_capital_injections;

-- 6. Insights
DELETE FROM ai_insights;

-- 7. Master Data (Products, Customers, Providers)
DELETE FROM products;
DELETE FROM customers;
DELETE FROM providers;

-- NOTE: We KEEP the 'stores' and 'payment_methods' tables as they define the account structure.
