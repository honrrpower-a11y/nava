import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildNaviPlatformKnowledge } from "../modules/navi-knowledge.js";

test("homepage NAVI receives a usable overview of current NAVA studios", () => {
  const knowledge = buildNaviPlatformKnowledge("homePage");
  for (const term of [
    "طراحی لوگو و هویت بصری",
    "استراتژی برند",
    "تولید محتوا",
    "مقاله و وبلاگ",
    "Word، PDF، Excel و PowerPoint",
    "ابزارهای کسب‌وکار",
    "ساخت و تدوین ویدئو",
    "سئو و تبلیغات",
    "قاعده ویژه صفحه خانه",
    "از امکانات سایت خبر ندارم"
  ]) assert.ok(knowledge.includes(term), `Missing homepage capability: ${term}`);
});

test("video studio knowledge describes the real build and editing workflows", () => {
  const knowledge = buildNaviPlatformKnowledge("avPage");
  assert.match(knowledge, /تب ساخت ویدئو/);
  assert.match(knowledge, /تب تدوین ویدئو/);
  assert.match(knowledge, /خروجی MP4/);
  assert.match(knowledge, /چت معمولی NAVI.*فقط راهنمایی متنی/);
  assert.doesNotMatch(knowledge, /فعلاً صفحه بریف و برنامه‌ریزی است/);
});

test("Office and business knowledge reflects implemented workflows", () => {
  const office = buildNaviPlatformKnowledge("officePage");
  for (const term of ["Word", "PDF", "Excel", "PowerPoint", "کارت تأیید"]) {
    assert.ok(office.includes(term), `Missing Office capability: ${term}`);
  }
  const business = buildNaviPlatformKnowledge("bizPage", "ledger");
  assert.match(business, /صندوق و تأمین‌کنندگان/);
  assert.match(business, /زیرتب فعال:.*صندوق و تأمین‌کنندگان/);
});

test("NAVI accepts the ledger business tab as a known page context", () => {
  const source = fs.readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.match(source, /"dashboard", "transactions", "accounts", "ledger", "catalog"/);
});
