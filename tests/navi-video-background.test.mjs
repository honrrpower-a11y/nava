import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const video = readFileSync(new URL("../video-studio.js", import.meta.url), "utf8");

test("NAVI video creation runs in the background without opening or writing to chat", () => {
  const requestBlock = video.match(/\$\("navaVideoAskNavi"\)[\s\S]*?\n\s*\}\);/)?.[0] || "";
  assert.ok(requestBlock.includes("navaVideoNaviRequest"));
  assert.doesNotMatch(requestBlock, /openNaviAssistant/);
  assert.match(app, /let requestThreadId = isHomePage \|\| options\.videoPlan === true \? "" : naviActiveThreadId/);
  assert.match(app, /history: isHomePage \|\| options\.videoPlan === true \? \[\] : naviHistory\.slice/);
  assert.match(app, /if \(options\.videoPlan !== true\) \{[\s\S]{0,240}showNaviReply\("در حال دریافت پاسخ از ناوی/);
  assert.match(app, /The video studio owns this task's progress and result panel; never render it in chat/);
  assert.match(app, /The video studio displays this failure in its own lower result panel/);
});

test("NAVI video plans still trigger automatic validation, repair, and local result feedback", () => {
  assert.match(video, /nava:navi-reply/);
  assert.match(video, /nava:navi-error/);
  assert.match(video, /ناوی در حال بازبینی و اصلاح خودکار آن است/);
  assert.match(video, /function resultStatusNavi\(message\)[\s\S]*?navaVideoNaviResult/);
  assert.match(video, /طرح اختصاصی ناوی با موفقیت اعمال شد/);
});

test("NAVI keeps the active studio context when restoring a guest's return form", () => {
  const restore = app.match(/function restoreNavaReturnContext\(\)\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(restore.includes("syncNaviStudioContextFromActivePage()"));
  assert.doesNotMatch(restore, /showPage\(pending\.pageId\)/);
});
