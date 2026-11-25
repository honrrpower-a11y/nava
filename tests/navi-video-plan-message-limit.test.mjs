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
