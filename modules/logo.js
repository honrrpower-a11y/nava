// NAVI HTML/CSS Logo Studio.
// NAVI writes an English art-direction brief and the actual HTML/CSS logo.
// The browser only renders inert markup in a sandboxed iframe; no image model is used.
import { json, safeText } from "./shared.js";
import { GEMINI_MODEL, ALLOWED_ORIGIN } from "./config.js";
import { handleGuestTrial, releaseGuestTrialReservation } from "./guest-trial.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

function extractJsonObject(raw) {
  const text = String(raw || "").trim();
  try { return JSON.parse(text); } catch (_) {}
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch (_) {}
  }
  throw new Error("NAVI returned invalid logo design data.");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

const ALLOWED_TAGS = new Set([
  "div", "span", "p", "strong", "em", "b", "i", "small", "br",
  "svg", "g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line",
  "defs", "lineargradient", "radialgradient", "stop", "clippath"
]);
const ALLOWED_ATTRIBUTES = new Set([
  "class", "id", "role", "aria-hidden", "aria-label", "focusable", "data-logo-role", "viewbox", "xmlns", "width", "height",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d",
  "fill", "fill-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
  "opacity", "transform", "points", "offset", "stop-color", "stop-opacity",
  "text-anchor", "dominant-baseline", "font-size", "font-weight", "font-family",
  "font-style", "font-stretch", "letter-spacing", "word-spacing", "direction",
  "unicode-bidi", "textlength", "lengthadjust", "dx", "dy", "rotate",
  "clip-path", "clip-rule", "clippathunits", "gradientunits", "gradienttransform", "vector-effect", "paint-order", "shape-rendering", "strokemiterlimit",
  "preserveaspectratio", "spreadmethod"
]);
const CANONICAL_TAGS = {
  lineargradient: "linearGradient",
  radialgradient: "radialGradient",
  clippath: "clipPath"
};
const CANONICAL_ATTRIBUTES = {
  viewbox: "viewBox",
  gradientunits: "gradientUnits",
  gradienttransform: "gradientTransform",
  preserveaspectratio: "preserveAspectRatio",
  spreadmethod: "spreadMethod",
  clippathunits: "clipPathUnits",
  textlength: "textLength",
  lengthadjust: "lengthAdjust"
};

function validationError(code, message, stage, conceptIndex = null) {
  const error = new Error(message);
  error.diagnosticCode = code;
  error.validationStage = stage;
  error.conceptIndex = conceptIndex;
  return error;
}

function sanitizeHtmlFragment(value) {
  let html = String(value || "").slice(0, 10000);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta|base|video|audio|img|foreignObject)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/gi, (whole, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const outputTag = CANONICAL_TAGS[tag] || tag;
    const closing = /^<\//.test(whole);
    if (closing) return "</" + outputTag + ">";
    const selfClosing = /\/\s*>$/.test(whole);
    const attrs = [];
    String(rawAttrs || "").replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g,
      (_match, rawName, _value, doubleValue, singleValue, bareValue) => {
        const name = rawName.toLowerCase();
        const value = doubleValue ?? singleValue ?? bareValue ?? "";
        if (!ALLOWED_ATTRIBUTES.has(name)) return "";
        if (/javascript:|data:/i.test(value) || (/https?:/i.test(value) && !(name === "xmlns" && value === "http://www.w3.org/2000/svg"))) return "";
        if (/url\s*\(/i.test(value) && !/^url\(#[a-zA-Z_][\w:.-]*\)$/i.test(value.trim())) return "";
        if (/[<>]/.test(value)) return "";
        attrs.push((CANONICAL_ATTRIBUTES[name] || name) + '="' + escapeHtml(value) + '"');
        return "";
      });
    return "<" + outputTag + (attrs.length ? " " + attrs.join(" ") : "") + (selfClosing ? " />" : ">");
  });
  return html;
}

