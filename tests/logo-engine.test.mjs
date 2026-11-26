import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredLogoConcepts } from "../modules/logo-engine.js";

const base = {
  brandName: "کتابستان",
  slogan: "خانه‌ی کتاب",
  designMode: "custom",
  designPrompt: "لوگوی حرفه‌ای کتابفروشی با نماد کتاب باز",
  symbolIdea: "کتاب باز",
  industry: "کتابفروشی",
  format: "combination",
  singleConcept: false
};

test("structured logo engine builds three distinct native HTML/CSS book marks", () => {
  const blueprints = [0,1,2].map((n) => ({
    title: "مسیر " + (n + 1),
    centralThesis: "کتاب باز با ساختار متفاوت " + n,
    briefElements: ["کتاب", "صفحه", "عطف"],
    symbolConstruction: "دو صفحه و عطف مرکزی در سیلوئت کتاب",
    briefAlignment: "نماد کتاب باز برای کتابفروشی",
    firstRead: "کتاب باز",
    signatureFeature: "عطف مرکزی"
  }));
  const result = buildStructuredLogoConcepts(base, blueprints);
  assert.equal(result.family, "book");
  assert.equal(result.concepts.length, 3);
  assert.equal(new Set(result.concepts.map(item => item.css)).size, 3);
  for (const concept of result.concepts) {
    assert.match(concept.html, /class="navi-symbol" data-logo-role="symbol"/);
    assert.match(concept.html, /class="book-|class="closed-book|class="angular-book/);
    assert.match(concept.css, /\.navi-symbol/);
    assert.match(concept.css, /background/);
    assert.doesNotMatch(concept.html + concept.css, /<\s*\/?\s*svg\b|<path\b|<circle\b/i);
    assert.equal(concept.anchorMap.length, concept.visualAnchors.length);
  }
});

test("structured logo engine selects subject-specific grammars from the client brief", () => {
  const cases = [
    [{ ...base, designPrompt: "نماد موج موسیقی و صدا", industry: "استودیوی موسیقی" }, "music"],
    [{ ...base, designPrompt: "نماد شبکه و اینترنت با گره‌های متصل", industry: "فناوری شبکه" }, "network"],
    [{ ...base, designPrompt: "لوگوی نانوایی با نان واقعی", industry: "نانوایی" }, "bread"],
    [{ ...base, designPrompt: "برگ طبیعی و گیاه", industry: "گل و گیاه" }, "leaf"],
    [{ ...base, designPrompt: "فنجان قهوه", industry: "کافه" }, "coffee"]
  ];
  for (const [brief, expected] of cases) {
    const blueprints = [0,1,2].map(n => ({
      title: "Route " + n,
      briefElements: ["subject"],
      centralThesis: "A distinct thesis " + n,
      symbolConstruction: "A recognizable subject construction",
      briefAlignment: "A direct match to the client request",
      firstRead: "A recognizable subject"
    }));
    assert.equal(buildStructuredLogoConcepts(brief, blueprints).family, expected);
  }
});

test("wordmark-only format remains native HTML/CSS and does not invent a symbol", () => {
  const result = buildStructuredLogoConcepts({ ...base, format: "wordmark" }, [{
    title: "Wordmark", briefElements: ["brand name"], centralThesis: "Wordmark thesis",
    symbolConstruction: "Custom type treatment", briefAlignment: "Matches requested wordmark",
    firstRead: "Brand name"
  }]);
  assert.equal(result.concepts.length, 1);
  assert.doesNotMatch(result.concepts[0].html, /navi-symbol|<svg/i);
  assert.match(result.concepts[0].html, /data-logo-role="brand"/);
});
