import test from "node:test";
import assert from "node:assert/strict";

import {
  NAVI_OWNER_ID,
  NAVI_MAIN_THREAD_ID,
  createNaviMemoryProposal,
  approveNaviMemoryProposal,
  rejectNaviMemoryProposal,
  updateNaviMemoryProposal,
  saveNaviMemoryFact,
  getNaviApprovedMemory,
  getNaviPendingMemory,
  getNaviDbHistory,
  saveNaviConversation
} from "../modules/navi-memory.js";

// این Mock فقط قراردادهای SQL مورد استفاده ماژول حافظه را اجرا می‌کند؛
// هیچ اتصال شبکه‌ای یا دیتابیس واقعی در این تست‌ها وجود ندارد.
class OperationsMockD1 {
  constructor({ memories = [], messages = [], fail = null } = {}) {
    this.memories = memories.map(row => ({ ...row }));
    this.messages = messages.map(row => ({ ...row }));
    this.fail = fail;
    this.nextId = Math.max(0, ...this.memories.map(row => Number(row.id) || 0)) + 1;
    this.nextMessageId = Math.max(0, ...this.messages.map(row => Number(row.id) || 0)) + 1;
  }

  prepare(sql) {
    const db = this;
    const query = sql.replace(/\\s+/g, " ").trim().toLowerCase();
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() {
        if (db.fail === "first") throw new Error("simulated D1 first failure");
        if (query.includes("from navi_memory_facts_v1")) {
          let rows = db.memories.filter(row => {
            let index = 0;
            if (/where id = \\?/.test(query)) {
              const id = args[index++];
              if (Number(row.id) !== Number(id)) return false;
            }
            if (query.includes("owner_id = ?")) {
              const owner = args[index++];
              if (row.owner_id !== owner) return false;
            }
            if (query.includes("memory_key = ?")) {
              const key = args[index++];
              if (row.memory_key !== key) return false;
            }
            const status = query.match(/status = '(pending|approved|archived)'/);
            if (status && row.status !== status[1]) return false;
            return true;
          });
          return rows[0] ? { ...rows[0] } : null;
        }
        throw new Error("Unsupported MockD1.first SQL: " + query);
      },
      async all() {
        if (db.fail === "all") throw new Error("simulated D1 all failure");
        if (query.includes("from navi_memory_facts_v1")) {
          let rows = db.memories.filter(row => {
            if (query.includes("owner_id = ?") && row.owner_id !== args[0]) return false;
            if (query.includes("status = 'approved'") && row.status !== "approved") return false;
            if (query.includes("status = 'pending'") && row.status !== "pending") return false;
            if (query.includes("status in ('approved', 'pending')") &&
                !["approved", "pending"].includes(row.status)) return false;
            if (query.includes("id != ?") && Number(row.id) === Number(args[1])) return false;
            return true;
          }).sort((a,b) => Number(b.id)-Number(a.id));
          if (query.includes("limit ? offset ?")) rows = rows.slice(Number(args[2]) || 0, (Number(args[2]) || 0) + (Number(args[1]) || 200));
          return { results: rows.map(row => ({ ...row })) };
        }
        if (query.includes("from navi_chat_messages_v1")) {
          const rows = db.messages.filter(row => row.thread_id === args[0])
            .sort((a,b) => Number(b.id)-Number(a.id)).slice(0, Number(args[1]) || 100);
          return { results: rows.map(({role,content,created_at}) => ({role,content,created_at})) };
        }
        throw new Error("Unsupported MockD1.all SQL: " + query);
      },
      async run() {
        if (db.fail === "run") throw new Error("simulated D1 run failure");
        if (query.startsWith("insert into navi_memory_facts_v1")) {
          const [owner_id,memory_key,memory_value,source] = args;
          const row = { id: db.nextId++, owner_id, memory_key, memory_value, source,
            status: query.includes("'approved'") ? "approved" : "pending",
            created_at: "2026-11-10", updated_at: "2026-11-10" };
          db.memories.push(row);
          return { success: true, meta: { changes: 1, last_row_id: row.id } };
        }
        if (query.startsWith("update navi_memory_facts_v1")) {
          const row = db.memories.find(item => {
            // Update statements in this module always bind ID and owner near the end.
            const id = query.includes("set memory_value = ?, source = ?") ? args[2] : query.includes("set memory_value = ?") ? args[1] : args[0];
            return Number(item.id) === Number(id) && item.owner_id === NAVI_OWNER_ID;
          });
          if (!row) return { success: true, meta: { changes: 0 } };
          if (query.includes("status = 'archived'")) row.status = "archived";
          else if (query.includes("status = 'approved'")) row.status = "approved";
          if (query.includes("set memory_value = ?")) row.memory_value = args[0];
          if (query.includes("set memory_value = ?, source = ?")) {
            row.memory_value = args[0]; row.source = args[1];
          }
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error("Unsupported MockD1.run SQL: " + query);
      },
      _query: query,
      _args: () => args
    };
    return statement;
  }

