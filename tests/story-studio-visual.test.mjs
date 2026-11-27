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
  assert.match(app, /const resolvedRequestPage = options\.storyPlan === true \? "storyPage" : requestPage/);
  assert.match(app, /if \(saveThisMessageToMemory && !storyPlan\)/);
  assert.match(app, /detail: \{ service: selectedService, reply, storyPlan: true/);
  assert.match(app, /nava\.story\.plan\.v1/);
  assert.match(app, /renderNaviStoryPlan\(parseNaviStoryPlan/);
});

test("Story Studio renders vertical slides and exports PNG locally", () => {
  assert.match(app, /canvas\.width=Math\.round\(w\*scale\);canvas\.height=Math\.round\(h\*scale\)/);
  assert.match(app, /drawStorySlide\(exportCanvas,slide,index,plan\.slides\.length,1,storySlideImages/);
  assert.match(app, /exportCanvas\.toBlob/);
  assert.match(app, /nava-story-/);
  assert.match(html, /id="storyVisualSlides"/);
  assert.match(html, /story=reply-contract-20261127-1/);
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

test("Story Studio analyzes selected photos locally and derives per-slide typography and palette", () => {
  assert.match(app, /function analyzeStoryPhoto\(photo\)/);
  assert.match(app, /getImageData\(0,0,48,48\)/);
  assert.match(app, /function resolveStorySlideDesign\(slide,photo,index\)/);
  assert.match(app, /design\.headlineFont/);
  assert.match(app, /design\.bodyFont/);
  assert.match(app, /needsPanel:false/);
  assert.match(app, /shadowColor=photo\&\&imagePlacement==="background"/);
  assert.doesNotMatch(app, /c\.fillStyle="#07101fe8";c\.fillRect\(design\.panelX/);
  assert.match(app, /const photoAnalysis=photo\?analyzeStoryPhoto\(photo\):null/);
});


test("Story Studio exposes photo-analysis results and uses the detected safe zone in layout", () => {
  assert.match(app, /brightnessLabel/);
  assert.match(app, /busyLabel/);
  assert.match(app, /تحلیل عکس انجام شد/);
  assert.match(app, /safeZone/);
  assert.match(app, /count\*\.12/);
  assert.match(app, /const textX=align==="left"\?115:align==="center"\?540:965/);
  assert.match(app, /فضای مناسب متن/);
});

test("Story Studio sends selected photos through NAVI vision and applies per-slide art direction", () => {
  assert.match(app, /storyPhotosInput/);
  assert.match(app, /NaviLocalImageAnalysis\?\.analyze/);
  assert.match(app, /storyPhotoVisionImages/);
  assert.match(app, /images: options\.videoPlan === true \? visionImages : undefined/);
  assert.match(app, /storyImages: storyPlan \? visionImages : undefined/);
  assert.match(app, /imageIndex/);
  assert.match(navi, /هر تصویر را جداگانه از محتوای واقعی آن تحلیل کن/);
  assert.match(navi, /imageIndex=0 یعنی آن اسلاید عمداً بدون عکس باشد/);
  assert.match(navi, /تکرار عکس را نه اجباری کن و نه ممنوع/);
  assert.match(app, /می‌توانی یک عکس را برای چند اسلاید انتخاب کنی/);
  assert.match(app, /noneOption\.textContent="بدون عکس"/);
  assert.match(app, /imageSelect\.addEventListener\("change"/);
  assert.match(navi, /تکرار عکس را نه اجباری کن و نه ممنوع/);
  assert.match(navi, /typeTreatment/);
  assert.match(navi, /headlineColor/);
});

test("Story Studio uses art-directed slide layouts with varied editorial compositions", () => {
  assert.match(app, /const layouts=\["cover","editorial","split","quote","details","closing"\]/);
  assert.match(app, /layout==="cover"/);
  assert.match(app, /layout==="split"/);
  assert.match(app, /layout==="quote"/);
  assert.match(app, /layout==="details"/);
  assert.match(app, /layout==="closing"/);
  assert.match(navi, /layout/);
  assert.match(navi, /layout را بی\u200cدلیل تکرار نکن/);
  assert.match(app, /در فیلد reply پاسخ بیرونی NAVI، فقط یک رشته JSON معتبر/);
  assert.doesNotMatch(app, /فقط JSON معتبر و بدون Markdown با schema زیر برگردان/);
});


test("Story Studio enforces phone-readable type sizes and WCAG contrast for generated colors", () => {
  assert.match(app, /function storyContrastRatio\(first,second\)/);
  assert.match(app, /function storyReadableColor\(candidate,fallback,surface,minimum=4\.5\)/);
  assert.match(app, /const zoneBrightness=ranked\[0\]\?\.lum\?\?brightness/);
  assert.match(app, /const photoInk=zoneBrightness>\.46\?"#17202b":"#ffffff"/);
  assert.match(app, /const textColor=design\.headlineColor,bodyColor=design\.bodyColor/);
  assert.match(app, /const bodySize=busy>\.55\?62:68/);
  assert.match(app, /slide\.typeTreatment==="oversized"\?/);
  assert.match(html, /story-photo-contrast-and-independent-images-20261127-1/);
});


test("Story Studio applies art-direction typography profiles and Persian-safe role hierarchy", () => {
  assert.match(app, /const serifDisplay=slide\.typeTreatment==="serif"\|\|artDirection==="editorial"\|\|artDirection==="luxury"\|\|layout==="quote"/);
  assert.match(app, /const bodyFamily="Vazirmatn,sans-serif"/);
  assert.match(app, /const displayWeight=artDirection==="bold"\|\|artDirection==="poster"\|\|artDirection==="tech"\?900/);
  assert.match(app, /headlineLineHeight=serifDisplay\?142:132/);
  assert.match(app, /bodyLineHeight=bodySize>=68\?96:90/);
  assert.match(app, /design\.headlineLineHeight/);
  assert.match(app, /design\.bodyLineHeight/);
  assert.match(app, /design\.matchupFont/);
  assert.match(navi, /فونت نستعلیق یا خوشنویسی را برای متن اطلاعاتی و بدنه انتخاب نکن/);
  assert.match(navi, /در یک مجموعه، خانواده فونت‌ها هماهنگ بماند/);
  assert.match(html, /Vazirmatn:wght@400;600;700;800;900/);
});

test("Story Studio protects selected typography colors against low contrast and photo highlights", () => {
  assert.match(app, /const contrastSurface=photoBackground\?/);
  assert.match(app, /rgba\(3,8,18,\.28\)/);
  assert.match(app, /rgba\(3,8,18,\.68\)/);
  assert.match(app, /storyReadableColor\(design\.headlineColor,lightLayout\?/);
  assert.match(navi, /headlineColor و bodyColor باید با سطح پس\u200cزمینه/);
  assert.match(navi, /accent حداقل 3:1/);
});

test("Story Studio has no forced NAVA/page footer and only renders an explicit optional brand signature", () => {
  assert.doesNotMatch(app, /fillText\("NAVA  \/  "/);
  assert.match(app, /typeof slide\.brandSignature==="string"/);
  assert.match(app, /if\(brandSignature\)/);
  assert.match(navi, /brandSignature/);
  assert.match(navi, /هرگز NAVA یا شماره اسلاید را خودکار اضافه نکن/);
});


test("Story Studio enforces a larger minimum type scale for mobile and NAVI avoids compact typography", () => {
  assert.match(app, /busy>\.55\?112:132/);
  assert.match(app, /kickerFont:"700 48px/);
  assert.match(app, /const bodySize=busy>\.55\?62:68/);
  assert.match(app, /700 60px Vazirmatn/);
  assert.match(navi, /قانون سخت خوانایی موبایل/);
  assert.doesNotMatch(navi, /typeTreatment[^\n]{0,80}compact/);
});
