-- NAVA BUSINESS: customer CRM and draft-to-sale order workflow.
-- Orders remain drafts until explicitly confirmed. Stock is deducted only on confirmation.
CREATE TABLE IF NOT EXISTS business_customers_v1 (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_business_customers_owner_business
  ON business_customers_v1(owner_id,business_id,status,name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS business_orders_v1 (
  id TEXT PRIMARY KEY, business_id TEXT NOT NULL, owner_id TEXT NOT NULL, customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  order_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  total_toman INTEGER NOT NULL CHECK (total_toman > 0 AND total_toman <= 1000000000000),
  converted_transaction_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES business_customers_v1(id) ON DELETE SET NULL,
  FOREIGN KEY (converted_transaction_id) REFERENCES business_transactions_v1(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_business_orders_owner_business_date
  ON business_orders_v1(owner_id,business_id,order_date DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS business_order_items_v1 (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL, business_id TEXT NOT NULL, owner_id TEXT NOT NULL,
  catalog_item_id TEXT, item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_toman INTEGER NOT NULL CHECK (unit_price_toman > 0),
  line_total_toman INTEGER NOT NULL CHECK (line_total_toman > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES business_orders_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_item_id) REFERENCES business_catalog_items_v1(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_business_order_items_order ON business_order_items_v1(order_id,created_at);
-- An order can create one sale movement for each distinct tracked catalogue item.
DROP INDEX IF EXISTS uq_business_inventory_sale_transaction;
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_inventory_sale_transaction_item
  ON business_inventory_movements_v1(reference_transaction_id,catalog_item_id)
  WHERE reference_transaction_id IS NOT NULL AND movement_type='sale';
