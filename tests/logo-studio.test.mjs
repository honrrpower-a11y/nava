import test from "node:test";
import assert from "node:assert/strict";
import { handleLogoRoute } from "../modules/logo.js";
import { releaseGuestTrialReservation } from "../modules/guest-trial.js";

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

function makePlan() {
  return {
    brandCore: "هویتی شنیداری و خلاق",
    strategy: "سه مسیر مستقل با تکیه بر هویت برند و موج صوتی.",
    concepts: [
      { logoType: "نشان تصویری", title: "موج پیوند", rationale: "پیوند صدا و خلاقیت", visualGrammar: "خطوط موجی یکپارچه", symbolDescription: "نشان انتزاعی موج و پیوند", silhouette: "فرم متقارن و فشرده", composition: "مرکزی", avoid: "آیکون آماده" },
      { logoType: "مونوگرام", title: "حرف ن", rationale: "تمرکز بر حرف آغازین برند", visualGrammar: "حرف‌نگاری سفارشی", symbolDescription: "حرف ن با فضای منفی صوتی", silhouette: "فرم باز و زاویه‌دار", composition: "فشرده", avoid: "فونت پیش‌فرض" },
      { logoType: "نشان انتزاعی", title: "طنین", rationale: "بازتاب ایده در صدا", visualGrammar: "هندسه نرم و لایه‌ای", symbolDescription: "بازتاب صوت به شکل هندسه اختصاصی", silhouette: "فرم دایره‌ای باز", composition: "متعادل", avoid: "دایره‌های تزئینی" }
    ]
  };
}

class FakeD1 {
  constructor() {
    this.visitorUsed = 0;
    this.ipUsed = 0;
    this.logoDailyUsed = 0;
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
          db.reservations.set(args[0], { visitorHash: args[1], status: "reserved" });
        }
        if (sql.includes("UPDATE nava_logo_ai_daily_limits")) {
          db.logoDailyUsed = Math.max(0, db.logoDailyUsed - 1);
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
        if (sql.includes("INSERT INTO nava_logo_ai_daily_limits")) {
          if (db.logoDailyUsed >= 10) return null;
          db.logoDailyUsed += 1;
          return { used_count: db.logoDailyUsed };
        }
        return null;
      }
    };
  }
  async batch(statements) {
    const [reserve] = statements;
    const reservationId = reserve.args[1];
    const row = this.reservations.get(reservationId);
    const changed = row?.status === "reserved";
    if (changed) {
      row.status = "refunded";
      this.visitorUsed = Math.max(0, this.visitorUsed - 1);
    }
    return [{ meta: { changes: changed ? 1 : 0 } }, { meta: { changes: changed ? 1 : 0 } }, { meta: { changes: changed ? 1 : 0 } }];
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

function makeGeminiResponse(plan = makePlan()) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("NAVI strategy plus Cloudflare image model returns three actual image outputs", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  const prompts = [];
  let geminiCalls = 0;
  globalThis.fetch = async () => { geminiCalls += 1; return makeGeminiResponse(); };
  const env = {
    NAVA_DB: db,
    NAVI_SESSION_SECRET: "test-secret-key",
    GEMINI_API_KEY: "test-gemini-key",
    AI: { async run(model, args) { prompts.push({ model, prompt: args.prompt, steps: args.steps }); return { image: "aGVsbG8=" }; } }
  };
  try {
    const response = await handleLogoRoute({ request: makeRequest(), env, origin: ORIGIN, corsOrigin: ORIGIN });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(result.images.length, 3);
    assert.ok(result.images.every(item => item.url.startsWith("data:image/jpeg;charset=utf-8;base64,")));
    assert.equal(geminiCalls, 1, "NAVI should plan once for the full batch");
    assert.equal(prompts.length, 3, "the image model should render each art direction separately");
    assert.ok(prompts.every(item => item.model === "@cf/black-forest-labs/flux-1-schnell"));
    assert.ok(prompts.every(item => item.prompt.includes("#D6A84F") && item.prompt.includes("#101B30")));
    assert.equal(result.planning.method, "navi-gemini-strategy-plus-cloudflare-image-model");
    assert.equal(db.visitorUsed, 1, "a successful guest batch consumes one trial");
    assert.equal(result.remaining, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed NAVI planning refunds the guest trial and the reserved image batch", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "simulated Gemini quota failure" }
  }), { status: 429, headers: { "Content-Type": "application/json" } });
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key", AI: { run: async () => ({ image: "aGVsbG8=" }) } },
      origin: ORIGIN, corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "LOGO_STRATEGY_PLANNING_FAILED");
    assert.equal(db.visitorUsed, 0);
    assert.equal(db.logoDailyUsed, 0);
    assert.equal(db.ipUsed, 1, "the IP abuse limit remains active after a failed attempt");
    const reservationId = [...db.reservations.keys()][0];
    assert.equal(await releaseGuestTrialReservation({ env: { NAVA_DB: db }, reservationId }), false,
      "a repeated refund must be a no-op");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed image rendering refunds guest trial but keeps the consumed inference batch", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => makeGeminiResponse();
  try {
    const response = await handleLogoRoute({
      request: makeRequest(),
      env: {
        NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key",
        AI: { run: async () => { throw new Error("simulated image inference failure"); } }
      },
      origin: ORIGIN, corsOrigin: ORIGIN
    });
    const result = await response.json();
    assert.equal(response.status, 502);
    assert.equal(result.code, "LOGO_IMAGE_GENERATION_FAILED");
    assert.equal(db.visitorUsed, 0, "an incomplete three-image batch does not consume the guest trial");
    assert.equal(db.logoDailyUsed, 1, "an attempted image inference still counts against the daily safety cap");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
