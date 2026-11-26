import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { handleLogoRoute } from "../modules/logo.js";

const ORIGIN = "https://honrrpower-a11y.github.io";
const VISITOR = "2f8b7c1a-7e3d-4b9c-9a10-8f7c6d5e4a32";
const INPUT = {
  visitorId: VISITOR,
  brandName: "نوا",
  slogan: "صدای ایده‌های تازه",
  industry: "استودیوی خلاقیت و موسیقی",
  audience: "هنرمندان و کسب‌وکارهای خلاق",
  symbolIdea: "ترکیب موج صوتی و حرف ن",
  personality: "مدرن و جسور",
  personalityValue: "bold",
  typography: "فارسی خوانا و اصیل",
  typographyValue: "persian",
  format: "combination",
  formatLabel: "نماد + نام برند",
  palette: "طلایی و سفید",
  primaryColor: "#D6A84F",
  darkColor: "#FFFFFF"
};

function makeDesign() {
  return {
    brandCore: "هویتی شنیداری و خلاق",
    designIdea: "پیوند صدا و خلاقیت در یک نشان اختصاصی",
    strategy: "سه مسیر مستقل با تکیه بر هویت برند و موج صوتی.",
    designBriefEnglish: "Create a distinctive Persian creative-studio identity. Build a compact sound-inspired symbol with custom geometry, confident Persian typography, balanced negative space, and the exact gold and white palette.",
    concepts: [
      { title: "موج پیوند", centralThesis: "پیوند دو مسیر صوتی به یک نشانه پیوسته و باز تبدیل می‌شود", briefElements: ["موج صوتی","اتصال دو مسیر"], symbolConstruction: "دو مسیر منحنی در مرکز به هم می‌رسند و یک شکاف پیوسته در دل فرم می‌سازند", briefAlignment: "این فرم اتصال صدا و خلاقیت را در هویت استودیوی موسیقی نشان می‌دهد", rationale: "پیوند صدا و خلاقیت", mechanism: "اتصال دو مسیر صوتی به یک فرم مشترک، نماد و تایپوگرافی را به هم پیوند می‌دهد.", expressionMove: "شکاف مرکزی پیوسته", differsBy: "ساختار باز و نامتقارن در برابر نشان‌های بسته رقبا", axes: { "سنتی–معاصر": "معاصر", "آرام–بیانگر": "بیانگر" }, defaultsUsed: [], html: '<div class="mark"><div class="navi-symbol seal" data-logo-role="symbol"><span class="wave"></span><span class="orbit"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small><script>window.pwned=true</script></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:48px}.mark{text-align:center;display:grid;gap:24px;justify-items:center}.navi-symbol{display:grid;place-items:center;width:260px;height:260px;border:2px solid var(--logo-primary);border-radius:50%;background:radial-gradient(circle at center,#263b59,var(--logo-background));box-shadow:0 12px 28px rgba(0,0,0,.2)}.seal{display:grid;place-items:center}.wave{display:block;width:150px;height:60px;border:8px solid var(--logo-primary);border-radius:50%}.orbit{display:block;width:190px;height:190px;border:1px solid #5ac9bd;border-radius:50%}@keyframes breathe{0%{opacity:.75}100%{opacity:1}}.wave{animation:breathe 3s ease-in-out infinite}' },
      { title: "حرف ن", centralThesis: "حرف آغازین برند با برش منفی اختصاصی به نماد مستقل بدل می‌شود", briefElements: ["حرف ن","فضای منفی"], symbolConstruction: "تنه هندسی حرف با یک فضای منفی زاویه‌دار بریده می‌شود و سیلوئت حرف را می‌سازد", briefAlignment: "این نشانه از حرف نخست نام برند ساخته شده و هویت فارسی آن را برجسته می‌کند", rationale: "تمرکز بر حرف آغازین برند", mechanism: "ساختار حرف ن از فضای منفی به نشانی مستقل تبدیل می‌شود.", expressionMove: "برش منفی در تنه حرف", differsBy: "تکیه بر طراحی اختصاصی حرف به‌جای نماد صوتی", axes: { "سنتی–معاصر": "میانه", "آرام–بیانگر": "آرام" }, defaultsUsed: [], html: '<div class="letter"><div class="navi-symbol monogram" data-logo-role="symbol"><span class="cut"></span><span class="accent"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:40px}.letter{font-size:70px;font-weight:900;display:grid;gap:22px;justify-items:center;text-align:center}.navi-symbol{width:240px;height:240px;border:3px solid var(--logo-primary);display:grid;place-items:center;border-radius:28px;background:linear-gradient(135deg,#253b59,var(--logo-background));box-shadow:0 10px 24px rgba(0,0,0,.25)}.monogram{display:grid;place-items:center}.cut{display:block;width:110px;height:110px;border:12px solid var(--logo-primary);border-left-color:#59c9bc;border-radius:32px}.accent{display:block;width:70px;height:5px;background:#59c9bc;border-radius:5px}' },
      { title: "طنین", centralThesis: "سه واحد هندسی تکرارشونده ریتم و گسترش ایده را مجسم می‌کنند", briefElements: ["طنین","تکرار سه‌مرحله‌ای"], symbolConstruction: "سه حجم تو در تو با فاصله‌های افزایشی یک ریتم دیداری مشخص ایجاد می‌کنند", briefAlignment: "تکرار سه‌گانه مفهوم طنین و گسترش ایده در فضای موسیقی را منتقل می‌کند", rationale: "بازتاب ایده در صدا", mechanism: "تکرار کنترل‌شده یک واحد هندسی، طنین و توسعه ایده را هم‌زمان نشان می‌دهد.", expressionMove: "ریتم سه‌مرحله‌ای", differsBy: "نشانه انتزاعی مبتنی بر تکرار به‌جای حروف یا موج مستقیم", axes: { "سنتی–معاصر": "معاصر", "آرام–بیانگر": "میانه" }, defaultsUsed: [], html: '<div class="echo"><div class="navi-symbol symbol" data-logo-role="symbol"><span class="navi-symbol__detail" aria-hidden="true"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:36px}.echo{text-align:center;font-size:54px;display:grid;justify-items:center;gap:20px}.navi-symbol{position:relative;display:grid;place-items:center;width:220px;height:220px;padding:24px;border:2px solid var(--logo-primary);border-radius:50%;background:radial-gradient(circle at center,#344968,var(--logo-background));box-shadow:0 12px 26px rgba(0,0,0,.2)}.navi-symbol__detail{display:block;width:45%;height:45%;border:8px solid var(--logo-primary);border-radius:38%}.echo span{color:#59c9bc;letter-spacing:8px}.echo strong{font-weight:900;letter-spacing:2px}' }
    ]
  };
}

