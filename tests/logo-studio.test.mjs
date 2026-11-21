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
    const elements = Array.isArray(concept.briefElements) && concept.briefElements.length >= 2
      ? concept.briefElements.slice(0, 5)
      : ["عنصر اصلی بریف", "رابطه هندسی اصلی"];
    concept.visualAnchors = elements.map((description, index) => ({
      id: "anchor-" + (index + 1),
      description,
      relationship: "این جزء در ساختار اصلی نشان با فرم مکمل پیوند دارد"
    }));
    concept.anchorMap = concept.visualAnchors.map((anchor, index) => ({
      anchorId: anchor.id,
      layerClass: styledClasses[index % Math.max(1, styledClasses.length)] || "",
      visualRole: "این لایه هندسه قابل مشاهده جزء مربوط را در نشان می‌سازد"
    })).filter(entry => entry.layerClass);
  }
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("NAVI writes an English brief and three sanitized HTML/CSS logo designs in one Gemini call", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  let geminiCalls = 0;
  let sentPrompt = "";
  globalThis.fetch = async (_url, options) => {
    geminiCalls += 1;
    sentPrompt = JSON.stringify(JSON.parse(options.body));
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
    assert.equal(geminiCalls, 1, "one Gemini call creates the English brief and all three logo designs");
    assert.match(sentPrompt, /PHASE 1 — DISCOVERY/i);
    assert.match(sentPrompt, /PHASE 2 — CATEGORY RESEARCH/i);
    assert.match(sentPrompt, /PHASE 4A — IDENTITY COHESION/i);
    assert.match(sentPrompt, /2–4 decision axes/i);
    assert.match(sentPrompt, /PHASE 4B — ANTI-DEFAULT REFLEX/i);
    assert.match(sentPrompt, /PHASE 4C — BRIEF TRACEABILITY/i);
    assert.match(sentPrompt, /PHASE 4D — CLIENT BRIEF DOMINANCE/i);
    assert.match(sentPrompt, /PHASE 4E — ANCHOR-TO-LAYER CONTRACT/i);
    assert.match(sentPrompt, /PHASE 4F — SPATIAL COMPOSITION, DEPTH AND OCCLUSION/i);
    assert.match(sentPrompt, /Distinguish true overlap\/occlusion from mere adjacency/i);
    assert.match(sentPrompt, /give each relevant layer a deliberate position, scale, transform and stacking order/i);
    assert.match(sentPrompt, /the sun is a rear layer, its lower arc is occluded by the book/i);
    assert.match(sentPrompt, /never hardcode this example as the default logo idea/i);
    assert.match(sentPrompt, /silhouette, component geometry, spatial placement, overlap\/occlusion, depth order/i);
    assert.match(sentPrompt, /anchorMap with exactly one object per visualAnchor/i);
    assert.match(sentPrompt, /real nested HTML element inside the single \.navi-symbol/i);
    assert.match(sentPrompt, /exact client idea and relationships/i);
    assert.match(sentPrompt, /brief fidelity first/i);
    assert.match(sentPrompt, /actual \.navi-symbol/i);
    assert.match(sentPrompt, /symbolConstruction/i);
    assert.match(sentPrompt, /HTML\/CSS symbol itself MUST visibly implement/i);
    assert.match(sentPrompt, /at least one concept must avoid the usual defaults/i);
    assert.match(sentPrompt, /mechanism, expressionMove, differsBy, axes/i);
    assert.match(sentPrompt, /8–12 genuinely different/i);
    assert.match(sentPrompt, /different central thesis, outer silhouette/i);
    assert.match(sentPrompt, /16 px/i);
    assert.match(sentPrompt, /HTML and CSS are the only design and rendering medium/i);
    assert.match(sentPrompt, /HTML and CSS are the only design and rendering medium/i);
    assert.match(sentPrompt, /coordinated HTML layers and CSS geometry/i);
    assert.match(sentPrompt, /For Z specifically, preserve a clear top horizontal/i);
    assert.match(sentPrompt, /artboard\/canvas background must be white or a light neutral/i);
    assert.match(sentPrompt, /Never assign the root a fixed 1000px width or height/i);
    assert.match(sentPrompt, /320×320 mobile preview/i);
    assert.match(sentPrompt, /Never submit two stray diagonal strokes/i);
    assert.match(sentPrompt, /navi-symbol__detail/i);
    assert.match(sentPrompt, /SVG and all SVG-derived tags or attributes are forbidden/i);
    assert.match(sentPrompt, /CSS clip-path polygons/i);
    assert.match(sentPrompt, /A thin border or line alone is not an acceptable symbol/i);
    assert.match(sentPrompt, /Navy or blue may still be used as an intentional brand-mark/i);
    assert.match(sentPrompt, /{{BRAND_NAME}}/i);
    assert.match(sentPrompt, /one valid JSON object/i);
    assert.equal(result.planning.method, "navi-english-brief-html-css-design");
    assert.match(result.planning.designBriefEnglish, /distinctive Persian creative-studio identity/i);
    assert.ok(result.concepts.every(item => item.html.includes("نوا")));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="brand"')));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="slogan"')));
    assert.ok(result.concepts.every(item => item.html.includes("صدای ایده‌های تازه")));
    assert.ok(result.concepts.every(item => !item.html.includes("{{BRAND_NAME}}")));
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.ok(result.concepts.every(item => item.css.includes("var(--logo-primary)")));
    assert.ok(result.concepts[0].css.includes("@keyframes breathe"), "safe CSS keyframes remain available for live previews");
    assert.ok(result.concepts.every(item => !Object.prototype.hasOwnProperty.call(item, "svg")));
    assert.ok(result.concepts.every(item => !JSON.stringify(item).includes("foreignObject")));
    assert.ok(result.concepts.every(item => item.html.includes("<div")));
    assert.ok(result.concepts.every(item => !Object.prototype.hasOwnProperty.call(item, "svg")), "SVG is never returned as a separate export field");
    assert.ok(result.concepts.every(item => item.css.length > 0));
    assert.ok(result.concepts.every(item => item.visualAnchors.length >= 2));
    assert.ok(result.concepts.every(item => item.anchorMap.length === item.visualAnchors.length));
    assert.equal(result.concepts[0].centralThesis, "پیوند دو مسیر صوتی به یک نشانه پیوسته و باز تبدیل می‌شود");
    assert.equal(result.concepts[0].symbolConstruction, "دو مسیر منحنی در مرکز به هم می‌رسند و یک شکاف پیوسته در دل فرم می‌سازند");
    assert.equal(result.concepts[0].briefAlignment, "این فرم اتصال صدا و خلاقیت را در هویت استودیوی موسیقی نشان می‌دهد");
    assert.deepEqual(result.concepts[0].briefElements, ["موج صوتی","اتصال دو مسیر"]);
    assert.equal(result.concepts[0].mechanism, "اتصال دو مسیر صوتی به یک فرم مشترک، نماد و تایپوگرافی را به هم پیوند می‌دهد.");
    assert.equal(result.concepts[0].expressionMove, "شکاف مرکزی پیوسته");
    assert.equal(result.concepts[0].differsBy, "ساختار باز و نامتقارن در برابر نشان‌های بسته رقبا");
    assert.deepEqual(result.concepts[0].axes, { "سنتی–معاصر": "معاصر", "آرام–بیانگر": "بیانگر" });
    assert.deepEqual(result.concepts[0].defaultsUsed, []);
    assert.ok(result.concepts.every(item => item.html.length >= 90 && item.css.length >= 350), "each concept must contain substantial HTML and CSS");
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.equal(db.visitorUsed, 1, "one completed logo batch consumes one guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("NAVI builds symbols with CSS-only geometry and strips SVG markup", async () => {
  const originalFetch = globalThis.fetch, db = new FakeD1(), design = makeDesign();
  design.concepts[0].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><span class="navi-symbol__detail"></span><span class="navi-symbol__part"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[0].css = '.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid;gap:20px;justify-items:center}.navi-symbol{position:relative;width:220px;height:220px;background:var(--logo-primary);clip-path:polygon(50% 0,94% 26%,82% 82%,50% 100%,18% 82%,6% 26%)}.navi-symbol__detail{position:absolute;inset:22%;border:10px solid var(--logo-background);border-radius:50%}.navi-symbol__part{position:absolute;width:32%;height:18%;right:12%;top:38%;background:var(--logo-background);transform:rotate(-28deg);border-radius:50%}.mark strong{font-size:48px;font-weight:900}';
  design.concepts[1].html = '<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><svg viewBox="0 0 200 200"><path d="M20 20 H180 V180 H20 Z"/></svg><span class="navi-symbol__detail"></span></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[1].css += ".navi-symbol__detail{display:block;width:45%;height:45%;border:8px solid var(--logo-primary);border-radius:38%}";
  globalThis.fetch = async () => makeGeminiResponse(design);
  try {
    const response = await handleLogoRoute({request:makeRequest(),env:{NAVA_DB:db,NAVI_SESSION_SECRET:"test-secret-key",GEMINI_API_KEY:"test-gemini-key"},origin:ORIGIN,corsOrigin:ORIGIN});
    const result = await response.json();
    assert.equal(response.status,200); assert.equal(result.success,true);
    assert.equal(result.concepts.length,3,JSON.stringify(result.rejectedConcepts));
    assert.doesNotMatch(result.concepts[0].html, /<(?:svg|path|circle|ellipse|rect|polygon|polyline|line)\b/i);
    assert.doesNotMatch(result.concepts[1].html, /<(?:svg|path|circle|ellipse|rect|polygon|polyline|line)\b/i);
    assert.match(result.concepts[0].html,/navi-symbol__detail/); assert.equal(db.visitorUsed,1);
  } finally {globalThis.fetch=originalFetch;}
});

