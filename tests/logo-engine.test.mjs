import test from "node:test";
import assert from "node:assert/strict";
import { buildStructuredLogoConcepts } from "../modules/logo-engine.js";

const base = {
  brandName: "آوای نو",
  slogan: "موسیقی، هنر",
  designMode: "custom",
  designPrompt: "کتابی که خودکاری از عطف آن بیرون می‌آید",
  symbolIdea: "کتاب و نوشتن",
  industry: "هنر و فرهنگ",
  format: "combination",
  singleConcept: false
};

const blueprint = (title, geometrySpec, extra = {}) => ({
  title,
  rationale: "این مسیر، معنای برند را با یک فرم مشخص و قابل تشخیص منتقل می‌کند.",
  metaphor: "استعاره بصری مستقل",
  meaningChain: "معنای برند به استعاره و سپس به فرم قابل مشاهده متصل می‌شود.",
  centralThesis: "یک ساختار بصری مستقل برای بیان هویت برند",
  briefElements: ["فرم اصلی", "جزء مکمل", "رابطه فضایی"],
  symbolConstruction: "اجزای اصلی در یک سیلوئت منسجم و قابل تشخیص به هم متصل می‌شوند.",
  briefAlignment: "این ساختار خواسته اصلی برند را با یک فرم مستقل و قابل تشخیص نمایش می‌دهد.",
  silhouette: "سیلوئت اختصاصی و نامتقارن",
  objectCues: ["لبه بیرونی شاخص", "جزء مرکزی قابل تشخیص"],
  spatialRelationship: "جزء مکمل به بدنه اصلی متصل است و از آن جدا دیده نمی‌شود.",
  negativeSpace: "فضای منفی میان اجزا به تشخیص فرم اصلی کمک می‌کند.",
  geometryRecipe: "چهار لایه هندسی با اندازه و جایگاه مستقل ساخته می‌شوند.",
  firstRead: "نماد ترکیبی مستقل",
  recognitionRisk: "ممکن است به شکل تزئینات پراکنده دیده شود.",
  signatureFeature: "اتصال فیزیکی اجزای اصلی در یک سیلوئت",
  geometrySpec,
  ...extra
});

const geometryA = { layers: [
  { shape:"polygon", x:50, y:55, width:76, height:48, rotation:0, tone:"primary", finish:"metal", points:[[0,15],[50,0],[100,15],[88,100],[12,100]] },
  { shape:"rounded-rect", x:50, y:42, width:9, height:65, rotation:8, tone:"secondary", finish:"metal" },
  { shape:"ellipse", x:50, y:14, width:16, height:16, rotation:0, tone:"accent", finish:"soft" },
  { shape:"polygon", x:50, y:76, width:34, height:12, rotation:0, tone:"light", finish:"none", points:[[0,0],[100,0],[85,100],[15,100]] }
] };
const geometryB = { layers: [
  { shape:"ellipse", x:50, y:50, width:78, height:78, rotation:0, tone:"dark", finish:"soft" },
  { shape:"diamond", x:50, y:50, width:58, height:58, rotation:12, tone:"secondary", finish:"metal" },
  { shape:"rounded-rect", x:50, y:50, width:16, height:72, rotation:-32, tone:"light", finish:"soft" },
  { shape:"ellipse", x:72, y:27, width:13, height:13, rotation:0, tone:"accent", finish:"metal" },
  { shape:"capsule", x:30, y:72, width:34, height:9, rotation:18, tone:"primary", finish:"none" }
] };
const geometryC = { layers: [
  { shape:"polygon", x:50, y:49, width:66, height:78, rotation:0, tone:"primary", finish:"metal", points:[[50,0],[100,28],[84,100],[16,100],[0,28]] },
  { shape:"polygon", x:50, y:43, width:43, height:48, rotation:0, tone:"paper", finish:"soft", points:[[0,0],[100,0],[78,100],[22,100]] },
  { shape:"capsule", x:50, y:37, width:8, height:42, rotation:0, tone:"secondary", finish:"metal" },
  { shape:"ellipse", x:50, y:16, width:12, height:12, rotation:0, tone:"accent", finish:"soft" }
] };

