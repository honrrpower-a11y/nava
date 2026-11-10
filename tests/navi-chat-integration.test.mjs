import test from "node:test";
import assert from "node:assert/strict";

import { handleNaviRoute } from "../modules/navi.js";
import { NAVI_MAIN_THREAD_ID, NAVI_OWNER_ID } from "../modules/navi-memory.js";

const ORIGIN = "https://honrrpower-a11y.github.io";
const PASSWORD = "integration-test-password";
const SECRET = "integration-test-secret-with-enough-entropy";

class ChatMockD1 {
  constructor() {
    this.threads = [];
    this.messages = [];
    this.memories = [];
    this.nextId = 1;
  }

  prepare(sql) {
    const db = this;
    const query = sql.replace(/\s+/g, " ").trim().toLowerCase();
    let values = [];
    const statement = {
      query,
      values: null,
      bind(...args) { values = args; statement.values = args; return statement; },
      async run() {
        if (query.startsWith("insert or ignore into navi_chat_threads_v1")) {
          const [thread_id, owner_id, title] = values;
          if (!db.threads.some(row => row.thread_id === thread_id)) db.threads.push({ thread_id, owner_id, title });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith("insert into navi_chat_messages_v1")) {
          const [thread_id, content] = values;
          const role = query.includes("'user'") ? "user" : "assistant";
          db.messages.push({ id: db.nextId++, thread_id, role, content, created_at: "2026-11-10 12:00:00" });
          return { success: true, meta: { changes: 1 } };
        }
        if (query.startsWith("update navi_chat_threads_v1")) {
          return { success: true, meta: { changes: 1 } };
        }
        throw new Error("Unsupported chat mock run: " + query);
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
        if (query.includes("from navi_memory_facts_v1") && query.includes("status = 'approved'")) {
          const [ownerId, limit, offset] = values;
          return { results: db.memories
            .filter(row => row.owner_id === ownerId && row.status === "approved")
            .sort((a, b) => b.id - a.id)
            .slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 200))
            .map(row => ({ ...row })) };
        }
        throw new Error("Unsupported chat mock all: " + query);
      }
    };
    return statement;
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const { query, values } = statement;
      if (query.startsWith("insert into navi_chat_messages_v1")) {
        const [thread_id, content] = values;
        const role = query.includes("'user'") ? "user" : "assistant";
        this.messages.push({ id: this.nextId++, thread_id, role, content, created_at: "2026-11-10 12:00:00" });
      } else if (query.startsWith("update navi_chat_threads_v1")) {
        // The thread timestamp update is represented by a successful D1 batch result.
      } else {
        throw new Error("Unsupported chat mock batch: " + query);
      }
      results.push({ success: true, meta: { changes: 1 } });
    }
    return results;
  }
}

async function callRoute(path, { method = "GET", body, token, env } = {}) {
  const headers = new Headers({ Origin: ORIGIN });
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", "Bearer " + token);
  const request = new Request("https://api.test" + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return handleNaviRoute({
    request,
    env,
    url: new URL(request.url),
    origin: ORIGIN,
    corsOrigin: ORIGIN
  });
}

async function login(env) {
  const response = await callRoute("/navi-login", {
    method: "POST",
    body: { password: PASSWORD },
    env
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

test("chat sends prior history and approved memory to the model, then persists both turns", async () => {
  const db = new ChatMockD1();
  db.threads.push({ thread_id: NAVI_MAIN_THREAD_ID, owner_id: NAVI_OWNER_ID, title: "گفت‌وگوی اصلی ناوی" });
  db.messages.push(
    { id: 1, thread_id: NAVI_MAIN_THREAD_ID, role: "user", content: "من روی پروژه نوا کار می‌کنم.", created_at: "2026-11-10 11:00:00" },
    { id: 2, thread_id: NAVI_MAIN_THREAD_ID, role: "assistant", content: "یادم هست.", created_at: "2026-11-10 11:00:01" }
  );
  db.memories.push({
    id: 7, owner_id: NAVI_OWNER_ID, memory_key: "پروژه نوا",
    memory_value: "کاربر در حال توسعه پروژه نوا است.",
    source: "test", status: "approved",
    created_at: "2026-11-10", updated_at: "2026-11-10"
  });

  const env = {
    NAVI_OWNER_PASSWORD: PASSWORD,
    NAVI_SESSION_SECRET: SECRET,
    GEMINI_API_KEY: "test-only-key",
    NAVA_DB: db
  };
  const token = await login(env);
  const originalFetch = globalThis.fetch;
  let capturedRequest;

  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    capturedRequest = JSON.parse(options.body);
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify({
            reply: "بله، گفت‌وگوی قبلی و اطلاعات تأییدشده پروژه نوا را در نظر گرفتم.",
            memoryProposals: []
          }) }]
        }
      }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const response = await callRoute("/navi-chat", {
      method: "POST",
      token,
      env,
      body: { message: "برای ادامه پروژه نوا چه کار کنیم؟" }
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.match(payload.reply, /پروژه نوا/);
    assert.equal(payload.memory.responseStructured, true);
    assert.equal(payload.memory.proposalsCreated, 0);

    const prompt = capturedRequest.systemInstruction.parts[0].text;
    assert.match(prompt, /کاربر در حال توسعه پروژه نوا است/);
    assert.deepEqual(capturedRequest.contents.map(item => item.role), ["user", "model", "user"]);
    assert.match(capturedRequest.contents[0].parts[0].text, /پروژه نوا/);
    assert.match(capturedRequest.contents[2].parts[0].text, /برای ادامه پروژه نوا/);

    const saved = db.messages.slice(-2);
    assert.deepEqual(saved.map(item => item.role), ["user", "assistant"]);
    assert.equal(saved[0].content, "برای ادامه پروژه نوا چه کار کنیم؟");
    assert.equal(saved[1].content, payload.reply);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("chat does not call the model or save a conversation when the model request fails", async () => {
  const db = new ChatMockD1();
  const env = {
    NAVI_OWNER_PASSWORD: PASSWORD,
    NAVI_SESSION_SECRET: SECRET,
    GEMINI_API_KEY: "test-only-key",
    NAVA_DB: db
  };
  const token = await login(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "simulated upstream failure" }
  }), { status: 503 });

  try {
    const response = await callRoute("/navi-chat", {
      method: "POST",
      token,
      env,
      body: { message: "یک پیام آزمایشی" }
    });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.equal(db.messages.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
