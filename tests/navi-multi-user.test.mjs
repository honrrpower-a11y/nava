import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  ensureNaviMainThread,
  getNaviMainThreadId,
  getNaviApprovedMemory,
  getNaviPendingMemory,
  getNaviArchivedMemory,
  getNaviDbHistory,
  saveNaviConversation,
  saveNaviMemoryFact,
  searchNaviConversationHistory
} from "../modules/navi-memory.js";

function createDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE navi_chat_threads_v1 (
      thread_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT NOT NULL DEFAULT 'project-general',
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE navi_projects_v1 (
      project_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (owner_id, project_id),
      UNIQUE (owner_id, slug)
    );
    CREATE TABLE navi_chat_messages_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE navi_memory_facts_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      memory_value TEXT NOT NULL,
      source TEXT,
      status TEXT NOT NULL,
      project_id TEXT,
      created_at TEXT,
      updated_at TEXT
    );
  `);
  return {
    sqlite,
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
        }
      };
      return statement;
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };
}

test("each account receives a separate main thread while the owner keeps the legacy ID", async () => {
  const db = createDb();
  await ensureNaviMainThread(db, "owner");
  await ensureNaviMainThread(db, "user-a");
  await ensureNaviMainThread(db, "user-b");
  assert.equal(getNaviMainThreadId("owner"), "owner-main");
  assert.equal(getNaviMainThreadId("user-a"), "user-a-main");
  const rows = db.sqlite.prepare("SELECT thread_id, owner_id FROM navi_chat_threads_v1 ORDER BY owner_id").all().map(row => ({ thread_id: row.thread_id, owner_id: row.owner_id }));
  assert.deepEqual(rows, [
    { thread_id: "owner-main", owner_id: "owner" },
    { thread_id: "user-a-main", owner_id: "user-a" },
    { thread_id: "user-b-main", owner_id: "user-b" }
  ]);
  db.sqlite.close();
});

test("memory reads and writes are isolated by owner_id", async () => {
  const db = createDb();
  await saveNaviMemoryFact(db, "ترجیح حساب اول پاسخ کوتاه است", "ترجیحات", "test", "user-a");
  await saveNaviMemoryFact(db, "ترجیح حساب دوم پاسخ مفصل است", "ترجیحات", "test", "user-b");
  const a = await getNaviApprovedMemory(db, "user-a");
  const b = await getNaviApprovedMemory(db, "user-b");
  assert.equal(a.length, 1);
  assert.match(a[0].memory_value, /حساب اول/);
  assert.equal(b.length, 1);
  assert.match(b[0].memory_value, /حساب دوم/);
  db.sqlite.close();
});

test("history and semantic search never return another account's messages", async () => {
  const db = createDb();
  await ensureNaviMainThread(db, "user-a");
  await ensureNaviMainThread(db, "user-b");
  await saveNaviConversation(db, "کلیدواژه‌مخفی‌منحصر‌به‌فرد‌اول", "پاسخ خصوصی اول", getNaviMainThreadId("user-a"), "user-a");
  await saveNaviConversation(db, "اطلاعات خصوصی حساب دوم درباره ورزش", "پاسخ خصوصی دوم", getNaviMainThreadId("user-b"), "user-b");

  const aHistory = await getNaviDbHistory(db, 10, getNaviMainThreadId("user-a"), "user-a");
  const bHistory = await getNaviDbHistory(db, 10, getNaviMainThreadId("user-b"), "user-b");
  assert.equal(aHistory.length, 2);
  assert.equal(bHistory.length, 2);

  const crossHistory = await getNaviDbHistory(db, 10, getNaviMainThreadId("user-a"), "user-b");
  assert.deepEqual(crossHistory, []);

  const bSearch = await searchNaviConversationHistory(db, "کلیدواژه‌مخفی‌منحصر‌به‌فرد‌اول", 8, [], "user-b");
  assert.deepEqual(bSearch, []);
  db.sqlite.close();
});

test("saving to a thread owned by another account is rejected", async () => {
  const db = createDb();
  await ensureNaviMainThread(db, "user-a");
  await assert.rejects(
    () => saveNaviConversation(db, "پیام", "پاسخ", getNaviMainThreadId("user-a"), "user-b"),
    /does not belong to this user/
  );
  db.sqlite.close();
});

test("legacy unscoped notes stay in General while only approved account-wide keys cross projects", async () => {
  const db = createDb();
  await saveNaviMemoryFact(db, "جزئیات قدیمی برند نوا که هنوز پروژه‌بندی نشده است", "یادداشت کاربر", "legacy", "owner", null);
  await saveNaviMemoryFact(db, "نام نمایشی کاربر", "نام کاربر", "test", "owner", "project-alpha");
  await saveNaviMemoryFact(db, "پاسخ‌ها باید کوتاه و کاربردی باشند", "ترجیحات پاسخ‌گویی", "test", "owner", "project-alpha");
  await saveNaviMemoryFact(db, "یادداشت اختصاصی آلفا", "یادداشت پروژه", "test", "owner", "project-alpha");

  const general = await getNaviApprovedMemory(db, "owner", "project-general");
  const alpha = await getNaviApprovedMemory(db, "owner", "project-alpha");
  const beta = await getNaviApprovedMemory(db, "owner", "project-beta");

  assert.ok(general.some(item => /برند نوا/.test(item.memory_value)));
  assert.ok(alpha.some(item => item.memory_key === "نام کاربر"));
  assert.ok(alpha.some(item => item.memory_key === "ترجیحات پاسخ‌گویی"));
  assert.ok(alpha.some(item => /آلفا/.test(item.memory_value)));
  assert.ok(!alpha.some(item => /برند نوا/.test(item.memory_value)));
  assert.ok(!beta.some(item => /برند نوا/.test(item.memory_value)));
  assert.equal(beta.length, 2);
  db.sqlite.close();
});

test("pending and archived legacy notes are hidden from non-General project workspaces", async () => {
  const db = createDb();
  db.sqlite.prepare("INSERT INTO navi_memory_facts_v1 (owner_id,memory_key,memory_value,source,status,project_id) VALUES (?,?,?,?,?,?)").run("owner", "یادداشت کاربر", "پیشنهاد قدیمی عمومی", "legacy", "pending", null);
  db.sqlite.prepare("INSERT INTO navi_memory_facts_v1 (owner_id,memory_key,memory_value,source,status,project_id) VALUES (?,?,?,?,?,?)").run("owner", "ترجیحات پاسخ‌گویی", "پیشنهاد ترجیح عمومی", "legacy", "pending", null);
  db.sqlite.prepare("INSERT INTO navi_memory_facts_v1 (owner_id,memory_key,memory_value,source,status,project_id) VALUES (?,?,?,?,?,?)").run("owner", "یادداشت کاربر", "یادداشت بایگانی قدیمی", "legacy", "archived", null);
  const pending = await getNaviPendingMemory(db, "owner", "project-alpha");
  const archived = await getNaviArchivedMemory(db, "owner", "project-alpha");
  assert.deepEqual(pending.map(item => item.memory_value), ["پیشنهاد ترجیح عمومی"]);
  assert.deepEqual(archived, []);
  const generalPending = await getNaviPendingMemory(db, "owner", "project-general");
  const generalArchived = await getNaviArchivedMemory(db, "owner", "project-general");
  assert.equal(generalPending.length, 2);
  assert.equal(generalArchived.length, 1);
  db.sqlite.close();
});

test("correcting a project memory cannot archive an unrelated legacy account-wide row", async () => {
  const db = createDb();
  const oldValue = "مقدار قدیمی تنظیمات رابط";
  await saveNaviMemoryFact(db, oldValue, "تنظیمات رابط", "legacy", "owner", null);
  await saveNaviMemoryFact(db, oldValue, "تنظیمات رابط", "test", "owner", "project-alpha");
  const globalBefore = db.sqlite.prepare("SELECT id FROM navi_memory_facts_v1 WHERE project_id IS NULL AND memory_key = 'تنظیمات رابط' AND status = 'approved'").get();
  const projectBefore = db.sqlite.prepare("SELECT id FROM navi_memory_facts_v1 WHERE project_id = 'project-alpha' AND memory_key = 'تنظیمات رابط' AND status = 'approved'").get();

  const result = await saveNaviMemoryFact(db, "مقدار تازه تنظیمات رابط", "تنظیمات رابط", "test", "owner", "project-alpha");
  const globalAfter = db.sqlite.prepare("SELECT status FROM navi_memory_facts_v1 WHERE id = ?").get(globalBefore.id);
  const projectAfter = db.sqlite.prepare("SELECT status,memory_value FROM navi_memory_facts_v1 WHERE id = ?").get(projectBefore.id);

  assert.equal(result.updated, true);
  assert.equal(globalAfter.status, "approved");
  assert.equal(projectAfter.status, "approved");
  assert.equal(projectAfter.memory_value, "مقدار تازه تنظیمات رابط");
  db.sqlite.close();
});

test("project memories stay separate while global profile facts remain shared", async () => {
  const db = createDb();
  await saveNaviMemoryFact(db, "جزئیات اختصاصی پروژه آلفا", "یادداشت پروژه", "test", "owner", "project-alpha");
  await saveNaviMemoryFact(db, "جزئیات اختصاصی پروژه بتا", "یادداشت پروژه", "test", "owner", "project-beta");
  await saveNaviMemoryFact(db, "نام نمایشی کاربر", "نام کاربر", "test", "owner", "project-alpha");
  const alpha = await getNaviApprovedMemory(db, "owner", "project-alpha");
  const beta = await getNaviApprovedMemory(db, "owner", "project-beta");
  assert.equal(alpha.length, 2);
  assert.equal(beta.length, 2);
  assert.match(alpha.find(item => /آلفا/.test(item.memory_value)).memory_value, /آلفا/);
  assert.match(beta.find(item => /بتا/.test(item.memory_value)).memory_value, /بتا/);
  db.sqlite.close();
});