class FakeD1 {
  constructor() {
    this.visitorUsed = 0;
    this.ipUsed = 0;
    this.reservations = new Map();
  }
  prepare(sql) {
    const db = this;
    let args = [];
    return {
      get sql() { return sql; },
      get args() { return args; },
      bind(...values) { args = values; return this; },
      async run() {
        if (sql.includes("INSERT INTO nava_guest_trial_reservations")) {
          db.reservations.set(args[0], { status: "reserved", visitorHash: args[1] });
        }
        return { meta: { changes: 1 } };
      },
      async first() {
        if (sql.includes("SELECT used_count FROM nava_guest_trials")) {
          return db.visitorUsed ? { used_count: db.visitorUsed } : null;
        }
        if (sql.includes("INSERT INTO nava_guest_ip_limits")) {
          db.ipUsed += 1;
          return { used_count: db.ipUsed };
        }
        if (sql.includes("INSERT INTO nava_guest_trials")) {
          db.visitorUsed += 1;
          return { used_count: db.visitorUsed };
        }
        return null;
      }
    };
  }
  async batch(statements) {
    const reservationId = statements[0].args[1];
    const row = this.reservations.get(reservationId);
    const changed = row?.status === "reserved";
    if (changed) {
      row.status = "refunded";
      this.visitorUsed = Math.max(0, this.visitorUsed - 1);
    }
    return [{ meta: { changes: changed ? 1 : 0 } }];
  }
}

function makeRequest(body = INPUT) {
  return new Request("https://worker.example/logo/generate", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "CF-Connecting-IP": "203.0.113.10",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function makeGeminiResponse(plan = makeDesign()) {
  for (const concept of plan.concepts || []) {
    concept.silhouette ||= concept.symbolConstruction || concept.centralThesis;
    concept.objectCues ||= (concept.briefElements || []).slice(0, 2);
    while (concept.objectCues.length < 2) concept.objectCues.push("ویژگی تشخیصی فرم");
    concept.spatialRelationship ||= concept.briefAlignment || concept.symbolConstruction;
    concept.negativeSpace ||= concept.symbolConstruction;
    concept.geometryRecipe ||= concept.symbolConstruction;
    concept.firstRead ||= concept.centralThesis;
    concept.recognitionRisk ||= "برداشت کلی و مبهم؛ باید با نشانه‌های تشخیصی دقیق‌تر اصلاح شود";
    concept.signatureFeature ||= "ویژگی هندسی اختصاصی و قابل تشخیص در سیلوئت";
    const html = String(concept.html || "");
    const symbolStart = html.indexOf('class="navi-symbol');
    const symbolOpenEnd = symbolStart >= 0 ? html.indexOf(">", symbolStart) : -1;
    const symbolClose = symbolOpenEnd >= 0 ? html.indexOf("</div>", symbolOpenEnd) : -1;
    const symbolInner = symbolClose >= 0 ? html.slice(symbolOpenEnd + 1, symbolClose) : "";
    const innerClasses = [...symbolInner.matchAll(/class="([^"]+)"/g)]
      .flatMap(match => match[1].split(/\s+/))
      .filter(name => name && name !== "navi-symbol");
    const styledClasses = [...new Set(innerClasses)].filter(name =>
      new RegExp("\\." + name + "(?=[\\s.:#\\[,{>\\{])").test(concept.css || ""));
    const elements = Array.isArray(concept.briefElements) && concept.briefElements.length >= 1
      ? concept.briefElements.slice(0, 5)
      : ["عنصر اصلی بریف", "رابطه هندسی اصلی"];
    concept.visualAnchors = elements.map((description, index) => ({
      id: "anchor-" + (index + 1),
      description,
      relationship: "این جزء در ساختار اصلی نشان با فرم مکمل پیوند دارد"
    }));
    concept.anchorMap = concept.visualAnchors.map((anchor, index) => ({
      anchorId: anchor.id,
      layerClass: styledClasses[index % Math.max(1, styledClasses.length)] || "navi-symbol",
      visualRole: "این لایه هندسه قابل مشاهده جزء مربوط را در نشان می‌سازد"
    })).filter(entry => entry.layerClass);
  }
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("NAVI writes a professional creative brief before building three sanitized HTML/CSS logo designs", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let geminiCalls = 0;
  let sentPrompt = "";
  const sentPrompts = [];
  globalThis.fetch = async (_url, options) => {
    geminiCalls += 1;
    sentPrompt = JSON.stringify(JSON.parse(options.body));
    sentPrompts.push(sentPrompt);
    if (geminiCalls === 1) {
      const generated = await makeGeminiResponse();
      const payload = await generated.json();
      const planned = JSON.parse(payload.candidates[0].content.parts[0].text);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ brandCore: planned.brandCore, designIdea: planned.designIdea, strategy: planned.strategy, designBriefEnglish: planned.designBriefEnglish, blueprints: planned.concepts }) }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return makeGeminiResponse();
  };
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(geminiCalls, 1, "NAVI plans once; the structured HTML/CSS engine performs the actual construction");
    assert.match(sentPrompts[0], /senior identity concept architect/i);
    assert.match(sentPrompts[0], /geometryRecipe/i);
    assert.match(sentPrompts[0], /exactly 3 objects/i);
    assert.match(sentPrompts[0], /Do not rename the concepts key/i);
    assert.match(sentPrompts[0], /Do not write HTML, CSS, SVG/i);
    assert.match(sentPrompts[0], /at least two diagnostic visual cues/i);
    assert.match(sentPrompts[0], /signatureFeature/i);
    assert.match(sentPrompts[0], /recognitionRisk/i);
    assert.match(sentPrompts[0], /plain dome with parallel bars/i);
    assert.equal(geminiCalls, 1, "one planning call is sufficient; the deterministic engine constructs the logo geometry");
    assert.match(sentPrompt, /A concise professional art-direction brief/);
    assert.match(sentPrompt, /Do not write HTML, CSS, SVG/i);
    assert.equal(result.planning.method, "navi-visual-blueprint-then-structured-html-css-build");
    assert.equal(result.planning.geometryEngine, "structured-html-css-grammar");
    assert.match(sentPrompts[0], /professional art-direction brief/i);
    assert.equal(geminiCalls, 1, "the second free-form HTML/CSS generation call has been removed");
    assert.match(sentPrompts[0], /A concise professional art-direction brief/);
    assert.equal(result.planning.extraModelCalls, 0, "only NAVI blueprint planning is generative; the actual logo geometry is built deterministically");
    assert.equal(result.planning.visualBlueprints.length, 3);
    assert.ok(result.planning.visualBlueprints.every(item => item.geometryRecipe && item.silhouette && item.objectCues.length >= 2 && item.signatureFeature && item.recognitionRisk));
    assert.match(result.planning.designBriefEnglish, /distinctive Persian creative-studio identity/i);
    assert.ok(result.concepts.every(item => item.html.includes("نوا")));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="brand"')));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="slogan"')));
    assert.ok(result.concepts.every(item => item.html.includes("صدای ایده‌های تازه")));
    assert.ok(result.concepts.every(item => !item.html.includes("{{BRAND_NAME}}")));
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.ok(result.concepts.every(item => item.css.includes("var(--logo-primary)")));
    assert.ok(result.concepts[0].css.includes(".navi-symbol"), "the structured geometry engine supplies the actual mark CSS");
    assert.ok(result.concepts.every(item => !Object.prototype.hasOwnProperty.call(item, "svg")));
    assert.ok(result.concepts.every(item => !JSON.stringify(item).includes("foreignObject")));
    assert.ok(result.concepts.every(item => item.html.includes("<div")));
    assert.ok(result.concepts.every(item => !Object.prototype.hasOwnProperty.call(item, "svg")), "SVG is never returned as a separate export field");
    assert.ok(result.concepts.every(item => item.css.length > 0));
    assert.ok(result.concepts.every(item => item.visualAnchors.length >= 1));
    assert.ok(result.concepts.every(item => item.anchorMap.length === item.visualAnchors.length));
    assert.equal(result.concepts[0].centralThesis, "پیوند دو مسیر صوتی به یک نشانه پیوسته و باز تبدیل می‌شود");
    assert.equal(result.concepts[0].symbolConstruction, "دو مسیر منحنی در مرکز به هم می‌رسند و یک شکاف پیوسته در دل فرم می‌سازند");
    assert.equal(result.concepts[0].briefAlignment, "این فرم اتصال صدا و خلاقیت را در هویت استودیوی موسیقی نشان می‌دهد");
    assert.deepEqual(result.concepts[0].briefElements, ["موج صوتی","اتصال دو مسیر"]);
    assert.match(result.concepts[0].mechanism, /deterministic HTML\/CSS component grammar/);
    assert.equal(result.concepts[0].expressionMove, "ویژگی هندسی اختصاصی و قابل تشخیص در سیلوئت");
    assert.match(result.concepts[0].differsBy, /distinct silhouette and geometry/);
    assert.ok(result.concepts[0].axes && Object.keys(result.concepts[0].axes).length > 0);
    assert.deepEqual(result.concepts[0].defaultsUsed, []);
    assert.ok(result.concepts.every(item => item.html.length >= 90 && item.css.length >= 350), "each concept must contain substantial HTML and CSS");
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.equal(db.visitorUsed, 1, "one completed logo batch consumes one guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test("Logo Studio recovers omitted visual-anchor arrays from the validated brief and real CSS symbol", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const design = makeDesign();
  design.concepts = [design.concepts[0]];
  delete design.concepts[0].visualAnchors;
  delete design.concepts[0].anchorMap;
  design.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="wave"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center;gap:20px}.navi-symbol{width:240px;height:240px;background:var(--logo-primary);border-radius:38% 62% 55% 45%}.wave{display:block;width:50%;height:30%;border:8px solid var(--logo-background);border-radius:50%}';
  globalThis.fetch = async () => makeGeminiResponse(design);
  try {
    const response = await handleLogoRoute({
      request: makeRequest({ ...INPUT, singleConcept: true }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 1);
    assert.equal(result.concepts[0].visualAnchors.length, 2);
    assert.equal(result.concepts[0].anchorMap.length, 2);
    assert.ok(result.concepts[0].anchorMap.every(entry => ["wave", "navi-symbol"].includes(entry.layerClass)));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects SVG-based artwork instead of silently stripping it and showing CSS fallback geometry", async () => {
  const originalFetch = globalThis.fetch, db = new FakeD1(), design = makeDesign();
  design.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="navi-symbol__detail"></span><span class="navi-symbol__part"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;gap:20px;justify-items:center}.navi-symbol{position:relative;width:220px;height:220px;background:var(--logo-primary);clip-path:polygon(50% 0,94% 26%,82% 82%,50% 100%,18% 82%,6% 26%)}.navi-symbol__detail{position:absolute;inset:22%;border:10px solid var(--logo-background);border-radius:50%}.navi-symbol__part{position:absolute;width:32%;height:18%;right:12%;top:38%;background:var(--logo-background);transform:rotate(-28deg);border-radius:50%}.mark strong{font-size:48px;font-weight:900}';
  design.concepts[1].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><svg viewBox="0 0 200 200"><path d="M20 20 H180 V180 H20 Z"/></svg><span class="navi-symbol__detail"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  globalThis.fetch = async () => makeGeminiResponse(design);
  try {
    const response = await handleLogoRoute({request:makeRequest(),env:{NAVA_DB:db,NAVI_SESSION_SECRET:"test-secret-key",GEMINI_API_KEY:"test-gemini-key"},origin:ORIGIN,corsOrigin:ORIGIN});
    const result = await response.json();
    assert.equal(response.status,200);
    assert.equal(result.success,true);
    assert.ok(result.concepts.every(concept => !concept.html.includes("<svg") && !concept.html.includes("<path")));
    assert.equal(db.visitorUsed,1);
  } finally {globalThis.fetch=originalFetch;}
});

