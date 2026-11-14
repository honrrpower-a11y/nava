// NAVA Logo Studio: real image generation through Cloudflare Workers AI free allocation.
import { json, safeText } from "./shared.js";
import { handleGuestTrial } from "./guest-trial.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

const DIRECTIONS = [
  {
    title: "نشان مفهومی",
    guidance: "Create a memorable abstract emblem based on the brand's core idea. Use a clever visual metaphor and a distinctive silhouette. Avoid obvious clip-art symbols."
  },
  {
    title: "هندسه اختصاصی",
    guidance: "Create a refined geometric brand mark with intentional negative space, balanced proportions, and a unique construction. It must feel custom-designed, not like a generic icon."
  },
  {
    title: "نشان مینیمال لوکس",
    guidance: "Create a restrained premium identity mark with excellent optical balance, confident negative space, and a highly recognizable silhouette. Avoid decorative clutter."
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
    "You are an award-winning senior brand identity designer creating an original, production-minded logo symbol.",
    direction.guidance,
    "Brand category: " + (industry || "not specified") + ".",
    "Target audience: " + (audience || "broad professional audience") + ".",
    "Brand personality: " + (personality || "modern and confident") + ".",
    "Core concept: " + (symbol || "derive a distinctive visual metaphor from the brand category and personality") + ".",
    "Requested color direction: " + (palette || "choose a sophisticated, restrained palette") + " (main color " + primaryColor + ", dark companion " + darkColor + ").",
    "Typography direction for the later typeset wordmark: " + (typography || "clear, refined typography") + ".",
    formatGuidance,
    "OUTPUT: one single isolated logo mark, centered, front-facing, on a perfectly pure white background.",
    "Make it look like a carefully art-directed professional vector identity: precise geometry, clean contours, balanced negative space, strong silhouette, restrained details, excellent small-size legibility.",
    "Use a disciplined maximum of two or three colors. No gradients, no glow, no shadows, no 3D, no texture, no photography.",
    "ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS, NO NUMBERS, NO SLOGAN, NO WATERMARK, NO MOCKUP, NO BUSINESS CARD, NO STATIONERY, NO PRESENTATION BOARD, NO MULTIPLE LOGOS, NO GRID.",
    "The logo symbol must occupy a generous central area with clear margins. White background only."
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
