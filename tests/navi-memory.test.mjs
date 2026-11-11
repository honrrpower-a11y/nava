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
  saveNaviConversation,
  createNaviMemoryProposal,
  approveNaviMemoryProposal,
  rejectNaviMemoryProposal,
  updateNaviMemoryProposal,
  saveNaviMemoryFact
} from "../modules/navi-memory.js";

class MockD1 {
  constructor({ memories = [], messages = [], beforeBatch = null, beforeRun = null } = {}) {
    this.memories = memories.map(row => ({ ...row }));
    this.messages = messages.map(row => ({ ...row }));
    this.threads = [];
    this.beforeBatch = beforeBatch;
    this.beforeRun = beforeRun;
    this.nextMessageId = this.messages.length + 1;
    this.nextMemoryId = this.memories.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
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
          const status = normalized.match(/status = '([^']+)'/)?.[1];
          const row = db.memories.find(item =>
            Number(item.id) === Number(id) &&
            item.owner_id === ownerId &&
            (!status || item.status === status)
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
          const status = normalized.match(/status = '([^']+)'/)?.[1];
          const ownerId = values[0];
          const excludedId = normalized.includes("id != ?") ? Number(values[1]) : null;
          const hasApprovedPendingFilter = normalized.includes("status in ('approved', 'pending')");
          return {
            results: db.memories
              .filter(item => item.owner_id === ownerId &&
                (!status || item.status === status) &&
                (!hasApprovedPendingFilter || ["approved", "pending"].includes(item.status)) &&
                (excludedId === null || Number(item.id) !== excludedId))
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
        if (db.beforeRun) await db.beforeRun({ sql: normalized, values, database: db });
        if (normalized.startsWith("insert into navi_memory_facts_v1")) {
          const [ownerId, memoryKey, memoryValue, source] = values;
          const row = { id: db.nextMemoryId++, owner_id: ownerId, memory_key: memoryKey, memory_value: memoryValue, source,
            status: normalized.includes("'approved'") ? "approved" : "pending" };
          db.memories.push(row);
          return { success: true, meta: { changes: 1, last_row_id: row.id } };
        }
        if (normalized.startsWith("update navi_memory_facts_v1 set status = 'archived'")) {
          const [id, ownerId] = values;
          const row = db.memories.find(item => Number(item.id) === Number(id) && item.owner_id === ownerId && item.status === "pending");
          if (row) row.status = "archived";
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
        if (normalized.startsWith("update navi_memory_facts_v1 set memory_value =")) {
          const [nextValue, ...rest] = values;
          const hasSource = rest.length === 3;
          const id = hasSource ? rest[1] : rest[0];
          const ownerId = hasSource ? rest[2] : rest[1];
          const row = db.memories.find(item => Number(item.id) === Number(id) && item.owner_id === ownerId &&
            (item.status === "pending" || item.status === "approved"));
          if (row) {
            row.memory_value = nextValue;
            if (hasSource) row.source = rest[0];
            if (normalized.includes("status = 'approved'")) row.status = "approved";
          }
          return { success: true, meta: { changes: row ? 1 : 0 } };
        }
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


test("creates a pending memory proposal and returns its generated id", async () => {
  const db = new MockD1();
  const result = await createNaviMemoryProposal(db, "کاربر پاسخ‌های کوتاه و کاربردی را ترجیح می‌دهد", "ترجیحات پاسخ‌گویی");
  assert.equal(result.inserted, true);
  assert.equal(db.memories.length, 1);
  assert.equal(db.memories[0].status, "pending");
  assert.equal(db.memories[0].id, result.id);
});

test("does not create duplicate or invalid memory proposals", async () => {
  const db = new MockD1({ memories: [{
    id: 1, owner_id: NAVI_OWNER_ID, memory_key: "ترجیحات پاسخ‌گویی",
    memory_value: "کاربر پاسخ‌های کوتاه و کاربردی را ترجیح می‌دهد", status: "pending"
  }] });
  const duplicate = await createNaviMemoryProposal(db, "کاربر پاسخ‌های کوتاه و کاربردی را ترجیح می‌دهد", "ترجیحات پاسخ‌گویی");
  const invalid = await createNaviMemoryProposal(db, "کوتاه", "یادداشت کاربر");
  assert.equal(duplicate.duplicate, true);
  assert.equal(invalid.invalid, true);
  assert.equal(db.memories.length, 1);
});

test("blocks sensitive data from memory proposals", async () => {
  const db = new MockD1();
  const result = await createNaviMemoryProposal(db, "رمز عبور حساب آزمایشی من secret", "یادداشت کاربر");
  assert.equal(result.sensitive, true);
  assert.equal(db.memories.length, 0);
});

test("approves a pending proposal", async () => {
  const db = new MockD1({ memories: [{
    id: 1, owner_id: NAVI_OWNER_ID, memory_key: "سبک پاسخ",
    memory_value: "پاسخ‌ها را کوتاه ارائه بده", status: "pending"
  }] });
  const result = await approveNaviMemoryProposal(db, 1);
  assert.equal(result.success, true);
  assert.equal(db.memories[0].status, "approved");
});

test("rejects and archives a pending proposal", async () => {
  const db = new MockD1({ memories: [{
    id: 1, owner_id: NAVI_OWNER_ID, memory_key: "یادداشت",
    memory_value: "این یک پیشنهاد آزمایشی معتبر است", status: "pending"
  }] });
  const result = await rejectNaviMemoryProposal(db, 1);
  assert.equal(result.success, true);
  assert.equal(db.memories[0].status, "archived");
});

test("edits a pending proposal without approving it", async () => {
  const db = new MockD1({ memories: [{
    id: 1, owner_id: NAVI_OWNER_ID, memory_key: "یادداشت",
    memory_value: "متن اولیه پیشنهاد حافظه", status: "pending"
  }] });
  const result = await updateNaviMemoryProposal(db, 1, "متن اصلاح‌شده پیشنهاد حافظه");
  assert.equal(result.success, true);
  assert.equal(db.memories[0].memory_value, "متن اصلاح‌شده پیشنهاد حافظه");
  assert.equal(db.memories[0].status, "pending");
});

test("saves an explicit approved memory fact", async () => {
  const db = new MockD1();
  const result = await saveNaviMemoryFact(db, "کاربر نام این دستیار را ناوی انتخاب کرده است", "هویت دستیار");
  assert.equal(result.inserted, true);
  assert.equal(db.memories[0].status, "approved");
});

test("rejects invalid memory ids and empty edits safely", async () => {
  const db = new MockD1();
  assert.deepEqual(await approveNaviMemoryProposal(db, "not-an-id"), { notFound: true });
  assert.deepEqual(await rejectNaviMemoryProposal(db, 0), { success: false });
  assert.deepEqual(await updateNaviMemoryProposal(db, 1, ""), { notFound: true });
  assert.equal(db.memories.length, 0);
});

test("propagates database failures instead of reporting a successful save", async () => {
  const db = new MockD1({
    beforeRun: async ({ sql }) => {
      if (sql.startsWith("insert into navi_memory_facts_v1")) throw new Error("simulated D1 failure");
    }
  });
  await assert.rejects(
    createNaviMemoryProposal(db, "این پیشنهاد برای آزمایش خطای دیتابیس است", "یادداشت"),
    /simulated D1 failure/
  );
  assert.equal(db.memories.length, 0);
});


test("NAVI parser accepts fenced JSON containing memory proposals", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('\\`\\`\\`json\\n{"reply":"سلام","memoryProposals":[{"title":"ترجیحات پاسخ","value":"پاسخ کوتاه و کاربردی"}]}\\n\\`\\`\\`');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, "سلام");
  assert.equal(parsed.memoryProposals.length, 1);
});

test("NAVI parser extracts a complete JSON object surrounded by text", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('نتیجه: {"reply":"پاسخ سالم","memoryProposals":[]} پایان');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, "پاسخ سالم");
  assert.deepEqual(parsed.memoryProposals, []);
});

test("NAVI parser preserves braces and escaped quotes inside JSON strings", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('{"reply":"عبارت } و \\"نقل قول\\"","memoryProposals":[]}');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, 'عبارت } و "نقل قول"');
});

test("NAVI parser keeps plain text as a reply without inventing memory proposals", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse("یک پاسخ معمولی");
  assert.equal(parsed.structured, false);
  assert.equal(parsed.reply, "یک پاسخ معمولی");
  assert.deepEqual(parsed.memoryProposals, []);
});
