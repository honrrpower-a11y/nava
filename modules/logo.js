// NAVA Logo Studio: real image generation through a server-side fal.ai proxy.
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

async function generateOne({ prompt, apiKey }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch("https://fal.run/fal-ai/flux/dev", {
      method: "POST",
      headers: {
        "Authorization": "Key " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        image_size: "square_hd",
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: "png",
        enable_safety_checker: true
      }),
      signal: controller.signal
    });
    let result;
    try { result = await response.json(); }
    catch { throw new Error("Image provider returned an unreadable response."); }
    if (!response.ok) {
      const error = new Error("Image provider request failed.");
      error.status = response.status;
      throw error;
    }
    const image = Array.isArray(result.images) ? result.images[0] : null;
    if (!image || typeof image.url !== "string" || !image.url.startsWith("https://")) {
      throw new Error("Image provider did not return a valid image.");
    }
    return image;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleLogoRoute({ request, env, origin, corsOrigin }) {
  if (origin !== "https://honrrpower-a11y.github.io") {
    return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  }
  if (request.method !== "POST") {
    return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  }
  if (!env.FAL_KEY) {
    return fail("موتور طراحی تصویری هنوز به حساب تولید تصویر متصل نشده است. تنظیم امن کلید سرویس لازم است.", 503, corsOrigin, {
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
    palette: safeText(input?.palette, 80)
  };
  if (!data.brandName) return fail("نام برند برای طراحی لازم است.", 400, corsOrigin);

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
  if (!quotaResponse.ok) return quotaResponse;
  let quota = {};
  try { quota = await quotaResponse.json(); } catch {}

  const prompts = DIRECTIONS.map(direction => buildPrompt(data, direction));
  try {
    const images = await Promise.all(prompts.map(prompt => generateOne({ prompt, apiKey: env.FAL_KEY })));
    return json({
      success: true,
      brandName: data.brandName,
      remaining: quota.remaining ?? null,
      images: images.map((image, index) => ({
        url: image.url,
        width: image.width || 1024,
        height: image.height || 1024,
        concept: DIRECTIONS[index].title
      }))
    }, 200, corsOrigin);
  } catch (error) {
    console.error("[NAVA LOGO] Image generation failed:", String(error?.message || error).slice(0, 300));
    if (error?.name === "AbortError") {
      return fail("زمان ساخت تصویر تمام شد. دوباره تلاش کن.", 504, corsOrigin);
    }
    if (error?.status === 401 || error?.status === 403) {
      return fail("کلید سرویس تصویر معتبر نیست یا دسترسی ساخت تصویر ندارد.", 502, corsOrigin);
    }
    return fail("ساخت کانسپت‌ها انجام نشد. اعتبار سرویس تصویر و وضعیت آن را بررسی کن.", 502, corsOrigin);
  }
}
