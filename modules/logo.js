// NAVA Logo Studio: real image generation through Cloudflare Workers AI free allocation.
import { json, safeText } from "./shared.js";
import { handleGuestTrial } from "./guest-trial.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

// Three genuinely different art directions. Each direction changes the logo's visual
// grammar, silhouette, composition and design logic—not merely its surface decoration.
const DIRECTIONS = [
  {
    id: "conceptual-symbol",
    title: "نماد مفهومی",
    shortDescription: "یک نماد مستقل و استعاری با سیلوئت منحصربه‌فرد؛ مناسب شناسایی سریع برند.",
    guidance: [
      "ART DIRECTION A — CONCEPTUAL SYMBOL.",
      "Design a standalone pictorial symbol built around ONE intelligent visual metaphor derived from the brand brief.",
      "Use an organic, fluid, sculptural or symbolic silhouette where appropriate; do NOT default to a generic geometric tech icon.",
      "The mark should communicate an idea at a glance and remain recognizable as a small app icon.",
      "Composition: one dominant central symbol, generous negative space, no enclosing badge unless the metaphor genuinely requires it."
    ].join(" ")
  },
  {
    id: "custom-letterform",
    title: "فرم اختصاصی حروف",
    shortDescription: "ساختار نشانه بر پایه فرم حروف و فضای منفی؛ نه یک آیکون عمومی.",
    guidance: [
      "ART DIRECTION B — CUSTOM LETTERFORM / MONOGRAM.",
      "Create a bespoke abstract letterform mark inspired by the brand name or its initials, using interlocking strokes, cut-outs and carefully controlled negative space.",
      "The letterform must be custom constructed, not a typed font glyph and not a generic icon placed beside a letter.",
      "If the brand name is non-Latin, use its visual rhythm and calligraphic structure as inspiration without attempting to render readable text.",
      "Composition: compact, balanced, distinctive silhouette with a clear internal structure; avoid the pictorial metaphor approach of a standalone mascot."
    ].join(" ")
  },
  {
    id: "signature-emblem",
    title: "نشان امضایی",
    shortDescription: "یک نشان ساختاریافته و متمایز با قاب یا ترکیب‌بندی اختصاصی؛ مناسب هویت رسمی برند.",
    guidance: [
      "ART DIRECTION C — SIGNATURE EMBLEM.",
      "Create a structured signature emblem with a deliberate outer boundary or architectural composition, such as a custom shield, seal, framed mark or modular crest.",
      "Build the identity through the relationship between the outer container and a simple inner motif; the container itself must be custom and meaningful, never a stock badge.",
      "Use a more formal, composed and institutional visual language than the other two directions.",
      "Composition: clearly legible outer silhouette, disciplined internal hierarchy, strong balance; do not create a free-floating pictorial icon or monogram."
    ].join(" ")
  }
];

