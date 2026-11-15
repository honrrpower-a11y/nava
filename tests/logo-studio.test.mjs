import test from "node:test";
import assert from "node:assert/strict";
import { handleLogoRoute, renderElement, renderConceptSvg } from "../modules/logo.js";

const COLORS = { primary: "#C99B48", secondary: "#172238" };

test("SVG renderer accepts only the constrained geometry vocabulary", () => {
  assert.match(renderElement({ type: "circle", cx: 500, cy: 400, r: 120 }, COLORS), /^<circle/);
  assert.equal(renderElement({ type: "image", href: "https://evil.example/x" }, COLORS), "");
  assert.equal(renderElement({ type: "path", d: 'M0 0<script>alert(1)</script>' }, COLORS), "");
  assert.equal(renderElement({ type: "polygon", points: '0,0 10,10' }, COLORS), "");
});

test("SVG renderer clamps numeric geometry and never accepts arbitrary paint values", () => {
  const svg = renderElement({
    type: "circle", cx: 5000, cy: -500, r: 80,
    fill: 'url(javascript:alert(1))', stroke: "secondary", strokeWidth: 900
  }, COLORS);
  assert.match(svg, /cx="1100"/);
  assert.match(svg, /cy="-100"/);
  assert.match(svg, /fill="#C99B48"/);
  assert.match(svg, /stroke="#172238"/);
  assert.match(svg, /stroke-width="80"/);
});

test("SVG export escapes Persian brand name and slogan as XML text", () => {
  const data = {
    brandName: 'نوا <script>alert(1)</script> & Co',
    slogan: 'موسیقی "خلاق" & آزاد',
    primaryColor: "#C99B48", darkColor: "#172238",
    format: "combination", typographyValue: "persian"
  };
  const concept = { elements: [
    { type: "circle", cx: 500, cy: 300, r: 120 },
    { type: "line", x1: 300, y1: 300, x2: 700, y2: 300 },
    { type: "rect", x: 400, y: 400, width: 200, height: 80 },
    { type: "circle", cx: 500, cy: 300, r: 60 },
    { type: "line", x1: 350, y1: 350, x2: 650, y2: 350 }
  ] };
  const uri = renderConceptSvg(data, concept, 0);
  assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
  const svg = decodeURIComponent(uri.split(",")[1]);
  assert.match(svg, /نوا &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; Co/);
  assert.match(svg, /موسیقی &quot;خلاق&quot; &amp; آزاد/);
  assert.equal(svg.includes("<script>"), false);
});

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
      bind(...values) { args = values; return this; },
      async run() {
        if (sql.includes("INSERT INTO nava_guest_trial_reservations")) {
          db.reservations.set(args[0], { visitorHash: args[1], status: "reserved" });
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
    const [reserve, decrement, finish] = statements;
    const reservationId = reserve.args[1];
    const row = this.reservations.get(reservationId);
    const changed = row?.status === "reserved";
    if (changed) row.status = "refunding";
    if (row?.status === "refunding") this.visitorUsed = Math.max(0, this.visitorUsed - 1);
    if (row?.status === "refunding") row.status = "refunded";
    return [{ meta: { changes: changed ? 1 : 0 } }, { meta: { changes: changed ? 1 : 0 } }, { meta: { changes: changed ? 1 : 0 } }];
  }
}

test("failed Gemini planning refunds the guest trial but retains the IP abuse limit", async () => {
  const originalFetch = globalThis.fetch;
  const db = new FakeD1();
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: "simulated Gemini quota failure" }
  }), { status: 429, headers: { "Content-Type": "application/json" } });
  try {
    const visitorId = "2f8b7c1a-7e3d-4b9c-9a10-8f7c6d5e4a32";
    const request = new Request("https://worker.example/logo/generate", {
      method: "POST",
      headers: {
        Origin: "https://honrrpower-a11y.github.io",
        "CF-Connecting-IP": "203.0.113.10",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "brief", visitorId, brandName: "نوا",
        format: "combination", primaryColor: "#C99B48", darkColor: "#172238"
      })
    });
    const response = await handleLogoRoute({
      request,
      env: { NAVA_DB: db, NAVI_SESSION_SECRET: "test-secret-key", GEMINI_API_KEY: "test-gemini-key" },
      origin: "https://honrrpower-a11y.github.io",
      corsOrigin: "https://honrrpower-a11y.github.io"
    });
    assert.equal(response.status, 502);
    assert.equal(db.visitorUsed, 0, "the failed model attempt must not consume a guest trial");
    assert.equal(db.ipUsed, 1, "the IP rate-limit must still count failed attempts");
    assert.equal([...db.reservations.values()][0].status, "refunded");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