test("NAVI rejects SVG-only artwork when no CSS-built symbol remains", async () => {
  const originalFetch=globalThis.fetch,db=new FakeD1(),design=makeDesign();
  design.concepts[0].html='<div class="mark"><div class="navi-symbol" data-logo-role="symbol"><svg viewBox="0 0 200 200"><path d="M20 20 H180 V180 H20 Z"/></svg></div><strong>{{BRAND_NAME}}</strong></div>';
  design.concepts[0].css='.logo-art-root{display:grid;place-items:center;width:100%;height:100%}.mark{display:grid}.navi-symbol{width:220px;height:220px}';
  globalThis.fetch=async()=>makeGeminiResponse(design);
  try {const response=await handleLogoRoute({request:makeRequest(),env:{NAVA_DB:db,NAVI_SESSION_SECRET:"test-secret-key",GEMINI_API_KEY:"test-gemini-key"},origin:ORIGIN,corsOrigin:ORIGIN});const result=await response.json();assert.equal(response.status,200);assert.equal(result.concepts.length,2);assert.equal(result.rejectedConcepts[0].code,"LOGO_SYMBOL_UNDERBUILT");}
  finally {globalThis.fetch=originalFetch;}
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
    assert.equal(result.concepts.length, 2);
    assert.equal(result.rejectedConcepts.length, 1);
    assert.equal(result.rejectedConcepts[0].code, "LOGO_SYMBOL_UNDERBUILT");
    assert.ok(result.concepts.every(item => !item.html.includes("width:220px;height:8px")));
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
    assert.equal(result.concepts.length, 2);
    assert.equal(result.rejectedConcepts.length, 1);
    assert.equal(result.rejectedConcepts[0].index, 2);
    assert.equal(result.rejectedConcepts[0].code, "LOGO_SYMBOL_UNDERBUILT");
    assert.ok(result.concepts.every(item => item.id && item.html.includes('data-logo-role="brand"')));
    assert.ok(result.concepts.every(item => !item.html.includes("{{BRAND_NAME}}")));
    assert.equal(db.visitorUsed, 1, "a usable partial batch consumes one guest trial");
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
  globalThis.fetch = async () => makeGeminiResponse(untraceable);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "LOGO_BRIEF_TRACEABILITY_MISSING");
    assert.equal(db.visitorUsed, 0);
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
    assert.equal(response.status, 502);
    assert.equal(result.code, "LOGO_CSS_UNSAFE");
    assert.equal(db.visitorUsed, 0);
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
    assert.ok(result.concepts[1].css.includes(".navi-brand-lockup"));
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
    assert.ok(result.concepts[1].css.includes(".navi-slogan-lockup"));
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
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "MEDIUM");
    assert.equal(body.generationConfig.maxOutputTokens, 32768);
    assert.equal("temperature" in body.generationConfig, false);
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
    assert.equal(calls, 1, "diagnostics must not trigger a second paid model request");
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

