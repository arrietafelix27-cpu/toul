-- ============================================================
-- TOUL 2.0 — Migration v4 (Appearance & Theming)
-- Run in Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Add appearance column to stores table
ALTER TABLE stores ADD COLUMN IF NOT EXISTS appearance JSONB DEFAULT '{"theme": "light", "colors": {"primary": "#10B981", "secondary": "#A855F7", "accent": "#6366F1"}}';

-- 2. Update existing stores with default appearance if null (safety)
UPDATE stores SET appearance = '{"theme": "light", "colors": {"primary": "#10B981", "secondary": "#A855F7", "accent": "#6366F1"}}' WHERE appearance IS NULL;
