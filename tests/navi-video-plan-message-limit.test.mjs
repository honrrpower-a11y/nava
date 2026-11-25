import test from "node:test";
import assert from "node:assert/strict";
import { getNaviMessageLimit } from "../modules/navi.js";

test("ordinary NAVI messages retain the 12,000-character limit", () => {
  assert.equal(getNaviMessageLimit({}, "homePage"), 12000);
  assert.equal(getNaviMessageLimit({ videoPlan: false }, "avPage"), 12000);
});

test("only isolated video-plan requests on the video page receive the larger limit", () => {
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "avPage"), 24000);
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "homePage"), 12000);
  assert.equal(getNaviMessageLimit({ videoPlan: true }, "officePage"), 12000);
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
