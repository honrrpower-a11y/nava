-- NAVA BUSINESS: real sales and expense transactions, all monetary values in whole toman.
-- Run once against the production D1 database after deploying the Worker code.
UPDATE business_profiles_v1 SET currency = 'TOMAN' WHERE currency = 'IRR';

CREATE TABLE IF NOT EXISTS business_transactions_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale','expense')),
  title TEXT NOT NULL,
  amount_toman INTEGER NOT NULL CHECK (amount_toman > 0 AND amount_toman <= 1000000000000),
  transaction_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  quantity INTEGER,
  unit_price_toman INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (quantity IS NULL OR quantity > 0),
  CHECK (unit_price_toman IS NULL OR unit_price_toman > 0),
  CHECK (
    (transaction_type = 'expense' AND quantity IS NULL AND unit_price_toman IS NULL)
    OR transaction_type = 'sale'
  ),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_transactions_owner_business_date
  ON business_transactions_v1 (owner_id, business_id, transaction_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_transactions_business_type_date
  ON business_transactions_v1 (business_id, transaction_type, transaction_date DESC);
