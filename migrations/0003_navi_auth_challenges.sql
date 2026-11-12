-- One-time, replay-resistant login challenges for browser-side PBKDF2 authentication.
-- Additive only: does not modify users, conversations, threads, or memory.
CREATE TABLE IF NOT EXISTS navi_auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_navi_auth_challenges_expiry
  ON navi_auth_challenges(expires_at);

CREATE INDEX IF NOT EXISTS idx_navi_auth_challenges_user
  ON navi_auth_challenges(user_id, expires_at);
