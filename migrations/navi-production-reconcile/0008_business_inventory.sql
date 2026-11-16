-- NAVA BUSINESS: stock tracking and auditable inventory movements.
-- Existing catalogue items remain untracked until the owner explicitly enables stock control.
ALTER TABLE business_catalog_items_v1
  ADD COLUMN track_inventory INTEGER NOT NULL DEFAULT 0 CHECK (track_inventory IN (0, 1));

CREATE TABLE IF NOT EXISTS business_inventory_movements_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  catalog_item_id TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','inbound','outbound','adjustment','sale','return')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  movement_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  reference_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES business_catalog_items_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_transaction_id) REFERENCES business_transactions_v1(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_business_inventory_item_date
  ON business_inventory_movements_v1 (business_id, owner_id, catalog_item_id, movement_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_inventory_owner
  ON business_inventory_movements_v1 (owner_id, business_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_inventory_sale_transaction
  ON business_inventory_movements_v1 (reference_transaction_id)
  WHERE reference_transaction_id IS NOT NULL AND movement_type = 'sale';
