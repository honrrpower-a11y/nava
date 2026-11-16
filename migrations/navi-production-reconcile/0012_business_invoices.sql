-- NAVA BUSINESS: proforma and issued invoices with immutable item snapshots.
-- Additive only. Existing orders, transactions and receipts remain intact.

CREATE TABLE IF NOT EXISTS business_invoices_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK(document_type IN ('proforma','invoice')),
  invoice_sequence INTEGER NOT NULL CHECK(invoice_sequence > 0),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','voided')),
  issue_date TEXT NOT NULL,
  due_date TEXT,
  seller_name TEXT NOT NULL DEFAULT '',
  customer_id TEXT,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_phone TEXT NOT NULL DEFAULT '',
  customer_address TEXT NOT NULL DEFAULT '',
  subtotal_toman INTEGER NOT NULL CHECK(subtotal_toman > 0),
  discount_toman INTEGER NOT NULL DEFAULT 0 CHECK(discount_toman >= 0),
  tax_toman INTEGER NOT NULL DEFAULT 0 CHECK(tax_toman >= 0),
  shipping_toman INTEGER NOT NULL DEFAULT 0 CHECK(shipping_toman >= 0),
  total_toman INTEGER NOT NULL CHECK(total_toman > 0 AND total_toman <= 1000000000000),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES business_orders_v1(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES business_customers_v1(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_invoice_order_type
  ON business_invoices_v1(owner_id,business_id,order_id,document_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_business_invoice_number
  ON business_invoices_v1(owner_id,business_id,document_type,invoice_sequence);
CREATE INDEX IF NOT EXISTS idx_business_invoices_date
  ON business_invoices_v1(owner_id,business_id,issue_date DESC,created_at DESC);

CREATE TABLE IF NOT EXISTS business_invoice_items_v1 (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  catalog_item_id TEXT,
  item_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'عدد',
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price_toman INTEGER NOT NULL CHECK(unit_price_toman > 0),
  line_total_toman INTEGER NOT NULL CHECK(line_total_toman > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (invoice_id) REFERENCES business_invoices_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_business_invoice_items_invoice
  ON business_invoice_items_v1(owner_id,business_id,invoice_id,created_at);

ALTER TABLE business_customer_payments_v1
  ADD COLUMN invoice_id TEXT REFERENCES business_invoices_v1(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_customer_payments_invoice
  ON business_customer_payments_v1(owner_id,business_id,invoice_id,status);
