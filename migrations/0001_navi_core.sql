-- NAVI preview database schema
-- Safe to apply only to nava-memory-preview.
-- This migration creates the tables used by modules/navi-memory.js.

CREATE TABLE IF NOT EXISTS navi_chat_threads_v1 (
  thread_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_navi_chat_threads_owner_updated
  ON navi_chat_threads_v1 (owner_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS navi_chat_messages_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES navi_chat_threads_v1(thread_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_navi_chat_messages_thread_id
  ON navi_chat_messages_v1 (thread_id, id DESC);

CREATE TABLE IF NOT EXISTS navi_memory_facts_v1 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'navi',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_navi_memory_owner_status_updated
  ON navi_memory_facts_v1 (owner_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_navi_memory_owner_key_status
  ON navi_memory_facts_v1 (owner_id, memory_key, status);
