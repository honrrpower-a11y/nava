-- NAVI owner-approved registration queue.
-- Additive only: existing accounts, threads and memory remain untouched.
-- Apply only after validating on a database copy and taking a production backup.

CREATE TABLE IF NOT EXISTS navi_registration_requests (
  request_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewed_by TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_navi_registration_pending_username
  ON navi_registration_requests(username)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_navi_registration_status_created
  ON navi_registration_requests(status, created_at);
