import test from "node:test";
import assert from "node:assert/strict";

import {
  areMemoryValuesSemanticallySimilar,
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


test("blank explicit save recovers only the immediately preceding user message after NAVI asks what to save", async () => {
  const { getNaviPreviousExplicitMemoryValue } = await import("../modules/navi-memory.js");
  const intended = "پروژه نوا باید به یک استودیوی حرفه‌ای موسیقی ایرانی تبدیل شود و ناوی دستیار اصلی آن باشد.";
  const db = {
    prepare(sql) {
      assert.match(sql, /ORDER BY id DESC/);
      assert.match(sql, /LIMIT 2/);
      return {
        bind(threadId) {
          assert.equal(threadId, "thread-test");
          return {
            async all() {
              return { results: [
                { role: "assistant", content: "حتماً. چه اطلاعاتی را می‌خواهی در حافظه بلندمدتم ذخیره کنم؟" },
                { role: "user", content: intended }
              ] };
            }
          };
        }
      };
    }
  };
  assert.equal(await getNaviPreviousExplicitMemoryValue(db, "thread-test"), intended);
});

test("blank explicit save does not recover content after an unrelated assistant reply", async () => {
  const { getNaviPreviousExplicitMemoryValue } = await import("../modules/navi-memory.js");
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { results: [
                { role: "assistant", content: "بله، می‌توانم در این مورد کمکت کنم." },
                { role: "user", content: "این متن نباید به‌صورت خودکار ذخیره شود." }
              ] };
            }
          };
        }
      };
    }
  };
  assert.equal(await getNaviPreviousExplicitMemoryValue(db, "thread-test"), "");
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

test("negative memory consent instruction suppresses all model-generated proposals", async () => {
  const { shouldSuppressNaviMemoryProposals } = await import("../modules/navi.js");
  const message = "می‌خواهم یک اطلاعات جدید به حافظه‌ات اضافه کنم: «رنگ مورد علاقه من آبی نفتی است.» آیا می‌توانی این اطلاعات را به‌عنوان پیشنهاد حافظه ثبت کنی و برای تأیید نهایی از من اجازه بگیری؟ فعلاً بدون تأیید من آن را به حافظه دائمی اضافه نکن.";
  assert.equal(shouldSuppressNaviMemoryProposals(message), true);
});

test("ordinary stable preference statements are not blocked from proposal review", async () => {
  const { shouldSuppressNaviMemoryProposals } = await import("../modules/navi.js");
  assert.equal(
    shouldSuppressNaviMemoryProposals("رنگ مورد علاقه من آبی نفتی است."),
    false
  );
});

test("explicit negative consent wording suppresses proposals even without the word فعلاً", async () => {
  const { shouldSuppressNaviMemoryProposals } = await import("../modules/navi.js");
  assert.equal(
    shouldSuppressNaviMemoryProposals("بدون تأیید من این مورد را در حافظه ثبت نکن."),
    true
  );
});
test("negative consent is checked before explicit memory commands", async () => {
  const { parseNaviMemoryCommandSafely } = await import("../modules/navi.js");
  const message = "می‌خواهم یک اطلاعات جدید به حافظه‌ات اضافه کنم: رنگ مورد علاقه من آبی نفتی است. آیا می‌توانی آن را به‌عنوان پیشنهاد حافظه ثبت کنی و برای تأیید نهایی از من اجازه بگیری؟ فعلاً بدون تأیید من آن را به حافظه دائمی اضافه نکن";
  const parsed = parseNaviMemoryCommandSafely(message);
  assert.equal(parsed.isCommand, false);
});

test("a direct remember request still reaches the explicit memory command handler", async () => {
  const { parseNaviMemoryCommandSafely } = await import("../modules/navi.js");
  const parsed = parseNaviMemoryCommandSafely("رنگ مورد علاقه من آبی نفتی است؛ این را به خاطر بسپار");
  assert.equal(parsed.isCommand, true);
  assert.match(parsed.memoryValue, /آبی نفتی/);
});