test("NAVI never returns SVG-only model markup because the structured engine builds the final mark", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const design = makeDesign();
  design.concepts[0].html = '<div><svg viewBox="0 0 200 200"><path d="M20 20 H180 V180 H20 Z"/></svg></div>';
  design.concepts[0].css = ".navi-symbol{width:1px;height:1px}";
  globalThis.fetch = async () => makeGeminiResponse(design);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.ok(result.concepts.every(concept => !concept.html.includes("<svg") && !concept.html.includes("<path")));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects a two-line sketch instead of presenting it as a logo", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const sketch = makeDesign();
  sketch.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span></span><span></span></div><strong>{{BRAND_NAME}}</strong></div>';
  sketch.concepts[0].css = '.logo-art-root{display:grid;place-items:center}.mark{display:grid;gap:20px}.navi-symbol{width:220px;height:8px;background:transparent;border-radius:0}.navi-symbol span{display:block;width:100px;height:2px;background:var(--logo-primary);transform:rotate(-20deg)}.mark strong{font-size:48px;font-weight:900}';
  globalThis.fetch = async () => makeGeminiResponse(sketch);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    // A bad concept is rejected individually while the two valid concepts survive.
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(result.rejectedConcepts.length, 0);
    assert.ok(result.concepts.every(item => item.html.includes("data-logo-role=\\"symbol\\"")));
    assert.equal(db.visitorUsed, 1, "a usable partial batch consumes one guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI keeps valid concepts when one of three fails quality validation", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const mixed = makeDesign();
  mixed.concepts[1].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span></span><span></span></div><strong>{{BRAND_NAME}}</strong></div>';
  mixed.concepts[1].css = '.logo-art-root{display:grid;place-items:center}.mark{display:grid;gap:20px}.navi-symbol{width:220px;height:8px;background:transparent;border-radius:0}.navi-symbol span{display:block;width:100px;height:2px;background:var(--logo-primary);transform:rotate(-20deg)}.mark strong{font-size:48px;font-weight:900}';
  globalThis.fetch = async () => makeGeminiResponse(mixed);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(result.rejectedConcepts.length, 0);
    assert.ok(result.concepts.every(item => item.id && item.html.includes('data-logo-role="brand"')));
    assert.ok(result.concepts.every(item => !item.html.includes("{{BRAND_NAME}}")));
    assert.equal(db.visitorUsed, 1, "a usable partial batch consumes one guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects visually identical symbol geometry even when the concept descriptions differ", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const repeatedGeometry = makeDesign();
  // Keep the first symbol's complete HTML/CSS construction, but give the second
  // concept different strategy text and a different title. Only the mark geometry
  // is shared, which must be enough to reject it as a duplicate.
  repeatedGeometry.concepts[1].html = repeatedGeometry.concepts[0].html;
  repeatedGeometry.concepts[1].css = repeatedGeometry.concepts[0].css;
  repeatedGeometry.concepts[1].centralThesis = "یک فرم تازه با محوریت حرکت و گسترش ساخته می‌شود";
  repeatedGeometry.concepts[1].symbolConstruction = "هندسه‌ای متفاوت با لبه‌های تیز و فضای منفی مستقل شکل می‌گیرد";
  repeatedGeometry.concepts[1].title = "حرکت تازه";
  globalThis.fetch = async () => makeGeminiResponse(repeatedGeometry);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.concepts.length, 3);
    assert.equal(result.rejectedConcepts.length, 0);
    assert.equal(new Set(result.concepts.map(item => item.css)).size, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects repeated concepts that describe the same central idea and construction", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const repeated = makeDesign();
  repeated.concepts[1].centralThesis = repeated.concepts[0].centralThesis;
  repeated.concepts[1].symbolConstruction = repeated.concepts[0].symbolConstruction;
  repeated.concepts[2].centralThesis = repeated.concepts[0].centralThesis;
  repeated.concepts[2].symbolConstruction = repeated.concepts[0].symbolConstruction;
  globalThis.fetch = async () => makeGeminiResponse(repeated);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.concepts.length, 1);
    assert.equal(result.rejectedConcepts.length, 2);
    assert.ok(result.rejectedConcepts.every(item => item.code === "LOGO_CONCEPTS_NOT_DISTINCT"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects a concept with no traceable connection to the brief", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const untraceable = makeDesign();
  untraceable.concepts.forEach(item => {
    delete item.centralThesis;
    delete item.symbolConstruction;
    delete item.briefAlignment;
    delete item.briefElements;
  });
  let untraceCalls = 0;
  globalThis.fetch = async () => {
    untraceCalls += 1;
    return makeGeminiResponse(untraceCalls === 1 ? makeDesign() : untraceable);
  };
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI design failure refunds the guest trial reservation", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "simulated Gemini quota failure" }
  }), { status: 429, headers: { "Content-Type": "application/json" } });
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "MODEL_RATE_LIMIT");
    assert.equal(db.visitorUsed, 0);
    assert.equal([...db.reservations.values()][0].status, "refunded");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI CSS cannot load remote resources or execute injected markup", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const malicious = makeDesign();
  malicious.concepts[0].css += '.bad{background-image:url(https://example.com/track)}';
  globalThis.fetch = async () => makeGeminiResponse(malicious);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.ok(result.concepts.every(item => !/url\\s*\\(/i.test(item.css)));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test("NAVI repairs a missing brand placeholder with a visible semantic wordmark", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const invalid = makeDesign();
  invalid.concepts[1].html = invalid.concepts[1].html.replace("{{BRAND_NAME}}", "brand");
  globalThis.fetch = async () => makeGeminiResponse(invalid);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.ok(result.concepts[1].html.includes('<span data-logo-role="brand">نوا</span>'));
    assert.ok(!result.concepts[1].html.includes("{{BRAND_NAME}}"));
    assert.ok(!result.concepts[1].css.includes(".navi-brand-lockup"));
    assert.equal(db.visitorUsed, 1, "a recovered design batch should consume the trial normally");
    assert.equal([...db.reservations.values()][0].status, "reserved", "successful requests keep their reservation active for quota accounting");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI repairs a missing slogan placeholder with a visible semantic slogan", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const invalid = makeDesign();
  invalid.concepts[1].html = invalid.concepts[1].html.replace("{{SLOGAN}}", "decorative text");
  globalThis.fetch = async () => makeGeminiResponse(invalid);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.ok(result.concepts[1].html.includes('<span data-logo-role="slogan">صدای ایده‌های تازه</span>'));
    assert.ok(!result.concepts[1].html.includes("{{SLOGAN}}"));
    assert.ok(!result.concepts[1].css.includes(".navi-slogan-lockup"));
    assert.equal(db.visitorUsed, 1);
    assert.equal([...db.reservations.values()][0].status, "reserved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quality gate accepts a structured geometric logo without requiring gradients or shadows", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const geometric = makeDesign();
  geometric.concepts[2].css = [
    ".logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:36px}",
    ".echo{display:flex;flex-direction:column;align-items:center;gap:20px;text-align:center}",
    ".navi-symbol{position:relative;display:flex;width:220px;height:220px;background:var(--logo-primary);border:0;border-radius:42% 58% 52% 48%;clip-path:polygon(50% 0,100% 45%,70% 100%,15% 85%,0 35%);transform:rotate(-12deg)}",
    ".navi-symbol::before{content:'';position:absolute;width:45%;height:45%;border:8px solid var(--logo-background);border-radius:50%}",
    ".navi-symbol__detail{display:block;position:absolute;width:45%;height:45%;border:8px solid var(--logo-background);border-radius:50%}",
    ".echo strong{font-size:54px;font-weight:900;letter-spacing:1px;color:var(--logo-primary)}",
    ".echo small{font-size:22px;line-height:1.5;color:var(--logo-primary)}"
  ].join("");
  globalThis.fetch = async () => makeGeminiResponse(geometric);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.concepts.length, 3);
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI accepts compact but complete logo concepts without brittle visual-count rejection", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const invalid = makeDesign();
  invalid.concepts[2].html = '<div class="echo"><div class="navi-symbol" data-logo-role="symbol"><span class="navi-symbol__detail"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>';
  invalid.concepts[2].css = '.logo-art-root{display:grid;place-items:center}.echo{display:flex;flex-direction:column;align-items:center;font-size:48px;font-weight:900;position:relative}.navi-symbol{width:180px;height:180px;background:var(--logo-primary);border-radius:38%;display:grid;place-items:center;box-shadow:0 8px 18px rgba(0,0,0,.2)}.navi-symbol__detail{display:block;width:45%;height:45%;border:8px solid var(--logo-background);border-radius:50%}';
  globalThis.fetch = async () => makeGeminiResponse(invalid);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI reports truncated model output and refunds the reserved trial without retrying", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "HIGH");
    assert.equal("temperature" in body.generationConfig, false);
    assert.equal(body.generationConfig.maxOutputTokens, 8192);
    return new Response(JSON.stringify({
      candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"concepts":' }] } }],
      usageMetadata: { candidatesTokenCount: 32768 }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "MODEL_OUTPUT_TRUNCATED");
    assert.match(result.error, /پاسخ طراحی ناقص/);
    assert.equal(calls, 1, "the single planning response is rejected when truncated");
    assert.equal(db.visitorUsed, 0);
    assert.equal([...db.reservations.values()][0].status, "refunded");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI distinguishes an empty candidate response and refunds the trial", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => new Response(JSON.stringify({ candidates: [] }), {
    status: 200, headers: { "Content-Type": "application/json" }
  });
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(result.code, "MODEL_EMPTY_RESPONSE");
    assert.equal(db.visitorUsed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI categorizes Gemini quota errors without exposing provider error text", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "private provider quota detail and internal metadata" }
  }), { status: 429, headers: { "Content-Type": "application/json" } });
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(result.code, "MODEL_RATE_LIMIT");
    assert.doesNotMatch(result.error, /private provider quota detail/);
    assert.equal(db.visitorUsed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Persian text is painted with the browser canvas text shaper after DOM rasterization", () => {
 const source=readFileSync(new URL("../logo-renderer.js",import.meta.url),"utf8");
 assert.ok(source.includes("function paintNativeText"));
 assert.doesNotThrow(() => new Function(source), "logo-renderer.js must remain valid JavaScript");
 assert.ok(source.includes("ctx.direction=style.direction"));
 assert.ok(source.includes("ctx.fillText(line.text"));
 assert.ok(source.includes("hideCloneText(clone)"));
 assert.ok(source.includes("paintNativeText(canvas,root,rect"));
});
test("PNG export rasterizes the live HTML/CSS DOM directly with no SVG pipeline", () => {
  const source = readFileSync(new URL("../logo-renderer.js", import.meta.url), "utf8");
  const start = source.indexOf("async function renderFrameCanvas");
  const end = source.indexOf("global.NavaLogoRenderer", start);
  const exporter = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(exporter.includes("global.html2canvas(clone"));
  assert.ok(exporter.includes("copyComputedTree(root,document)"));
  assert.ok(source.includes("canvas.toBlob"));
  assert.ok(exporter.includes("getImageData"));
  assert.ok(exporter.includes("stage.remove()"));
  assert.ok(!source.includes("buildSvg"));
  assert.ok(!source.includes("createElementNS"));
  assert.ok(!source.includes("image/svg+xml"));
});
test("Logo Studio waits for a measurable sandboxed preview before PNG export", () => {
  const source = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(source.includes("async function waitForFrame(frame)"));
  assert.ok(source.includes("while (Date.now() < deadline)"));
  assert.ok(source.includes('querySelector(".logo-art-root")'));
  assert.ok(source.includes("rect.width > 0 && rect.height > 0"));
  assert.ok(source.includes("await waitForFrame(frame)"));
  assert.ok(source.includes("exportPngFromFrame(frame"));
  assert.ok(source.includes('frame.setAttribute("sandbox", "allow-same-origin")'));
  assert.ok(!source.includes("downloadSvg("));
});

