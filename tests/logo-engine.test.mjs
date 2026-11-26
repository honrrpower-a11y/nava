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
    assert.match(concept.html, /class="book-|class="closed-book|class="turning-page/);
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


test("NAVI's ray and light construction cues become visible native HTML/CSS geometry", () => {
  const blueprint = {
    title: "کتاب و روشنایی",
    centralThesis: "کتاب گشوده که نور از عطف آن می‌تابد",
    briefElements: ["کتاب باز", "عطف مرکزی", "پرتوهای نور"],
    symbolConstruction: "دو صفحه باز با عطف روشن و پرتوهای منشعب از مرکز",
    briefAlignment: "کتاب و روشنایی دانش در یک نشان یکپارچه",
    firstRead: "کتاب باز با پرتو نور",
    objectCues: ["دو صفحه مستقل و قابل تشخیص", "پرتوهای باریک نور از عطف"],
    spatialRelationship: "پرتوها از بالای عطف مرکزی به بیرون باز می‌شوند",
    negativeSpace: "فاصله باریک میان دو صفحه مسیر نور را تعریف می‌کند",
    geometryRecipe: "دو صفحه کتاب باز؛ سه تا پنج پرتو نور از عطف به سمت بالا",
    signatureFeature: "پرتوهای طلایی برخاسته از عطف کتاب"
  };
  const result = buildStructuredLogoConcepts(base, [blueprint]);
  const concept = result.concepts[0];
  assert.ok(concept.semanticGeometry.includes("diffuse-gutter-glow"));
  assert.match(concept.css, /\.book-spread::after\{content:"";.*radial-gradient/s);
  assert.match(concept.css, /border-radius:50%/);
  assert.doesNotMatch(concept.html + concept.css, /semantic-inspiration|inspiration-core|clip-path:polygon\(50% 0/);
  assert.doesNotMatch(concept.html + concept.css, /semantic-ray|semantic-radiance/);
  assert.match(concept.geometryRecipe, /پرتو نور/);
});

test("NAVI's asymmetric spatial relationship changes the subject's actual geometry", () => {
  const blueprint = {
    title: "شبکه نامتقارن",
    centralThesis: "شبکه‌ای با یک گره اصلی پررنگ‌تر",
    briefElements: ["گره مرکزی", "اتصال‌ها", "گره بزرگ‌تر"],
    symbolConstruction: "گره مرکزی و مسیرهای ارتباطی با یک سمت برجسته‌تر",
    briefAlignment: "نماد شبکه با تاکید نامتقارن",
    firstRead: "شبکه ارتباطی",
    objectCues: ["گره‌های متصل", "گره اصلی بزرگ‌تر"],
    spatialRelationship: "یک سمت شبکه پرتر و ضخیم‌تر از سمت دیگر است",
    negativeSpace: "فاصله میان گره‌ها باید خوانا بماند",
    geometryRecipe: "شبکه‌ای با یک سمت پرتر و گره اصلی بزرگ‌تر",
    signatureFeature: "تاکید نامتقارن بر یک سمت شبکه"
  };
  const result = buildStructuredLogoConcepts({
    ...base, designPrompt: "نماد شبکه و اینترنت", industry: "فناوری شبکه"
  }, [blueprint]);
  const concept = result.concepts[0];
  assert.ok(concept.semanticGeometry.includes("asymmetric-mass"));
  assert.match(concept.css, /\.net-node\.node-a\{width:33%/);
  assert.match(concept.css, /\.net-node\.node-b\{width:21%/);
  assert.match(concept.spatialRelationship, /پرتر/);
});


test("book concepts use three genuinely different silhouettes and never place a spear over the closed book or page turn", () => {
  const blueprints = [0,1,2].map((n) => ({
    title: "کتاب و روشنایی " + n,
    centralThesis: "کتاب گشوده که نور از عطف آن می‌تابد",
    briefElements: ["کتاب", "صفحه", "روشنایی"],
    symbolConstruction: "کتاب و صفحه با ساختار مستقل " + n,
    briefAlignment: "هویت فرهنگی و مطالعه",
    firstRead: "کتاب",
    objectCues: ["پرتو نور", "کتاب"],
    geometryRecipe: "کتاب با روشنایی"
  }));
  const result = buildStructuredLogoConcepts(base, blueprints);
  const [open, closed, page] = result.concepts;
  assert.match(open.html, /book-spread/);
  assert.match(open.css, /diffuse|radial-gradient/);
  assert.match(closed.html, /closed-book/);
  assert.match(page.html, /turning-page|page-sheet|page-fold/);
  assert.doesNotMatch(closed.html + closed.css, /semantic-inspiration|inspiration-core|clip-path:polygon\(50% 0/);
  assert.doesNotMatch(page.html + page.css, /semantic-inspiration|inspiration-core|clip-path:polygon\(50% 0/);
  assert.equal(new Set(result.concepts.map(item => item.html)).size, 3);
  assert.equal(new Set(result.concepts.map(item => item.css)).size, 3);
});
