// NAVI HTML/CSS Logo Studio.
// NAVI writes an English art-direction brief and the actual HTML/CSS logo.
// The browser only renders inert markup in a sandboxed iframe; no image model is used.
import { json, safeText } from "./shared.js";
import { GEMINI_MODEL, ALLOWED_ORIGIN } from "./config.js";
import { handleGuestTrial, releaseGuestTrialReservation } from "./guest-trial.js";
import { buildStructuredLogoConcepts } from "./logo-engine.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

// Retry transient Gemini overloads once; keep the same request and abort deadline.
async function fetchGeminiWithRetry(url, options) {
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  const retryDelays = [700, 1500];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      continue;
    }
    if (!retryableStatuses.has(response.status) || attempt >= 2) return response;
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
  }
  throw new Error("Gemini request failed after retry.");
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

const ALLOWED_TAGS = new Set(["div", "span", "p", "strong", "em", "b", "i", "small", "br"]);
const ALLOWED_ATTRIBUTES = new Set(["class", "id", "role", "aria-hidden", "aria-label", "data-logo-role"]);

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
  // SVG is excluded from Logo Studio output, even if the model ignores its instructions.
  html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|form|input|button|link|meta|base|video|audio|img|foreignObject)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/gi, (whole, rawTag, rawAttrs) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const outputTag = tag;
    const closing = /^<\//.test(whole);
    if (closing) return "</" + outputTag + ">";
    const selfClosing = /\/\s*>$/.test(whole);
    const attrs = [];
    String(rawAttrs || "").replace(/([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g,
      (_match, rawName, _value, doubleValue, singleValue, bareValue) => {
        const name = rawName.toLowerCase();
        const value = doubleValue ?? singleValue ?? bareValue ?? "";
        if (!ALLOWED_ATTRIBUTES.has(name)) return "";
        if (/javascript:|data:|https?:/i.test(value)) return "";
        if (/url\s*\(/i.test(value) && !/^url\(#[a-zA-Z_][\w:.-]*\)$/i.test(value.trim())) return "";
        if (/[<>]/.test(value)) return "";
        attrs.push(name + '="' + escapeHtml(value) + '"');
        return "";
      });
    return "<" + outputTag + (attrs.length ? " " + attrs.join(" ") : "") + (selfClosing ? " />" : ">");
  });
  return html;
}

// Find the complete symbol DIV, including any nested DIV layers.
// A non-greedy </div> match is incorrect here because logo geometry is intentionally nested.
function findSymbolElement(html) {
  const tags = /<\/?div\b[^>]*>/gi;
  let match;
  let depth = 0;
  let openingStart = -1;
  let innerStart = -1;
  while ((match = tags.exec(String(html || "")))) {
    const tag = match[0];
    const closing = /^<\//.test(tag);
    if (openingStart < 0) {
      if (closing) continue;
      const classValue = tag.match(/\bclass="([^"]*)"/i)?.[1] || "";
      const role = tag.match(/\bdata-logo-role="([^"]*)"/i)?.[1] || "";
      if (!classValue.split(/\s+/).includes("navi-symbol") || role !== "symbol") continue;
      openingStart = match.index;
      innerStart = tags.lastIndex;
      depth = 1;
      continue;
    }
    if (closing) depth -= 1;
    else if (!/\/\s*>$/.test(tag)) depth += 1;
    if (depth === 0) {
      const closingStart = match.index;
      const end = tags.lastIndex;
      return {
        outer: String(html).slice(openingStart, end),
        inner: String(html).slice(innerStart, closingStart),
        index: openingStart
      };
    }
  }
  return null;
}

function hasPositiveCssDimension(value) {
  const dimension = String(value || "").trim();
  if (!dimension || /^(?:0(?:px|%|rem|em|vw|vh|cqw|cqh)?|none|auto)$/i.test(dimension)) return false;
  if (/^(?:[1-9]\d*(?:\.\d+)?|\.\d+)(?:px|%|rem|em|vw|vh|cqw|cqh)$/i.test(dimension)) return true;
  // Modern responsive geometry commonly uses min()/max()/clamp()/calc().
  // Accept these only when they contain an explicit positive CSS length.
  return /^(?:min|max|clamp|calc)\([^;]+\)$/i.test(dimension) &&
    /(?:[1-9]\d*(?:\.\d+)?|\.\d+)(?:px|%|rem|em|vw|vh|cqw|cqh)\b/i.test(dimension);
}

function cssRuleBodiesForClass(css, className) {
  const safeClass = String(className || "").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeClass) return [];
  const selectorPattern = new RegExp("(^|[^a-zA-Z0-9_-])\\." + safeClass + "(?=$|[\\s.#:[,>+~])", "i");
  const bodies = [];
  for (const match of String(css || "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectorPattern.test(match[1])) bodies.push({ selector: match[1].trim(), body: match[2] });
  }
  return bodies;
}