function buildPrompt(data, direction) {
  const palette = safeText(data.palette, 80);
  const primaryColor = safeText(data.primaryColor, 12);
  const darkColor = safeText(data.darkColor, 12);
  const symbol = safeText(data.symbolIdea, 180);
  const industry = safeText(data.industry, 100);
  const audience = safeText(data.audience, 120);
  const personality = safeText(data.personality, 80);
  const typography = safeText(data.typography, 80);
  const format = safeText(data.format, 40);

  const formatGuidance = format === "wordmark"
    ? "Create a distinctive abstract typographic-support symbol only; do not draw letters or words. The final wordmark typography will be typeset separately."
    : format === "monogram"
      ? "Create a compact monogram-inspired abstract symbol using the initials only as a conceptual reference. Do not draw any readable letters."
      : "Create a combination-logo emblem that can sit beside a separately typeset brand name.";

  return [
    "You are the lead brand identity art director. Treat the user brief as a design problem, not as a request for decorative image generation.",
    direction.guidance,
    "BRAND STRATEGY INPUTS:",
    "Brand name for context only (never render it as text): " + data.brandName + ".",
    "Industry: " + (industry || "not specified") + ".",
    "Target audience: " + (audience || "broad professional audience") + ".",
    "Personality: " + (personality || "modern and confident") + ".",
    "Core idea / desired symbolism: " + (symbol || "derive a relevant visual idea from the industry and brand personality") + ".",
    "Brand format preference: " + format + ". " + formatGuidance,
    "COLOR SYSTEM — mandatory for this request: requested palette " + (palette || "gold and deep navy") + ". Required colors: warm gold #C9A24A and midnight navy #101D35. User-selected main color: " + (primaryColor || "#C9A24A") + "; companion color: " + (darkColor || "#101D35") + ". Both colors must be clearly visible as substantial, distinct parts of the mark itself.",
    "Later wordmark typography direction (do not render text): " + (typography || "clear, refined typography") + ".",
    "DIFFERENTIATION RULE: this concept must follow ONLY its assigned art direction. Do not blend it with the other directions. The three concepts in this set must have visibly different outer silhouettes, construction logic and composition—not just different small details.",
    "DESIGN QUALITY: create a professional identity mark with intentional proportions, optical balance, meaningful negative space, crisp edges, strong contrast and recognizability at small sizes. Avoid stock icons, clip-art, generic AI motifs, random decoration and excessive detail.",
    "OUTPUT: one isolated logo mark, centered, front-facing, on a perfectly pure white background. The mark should occupy about 65–75 percent of the canvas, with clean margins.",
    "COLOR REQUIREMENT — STRICT: use BOTH warm gold (#C9A24A) and midnight navy (#101D35) in clearly distinguishable, substantial areas of the emblem. Gold must not be a tiny dot or hairline. No navy-only, monochrome, black/gray-only or all-gold result. Use crisp flat fills, not metallic gradients.",
    "NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS, NO SLOGAN, NO WATERMARK, NO MOCKUP, NO BUSINESS CARD, NO STATIONERY, NO PRESENTATION BOARD, NO MULTIPLE LOGOS, NO GRID.",
    "Do not add shadows, 3D rendering, photorealism or background decoration. White background only."
  ].join("\n");
}

async function generateOne({ prompt, ai }) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("Cloudflare Workers AI binding is not enabled.");
  }
  const result = await ai.run("@cf/black-forest-labs/flux-1-schnell", {
    prompt: prompt.slice(0, 2048),
    steps: 4
  });
  if (!result || typeof result.image !== "string" || !result.image.length) {
    throw new Error("Cloudflare Workers AI returned no image.");
  }
  return {
    dataUri: "data:image/jpeg;charset=utf-8;base64," + result.image,
    width: 512,
    height: 512
  };
}

const FREE_LOGO_DAILY_LIMIT = 10;

async function reserveFreeDailySlot(env) {
  if (!env.NAVA_DB) throw new Error("Logo daily limit database is unavailable.");
  const day = new Date().toISOString().slice(0, 10);
  await env.NAVA_DB.prepare(`
    CREATE TABLE IF NOT EXISTS nava_logo_ai_daily_limits (
      day TEXT PRIMARY KEY,
      used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
      updated_at INTEGER NOT NULL
    )
  `).run();
  const reserved = await env.NAVA_DB.prepare(`
    INSERT INTO nava_logo_ai_daily_limits (day, used_count, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(day) DO UPDATE SET
      used_count = nava_logo_ai_daily_limits.used_count + 1,
      updated_at = excluded.updated_at
    WHERE nava_logo_ai_daily_limits.used_count < ?
    RETURNING used_count
  `).bind(day, Math.floor(Date.now() / 1000), FREE_LOGO_DAILY_LIMIT).first();
  return reserved ? { day, used: Number(reserved.used_count) } : null;
}

async function releaseFreeDailySlot(env, day) {
  if (!day || !env.NAVA_DB) return;
  await env.NAVA_DB.prepare(`
    UPDATE nava_logo_ai_daily_limits
    SET used_count = CASE WHEN used_count > 0 THEN used_count - 1 ELSE 0 END,
        updated_at = ?
    WHERE day = ?
  `).bind(Math.floor(Date.now() / 1000), day).run();
}

