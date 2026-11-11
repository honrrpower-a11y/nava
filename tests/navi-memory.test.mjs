import test from "node:test";
import assert from "node:assert/strict";

import {
  areMemoryValuesSemanticallySimilar,
  createNaviMemoryProposal,
  getNaviArchivedMemory,
  parseNaviMemoryCommand
} from "../modules/navi-memory.js";

test("a changed Persian favorite color is recognized as the same fact", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگ مورد علاقه‌ام قرمز است",
      "رنگ مورد علاقه‌ام آبی است"
    ),
    true
  );
});

test("colloquial possessive forms still match the same memory topic", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگم قرمز است",
      "رنگم آبی است"
    ),
    true
  );
});

test("unrelated facts are not treated as corrections", () => {
  assert.equal(
    areMemoryValuesSemanticallySimilar(
      "رنگ مورد علاقه‌ام قرمز است",
      "من در تهران زندگی می‌کنم"
    ),
    false
  );
});

test("remember command extracts the fact instead of saving the instruction", () => {
  const parsed = parseNaviMemoryCommand(
    "رنگ مورد علاقه‌ام قرمز است. این را به خاطر بسپار"
  );

  assert.equal(parsed.isCommand, true);
  assert.equal(parsed.command, "remember");
  assert.match(parsed.value, /رنگ مورد علاقه/);
  assert.match(parsed.value, /قرمز/);
  assert.doesNotMatch(parsed.value, /به خاطر بسپار/);
});


test("archived memory query returns only archived rows for the owner", async () => {
  let sql = "";
  let bound = [];
  const db = {
    prepare(query) {
      sql = query;
      return {
        bind(...values) {
          bound = values;
          return {
            async all() {
              return { results: [{ id: 7, status: "archived", memory_value: "رنگ قرمز" }] };
            }
          };
        }
      };
    }
  };

  const rows = await getNaviArchivedMemory(db);
  assert.match(sql, /status = 'archived'/);
  assert.match(sql, /owner_id = \\?/);
  assert.deepEqual(bound, ["owner", 200]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "archived");
});


test("explicit correction archives the stale approved value when the new value already exists", async () => {
  const rows = [
    { id: 1, memory_key: "یادداشت کاربر", memory_value: "رنگ مورد علاقه‌ام آبی است", status: "approved" },
    { id: 2, memory_key: "یادداشت کاربر", memory_value: "رنگ مورد علاقه‌ام قرمز است", status: "approved" },
    { id: 3, memory_key: "یادداشت کاربر", memory_value: "من در تهران زندگی می‌کنم", status: "approved" }
  ];
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async all() {
          return { results: rows.filter(row => row.status === "approved" || row.status === "pending") };
        },
        async run() {
          const id = Number(values[0]);
          const row = rows.find(item => item.id === id);
          if (row && /SET status = 'archived'/.test(sql) && row.status === "approved") {
            row.status = "archived";
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }
      };
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };

  const { saveNaviMemoryFact } = await import("../modules/navi-memory.js");
  const result = await saveNaviMemoryFact(db, "رنگ مورد علاقه‌ام آبی است");

  assert.equal(result.duplicate, true);
  assert.equal(result.archivedCount, 1);
  assert.equal(rows.find(row => row.id === 1).status, "approved");
  assert.equal(rows.find(row => row.id === 2).status, "archived");
  assert.equal(rows.find(row => row.id === 3).status, "approved");
});


