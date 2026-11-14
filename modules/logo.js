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

function getPaletteSpec(data) {
  const palette = safeText(data.palette, 80);
  const presets = {
    "طلایی و سرمه‌ای": {
      name: "gold and midnight navy",
      instruction: "Use ONLY these two brand colors as the main palette: gold #C9A24A and midnight navy #101D35. Both must be visibly present."
    },
    "آبی و نقره‌ای": {
      name: "blue and silver",
      instruction: "Use ONLY this palette as the main colors: blue #3F70A8 and silver #DCE4ED. Do not introduce gold or yellow."
    },
    "سبز و کرم": {
      name: "green and cream",
      instruction: "Use ONLY this palette as the main colors: deep green #356B55 and warm cream #E9E1CE. Do not introduce gold or blue."
    },
    "بنفش و یاسی": {
      name: "violet and lilac",
      instruction: "Use ONLY this palette as the main colors: violet #7656A6 and lilac #DCCEF0. Do not introduce gold or navy."
    },
    "تک‌رنگ": {
      name: "monochrome",
      instruction: "Use a strictly monochrome treatment: one ink color #22252B with white negative space. No secondary hue, no gold, no navy, no colored accents."
    }
  };

  if (palette === "رنگ اختصاصی") {
    const primary = /^#[0-9a-fA-F]{6}$/.test(data.primaryColor || "") ? data.primaryColor : "#C9A24A";
    const secondary = /^#[0-9a-fA-F]{6}$/.test(data.darkColor || "") ? data.darkColor : "#172238";
    return {
      name: "user-defined custom colors",
      instruction: "Use the user's exact selected colors as the only main colors: " + primary + " and " + secondary + ". Do not substitute gold, yellow, navy or any unrelated palette."
    };
  }

  return presets[palette] || presets["طلایی و سرمه‌ای"];
}

// A deterministic art-direction planner: no extra model call, API charge, or quota use.
// It turns the user's brief into three distinct, explainable visual hypotheses.
function planBrandConcepts(data) {
  const industry = safeText(data.industry, 100).toLowerCase();
  const name = safeText(data.brandName, 48);
  const explicitIdea = safeText(data.symbolIdea, 180);
  const sectors = [
    {
      test: /فناور|تکنولوژ|نرم.?افزار|داده|دیجیتال|هوش مصنوعی|\bit\b|software|technology|data|digital/i,
      core: "clarity and intelligent connection",
      concepts: [
        { title: "مسیر داده تا روشنایی", idea: "A single continuous data pathway that resolves into a precise aperture of light; use a distinctive flowing silhouette, not a circuit-board icon.", rationale: "Connects the idea of data with clarity and insight while remaining a simple ownable symbol." },
        { title: "مونوگرام ساختاریافته", idea: "An abstract custom letterform derived from the rhythm of the brand name, with one deliberate negative-space channel suggesting a data path.", rationale: "Builds recognition from the brand name rather than borrowing a generic technology symbol." },
        { title: "نشان شبکه منسجم", idea: "A compact architectural emblem made from a few interdependent modules converging around one clear center; avoid nodes-and-lines network clichés.", rationale: "Suggests a reliable technology system and organized infrastructure through a distinct outer silhouette." }
      ]
    },
    {
      test: /آموزش|مدرسه|دانشگاه|یادگیر|education|school|learning/i,
      core: "discovery and growth through knowledge",
      concepts: [
        { title: "جرقه کشف", idea: "A distinctive opening or unfolding form that suggests a moment of discovery, not a literal graduation cap or book.", rationale: "Expresses learning as insight and discovery rather than a stock education icon." },
        { title: "حروفِ در حال رشد", idea: "A custom letterform whose strokes gradually open or extend, using negative space to suggest development.", rationale: "Links the visual identity to the brand name and the idea of progress." },
        { title: "نشان مسیر یادگیری", idea: "A structured emblem with an intentional sequence of nested forms leading toward a focal point.", rationale: "Communicates a guided, dependable learning journey." }
      ]
    },
    {
      test: /سلامت|پزشک|درمان|بهداشت|health|medical|clinic/i,
      core: "care, confidence and wellbeing",
      concepts: [
        { title: "تعادل و مراقبت", idea: "A calm, balanced organic symbol formed by two protective shapes; avoid literal crosses and generic heart icons.", rationale: "Communicates care through balance and protection without relying on medical clichés." },
        { title: "مونوگرام آرام", idea: "A soft but precise custom letterform with a protective negative-space enclosure.", rationale: "Makes the brand name the source of recognition while retaining a reassuring tone." },
        { title: "نشان اعتماد", idea: "A composed emblem with a stable outer boundary and a calm central form.", rationale: "Suggests reliability and professional care." }
      ]
    },
    {
      test: /مالی|بانک|سرمایه|حسابدار|finance|bank|investment/i,
      core: "trust, stewardship and measured progress",
      concepts: [
        { title: "رشد سنجیده", idea: "A restrained ascending form built from a single continuous stroke; avoid literal coins, currency signs and arrows.", rationale: "Suggests progress and financial discipline without generic money imagery." },
        { title: "مونوگرام دقیق", idea: "A geometric custom letterform with carefully balanced proportions and a stable baseline.", rationale: "Makes the identity feel precise and dependable." },
        { title: "نشان اعتبار", idea: "A formal emblem with a strong perimeter and a minimal central structure.", rationale: "Creates a sense of stability and institutional trust." }
      ]
    },
    {
      test: /غذا|کافه|رستوران|خوراک|food|cafe|restaurant/i,
      core: "craft, warmth and sensory appeal",
      concepts: [
        { title: "امضای طعم", idea: "An expressive organic mark inspired by the craft or character of the offering, not a literal fork, spoon or chef hat.", rationale: "Creates a memorable identity around experience and craft." },
        { title: "حروف خوش‌ساخت", idea: "A custom typographic symbol with a warm rhythm and one distinctive cut or ligature.", rationale: "Makes the brand name itself recognizable." },
        { title: "نشانِ خانه‌وار", idea: "A compact framed emblem suggesting hospitality through its proportions and open center, not a stock badge.", rationale: "Communicates welcome and consistency." }
      ]
    },
    {
      test: /پوشاک|مد|زیور|جواهر|fashion|apparel|jewelry/i,
      core: "individuality and crafted expression",
      concepts: [
        { title: "امضای فرمی", idea: "A sculptural, highly reduced silhouette with a distinctive contour; avoid clothing hangers and generic fashion symbols.", rationale: "Positions the brand through a recognizable visual signature." },
        { title: "مونوگرام لوکس", idea: "An interlocking custom letterform with deliberate spacing and elegant negative space.", rationale: "Uses the brand's own letters as its signature." },
        { title: "نشان مجموعه", idea: "A carefully proportioned emblem with a unique frame and restrained central motif.", rationale: "Feels like a considered maker's mark rather than a template badge." }
      ]
    }
  ];
  const sector = sectors.find(item => item.test.test(industry)) || {
    core: "distinctiveness and clear brand recognition",
    concepts: [
      { title: "استعاره اختصاصی", idea: "Derive one simple visual metaphor from the actual brand name, stated industry and user-provided idea; do not invent unrelated objects.", rationale: "Prioritizes a meaningful connection to the actual brief." },
      { title: "امضای حروف", idea: "Construct a custom abstract letterform from the brand name's initials or letter rhythm, with intentional negative space.", rationale: "Builds recognition from the name itself." },
      { title: "نشان ساختاری", idea: "Create a distinctive emblem whose outer silhouette and internal structure express the brand's stated character.", rationale: "Provides a more formal alternative without using a stock badge." }
    ]
  };

  return DIRECTIONS.map((direction, index) => {
    const concept = sector.concepts[index];
    const idea = explicitIdea
      ? concept.idea + " Integrate the user's stated idea as a meaningful secondary cue: " + explicitIdea + ". Do not let it replace the main concept."
      : concept.idea;
    return {
      ...direction,
      conceptTitle: concept.title,
      conceptIdea: idea,
      rationale: concept.rationale,
      brandCore: sector.core,
      brandName: name
    };
  });
}