test("proposal plus approval request never enters direct-save parser", async () => {
  const { parseNaviMemoryCommandSafely } = await import("../modules/navi.js");
  const message = "قبلاً رنگ مورد علاقه‌ام آبی نفتی بود، اما الان سبز یشمی را ترجیح می‌دهم. این تغییر را به‌عنوان پیشنهاد حافظه ثبت کن و قبل از جایگزینی اطلاعات قبلی، از من تأیید بگیر.";
  const parsed = parseNaviMemoryCommandSafely(message);
  assert.equal(parsed.isCommand, false);
});

test("long memory values are preserved without truncation below the 12000-character limit", async () => {
  const { createNaviMemoryProposal } = await import("../modules/navi-memory.js");
  const value = "ترجیح پایدار کاربر " + "الف".repeat(1500);
  let insertedValue = "";
  const db = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async all() { return { results: [] }; },
        async first() { return null; },
        async run() {
          if (/INSERT INTO navi_memory_facts_v1/.test(sql)) {
            insertedValue = args[2] || "";
            return { success: true, meta: { changes: 1, last_row_id: 41 } };
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  const result = await createNaviMemoryProposal(db, value, "آزمایش طول");
  assert.equal(result.inserted, true);
  assert.equal(insertedValue.length, value.length);
  assert.equal(insertedValue, value);
});


test("natural Persian consent and refusal phrases are understood", async () => {
  const { parseNaviConfirmationIntent } = await import("../modules/navi.js");
  for (const phrase of ["آره", "اره", "بله", "حتماً", "باشه", "اوکی", "خوبه", "بله، ممنون", "نگهش دار", "بذار بمونه"]) {
    assert.equal(parseNaviConfirmationIntent(phrase), "approve", phrase);
  }
  for (const phrase of ["نه", "نخیر", "نه ممنون", "لازم نیست", "نمی‌خوام", "ذخیره نکن", "بی‌خیال"]) {
    assert.equal(parseNaviConfirmationIntent(phrase), "reject", phrase);
  }
  assert.equal(parseNaviConfirmationIntent("بله، در مورد بعدی هم کمکم کن"), null);
  assert.equal(parseNaviConfirmationIntent("انجام بده و فایل را هم حذف کن"), null);
});


test("deterministic fallback recognizes a clear first-person durable preference", async () => {
  const { extractNaviDeterministicMemoryProposal } = await import("../modules/navi.js");
  const message = "من ترجیح می‌دهم وقتی درباره یک مشکل فنی صحبت می‌کنیم، اول علت اصلی مشکل پیدا و برطرف شود؛ نه اینکه با تغییرات موقت فقط علائم مشکل را پنهان کنیم.";
  const proposals = extractNaviDeterministicMemoryProposal(message);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].value, message);
});

test("deterministic fallback ignores ordinary opinions, questions and hypothetical examples", async () => {
  const { extractNaviDeterministicMemoryProposal } = await import("../modules/navi.js");
  assert.deepEqual(extractNaviDeterministicMemoryProposal("این راه‌حل به نظرم خوب است."), []);
  assert.deepEqual(extractNaviDeterministicMemoryProposal("آیا ترجیح می‌دهی مشکل را ریشه‌ای حل کنیم؟"), []);
  assert.deepEqual(extractNaviDeterministicMemoryProposal("مثلاً فرض کن من ترجیح می‌دهم همه‌چیز ساده باشد."), []);
  assert.deepEqual(extractNaviDeterministicMemoryProposal("«من ترجیح می‌دهم پاسخ‌ها کوتاه باشند.»"), []);
});

test("deterministic fallback does not override a no-save instruction", async () => {
  const { extractNaviDeterministicMemoryProposal } = await import("../modules/navi.js");
  assert.deepEqual(
    extractNaviDeterministicMemoryProposal("من ترجیح می‌دهم پاسخ‌ها کوتاه باشند؛ اما فعلاً این مورد را ذخیره نکن."),
    []
  );
});
