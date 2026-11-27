import test from "node:test";
import assert from "node:assert/strict";
import { getNaviMessageLimit } from "../modules/navi.js";
import { prepareNaviHistory } from "../modules/navi-memory.js";

test("ordinary NAVI messages retain the 12,000-character limit", () => {
  assert.equal(getNaviMessageLimit({}, "homePage"), 12000);
  assert.equal(getNaviMessageLimit({ videoPlan: false }, "avPage"), 12000);
});

test("only isolated video-plan requests on the video page receive the larger limit", () => {
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "avPage"), 24000);
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "homePage"), 12000);
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "officePage"), 12000);
});

test("SEO report handoffs receive a larger limit only on the SEO page", () => {
  assert.equal(getNaviMessageLimit({ seoReport: true }, "seoPage"), 24000);
  assert.equal(getNaviMessageLimit({ seoReport: true }, "homePage"), 12000);
  assert.equal(getNaviMessageLimit({ seoReport: false }, "seoPage"), 12000);
});

test("conversation preparation preserves an SEO report above the ordinary 12,000-character cap", () => {
  const report = "گزارش سئو " + "جزئیات یافته‌ها ".repeat(1200);
  const contents = prepareNaviHistory([], report, 24000);
  assert.equal(contents[0].role, "user");
  assert.equal(contents[0].parts[0].text, report);
});

import { parseNaviGeminiResponse } from "../modules/navi.js";

test("video scene plans are carried inside NAVI's required outer JSON reply envelope", () => {
  const scenePlan = JSON.stringify({
    schema: "nava.video.scene-plan.v1",
    scenes: [{ duration: 4, images: [1], layout: "single" }]
  });
  const envelope = JSON.stringify({
    reply: scenePlan,
    officeAction: null,
    memoryProposals: []
  });
  const parsed = parseNaviGeminiResponse(envelope);
  assert.equal(parsed.reply, scenePlan);
  assert.equal(JSON.parse(parsed.reply).schema, "nava.video.scene-plan.v1");
  assert.equal(parsed.structured, true);
});