function buildPrompt(data, direction) {
  const paletteSpec = getPaletteSpec(data);
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
    "You are a senior brand identity art director. Solve the brand brief; do not make decorative AI art.",
    direction.guidance,
    "Brand: " + data.brandName + ". Industry: " + (industry || "not specified") + ". Audience: " + (audience || "broad") + ". Personality: " + (personality || "modern and confident") + ".",
    "Core idea: " + (symbol || "derive a relevant, specific visual metaphor from the actual brand name and industry; avoid generic technology clichés") + ".",
    "Brand format: " + format + ". " + formatGuidance,
    "Selected palette: " + paletteSpec.name + ". " + paletteSpec.instruction,
    "Wordmark typography reference only; do not render text: " + (typography || "refined and legible") + ".",
    "This concept must follow only its assigned art direction and its own named concept plan. Do not reuse the same visual metaphor across the three outputs. Make silhouette, construction and composition visibly different.",
    "Professional identity design: intentional proportions, optical balance, meaningful negative space, crisp edges, strong silhouette and small-size legibility. No stock icons, clip-art, generic AI motifs or random decoration.",
    "One isolated centered front-facing logo mark on pure white. Mark occupies 65–75% of canvas.",
    "COLOR COMPLIANCE IS MANDATORY: follow the selected palette instruction exactly. Do not add colors from another preset. Flat crisp fills, no gradients.",
    "NO TEXT, letters, words, numbers, slogan, watermark, mockup, stationery, presentation board, multiple logos or grid. No shadows, 3D or photorealism. White background only."
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


  const concepts = planBrandConcepts(data);
  const prompts = concepts.map(direction => buildPrompt(data, direction));
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
      planning: {
        method: "deterministic-brief-planner",
        extraModelCalls: 0,
        brandCore: concepts[0].brandCore,
        note: "These are design hypotheses derived from the submitted brief, not verified facts about the company."
      },
      images: images.map((image, index) => ({
        url: image.dataUri,
        width: image.width,
        height: image.height,
        concept: concepts[index].conceptTitle,
        description: concepts[index].rationale,
        visualDirection: concepts[index].conceptIdea,
        directionId: concepts[index].id
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