test("Logo Studio builds a new card and a sandboxed HTML/CSS preview for every concept", () => {
  const source = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(source.includes("function previewDocument(concept, brief)"));
  assert.ok(source.includes("container-type:size!important"), "the logo artboard must scale to the mobile preview viewport");
  assert.ok(source.includes("max-width:100%!important;max-height:100%!important"), "preview and HTML export must not crop a fixed-size artboard");
  assert.ok(source.includes("function makeFrame(concept, brief)"));
  assert.ok(source.includes("frame.__navaMarkup = previewDocument(concept, brief)"));
  assert.ok(source.includes("frame.srcdoc = frame.__navaMarkup"));
  const mountStart = source.indexOf("function mountConcepts(concepts, brief, planning)");
  const mountEnd = source.indexOf("function getSession()", mountStart);
  const mountSource = source.slice(mountStart, mountEnd);
  assert.ok(mountSource.indexOf("results.append(card)") < mountSource.indexOf("frame.srcdoc = frame.__navaMarkup"), "visible preview iframes are initialized only after their cards are mounted");
  assert.ok(source.indexOf("function prepareReviewFrames(concepts, brief)") < source.indexOf("function mountConcepts(concepts, brief, planning)"), "hidden review frames are staged separately before accepted concepts are mounted");
  assert.ok(source.includes("function conceptCard(concept, index, brief)"));
  assert.ok(source.includes("results.append(card)"));
  assert.ok(source.includes("frame.className = \"logo-html-css-preview\""));
  assert.ok(source.includes("function updatePreviews()"));
  assert.ok(source.includes("const isLightCanvas = hex =>"), "preview background remains light without constraining logo colors");
  assert.ok(source.includes('data-logo-role=\"brand\"'));
  assert.ok(source.includes('data-logo-role=\"slogan\"'));
});