test("PNG export uses the browser-native HTML renderer so Persian shaping and bidi survive rasterization", () => {
  const source = readFileSync(new URL("../logo-renderer.js", import.meta.url), "utf8");
  const start = source.indexOf("async function renderFrameCanvas");
  const end = source.indexOf("global.NavaLogoRenderer=", start);
  const exporter = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(exporter.includes("const built=await buildSvg(frame"), "PNG must rasterize the browser-rendered artboard rather than re-layout each glyph through html2canvas");
  assert.ok(exporter.includes("new Blob([built.svg]"), "the browser-native HTML/SVG package is rendered before PNG encoding");
  assert.ok(exporter.includes("img.src=url"));
  assert.ok(exporter.includes("canvas.toBlob"));
  assert.ok(exporter.includes("getImageData"), "empty raster output must be rejected instead of downloaded as a blank PNG");
  assert.ok(exporter.includes("capturePreviewDataUrl"), "the same native renderer supplies screenshots for visual review");
  assert.ok(exporter.includes("Persian/Arabic contextual shaping") || source.includes("Persian/Arabic contextual shaping"));
  assert.ok(source.includes("global.NavaLogoRenderer={downloadBlob,exportPngFromFrame,capturePreviewDataUrl}"));
  assert.ok(!exporter.includes("global.html2canvas"), "html2canvas is not used for Persian text export");
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
  assert.ok(source.indexOf("results.append(card)") < source.indexOf("frame.srcdoc = frame.__navaMarkup"), "the preview iframe is initialized only after its card is mounted");
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
  assert.ok(source.includes("function showExportLink(feedback, message, link)"), "successful exports must keep the same feedback node reusable for later downloads");
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
  assert.ok(backend.includes("designIdea: safeText(plan.designIdea, 320)"));
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


test("Logo Studio performs a rendered-image review pass before presenting final concepts", () => {
  const ui = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  const backend = readFileSync(new URL("../modules/logo.js", import.meta.url), "utf8");
  assert.ok(ui.includes("capturePreviewDataUrl(frame, 640)"));
  assert.ok(ui.includes('action: "visual-refine"'));
  assert.ok(ui.includes("await Promise.all(activeFrames.map(waitForFrame))"));
  assert.ok(backend.includes("async function refineLogoConcepts"));
  assert.ok(backend.includes("inlineData: { mimeType: \"image/png\", data: image }"));
  assert.ok(backend.includes("actual browser-rendered PNG preview"));
  assert.ok(backend.includes('input?.action === "visual-refine"'));
  assert.ok(backend.includes('method: "render-review-refine"'));
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
    const css = original.css + '.mark{transform:scale(1.02)}';
    globalThis.fetch = async (_url, options) => {
      sentPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify({
            concepts: [{ index: 1, html, css, visualRevisionNotes: "تناسب نشان و جای‌گیری لایه‌ها پس از مشاهده رندر واقعی اصلاح شد." }]
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
    assert.equal(db.visitorUsed, 1, "visual review must not reserve or consume another guest trial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
