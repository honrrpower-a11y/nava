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
  for (const key of ["application:app.value", "userLevel:level.value", 'operation:"guide"', "brief:task"]) {
    assert.ok(guide.includes(key), `Missing guided Office context: ${key}`);
  }
  assert.match(app, /requestContext\?\.service\s*===\s*"کارهای اداری و آفیس"/);
});

test("Office file extraction appends extracted text to the brief sent through the context path", () => {
  assert.match(fileTools, /brief\.value=\(originalBrief\?originalBrief\+"\\n\\n":""\)\+attachment/);
  assert.match(fileTools, /متن استخراج‌شده از فایل/);
  assert.match(app, /brief:\s*18000/);
});
