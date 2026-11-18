import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const guide = readFileSync(new URL("../office-navi-guide.js", import.meta.url), "utf8");
const fileTools = readFileSync(new URL("../office-file-tools.js", import.meta.url), "utf8");

test("Office studio collects every workflow setting and the complete extracted brief", () => {
  const officeContext = app.match(/officePage:\s*\{([\s\S]*?)\n\s*\},\n\s*composePage:/)?.[1] || "";
  for (const field of [
    'task: selected("studioTask-office")',
    'operation: value("studioMode-office")',
    'requestedOutput: selected("studioOutput-office")',
    'detailLevel: selected("studioDetail-office")',
    'audience: value("studioAudience-office")',
    'brief: value("studioBrief-office")'
  ]) assert.ok(officeContext.includes(field), `Missing Office context field: ${field}`);
});

test("NAVI context normalization preserves Office guide fields and long file briefs", () => {
  const normalizer = app.match(/function normalizeNaviStudioContext\(context\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  for (const key of ["task", "application", "userLevel", "operation", "requestedOutput", "detailLevel", "brief"]) {
    assert.match(normalizer, new RegExp("\\b" + key + "\\s*:"));
  }
  assert.match(normalizer, /brief:\s*18000/);
  assert.match(normalizer, /value\.trim\(\)\.slice\(0,\s*maxLength\)/);
});

test("Office context preview is shortened without truncating the context sent to NAVI", () => {
  assert.match(app, /value\.length\s*>\s*120\s*\?\s*value\.slice\(0,\s*120\)\s*\+\s*"…"/);
  assert.match(app, /summary\.slice\(0,\s*900\)/);
  assert.match(app, /contextLines\s*=\s*requestContext[\s\S]{0,160}Object\.entries\(requestContext\.context/);
});

test("Office guided assistant passes its app, user level, operation and task into NAVI", () => {
  for (const [key, pattern] of [
    ["application", /application:\s*app\.value/],
    ["userLevel", /userLevel:\s*level\.value/],
    ["operation", /operation:\s*"guide"/],
    ["brief", /brief:\s*task/]
  ]) {
    assert.match(guide, pattern, `Missing guided Office context: ${key}`);
  }
  assert.match(app, /requestContext\?\.service\s*===\s*officeService/);
});

test("Office file extraction appends extracted text to the brief sent through the context path", () => {
  assert.match(fileTools, /const currentBrief=String\(brief\.value\|\|""\)\.replace\(/);
  assert.match(fileTools, /brief\.value=\(currentBrief\?currentBrief\+"\\n\\n":""\)\+attachment/);
  assert.match(fileTools, /brief\.dispatchEvent\(new Event\("input",\{bubbles:true\}\)\)/);
  assert.match(fileTools, /متن استخراج‌شده از فایل/);
  assert.match(app, /brief:\s*18000/);
});


test("guided Office requests keep approval cards in the NAVI conversation", () => {
  assert.match(app, /window\.sendOfficeNaviRequest\s*=\s*function[\s\S]*?officeTarget:\s*false/);
  assert.match(guide, /کارت تأیید، در ستون دستیار همین صفحه نمایش داده می‌شوند/);
});

test("guided Office requests scroll the page to NAVI's answer area after sending", () => {
  assert.match(guide, /const sendPromise = window\.sendOfficeNaviRequest\(\{ message, context \}\)/);
  assert.match(guide, /document\.querySelector\("\.office-assistant-column"\)/);
  assert.match(guide, /assistantColumn\.scrollIntoView\(\{ behavior: reducedMotion \? "auto" : "smooth", block: "start" \}\)/);
  assert.match(await readFileSync(new URL("../office-workspace.css", import.meta.url), "utf8"), /\.office-assistant-column\{scroll-margin-top:18px;/);
});


test("Office Operations removes the placeholder project-output area and provides a NAVI answer shortcut", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const paneStart = html.indexOf('id="officeOperationsPane"');
  const assistantStart = html.indexOf('<aside class="office-assistant-column"', paneStart);
  const operationsPane = html.slice(paneStart, assistantStart);
  assert.ok(paneStart >= 0 && assistantStart > paneStart, "Office Operations pane should exist");
  assert.doesNotMatch(operationsPane, /فضای خروجی پروژه|studio-output-card/);
  assert.match(operationsPane, /<div class="studio-brief-actions"><button class="btn-secondary" type="reset">پاک کردن فرم<\/button><button class="btn-primary" id="officeOperationsGoToNavi" type="button">اجرای درخواست با NAVI<\/button><\/div>/);
  assert.doesNotMatch(operationsPane, /office-operations-navi-cta/);
  assert.match(guide, /operationsNaviButton\?\.addEventListener\("click", scrollToNaviAnswers\)/);
  assert.match(guide, /const scrollToNaviAnswers = \(\) =>/);
});


test("Office Operations sends the existing form brief and all workflow settings directly to NAVI", () => {
  assert.match(guide, /operationsNaviButton\?\.addEventListener\("click", async \(\) =>/);
  for (const [key, pattern] of [
    ["task", /task:\s*selected\("studioTask-office"\)/],
    ["operation", /operation:\s*value\("studioMode-office"\)/],
    ["requestedOutput", /requestedOutput:\s*selected\("studioOutput-office"\)/],
    ["detailLevel", /detailLevel:\s*selected\("studioDetail-office"\)/],
    ["audience", /audience:\s*value\("studioAudience-office"\)/],
    ["brief", /brief\s*\}/]
  ]) assert.match(guide, pattern, `Missing Office Operations context field: ${key}`);
  assert.match(guide, /window\.sendOfficeNaviRequest\(\{ message, context \}\)/);
  assert.match(guide, /شرح درخواست و اطلاعات فایل/);
  assert.match(guide, /ابتدا شرح درخواستت را در فرم بالا بنویس/);
  assert.match(guide, /نیازی به نوشتن دوباره نیست/);
});
