import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getNaviMessageLimit, shouldUseNaviStoryPlanContext } from "../modules/navi.js";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const navi = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");

test("Story Studio routes NAVI design responses to a visual renderer, not chat", () => {
  assert.match(app, /storyPlan\s*:\s*true/);
  assert.match(app, /detail: \{ service: selectedService, reply, storyPlan: true/);
  assert.match(app, /nava\.story\.plan\.v1/);
  assert.match(app, /renderNaviStoryPlan\(parseNaviStoryPlan/);
});

test("Story Studio renders vertical slides and exports PNG locally", () => {
  assert.match(app, /canvas\.width=Math\.round\(w\*scale\); canvas\.height=Math\.round\(h\*scale\)/);
  assert.match(app, /drawStorySlide\(exportCanvas,slide,index,plan\.slides\.length,1,storySlideImages/);
  assert.match(app, /exportCanvas\.toBlob/);
  assert.match(app, /nava-story-/);
  assert.match(html, /id="storyVisualSlides"/);
  assert.match(css, /\.story-visual-canvas/);
});

test("NAVI can request optional user photos per slide and the renderer uses them in preview and PNG", () => {
  assert.match(app, /imageRequest/);
  assert.match(app, /imagePlacement/);
  assert.match(app, /story-image-upload/);
  assert.match(app, /storySlideImages/);
  assert.match(navi, /عکس اختیاری است؛ طرح باید بدون آن کامل بماند/);
  assert.match(css, /\.story-image-request/);
});

test("Story design requests are isolated from chat history and memory", () => {
  assert.match(app, /isolatedContext: isHomePage \|\| options\.videoPlan === true \|\| storyPlan/);
  assert.match(app, /saveThisMessageToMemory = options\.videoPlan === true \|\| storyPlan/);
  assert.match(app, /history: isHomePage \|\| options\.videoPlan === true \|\| storyPlan \? \[\]/);
});

test("backend recognizes Story Studio requests only on storyPage and allocates a plan budget", () => {
  assert.equal(shouldUseNaviStoryPlanContext({ storyPlan: true }, "storyPage"), true);
  assert.equal(shouldUseNaviStoryPlanContext({ storyPlan: true }, "homePage"), false);
  assert.equal(shouldUseNaviStoryPlanContext({ storyPlan: false }, "storyPage"), false);
  assert.equal(getNaviMessageLimit({ storyPlan: true }, "storyPage"), 24000);
  assert.equal(getNaviMessageLimit({ storyPlan: true }, "homePage"), 12000);
});

test("backend uses a dedicated structured visual brief and excludes prior chat history", () => {
  const backend = readFileSync(new URL("../modules/navi.js", import.meta.url), "utf8");
  assert.match(backend, /const isStoryPlanRequest = shouldUseNaviStoryPlanContext\(input, page\)/);
  assert.match(backend, /این درخواست یک کار طراحی گرافیکی است/);
  assert.match(backend, /if \(!isVideoPlanRequest && !isStoryPlanRequest\)/);
  assert.match(backend, /storyPlan: isStoryPlanRequest/);
});
