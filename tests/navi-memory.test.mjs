import test from "node:test";
import assert from "node:assert/strict";

import {
  NAVI_MAIN_THREAD_ID,
  NAVI_OWNER_ID,
  ensureNaviMainThread,
  getNaviDbHistory,
  getNaviApprovedMemory,
  getNaviPendingMemory,
  getNaviMemoryConflictCandidates,
  resolveNaviMemoryConflict,
  saveNaviConversation
} from "../modules/navi-memory.js";

class MockD1 {
  constructor({ memories = [], messages = [], beforeBatch = null } = {}) {
    this.memories = memories.map(row => ({ ...row }));
    this.messages = messages.map(row => ({ ...row }));
    this.threads = [];
    this.beforeBatch = beforeBatch;
    this.nextMessageId = this.messages.length + 1;
  }

  prepare(sql) {
    const db = this;
    let values = [];
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    const statement = {
      bind(...args) {
        values = args;
        return statement;
      },
      async first() {
        if (normalized.includes("from navi_memory_facts_v1")) {
          const [id, ownerId] = values;
          const status = normalized.includes("status = 'pending'") ? "pending" : "approved";
          const row = db.memories.find(item =>
            Number(item.id) === Number(id) &&
            item.owner_id === ownerId &&
            item.status === status
          );
          return row ? {
            id: row.id,
            memory_key: row.memory_key,
            memory_value: row.memory_value
          } : null;
        }
        throw new Error("MockD1.first received unsupported SQL: " + normalized);
      },
      async all() {
        if (normalized.includes("from navi_memory_facts_v1")) {
          const status = normalized.includes("status = 'approved'") ? "approved" : "pending";
          const ownerId = values[0];
          return {
            results: db.memories
              .filter(item => item.owner_id === ownerId && item.status === status)
              .map(item => ({ ...item }))
          };
        }
        if (normalized.includes("from navi_chat_messages_v1")) {
          const threadId = values[0];
          const limit = values[1];
          return {
            results: db.messages
              .filter(item => item.thread_id === threadId)
              .sort((a, b) => b.id - a.id)
              .slice(0, limit)
              .map(({ role, content, created_at }) => ({ role, content, created_at }))
          };
        }
        throw new Error("MockD1.all received unsupported SQL: " + normalized);
      },
      async run() {
        if (normalized.startsWith("insert or ignore into navi_chat_threads_v1")) {
          const [threadId, ownerId, title] = values;
          if (!db.threads.some(row => row.thread_id === threadId)) {
            db.threads.push({ thread_id: threadId, owner_id: ownerId, title });
          }
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error("MockD1.run received unsupported SQL: " + normalized);
      },
      _execute() {
        return statement.run();
      },
      _sql: normalized,
      _values: () => values
    };
    return statement;
  }

  async batch(statements) {
    if (this.beforeBatch) await this.beforeBatch(this);
    const results = [];
    for (const statement of statements) {
      const sql = statement._sql;
      const v = statement._values();
      if (sql.startsWith("update navi_memory_facts_v1 set status = 'approved'")) {
        const [pendingId, ownerId, pendingValue, approvedId, approvedOwner, approvedKey, approvedValue] = v;
        const approved = this.memories.find(row =>
          Number(row.id) === Number(approvedId) &&
          row.owner_id === approvedOwner &&
          row.status === "approved" &&
          row.memory_key === approvedKey &&
          row.memory_value === approvedValue
        );
        const pending = this.memories.find(row =>
          Number(row.id) === Number(pendingId) &&
          row.owner_id === ownerId &&
          row.status === "pending" &&
          row.memory_value === pendingValue
        );
        if (approved && pending) pending.status = "approved";
        results.push({ success: true, meta: { changes: approved && pending ? 1 : 0 } });
        continue;
      }
      if (sql.startsWith("update navi_memory_facts_v1 set memory_value =")) {
        const [nextValue, approvedId, ownerId, previousValue] = v;
        const row = this.memories.find(item =>
          Number(item.id) === Number(approvedId) &&
          item.owner_id === ownerId &&
          item.status === "approved" &&
          item.memory_value === previousValue
        );
        if (row) row.memory_value = nextValue;
        results.push({ success: true, meta: { changes: row ? 1 : 0 } });
        continue;
      }
      if (sql.startsWith("update navi_memory_facts_v1 set status = 'archived'")) {
        const [pendingId, ownerId, pendingValue, approvedId, approvedOwner] = v;
        const checksApprovedKey = sql.includes("and memory_key = ?");
        const approvedKey = checksApprovedKey ? v[5] : null;
        const approvedValue = checksApprovedKey ? v[6] : v[5];
        const pending = this.memories.find(item =>
          Number(item.id) === Number(pendingId) &&
          item.owner_id === ownerId &&
          item.status === "pending" &&
          item.memory_value === pendingValue
        );
        const approved = this.memories.find(item =>
          Number(item.id) === Number(approvedId) &&
          item.owner_id === approvedOwner &&
          item.status === "approved" &&
          (!checksApprovedKey || item.memory_key === approvedKey) &&
          item.memory_value === approvedValue
        );
        if (pending && approved) pending.status = "archived";
        results.push({ success: true, meta: { changes: pending && approved ? 1 : 0 } });
        continue;
      }
      if (sql.startsWith("insert into navi_chat_messages_v1")) {
        const [threadId, content] = v;
        const role = sql.includes("values (?, 'assistant'") ? "assistant" : "user";
        this.messages.push({
          id: this.nextMessageId++,
          thread_id: threadId,
          role,
          content,
          created_at: "2026-01-01 00:00:00"
        });
        results.push({ success: true, meta: { changes: 1 } });
        continue;
      }
      if (sql.startsWith("update navi_chat_threads_v1")) {
        results.push({ success: true, meta: { changes: 1 } });
        continue;
      }
      throw new Error("MockD1.batch received unsupported SQL: " + sql);
    }
    return results;
  }
}

const baseMemories = () => [
  {
    id: 1,
    owner_id: NAVI_OWNER_ID,
    memory_key: "پاسخ‌ها",
    memory_value: "پاسخ‌ها را کوتاه می‌خواهم",
    status: "approved"
  },
  {
    id: 2,
    owner_id: NAVI_OWNER_ID,
    memory_key: "پاسخ‌ها",
    memory_value: "پاسخ‌ها را مفصل می‌خواهم",
    status: "pending"
  }
];

test("creates the main thread idempotently", async () => {
  const db = new MockD1();
  await ensureNaviMainThread(db);
  await ensureNaviMainThread(db);
  assert.equal(db.threads.length, 1);
  assert.equal(db.threads[0].thread_id, NAVI_MAIN_THREAD_ID);
});

test("loads history in chronological order and respects the limit", async () => {
  const db = new MockD1({
    messages: [
      { id: 1, thread_id: NAVI_MAIN_THREAD_ID, role: "user", content: "اول", created_at: "1" },
      { id: 2, thread_id: NAVI_MAIN_THREAD_ID, role: "assistant", content: "دوم", created_at: "2" },
      { id: 3, thread_id: NAVI_MAIN_THREAD_ID, role: "user", content: "سوم", created_at: "3" }
    ]
  });
  const history = await getNaviDbHistory(db, 2);
  assert.deepEqual(history.map(row => row.content), ["دوم", "سوم"]);
});

test("loads approved and pending memories separately", async () => {
  const db = new MockD1({ memories: baseMemories() });
  assert.equal((await getNaviApprovedMemory(db)).length, 1);
  assert.equal((await getNaviPendingMemory(db)).length, 1);
});

test("detects a contradictory proposal with the same normalized key", async () => {
  const db = new MockD1({ memories: baseMemories() });
  const [candidate] = await getNaviMemoryConflictCandidates(db, [{
    id: 2,
    memory_key: "پاسخ‌ها",
    memory_value: "پاسخ‌ها را مفصل می‌خواهم"
  }]);
  assert.equal(candidate.conflictWith.id, 1);
});

test("keep_both approves the pending fact when the approved fact is unchanged", async () => {
  const db = new MockD1({ memories: baseMemories() });
  const result = await resolveNaviMemoryConflict(db, 2, 1, "keep_both");
  assert.deepEqual(result, { success: true, resolution: "keep_both" });
  assert.equal(db.memories.find(row => row.id === 2).status, "approved");
});

test("keep_both refuses a stale conflict if the approved value changed after inspection", async () => {
  const db = new MockD1({
    memories: baseMemories(),
    beforeBatch: async database => {
      database.memories.find(row => row.id === 1).memory_value = "پاسخ‌ها را با جزئیات می‌خواهم";
    }
  });
  const result = await resolveNaviMemoryConflict(db, 2, 1, "keep_both");
  assert.deepEqual(result, { notFound: true });
  assert.equal(db.memories.find(row => row.id === 2).status, "pending");
});

test("replace updates the approved fact and archives the proposal", async () => {
  const db = new MockD1({ memories: baseMemories() });
  const result = await resolveNaviMemoryConflict(db, 2, 1, "replace");
  assert.deepEqual(result, { success: true, resolution: "replace" });
  assert.equal(db.memories.find(row => row.id === 1).memory_value, "پاسخ‌ها را مفصل می‌خواهم");
  assert.equal(db.memories.find(row => row.id === 2).status, "archived");
});

test("keep_existing archives the proposal without changing approved memory", async () => {
  const db = new MockD1({ memories: baseMemories() });
  const result = await resolveNaviMemoryConflict(db, 2, 1, "keep_existing");
  assert.deepEqual(result, { success: true, resolution: "keep_existing" });
  assert.equal(db.memories.find(row => row.id === 1).memory_value, "پاسخ‌ها را کوتاه می‌خواهم");
  assert.equal(db.memories.find(row => row.id === 2).status, "archived");
});

test("rejects invalid conflict resolutions without touching memory", async () => {
  const db = new MockD1({ memories: baseMemories() });
  const result = await resolveNaviMemoryConflict(db, 2, 1, "delete_everything");
  assert.deepEqual(result, { invalid: true });
  assert.equal(db.memories.find(row => row.id === 2).status, "pending");
});

test("saves both sides of a conversation and updates the thread", async () => {
  const db = new MockD1();
  const result = await saveNaviConversation(db, "سلام", "سلام، خوش آمدی");
  assert.deepEqual(result, { success: true });
  assert.deepEqual(db.messages.map(row => [row.role, row.content]), [
    ["user", "سلام"],
    ["assistant", "سلام، خوش آمدی"]
  ]);
});
