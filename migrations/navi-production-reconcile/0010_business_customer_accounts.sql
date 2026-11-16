-- NAVA BUSINESS: customer-linked sales and auditable customer receipts.
ALTER TABLE business_transactions_v1
  ADD COLUMN customer_id TEXT REFERENCES business_customers_v1(id) ON DELETE SET NULL;

-- Preserve customer links for already-confirmed orders created before this migration.
UPDATE business_transactions_v1
SET customer_id = (
  SELECT o.customer_id FROM business_orders_v1 o
  WHERE o.converted_transaction_id = business_transactions_v1.id
    AND o.business_id = business_transactions_v1.business_id
    AND o.owner_id = business_transactions_v1.owner_id
)
WHERE transaction_type = 'sale' AND customer_id IS NULL
  AND EXISTS (
    SELECT 1 FROM business_orders_v1 o
    WHERE o.converted_transaction_id = business_transactions_v1.id
      AND o.customer_id IS NOT NULL
      AND o.business_id = business_transactions_v1.business_id
      AND o.owner_id = business_transactions_v1.owner_id
  );

CREATE INDEX IF NOT EXISTS idx_business_transactions_customer_account
  ON business_transactions_v1(owner_id,business_id,customer_id,transaction_type,transaction_date);

CREATE TABLE IF NOT EXISTS business_customer_payments_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  amount_toman INTEGER NOT NULL CHECK(amount_toman > 0 AND amount_toman <= 1000000000000),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','card','bank_transfer','other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','voided')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES business_customers_v1(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_business_customer_payments_account
  ON business_customer_payments_v1(owner_id,business_id,customer_id,status,payment_date DESC);
