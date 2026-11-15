-- NAVA BUSINESS: account-scoped catalogue of products and services.
-- Additive migration; existing profiles, financial records and transactions are untouched.

CREATE TABLE IF NOT EXISTS business_catalog_items_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('product','service')),
  name TEXT NOT NULL,
  sku TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'عدد',
  sale_price_toman INTEGER NOT NULL DEFAULT 0 CHECK (sale_price_toman >= 0),
  cost_price_toman INTEGER CHECK (cost_price_toman IS NULL OR cost_price_toman >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_catalog_owner_business_status
  ON business_catalog_items_v1 (owner_id, business_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_catalog_business_type
  ON business_catalog_items_v1 (business_id, item_type, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_catalog_business_sku
  ON business_catalog_items_v1 (business_id, sku COLLATE NOCASE)
  WHERE sku <> '';
