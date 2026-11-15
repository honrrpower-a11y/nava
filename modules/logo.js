// NAVA Logo Studio: NAVI-authored vector concepts, rendered locally as SVG.
// No image-generation provider, image quota, or raster model is used in this route.
import { json, safeText } from "./shared.js";
import { GEMINI_MODEL } from "./config.js";
import { handleGuestTrial, releaseGuestTrialReservation } from "./guest-trial.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

function extractJsonObject(raw) {
  const value = String(raw || "").trim();
  try { return JSON.parse(value); } catch (_) {}
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(value.slice(first, last + 1)); } catch (_) {}
  }
  throw new Error("NAVI returned invalid vector-plan JSON.");
}

function escapeXml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  })[char]);
}

function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function validColor(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
}

function contrastInk(background) {
  const hex = validColor(background, "#FFFFFF").slice(1);
  const channels = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.42 ? "#172238" : "#FFFFFF";
}

// Only a small SVG geometry vocabulary is accepted. NAVI chooses the geometry;
// this renderer only validates and serializes it. Raw SVG/HTML is never accepted.
export function renderElement(element, colors) {
  if (!element || typeof element !== "object") return "";
  const type = String(element.type || "");
  const fill = element.fill === "none" ? "none" : (element.fill === "secondary" ? colors.secondary : colors.primary);
  const stroke = element.stroke === "none" ? "none" : (element.stroke === "secondary" ? colors.secondary : colors.primary);
  const strokeWidth = clampNumber(element.strokeWidth, 1, 80, 8);
  const common = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round"';
  const n = key => clampNumber(element[key], -100, 1100, 0);
  if (type === "path") {
    const d = String(element.d || "");
    if (!d || d.length > 1600 || !/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(d)) return "";
    return '<path d="' + d + '"' + common + '/>';
  }
  if (type === "circle") return '<circle cx="' + n("cx") + '" cy="' + n("cy") + '" r="' + clampNumber(element.r, 1, 500, 10) + '"' + common + '/>';
  if (type === "ellipse") return '<ellipse cx="' + n("cx") + '" cy="' + n("cy") + '" rx="' + clampNumber(element.rx, 1, 500, 20) + '" ry="' + clampNumber(element.ry, 1, 500, 20) + '"' + common + '/>';
  if (type === "rect") return '<rect x="' + n("x") + '" y="' + n("y") + '" width="' + clampNumber(element.width, 1, 1000, 20) + '" height="' + clampNumber(element.height, 1, 1000, 20) + '" rx="' + clampNumber(element.rx, 0, 200, 0) + '"' + common + '/>';
  if (type === "line") return '<line x1="' + n("x1") + '" y1="' + n("y1") + '" x2="' + n("x2") + '" y2="' + n("y2") + '"' + common + '/>';
  if (type === "polygon" || type === "polyline") {
    const points = String(element.points || "");
    if (!/^-?[0-9.,\s]+$/.test(points) || points.length > 900 || points.split(/[\s,]+/).filter(Boolean).length < 6) return "";
    return '<' + type + ' points="' + points + '"' + common + '/>';
  }
  return "";
}

