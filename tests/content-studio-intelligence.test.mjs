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
  assert.ok(html.includes("app.js?v=content-studio-adaptive-intelligence-20261126-1"));
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

test("NAVI performs a silent quality review before showing final content", () => {
  assert.ok(app.includes("کنترل کیفیت داخلی اجباری پیش از نمایش"));
  assert.ok(app.includes("فقط نسخه نهاییِ بازبینی‌شده را نمایش بده"));
  assert.ok(app.includes("اطلاعات، عدد، منبع، تجربه، ویژگی محصول یا ادعای تازه نساز"));
  assert.ok(app.includes("اگر خروجی از ابتدا استاندارد است، بی‌دلیل آن را بازنویسی نکن"));
  assert.ok(html.includes("app.js?v=content-studio-quality-gate-20261127-1"));
});