test("Logo Studio offers explicit concept selection and a standalone editable HTML/CSS export", () => {
  const source = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../logo-studio.css", import.meta.url), "utf8");
  assert.ok(source.includes("function downloadHtml(concept, brief, index, feedback, button)"));
  assert.ok(source.includes('type: "text/html;charset=utf-8"'));
  assert.ok(source.includes("previewDocument(concept, brief)"));
  assert.ok(source.includes("function showExportLink(feedback, message, link, filename)"), "successful exports must keep the same feedback node reusable for later downloads");
  assert.ok(source.includes("anchor.download = filename || \"nava-logo.png\""), "the visible fallback link must trigger an actual PNG download on mobile");
  assert.ok(source.includes('anchor.textContent = "دانلود PNG"'), "the user must have an explicit save link after rendering");
  assert.ok(source.includes("open.textContent = \" · بازکردن تصویر\""), "opening the rendered image remains available when the browser ignores download attributes");
  assert.ok(source.includes('anchor.download = safeName(brief.brandName)'));
  assert.ok(source.includes('chooseButton.dataset.logoSelect = "true"'));
  assert.ok(source.includes('item.classList.toggle("is-selected", selected)'));
  assert.ok(source.includes('htmlButton.textContent = "دریافت سورس HTML/CSS"'));
  assert.ok(styles.includes(".logo-concept-card.is-selected"));
  assert.ok(styles.includes(".logo-concept-actions [data-logo-select]"));
});