export function renderConceptSvg(data, concept, index) {
  const primary = validColor(data.primaryColor, "#C99B48");
  const backgroundColor = validColor(data.darkColor, "#172238");
  const secondary = contrastInk(backgroundColor);
  const colors = { primary, secondary };
  const elements = concept.elements.map(item => renderElement(item, colors)).filter(Boolean);
  if (elements.length < 8) throw new Error("NAVI vector concept has too few valid geometry elements.");
  const brand = escapeXml(data.brandName);
  const slogan = escapeXml(data.slogan);
  const font = data.typographyValue === "elegant"
    ? "'Vazirmatn', 'Noto Naskh Arabic', Tahoma, sans-serif"
    : "'Vazirmatn', 'Noto Sans Arabic', Tahoma, sans-serif";
  const layouts = ["stacked", "horizontal", "emblem"];
  const composition = layouts.includes(concept.composition) ? concept.composition : layouts[index % 3];
  const mark = elements.join("");
  const isWordmark = data.format === "wordmark";
  const isMonogram = data.format === "monogram";
  const firstCharacter = escapeXml(Array.from(data.brandName)[0] || "");
  const nameSize = data.brandName.length > 16 ? 54 : data.brandName.length > 10 ? 66 : 78;
  const symbolTransform = composition === "horizontal"
    ? "translate(45 205) scale(.56)"
    : composition === "emblem" ? "translate(155 40) scale(.69)" : "translate(110 25) scale(.78)";
  const symbol = '<g transform="' + symbolTransform + '">' + mark + '</g>';
  const monogram = isMonogram
    ? '<text x="500" y="420" text-anchor="middle" dominant-baseline="central" font-family="' + font + '" font-size="190" font-weight="700" fill="' + secondary + '">' + firstCharacter + '</text>'
    : "";
  let word = "";
  let sloganText = "";
  let background = '<rect width="1000" height="1000" fill="' + backgroundColor + '"/>';
  if (composition === "horizontal") {
    word = '<text x="900" y="465" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="' + nameSize + '" font-weight="700" fill="' + secondary + '">' + brand + '</text>';
    if (slogan) sloganText = '<text x="900" y="525" text-anchor="end" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="27" fill="' + secondary + '" opacity=".76">' + slogan + '</text>';
  } else if (composition === "emblem") {
    word = '<text x="500" y="800" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="' + nameSize + '" font-weight="700" fill="' + secondary + '">' + brand + '</text>';
    if (slogan) sloganText = '<text x="500" y="855" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="26" fill="' + secondary + '" opacity=".76">' + slogan + '</text>';
    background = '<rect x="24" y="24" width="952" height="952" rx="52" fill="' + backgroundColor + '"/>';
  } else {
    word = '<text x="500" y="' + (isWordmark ? 690 : 805) + '" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="' + (isWordmark ? Math.min(96, nameSize + 12) : nameSize) + '" font-weight="700" fill="' + secondary + '">' + brand + '</text>';
    if (slogan) sloganText = '<text x="500" y="' + (isWordmark ? 750 : 865) + '" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="26" fill="' + secondary + '" opacity=".76">' + slogan + '</text>';
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1000 1000" role="img" aria-label="' + brand + '">' +
    '<title>' + brand + ' — ' + escapeXml(concept.concept || "کانسپت لوگو") + '</title>' +
    background + '<g>' + symbol + monogram + '</g>' + word + sloganText + '</svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

async function planVectorConcepts(data, apiKey) {
  if (!apiKey) throw new Error("NAVI vector design service is not configured.");
  const brief = {
    brandName: data.brandName, slogan: data.slogan, industry: data.industry,
    audience: data.audience, symbolIdea: data.symbolIdea,
    personality: data.personality, personalityValue: data.personalityValue,
    typography: data.typography, typographyValue: data.typographyValue,
    format: data.format, formatLabel: data.formatLabel,
    palette: { name: data.palette, primary: data.primaryColor, secondary: data.darkColor }
  };
  const system = [
    "You are NAVI, a senior Persian brand identity art director and vector logo designer.",
    "You are the sole creative decision-maker. Read every field of the website brief and create three genuinely different professional logo concepts for this exact brand.",
    "Return exactly one JSON object with Persian strings and keys brandCore, strategy, concepts.",
    "concepts must contain exactly 3 objects. Each object: title, rationale, visualDirection, composition, elements.",
    "The three concepts MUST use three different compositions, exactly one each: stacked, horizontal, emblem. composition is a structural layout choice, not a decorative label.",
    "elements is an array of 8 to 22 geometry objects that together draw a distinctive, production-ready symbol. Use only type path, circle, ellipse, rect, line, polygon, polyline. Prefer custom Bézier paths over piles of primitive circles and rectangles.",
    "Coordinates use a 1000 by 1000 viewBox. Keep the main symbol within x=120..880 and y=100..680. Use intentional negative space, consistent stroke logic, strong silhouette, optical balance, restrained detail and clear hierarchy. The mark must remain recognizable when reduced to 24 pixels.",
    "For path use d with only SVG path commands M L H V C S Q T A Z and numeric coordinates. No transforms, styles, scripts, text, image, filters or raw markup.",
    "For circle use cx,cy,r; ellipse cx,cy,rx,ry; rect x,y,width,height,rx; line x1,y1,x2,y2; polygon/polyline use points as numeric coordinate pairs.",
    "Every element may set fill and stroke to primary, secondary, or none; strokeWidth is numeric. The website will apply the exact HEX colors supplied by the user.",
    "Respect the selected logo structure. Combination means symbol plus brand name. Wordmark means lettering is primary and the symbol is restrained. Monogram means the mark meaningfully integrates the brand initial.",
    "Do not draw letters or words as paths. The website typesets the exact brand name and slogan separately.",
    "Every concept must have a different core metaphor and silhouette. Do not reuse the same base shape, rotate a symbol, add a frame, or change only ornament. Build the symbol from the exact brand name, sector, audience and personality; explain the connection in rationale.",
    "Avoid clichés such as generic lightbulbs, rockets, swooshes, crowns, leaves, globes, random loops and stock-looking initials unless the brief specifically justifies them.",
    "A professional mark should be simple but not primitive: use a memorable silhouette, intentional geometry, balanced filled and open areas, and no unnecessary micro-details. Do not add decorative shapes just to reach the element count.",
    "Do not invent facts. If the brief is sparse, make a conservative design interpretation.",
    "Keep each Persian explanatory field under 240 characters. Each concept must have at least 8 valid drawable elements."
  ].join(" ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: "برای این بریف، سه کانسپت لوگوی برداری اختصاصی طراحی کن. تمام فیلدها را لحاظ کن:\n" + JSON.stringify(brief) }] }],
          generationConfig: { temperature: 0.65, maxOutputTokens: 6500, responseMimeType: "application/json" }
        }),
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error?.message || "NAVI vector planning failed.");
    const raw = (payload.candidates?.[0]?.content?.parts || []).map(part => part.text || "").join("");
    const plan = extractJsonObject(raw);
    if (!Array.isArray(plan.concepts) || plan.concepts.length !== 3) throw new Error("NAVI did not return three vector concepts.");
    const concepts = plan.concepts.map((item, index) => {
      const elements = Array.isArray(item.elements) ? item.elements.slice(0, 22) : [];
      const valid = elements.map(element => renderElement(element, {
        primary: data.primaryColor, secondary: data.darkColor
      })).filter(Boolean);
      if (valid.length < 8) throw new Error("A NAVI vector concept did not contain enough valid geometry.");
      return {
        id: "navi-vector-" + (index + 1),
        concept: safeText(item.title, 90) || "کانسپت " + (index + 1),
        composition: ["stacked", "horizontal", "emblem"].includes(item.composition) ? item.composition : ["stacked", "horizontal", "emblem"][index],
        description: safeText(item.rationale, 240),
        visualDirection: safeText(item.visualDirection, 240),
        composition: ["stacked", "horizontal", "emblem"].includes(item.composition) ? item.composition : ["stacked", "horizontal", "emblem"][index],
        elements
      };
    });
    if (new Set(concepts.map(item => item.concept.toLowerCase())).size !== 3) {
      throw new Error("NAVI returned duplicate concept titles.");
    }
    return {
      brandCore: safeText(plan.brandCore, 300),
      strategy: safeText(plan.strategy, 600),
      concepts
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleLogoRoute({ request, env, origin, corsOrigin }) {
  if (origin !== "https://honrrpower-a11y.github.io") return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 24000) return fail("حجم درخواست بیش از حد مجاز است.", 413, corsOrigin);
    input = JSON.parse(raw);
  } catch { return fail("اطلاعات درخواست معتبر نیست.", 400, corsOrigin); }

  const action = input?.action === "render" ? "render" : "brief";
  const data = {
    brandName: safeText(input?.data?.brandName ?? input?.brandName, 48),
    slogan: safeText(input?.data?.slogan ?? input?.slogan, 100),
    industry: safeText(input?.data?.industry ?? input?.industry, 100),
    audience: safeText(input?.data?.audience ?? input?.audience, 120),
    symbolIdea: safeText(input?.data?.symbolIdea ?? input?.symbolIdea, 180),
    personality: safeText(input?.data?.personality ?? input?.personality, 80),
    personalityValue: safeText(input?.data?.personalityValue ?? input?.personalityValue, 30),
    typography: safeText(input?.data?.typography ?? input?.typography, 80),
    typographyValue: safeText(input?.data?.typographyValue ?? input?.typographyValue, 30),
    format: ["combination", "wordmark", "monogram"].includes(input?.data?.format ?? input?.format) ? (input?.data?.format ?? input?.format) : "",
    formatLabel: safeText(input?.data?.formatLabel ?? input?.formatLabel, 60),
    palette: safeText(input?.data?.palette ?? input?.palette, 80),
    primaryColor: safeText(input?.data?.primaryColor ?? input?.primaryColor, 12),
    darkColor: safeText(input?.data?.darkColor ?? input?.darkColor, 12)
  };
  if (!data.format || !data.brandName) return fail("نام برند و ساختار لوگو را بررسی کن.", 400, corsOrigin);
  if (!/^#[0-9a-fA-F]{6}$/.test(data.primaryColor) || !/^#[0-9a-fA-F]{6}$/.test(data.darkColor)) {
    return fail("رنگ‌های انتخاب‌شده از سایت معتبر نیستند.", 400, corsOrigin);
  }

  if (action === "brief") {
    const quotaRequest = new Request(request.url, {
      method: "POST", headers: request.headers,
      body: JSON.stringify({ studio: "logo", visitorId: typeof input.visitorId === "string" ? input.visitorId : "" })
    });
    const quotaResponse = await handleGuestTrial({ request: quotaRequest, env, origin, corsOrigin });
    if (!quotaResponse.ok) return quotaResponse;
    let quota = {};
    try { quota = await quotaResponse.json(); } catch {}
    if (!quota.authenticated && !quota.reservationId) {
      return fail("رزرو سهمیه مهمان کامل نشد. کمی بعد دوباره تلاش کن.", 503, corsOrigin);
    }
    try {
      const plan = await planVectorConcepts(data, env.GEMINI_API_KEY);
      return json({
        success: true, stage: "brief", data, plan,
        remaining: quota.remaining ?? null,
        planning: { method: "navi-authored-design-brief", brandCore: plan.brandCore, strategy: plan.strategy }
      }, 200, corsOrigin);
    } catch (error) {
      if (quota.reservationId) {
        await releaseGuestTrialReservation({ env, reservationId: quota.reservationId });
      }
      console.error("[NAVA LOGO] NAVI brief failed:", String(error?.message || error).slice(0, 400));
      return fail("ناوی نتوانست بریف طراحی معتبری آماده کند. فرصت آزمایشی مهمان آزاد شد؛ می‌توانی دوباره تلاش کنی.", 502, corsOrigin, { code: "NAVI_BRIEF_FAILED" });
    }
  }

  // Rendering is deliberately a separate, quota-free execution step. The renderer
  // accepts only the constrained geometry vocabulary and never invents design choices.
  const plan = input?.plan;
  if (!plan || !Array.isArray(plan.concepts) || plan.concepts.length !== 3) {
    return fail("بریف تأییدشده معتبر نیست؛ ابتدا بریف را دوباره بررسی کن.", 400, corsOrigin);
  }
  try {
    const concepts = plan.concepts.map((item, index) => {
      const elements = Array.isArray(item.elements) ? item.elements.slice(0, 14) : [];
      const valid = elements.map(element => renderElement(element, {
        primary: data.primaryColor, secondary: data.darkColor
      })).filter(Boolean);
      if (valid.length < 8) throw new Error("Invalid concept geometry.");
      return {
        id: "navi-vector-" + (index + 1),
        concept: safeText(item.concept ?? item.title, 90) || "کانسپت " + (index + 1),
        description: safeText(item.description ?? item.rationale, 240),
        visualDirection: safeText(item.visualDirection, 240),
        elements
      };
    });
    const images = concepts.map((concept, index) => ({
      url: renderConceptSvg(data, concept, index), width: 1200, height: 1200,
      concept: concept.concept, description: concept.description,
      visualDirection: concept.visualDirection, composition: concept.composition, review: null, directionId: concept.id
    }));
    return json({
      success: true, stage: "rendered", brandName: data.brandName,
      planning: { method: "navi-approved-vector-plan", strategy: safeText(plan.strategy, 600), brandCore: safeText(plan.brandCore, 300), extraModelCalls: 0 },
      images
    }, 200, corsOrigin);
  } catch (error) {
    console.error("[NAVA LOGO] SVG rendering failed:", String(error?.message || error).slice(0, 300));
    return fail("اجرای بریف تأییدشده ممکن نشد. بریف را دوباره بررسی کن.", 422, corsOrigin, { code: "LOGO_RENDER_FAILED" });
  }
}