test("SQLite integration: correction archives only the superseded approved fact", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { saveNaviMemoryFact } = await import("../modules/navi-memory.js");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE navi_memory_facts_v1 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      memory_value TEXT NOT NULL,
      source TEXT,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO navi_memory_facts_v1
      (owner_id, memory_key, memory_value, source, status)
    VALUES
      ('owner', 'یادداشت کاربر', 'رنگ مورد علاقه‌ام آبی است', 'test', 'approved'),
      ('owner', 'یادداشت کاربر', 'رنگ مورد علاقه‌ام قرمز است', 'test', 'approved'),
      ('owner', 'یادداشت کاربر', 'من در تهران زندگی می‌کنم', 'test', 'approved');
  `);

  const db = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async run() {
          const result = sqlite.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
        }
      };
      return statement;
    },
    async batch(statements) {
      const results = [];
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  };

  const result = await saveNaviMemoryFact(db, "رنگ مورد علاقه‌ام آبی است");
  const rows = sqlite.prepare("SELECT id, memory_value, status FROM navi_memory_facts_v1 ORDER BY id").all();

  assert.equal(result.duplicate, true);
  assert.equal(result.archivedCount, 1);
  assert.deepEqual(rows.map(row => row.status), ["approved", "archived", "approved"]);
  assert.match(rows[0].memory_value, /آبی/);
  assert.match(rows[1].memory_value, /قرمز/);
  assert.match(rows[2].memory_value, /تهران/);
  sqlite.close();
});


test('conversation search retrieves relevant older messages across threads', async () => {
  const { searchNaviConversationHistory } = await import('../modules/navi-memory.js');
  const db = { prepare() { return { async all() { return { results: [
    { thread_id: 'old-1', thread_title: 'نوا', role: 'user', content: 'نسخه موتور شعر نوا 3.1 است' },
    { thread_id: 'old-2', thread_title: 'ورزش', role: 'user', content: 'تمرین کرانچ شکمی' },
    { thread_id: 'old-3', thread_title: 'نوا', role: 'assistant', content: 'هدف موتور موسیقی ایرانی است' }
  ] }; } }; } };
  const matches = await searchNaviConversationHistory(db, 'موتور شعر نوا', 8, []);
  assert.equal(matches.length, 2);
  assert.ok(matches.some(item => item.threadId === 'old-1'));
  assert.ok(matches.some(item => item.threadId === 'old-3'));
});

test('conversation search excludes messages already present in recent context', async () => {
  const { searchNaviConversationHistory } = await import('../modules/navi-memory.js');
  const db = { prepare() { return { async all() { return { results: [
    { thread_id: 't', role: 'user', content: 'همان پیام اخیر' }
  ] }; } }; } };
  const matches = await searchNaviConversationHistory(db, 'پیام اخیر', 8, [
    { role: 'user', content: 'همان پیام اخیر' }
  ]);
  assert.equal(matches.length, 0);
});


test("Gemini response parser accepts a valid JSON object wrapped in Markdown fences", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('```json\\n{"reply":"سلام","memoryProposals":[{"title":"ترجیح","value":"پاسخ کوتاه و کاربردی"}]}\\n```');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, "سلام");
  assert.equal(parsed.memoryProposals.length, 1);
});

test("Gemini response parser extracts one complete JSON object surrounded by harmless text", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('نتیجه:\\n{"reply":"پاسخ درست","memoryProposals":[]}\\nپایان');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, "پاسخ درست");
  assert.deepEqual(parsed.memoryProposals, []);
});

test("Gemini plain-text fallback never fabricates memory proposals", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse("این یک پاسخ معمولی است.");
  assert.equal(parsed.structured, false);
  assert.equal(parsed.reply, "این یک پاسخ معمولی است.");
  assert.deepEqual(parsed.memoryProposals, []);
});

test("Gemini parser preserves braces and escaped quotes inside JSON strings", async () => {
  const { parseNaviGeminiResponse } = await import("../modules/navi.js");
  const parsed = parseNaviGeminiResponse('پاسخ: {"reply":"متن دارای } و \\"نقل‌قول\\"","memoryProposals":[]} پایان');
  assert.equal(parsed.structured, true);
  assert.equal(parsed.reply, 'متن دارای } و "نقل‌قول"');
});


test("conversation search preserves thread title, identity and UTC timestamp metadata", async () => {
  const { searchNaviConversationHistory } = await import("../modules/navi-memory.js");
  const db = {
    prepare(sql) {
      assert.match(sql, /LEFT JOIN navi_chat_threads_v1/);
      assert.match(sql, /LIMIT 600/);
      return { async all() { return { results: [
        { thread_id: "nava-project", thread_title: "پروژه نوا", role: "user", content: "تصمیم موتور موسیقی نوا", created_at: "2026-11-10 09:30:00" },
        { thread_id: "ritmetan-project", thread_title: "ریتمتان", role: "assistant", content: "تصمیم موتور موسیقی برای ریتمتان", created_at: "2026-11-09 12:00:00" }
      ] }; } };
    }
  };
  const matches = await searchNaviConversationHistory(db, "موتور موسیقی نوا", 8, []);
  assert.ok(matches.length > 0);
  const match = matches.find(item => item.threadId === "nava-project");
  assert.equal(match.threadTitle, "پروژه نوا");
  assert.equal(match.createdAt, "2026-11-10 09:30:00");
  assert.equal(match.role, "user");
});

test("memory proposals from different project categories are not merged", async () => {
  const inserted = [];
  let nextId = 1;
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO navi_memory_facts_v1")) {
            inserted.push({
              id: nextId++,
              owner_id: values[0],
              memory_key: values[1],
              memory_value: values[2],
              status: "pending"
            });
            return { success: true, meta: { changes: 1, last_row_id: inserted.length } };
          }
          throw new Error("Unexpected SQL in project isolation test.");
        }
      };
    }
  };
  const first = await createNaviMemoryProposal(
    db,
    "پروژه نوا موتور موسیقی ایرانی دارد",
    "پروژه نوا"
  );
  const second = await createNaviMemoryProposal(
    db,
    "پروژه ریتمتان موتور موسیقی ایرانی دارد",
    "پروژه ریتمتان"
  );
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, true);
  assert.equal(inserted.length, 2);
  assert.notEqual(inserted[0].memory_key, inserted[1].memory_key);
});
