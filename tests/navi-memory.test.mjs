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
