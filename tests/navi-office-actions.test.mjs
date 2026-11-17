import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normalizeNaviOfficeAction,
  parseNaviGeminiResponse,
  isExplicitOfficeEditRequest
} from "../modules/navi.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const editor = readFileSync(new URL("../office-edit-tools.js", import.meta.url), "utf8");

test("NAVI accepts only bounded exact text replacement actions", () => {
  assert.deepEqual(normalizeNaviOfficeAction({
    kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید"
  }), { kind: "replace_text", find: "نسخه قدیمی", replace: "نسخه جدید" });
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"",replace:"x"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x".repeat(501),replace:"y"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"replace_text",find:"x",replace:"y".repeat(501)}), null);
});

test("NAVI accepts only bounded plain Excel cell edits", () => {
  const valid = {kind:"edit_cells",edits:[{sheet:"فروش",cell:"B5",value:200},{sheet:"فروش",cell:"C5",value:"پرداخت شد"}]};
  assert.deepEqual(normalizeNaviOfficeAction(valid), valid);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:Array.from({length:21},(_,i)=>({sheet:"S",cell:"A"+(i+1),value:i}))}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:"=SUM(A1:A2)"}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A0",value:1}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:1},{sheet:"S",cell:"A1",value:2}]}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"edit_cells",edits:[{sheet:"S",cell:"A1",value:"x".repeat(501)}]}), null);
});

test("unknown action kinds and executable payloads are rejected", () => {
  assert.equal(normalizeNaviOfficeAction({kind:"run_javascript",code:"alert(1)"}), null);
  assert.equal(normalizeNaviOfficeAction({kind:"delete_file",path:"/"}), null);
});

test("Gemini parser exposes only normalized Office actions", () => {
  const parsed = parseNaviGeminiResponse(JSON.stringify({
    reply:"پیشنهاد آماده است.",
    memoryProposals:[],
    officeAction:{kind:"replace_text",find:"قدیمی",replace:"جدید"}
  }));
  assert.deepEqual(parsed.officeAction,{kind:"replace_text",find:"قدیمی",replace:"جدید"});
  const rejected = parseNaviGeminiResponse(JSON.stringify({
    reply:"پاسخ",
    officeAction:{kind:"execute_code",code:"bad"}
  }));
  assert.equal(rejected.officeAction,null);
  assert.equal(parseNaviGeminiResponse(JSON.stringify({reply:"پاسخ"})).officeAction,null);
});

test("only explicit edit language in the current user message passes the intent gate", () => {
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: در سلول B5 عدد ۲۰۰ را قرار بده"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: عبارت قدیمی را با عبارت جدید عوض کن"), true);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: این فایل را خلاصه کن"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: لطفاً درباره فرمول SUM توضیح بده"), false);
  assert.equal(isExplicitOfficeEditRequest("پیام کاربر: ویرایش این سند چیست؟"), false);
});

test("browser never executes an action while rendering; execution is click-confirmed", () => {
  const render = app.slice(app.indexOf("function renderNaviOfficeAction"), app.indexOf("// Select only NAVI response text"));
  assert.match(render, /confirm\.addEventListener\("click"/);
  assert.match(render, /window\.NavaOfficeTools\.executeAction\(action\)/);
  assert.ok(render.indexOf('confirm.addEventListener("click"') < render.indexOf("executeAction(action)"));
  assert.match(render, /confirm\.disabled\s*=\s*!file\?\.ready/);
});

test("local editor binds actions to the same active file and preserves the original", () => {
  assert.match(editor, /selected!==sourceFile/);
  assert.match(editor, /window\.NavaOfficeTools\s*=\s*\{/);
  assert.match(editor, /download\(new Blob\(\[bytes\]/);
  assert.match(editor, /فایل اصلی دست‌نخورده ماند/);
  assert.match(editor, /if\(!count\)throw new Error/);
});
