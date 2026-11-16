-- NAVA BUSINESS: supplier payables, cash accounts and auditable cash movements.
-- Additive only. Existing sales, expenses, customer receipts and stock movements are preserved.

ALTER TABLE business_transactions_v1
  ADD COLUMN supplier_id TEXT;

ALTER TABLE business_customer_payments_v1
  ADD COLUMN cash_account_id TEXT;

CREATE TABLE IF NOT EXISTS business_suppliers_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_suppliers_owner_business
  ON business_suppliers_v1(owner_id,business_id,status,name);

CREATE TABLE IF NOT EXISTS business_cash_accounts_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('cash','bank','card','other')),
  opening_balance_toman INTEGER NOT NULL DEFAULT 0 CHECK(opening_balance_toman >= 0 AND opening_balance_toman <= 1000000000000),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_cash_accounts_owner_business
  ON business_cash_accounts_v1(owner_id,business_id,status);

CREATE TABLE IF NOT EXISTS business_cash_movements_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  cash_account_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('in','out')),
  amount_toman INTEGER NOT NULL CHECK(amount_toman > 0 AND amount_toman <= 1000000000000),
  movement_date TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('customer_receipt','expense_payment','manual_inflow','manual_outflow','transfer_in','transfer_out')),
  source_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'other' CHECK(method IN ('cash','card','bank_transfer','other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','voided')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_account_id) REFERENCES business_cash_accounts_v1(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_business_cash_movements_account_date
  ON business_cash_movements_v1(owner_id,business_id,cash_account_id,movement_date DESC,created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_cash_movement_source
  ON business_cash_movements_v1(source_type,source_id)
  WHERE source_id <> '' AND source_type IN ('customer_receipt','expense_payment');

CREATE TABLE IF NOT EXISTS business_expense_payments_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  supplier_id TEXT,
  cash_account_id TEXT NOT NULL,
  amount_toman INTEGER NOT NULL CHECK(amount_toman > 0 AND amount_toman <= 1000000000000),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','card','bank_transfer','other')),
  reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','voided')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (transaction_id) REFERENCES business_transactions_v1(id) ON DELETE RESTRICT,
  FOREIGN KEY (supplier_id) REFERENCES business_suppliers_v1(id) ON DELETE RESTRICT,
  FOREIGN KEY (cash_account_id) REFERENCES business_cash_accounts_v1(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_business_expense_payments_transaction
  ON business_expense_payments_v1(owner_id,business_id,transaction_id,status,payment_date);

-- Every existing business receives one primary cash account. Old customer receipts are
-- imported as opening historical cash movements; no old expense is assumed to be paid.
INSERT INTO business_cash_accounts_v1(
  id,business_id,owner_id,name,account_type,opening_balance_toman,status,created_at,updated_at
)
SELECT 'cash-'||lower(hex(randomblob(16))),b.id,b.owner_id,'صندوق اصلی','cash',0,'active',datetime('now'),datetime('now')
FROM business_profiles_v1 b
WHERE NOT EXISTS(
  SELECT 1 FROM business_cash_accounts_v1 a
  WHERE a.business_id=b.id AND a.owner_id=b.owner_id AND a.status='active'
);

UPDATE business_customer_payments_v1
SET cash_account_id=(
  SELECT a.id FROM business_cash_accounts_v1 a
  WHERE a.business_id=business_customer_payments_v1.business_id
    AND a.owner_id=business_customer_payments_v1.owner_id
    AND a.status='active'
  ORDER BY a.created_at,a.id LIMIT 1
)
WHERE status='received' AND cash_account_id IS NULL;

INSERT INTO business_cash_movements_v1(
  id,business_id,owner_id,cash_account_id,direction,amount_toman,movement_date,
  source_type,source_id,title,method,reference,notes,status,created_at
)
SELECT 'cashmove-'||lower(hex(randomblob(16))),p.business_id,p.owner_id,p.cash_account_id,
  'in',p.amount_toman,p.payment_date,'customer_receipt',p.id,
  'دریافت از مشتری','other',p.reference,p.notes,'active',p.created_at
FROM business_customer_payments_v1 p
WHERE p.status='received' AND p.cash_account_id IS NOT NULL
  AND NOT EXISTS(
    SELECT 1 FROM business_cash_movements_v1 m
    WHERE m.source_type='customer_receipt' AND m.source_id=p.id
  );
