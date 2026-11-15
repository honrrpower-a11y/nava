import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadBusinessApi() {
  let source = await readFile(new URL("../modules/business.js", import.meta.url), "utf8");
  source = source
    .replace(/^import\s+.*?;\s*$/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function)/g, "");
  source += "\nglobalThis.__businessApi = { normalizeBusinessProfileInput, normalizeBusinessRecordInput };";
  const sandbox = {
    console,
    JSON,
    Object,
    String,
    Set,
    safeNaviText(value, maxLength = 3000) {
      return String(value ?? "").replace(/\\u0000/g, "").replace(/[\\u0001-\\u0008\\u000B\\u000C\\u000E-\\u001F]/g, "").trim().slice(0, maxLength);
    }
  };
  vm.runInNewContext(source, sandbox);
  return sandbox.__businessApi;
}

test("business profile accepts supported types and normalizes optional fields", async () => {
  const api = await loadBusinessApi();
  const result = api.normalizeBusinessProfileInput({
    name: "فروشگاه آزمایشی",
    businessType: "store",
    industry: "مواد غذایی",
    description: "فروش محصولات محلی",
    currency: "irr"
  });
  assert.equal(result.value.name, "فروشگاه آزمایشی");
  assert.equal(result.value.business_type, "store");
  assert.equal(result.value.currency, "IRR");
});

test("business profile rejects short names and unsupported types", async () => {
  const api = await loadBusinessApi();
  assert.match(api.normalizeBusinessProfileInput({ name: "X" }).error, /حداقل ۲/);
  assert.match(api.normalizeBusinessProfileInput({ name: "فروشگاه", businessType: "admin" }).error, /نوع کسب‌وکار/);
});

test("business profile patch requires at least one valid field but not a name", async () => {
  const api = await loadBusinessApi();
  const patch = api.normalizeBusinessProfileInput({ industry: "خدمات" }, true);
  assert.equal(patch.value.industry, "خدمات");
  assert.equal(patch.value.name, undefined);
  assert.match(api.normalizeBusinessProfileInput({}, true).error, /هیچ فیلد/);
});

test("financial records accept only known report types and object payloads", async () => {
  const api = await loadBusinessApi();
  const result = api.normalizeBusinessRecordInput({
    recordType: "monthly_budget",
    title: "بودجه آبان",
    periodKey: "2026-11",
    reportText: "مجموع هزینه‌ها: ۷ میلیون تومان",
    payload: { expenses: 7000000 }
  });
  assert.equal(result.value.record_type, "monthly_budget");
  assert.equal(result.value.period_key, "2026-11");
  assert.equal(JSON.parse(result.value.payload_json).expenses, 7000000);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "passwords", title: "گزارش", reportText: "متن"
  }).error, /نوع گزارش/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: "متن", payload: []
  }).error, /شیء معتبر/);
});

test("financial records reject malformed periods, empty reports and oversized payloads", async () => {
  const api = await loadBusinessApi();
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", periodKey: "2026-13", reportText: "متن"
  }).error, /سال-ماه/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: " "
  }).error, /خالی/);
  assert.match(api.normalizeBusinessRecordInput({
    recordType: "note", title: "گزارش", reportText: "متن", payload: { text: "x".repeat(21000) }
  }).error, /بیش از حد بزرگ/);
});