test("each concept is rendered from its own NAVI-authored geometry blueprint", () => {
  const blueprints = [
    blueprint("قلم از عطف", geometryA),
    blueprint("پیوندِ موسیقی", geometryB),
    blueprint("صفحه‌ی رو به آینده", geometryC)
  ];
  const result = buildStructuredLogoConcepts(base, blueprints);
  assert.equal(result.family, "blueprint");
  assert.equal(result.concepts.length, 3);
  assert.equal(new Set(result.concepts.map(item => item.css)).size, 3);
  assert.equal(new Set(result.concepts.map(item => item.css)).size, 3);
  for (const concept of result.concepts) {
    assert.match(concept.html, /class="navi-symbol" data-logo-role="symbol"/);
    assert.match(concept.html, /navi-part-1/);
    assert.match(concept.css, /\.navi-symbol/);
    assert.match(concept.css, /background:/);
    assert.equal(concept.semanticGeometry[0], "blueprint-driven-" + (concept.html.match(/class="navi-part /g) || []).length + "-layer-mark");
    assert.doesNotMatch(concept.html + concept.css, /<\s*\/?\s*svg\b|<path\b|<circle\b/i);
    assert.equal(concept.anchorMap.length, concept.visualAnchors.length);
  }
});

test("the renderer honors integrated geometry, position, material and negative-space primitives", () => {
  const concept = buildStructuredLogoConcepts(base, [blueprint("قلم از کتاب", geometryA)]).concepts[0];
  assert.match(concept.html, /navi-part-4/);
  assert.match(concept.css, /left:50%;top:55%;width:76%;height:48%/);
  assert.match(concept.css, /clip-path:polygon/);
  assert.match(concept.css, /linear-gradient/);
  assert.match(concept.css, /box-shadow/);
});

test("invalid or incomplete geometry is rejected instead of silently reusing a family template", () => {
  assert.throws(
    () => buildStructuredLogoConcepts(base, [blueprint("ناقص", { layers: geometryA.layers.slice(0, 2) })]),
    /4–8 independent layers/
  );
  const bad = structuredClone(geometryA);
  bad.layers[0].x = 140;
  assert.throws(
    () => buildStructuredLogoConcepts(base, [blueprint("مختصات نامعتبر", bad)]),
    /invalid primitive/
  );
});

test("renderer normalizes common model vocabulary and repairs incomplete polygon details without weakening coordinate safety", () => {
  const compatible = structuredClone(geometryA);
  compatible.layers[0].shape = "freeform";
  compatible.layers[0].points = [];
  compatible.layers[0].tone = "gold";
  compatible.layers[1].shape = "rect";
  compatible.layers[1].finish = "glossy";
  compatible.layers[2].shape = "circle";
  compatible.layers[2].tone = "cyan";
  const concept = buildStructuredLogoConcepts(base, [blueprint("سازگار", compatible)]).concepts[0];
  assert.match(concept.css, /linear-gradient/);
  assert.match(concept.css, /navi-part-4/);
  assert.match(concept.css, /rotate\(calc\(var\(--part-rotation\) \+ 45deg\)\)/);
  const badCoordinate = structuredClone(geometryA);
  badCoordinate.layers[0].x = 140;
  assert.throws(() => buildStructuredLogoConcepts(base, [blueprint("مختصات خارج محدوده", badCoordinate)]), /invalid primitive/);
});

test("wordmark-only output does not invent a symbol or require geometry layers", () => {
  const result = buildStructuredLogoConcepts(
    { ...base, format: "wordmark" },
    [blueprint("Wordmark", { layers: [] })]
  );
  assert.equal(result.concepts.length, 1);
  assert.doesNotMatch(result.concepts[0].html, /navi-symbol|<svg/i);
  assert.match(result.concepts[0].html, /data-logo-role="brand"/);
});
