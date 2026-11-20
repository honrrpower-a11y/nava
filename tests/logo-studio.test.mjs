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
  palette: "طلایی و سرمه‌ای",
  primaryColor: "#D6A84F",
  darkColor: "#101B30"
};

function makeDesign() {
  return {
    brandCore: "هویتی شنیداری و خلاق",
    strategy: "سه مسیر مستقل با تکیه بر هویت برند و موج صوتی.",
    designBriefEnglish: "Create a distinctive Persian creative-studio identity. Build a compact sound-inspired symbol with custom geometry, confident Persian typography, balanced negative space, and the exact gold and navy palette.",
    concepts: [
      { title: "موج پیوند", rationale: "پیوند صدا و خلاقیت", html: '<div class="mark"><div class="seal"><span class="wave"></span><span class="orbit"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small><script>window.pwned=true</script></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:48px}.mark{text-align:center;display:grid;gap:24px;justify-items:center}.seal{display:grid;place-items:center;width:260px;height:260px;border:2px solid var(--logo-primary);border-radius:50%;background:radial-gradient(circle at center,#263b59,var(--logo-background));box-shadow:0 12px 28px rgba(0,0,0,.2)}.wave{display:block;width:150px;height:60px;border:8px solid var(--logo-primary);border-radius:50%}.orbit{display:block;width:190px;height:190px;border:1px solid #5ac9bd;border-radius:50%}@keyframes breathe{0%{opacity:.75}100%{opacity:1}}.wave{animation:breathe 3s ease-in-out infinite}' },
      { title: "حرف ن", rationale: "تمرکز بر حرف آغازین برند", html: '<div class="letter"><div class="monogram"><span class="cut"></span><span class="accent"></span></div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:40px}.letter{font-size:70px;font-weight:900;display:grid;gap:22px;justify-items:center;text-align:center}.monogram{width:240px;height:240px;border:3px solid var(--logo-primary);display:grid;place-items:center;border-radius:28px;background:linear-gradient(135deg,#253b59,var(--logo-background));box-shadow:0 10px 24px rgba(0,0,0,.25)}.cut{display:block;width:110px;height:110px;border:12px solid var(--logo-primary);border-left-color:#59c9bc;border-radius:32px}.accent{display:block;width:70px;height:5px;background:#59c9bc;border-radius:5px}' },
      { title: "طنین", rationale: "بازتاب ایده در صدا", html: '<div class="echo"><span class="symbol" aria-hidden="true"></span><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary);width:100%;height:100%;padding:36px}.echo{text-align:center;font-size:54px;display:grid;justify-items:center;gap:20px}.echo .symbol{position:relative;width:220px;height:220px;padding:24px;border:2px solid var(--logo-primary);border-radius:50%;background:radial-gradient(circle at center,#344968,var(--logo-background));box-shadow:0 12px 26px rgba(0,0,0,.2)}.echo span{color:#59c9bc;letter-spacing:8px}.echo strong{font-weight:900;letter-spacing:2px}' }
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
    assert.match(sentPrompt, /English/i);
    assert.match(sentPrompt, /HTML and CSS are the entire design engine/i);
    assert.match(sentPrompt, /three concepts must differ in their central idea/i);
    assert.match(sentPrompt, /CSS @keyframes/i);
    assert.match(sentPrompt, /pseudo-elements ::before\/::after/i);
    assert.match(sentPrompt, /NO SVG markup/i);
    assert.match(sentPrompt, /crooked lines/i);
    assert.match(sentPrompt, /REFERENCE QUALITY BENCHMARK/i);
    assert.match(sentPrompt, /WORDMARK AND LANGUAGE/i);
    assert.match(sentPrompt, /INTERNAL ART-DIRECTION REVIEW/i);
    assert.match(sentPrompt, /near-black text on a dark background/i);
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
    assert.ok(result.concepts.every(item => !item.html.toLowerCase().includes("<svg")), "generated concept markup is HTML-only");
    assert.ok(result.concepts.every(item => item.css.length > 0));
    assert.ok(result.concepts.every(item => item.html.length >= 90 && item.css.length >= 350), "each concept must contain substantial HTML and CSS");
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.equal(db.visitorUsed, 1, "one completed logo batch consumes one guest trial");
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
    ".echo .symbol{position:relative;width:220px;height:220px;border:8px solid var(--logo-primary);border-radius:42% 58% 52% 48%;transform:rotate(-12deg)}",
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

test("NAVI identifies structurally incomplete logo concepts and refunds the trial", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const invalid = makeDesign();
  invalid.concepts[2].html = '<div><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>';
  invalid.concepts[2].css = '.logo-art-root{color:var(--logo-primary)}';
  globalThis.fetch = async () => makeGeminiResponse(invalid);
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: ORIGIN,
      corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "LOGO_CONCEPT_TOO_SIMPLE");
    assert.match(result.error, /جزئیات و ساختار بصری/);
    assert.equal(db.visitorUsed, 0);
    assert.equal([...db.reservations.values()][0].status, "refunded");
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

test("PNG export rasterizes the rendered HTML/CSS DOM without SVG foreignObject or tainted image input", () => {
  const source = readFileSync(new URL("../logo-renderer.js", import.meta.url), "utf8");
  const start = source.indexOf("async function exportPngFromFrame");
  const end = source.indexOf("global.NavaLogoRenderer=", start);
  const exporter = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(exporter.includes("global.html2canvas(root"));
  assert.match(exporter, /allowTaint:false/);
  assert.match(exporter, /useCORS:false/);
  assert.match(exporter, /foreignObjectRendering:false/);
  assert.ok(exporter.includes("canvas.toBlob"));
  assert.ok(!exporter.includes("<foreignObject") && !exporter.includes("image.src"));
  assert.ok(source.includes("global.NavaLogoRenderer={buildSvg,downloadBlob,exportPng,exportPngFromFrame}"));
});
test("Logo Studio waits for iframe preview readiness before allowing exports", () => {
  const source = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(source.includes("frame.__navaPreviewReady"));
  assert.ok(source.includes("visibleContent"), "blank artboards are diagnosed instead of treated as completed previews");
  assert.ok(source.includes("await frame.__navaPreviewReady"));
  assert.ok(source.includes("exportPngFromFrame(frame"));
  assert.ok(!source.includes("دریافت SVG برداری"));
  assert.ok(!source.includes("downloadSvg("));
});

test("Logo Studio mounts each card before assigning iframe srcdoc", () => {
  const source = readFileSync(new URL("../logo-studio.js", import.meta.url), "utf8");
  assert.ok(source.includes("preview.appendChild(frame);"));
  assert.ok(source.includes("results.appendChild(card);"));
  assert.ok(source.includes('card.querySelector("iframe.logo-html-css-preview")'));
  assert.ok(source.includes("frame.srcdoc = frame.__navaDocumentHtml;"));
  assert.ok(source.indexOf("results.appendChild(card);") < source.indexOf("frame.srcdoc = frame.__navaDocumentHtml;"), "the card must be in the live document before iframe layout starts");
  assert.ok(source.includes('frame.style.minHeight = "0";'), "the iframe must use the square aspect-ratio parent without a conflicting minimum height");
});
