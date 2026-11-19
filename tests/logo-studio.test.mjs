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
      { title: "موج پیوند", rationale: "پیوند صدا و خلاقیت", html: '<div class="mark"><span class="wave"></span><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small><script>window.pwned=true</script></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary)}.mark{text-align:center}.wave{display:block;width:150px;height:60px;border:8px solid var(--logo-primary);border-radius:50%}' },
      { title: "حرف ن", rationale: "تمرکز بر حرف آغازین برند", html: '<div class="letter"><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary)}.letter{font-size:70px;font-weight:900}' },
      { title: "طنین", rationale: "بازتاب ایده در صدا", html: '<div class="echo"><span>✦</span><strong>{{BRAND_NAME}}</strong><small>{{SLOGAN}}</small></div>', css: '.logo-art-root{display:grid;place-items:center;background:var(--logo-background);color:var(--logo-primary)}.echo{text-align:center;font-size:54px}' }
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

test("NAVI writes an English brief and three HTML/CSS logos in one Gemini call; SVG is exported without image AI", async () => {
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
    assert.equal(result.planning.method, "navi-english-brief-html-css-design");
    assert.match(result.planning.designBriefEnglish, /distinctive Persian creative-studio identity/i);
    assert.ok(result.concepts.every(item => item.html.includes("نوا")));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="brand"')));
    assert.ok(result.concepts.every(item => item.html.includes('data-logo-role="slogan"')));
    assert.ok(result.concepts.every(item => item.html.includes("صدای ایده‌های تازه")));
    assert.ok(result.concepts.every(item => !item.html.includes("{{BRAND_NAME}}")));
    assert.ok(result.concepts.every(item => !item.html.includes("<script")));
    assert.ok(result.concepts.every(item => item.css.includes("var(--logo-primary)")));
    assert.ok(result.concepts.every(item => !Object.prototype.hasOwnProperty.call(item, "svg")));
    assert.ok(result.concepts.every(item => !JSON.stringify(item).includes("foreignObject")));
    assert.ok(result.concepts.every(item => item.html.includes("<div")));
    assert.ok(result.concepts.every(item => item.css.length > 0));
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
    assert.equal(result.code, "LOGO_HTML_CSS_DESIGN_FAILED");
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
    assert.equal(result.code, "LOGO_HTML_CSS_DESIGN_FAILED");
    assert.equal(db.visitorUsed, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("native logo renderer is valid JavaScript and never constructs foreignObject", () => {
  const source = readFileSync(new URL("../logo-renderer.js", import.meta.url), "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /global\\.NavaLogoRenderer/);
  assert.doesNotMatch(source, /createElementNS\\([^,]+,\\s*["']foreignObject["']/i);
  assert.match(source, /new XMLSerializer\\(\\)\\.serializeToString/);
});
