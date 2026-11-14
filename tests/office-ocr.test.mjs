import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const office = readFileSync(new URL("../office-file-tools.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("Office OCR supports Persian and English recognition in the browser", () => {
  assert.match(office, /tesseract\.js@5\.1\.1/);
  assert.match(office, /createWorker\("fas\+eng",1/);
  assert.match(office, /worker\.recognize\(canvas\)/);
  assert.match(office, /worker\.recognize\(file\)/);
});

test("Scanned PDF pages are rendered locally and OCR is limited", () => {
  assert.match(office, /getTextContent\(\)/);
  assert.match(office, /page\.render\(\{canvasContext:context,viewport\}\)/);
  assert.match(office, /MAX_OCR_PAGES=15/);
  assert.match(office, /MAX_PDF_PAGES=40/);
  assert.match(office, /await doc\.destroy\(\)/);
});

test("Office upload accepts common image formats and keeps file processing client-side", () => {
  assert.match(html, /\.png,\.jpg,\.jpeg,\.webp/);
  assert.match(html, /فایل اصلی فقط روی دستگاهت پردازش می‌شود/);
  assert.match(office, /متن استخراج‌شده از فایل/);
});