  async batch(statements) {
    if (this.fail === "batch") throw new Error("simulated D1 batch failure");
    const results = [];
    for (const stmt of statements) {
      const sql = stmt._query, args = stmt._args();
      if (sql.startsWith("insert into navi_chat_messages_v1")) {
        const role = sql.includes("values (?, 'assistant'") ? "assistant" : "user";
        this.messages.push({ id: this.nextMessageId++, thread_id: args[0], role,
          content: args[1], created_at: "2026-11-10" });
        results.push({ success: true, meta: { changes: 1 } });
      } else if (sql.startsWith("update navi_chat_threads_v1")) {
        results.push({ success: true, meta: { changes: 1 } });
      } else {
        throw new Error("Unsupported MockD1.batch SQL: " + sql);
      }
    }
    return results;
  }
}

const pendingSeed = () => [{
  id: 1, owner_id: NAVI_OWNER_ID, memory_key: "ترجیحات-آزمون-1",
  memory_value: "کاربر ترجیح می‌دهد پاسخ‌ها روشن و کاربردی باشند",
  source: "test", status: "pending"
}];

test("creates a pending proposal and exposes it only in pending list", async () => {
  const db = new OperationsMockD1();
  const result = await createNaviMemoryProposal(db, "کاربر ترجیح می‌دهد پاسخ‌ها روشن و کاربردی باشند", "ترجیحات آزمون");
  assert.equal(result.inserted, true);
  assert.equal((await getNaviPendingMemory(db)).length, 1);
  assert.equal((await getNaviApprovedMemory(db)).length, 0);
});

test("rejects empty, too-short and sensitive proposals", async () => {
  const db = new OperationsMockD1();
  assert.equal((await createNaviMemoryProposal(db, "کوتاه", "عنوان")).invalid, true);
  assert.equal((await createNaviMemoryProposal(db, "رمز عبور من abcdefgh", "عنوان")).sensitive, true);
  assert.equal(db.memories.length, 0);
});

test("approves a pending proposal and removes it from pending list", async () => {
  const db = new OperationsMockD1({ memories: pendingSeed() });
  const result = await approveNaviMemoryProposal(db, 1);
  assert.equal(result.success, true);
  assert.equal(db.memories[0].status, "approved");
  assert.equal((await getNaviPendingMemory(db)).length, 0);
  assert.equal((await getNaviApprovedMemory(db)).length, 1);
});

test("rejects a proposal by archiving it without approving it", async () => {
  const db = new OperationsMockD1({ memories: pendingSeed() });
  const result = await rejectNaviMemoryProposal(db, 1);
  assert.equal(result.success, true);
  assert.equal(db.memories[0].status, "archived");
  assert.equal((await getNaviPendingMemory(db)).length, 0);
});

test("updates only a pending proposal", async () => {
  const db = new OperationsMockD1({ memories: pendingSeed() });
  const result = await updateNaviMemoryProposal(db, 1, "کاربر پاسخ‌های دقیق و کاربردی را ترجیح می‌دهد");
  assert.equal(result.success, true);
  assert.match(db.memories[0].memory_value, /دقیق/);
  assert.equal(db.memories[0].status, "pending");
});

test("invalid IDs and empty updates do not mutate memory", async () => {
  const db = new OperationsMockD1({ memories: pendingSeed() });
  assert.deepEqual(await approveNaviMemoryProposal(db, -1), { notFound: true });
  assert.deepEqual(await updateNaviMemoryProposal(db, 1, ""), { notFound: true });
  assert.deepEqual(await rejectNaviMemoryProposal(db, "not-an-id"), { success: false });
  assert.equal(db.memories[0].status, "pending");
});

test("explicit fact save creates approved memory", async () => {
  const db = new OperationsMockD1();
  const result = await saveNaviMemoryFact(db, "کاربر روی پروژه نوا کار می‌کند", "پروژه آزمون");
  assert.equal(result.inserted, true);
  assert.equal(db.memories[0].status, "approved");
});

test("explicit fact save refuses sensitive data", async () => {
  const db = new OperationsMockD1();
  await assert.rejects(
    () => saveNaviMemoryFact(db, "رمز عبور حساب من abcdefgh", "یادداشت"),
    /Sensitive information/
  );
  assert.equal(db.memories.length, 0);
});

test("history retrieval is isolated to the main thread", async () => {
  const db = new OperationsMockD1({ messages: [
    { id: 1, thread_id: NAVI_MAIN_THREAD_ID, role: "user", content: "سلام", created_at: "1" },
    { id: 2, thread_id: "another-thread", role: "user", content: "نباید دیده شود", created_at: "2" }
  ] });
  const history = await getNaviDbHistory(db, 10);
  assert.deepEqual(history.map(item => item.content), ["سلام"]);
});

test("database failures propagate instead of reporting false success", async () => {
  const db = new OperationsMockD1({ fail: "all" });
  await assert.rejects(() => getNaviApprovedMemory(db), /simulated D1 all failure/);
  const writeDb = new OperationsMockD1({ fail: "run" });
  await assert.rejects(
    () => createNaviMemoryProposal(writeDb, "کاربر ترجیح می‌دهد پاسخ‌ها روشن و کاربردی باشند", "ترجیحات"),
    /simulated D1 run failure/
  );
});

test("conversation write failure is surfaced", async () => {
  const db = new OperationsMockD1({ fail: "batch" });
  await assert.rejects(() => saveNaviConversation(db, "سلام", "سلام"), /simulated D1 batch failure/);
});