function validateSymbolStructure(html, css, conceptIndex) {
  const symbol = html.match(/<div\b(?=[^>]*class="[^"]*\bnavi-symbol\b[^"]*")(?=[^>]*data-logo-role="symbol")[^>]*>([\s\S]*?)<\/div>/i);
  if (!symbol) {
    throw validationError("LOGO_SYMBOL_MISSING", "نشان اصلی لوگو به‌صورت یک ساختار مشخص و مستقل ساخته نشده است.", "symbol-structure", conceptIndex);
  }
  const symbolRule = css.match(/\.navi-symbol\s*\{([^}]*)\}/i);
  if (!symbolRule) {
    throw validationError("LOGO_SYMBOL_UNSTYLED", "برای نشان اصلی لوگو هندسه و استایل مستقل تعریف نشده است.", "symbol-structure", conceptIndex);
  }
  const body = symbolRule[1];
  const hasWidth = /\bwidth\s*:\s*(?!0(?:px|%|rem)?\b)(?:[1-9]\d*(?:\.\d+)?(?:px|%|rem|cqw)|clamp\()/i.test(body);
  const hasHeight = /\bheight\s*:\s*(?!0(?:px|%|rem)?\b)(?:[1-9]\d*(?:\.\d+)?(?:px|%|rem|cqw)|clamp\()/i.test(body);
  const hasSolidSurface = /\bbackground(?:-color|-image)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(body);
  const radius = body.match(/\bborder-radius\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
  const hasShape = Boolean(/\bclip-path\s*:\s*[^;]+/i.test(body)) ||
    Boolean(radius && !/^0(?:px|%|rem)?(?:\s|$)/i.test(radius));
  const widthPx = Number(body.match(/\bwidth\s*:\s*([\d.]+)px/i)?.[1] || 0);
  const heightPx = Number(body.match(/\bheight\s*:\s*([\d.]+)px/i)?.[1] || 0);
  const proportionsAreUsable = !(widthPx > 0 && heightPx > 0) || heightPx / widthPx >= 0.22;
  const hasConstructionDetail = /\.navi-symbol__detail\s*\{|\.navi-symbol::(?:before|after)\s*\{/i.test(css) ||
    /<(?:span|em|i|svg|path|g|polygon|rect|circle|ellipse)\b/i.test(symbol[1]);
  const inlineVector = /<svg\b/i.test(symbol[1]);
  const vectorHasGeometry = !inlineVector || (/<path\b[^>]*\bd\s*=\s*["'][^"']{12,}["']/i.test(symbol[1]) ||
    (symbol[1].match(/<(?:path|polygon|rect|circle|ellipse|line|polyline)\b/gi) || []).length >= 2);
  if (!hasWidth || !hasHeight || !hasSolidSurface || !hasShape || !proportionsAreUsable || !hasConstructionDetail || !vectorHasGeometry) {
    throw validationError("LOGO_SYMBOL_UNDERBUILT", "نشان لوگو بیش از حد ساده یا خطی است؛ باید سطح هندسی، فرم مشخص و جزئیات سازنده داشته باشد.", "symbol-craft", conceptIndex);
  }
}

function normalizeConceptText(value) {
  return String(value || "").toLocaleLowerCase("fa").normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "").replace(/[ي]/g, "ی").replace(/[ك]/g, "ک")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(token => token.length > 1);
}
function textSimilarity(left, right) {
  const a = new Set(normalizeConceptText(left)), b = new Set(normalizeConceptText(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}
function validateConceptTraceability(item, conceptIndex) {
  const centralThesis = safeText(item?.centralThesis, 260);
  const symbolConstruction = safeText(item?.symbolConstruction, 320);
  const briefAlignment = safeText(item?.briefAlignment, 320);
  const briefElements = Array.isArray(item?.briefElements) ? item.briefElements.slice(0, 6).map(value => safeText(value, 100)).filter(Boolean) : [];
  if (centralThesis.length < 24 || symbolConstruction.length < 28 || briefAlignment.length < 28 || briefElements.length < 1) {
    throw validationError("LOGO_BRIEF_TRACEABILITY_MISSING", "ارتباط ایده با درخواست در یکی از طرح‌ها به‌صورت روشن توضیح داده نشده است.", "brief-traceability", conceptIndex);
  }
  return { centralThesis, symbolConstruction, briefAlignment, briefElements };
}
function conceptsAreNearDuplicates(left, right) {
  return textSimilarity(left.centralThesis, right.centralThesis) >= 0.76 &&
    textSimilarity(left.symbolConstruction, right.symbolConstruction) >= 0.76;
}

function sanitizeCss(value) {
  let css = String(value || "").slice(0, 16000);
  if (/[<>]|expression\s*\(|javascript:|behavior\s*:|-moz-binding|url\s*\((?!\s*#[a-zA-Z_][\w:.-]*\s*\))/i.test(css)) {
    throw validationError("LOGO_CSS_UNSAFE", "CSS contains a blocked external or executable resource.", "css-safety");
  }
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const keyframes = [];
  css = css.replace(/@keyframes\s+([a-zA-Z_][\w-]*)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/gi, (_match, name, body) => {
    if (!/^[-_a-zA-Z][\w-]*$/.test(name) || /[<>@]/.test(body)) {
      throw validationError("LOGO_CSS_UNSUPPORTED", "CSS animation definition is not supported.", "css-compatibility");
    }
    keyframes.push("@keyframes " + name + " {" + body + "}");
    return "";
  });
  if (/@/.test(css)) {
    throw validationError("LOGO_CSS_UNSUPPORTED", "CSS contains an unsupported at-rule.", "css-compatibility");
  }
  return css + (keyframes.length ? "\n" + keyframes.join("\n") : "");
}

async function designLogos(data, apiKey) {
  if (!apiKey) throw new Error("NAVI design service is not configured.");
  const userBrief = {
    brandName: data.brandName,
    designMode: data.designMode,
    designPrompt: data.designMode === "custom" ? data.designPrompt : "",
    slogan: data.slogan || "No slogan supplied",
    industry: data.industry || "Not specified",
    audience: data.audience || "Not specified",
    symbolIdea: data.symbolIdea || "Infer a defensible visual idea from the brand; do not invent unrelated symbols.",
    personality: data.personality || "Not specified",
    typography: data.typography || "Not specified",
    logoStructure: data.formatLabel || data.format,
    palette: {
      primary: data.primaryColor,
      background: data.darkColor,
      paletteName: data.palette
    }
  };
  const conceptCount = data.singleConcept ? 1 : 3;
  const system = [
    "You are NAVI IDENTITY WORKSHOP: a senior brand strategist and identity designer. Work from the client brief, not from a fixed logo style.",
    "MISSION: design exactly " + conceptCount + " concept(s). HTML and CSS are the live design medium for NAVA. You MAY embed carefully authored inline SVG geometry inside the HTML symbol wrapper when it improves precision; this remains an HTML deliverable, not a separate SVG export. Do not return standalone SVG files, raster images, canvas, external assets or prebuilt templates.",
    data.designMode === "custom"
      ? "IDEA OWNERSHIP — CLIENT MODE: the client supplied a creative direction. Treat userBrief.designPrompt as the binding creative idea and primary design direction. Preserve its meaning and priorities; do not replace it with an unrelated concept. You may refine it professionally, but never contradict it. Technical safety, legibility and quality requirements remain mandatory."
      : "IDEA OWNERSHIP — NAVI MODE: the client delegated creative ideation to NAVI. Independently derive a concise, brand-specific creative idea from the name, offer, audience, personality and constraints. Do not ask the client to invent a symbol. Avoid generic first associations; find a meaningful and ownable visual metaphor, then translate it into a coherent mark, wordmark and identity. State this idea briefly in Persian as designIdea.",
    "PHASE 1 — DISCOVERY: extract exact brand name/script, offer, audience, promise, personality, context, competitors if supplied, must-keep meanings, exclusions, use cases and constraints. Separate facts from assumptions. Do not invent brand history or claims.",
    "PHASE 2 — CATEGORY RESEARCH: identify visual clichés in the stated industry and explicitly avoid them unless transformed into a genuinely ownable idea. Use the reference library as comparative research only: study mark types, geometry, construction, negative space, silhouette and craft; never trace, imitate or reuse an existing trademark. A reference is a craft benchmark, not a template.",
    "PHASE 3 — WORD MAP: map the brand name, offer, promise and adjectives to nouns, verbs, metaphors, opposites, spatial relationships and geometric properties. Select intersections that are meaningful and visually distinctive.",
    "PHASE 4 — CONCEPT EXPLORATION: internally explore 8–12 genuinely different one-sentence design theses across at least two appropriate mark types: custom wordmark, letterform/monogram, pictorial, abstract, negative-space, emblem or combination. Score each for idea clarity, distinction, simplicity, relevance and small-size strength. Do not expose private chain-of-thought. For three concepts, return the strongest structurally different routes—not recolors or layout variations. For one, return the single strongest route.",
    "PHASE 4A — IDENTITY COHESION: choose 2–4 decision axes that matter to this specific brief (for example classic–contemporary, quiet–expressive, technical–human, premium–accessible). Place every concept on those axes using concise labels, and make the three routes visibly different on at least two axes. For each concept write exactly one mechanism sentence explaining how its central idea generates the symbol, typography and color direction together, plus one expression move: the single most distinctive visual decision. The mark, type and palette must feel like one identity, not separately selected decorations.",
    "PHASE 4B — ANTI-DEFAULT REFLEX: challenge familiar AI/logo defaults for this sector (generic circles/orbits, gradients, gold-on-cream, generic geometric sans, initials inside badges, stock industry icons). At least one concept must avoid the usual defaults entirely. If any concept uses a familiar choice, state the specific reason from the brief in defaultsUsed; otherwise return an empty array. Do not claim a choice is distinctive without explaining what makes it specific to this brand.",
    "PHASE 4C — BRIEF TRACEABILITY: before drawing, convert the supplied request into explicit visual anchors. For every concept return centralThesis (one precise sentence describing the actual design idea), briefElements (1–6 concrete requested or brand-derived elements), symbolConstruction (describe exactly how those elements are physically encoded in the symbol silhouette, geometry, overlap, cut-out or negative space), and briefAlignment (explain the direct connection to the user request or, in NAVI mode, to the brand name and business). These are not decorative explanations: the HTML/CSS symbol itself MUST visibly implement the stated construction. In client mode preserve every essential requested relationship; do not substitute an unrelated symbol. For a requested Persian/Arabic or Latin letter, do not merely typeset the glyph or mention it in the rationale: study its recognizable skeleton and rebuild that skeleton as custom vector contours. For ظ specifically, preserve the visual relationship of the ط-like body/stem and its distinctive dot above; the dot must be deliberately integrated and positioned, not an unrelated floating ornament. For Z specifically, preserve a clear top horizontal, diagonal connecting stroke and bottom horizontal, but customize their terminals, joins, proportions or negative-space cut so it becomes a designed monogram rather than a typed font glyph. The letter may be abstracted, but should remain discoverable in the silhouette or negative space. In NAVI mode derive anchors from brand name + industry + audience, not generic industry clip art. Do not claim an element is present unless it is visibly built into the mark. If the brief is ambiguous, make a restrained defensible interpretation rather than inventing a different brief.",
    "PHASE 5 — DESIGN BUILD: for each chosen thesis define the one-sentence idea, recognizable silhouette, geometry, figure/ground, primary mass, supporting forms, optical center, proportions, negative-space gaps, typography and lockup. Start with monochrome shape logic before palette. Make symbol and wordmark share a visual language. A logo identifies; it does not illustrate every service. Build the symbol from deliberate vector contours where possible: use an inline <svg viewBox=\"0 0 200 200\"> nested inside the .navi-symbol wrapper, with custom <path> geometry, not a generic Unicode character or a pile of CSS primitives. Use 2–5 purposeful paths/shapes that form ONE coherent silhouette; use fill-rule/clip-rule or overlapping paths to create real negative space. The vector must be responsive (width:100%; height:100%) and use currentColor or var(--logo-primary).",
    "PHASE 6 — CRAFT: use deliberate grid logic, clean angles where appropriate, consistent radii/weights, intentional asymmetry, optical overshoot, junction cleanup and balanced spacing. Avoid accidental tangencies, near-miss angles, lumps, tiny details, hairlines and gaps that close when reduced. Do not add 3D, gradients, glow or shadows to rescue a weak concept. A thin border or line alone is not an acceptable symbol. A logo symbol is a designed silhouette, not decoration: it must have a clear outer mass, intentional negative space and integrated construction details. Never submit two stray diagonal strokes, parallel lines, random squiggles, a lone border, or a generic abstract doodle as a logo. If the idea cannot be expressed as a memorable compact shape, redesign it.",
    "PHASE 6A — PREMIUM IDENTITY CRAFT: do not stop at a valid icon. Build a distinctive, art-directed mark with a deliberate silhouette, a primary mass, 2–4 supporting geometric decisions, intentional overlap or cut-out, controlled negative space and precise optical balance. Use a coherent construction system (shared angles, radii, stroke weights and spacing); details must grow from the core idea, never be pasted-on decoration. Avoid the default single circle + one dot, simple blob + line, basic ring, generic flower, or one primitive with a tiny accent. Prefer custom geometry, interlocking forms, bespoke letterform construction and a considered figure/ground relationship when the brief supports them. Make the wordmark feel custom through weight, spacing, scale, alignment and lockup—not merely a large default font. Use visual richness through form and craft, not unnecessary gradients, shadows or ornament. Premium does not mean complicated: every added component must improve recognition, meaning or balance.",
    "PHASE 7 — TEST AND REFINE: inspect the composition conceptually at full size and at 64, 32, 24 and 16 px; test one-color black on white, reversed white on dark, grayscale and silhouette-only. Check readability, crop safety, contrast, optical balance and accidental readings. Redesign failures. Do not claim an external browser render or pixel test was performed.",
    "CONCEPT DIFFERENTIATION: every concept needs a different central thesis, outer silhouette and structural construction. Avoid category clip art. Do not default to circles, orbits, sound waves, equalizers, musical notes, globes, leaves, arrows or generic letter-in-a-shield. Use only when the brief supports a fresh transformation.",
    "WORDMARK: render the exact brand name as live HTML text exactly once using {{BRAND_NAME}}. Preserve spelling, language and script. Persian/Arabic must use direction:rtl, unicode-bidi:plaintext and a suitable system font stack. Typography must be intentionally styled and legible. If a slogan exists, include {{SLOGAN}} exactly once as secondary text; otherwise do not invent one.",
    "ARTBOARD: design on a square 1000×1000 logical grid with deliberate margins, but keep the actual .logo-art-root responsive to the available square viewport: width:100%; height:100%; min-width:0; min-height:0; max-width:100%; max-height:100%; container-type:size. Never assign the root a fixed 1000px width or height. Scale all mark geometry and spacing with percentages, cqw container units and clamp(); center the lockup with grid or flex. Do not position the central mark at fixed 500px offsets or use fixed 1000px child dimensions. A mark should remain fully visible in a 320×320 mobile preview. Give the lockup clear hierarchy and use the canvas meaningfully; no tiny floating logo, poster, mockup, border frame or UI card.",
    "COLOR: honor the client palette and use var(--logo-primary) and var(--logo-background). For NAVA Logo Studio previews, the artboard/canvas background must be white or a light neutral and must never default to navy or dark blue. Navy or blue may still be used as an intentional brand-mark or wordmark color when the client brief or selected brand palette calls for it; never force or ban a brand color globally. Keep the canvas separate from the logo identity colors. Do not assume gold is required. Use at most two justified accent colors.",
    "HTML CONTRACT: output a fragment using div, span, p, strong, em, small, br and the safe inline SVG geometry tags svg, g, path, circle, ellipse, rect, polygon, polyline, line, defs, linearGradient, radialGradient, stop and clipPath. For combination or monogram logos, include exactly one dedicated <div class=\"navi-symbol\" data-logo-role=\"symbol\"> as the central mark. Prefer one inline <svg class=\"navi-symbol__vector\" viewBox=\"0 0 200 200\"> inside it, containing original custom path geometry; a separate small .navi-symbol__detail span may be used only when it contributes to the core silhouette. Never use an external SVG file or URL. The vector must contain 2–5 purposeful geometry elements that form one filled, coherent silhouette with intentional negative space. Include the exact brand wordmark and optional slogan as semantic data-logo-role elements. No scripts, event handlers, style attributes, images, canvas, iframe, links, external fonts, external resources or embedded content. Scope selectors under .logo-art-root.",
    "CSS CONTRACT: output a complete responsive stylesheet for a square 1000×1000 logical artboard rendered inside a square viewport of any size. The .logo-art-root itself must use width:100%; height:100%; never fixed pixel dimensions. Use container-relative cqw units, percentages and clamp() for geometry and typography; all central elements must stay within the viewport. For combination/monogram formats, style .navi-symbol with explicit nonzero width and height, a visible filled background or layered surfaces, and intentional proportions; when using inline SVG, make it display:block;width:100%;height:100%;overflow:visible and preserve its viewBox ratio. Unless the concept is intentionally typographic, build the mark from multiple coordinated vector contours rather than one primitive with one token detail. Use original vector paths and CSS only for layout, optical alignment and responsive sizing. Set root layout, dimensions, overflow, direction, colors and typography explicitly. No url(), @import, @font-face, expressions or external resources.",
    "QUALITY GATE: reject generic doodles, crooked lines, two-line marks, stock icons, plain initials in an unmodified font, random ornament, over-complex illustration, weak silhouette, poor wordmark, bad spacing, low contrast or designs that fail at small sizes. Before returning, verify that the symbol reads as one intentional ownable silhouette at 32px, has a clear filled mass, at least two purposeful integrated construction decisions, deliberate negative space, and a visible relationship to the brand idea. Do not count a default circle, border or lone dot as a meaningful construction detail. Inspect the design as a black one-color silhouette: if it becomes a generic blob, ring or primitive icon, redesign it. Every detail must contribute to recognition, hierarchy, geometry or material. If any check fails, redesign rather than rationalize the sketch.",
    "OUTPUT: return one valid JSON object only with keys brandCore, designIdea, designBriefEnglish, strategy, concepts. designIdea is a concise Persian statement of the central creative idea. Return exactly " + conceptCount + " concept object(s), each with Persian title, Persian rationale, centralThesis, briefElements, symbolConstruction, briefAlignment, mechanism, expressionMove, differsBy, axes, defaultsUsed, html and css. centralThesis, briefElements, symbolConstruction and briefAlignment must be concise, concrete Persian text checked against the visible mark. Include no chain-of-thought, markdown or explanation outside JSON. Each HTML fragment under 6500 chars and each CSS stylesheet under 9000 chars."
  ].join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: "Create exactly " + conceptCount + " complete logo design" + (conceptCount === 1 ? "" : " concepts") + " from this client brief. Follow the designPrompt as binding art direction and return a production-ready HTML/CSS identity, not a sketch.\n" + JSON.stringify(userBrief) }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "MEDIUM" },
            maxOutputTokens: 32768,
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Gemini HTTP " + response.status);
      error.httpStatus = response.status;
      error.diagnosticCode = response.status === 429 ? "MODEL_RATE_LIMIT" :
        response.status >= 500 ? "MODEL_SERVICE_ERROR" :
        response.status === 400 ? "MODEL_REQUEST_REJECTED" : "MODEL_API_ERROR";
      throw error;
    }
    if (payload?.promptFeedback?.blockReason) {
      const error = new Error("Gemini blocked the logo-design prompt: " + payload.promptFeedback.blockReason);
      error.diagnosticCode = "MODEL_PROMPT_BLOCKED";
      throw error;
    }
    const candidate = payload?.candidates?.[0];
    if (!candidate) {
      const error = new Error("Gemini returned no candidate.");
      error.diagnosticCode = "MODEL_EMPTY_RESPONSE";
      throw error;
    }
    const finishReason = String(candidate.finishReason || "");
    if (finishReason === "MAX_TOKENS") {
      const error = new Error("Gemini output reached maxOutputTokens; output is incomplete.");
      error.diagnosticCode = "MODEL_OUTPUT_TRUNCATED";
      error.finishReason = finishReason;
      throw error;
    }
    if (finishReason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(finishReason)) {
      const error = new Error("Gemini stopped generation: " + finishReason);
      error.diagnosticCode = finishReason === "SAFETY" ? "MODEL_OUTPUT_BLOCKED" : "MODEL_FINISH_ERROR";
      error.finishReason = finishReason;
      throw error;
    }
    const raw = (candidate.content?.parts || []).map(part => part.text || "").join("");
    if (!raw.trim()) {
      const error = new Error("Gemini returned an empty text response.");
      error.diagnosticCode = "MODEL_EMPTY_RESPONSE";
      throw error;
    }
    let plan;
    try {
      plan = extractJsonObject(raw);
    } catch {
      const error = new Error("Gemini response was not complete valid JSON.");
      error.diagnosticCode = "MODEL_INVALID_JSON";
      error.outputLength = raw.length;
      throw error;
    }
    if (!Array.isArray(plan.concepts) || plan.concepts.length !== conceptCount) {
      throw validationError("LOGO_CONCEPT_COUNT", "NAVI did not return the requested number of logo designs.", "concept-count");
    }
    const designBriefEnglish = safeText(plan.designBriefEnglish, 1800);
    if (!designBriefEnglish || !safeText(plan.strategy, 500)) {
      throw validationError("LOGO_BRIEF_INCOMPLETE", "NAVI returned an incomplete design brief.", "brief");
    }
    const concepts = [];
    const rejectedConcepts = [];
    plan.concepts.forEach((item, index) => {
      try {
      let html;
      let css;
      try {
        html = sanitizeHtmlFragment(item?.html);
      } catch {
        throw validationError("LOGO_HTML_UNSAFE", "HTML safety validation failed.", "html-safety", index + 1);
      }
      try {
        css = sanitizeCss(item?.css);
      } catch (error) {
        if (error?.diagnosticCode) {
          error.conceptIndex = index + 1;
          throw error;
        }
        throw validationError("LOGO_CSS_UNSAFE", "CSS validation failed.", "css-safety", index + 1);
      }
      // Recover a missing model placeholder deterministically instead of rejecting the whole batch.
      // If the exact brand name already exists as visible text, promote it to the required semantic wordmark.
      const needsBrandFallback = !html.includes("{{BRAND_NAME}}");
      if (needsBrandFallback) {
        const escapedBrand = escapeHtml(data.brandName);
        const visibleText = html.replace(/<[^>]*>/g, "");
        if (escapedBrand && visibleText.includes(escapedBrand)) {
          html = html.replace(escapedBrand, '<span data-logo-role="brand">' + escapedBrand + "</span>");
        } else {
          html += '<div class="navi-brand-lockup"><span data-logo-role="brand">' + escapedBrand + "</span></div>";
        }
      }
      // Recover a missing slogan placeholder without rejecting an otherwise usable concept.
      // Preserve exact supplied wording and make the slogan a semantic, visibly styled secondary element.
      const needsSloganFallback = Boolean(data.slogan && !html.includes("{{SLOGAN}}"));
      if (needsSloganFallback) {
        const escapedSlogan = escapeHtml(data.slogan);
        const visibleText = html.replace(/<[^>]*>/g, "");
        if (escapedSlogan && visibleText.includes(escapedSlogan)) {
          html = html.replace(escapedSlogan, '<span data-logo-role="slogan">' + escapedSlogan + "</span>");
        } else {
          html += '<div class="navi-slogan-lockup"><span data-logo-role="slogan">' + escapedSlogan + "</span></div>";
        }
      }
      const finalHtml = html
        .replace(/\{\{BRAND_NAME\}\}/g, '<span data-logo-role="brand">' + escapeHtml(data.brandName) + "</span>")
        .replace(/\{\{SLOGAN\}\}/g, '<span data-logo-role="slogan">' + escapeHtml(data.slogan) + "</span>");
      const usesInlineVector = /<svg\b/i.test(finalHtml);
      if (data.format !== "wordmark") validateSymbolStructure(finalHtml, css, index + 1);
      const traceability = validateConceptTraceability(item, index + 1);
      const brandFallbackCss = '.navi-brand-lockup{display:flex;justify-content:center;align-items:center;width:100%;margin-top:28px;padding:12px 8px;text-align:center;color:var(--logo-primary);font-family:inherit;font-size:clamp(36px,8vw,76px);font-weight:900;line-height:1.25;direction:auto;unicode-bidi:plaintext}';
      const sloganFallbackCss = '.navi-slogan-lockup{display:flex;justify-content:center;align-items:center;width:100%;margin-top:10px;padding:4px 8px;text-align:center;color:var(--logo-primary);font-family:inherit;font-size:clamp(16px,3vw,26px);font-weight:500;line-height:1.5;direction:auto;unicode-bidi:plaintext;opacity:.88}';
      const finalCss = css +
        (needsBrandFallback && html.includes('class="navi-brand-lockup"') ? "\n" + brandFallbackCss : "") +
        (needsSloganFallback && html.includes('class="navi-slogan-lockup"') ? "\n" + sloganFallbackCss : "");
      const visualElementCount = (html.match(/<\s*(?:div|span|p|strong|em|b|i|small|br)\b/gi) || []).length;
      const cssRuleCount = (css.match(/[^{}]+\{[^{}]*\}/g) || []).length;
      // Score independent design disciplines, not raw keyword frequency.
      // A strong typographic/geometric concept should not fail merely because
      // it uses borders and layout instead of gradients or pseudo-elements.
      const craftGroups = [
        /::before|::after/i,
        /linear-gradient|radial-gradient|conic-gradient/i,
        /box-shadow\s*:[^;]*inset|inset\s+[^;]*box-shadow/i,
        /box-shadow\s*:/i,
        /border(?:-[a-z-]+)?\s*:/i,
        /transform\s*:/i,
        /clip-path\s*:|mask(?:-image)?\s*:/i,
        /display\s*:\s*(?:grid|flex)/i,
        /position\s*:/i,
        /font-(?:size|weight|family)\s*:|letter-spacing\s*:/i
      ];
      const craftScore = craftGroups.reduce((score, pattern) => score + (pattern.test(css) ? 1 : 0), 0) + (usesInlineVector ? 2 : 0);
      // The structural symbol validator is the primary quality gate. This score
      // is a secondary craft signal and must not reject clean flat/geometric work.
      const minimumCraftScore = data.format === "wordmark" ? 3 : 4;
      const minimumCssRules = data.format === "wordmark" ? 2 : 3;
      if (craftScore < minimumCraftScore || cssRuleCount < minimumCssRules) {
        throw validationError("LOGO_CRAFT_TOO_WEAK", "ساختار بصری لوگو به اندازه کافی پرداخت نشده است؛ طرح خام و کم‌جزئیات تحویل داده نمی‌شود.", "craft-quality", index + 1);
      }
      // Reject visibly underbuilt sketches before they reach the user. The
      // threshold checks independent CSS craft techniques, not token count.
      // Permit premium flat/geometric identities, but require at least one
      // substantial filled symbol surface in addition to the artboard.
      if (html.length < 20 || css.length < 40 || visualElementCount < 1) {
        throw validationError("LOGO_CONCEPT_TOO_SIMPLE", "Logo concept returned incomplete HTML/CSS markup.", "composition-completeness", index + 1);
      }
      const title = safeText(item?.title, 100) || "مسیر طراحی " + (index + 1);
      const rationale = safeText(item?.rationale, 420) || "این مسیر بر اساس بریف برند طراحی شده است.";
      const concept = {
        id: "navi-html-css-" + (index + 1),
        title,
        rationale,
        ...traceability,
        mechanism: safeText(item?.mechanism, 260),
        expressionMove: safeText(item?.expressionMove, 180),
        differsBy: safeText(item?.differsBy, 220),
        axes: item?.axes && typeof item.axes === "object" && !Array.isArray(item.axes)
          ? Object.fromEntries(Object.entries(item.axes).slice(0, 4).map(([key, value]) => [
            safeText(key, 48), safeText(value, 64)
          ]).filter(([key, value]) => key && value))
          : {},
        defaultsUsed: Array.isArray(item?.defaultsUsed)
          ? item.defaultsUsed.slice(0, 4).map(value => safeText(value, 140)).filter(Boolean)
          : [],
        html: finalHtml,
        css: finalCss
      };
        const duplicateOf = concepts.findIndex(existing => conceptsAreNearDuplicates(existing, concept));
        if (duplicateOf >= 0) {
          rejectedConcepts.push({ index: index + 1, code: "LOGO_CONCEPTS_NOT_DISTINCT", stage: "concept-distinctness", similarTo: duplicateOf + 1 });
        } else {
          concepts.push(concept);
        }
      } catch (error) {
        // Unsafe markup/resources invalidate the whole response, not just one
        // concept: never return a partially accepted batch after a security hit.
        if (["LOGO_HTML_UNSAFE", "LOGO_CSS_UNSAFE"].includes(error?.diagnosticCode)) throw error;
        rejectedConcepts.push({
          index: index + 1,
          code: error?.diagnosticCode || "LOGO_CONCEPT_REJECTED",
          stage: error?.validationStage || "concept-validation"
        });
      }
    });
    if (!concepts.length) {
      const first = rejectedConcepts[0];
      throw validationError(
        first?.code || "LOGO_ALL_CONCEPTS_REJECTED",
        "هیچ‌یک از طرح‌ها از کنترل کیفیت و ایمنی عبور نکرد. فرصت آزمایشی آزاد شد؛ بریف و ساختار طراحی باید اصلاح شود.",
        first?.stage || "concept-validation",
        first?.index || null
      );
    }
    if (new Set(concepts.map(item => item.title.toLowerCase())).size !== concepts.length) {
      throw validationError("LOGO_CONCEPTS_NOT_DISTINCT", "NAVI returned repeated logo concept titles.", "concept-distinctness");
    }
    return {
      brandCore: safeText(plan.brandCore, 300),
      designIdea: safeText(plan.designIdea, 320) || safeText(plan.brandCore, 300) || safeText(plan.strategy, 320),
      strategy: safeText(plan.strategy, 500),
      designBriefEnglish,
      concepts,
      rejectedConcepts
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleLogoRoute({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);

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
    designMode: input?.designMode === "custom" ? "custom" : "navi",
    designPrompt: input?.designMode === "custom" ? safeText(input?.designPrompt, 1200) : "",
    singleConcept: input?.singleConcept === true,
    slogan: safeText(input?.slogan, 100),
    industry: safeText(input?.industry, 100),
    audience: safeText(input?.audience, 120),
    symbolIdea: safeText(input?.symbolIdea, 180),
    personality: safeText(input?.personality, 80),
    personalityValue: safeText(input?.personalityValue, 30),
    typography: safeText(input?.typography, 80),
    typographyValue: safeText(input?.typographyValue, 30),
    format: ["combination", "wordmark", "monogram"].includes(input?.format) ? input.format : "",
    formatLabel: safeText(input?.formatLabel, 60),
    palette: safeText(input?.palette, 80),
    primaryColor: safeText(input?.primaryColor, 12),
    darkColor: safeText(input?.darkColor, 12)
  };
  if (!data.brandName) return fail("نام برند برای طراحی لازم است.", 400, corsOrigin);
  if (!data.format) return fail("ساختار لوگوی انتخاب‌شده معتبر نیست.", 400, corsOrigin);
  if (!/^#[0-9a-fA-F]{6}$/.test(data.primaryColor) || !/^#[0-9a-fA-F]{6}$/.test(data.darkColor)) {
    return fail("رنگ‌های انتخاب‌شده معتبر نیستند؛ پالت را دوباره انتخاب کن.", 400, corsOrigin);
  }

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
  if (!quota.authenticated && !quota.reservationId) {
    return fail("رزرو فرصت آزمایشی کامل نشد. کمی بعد دوباره تلاش کن.", 503, corsOrigin);
  }

  try {
    const plan = await designLogos(data, env.GEMINI_API_KEY);
    return json({
      success: true,
      brandName: data.brandName,
      remaining: quota.remaining ?? null,
      planning: {
        method: "navi-english-brief-html-css-design",
        brandCore: plan.brandCore,
        designIdea: plan.designIdea,
        strategy: plan.strategy,
        designBriefEnglish: plan.designBriefEnglish,
        extraModelCalls: 0,
        note: "NAVI authored the English design brief and the accepted HTML/CSS logo designs in one request."
      },
      concepts: plan.concepts,
      rejectedConcepts: plan.rejectedConcepts || []
    }, 200, corsOrigin);
  } catch (error) {
    if (quota.reservationId) {
      await releaseGuestTrialReservation({ env, reservationId: quota.reservationId });
    }
    const diagnosticCode = error?.diagnosticCode ||
      (/aborted|timeout/i.test(String(error?.message || "")) ? "MODEL_TIMEOUT" : "LOGO_VALIDATION_FAILED");
    console.error("[NAVA LOGO] design failure:", JSON.stringify({
      diagnosticCode,
      httpStatus: error?.httpStatus || null,
      finishReason: error?.finishReason || null,
      outputLength: error?.outputLength || null,
      validationStage: error?.validationStage || null,
      conceptIndex: error?.conceptIndex || null,
      message: String(error?.message || error).slice(0, 220)
    }));
    const messages = {
      MODEL_TIMEOUT: "زمان طراحی لوگو تمام شد؛ فرصت آزمایشی آزاد شد. بعداً دوباره تلاش کن.",
      MODEL_RATE_LIMIT: "سرویس طراحی فعلاً به محدودیت درخواست رسیده؛ فرصت آزمایشی آزاد شد. کمی بعد دوباره تلاش کن.",
      MODEL_SERVICE_ERROR: "سرویس طراحی موقتاً پاسخ‌گو نیست؛ فرصت آزمایشی آزاد شد. کمی بعد دوباره تلاش کن.",
      MODEL_REQUEST_REJECTED: "درخواست طراحی توسط سرویس پذیرفته نشد؛ فرصت آزمایشی آزاد شد.",
      MODEL_PROMPT_BLOCKED: "درخواست طراحی توسط فیلتر ایمنی سرویس متوقف شد؛ فرصت آزمایشی آزاد شد.",
      MODEL_OUTPUT_TRUNCATED: "پاسخ طراحی ناقص ماند و به سقف تولید رسید؛ فرصت آزمایشی آزاد شد. دوباره تلاش کن.",
      MODEL_EMPTY_RESPONSE: "سرویس طراحی خروجی قابل استفاده‌ای برنگرداند؛ فرصت آزمایشی آزاد شد.",
      MODEL_INVALID_JSON: "ساختار پاسخ طراحی ناقص یا نامعتبر بود؛ فرصت آزمایشی آزاد شد.",
      MODEL_OUTPUT_BLOCKED: "خروجی طراحی توسط فیلتر ایمنی متوقف شد؛ فرصت آزمایشی آزاد شد.",
      MODEL_FINISH_ERROR: "تولید طرح پیش از تکمیل متوقف شد؛ فرصت آزمایشی آزاد شد.",
      MODEL_API_ERROR: "ارتباط با سرویس طراحی ناموفق بود؛ فرصت آزمایشی آزاد شد.",
      LOGO_VALIDATION_FAILED: "طرح تولید شد اما از بررسی کیفیت و ایمنی نوا عبور نکرد؛ فرصت آزمایشی آزاد شد.",
      LOGO_CONCEPT_COUNT: "نوا سه مسیر طراحی کامل دریافت نکرد؛ فرصت آزمایشی آزاد شد.",
      LOGO_BRIEF_INCOMPLETE: "بریف طراحی کامل نشد؛ فرصت آزمایشی آزاد شد.",
      LOGO_BRIEF_TRACEABILITY_MISSING: "ارتباط یکی از طرح‌ها با خواسته یا هویت برند روشن نیست؛ طرح برای اصلاح کنار گذاشته شد.",
      LOGO_BRAND_NAME_MISSING: "نام برند در یکی از طرح‌ها به‌درستی جای‌گذاری نشده؛ فرصت آزمایشی آزاد شد.",
      LOGO_SLOGAN_MISSING: "شعار برند در یکی از طرح‌ها به‌درستی جای‌گذاری نشده؛ فرصت آزمایشی آزاد شد.",
      LOGO_SYMBOL_MISSING: "نشان اصلی در طرح به‌صورت یک فرم مستقل ساخته نشده؛ نوا آن را برای جلوگیری از تحویل لوگوی ناقص رد کرد و فرصت آزمایشی آزاد شد.",
      LOGO_SYMBOL_UNSTYLED: "برای نشان اصلی هندسه و استایل مستقل تعریف نشده؛ فرصت آزمایشی آزاد شد.",
      LOGO_SYMBOL_UNDERBUILT: "نشان اصلی هنوز فرم هندسی و جزئیات سازنده کافی ندارد؛ فرصت آزمایشی آزاد شد.",
      LOGO_CRAFT_TOO_WEAK: "پرداخت بصری طرح کافی نیست؛ نوا از تحویل طرح خام جلوگیری کرد و فرصت آزمایشی آزاد شد.",
      LOGO_ALL_CONCEPTS_REJECTED: "هیچ‌یک از مسیرهای طراحی از کنترل کیفیت عبور نکرد؛ فرصت آزمایشی آزاد شد.",
      LOGO_CONCEPT_TOO_SIMPLE: "یکی از طرح‌ها جزئیات و ساختار بصری کافی نداشت؛ فرصت آزمایشی آزاد شد.",
      LOGO_CONCEPTS_NOT_DISTINCT: "سه مسیر طراحی به‌اندازه کافی با هم تفاوت نداشتند؛ فرصت آزمایشی آزاد شد.",
      LOGO_CSS_UNSAFE: "کد یکی از طرح‌ها شامل دستور یا منبع غیرمجاز بود؛ فرصت آزمایشی آزاد شد.",
      LOGO_CSS_UNSUPPORTED: "ساختار فنی یکی از طرح‌ها با پیش‌نمایش امن نوا سازگار نبود؛ فرصت آزمایشی آزاد شد.",
      LOGO_HTML_UNSAFE: "ساختار HTML یکی از طرح‌ها ایمن نبود؛ فرصت آزمایشی آزاد شد."
    };
    return fail(messages[diagnosticCode] || messages.LOGO_VALIDATION_FAILED, 502, corsOrigin, {
      code: diagnosticCode,
      retryable: ["MODEL_TIMEOUT", "MODEL_RATE_LIMIT", "MODEL_SERVICE_ERROR", "MODEL_EMPTY_RESPONSE"].includes(diagnosticCode)
    });
  }
}
