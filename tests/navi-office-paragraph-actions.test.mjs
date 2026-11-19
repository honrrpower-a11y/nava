import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  guardNaviOfficeReply,
  isExplicitOfficeEditRequest,
  normalizeNaviOfficeAction
} from "../modules/navi.js";

test("PowerPoint paragraph rewrite accepts exact slide targets and complete replacement text", () => {
  const action = normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [
      { slide: 2, find: "Original paragraph", replace: "متن ترجمه‌شده" },
      { slide: 4, find: "Second paragraph", replace: "بازنویسی دوم" }
    ]
  });
  assert.deepEqual(action, {
    kind: "edit_slide_text",
    edits: [
      { slide: 2, find: "Original paragraph", replace: "متن ترجمه‌شده" },
      { slide: 4, find: "Second paragraph", replace: "بازنویسی دوم" }
    ]
  });
});

test("PowerPoint paragraph rewrite rejects invalid slides, empty targets and oversized batches", () => {
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [{ slide: 0, find: "Text", replace: "ترجمه" }]
  }), null);
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: [{ slide: 1, find: " ", replace: "ترجمه" }]
  }), null);
  assert.equal(normalizeNaviOfficeAction({
    kind: "edit_slide_text",
    edits: Array.from({ length: 11 }, (_, index) => ({
      slide: index + 1, find: "Text " + index, replace: "متن " + index
    }))
  }), null);
});

test("PowerPoint translation and rewriting requests require the current user-turn marker", () => {
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن اسلاید ۲ را به فارسی ترجمه کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید دوم را به فارسی عوض کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید ۲ را فارسی کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: کل متن اسلاید دوم را به فارسی ترجمه کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: این پاراگراف را بازنویسی کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن این بخش را فارسی کن"), true);
  assert.equal(isExplicitOfficeEditRequest("متن اسلاید ۲ را به فارسی ترجمه کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید ۲ را فقط بررسی کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: متن اسلاید دوم رو جایگزین کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: اسلاید دوم رو با متن جدید عوض کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: لطفاً جایگزینی متن اسلاید دوم رو انجام بده"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: جایگزینی متن اسلاید دوم یعنی چه؟"), false);
});


test("Office edit guard uses format-neutral wording when a proposal is not authorized", () => {
  const reply = guardNaviOfficeReply("کارت تأیید ویرایش پاورپوینت آماده است.", false);
  assert.match(reply, /جزئیات کافی برای ساخت عملیات ویرایش/);
  assert.doesNotMatch(reply, /سلول|اکسل|شیت/);
});

test("Office edit guard preserves an authorized PowerPoint approval response", () => {
  const reply = "کارت تأیید ویرایش پاورپوینت آماده است.";
  assert.equal(guardNaviOfficeReply(reply, true), reply);
});


test("PowerPoint editor preserves original paragraph boundaries for flattened append-only replacements", () => {
  const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
  assert.match(editor, /const originalTargetText=paragraphs[\s\S]*?\.join\(" "\)/);
  assert.match(editor, /normalizedReplacement\.startsWith\(normalizedOriginal\+" "\)/);
  assert.match(editor, /replacementParagraphs\[lastIndex\][\s\S]*?appendedText/);
  assert.match(editor, /replacementParagraphs\.length===1&&targetCount>1/);
});


test("PowerPoint post-edit sync reads the already-open JSZip archive without FileReader re-parsing", () => {
  const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
  const structured = readFileSync(new URL("../office-structured-files.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(structured, /async function readPowerPointArchive\(zip\)/);
  assert.match(structured, /Object\.freeze\(\{ readPowerPointArchive, read:/);
  assert.match(editor, /readPowerPointArchive\(zip\)/);
  assert.doesNotMatch(editor, /const blob=await zip\.generateAsync\(\{type:"blob"\}\);\s*const file=new File\(\[blob\]/);
  assert.match(html, /office-edit-tools\.js\?v=office-pptx-edit-persistence-preview-20261119-6/);
});


test("PowerPoint exports use the correct Office MIME type", () => {
 const editor=readFileSync(new URL("../office-edit-tools.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(editor.includes("application/vnd.openxmlformats-officedocument.presentationml.presentation"));
 assert.ok(editor.includes("mimeType:officeMimeTypes[kind]"));
 assert.ok(editor.includes("async function generateEditedBlob()"));
 assert.ok(html.includes("office-pptx-edit-persistence-preview-20261119-6"));
});

test("PowerPoint replacement searches concatenated text runs", () => {
 const editor=readFileSync(new URL("../office-edit-tools.js",import.meta.url),"utf8");
 assert.ok(editor.includes("function replaceTextAcrossRuns(xml,find,replace,prefix)"));
 assert.ok(editor.includes('runs.map(run=>decodeXmlText(run[2])).join("")'));
 assert.ok(editor.includes('replaceTextAcrossRuns(await zip.files[name].async("string"),action.find,action.replace,prefix)'));
});

test("PowerPoint rewrite accepts changed paragraph counts", () => {
 const editor=readFileSync(new URL("../office-edit-tools.js",import.meta.url),"utf8");
 assert.ok(editor.includes("Accept complete rewrites with a different paragraph count"));
 assert.ok(!editor.includes("متن جایگزین اسلاید \"+item.slide+\" باید دقیقاً"));
});


test("PowerPoint slide-number and footer placeholders are excluded from extracted text and edit targets", () => {
  const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");
  const structured = readFileSync(new URL("../office-structured-files.js", import.meta.url), "utf8");
  assert.match(editor, /function isSlideDecorationParagraph\(paragraph\)/);
  assert.match(editor, /!item\.isDecoration/);
  assert.match(structured, /function isSlideDecorationParagraph\(paragraph\)/);
  assert.match(structured, /paragraphs\.filter\(p => !isSlideDecorationParagraph\(p\)\)/);
  assert.match(editor, /\["sldNum",\s*"ftr",\s*"hdr",\s*"dt"\]/);
  assert.match(structured, /\["sldNum",\s*"ftr",\s*"hdr",\s*"dt"\]/);
});


test("Office file preview is optional and collapsed by default", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const start = html.indexOf('<details class="office-preview-panel" id="officePreviewPanel" hidden>');
  const end = html.indexOf("</details>", start);
  assert.ok(start >= 0 && end > start, "preview must use a native collapsible details panel");
  const preview = html.slice(start, end);
  assert.match(preview, /<summary class="office-preview-disclosure"/);
  assert.match(preview, /فایل اولیه‌ای است که انتخاب کرده‌اید/);
  assert.match(preview, /فایل جدید یا نسخه اصلاح‌شده/);
  assert.match(preview, /دوباره در سایت بارگذاری کنید/);
  assert.match(preview, /id="officePreviewStage"/);
  assert.match(html, /id="officeEditSave"/);
});
