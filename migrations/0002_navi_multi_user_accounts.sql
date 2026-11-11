-- NAVI multi-user account foundation.
-- Additive only: preserves existing users, conversations, NAVI threads and memory.
-- Apply to production only after reviewing the backup and validating this migration on a copy.

ALTER TABLE users ADD COLUMN username TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
  ON users(username) WHERE username IS NOT NULL;

-- The existing NAVI data uses owner_id='owner'. Create the matching identity
-- without modifying or moving any existing conversation or memory rows.
INSERT OR IGNORE INTO users (
  id, auth_provider, auth_subject, display_name, role, status
) VALUES (
  'owner', 'navi-local', 'navi-owner', 'مالک', 'owner', 'active'
);

UPDATE users
SET role = 'owner',
    status = 'active',
    display_name = COALESCE(NULLIF(display_name, ''), 'مالک')
WHERE id = 'owner';
