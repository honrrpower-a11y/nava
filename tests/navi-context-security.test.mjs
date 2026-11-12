import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const navi = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");

test("NAVI never receives arbitrary visible page DOM as context", () => {
  assert.doesNotMatch(app, /document\.body\.innerText/);
  assert.doesNotMatch(app, /pageContext\s*:/);
  assert.match(navi, /const pageContext = "";/);
});

test("NAVI history reads enforce thread ownership in the message query", () => {
  assert.match(navi, /INNER JOIN navi_chat_threads_v1 AS t[\s\S]{0,180}WHERE m\.thread_id = \?[\s\S]{0,100}AND t\.owner_id = \?/);
});

test("NAVI thread message deletion enforces owner_id in the DELETE statement", () => {
  assert.match(navi, /DELETE FROM navi_chat_messages_v1[\s\S]{0,300}AND EXISTS \([\s\S]{0,240}t\.owner_id = \?/);
});
