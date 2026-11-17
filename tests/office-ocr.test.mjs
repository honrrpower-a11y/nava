import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const office = readFileSync(new URL("../office-file-tools.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const structured = readFileSync(new URL("../office-structured-files.js", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../document-export.js", import.meta.url), "utf8");
const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("Office OCR supports Persian and English recognition in the browser", () => {
  assert.match(office, /tesseract\.js@5\.1\.1/);
  assert.match(office, /createWorker\("fas\+eng",1/);
  assert.match(office, /ocrWorker\.recognize\(canvas\)/);
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
  assert.match(html, /فایل اصلی آپلود نمی‌شود؛ اما متن استخراج‌شده برای تحلیل در درخواست NAVI ارسال خواهد شد/);
  assert.match(office, /متن استخراج‌شده از فایل/);
});


test("NAVI response has a dedicated mobile-safe text selection control", () => {
  assert.match(html, /id="selectNaviResponse"[^>]*aria-controls="requestResponse"/);
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(app, /requestResponse\.setSelectionRange\(0, requestResponse\.value\.length\)/);
  assert.match(app, /selectNaviResponseButton\?\.addEventListener\("click"/);
});


test("Office accepts PowerPoint and Excel files and loads the local structured parser", () => {
  assert.match(html, /\.pptx,\.xlsx/);
  assert.match(html, /office-structured-files\.js/);
  assert.match(office, /"pptx","xlsx"/);
  assert.match(office, /NavaOfficeStructured\.read\(file\)/);
  assert.match(structured, /readPowerPoint/);
  assert.match(structured, /readExcel/);
  assert.match(structured, /cell\.f/);
});

test("NAVI office replies expose Word and PDF export actions", () => {
  assert.match(app, /NavaDocumentExport\?\.attach\(requestResponse,\s*service\)/);
  assert.match(exporter, /typeof target\.value==="string"\?target\.value/);
  assert.match(exporter, /دریافت فایل Word/);
  assert.match(exporter, /دریافت PDF/);
  assert.match(exporter, /Packer\.toBlob\(doc\)/);
  assert.match(exporter, /window\.open\("","_blank"\)/);
});

test("Word and PDF exporters correctly recognize RTL, headings and ordered lists", () => {
  assert.ok(exporter.includes("const rtlPattern=/[\\u0590-\\u08FF]/;"));
  assert.ok(exporter.includes("x.match(/^(#{1,3})\\s+(.+)$/)"));
  assert.ok(exporter.includes("x.match(/^(\\d+)[.)]\\s+(.+)$/)"));
  assert.match(exporter, /alignment:rtl\?AlignmentType\.RIGHT:AlignmentType\.LEFT/);
  assert.match(exporter, /direction:'\+dir\+'/);
});

test("Office export actions are styled and loaded with a fresh cache key", () => {
  assert.match(html, /document-export\.js\?v=office-export-multiformat-20261117-1/);
  assert.match(app, /NavaDocumentExport/);
  const css = readFileSync(new URL("../office-file-tools.css", import.meta.url), "utf8");
  assert.match(css, /\.nava-export-actions/);
});

test("Office studio sends structured operation, output and detail preferences to NAVI", () => {
  assert.match(html, /id="studioMode-office"/);
  assert.match(html, /id="studioOutput-office"/);
  assert.match(html, /id="studioDetail-office"/);
  assert.match(app, /operation: value\("studioMode-office"\)/);
  assert.match(app, /requestedOutput: selected\("studioOutput-office"\)/);
  assert.match(app, /detailLevel: selected\("studioDetail-office"\)/);
  assert.match(html, /متن استخراج‌شده برای تحلیل در درخواست NAVI ارسال خواهد شد/);
});

test("NAVI Office exports typed Excel tables and preserves long PowerPoint content", () => {
  assert.match(exporter, /function workbookSections\(text\)/);
  assert.match(exporter, /function splitMarkdownRow\(line\)/);
  assert.match(exporter, /function excelCell\(value\)/);
  assert.match(exporter, /fullCalcOnLoad:true/);
  assert.match(exporter, /XLSX\.writeFile\(book,name/);
  assert.match(exporter, /function splitLongText\(value,max=210\)/);
  assert.match(exporter, /function splitPresentation\(text\)/);
  assert.match(exporter, /new PptxGenJS\(\)/);
  assert.match(exporter, /pptx\.writeFile\(\{fileName:name\}\)/);
  assert.doesNotMatch(exporter, /contentSlides\.slice\(0,40\)/);
  assert.match(exporter, /ساخت فایل Excel/);
  assert.match(exporter, /ساخت PowerPoint/);
});


test("Office local editor supports XLSX cell edits and safe DOCX/PPTX text replacement", () => {
  assert.match(html, /id="officeEditPanel"/);
  assert.match(html, /id="officeEditGrid"/);
  assert.match(html, /id="officeEditReplaceRun"/);
  assert.match(html, /office-edit-tools\.js\?v=/);
  assert.match(editor, /XLSX\.read\(await file\.arrayBuffer\(\)/);
  assert.match(editor, /XLSX\.write\(workbook/);
  assert.match(editor, /ppt\/slides\/slide/);
  assert.match(editor, /word\/(document\|header/);
  assert.match(editor, /نسخه جدید دانلود شد و فایل اصلی/);
  assert.match(editor, /حداکثر ۴۰ ردیف و ۱۲ ستون/);
});