test("Logo Studio lets the client delegate ideation to NAVI or supply a binding custom idea", () => {
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  assert.ok(html.includes('name="logoIdeaMode" value="navi" checked'));
  assert.ok(html.includes('name="logoIdeaMode" value="custom"'));
  assert.ok(html.includes('id="logoIdeaPrompt"'));
  assert.ok(ui.includes("designMode: getIdeaMode()"));
  assert.ok(ui.includes('designPrompt: getIdeaMode() === "custom" ? fields.ideaPrompt.value.trim() : ""'));
  assert.ok(ui.includes('brief.designMode === "custom" && !brief.designPrompt'));
  assert.ok(backend.includes('designMode: input?.designMode === "custom" ? "custom" : "navi"'));
  assert.ok(backend.includes('data.designMode === "custom" ? data.designPrompt : ""'));
  assert.ok(backend.includes("IDEA OWNERSHIP — CLIENT MODE"));
  assert.ok(backend.includes("IDEA OWNERSHIP — NAVI MODE"));
  assert.ok(backend.includes("designIdea: naviCreativeBrief.designIdea"));
  assert.ok(ui.includes("planning.designIdea"));
});


test("NAVI accepts a layered CSS-only symbol without SVG", async () => {
  const originalFetch=globalThis.fetch,db=new FakeD1(),design=makeDesign();
  design.concepts[0].html='<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="navi-symbol__detail"></span><span class="navi-symbol__part"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[0].css='.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;gap:20px;justify-items:center}.navi-symbol{position:relative;width:220px;height:220px;background:var(--logo-primary);border-radius:42% 58% 52% 48%;clip-path:polygon(50% 0,100% 45%,70% 100%,15% 85%,0 35%)}.navi-symbol__detail{position:absolute;inset:25%;border:8px solid var(--logo-background);border-radius:50%}.navi-symbol__part{position:absolute;width:40%;height:16%;left:30%;top:42%;background:var(--logo-background);transform:rotate(30deg)}.mark strong{font-size:48px;font-weight:900}';
  globalThis.fetch=async()=>makeGeminiResponse(design);
  try {const response=await handleLogoRoute({request:makeRequest(),env:{NAVA_DB:db,NAVI_SESSION_SECRET:"test-secret-key",GEMINI_API_KEY:"test-gemini-key"},origin:ORIGIN,corsOrigin:ORIGIN});const result=await response.json();assert.equal(response.status,200);assert.equal(result.success,true);assert.equal(result.concepts.length,3,JSON.stringify(result.rejectedConcepts));assert.doesNotMatch(result.concepts[0].html, /<(?:svg|path|circle|ellipse|rect|polygon|polyline|line)\b/i);}
  finally {globalThis.fetch=originalFetch;}
});


test("NAVI correctly validates symbol layers nested inside multiple DIV wrappers", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const nested = makeDesign();
  nested.concepts[0].html = nested.concepts[0].html.replace(
    '<span class="wave"></span><span class="orbit"></span>',
    '<div class="layer-shell"><div class="layer-core"><span class="wave"></span><span class="orbit"></span></div></div>'
  );
  nested.concepts[0].css += '.layer-shell{display:grid;place-items:center;width:100%;height:100%}.layer-core{display:flex;align-items:center;justify-content:center;width:90%;height:90%}';
  globalThis.fetch = async () => makeGeminiResponse(nested);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3);
    assert.equal(result.concepts[0].anchorMap.length, 2);
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("NAVI quality gate accepts responsive min/max dimensions while requiring a styled construction layer", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const responsive = makeDesign();
  responsive.concepts[0].css = responsive.concepts[0].css
    .replace("width:260px;height:260px", "width:min(72cqw, 320px);height:max(56cqw, 240px)");
  globalThis.fetch = async () => makeGeminiResponse(responsive);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.ok(result.concepts.some(concept => concept.title === "موج پیوند"));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI accepts a clean solid silhouette without forcing decorative CSS effects or extra layers", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const clean = makeDesign();
  clean.concepts[0].briefElements = ["یک فرم یکپارچه"];
  clean.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="wave"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  clean.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center;gap:20px}.navi-symbol{width:240px;height:240px;background:var(--logo-primary);border-radius:38% 62% 55% 45%}.wave{display:block;width:50%;height:30%;border:8px solid var(--logo-background);border-radius:50%}';
  globalThis.fetch = async () => makeGeminiResponse(clean);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.concepts[0].visualAnchors.length, 1);
    assert.equal(result.concepts[0].anchorMap.length, 1);
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});



