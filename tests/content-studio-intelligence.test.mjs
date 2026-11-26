import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Content Studio delegates unspecified choices to NAVI", () => {
  for (const id of ["contentPlatform", "contentFormat", "contentObjective", "contentTone"]) {
    const select = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`));
    assert.ok(select, `missing ${id} selector`);
    assert.ok(select[1].includes("<option selected>تشخیص هوشمند NAVI</option>"));
  }
  assert.ok(app.includes("هرجا مقدار «تشخیص هوشمند NAVI» ثبت شده، خودت"));
  assert.ok(app.includes("فقط دستورالعمل مربوط به قالب نهایی اعلام‌شده را اجرا کن"));
});

test("Audience is optional and inferred when omitted", () => {
  const audienceField = html.match(/<textarea[^>]*id="contentAudience"[^>]*>/);
  assert.ok(audienceField);
  assert.doesNotMatch(audienceField[0], /required/);
  assert.ok(app.includes("مخاطب محتمل را از موضوع و نیاز محتوا استنباط کن"));
  assert.ok(app.includes("حداکثر یک سؤال روشن بپرس"));
});

test("NAVI's resolved format is used for downstream studio handoff", () => {
  assert.ok(app.includes("تصمیم NAVI: پلتفرم=[نام]؛ قالب=[نام]؛ هدف=[نام]؛ لحن=[نام]"));
  assert.ok(app.includes('const resolved = readDecision(({ platform: "پلتفرم", format: "قالب", objective: "هدف", tone: "لحن" })[key])'));
  assert.ok(app.includes("handoff = effectiveHandoff"));
});
