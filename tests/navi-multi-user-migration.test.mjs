import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("account migration is additive and preserves existing users", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      auth_provider TEXT,
      auth_subject TEXT UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (id, auth_provider, auth_subject, display_name)
    VALUES ('existing-oauth-user', 'google', 'google-subject-1', 'Existing User');
  `);
  const migration = readFileSync(new URL("../migrations/0002_navi_multi_user_accounts.sql", import.meta.url), "utf8");
  db.exec(migration);

  const columns = db.prepare("PRAGMA table_info(users)").all().map(row => row.name);
  for (const column of ["username", "password_hash", "role", "status"]) {
    assert.ok(columns.includes(column), "missing " + column);
  }

  const existing = db.prepare("SELECT id, display_name, auth_provider FROM users WHERE id = ?").get("existing-oauth-user");
  assert.equal(existing.display_name, "Existing User");
  assert.equal(existing.auth_provider, "google");

  const owner = db.prepare("SELECT id, username, role, status FROM users WHERE id = ?").get("owner");
  assert.deepEqual(
    { id: owner.id, username: owner.username, role: owner.role, status: owner.status },
    { id: "owner", username: "owner", role: "owner", status: "active" }
  );

  db.close();
});

test("account migration enforces unique usernames without constraining legacy null usernames", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      auth_provider TEXT,
      auth_subject TEXT UNIQUE,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.exec(readFileSync(new URL("../migrations/0002_navi_multi_user_accounts.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("user-a", "navi-local", "user-a", "A", "same-name", "hash-a", "user", "active");
  assert.throws(() => {
    db.prepare("INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("user-b", "navi-local", "user-b", "B", "same-name", "hash-b", "user", "active");
  }, /UNIQUE constraint failed/);
  db.close();
});
