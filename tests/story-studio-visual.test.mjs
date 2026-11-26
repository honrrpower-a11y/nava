import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

test("Story Studio routes NAVI design responses to a visual renderer, not chat", () => {
  assert.match(app, /storyPlan\s*:\s*true/);
  assert.match(app, /detail: \{ service: selectedService, reply, storyPlan: true/);
  assert.match(app, /nava\.story\.plan\.v1/);
  assert.match(app, /renderNaviStoryPlan\(parseNaviStoryPlan/);
});

test("Story Studio renders vertical slides and exports PNG locally", () => {
  assert.match(app, /canvas\.width=Math\.round\(w\*scale\); canvas\.height=Math\.round\(h\*scale\)/);
  assert.match(app, /drawStorySlide\(exportCanvas,slide,index,plan\.slides\.length,1\)/);
  assert.match(app, /exportCanvas\.toBlob/);
  assert.match(app, /nava-story-/);
  assert.match(html, /id="storyVisualSlides"/);
  assert.match(css, /\.story-visual-canvas/);
});

test("Story design requests are isolated from chat history and memory", () => {
  assert.match(app, /isolatedContext: isHomePage \|\| options\.videoPlan === true \|\| storyPlan/);
  assert.match(app, /saveThisMessageToMemory = options\.videoPlan === true \|\| storyPlan/);
  assert.match(app, /history: isHomePage \|\| options\.videoPlan === true \|\| storyPlan \? \[\]/);
});