test("NAVI accepts a single unified symbol silhouette without artificial child layers", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const unified = makeDesign();
  unified.concepts[0].briefElements = ["یک نشان یکپارچه"];
  unified.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"></div><strong>{{BRAND_NAME}}</strong></div>';
  unified.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center;gap:20px}.navi-symbol{width:240px;height:240px;background:var(--logo-primary);border-radius:18% 52% 24% 58%;clip-path:polygon(50% 0,100% 40%,72% 100%,0 78%,12% 28%)}';
  globalThis.fetch = async () => makeGeminiResponse(unified);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.concepts[0].visualAnchors.length, 1);
    assert.equal(result.concepts[0].anchorMap[0].layerClass, "navi-symbol");
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects stray line strokes that do not form a filled logo silhouette", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const linesOnly = makeDesign();
  linesOnly.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center}.navi-symbol{position:relative;width:240px;height:240px;background:var(--logo-primary);border:2px solid var(--logo-primary)}.wave{position:absolute;left:10%;top:48%;width:80%;height:4px;background:var(--logo-background);transform:rotate(35deg)}.orbit{position:absolute;left:10%;top:48%;width:80%;height:4px;background:var(--logo-background);transform:rotate(-35deg)}';
  globalThis.fetch = async () => makeGeminiResponse(linesOnly);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.rejectedConcepts.length, 0);
    assert.ok(result.concepts[0].css.includes(".navi-symbol"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI quality gate does not count an empty named layer as geometric construction", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const weak = makeDesign();
  weak.concepts[0].html = weak.concepts[0].html.replace('<span class="orbit"></span>', "");
  weak.concepts[0].css = weak.concepts[0].css
    .replace(".wave{display:block;width:150px;height:60px;border:8px solid var(--logo-primary);border-radius:50%}", ".wave{display:block}")
    .replace(".orbit{display:block;width:190px;height:190px;border:1px solid #5ac9bd;border-radius:50%}", ".orbit{display:block}");
  globalThis.fetch = async () => makeGeminiResponse(weak);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.ok(result.rejectedConcepts.some(item => item.index === 1 && item.code === "LOGO_SYMBOL_UNDERBUILT"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("NAVI accepts a transparent symbol wrapper when nested layers create the actual filled geometry", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const layered = makeDesign();
  layered.concepts[0].css = layered.concepts[0].css
    .replace(/\\.navi-symbol\\{[^}]*\\}/, ".navi-symbol{position:relative;display:grid;place-items:center;width:260px;height:260px}")
    .replace(".wave{display:block;width:150px;height:60px;border:8px solid var(--logo-primary);border-radius:50%}", ".wave{display:block;width:150px;height:60px;background:var(--logo-primary);clip-path:polygon(0 40%,20% 10%,50% 80%,80% 10%,100% 40%,100% 65%,80% 35%,50% 100%,20% 35%,0 65%)}");
  globalThis.fetch = async () => makeGeminiResponse(layered);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.ok(result.concepts.some(concept => concept.title === "موج پیوند"));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("Logo Studio renders structured HTML/CSS geometry and audits final PNGs without generative code rewriting", () => {
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../modules/logo-engine.js", import.meta.url), "utf8");
  const generateStart = ui.indexOf("async function generate(event)");
  const generateEnd = ui.indexOf("ideaModeInputs.forEach", generateStart);
  const generateSource = ui.slice(generateStart, generateEnd);
  assert.ok(generateSource.includes("visuallyAuditFinalConcepts("));
  assert.ok(!generateSource.includes("visuallyRefineConcepts("), "a generative revision must not overwrite structured mark geometry");
  assert.ok(ui.includes("capturePreviewDataUrl(frame, 640)"));
  assert.ok(ui.includes("function prepareReviewFrames(concepts, brief)"));
  assert.ok(ui.includes("visibility:visible"));
  assert.ok(ui.includes("result.reviewToken"));
  assert.ok(ui.includes('action: "visual-final-audit"'));
  assert.ok(ui.includes("طرح تأییدنشده نمایش داده نشد"));
  assert.ok(backend.includes("buildStructuredLogoConcepts"));
  assert.ok(backend.includes("geometryEngine: \"structured-html-css-grammar\""));
  assert.ok(engine.includes("subject-specific"));
  assert.ok(engine.includes("buildStructuredLogoConcepts"));
  assert.ok(engine.includes("No SVG"));
  assert.ok(backend.includes("TWO STAGES IN ORDER"));
  assert.ok(backend.includes("LOGO_FINAL_VISUAL_QUALITY_LOW"));
});
test("NAVI visual refinement reviews real PNGs, validates revised HTML/CSS, and does not consume another trial", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let sentPayload;
  try {
    globalThis.fetch = async () => makeGeminiResponse();
    const initialResponse = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const initial = await initialResponse.json();
    assert.equal(initialResponse.status, 200, JSON.stringify(initial));
    assert.ok(initial.reviewToken, "initial design must issue a short-lived signed visual-review token");
    assert.equal(db.visitorUsed, 1);

    const original = initial.concepts[0];
    const html = '<div class="mark"><div class="navi-symbol seal" data-logo-role="symbol"><span class="wave"></span><span class="orbit"></span></div><strong><span data-logo-role="brand">نوا</span></strong><small><span data-logo-role="slogan">صدای ایده‌های تازه</span></small></div>';
    const css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center;gap:20px}.navi-symbol{position:relative;width:240px;height:240px;background:var(--logo-primary);border-radius:34% 66% 42% 58%;clip-path:polygon(50% 0,100% 42%,72% 100%,0 78%,12% 28%)}.wave{display:block;width:70%;height:24%;border:8px solid var(--logo-background);border-radius:50%}.orbit{position:absolute;inset:12%;border:3px solid var(--logo-background);border-radius:50%}';
    globalThis.fetch = async (_url, options) => {
      sentPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            concepts: [{ index: 1, html, css, visualRevisionNotes: "تناسب نشان و جای‌گیری لایه‌ها پس از مشاهده رندر واقعی اصلاح شد.", firstRead: "نشان صوتی پیوسته", unaidedRead: "نشان صوتی پیوسته", likelyMisread: "فرم انتزاعی", semanticEvidence: ["فرم اصلی قابل تشخیص", "جزء دوم در ساختار ادغام شده"], recognitionScore: 9, briefFidelityScore: 9, craftScore: 8 }]
          }) }] }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const concept = { ...original, html, previewImage: "data:image/png;base64,aGVsbG8=" };
    const response = await handleLogoRoute({
      request: makeRequest({
        ...INPUT, action: "visual-refine", reviewToken: initial.reviewToken, concepts: [concept]
      }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.visualReview.method, "render-review-refine");
    assert.equal(result.visualReview.refinedCount, 1);
    assert.equal(result.concepts[0].visualReview, "refined");
    assert.match(result.concepts[0].html, /data-logo-role="brand"/);
    assert.match(result.concepts[0].html, /نوا/);
    assert.ok(sentPayload.contents[0].parts.some(part => part.inlineData?.mimeType === "image/png"));
    assert.ok(sentPayload.contents[0].parts.some(part => part.text?.includes(original.briefAlignment)));
    assert.equal(db.visitorUsed, 1, "visual review must not reserve or consume another guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects a visually revised logo when blind-read recognition scores below the quality threshold", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  try {
    globalThis.fetch = async () => makeGeminiResponse();
    const initialResponse = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const initial = await initialResponse.json();
    const original = initial.concepts[0];
    const html = original.html.replace('class="navi-symbol', 'class="navi-symbol revised');
    const css = original.css + '.navi-symbol.revised{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)}';
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        concepts: [{
          index: 1, html, css,
          visualRevisionNotes: "فرم نماد بازطراحی شد.",
          firstRead: "یک شکل انتزاعی نامشخص", unaidedRead: "یک شکل انتزاعی نامشخص", likelyMisread: "کارت‌های روی هم", semanticEvidence: ["لبه‌های لایه‌ای", "سطح هندسی"], 
          recognitionScore: 5, briefFidelityScore: 9, craftScore: 9
        }]
      }) }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const response = await handleLogoRoute({
      request: makeRequest({
        ...INPUT, action: "visual-refine", reviewToken: initial.reviewToken,
        concepts: [{ ...original, previewImage: "data:image/png;base64,aGVsbG8=" }]
      }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.visualReview.refinedCount, 0);
    assert.equal(result.concepts[0].visualReviewIssue, "LOGO_VISUAL_QUALITY_LOW");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI rejects cosmetic-only visual revisions that leave the logo symbol geometry unchanged", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  try {
    globalThis.fetch = async () => makeGeminiResponse();
    const initialResponse = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const initial = await initialResponse.json();
    const original = initial.concepts[0];
    globalThis.fetch = async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        concepts: [{ index: 1, html: original.html, css: original.css + ".mark{transform:scale(1.02)}", visualRevisionNotes: "اندازه قاب کمی تغییر کرد.", firstRead: "فرم مبهم", unaidedRead: "فرم مبهم", likelyMisread: "شکل انتزاعی", semanticEvidence: ["لبه‌های چندضلعی", "لایه‌های تزئینی"], recognitionScore: 9, briefFidelityScore: 9, craftScore: 9 }]
      }) }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const response = await handleLogoRoute({
      request: makeRequest({ ...INPUT, action: "visual-refine", reviewToken: initial.reviewToken, concepts: [{ ...original, previewImage: "data:image/png;base64,aGVsbG8=" }] }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.visualReview.refinedCount, 0);
    assert.equal(result.concepts[0].visualReviewIssue, "LOGO_REVIEW_NO_MATERIAL_CHANGE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI keeps the client brief in charge while the structured engine owns actual HTML/CSS geometry", () => {
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../modules/logo-engine.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(backend.includes("designPrompt: data.designMode === \"custom\" ? data.designPrompt : \"\""));
  assert.ok(backend.includes("buildStructuredLogoConcepts(data, designBlueprints)"));
  assert.ok(backend.includes("deterministic HTML/CSS grammar"));
  assert.ok(engine.includes("data.designPrompt"));
  assert.ok(engine.includes("subject-specific"));
  assert.ok(engine.includes("book:"));
  assert.ok(engine.includes("music:"));
  assert.ok(engine.includes("network:"));
  assert.ok(engine.includes("bread:"));
  assert.ok(engine.includes("leaf:"));
  assert.ok(engine.includes("coffee:"));
  assert.ok(engine.includes("monogram:"));
  assert.ok(ui.includes("visuallyAuditFinalConcepts("));
  assert.ok(!ui.slice(ui.indexOf("async function generate(event)"), ui.indexOf("ideaModeInputs.forEach"))
    .includes("visuallyRefineConcepts("));
});
test("NAVI accepts valid logo geometry when CSS selectors are scoped beneath the artboard", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const scoped = makeDesign();
  scoped.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="wave"></span><span class="orbit"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>';
  scoped.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.logo-art-root .mark{display:grid;gap:24px;justify-items:center}.logo-art-root .navi-symbol{position:relative;width:240px;height:240px;background:var(--logo-primary);border-radius:42%;display:grid;place-items:center}.logo-art-root .wave{display:block;width:70%;height:24%;border:8px solid var(--logo-background);border-radius:50%;transform:rotate(-18deg)}.logo-art-root .orbit{position:absolute;inset:12%;border:3px solid var(--logo-background);border-radius:50%}';
  globalThis.fetch = async () => makeGeminiResponse(scoped);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 3, JSON.stringify(result.rejectedConcepts));
    assert.ok(!result.rejectedConcepts.some(item => item.index === 1));
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("NAVI accepts a complete unified silhouette even when an optional child node has no styling", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const unified = makeDesign();
  unified.concepts = [unified.concepts[0]];
  unified.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="unused-detail"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>';
  unified.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;justify-items:center;gap:20px}.navi-symbol{width:240px;height:240px;background:var(--logo-primary);border-radius:18% 52% 24% 58%;clip-path:polygon(50% 0,100% 40%,72% 100%,0 78%,12% 28%)}';
  globalThis.fetch = async () => makeGeminiResponse(unified);
  try {
    const response = await handleLogoRoute({
      request: makeRequest({ ...INPUT, singleConcept: true }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.concepts.length, 1);
    assert.equal(result.concepts[0].anchorMap[0].layerClass, "navi-symbol");
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("NAVI retries a transient Gemini service failure once before returning a logo result", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) return new Response(JSON.stringify({ error: { message: "temporary overload" } }), { status: 503 });
    return makeGeminiResponse();
  };
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(calls, 2, "the single planning request is retried once after a transient service error");
    assert.equal(db.visitorUsed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("NAVI exposes per-concept visual refinement rejection diagnostics to Logo Studio", () => {
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(backend.includes("rejectionReasons: review.rejectionReasons"));
  assert.ok(backend.includes('code: concept.visualReviewIssue || "LOGO_REVIEW_REJECTED"'));
  assert.ok(ui.includes('item.code'));
  assert.ok(ui.includes("علت دقیق:"));
  assert.ok(ui.includes('["علت رد اصلاح", concept.visualReviewIssue]'));
});


test("Logo Studio re-renders structured HTML/CSS output and accepts only concepts that pass a final image-only audit", () => {
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  assert.ok(ui.includes("async function visuallyAuditFinalConcepts"));
  assert.ok(ui.includes('action: "visual-final-audit"'));
  assert.ok(ui.includes("capturePreviewDataUrl(frame, 640)"));
  assert.ok(ui.includes('concept.visualReview === "accepted"'));
  assert.ok(ui.includes("ارزیابی تصویر نهایی"));
  assert.ok(backend.includes("async function auditFinalLogoConcepts"));
  assert.ok(backend.includes("TWO STAGES IN ORDER"));
  assert.ok(backend.includes("FINAL IMAGE"));
  assert.ok(backend.includes("LOGO_FINAL_VISUAL_QUALITY_LOW"));
  assert.ok(backend.includes('input?.action === "visual-final-audit"'));
});
test("NAVI final visual audit judges the revised rendered PNG and rejects weak final designs without consuming another trial", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let sentPayload;
  try {
    globalThis.fetch = async () => makeGeminiResponse();
    const initialResponse = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const initial = await initialResponse.json();
    assert.equal(initialResponse.status, 200);
    assert.ok(initial.reviewToken);
    assert.equal(db.visitorUsed, 1);

    globalThis.fetch = async (_url, options) => {
      sentPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            concepts: [
              { index: 1, unaidedRead: "کتاب باز با دو صفحه مشخص", likelyMisread: "بال‌های باز", firstRead: "کتاب باز", semanticEvidence: ["دو صفحه متقارن با شیار مرکزی", "لبه‌های مستقل صفحات"], recognitionScore: 9, briefFidelityScore: 9, craftScore: 8 },
              { index: 2, unaidedRead: "ذوزنقه شبیه کوره", likelyMisread: "ظرف یا کوره", firstRead: "فرم هندسی مبهم", semanticEvidence: ["سطح چندضلعی", "لبه‌های مورب"], recognitionScore: 4, briefFidelityScore: 3, craftScore: 7 }
            ]
          }) }] }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const response = await handleLogoRoute({
      request: makeRequest({
        ...INPUT,
        action: "visual-final-audit",
        reviewToken: initial.reviewToken,
        concepts: [
          { previewImage: "data:image/png;base64,aGVsbG8=" },
          { previewImage: "data:image/png;base64,d29ybGQ=" }
        ]
      }),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.success, true);
    assert.equal(result.visualReview.method, "final-render-blind-read-quality-gate");
    assert.equal(result.visualReview.acceptedCount, 1);
    assert.equal(result.concepts[0].visualReview, "accepted");
    assert.equal(result.concepts[1].visualReview, "rejected");
    assert.equal(result.concepts[1].visualReviewIssue, "LOGO_FINAL_VISUAL_QUALITY_LOW");
    const parts = sentPayload.contents[0].parts;
    const imageIndexes = parts.map((part, index) => part.inlineData ? index : -1).filter(index => index >= 0);
    const briefIndex = parts.findIndex(part => part.text?.includes('"brandName":"نوا"'));
    assert.equal(imageIndexes.length, 2);
    assert.ok(imageIndexes[0] < briefIndex && imageIndexes[1] < briefIndex, "blind visual reading must be presented before the client brief");
    assert.equal(db.visitorUsed, 1, "final visual audit must not reserve or consume another guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
