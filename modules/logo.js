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
  const secondary = validColor(data.darkColor, "#172238");
  const colors = { primary, secondary };
  const elements = concept.elements.map(item => renderElement(item, colors)).filter(Boolean);
  if (elements.length < 3) throw new Error("NAVI vector concept has too few valid geometry elements.");
  const isWordmark = data.format === "wordmark";
  const isMonogram = data.format === "monogram";
  const brand = escapeXml(data.brandName);
  const slogan = escapeXml(data.slogan);
  const font = data.typographyValue === "elegant"
    ? "Georgia, 'Times New Roman', serif"
    : "Tahoma, Arial, sans-serif";
  const mark = elements.join("");
  const monogram = isMonogram
    ? '<text x="500" y="420" text-anchor="middle" dominant-baseline="middle" font-family="' + font + '" font-size="190" font-weight="700" fill="' + secondary + '">' + escapeXml(Array.from(data.brandName)[0] || "") + '</text>'
    : "";
  const nameY = isWordmark ? 520 : 790;
  const nameSize = data.brandName.length > 16 ? 58 : data.brandName.length > 10 ? 72 : 88;
  const word = '<text x="500" y="' + nameY + '" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="' + nameSize + '" font-weight="700" fill="' + secondary + '">' + brand + '</text>';
  const sloganText = slogan
    ? '<text x="500" y="' + (nameY + 72) + '" text-anchor="middle" direction="rtl" unicode-bidi="plaintext" font-family="' + font + '" font-size="30" fill="' + secondary + '" opacity=".78">' + slogan + '</text>'
    : "";
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1000 1000" role="img" aria-label="' + brand + '">' +
    '<rect width="1000" height="1000" fill="#FFFFFF"/>' +
    '<g>' + mark + monogram + '</g>' + word + sloganText + '</svg>';
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
    "concepts must contain exactly 3 objects. Each object: title, rationale, visualDirection, elements.",
    "elements is an array of 5 to 14 geometry objects that together draw the concept's symbol. Use only type path, circle, ellipse, rect, line, polygon, polyline.",
    "Coordinates use a 1000 by 1000 viewBox. Keep the symbol in x=120..880 and y=100..680. Make deliberate negative space, coherent proportions, a distinctive silhouette and optical balance.",
    "For path use d with only SVG path commands M L H V C S Q T A Z and numeric coordinates. No transforms, styles, scripts, text, image, filters, gradients or raw markup.",
    "For circle use cx,cy,r; ellipse cx,cy,rx,ry; rect x,y,width,height,rx; line x1,y1,x2,y2; polygon/polyline use points as numeric coordinate pairs.",
    "Every element may set fill and stroke to primary, secondary, or none; strokeWidth is numeric. The website will apply the exact HEX colors supplied by the user.",
    "Respect the selected logo structure: combination means symbol plus separately typeset brand name; wordmark means lettering is primary and geometry is restrained; monogram means the brand's real first character is typeset inside/with the symbol.",
    "Do not draw letters or words as paths. The website typesets the exact Persian brand name and slogan separately, preserving real text.",
    "All three concepts must differ in central idea and geometry, not merely frame, rotation, or ornament. Derive their meaning from name, sector, audience, personality and symbol brief. Avoid generic stock symbols and unrelated decoration.",
    "Do not invent facts. If the brief is sparse, make a conservative design interpretation.",
    "Keep each Persian explanatory field under 240 characters. Each concept must have at least 5 valid drawable elements."
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
      const elements = Array.isArray(item.elements) ? item.elements.slice(0, 14) : [];
      const valid = elements.map(element => renderElement(element, {
        primary: data.primaryColor, secondary: data.darkColor
      })).filter(Boolean);
      if (valid.length < 5) throw new Error("A NAVI vector concept did not contain enough valid geometry.");
      return {
        id: "navi-vector-" + (index + 1),
        concept: safeText(item.title, 90) || "کانسپت " + (index + 1),
        description: safeText(item.rationale, 240),
        visualDirection: safeText(item.visualDirection, 240),
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
      if (valid.length < 5) throw new Error("Invalid concept geometry.");
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
      visualDirection: concept.visualDirection, review: null, directionId: concept.id
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
