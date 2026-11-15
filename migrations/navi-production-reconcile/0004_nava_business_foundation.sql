-- NAVA BUSINESS: isolated business workspaces and financial records.
-- Additive migration. Existing NAVI conversations, memory and user rows are untouched.

CREATE TABLE IF NOT EXISTS business_profiles_v1 (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'other'
    CHECK (business_type IN ('freelancer','store','home_business','small_company','idea','other')),
  industry TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'IRR',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_profiles_owner_status_updated
  ON business_profiles_v1 (owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS business_financial_records_v1 (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  record_type TEXT NOT NULL
    CHECK (record_type IN ('cost_calculation','break_even','monthly_budget','note')),
  title TEXT NOT NULL,
  period_key TEXT NOT NULL DEFAULT '',
  report_text TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (business_id) REFERENCES business_profiles_v1(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_business_financial_owner_business_created
  ON business_financial_records_v1 (owner_id, business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_financial_business_type_period
  ON business_financial_records_v1 (business_id, record_type, period_key);
