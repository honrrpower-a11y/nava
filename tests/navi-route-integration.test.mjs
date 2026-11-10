import test from "node:test";
import assert from "node:assert/strict";

import { handleNaviRoute } from "../modules/navi.js";
import { NAVI_MAIN_THREAD_ID, NAVI_OWNER_ID } from "../modules/navi-memory.js";

const ORIGIN = "https://honrrpower-a11y.github.io";
const ENV = {
  NAVI_OWNER_PASSWORD: "integration-test-password",
  NAVI_SESSION_SECRET: "integration-test-secret-with-enough-entropy",
  NAVA_DB: null
};

class RouteMockD1 {
  constructor() {
    this.threads = [];
    this.messages = [];
    this.memories = [];
    this.nextMessageId = 1;
  }

  prepare(sql) {
    const db = this;
    const query = sql.replace(/\\s+/g, " ").trim().toLowerCase();
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async run() {
        if (query.startsWith("insert or ignore into navi_chat_threads_v1")) {
          const [thread_id, owner_id, title] = values;
          if (!db.threads.some(row => row.thread_id === thread_id)) {
            db.threads.push({ thread_id, owner_id, title });
          }
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error("Unsupported route integration run: " + query);
      },
      async all() {
        if (query.includes("from navi_chat_messages_v1")) {
          const [threadId, limit] = values;
          return { results: db.messages
            .filter(row => row.thread_id === threadId)
            .sort((a, b) => b.id - a.id)
            .slice(0, Number(limit) || 100)
            .map(({ role, content, created_at }) => ({ role, content, created_at })) };
        }
        if (query.includes("from navi_memory_facts_v1")) {
          const ownerId = values[0];
          const status = query.includes("status = 'approved'") ? "approved" : "pending";
          const offset = Number(values[2]) || 0;
          const limit = Number(values[1]) || 200;
          return { results: db.memories
            .filter(row => row.owner_id === ownerId && row.status === status)
            .sort((a, b) => b.id - a.id)
            .slice(offset, offset + limit)
            .map(row => ({ ...row })) };
        }
        throw new Error("Unsupported route integration all: " + query);
      },
      async first() {
        if (query.includes("count(*) as total") && query.includes("from navi_memory_facts_v1")) {
          const ownerId = values[0];
          const status = query.includes("status = 'approved'") ? "approved" : "pending";
          return { total: db.memories.filter(row => row.owner_id === ownerId && row.status === status).length };
        }
        throw new Error("Unsupported route integration first: " + query);
      }
    };
    return statement;
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const query = statement._query;
      results.push({ success: true, meta: { changes: 1 } });
    }
    return results;
  }
}

async function route(path, { method = "GET", body, token, origin = ORIGIN, env = ENV } = {}) {
  const headers = new Headers({ Origin: origin });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const request = new Request("https://api.test" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const url = new URL(request.url);
  return handleNaviRoute({ request, env, url, origin, corsOrigin: ORIGIN });
}

test("login rejects wrong password and issues a verifiable session for the owner", async () => {
  const denied = await route("/navi-login", { method: "POST", body: { password: "wrong" } });
  assert.equal(denied.status, 401);

  const accepted = await route("/navi-login", {
    method: "POST",
    body: { password: ENV.NAVI_OWNER_PASSWORD }
  });
  assert.equal(accepted.status, 200);
  const payload = await accepted.json();
  assert.equal(payload.success, true);
  assert.equal(typeof payload.token, "string");
  assert.ok(payload.token.length > 20);
});

test("protected history and memory routes reject missing and forged sessions", async () => {
  const db = new RouteMockD1();
  const env = { ...ENV, NAVA_DB: db };
  const missing = await route("/navi-history", { env });
  assert.equal(missing.status, 401);
  const forged = await route("/navi-memory", { env, token: "forged.token" });
  assert.equal(forged.status, 401);
});

test("authenticated history route initializes the main thread and returns stored messages", async () => {
  const db = new RouteMockD1();
  db.messages.push(
    { id: 1, thread_id: NAVI_MAIN_THREAD_ID, role: "user", content: "سلام ناوی", created_at: "2026-11-10 10:00:00" },
    { id: 2, thread_id: NAVI_MAIN_THREAD_ID, role: "assistant", content: "سلام، خوش آمدی", created_at: "2026-11-10 10:00:01" }
  );
  const env = { ...ENV, NAVA_DB: db };
  const login = await route("/navi-login", { method: "POST", body: { password: ENV.NAVI_OWNER_PASSWORD }, env });
  const { token } = await login.json();

  const response = await route("/navi-history", { env, token });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.deepEqual(payload.messages.map(row => [row.role, row.content]), [
    ["user", "سلام ناوی"],
    ["assistant", "سلام، خوش آمدی"]
  ]);
  assert.equal(db.threads.length, 1);
  assert.equal(db.threads[0].thread_id, NAVI_MAIN_THREAD_ID);
});

test("authenticated memory route returns separate approved and pending collections", async () => {
  const db = new RouteMockD1();
  db.memories.push(
    { id: 1, owner_id: NAVI_OWNER_ID, memory_key: "پاسخ‌ها", memory_value: "پاسخ کوتاه", source: "test", status: "approved", created_at: "2026-11-10", updated_at: "2026-11-10" },
    { id: 2, owner_id: NAVI_OWNER_ID, memory_key: "پروژه", memory_value: "پیشنهاد در انتظار بررسی", source: "test", status: "pending", created_at: "2026-11-10", updated_at: "2026-11-10" }
  );
  const env = { ...ENV, NAVA_DB: db };
  const login = await route("/navi-login", { method: "POST", body: { password: ENV.NAVI_OWNER_PASSWORD }, env });
  const { token } = await login.json();

  const response = await route("/navi-memory", { env, token });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.count, 1);
  assert.equal(payload.proposalCount, 1);
  assert.equal(payload.memories[0].status, "approved");
  assert.equal(payload.proposals[0].status, "pending");
});

test("login rejects requests from an unapproved origin", async () => {
  const response = await route("/navi-login", {
    method: "POST",
    origin: "https://attacker.example",
    body: { password: ENV.NAVI_OWNER_PASSWORD }
  });
  assert.equal(response.status, 403);
});
