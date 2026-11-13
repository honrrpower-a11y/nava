-- NAVI project workspace foundation.
-- Additive only: existing conversation messages and approved memories are preserved.
-- Legacy conversations are assigned to the general workspace.
-- Existing memory facts remain account-wide (project_id NULL) until scoped-memory
-- management is introduced in a separate, backwards-compatible step.

CREATE TABLE IF NOT EXISTS navi_projects_v1 (
  project_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_id, project_id),
  UNIQUE (owner_id, slug)
);

ALTER TABLE navi_chat_threads_v1
  ADD COLUMN project_id TEXT NOT NULL DEFAULT 'project-general';

ALTER TABLE navi_memory_facts_v1
  ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_navi_threads_owner_project_updated
  ON navi_chat_threads_v1 (owner_id, project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_navi_memory_owner_project_status_updated
  ON navi_memory_facts_v1 (owner_id, project_id, status, updated_at DESC, id DESC);