export async function handleLogoRoute({ request, env, origin, corsOrigin }) {
  if (origin !== "https://honrrpower-a11y.github.io") {
    return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  }
  if (request.method !== "POST") {
    return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  }
  if (!env.AI || typeof env.AI.run !== "function") {
    return fail("سرویس رایگان تولید تصویر در Cloudflare هنوز فعال نشده است.", 503, corsOrigin, {
      code: "LOGO_IMAGE_PROVIDER_NOT_CONFIGURED"
    });
  }

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 12000) return fail("حجم بریف بیش از حد مجاز است.", 413, corsOrigin);
    input = JSON.parse(raw);
  } catch {
    return fail("اطلاعات بریف معتبر نیست.", 400, corsOrigin);
  }

  const data = {
    brandName: safeText(input?.brandName, 48),
    industry: safeText(input?.industry, 100),
    audience: safeText(input?.audience, 120),
    symbolIdea: safeText(input?.symbolIdea, 180),
    personality: safeText(input?.personality, 80),
    typography: safeText(input?.typography, 80),
    format: ["combination", "wordmark", "monogram"].includes(input?.format) ? input.format : "combination",
    palette: safeText(input?.palette, 80),
    primaryColor: safeText(input?.primaryColor, 12),
    darkColor: safeText(input?.darkColor, 12)
  };
  if (!data.brandName) return fail("نام برند برای طراحی لازم است.", 400, corsOrigin);

  // Reserve a small daily global budget so the logo studio stays comfortably
  // inside Cloudflare's free Workers AI allocation. No paid fallback is used.
  let dailySlot;
  try {
    dailySlot = await reserveFreeDailySlot(env);
  } catch (error) {
    console.error("[NAVA LOGO] Free daily limit unavailable:", String(error?.message || error));
    return fail("بررسی سهمیه رایگان امروز ممکن نشد. کمی بعد دوباره تلاش کن.", 503, corsOrigin);
  }
  if (!dailySlot) {
    return fail("سهمیه رایگان روزانه نوا برای ساخت لوگو تکمیل شده است. فردا دوباره تلاش کن؛ هیچ هزینه یا مسیر پولی فعال نمی‌شود.", 429, corsOrigin, {
      code: "FREE_IMAGE_QUOTA_EXHAUSTED",
      dailyLimit: FREE_LOGO_DAILY_LIMIT
    });
  }

  // Reuse the existing server-enforced logo trial and NAVI session validation.
  const quotaRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      studio: "logo",
      visitorId: typeof input.visitorId === "string" ? input.visitorId : ""
    })
  });
  const quotaResponse = await handleGuestTrial({ request: quotaRequest, env, origin, corsOrigin });
  if (!quotaResponse.ok) {
    await releaseFreeDailySlot(env, dailySlot.day);
    return quotaResponse;
  }
  let quota = {};
  try { quota = await quotaResponse.json(); } catch {}


  const prompts = DIRECTIONS.map(direction => buildPrompt(data, direction));
  try {
    const images = [];
    // Sequential calls reduce burst pressure on the shared free daily allocation.
    for (const prompt of prompts) {
      images.push(await generateOne({ prompt, ai: env.AI }));
    }
    return json({
      success: true,
      brandName: data.brandName,
      remaining: quota.remaining ?? null,
      freeDailyRemaining: Math.max(0, FREE_LOGO_DAILY_LIMIT - dailySlot.used),
      images: images.map((image, index) => ({
        url: image.dataUri,
        width: image.width,
        height: image.height,
        concept: DIRECTIONS[index].title
      }))
    }, 200, corsOrigin);
  } catch (error) {
    await releaseFreeDailySlot(env, dailySlot.day).catch(() => {});
    console.error("[NAVA LOGO] Image generation failed:", String(error?.message || error).slice(0, 300));
    const message = String(error?.message || "");
    if (/limit|quota|exceed|daily|neurons|capacity/i.test(message)) {
      return fail("سهمیه رایگان روزانه ساخت تصویر تمام شده است. پس از بازنشانی سهمیه دوباره تلاش کن؛ هیچ مسیر پولی جایگزین نمی‌شود.", 429, corsOrigin, { code: "FREE_IMAGE_QUOTA_EXHAUSTED" });
    }
    return fail("ساخت کانسپت‌ها انجام نشد. وضعیت سرویس رایگان Cloudflare را بررسی کن و دوباره تلاش کن.", 502, corsOrigin);
  }
}
