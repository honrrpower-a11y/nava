import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Content Studio delegates unspecified choices to NAVI", () => {
  for (const id of ["contentPlatform", "contentFormat", "contentObjective", "contentTone"]) {
    const select = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select, `missing ${id} selector`);
    assert.match(select[1], /<option selected>تشخیص هوشمند NAVI<\\/option>/);
  }
  assert.match(app, /هرجا مقدار «تشخیص هوشمند NAVI» ثبت شده، خودت/);
});

test("Audience is optional and inferred when omitted", () => {
  const audienceField = html.match(/<textarea[^>]*id="contentAudience"[^>]*>/);
  assert.ok(audienceField);
  assert.doesNotMatch(audienceField[0], /required/);
  assert.match(app, /مخاطب محتمل را از موضوع و نیاز محتوا استنباط کن/);
  assert.match(app, /حداکثر یک سؤال روشن بپرس/);
});

test("NAVI's resolved format is used for downstream studio handoff", () => {
  assert.match(app, /تصمیم\\s\*NAVI/);
  assert.match(app, /readDecision\(\(\{ platform: "پلتفرم", format: "قالب", objective: "هدف", tone: "لحن" \}\)\[key\]\)/);
  assert.match(app, /handoff = effectiveHandoff/);
});