function validateSymbolStructure(html, css, conceptIndex) {
  const symbol = findSymbolElement(html);
  if (!symbol) throw validationError("LOGO_SYMBOL_MISSING", "نشان اصلی لوگو به‌صورت یک ساختار مشخص و مستقل ساخته نشده است.", "symbol-structure", conceptIndex);
  // NAVI is instructed to scope styles under .logo-art-root. Accept scoped
  // selectors as well as bare classes; exact-selector matching caused false
  // "underbuilt" failures for valid CSS such as .logo-art-root .navi-symbol.
  const symbolRules = cssRuleBodiesForClass(css, "navi-symbol");
  const baseRules = symbolRules.filter(rule => !/::?(?:before|after)\b/i.test(rule.selector));
  if (!baseRules.length) throw validationError("LOGO_SYMBOL_UNSTYLED", "برای نشان اصلی لوگو هندسه و استایل مستقل تعریف نشده است.", "symbol-structure", conceptIndex);
  const body = baseRules.map(rule => rule.body).join(";");
  const widthValue = body.match(/\bwidth\s*:\s*([^;]+)/i)?.[1];
  const heightValue = body.match(/\bheight\s*:\s*([^;]+)/i)?.[1];
  const hasWidth = hasPositiveCssDimension(widthValue);
  const hasHeight = hasPositiveCssDimension(heightValue);
  const innerMarkup = symbol.inner;
  const layerClasses = [...innerMarkup.matchAll(/<(?:div|span|em|i)\b[^>]*class="([^"]+)"[^>]*>/gi)]
    .flatMap(match => match[1].split(/\s+/))
    .filter(name => name && name !== "navi-symbol");
  const styledLayers = [...new Set(layerClasses)].flatMap(name =>
    cssRuleBodiesForClass(css, name).map(rule => ({ name, body: rule.body }))
  );
  const pseudoLayers = symbolRules.filter(rule => /::?(?:before|after)\b/i.test(rule.selector));
  const allGeometryCss = [body, ...styledLayers.map(layer => layer.body), ...pseudoLayers.map(layer => layer.body)];
  const hasSurface = allGeometryCss.some(ruleBody =>
    /\bbackground(?:-color|-image)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(ruleBody));
  const hasShape = allGeometryCss.some(ruleBody => {
    const radius = ruleBody.match(/\bborder-radius\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const clipPath = ruleBody.match(/\bclip-path\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const border = ruleBody.match(/\bborder(?:-[a-z-]+)?\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    return Boolean(clipPath && !/^none$/i.test(clipPath)) ||
      Boolean(radius && !/^0(?:px|%|rem)?(?:\s|$)/i.test(radius)) ||
      Boolean(border && !/^0(?:px|%|rem)?(?:\s|$)/i.test(border));
  });
  // Require one actual filled silhouette: fill and contour must coexist on
  // the same layer, so scattered strokes cannot masquerade as a logo mark.
  const hasFilledSilhouette = allGeometryCss.some(ruleBody => {
    const fill = ruleBody.match(/\bbackground(?:-color|-image)?\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const radius = ruleBody.match(/\bborder-radius\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const clipPath = ruleBody.match(/\bclip-path\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const visibleFill = fill && !/^(?:transparent|none)$/i.test(fill);
    const contour = (radius && !/^0(?:px|%|rem)?(?:\s|$)/i.test(radius)) ||
      (clipPath && !/^none$/i.test(clipPath));
    return Boolean(visibleFill && contour);
  });
  const widthPx = Number(widthValue?.match(/^\s*([\d.]+)px\s*$/i)?.[1] || 0);
  const heightPx = Number(heightValue?.match(/^\s*([\d.]+)px\s*$/i)?.[1] || 0);
  const proportions = !(widthPx > 0 && heightPx > 0) || heightPx / widthPx >= 0.22;
  const detailPattern = /\b(?:position|inset|top|right|bottom|left|width|height|background(?:-color|-image)?|border(?:-[a-z-]+)?|border-radius|clip-path|transform|mask(?:-image)?)\s*:/i;
  // The outer symbol contour can be the complete design; child layers are optional.
  // A lone shaped silhouette is valid only when no empty child layers pretend to construct it.
  const hasDistinctOuterSilhouette = symbolRules.some(rule => {
    if (/::?(?:before|after)\b/i.test(rule.selector)) return false;
    const radius = rule.body.match(/\bborder-radius\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    const clipPath = rule.body.match(/\bclip-path\s*:\s*([^;]+)/i)?.[1]?.trim() || "";
    return Boolean(clipPath && !/^none$/i.test(clipPath)) ||
      Boolean(radius && !/^50%(?:\s+50%)?$/i.test(radius) && !/^0(?:px|%|rem)?(?:\s|$)/i.test(radius));
  });
  // A generic circular badge plus empty child spans is not a complete mark.
  // A custom outer contour (e.g. clip-path) may stand alone; otherwise require
  // an actually styled construction layer or pseudo-element.
  const detail = (hasFilledSilhouette && hasDistinctOuterSilhouette) ||
    styledLayers.some(layer => detailPattern.test(layer.body)) ||
    pseudoLayers.some(rule => detailPattern.test(rule.body));
  if (!hasWidth || !hasHeight || !hasSurface || !hasShape || !hasFilledSilhouette || !proportions || !detail) {
    const missing = [
      !hasWidth || !hasHeight ? "ابعاد مستقل و معتبر" : "",
      !hasSurface ? "سطح پرشده در بدنه یا لایه‌های نشان" : "",
      !hasShape ? "مرز یا برش هندسی در ساختار نشان" : "",
      !hasFilledSilhouette ? "حداقل یک فرم توپر با مرز هندسی مشخص" : "",
      !proportions ? "تناسب قابل‌قبول" : "",
      !detail ? "لایه سازنده مستقل با هندسه قابل‌مشاهده" : ""
    ].filter(Boolean).join("، ");
    throw validationError("LOGO_SYMBOL_UNDERBUILT",
      "نشان اصلی هنوز ساختار هندسی کامل ندارد؛ بخش ناقص: " + missing + ".",
      "symbol-craft", conceptIndex);
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
function validateVisualAnchorMap(html, css, item, conceptIndex, format) {
  // Gemini may provide the design anchors in briefElements/symbolConstruction
  // but omit the redundant visualAnchors/anchorMap JSON fields. Recover that
  // contract deterministically from the already-validated design rationale and
  // actual HTML/CSS layers; do not weaken the symbol or safety checks.
  const briefElements = Array.isArray(item?.briefElements)
    ? item.briefElements.slice(0, 5).map(value => safeText(value, 100)).filter(Boolean)
    : [];
  const construction = safeText(item?.symbolConstruction, 320) ||
    safeText(item?.briefAlignment, 320);
  const suppliedAnchors = Array.isArray(item?.visualAnchors)
    ? item.visualAnchors.slice(0, 5).map(anchor => ({
      id: safeText(anchor?.id, 40).toLowerCase(),
      description: safeText(anchor?.description, 120),
      relationship: safeText(anchor?.relationship, 180)
    }))
    : [];
  const visualAnchors = suppliedAnchors.length
    ? suppliedAnchors
    : briefElements.map((description, index) => ({
      id: "anchor-" + (index + 1),
      description,
      relationship: construction || "این جزء در سیلوئت اصلی نشان به‌صورت یکپارچه بازنمایی می‌شود"
    }));
  const suppliedMap = Array.isArray(item?.anchorMap)
    ? item.anchorMap.slice(0, 5).map(entry => ({
      anchorId: safeText(entry?.anchorId, 40).toLowerCase(),
      layerClass: safeText(entry?.layerClass, 64),
      visualRole: safeText(entry?.visualRole, 180)
    }))
    : [];
  const symbolForMapping = findSymbolElement(html);
  const childClasses = symbolForMapping
    ? [...new Set([...symbolForMapping.inner.matchAll(/<(?:div|span|em|i)\b[^>]*class="([^"]+)"/gi)]
      .flatMap(match => match[1].split(/\s+/))
      .filter(name => name && name !== "navi-symbol" &&
        cssRuleBodiesForClass(css, name).length > 0))]
    : [];
  const anchorMap = suppliedMap.length
    ? suppliedMap
    : visualAnchors.map((anchor, index) => ({
      anchorId: anchor.id,
      layerClass: childClasses[index] || "navi-symbol",
      visualRole: childClasses[index]
        ? "این لایه استایل‌شده جزء مشخص‌شده را در ساختار نشان می‌سازد"
        : "این جزء در سیلوئت یکپارچه و استایل‌شده نشان بازنمایی می‌شود"
    }));
  if (visualAnchors.length < 1 || visualAnchors.length > 5 ||
      visualAnchors.some(anchor => !/^[a-z][a-z0-9-]{1,31}$/.test(anchor.id) ||
        anchor.description.length < 3 || anchor.relationship.length < 8)) {
    throw validationError("LOGO_VISUAL_ANCHORS_MISSING",
      "اجزای تصویری اصلی بریف به‌صورت دقیق و قابل‌ردیابی استخراج نشده‌اند.",
      "visual-anchor-plan", conceptIndex);
  }
  if (format !== "wordmark") {
    const symbol = findSymbolElement(html);
    if (!symbol) throw validationError("LOGO_VISUAL_ANCHOR_MAP_INVALID",
      "نشان اصلی برای تطبیق اجزای بریف پیدا نشد.", "visual-anchor-map", conceptIndex);
    const ids = new Set(visualAnchors.map(anchor => anchor.id));
    const mapped = new Set();
    for (const entry of anchorMap) {
      if (!ids.has(entry.anchorId) || mapped.has(entry.anchorId) ||
          !/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(entry.layerClass) ||
          entry.visualRole.length < 8) continue;
      // A unified silhouette is a valid construction layer; no filler child is required.
      const isOuterSymbol = entry.layerClass === "navi-symbol";
      const classPattern = new RegExp('class="[^"]*\\b' + entry.layerClass + '\\b[^"]*"');
      const appearsInSymbol = isOuterSymbol || classPattern.test(symbol.inner);
      const selectorPattern = new RegExp("\\." + entry.layerClass + "(?=[\\s.:#\\[,{>\\{])");
      if (appearsInSymbol && selectorPattern.test(css)) mapped.add(entry.anchorId);
    }
    if (mapped.size !== visualAnchors.length) {
      const missing = visualAnchors.filter(anchor => !mapped.has(anchor.id)).map(anchor => anchor.description).join("، ");
      throw validationError("LOGO_VISUAL_ANCHOR_MAP_INVALID",
        "بخش‌هایی از ایده بریف به فرم واقعی و استایل‌شده نشان وصل نشده‌اند: " + missing + ".",
        "visual-anchor-map", conceptIndex);
    }
  }
  return { visualAnchors, anchorMap };
}
function conceptsAreNearDuplicates(left, right) {
  const rationaleDuplicate =
    textSimilarity(left.centralThesis, right.centralThesis) >= 0.76 &&
    textSimilarity(left.symbolConstruction, right.symbolConstruction) >= 0.76;
  // Compare the actual HTML/CSS symbol geometry as well as its written rationale.
  // The fingerprint deliberately excludes palette, typography and wrapper styling,
  // so recolouring or relabelling the same mark cannot pass as a new concept.
  const leftGeometry = extractSymbolDesignFingerprint(left.html, left.css);
  const rightGeometry = extractSymbolDesignFingerprint(right.html, right.css);
  const geometryDuplicate = Boolean(leftGeometry && rightGeometry) &&
    textSimilarity(leftGeometry, rightGeometry) >= 0.84;
  return rationaleDuplicate || geometryDuplicate;
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
    briefPriority: {
      mode: data.designMode,
      sourceOfTruth: data.designMode === "custom"
        ? data.designPrompt
        : (data.symbolIdea || "Brand name, industry, audience and stated constraints"),
      rule: data.designMode === "custom"
        ? "Preserve the client's central idea and every essential visual relationship. Creative freedom applies to craft and execution, not replacing the idea."
        : "Derive a brand-specific idea from the supplied business context; do not use unrelated generic imagery."
    },
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    // Stage 1: turn the brief into a concrete visual construction blueprint
    // before asking the model to write any HTML or CSS.
    const planningSystem = [
      "You are NAVI's senior identity concept architect. This is a design-planning stage, NOT a logo drawing stage.",
      "For each concept define title, rationale, metaphor, meaningChain, centralThesis, briefElements, symbolConstruction, briefAlignment, silhouette, objectCues, spatialRelationship, negativeSpace, geometryRecipe, firstRead, recognitionRisk, signatureFeature and mustAvoid. firstRead must name the exact concrete visual reading, not a vague category or poetic phrase.",
      "For every named object identify at least two diagnostic visual cues that make it recognizable without its label. For a combined idea, define one integrated shape relationship; never propose unrelated icons side by side, generic bars, random dots or a decorative badge. Reject generic construction recipes such as a plain dome with parallel bars, a blob with a line, or a circle with a dot. Specify one distinctive signature feature that makes this exact mark ownable and state the likely wrong first reading that the geometry must prevent.",
      "Describe the outer silhouette precisely, including contour, proportions, major masses, cut-outs, overlap and negative space. geometryRecipe must be a practical construction sequence for visible HTML/CSS layers or one unified shape. State which visual part carries each brief element. Also specify a concept-specific finish direction: materialDirection and finishLayers (2–4 concrete HTML/CSS treatments such as tonal depth, edge highlight, controlled gradient, contact shadow, layered surface or restrained light falloff). These finishing choices must reinforce the metaphor and remain subordinate to recognition; do not default to the same material or effects for every brand.",
      "GEOMETRY BLUEPRINT CONTRACT: Every concept MUST include geometrySpec.layers, an explicit coordinate-based composition for the renderer. Create 4–8 layers per concept. Each layer has shape (ellipse, rounded-rect, capsule, diamond, polygon), x and y center (0–100), width and height (5–100), rotation (-180–180), tone (primary, secondary, accent, light, dark, paper), finish (none, soft, metal), and for polygon only 3–8 points as [x,y] pairs. Coordinates use a 100×100 artboard. Plan actual object anatomy: primary mass, secondary object parts, overlaps, cut-outs/negative-space relationships and distinctive integrated interactions. Layer positions and proportions must make the requested object recognizable without relying on labels. Do not draw generic abstract arrangements of circles and bars. Each concept must have its own independently authored geometrySpec; never reuse one template or merely change colors. The HTML/CSS renderer will use only these primitives, so geometrySpec is the actual design, not a descriptive note.",
      "GEOMETRY DIFFERENTIATION: the three routes must use different silhouettes, component counts or spatial relationships. A book-and-pen concept, for example, must physically connect the pen to the book gutter with recognizable pen shaft and nib geometry; do not represent it as a detached line or sunbeam. Make the shape relationships coherent and optically balanced. Use 4–8 layers with a clear hierarchy; no filler layers.",
      "SEMANTIC FIDELITY: do not translate abstract words mechanically. Words such as new, bright, inspired, growth or voice are not automatic instructions to add rays, stars, leaves, bars or sound waves. First infer what the brand is trying to say, then choose a concrete metaphor, object, action or spatial relationship that communicates it. Prefer a meaningful object interaction over a generic decorative effect. If the client names a concrete object or relationship (for example a pen emerging from a book gutter, or a page turning backward behind the book), preserve that exact visual idea and explain why it expresses the brand. The meaningChain must explicitly connect brand meaning -> chosen metaphor/action -> visible form. Do not claim an object is present unless its diagnostic silhouette and at least two recognizable cues are specified in objectCues and geometryRecipe. Distinguish the three concepts by their core metaphor or meaningful construction, not only by color, material or ornament.",
      "CUSTOM BRIEF: preserve exact named objects, requested letterforms and relationships. Creative freedom is limited to professional execution, not replacing the idea. NAVI BRIEF: derive a distinctive idea from brand, industry, audience and personality.",
      "Create exactly " + conceptCount + " distinct construction routes. In custom mode all routes must express the same requested core idea but use genuinely different geometry. Do not vary only color, layout or decoration. For each route, specify a unique, metaphor-driven materialDirection and at least two meaningful finishLayers; avoid defaulting every route to the same flat icon style.",
      "PREMIUM FINISH CONTRACT: the NAVA HTML/CSS lab is a craft benchmark only. Match its level of bespoke geometry, material depth, lighting control, optical precision and completed wordmark lockup—not its specific visual language. Follow each blueprint's materialDirection and finishLayers. For every symbol, deliver a deliberate primary silhouette plus concept-relevant secondary surfaces and finishing details where they add material realism or hierarchy. Do not submit a bare flat pictogram merely because it passes semantic recognition. Use gradients, layered backgrounds, highlights, soft shadows, subtle bevel-like edges and controlled light falloff selectively and coherently. The silhouette must still work in one colour and at small size. Never copy the NAVA N mark, orbit rings, badge, palette or composition, and never force its gold/navy/cyan colors or glow onto another identity.",
      "Before any geometry is planned, write a real NAVI creative brief. Return exactly this JSON shape: {\"brandCore\":\"...\",\"designIdea\":\"یک جمله روشن فارسی درباره ایده اختصاصی برند\",\"strategy\":\"خلاصه جهت‌گیری طراحی\",\"designBriefEnglish\":\"A concise professional art-direction brief: exact brand meaning, audience, core visual metaphor, concrete recognizable subject, required visual relationships, tone, and design constraints. This brief must be actionable by the HTML/CSS builder.\",\"concepts\":[{\"title\":\"...\",\"rationale\":\"توضیح روشن و اختصاصی این مسیر\",\"metaphor\":\"استعاره بصری مشخص\",\"meaningChain\":\"معنای برند به استعاره و سپس به فرم قابل مشاهده وصل می‌شود\",\"centralThesis\":\"...\",\"briefElements\":[\"...\"],\"symbolConstruction\":\"...\",\"briefAlignment\":\"...\",\"silhouette\":\"...\",\"objectCues\":[\"...\",\"...\"],\"spatialRelationship\":\"...\",\"negativeSpace\":\"...\",\"geometryRecipe\":\"...\",\"firstRead\":\"...\",\"recognitionRisk\":\"...\",\"signatureFeature\":\"...\",\"materialDirection\":\"...\",\"geometrySpec\":{\"layers\":[{\"shape\":\"polygon\",\"x\":50,\"y\":50,\"width\":60,\"height\":70,\"rotation\":0,\"tone\":\"primary\",\"finish\":\"soft\",\"points\":[[10,10],[90,10],[100,90],[0,90]]}]},\"finishLayers\":[\"...\",\"...\"] ,\"mustAvoid\":[\"...\"]}]}. The concepts array must contain exactly " + conceptCount + " objects. The creative brief and designIdea are mandatory and must be completed BEFORE HTML/CSS construction. Do not rename the concepts key or wrap the JSON in another object.",
      "Do not write HTML, CSS, SVG, markup, paths or code. Do not expose chain-of-thought. Return concise final design decisions only as valid JSON."
    ].join("\n");
    const planningResponse = await fetchGeminiWithRetry(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: planningSystem }] },
          contents: [{ role: "user", parts: [{ text: "Create exactly " + conceptCount + " visual construction blueprint(s) from this client brief. Return only the requested JSON.\n" + JSON.stringify(userBrief) }] }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "HIGH" },
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );
    const planningPayload = await planningResponse.json().catch(() => ({}));
    if (!planningResponse.ok) {
      const error = new Error("Gemini concept-planning HTTP " + planningResponse.status);
      error.httpStatus = planningResponse.status;
      error.diagnosticCode = planningResponse.status === 429 ? "MODEL_RATE_LIMIT" :
        planningResponse.status >= 500 ? "MODEL_SERVICE_ERROR" :
        planningResponse.status === 400 ? "MODEL_REQUEST_REJECTED" : "MODEL_API_ERROR";
      error.stage = "concept-planning";
      throw error;
    }
    if (planningPayload?.promptFeedback?.blockReason) {
      const error = new Error("Gemini blocked concept planning: " + planningPayload.promptFeedback.blockReason);
      error.diagnosticCode = "MODEL_PROMPT_BLOCKED";
      error.stage = "concept-planning";
      throw error;
    }
    const planningCandidate = planningPayload?.candidates?.[0];
    if (!planningCandidate) {
      const error = new Error("Gemini returned no candidate during concept planning.");
      error.diagnosticCode = "MODEL_EMPTY_RESPONSE";
      error.stage = "concept-planning";
      throw error;
    }
    const planningFinish = String(planningCandidate.finishReason || "");
    if (planningFinish && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(planningFinish)) {
      const error = new Error("Gemini did not complete concept planning: " + (planningFinish || "EMPTY"));
      error.diagnosticCode = planningFinish === "MAX_TOKENS" ? "MODEL_OUTPUT_TRUNCATED" : "MODEL_PLANNING_INCOMPLETE";
      error.stage = "concept-planning";
      throw error;
    }
    const planningRaw = (planningCandidate.content?.parts || []).map(part => part.text || "").join("");
    let blueprint;
    try {
      blueprint = extractJsonObject(planningRaw);
    } catch {
      const error = new Error("Gemini concept-planning response was not valid JSON.");
      error.diagnosticCode = "MODEL_PLANNING_INVALID_JSON";
      error.stage = "concept-planning";
      throw error;
    }
    const naviCreativeBrief = {
      brandCore: safeText(blueprint?.brandCore, 300),
      designIdea: safeText(blueprint?.designIdea, 320),
      strategy: safeText(blueprint?.strategy, 500),
      designBriefEnglish: safeText(blueprint?.designBriefEnglish, 2200)
    };
    if (!naviCreativeBrief.brandCore || !naviCreativeBrief.designIdea ||
        !naviCreativeBrief.strategy || !naviCreativeBrief.designBriefEnglish) {
      throw validationError("LOGO_NAVI_BRIEF_INCOMPLETE", "NAVI must finish its creative strategy and professional art-direction brief before logo construction.", "concept-planning");
    }
    const plannedConcepts = Array.isArray(blueprint?.concepts) ? blueprint.concepts :
      (Array.isArray(blueprint?.blueprints) ? blueprint.blueprints :
      (Array.isArray(blueprint?.visualBlueprints) ? blueprint.visualBlueprints : null));
    if (!plannedConcepts || plannedConcepts.length !== conceptCount) {
      throw validationError("LOGO_BLUEPRINT_COUNT", "NAVI did not return the requested number of visual construction blueprints.", "concept-planning");
    }
    const designBlueprints = plannedConcepts.map((item, index) => {
      const normalized = {
        index: index + 1,
        title: safeText(item?.title, 120),
        rationale: safeText(item?.rationale, 420),
        metaphor: safeText(item?.metaphor, 320),
        meaningChain: safeText(item?.meaningChain, 500),
        centralThesis: safeText(item?.centralThesis, 500),
        briefElements: Array.isArray(item?.briefElements) ? item.briefElements.slice(0, 6).map(value => safeText(value, 180)).filter(Boolean) : [],
        symbolConstruction: safeText(item?.symbolConstruction, 700),
        briefAlignment: safeText(item?.briefAlignment, 500),
        silhouette: safeText(item?.silhouette, 700),
        objectCues: Array.isArray(item?.objectCues) ? item.objectCues.slice(0, 6).map(value => safeText(value, 180)).filter(Boolean) : [],
        spatialRelationship: safeText(item?.spatialRelationship, 500),
        negativeSpace: safeText(item?.negativeSpace, 500),
        geometryRecipe: safeText(item?.geometryRecipe, 900),
        firstRead: safeText(item?.firstRead, 400),
        recognitionRisk: safeText(item?.recognitionRisk, 400),
        signatureFeature: safeText(item?.signatureFeature, 400),
        materialDirection: safeText(item?.materialDirection, 240) || "A concept-specific finish that supports the symbol's material and meaning without obscuring its silhouette.",
        finishLayers: Array.isArray(item?.finishLayers) ? item.finishLayers.slice(0, 4).map(value => safeText(value, 180)).filter(Boolean) : ["controlled tonal depth", "refined edge lighting and contact shadow"],
        geometrySpec: {
          layers: Array.isArray(item?.geometrySpec?.layers) ? item.geometrySpec.layers.slice(0, 8).map(layer => ({
            shape: safeText(layer?.shape, 24),
            x: Number(layer?.x), y: Number(layer?.y),
            width: Number(layer?.width), height: Number(layer?.height),
            rotation: Number(layer?.rotation || 0),
            tone: safeText(layer?.tone, 24),
            finish: safeText(layer?.finish || "soft", 24),
            points: Array.isArray(layer?.points) ? layer.points.slice(0, 8).map(point =>
              Array.isArray(point) ? [Number(point[0]), Number(point[1])] : []
            ) : []
          })) : []
        },
        mustAvoid: Array.isArray(item?.mustAvoid) ? item.mustAvoid.slice(0, 8).map(value => safeText(value, 120)).filter(Boolean) : []
      };
      if (!normalized.centralThesis || !normalized.symbolConstruction || !normalized.briefAlignment || !normalized.briefElements.length || !normalized.silhouette || normalized.objectCues.length < 2 || !normalized.spatialRelationship || !normalized.negativeSpace || !normalized.geometryRecipe || !normalized.firstRead || !normalized.recognitionRisk || !normalized.signatureFeature || (data.format !== "wordmark" && normalized.geometrySpec.layers.length < 4)) {
        throw validationError("LOGO_BLUEPRINT_INCOMPLETE", "نقشه ساخت بصری باید سیلوئت، نشانه‌های تشخیصی، رابطه فضایی، فضای منفی، ویژگی امضادار، ریسک برداشت اشتباه و دستور ساخت دقیق داشته باشد.", "concept-planning", index + 1);
      }
      return normalized;
    });
    // Each approved blueprint contains the actual coordinate-based geometry.
    // The constrained renderer builds native HTML/CSS primitives without fixed family templates or model-authored markup.
    const structuredBuild = buildStructuredLogoConcepts(data, designBlueprints);
    const plan = {
      strategy: naviCreativeBrief.strategy,
      concepts: structuredBuild.concepts
    };
    const designBriefEnglish = naviCreativeBrief.designBriefEnglish;
    const concepts = [];
    const rejectedConcepts = [];
    plan.concepts.forEach((item, index) => {
      try {
      let html;
      let css;
      try {
        const rawHtml = String(item?.html || "");
        if (/<\s*\/?\s*(?:svg|path|circle|ellipse|rect|polygon|polyline|line|defs|g|use|symbol|mask|clipPath|linearGradient|radialGradient|stop|foreignObject)\b/i.test(rawHtml)) {
          throw validationError("LOGO_SVG_SOURCE_FORBIDDEN", "NAVI returned SVG-based artwork. The concept was rejected instead of silently stripping its artwork; regenerate using native HTML/CSS geometry only.", "svg-source", index + 1);
        }
        html = sanitizeHtmlFragment(rawHtml);
      } catch (error) {
        if (error?.diagnosticCode) throw error;
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
      if (data.format !== "wordmark") validateSymbolStructure(finalHtml, css, index + 1);
      const traceability = validateConceptTraceability(item, index + 1);
      const anchorContract = validateVisualAnchorMap(finalHtml, css, item, index + 1, data.format);
      const brandFallbackCss = '.navi-brand-lockup{display:flex;justify-content:center;align-items:center;width:100%;margin-top:28px;padding:12px 8px;text-align:center;color:var(--logo-primary);font-family:inherit;font-size:clamp(36px,8vw,76px);font-weight:900;line-height:1.25;direction:auto;unicode-bidi:plaintext}';
      const sloganFallbackCss = '.navi-slogan-lockup{display:flex;justify-content:center;align-items:center;width:100%;margin-top:10px;padding:4px 8px;text-align:center;color:var(--logo-primary);font-family:inherit;font-size:clamp(16px,3vw,26px);font-weight:500;line-height:1.5;direction:auto;unicode-bidi:plaintext;opacity:.88}';
      const finalCss = css +
        (needsBrandFallback && html.includes('class="navi-brand-lockup"') ? "\n" + brandFallbackCss : "") +
        (needsSloganFallback && html.includes('class="navi-slogan-lockup"') ? "\n" + sloganFallbackCss : "");
      const visualElementCount = (html.match(/<\s*(?:div|span|p|strong|em|b|i|small|br)\b/gi) || []).length;
      const cssRuleCount = (css.match(/[^{}]+\{[^{}]*\}/g) || []).length;
      // Do not grade design quality by counting CSS effects. Technique quotas
      // encouraged unrelated strokes, borders and layers just to reach a score.
      // Structural geometry and the filled-silhouette check are the quality gate.
      const minimumCssRules = 2;
      if (cssRuleCount < minimumCssRules) {
        throw validationError("LOGO_CSS_INCOMPLETE", "ساختار CSS لوگو ناقص است.", "composition-completeness", index + 1);
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
        ...anchorContract,
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
        if (["LOGO_HTML_UNSAFE", "LOGO_CSS_UNSAFE", "LOGO_SVG_SOURCE_FORBIDDEN"].includes(error?.diagnosticCode)) throw error;
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
      brandCore: naviCreativeBrief.brandCore,
      designIdea: naviCreativeBrief.designIdea,
      strategy: naviCreativeBrief.strategy,
      designBriefEnglish,
      visualBlueprints: designBlueprints,
      concepts,
      rejectedConcepts
    };
  } finally {
    clearTimeout(timer);
  }
}


async function createLogoReviewToken(secret, brandName) {
  if (!secret || !globalThis.crypto?.subtle) return "";
  const timestamp = String(Date.now());
  const message = timestamp + "." + brandName;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  const encoded = btoa(String.fromCharCode(...signature)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return timestamp + "." + encoded;
}

async function verifyLogoReviewToken(secret, brandName, token) {
  if (!secret || !globalThis.crypto?.subtle || typeof token !== "string") return false;
  const [timestamp, encoded, extra] = token.split(".");
  const issuedAt = Number(timestamp);
  if (!timestamp || !encoded || extra || !Number.isFinite(issuedAt) ||
      issuedAt > Date.now() + 30000 || Date.now() - issuedAt > 5 * 60 * 1000) return false;
  try {
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const signature = Uint8Array.from(atob(paddedBase64), character => character.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      "HMAC", key, signature, new TextEncoder().encode(timestamp + "." + brandName)
    );
  } catch {
    return false;
  }
}

function extractSymbolDesignFingerprint(html, css) {
  const sourceHtml = String(html || "");
  const opening = /<div\b[^>]*class="[^"]*\bnavi-symbol\b[^"]*"[^>]*>/i.exec(sourceHtml);
  if (!opening) return "";
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = opening.index;
  let depth = 0;
  let end = -1;
  let match;
  while ((match = tags.exec(sourceHtml)) !== null) {
    if (/^<\//.test(match[0])) depth -= 1;
    else if (!/\/\s*>$/.test(match[0])) depth += 1;
    if (depth === 0) { end = tags.lastIndex; break; }
  }
  if (end < 0) return "";
  const symbolMarkup = sourceHtml.slice(opening.index, end);
  const classes = new Set(["navi-symbol"]);
  for (const classMatch of symbolMarkup.matchAll(/class="([^"]+)"/g)) {
    for (const name of classMatch[1].split(/\s+/)) {
      if (/^[a-zA-Z_][\w-]*$/.test(name)) classes.add(name);
    }
  }
  const geometryProperties = new Set([
    "width", "height", "min-width", "min-height", "max-width", "max-height",
    "aspect-ratio", "display", "position", "inset", "inset-block", "inset-inline",
    "top", "right", "bottom", "left", "margin", "padding", "gap", "row-gap", "column-gap",
    "grid-template-columns", "grid-template-rows", "grid-area", "place-items", "align-items",
    "justify-items", "flex", "flex-direction", "align-self", "justify-self", "z-index",
    "border", "border-width", "border-style", "border-radius", "clip-path", "transform",
    "transform-origin", "overflow", "box-shadow", "background", "background-image",
    "mask", "mask-image"
  ]);
  const rules = [];
  for (const rule of String(css || "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1].trim();
    const relevant = [...classes].some(name =>
      new RegExp("(?:^|[\\s>+~,.])\\." + name + "(?=[\\s.#:[>+~,.]|$)").test(selector));
    if (!relevant) continue;
    const declarations = [];
    for (const declaration of rule[2].split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 1) continue;
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const value = declaration.slice(colon + 1).trim().replace(/\s+/g, " ");
      if (geometryProperties.has(property) && value) declarations.push(property + ":" + value);
    }
    if (declarations.length) rules.push(selector + "{" + declarations.sort().join(";") + "}");
  }
  return symbolMarkup.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim() + "\n" + rules.sort().join("\n");
}

function hasMaterialSymbolRevision(originalHtml, originalCss, revisedHtml, revisedCss) {
  const before = extractSymbolDesignFingerprint(originalHtml, originalCss);
  const after = extractSymbolDesignFingerprint(revisedHtml, revisedCss);
  return Boolean(before && after && before !== after);
}

async function refineLogoConcepts(data, conceptsInput, apiKey, revisionAttempt = 1) {
  if (!apiKey) throw new Error("NAVI design service is not configured.");
  if (!Array.isArray(conceptsInput) || conceptsInput.length < 1 || conceptsInput.length > 3) {
    throw validationError("LOGO_REVIEW_INPUT_INVALID", "Visual review requires one to three rendered concepts.", "visual-review-input");
  }
  const concepts = conceptsInput.map((item, index) => {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(item?.previewImage || ""));
    if (!match || match[1].length > 850000) {
      throw validationError("LOGO_REVIEW_IMAGE_INVALID", "A rendered concept preview is missing or too large.", "visual-review-image", index + 1);
    }
    if (String(item?.html || "").length > 10000 || String(item?.css || "").length > 16000) {
      throw validationError("LOGO_REVIEW_SOURCE_TOO_LARGE", "A logo concept source exceeds the review limit.", "visual-review-source", index + 1);
    }
    return { source: item, image: match[1] };
  });
  const userBrief = {
    brandName: data.brandName,
    designMode: data.designMode,
    designPrompt: data.designPrompt,
    slogan: data.slogan,
    industry: data.industry,
    audience: data.audience,
    symbolIdea: data.symbolIdea,
    format: data.format,
    typography: data.typography,
    personality: data.personality,
    palette: { primary: data.primaryColor, background: data.darkColor, name: data.palette }
  };
  const system = [
    "You are NAVI VISUAL ART DIRECTOR performing a real render-review-revision pass.",
    "QUALITY IS NOT A VALIDATION EXERCISE: do not approve a merely valid CSS shape. The mark must be immediately recognizable and meaningful when seen alone, with all labels and rationale mentally hidden. Use the NAVA identity as a craft benchmark for bespoke geometry, purposeful layered construction, material-aware finish and a resolved wordmark lockup—but never copy its N monogram, orbit rings, badge, colors or composition. The target is the same level of design authorship, not the same visual style.",
    "TWO-PASS SEMANTIC AUDIT — do not let the brief tell you what the image means. PASS 1: inspect only the symbol area of the attached PNG; deliberately ignore the brand name, slogan, title, blueprint, HTML/CSS and all explanations. Record unaidedRead as the concrete thing or relationship an ordinary viewer would identify first, and likelyMisread as the most plausible different interpretation. PASS 2: only after writing those two observations, compare them with the original brief. If unaidedRead does not independently match the requested subject, recognition fails even if the rationale or brand name makes the intention obvious. Do not award recognition for polished but ambiguous geometry.", 
    "CONCRETE OBJECT EVIDENCE: list at least two visible diagnostic cues in semanticEvidence that prove the requested object is actually drawn, not merely suggested by an abstract arrangement. A book must visibly read as a book: use unmistakable paired page leaves/open spread meeting at a central spine or gutter, and/or a clearly constructed book block with a defined cover and page edges. A few overlapping rounded rectangles, floating sheets, cards, tiles or generic folded polygons are NOT a recognizable book. For a bookstore/library identity, the symbol must still read as a book at thumbnail size without relying on the wordmark. Apply equivalent object-specific diagnostic evidence to every other concrete subject in the brief; do not reuse the book example as a template.",
    "BLIND-READ ACCEPTANCE: if likelyMisread describes a more immediate reading than the requested subject (for example cards, stacked tiles, abstract geometric layers for a book brief), recognitionScore must be below 8 and the symbol must be structurally redesigned. Do not explain away a wrong first reading. A generic dome with parallel bars, an unrelated dot, or any arrangement of generic primitives is an automatic failure for a bread-and-music brief. Verify the blueprint signatureFeature is visibly present and that recognitionRisk has been geometrically resolved. Redesign the silhouette until its first read matches the brief.",
    "SCORE THE ACTUAL IMAGE, NOT YOUR INTENTION: return integer scores from 1 to 10 for recognitionScore, briefFidelityScore and craftScore. Recognition means the symbol can be identified without its title or explanation; brief fidelity means the visible geometry expresses the exact requested idea; craft means professional silhouette, proportions, negative space and optical balance. Be strict and do not inflate scores.",
    "HARD ACCEPTANCE GATE: all three scores must be at least 8/10. If any score is below 8, continue redesigning before returning. Never report a high score merely because the HTML/CSS is valid.",
    revisionAttempt >= 2
      ? "SECOND ATTEMPT: the previous visual review failed. Do not preserve the weak silhouette. Rebuild the central mark decisively from the brief's recognizable diagnostic cues; replace ambiguous geometry rather than polishing it. The output must be visibly and semantically stronger."
      : "FIRST REVIEW: prioritize the largest semantic-recognition failure before styling.",
    "You are given the actual browser-rendered PNG preview for each concept, its HTML/CSS source, and the original client brief. Inspect the image itself. Do not merely repeat the rationale or validate that classes exist.",
    "For each concept diagnose visible problems in silhouette, object recognition, spatial relationships, overlap/occlusion, hierarchy, balance, scale, depth, lighting, material, typography and fidelity to the exact brief. Then revise the HTML and CSS so the rendered result visibly fixes those problems.",
    "The original client brief is the source of truth. Preserve its subject, required objects, exact spatial relationships, brand name and supplied slogan. Never replace the core idea with a generic icon or a different metaphor.",
    "For front/behind/emerging/partially hidden relationships, implement real CSS positioning, stacking and overlap. A relationship is not fixed by adding explanatory text or adjacent shapes.",
    "NON-NEGOTIABLE REVISION STANDARD: a successful revision must materially change the visible .navi-symbol construction, not just its wrapper, color, typography, shadow, scale or decorative effects. Change the actual silhouette, cut-out, contour, proportions, placement, overlap, or geometry of a meaningful symbol layer. Make the smallest set of high-impact changes that fixes the biggest visible mismatch with the original brief. If the current mark is merely an abstract approximation of a named object, replace that approximation with a recognizable constructed silhouette. Preserve the requested idea, but do not preserve a weak arrangement just because it already exists. In visualRevisionNotes name the exact shape/geometry changed and why it better expresses a specific brief anchor. A revision that only changes presentation styling will be rejected; do not claim an improvement without a visible structural correction.",
    "Improve the actual graphic design, not just the code structure: custom silhouette, deliberate geometry, considered negative space, intentional proportions, optical alignment and purposeful layered construction. Avoid arbitrary extra ornaments, generic rings, random diagonal strokes and default badges.",
    "Keep the existing .navi-symbol wrapper and every class referenced by anchorMap so the verified visual anchors remain attached to real layers. You may redesign their geometry and add nested HTML/CSS layers.",
    "Keep all text exactly as supplied. Preserve data-logo-role=brand and data-logo-role=slogan. Persian/Arabic must remain real HTML text with direction:rtl, unicode-bidi:plaintext and suitable font fallbacks.",
    "Return a single valid JSON object with a concepts array in the same order. Each item must contain index (1-based), html, css, visualRevisionNotes (short Persian explanation of concrete visible changes), unaidedRead (exact first interpretation from symbol-only inspection before consulting the brief), likelyMisread (most plausible competing interpretation), semanticEvidence (array of at least two visible diagnostic cues), firstRead (what a viewer identifies without explanation), recognitionScore (integer 1-10), briefFidelityScore (integer 1-10) and craftScore (integer 1-10). Do not return SVG, images, scripts, markdown or chain-of-thought. HTML must use only the already-supported safe tags and CSS must use the existing safe CSS subset."
  ].join("\n");
  const parts = [{
    text: "Review the actual rendered images and revise every concept. The brief is binding:\n" +
      JSON.stringify(userBrief) + "\nFor each concept, inspect its attached PNG first, then its source and anchor map. Preserve each concept's core thesis but materially improve visible design quality.\n"
  }];
  concepts.forEach(({ source, image }, index) => {
    parts.push({ text: "CONCEPT " + (index + 1) + "\n" + JSON.stringify({
      title: source.title,
      centralThesis: source.centralThesis,
      symbolConstruction: source.symbolConstruction,
      briefAlignment: source.briefAlignment,
      briefElements: source.briefElements,
      visualAnchors: source.visualAnchors,
      anchorMap: source.anchorMap,
      html: source.html,
      css: source.css
    }) + "\nActual browser-rendered preview image follows." });
    parts.push({ inlineData: { mimeType: "image/png", data: image } });
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetchGeminiWithRetry(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "HIGH" },
            maxOutputTokens: 32768,
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Gemini visual review HTTP " + response.status);
      error.httpStatus = response.status;
      error.diagnosticCode = response.status === 429 ? "MODEL_RATE_LIMIT" :
        response.status >= 500 ? "MODEL_SERVICE_ERROR" :
        response.status === 400 ? "MODEL_REQUEST_REJECTED" : "MODEL_API_ERROR";
      throw error;
    }
    const candidate = payload?.candidates?.[0];
    if (!candidate) throw validationError("MODEL_EMPTY_RESPONSE", "Visual review returned no candidate.", "visual-review-model");
    if (candidate.finishReason === "MAX_TOKENS") {
      throw validationError("MODEL_OUTPUT_TRUNCATED", "Visual review output was truncated.", "visual-review-model");
    }
    const raw = (candidate.content?.parts || []).map(part => part.text || "").join("");
    const plan = extractJsonObject(raw);
    if (!Array.isArray(plan.concepts) || plan.concepts.length !== concepts.length) {
      throw validationError("LOGO_REVIEW_CONCEPT_COUNT", "Visual review did not return every concept.", "visual-review-count");
    }
    let refinedCount = 0;
    const refined = concepts.map(({ source }, index) => {
      const candidateConcept = plan.concepts[index] || {};
      try {
        let html = sanitizeHtmlFragment(candidateConcept.html);
        const css = sanitizeCss(candidateConcept.css);
        const visibleText = html.replace(/<[^>]*>/g, "");
        const brandText = escapeHtml(data.brandName);
        const sloganText = escapeHtml(data.slogan);
        if (!visibleText.includes(brandText) || !html.includes('data-logo-role="brand"')) {
          throw validationError("LOGO_REVIEW_BRAND_MISSING", "Visual refinement removed the exact brand wordmark.", "visual-review-brand", index + 1);
        }
        if (data.slogan && (!visibleText.includes(sloganText) || !html.includes('data-logo-role="slogan"'))) {
          throw validationError("LOGO_REVIEW_SLOGAN_MISSING", "Visual refinement removed the exact slogan.", "visual-review-slogan", index + 1);
        }
        if (data.format !== "wordmark") validateSymbolStructure(html, css, index + 1);
        if (data.format !== "wordmark" && !hasMaterialSymbolRevision(source.html, source.css, html, css)) {
          throw validationError("LOGO_REVIEW_NO_MATERIAL_CHANGE", "Visual review changed presentation styling but did not materially redesign the symbol geometry.", "visual-review-materiality", index + 1);
        }
        validateConceptTraceability(source, index + 1);
        validateVisualAnchorMap(html, css, source, index + 1, data.format);
        const notes = safeText(candidateConcept.visualRevisionNotes, 360);
        const firstRead = safeText(candidateConcept.firstRead, 180);
        const unaidedRead = safeText(candidateConcept.unaidedRead, 180);
        const likelyMisread = safeText(candidateConcept.likelyMisread, 180);
        const semanticEvidence = Array.isArray(candidateConcept.semanticEvidence)
          ? candidateConcept.semanticEvidence.map(item => safeText(item, 180)).filter(Boolean).slice(0, 4)
          : [];
        const recognitionScore = Number(candidateConcept.recognitionScore);
        const briefFidelityScore = Number(candidateConcept.briefFidelityScore);
        const craftScore = Number(candidateConcept.craftScore);
        if (html.length < 20 || css.length < 40 || !notes || !firstRead || !unaidedRead ||
            !likelyMisread || semanticEvidence.length < 2 ||
            !Number.isInteger(recognitionScore) || !Number.isInteger(briefFidelityScore) ||
            !Number.isInteger(craftScore) || [recognitionScore, briefFidelityScore, craftScore].some(score => score < 1 || score > 10)) {
          throw validationError("LOGO_REVIEW_INCOMPLETE", "Visual refinement did not include a complete blind-read quality report.", "visual-review-output", index + 1);
        }
        if (recognitionScore < 8 || briefFidelityScore < 8 || craftScore < 8) {
          throw validationError("LOGO_VISUAL_QUALITY_LOW", "The rendered mark did not pass the strict recognition, brief-fidelity and craft threshold.", "visual-review-quality-gate", index + 1);
        }
        refinedCount += 1;
        return { ...source, html, css, visualRevisionNotes: notes, firstRead, unaidedRead, likelyMisread, semanticEvidence,
          visualQuality: { recognitionScore, briefFidelityScore, craftScore },
          visualReview: "refined" };
      } catch (error) {
        return {
          ...source,
          visualRevisionNotes: "این مسیر در بازبینی بصری معتبرسازی نشد؛ نسخه اولیه بدون تغییر حفظ شد.",
          visualReview: "original-preserved",
          visualReviewIssue: error?.diagnosticCode || "LOGO_REVIEW_REJECTED"
        };
      }
    });
    const rejectionReasons = refined
      .map((concept, index) => concept.visualReview === "original-preserved"
        ? { index: index + 1, code: concept.visualReviewIssue || "LOGO_REVIEW_REJECTED" }
        : null)
      .filter(Boolean);
    return { concepts: refined, refinedCount, reviewedCount: concepts.length, rejectionReasons };
  } finally {
    clearTimeout(timer);
  }
}


async function auditFinalLogoConcepts(data, conceptsInput, apiKey) {
  if (!apiKey) throw new Error("NAVI design service is not configured.");
  if (!Array.isArray(conceptsInput) || conceptsInput.length < 1 || conceptsInput.length > 3) {
    throw validationError("LOGO_FINAL_AUDIT_INPUT_INVALID", "Final visual audit requires one to three rendered concepts.", "final-visual-audit-input");
  }
  const concepts = conceptsInput.map((item, index) => {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(item?.previewImage || ""));
    if (!match || match[1].length > 850000) {
      throw validationError("LOGO_FINAL_AUDIT_IMAGE_INVALID", "A final rendered PNG is missing or too large.", "final-visual-audit-image", index + 1);
    }
    return { index: index + 1, image: match[1] };
  });
  const userBrief = {
    brandName: data.brandName,
    designMode: data.designMode,
    designPrompt: data.designPrompt,
    slogan: data.slogan,
    industry: data.industry,
    audience: data.audience,
    symbolIdea: data.symbolIdea,
    format: data.format,
    typography: data.typography,
    personality: data.personality
  };
  const system = [
    "You are an independent final logo quality auditor. You do not design, edit or rewrite code. You inspect only the final rendered PNG images supplied by the client browser.",
    "This is a RELEASE GATE, not a design-description exercise. Do not approve a weak logo because it has a convincing title, rationale or source code. A rejected mark must remain rejected.",
    "TWO STAGES IN ORDER. First inspect each image's symbol only, deliberately ignoring the brand name and any knowledge of the requested brand. Record unaidedRead as the concrete thing an ordinary unfamiliar viewer would identify first, and likelyMisread as the strongest competing interpretation. Do not infer meaning from the request. Then, and only then, compare that first reading with the client brief supplied after the images.",
    "The symbol must communicate the requested subject from its visible silhouette and defining details. If a bookstore/book brief produces a generic trapezoid, kiln, bag, container, stack of cards or abstract polygon instead of a recognizable book, it fails. A recognizable open book should show paired page leaves meeting at a central gutter/spine, or another unmistakable book construction. Apply equally strict concrete-object recognition to all other named subjects.",
    "Score the FINAL IMAGE, not the intention: recognitionScore measures unaided identification; briefFidelityScore measures visible match to the exact request; craftScore measures silhouette quality, proportion, negative space, optical balance, material finish and typography. Be conservative. Abstract/unclear first reads cannot score 8 or higher for recognition.",
    "Accept only when all three integer scores are at least 8/10 and the unaidedRead matches the brief's central requested subject. If likelyMisread is more immediate than the requested subject, recognitionScore must be below 8. Never inflate scores to make the pipeline succeed.",
    "Return one JSON object with a concepts array in the same order. Each item must contain index, unaidedRead, likelyMisread, firstRead, semanticEvidence (at least two visible cues), recognitionScore, briefFidelityScore and craftScore. No markdown, source code, SVG, images, or chain-of-thought."
  ].join("\n");
  const parts = [{
    text: "STAGE 1 — BLIND IMAGE READING. Inspect the following final rendered images before reading any client brief. For each, write the actual first visual interpretation and strongest likely misread.\n"
  }];
  concepts.forEach(({ index, image }) => {
    parts.push({ text: "FINAL RENDER " + index + " — inspect the symbol silhouette first." });
    parts.push({ inlineData: { mimeType: "image/png", data: image } });
  });
  parts.push({
    text: "STAGE 2 — CLIENT BRIEF COMPARISON. Now compare your already-recorded unaided readings with this exact client brief. Do not revise the first-read observations to fit the brief.\n" +
      JSON.stringify(userBrief) + "\nReturn the required JSON quality audit for every final render."
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetchGeminiWithRetry(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: "HIGH" },
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          }
        }),
        signal: controller.signal
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("Gemini final visual audit HTTP " + response.status);
      error.httpStatus = response.status;
      error.diagnosticCode = response.status === 429 ? "MODEL_RATE_LIMIT" :
        response.status >= 500 ? "MODEL_SERVICE_ERROR" :
        response.status === 400 ? "MODEL_REQUEST_REJECTED" : "MODEL_API_ERROR";
      throw error;
    }
    const candidate = payload?.candidates?.[0];
    if (!candidate) throw validationError("MODEL_EMPTY_RESPONSE", "Final visual audit returned no candidate.", "final-visual-audit-model");
    if (candidate.finishReason === "MAX_TOKENS") {
      throw validationError("MODEL_OUTPUT_TRUNCATED", "Final visual audit output was truncated.", "final-visual-audit-model");
    }
    const raw = (candidate.content?.parts || []).map(part => part.text || "").join("");
    const plan = extractJsonObject(raw);
    if (!Array.isArray(plan.concepts) || plan.concepts.length !== concepts.length) {
      throw validationError("LOGO_FINAL_AUDIT_COUNT", "Final visual audit did not return every rendered concept.", "final-visual-audit-count");
    }
    const audited = plan.concepts.map((item, index) => {
      const unaidedRead = safeText(item?.unaidedRead, 180);
      const likelyMisread = safeText(item?.likelyMisread, 180);
      const firstRead = safeText(item?.firstRead, 180);
      const semanticEvidence = Array.isArray(item?.semanticEvidence)
        ? item.semanticEvidence.map(value => safeText(value, 180)).filter(Boolean).slice(0, 4)
        : [];
      const scores = ["recognitionScore", "briefFidelityScore", "craftScore"].map(key => Number(item?.[key]));
      if (!unaidedRead || !likelyMisread || !firstRead || semanticEvidence.length < 2 ||
          scores.some(score => !Number.isInteger(score) || score < 1 || score > 10)) {
        throw validationError("LOGO_FINAL_AUDIT_INCOMPLETE", "Final visual audit omitted required evidence or valid scores.", "final-visual-audit-output", index + 1);
      }
      const [recognitionScore, briefFidelityScore, craftScore] = scores;
      const accepted = scores.every(score => score >= 8);
      return {
        index: index + 1,
        unaidedRead,
        likelyMisread,
        firstRead,
        semanticEvidence,
        visualQuality: { recognitionScore, briefFidelityScore, craftScore },
        visualReview: accepted ? "accepted" : "rejected",
        visualReviewIssue: accepted ? "" : "LOGO_FINAL_VISUAL_QUALITY_LOW"
      };
    });
    return {
      method: "final-render-blind-read-quality-gate",
      reviewedCount: audited.length,
      acceptedCount: audited.filter(item => item.visualReview === "accepted").length,
      rejectionReasons: audited.filter(item => item.visualReview !== "accepted")
        .map(item => ({ index: item.index, code: item.visualReviewIssue })),
      concepts: audited
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
    input = JSON.parse(raw);
    const maximumBodyLength = ["visual-refine", "visual-final-audit"].includes(input?.action) ? 3000000 : 12000;
    if (raw.length > maximumBodyLength) return fail("حجم اطلاعات درخواست بیش از حد مجاز است.", 413, corsOrigin);
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
  if (input?.action === "release-trial") {
    const reservationId = typeof input.reservationId === "string" ? input.reservationId : "";
    if (!/^[a-f0-9-]{36}$/i.test(reservationId)) {
      return fail("شناسه آزادسازی فرصت آزمایشی معتبر نیست.", 400, corsOrigin);
    }
    const released = await releaseGuestTrialReservation({ env, reservationId });
    return json({ success: true, released }, 200, corsOrigin);
  }

  if (!data.brandName) return fail("نام برند برای طراحی لازم است.", 400, corsOrigin);
  if (!data.format) return fail("ساختار لوگوی انتخاب‌شده معتبر نیست.", 400, corsOrigin);
  if (!/^#[0-9a-fA-F]{6}$/.test(data.primaryColor) || !/^#[0-9a-fA-F]{6}$/.test(data.darkColor)) {
    return fail("رنگ‌های انتخاب‌شده معتبر نیستند؛ پالت را دوباره انتخاب کن.", 400, corsOrigin);
  }


  if (input?.action === "visual-final-audit") {
    const reviewAuthorized = await verifyLogoReviewToken(
      env.NAVI_SESSION_SECRET, data.brandName, input.reviewToken
    );
    if (!reviewAuthorized) return fail("مجوز بازبینی نهایی معتبر نیست یا زمان آن پایان یافته است؛ دوباره طرح را تولید کن.", 403, corsOrigin);
    try {
      const audit = await auditFinalLogoConcepts(data, input.concepts, env.GEMINI_API_KEY);
      return json({ success: true, visualReview: audit, concepts: audit.concepts }, 200, corsOrigin);
    } catch (error) {
      const diagnosticCode = error?.diagnosticCode || (error?.name === "AbortError" ? "MODEL_TIMEOUT" : "LOGO_FINAL_AUDIT_FAILED");
      console.error("[NAVA LOGO] final visual audit failure:", JSON.stringify({
        diagnosticCode,
        httpStatus: error?.httpStatus || null,
        validationStage: error?.validationStage || null,
        conceptIndex: error?.conceptIndex || null,
        message: String(error?.message || error).slice(0, 220)
      }));
      return fail("بازبینی تصویر نهایی لوگو کامل نشد؛ برای جلوگیری از تحویل طرح تأییدنشده، خروجی نمایش داده نمی‌شود.", 502, corsOrigin, {
        code: diagnosticCode,
        retryable: ["MODEL_RATE_LIMIT", "MODEL_SERVICE_ERROR", "MODEL_TIMEOUT"].includes(diagnosticCode)
      });
    }
  }

  if (input?.action === "visual-refine") {
    const reviewAuthorized = await verifyLogoReviewToken(
      env.NAVI_SESSION_SECRET, data.brandName, input.reviewToken
    );
    if (!reviewAuthorized) return fail("مجوز بازبینی بصری معتبر نیست یا زمان آن پایان یافته است؛ دوباره طرح را تولید کن.", 403, corsOrigin);
    try {
      const review = await refineLogoConcepts(data, input.concepts, env.GEMINI_API_KEY, Number(input.revisionAttempt) === 2 ? 2 : 1);
      return json({
        success: true,
        visualReview: {
          method: "render-review-refine",
          reviewedCount: review.reviewedCount,
          refinedCount: review.refinedCount,
          rejectionReasons: review.rejectionReasons
        },
        concepts: review.concepts
      }, 200, corsOrigin);
    } catch (error) {
      const diagnosticCode = error?.diagnosticCode || (error?.name === "AbortError" ? "MODEL_TIMEOUT" : "LOGO_VISUAL_REVIEW_FAILED");
      console.error("[NAVA LOGO] visual review failure:", JSON.stringify({
        diagnosticCode,
        httpStatus: error?.httpStatus || null,
        validationStage: error?.validationStage || null,
        conceptIndex: error?.conceptIndex || null,
        message: String(error?.message || error).slice(0, 220)
      }));
      return fail("بازبینی بصری طرح‌ها کامل نشد؛ نسخه اولیه طرح‌ها حفظ می‌شود.", 502, corsOrigin, {
        code: diagnosticCode,
        retryable: ["MODEL_RATE_LIMIT", "MODEL_SERVICE_ERROR", "MODEL_TIMEOUT"].includes(diagnosticCode)
      });
    }
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
    const reviewToken = await createLogoReviewToken(env.NAVI_SESSION_SECRET, data.brandName);
    return json({
      success: true,
      brandName: data.brandName,
      reviewToken,
      reservationId: quota.reservationId || "",
      remaining: quota.remaining ?? null,
      planning: {
        method: "navi-visual-blueprint-then-structured-html-css-build",
        geometryEngine: "structured-html-css-grammar",
        geometryEngineNote: "NAVI authors the semantic blueprint, a constrained HTML/CSS engine creates the first render, and a separate image-grounded NAVI art-direction pass materially redesigns and scores the rendered mark before it can be shown.",
        brandCore: plan.brandCore,
        designIdea: plan.designIdea,
        strategy: plan.strategy,
        designBriefEnglish: plan.designBriefEnglish,
        extraModelCalls: 1,
        visualBlueprints: plan.visualBlueprints,
        note: "NAVI creates a semantic blueprint, renders a safe HTML/CSS draft, then the browser captures the real render and NAVI performs a blind visual redesign pass before any concept is shown."
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
      errorName: String(error?.name || "Error").slice(0, 80),
      httpStatus: error?.httpStatus || null,
      finishReason: error?.finishReason || null,
      outputLength: error?.outputLength || null,
      validationStage: error?.validationStage || error?.stage || "unclassified-design-pipeline",
      conceptIndex: error?.conceptIndex || null,
      message: String(error?.message || error).slice(0, 320),
      stack: String(error?.stack || "").slice(0, 1800)
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
      stage: error?.validationStage || error?.stage || "unclassified-design-pipeline",
      conceptIndex: error?.conceptIndex || null,
      retryable: ["MODEL_TIMEOUT", "MODEL_RATE_LIMIT", "MODEL_SERVICE_ERROR", "MODEL_EMPTY_RESPONSE"].includes(diagnosticCode)
    });
  }
}
