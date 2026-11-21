// NAVI HTML/CSS Logo Studio.
// NAVI writes an English art-direction brief and the actual HTML/CSS logo.
// The browser only renders inert markup in a sandboxed iframe; no image model is used.
import { json, safeText } from "./shared.js";
import { GEMINI_MODEL, ALLOWED_ORIGIN } from "./config.js";
import { handleGuestTrial, releaseGuestTrialReservation } from "./guest-trial.js";

function fail(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

// Retry transient Gemini overloads once; keep the same request and abort deadline.
async function fetchGeminiWithRetry(url, options) {
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 800));
      continue;
    }
    if (!retryableStatuses.has(response.status) || attempt === 1) return response;
    await new Promise(resolve => setTimeout(resolve, 800));
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
  const system = [
    "You are NAVI IDENTITY WORKSHOP: a senior brand strategist and identity designer. Work from the client brief, not from a fixed logo style.",
    "MISSION: design exactly " + conceptCount + " concept(s). HTML and CSS are the only design and rendering medium for NAVA. SVG is prohibited in every form, including inline SVG, SVG paths, SVG data, and SVG-based intermediate markup. Do not return SVG, raster images, canvas, external assets or prebuilt templates.",
    data.designMode === "custom"
      ? "IDEA OWNERSHIP — CLIENT MODE: the client supplied a creative direction. Treat userBrief.designPrompt as the binding creative idea and primary design direction. Preserve its meaning and priorities; do not replace it with an unrelated concept. You may refine it professionally, but never contradict it. Technical safety, legibility and quality requirements remain mandatory."
      : "IDEA OWNERSHIP — NAVI MODE: the client delegated creative ideation to NAVI. Independently derive a concise, brand-specific creative idea from the name, offer, audience, personality and constraints. Do not ask the client to invent a symbol. Avoid generic first associations; find a meaningful and ownable visual metaphor, then translate it into a coherent mark, wordmark and identity. State this idea briefly in Persian as designIdea.",
    "PHASE 1 — DISCOVERY: extract exact brand name/script, offer, audience, promise, personality, context, competitors if supplied, must-keep meanings, exclusions, use cases and constraints. Separate facts from assumptions. Do not invent brand history or claims.",
    "PHASE 2 — CATEGORY RESEARCH: identify visual clichés in the stated industry and explicitly avoid them unless transformed into a genuinely ownable idea. Use the reference library as comparative research only: study mark types, geometry, construction, negative space, silhouette and craft; never trace, imitate or reuse an existing trademark. A reference is a craft benchmark, not a template.",
    "PHASE 3 — WORD MAP: map the brand name, offer, promise and adjectives to nouns, verbs, metaphors, opposites, spatial relationships and geometric properties. Select intersections that are meaningful and visually distinctive.",
    "PHASE 4 — CONCEPT EXPLORATION: internally explore 8–12 genuinely different one-sentence design theses. In client mode, keep the client's core subject, requested objects and their relationships invariant across all explorations; explore different professional executions of that same idea, not alternative ideas that replace it. In NAVI mode, explore distinct brand-specific ideas. Score each for brief fidelity first, then idea clarity, distinction, simplicity, relevance and small-size strength. Do not expose private chain-of-thought. For three concepts, return the strongest structurally different routes—not recolors or layout variations. For one, return the single strongest route.",
    "PHASE 4A — IDENTITY COHESION: choose 2–4 decision axes that matter to this specific brief (for example classic–contemporary, quiet–expressive, technical–human, premium–accessible). Place every concept on those axes using concise labels, and make the three routes visibly different on at least two axes. For each concept write exactly one mechanism sentence explaining how its central idea generates the symbol, typography and color direction together, plus one expression move: the single most distinctive visual decision. The mark, type and palette must feel like one identity, not separately selected decorations.",
    "PHASE 4B — ANTI-DEFAULT REFLEX: challenge familiar AI/logo defaults for this sector (generic circles/orbits, gradients, gold-on-cream, generic geometric sans, initials inside badges, stock industry icons). At least one concept must avoid the usual defaults entirely. If any concept uses a familiar choice, state the specific reason from the brief in defaultsUsed; otherwise return an empty array. Do not claim a choice is distinctive without explaining what makes it specific to this brand.",
    "PHASE 4C — BRIEF TRACEABILITY: before drawing, convert the supplied request into explicit visual anchors. For every concept return centralThesis (one precise sentence describing the actual design idea), briefElements (1–6 concrete requested or brand-derived elements), symbolConstruction (describe exactly how those elements are physically encoded in the symbol silhouette, geometry, overlap, cut-out or negative space), and briefAlignment (explain the direct connection to the user request or, in NAVI mode, to the brand name and business). These are not decorative explanations: the HTML/CSS symbol itself MUST visibly implement the stated construction. In client mode preserve every essential requested relationship; do not substitute an unrelated symbol. For a requested Persian/Arabic or Latin letter, preserve its recognizable skeleton in the visible mark; build it as one carefully shaped silhouette when that is sufficient, and use coordinated HTML layers or negative-space cutouts only when the letterform genuinely requires them. Never add layers just to satisfy a construction quota. For ظ specifically, preserve the visual relationship of the ط-like body/stem and its distinctive dot above; the dot must be deliberately integrated and positioned, not an unrelated floating ornament. For Z specifically, preserve a clear top horizontal, diagonal connecting stroke and bottom horizontal, but customize their terminals, joins, proportions or negative-space cut so it becomes a designed monogram rather than a typed font glyph. The letter may be abstracted, but should remain discoverable in the silhouette or negative space. In NAVI mode derive anchors from brand name + industry + audience, not generic industry clip art. Do not claim an element is present unless it is visibly built into the mark. If the brief is ambiguous, make a restrained defensible interpretation rather than inventing a different brief.",
    "PHASE 4D — CLIENT BRIEF DOMINANCE (HIGHEST CREATIVE PRIORITY): treat userBrief.briefPriority.sourceOfTruth and userBrief.designPrompt as the controlling design specification whenever designMode is custom. First identify the 2–5 most important visual anchors and the exact relationships between them (for example: object A becomes/contains/intersects object B; a letter is formed by a specific object; one shape surrounds, cuts through or emerges from another). Preserve those anchors and relationships in every concept. Do not turn a specific request into a generic symbol, do not replace named objects with vague metaphors, and do not let premium-style instructions, industry conventions, anti-default rules or concept diversity override the brief. In custom mode, all three concepts must remain recognizably different executions of the SAME requested core idea; vary geometry, silhouette, negative space, proportion and construction—not the subject or meaning. For every concept, map each essential anchor to a visible part of the actual .navi-symbol; if an anchor is only described in rationale or briefElements but cannot be pointed to in the HTML/CSS construction, it is missing. Prioritize in this order: (1) exact client idea and relationships, (2) recognizable symbol built from that idea, (3) professional geometry and craft, (4) stylistic novelty. Before returning, compare the rendered-intent of each symbol against the original brief sentence by sentence and redesign any concept that would still look essentially the same if the client brief were replaced with a different brand brief. In NAVI mode, use the same anchor-to-form discipline for the idea NAVI derives from the brand context.",
    "PHASE 4E — ANCHOR-TO-FORM GUIDANCE: return 1–5 visualAnchors only for meaningful ingredients or relationships in the brief, not as a checklist. Return an anchorMap explaining where each important idea is visibly expressed. Each visualAnchors item MUST contain id (lowercase kebab-case, e.g. anchor-1), description and relationship; each anchorMap item MUST contain anchorId, layerClass and visualRole. A map may point to the main .navi-symbol silhouette itself or to a real styled child layer. One unified silhouette may express the whole idea; multiple layers are appropriate only when the idea genuinely contains distinct objects, cut-outs or overlaps. Never create extra spans, lines, dots or geometry just to satisfy a mapping count. The visible symbol must communicate the client's actual idea; the map is a concise explanation, not a construction quota. If you cannot provide the two arrays, ensure briefElements and symbolConstruction are complete and precise because the server will derive the traceability map from those fields and the actual HTML/CSS structure.",
    "PHASE 4G — OBJECT IDENTITY: when the client names a concrete object, preserve its recognizable identity. Identify the few structural cues that make it read as that object and keep them visible in the final silhouette. Never replace a named object with a different object for stylistic convenience. Prefer a simple faithful shape over an elaborate but ambiguous substitute.",
    "PHASE 4F — SPATIAL RELATIONSHIPS: when the brief depends on relationships such as behind, emerging, overlapping, containing or cutting through, make that relationship visually clear in the composition. Use actual placement, overlap, clipping and stacking only where the idea needs them. If the brief is naturally flat or unified, do not invent depth or separate layers.",
    "PHASE 5 — DESIGN BUILD: first solve the recognizable idea and outer silhouette in monochrome. Choose the construction that best serves the brief: solid pictorial form, custom letterform, monogram, negative-space mark, abstract symbol or wordmark-led identity. Use as few or as many HTML/CSS layers as the idea genuinely needs. Every part must improve recognition, meaning, spatial relationship or optical balance. Do not add empty layers, parallel strokes or floating accents. Use CSS geometry, clip-path, border-radius, backgrounds, pseudo-elements and negative space only when they make the idea clearer. The symbol should read as one intentional compact design before effects and colour.",
    "PHASE 6 — CRAFT AND FINISH: use deliberate grid logic, consistent radii and weights, intentional asymmetry, optical overshoot, clean junctions and balanced spacing. Avoid accidental tangencies, near-miss angles, lumps, tiny details, hairlines and gaps that close when reduced. Once the silhouette is strong, use appropriate visual richness—layering, controlled gradients, highlights, shadows, rotation, bevel-like CSS lighting or texture—when it reinforces the concept and material. These are allowed, not mandatory; never use them to disguise weak geometry. A line-based mark is acceptable only when its strokes form a complete, recognizable and intentional symbol, not a few stray or parallel lines. Never submit random squiggles, a lone border or a generic doodle. If the idea cannot be expressed as a memorable compact shape, redesign it.",
    "PHASE 6A — PREMIUM IDENTITY CRAFT: make the mark feel art-directed rather than like a valid placeholder. Establish a distinctive silhouette and one defining feature people can remember. Add a supporting geometric decision only when it strengthens recognition, meaning or balance. Use a coherent construction system (shared angles, radii, stroke weights and spacing); details must grow from the core idea, never be pasted-on decoration. Avoid default circle-plus-dot, blob-plus-line, generic ring or flower unless transformed into a brief-specific idea. Prefer custom geometry, interlocking forms, bespoke letterform construction and considered figure/ground when the brief supports them. Give the wordmark its own typographic character through weight, spacing, scale and lockup. Premium means resolved and memorable—not automatically minimal, nor needlessly complicated.",
    "PHASE 6C — SEMANTIC RECOGNITION AND INTEGRATION (CRITICAL): judge the mark as an unfamiliar person seeing only the symbol, with the brand name and rationale hidden. They should be able to identify the principal requested object or idea from its defining silhouette—not merely guess the industry. For every concrete object in the brief, preserve at least two unmistakable structural cues. For a brief combining two ideas, do NOT place two generic icons next to each other or stack unrelated primitives (such as a dome under three equal bars). Find one authored visual relationship: one object becomes the other, one shared contour carries both meanings, a cut-out reveals the second idea, or a distinctive part of one object is transformed by the other. The integrated mark must still read as the named object(s), not as an arbitrary shape with a matching explanation. Avoid generic equalizer bars, sound-wave bars, dots, circles and semicircles unless each is structurally justified by the brief and integrated into the object itself. A music reference must be more specific than three vertical bars; a bread reference must look like actual bread rather than a plain dome. Do not solve semantic integration by adding a tiny floating note or unrelated ornament. If the design only communicates after reading its rationale, it has failed: redesign the silhouette. Before returning each concept, perform a blind-read check: identify the first plausible reading of the symbol alone, compare it with the brief's central idea, and change the geometry if the readings diverge. The visible construction, not the title, text or rationale, must carry the meaning.",
    "PHASE 6B — PROFESSIONAL LOGO FINISH: do not stop when the mark is merely valid or recognizable. Resolve it like a senior identity designer preparing a client presentation. Build a clear silhouette hierarchy: one dominant memorable gesture, with secondary geometry only where it clarifies the idea. Make contours intentional—no arbitrary polygon points, accidental bulges, awkward joins, uneven visual weight or near-tangent overlaps. Establish a repeatable geometric grammar (angle families, curve tension, corner logic and spacing) while allowing purposeful asymmetry. Treat negative space as designed geometry: counters and cut-outs must be clean, balanced and remain open at small sizes. Tune optical centering and the mark-to-wordmark relationship by eye, not only mathematical alignment; the symbol, brand name and slogan must form one balanced lockup with deliberate scale, spacing and typographic contrast. Use a restrained, concept-specific material/color treatment only after the one-color silhouette works. Do not add gradients, glows, shadows, rings, bevels or micro-details merely to make a weak mark look elaborate. Before returning, mentally compare the mark beside high-quality contemporary identity work: if it reads as a generic CSS exercise, placeholder icon or decorative badge, redesign its silhouette and proportions—not just its effects.",
    "PHASE 7 — TEST AND REFINE: inspect the composition conceptually at full size and at 64, 32, 24 and 16 px; test one-color black on white, reversed white on dark, grayscale and silhouette-only. Check readability, crop safety, contrast, optical balance and accidental readings. Redesign failures. Do not claim an external browser render or pixel test was performed.",
    "CONCEPT DIFFERENTIATION: every concept needs a different central thesis, outer silhouette and structural construction. Avoid category clip art. Do not default to circles, orbits, sound waves, equalizers, musical notes, globes, leaves, arrows or generic letter-in-a-shield. Use only when the brief supports a fresh transformation.",
    "WORDMARK: render the exact brand name as live HTML text exactly once using {{BRAND_NAME}}. Preserve spelling, language and script. Persian/Arabic must use direction:rtl, unicode-bidi:plaintext and a suitable system font stack. Typography must be intentionally styled and legible. If a slogan exists, include {{SLOGAN}} exactly once as secondary text; otherwise do not invent one.",
    "ARTBOARD: design on a square 1000×1000 logical grid with deliberate margins, but keep the actual .logo-art-root responsive to the available square viewport: width:100%; height:100%; min-width:0; min-height:0; max-width:100%; max-height:100%; container-type:size. Never assign the root a fixed 1000px width or height. Scale all mark geometry and spacing with percentages, cqw container units and clamp(); center the lockup with grid or flex. Do not position the central mark at fixed 500px offsets or use fixed 1000px child dimensions. A mark should remain fully visible in a 320×320 mobile preview. Give the lockup clear hierarchy and use the canvas meaningfully; no tiny floating logo, poster, mockup, border frame or UI card.",
    "COLOR: honor the client palette and use var(--logo-primary) and var(--logo-background). For NAVA Logo Studio previews, the artboard/canvas background must be white or a light neutral and must never default to navy or dark blue. Navy or blue may still be used as an intentional brand-mark or wordmark color when the client brief or selected brand palette calls for it; never force or ban a brand color globally. Keep the canvas separate from the logo identity colors. Do not assume gold is required. Use at most two justified accent colors.",
    "HTML CONTRACT: output a fragment using only div, span, p, strong, em, small and br. SVG and all SVG-derived tags or attributes are forbidden. For symbol-bearing formats, include exactly one <div class=\"navi-symbol\" data-logo-role=\"symbol\"> as the central mark. Its internal layers are optional and must exist only when they construct the idea; do not add filler layers. Include the exact brand wordmark and optional slogan as semantic data-logo-role elements. No scripts, event handlers, style attributes, images, canvas, iframe, links, external fonts, external resources or embedded content. Scope selectors under .logo-art-root.",
    "CSS CONTRACT: output a complete responsive stylesheet for a square 1000×1000 logical artboard rendered inside a square viewport of any size. The .logo-art-root must use width:100%; height:100%, never fixed pixel dimensions. Use container-relative cqw units, percentages and clamp() for geometry and typography; keep the design within the viewport. Give .navi-symbol explicit nonzero width and height, a visible contour and at least one genuine filled silhouette (a filled background with a shaped radius or clip-path). Add named child layers only where needed to construct the idea; each used child must have a meaningful visible CSS rule. Do not force a decorative inner ring, line or dot. CSS clip-path polygons and border-radius are available geometry tools, not mandatory techniques. CSS gradients, shadows, transforms, pseudo-elements and layered surfaces are allowed when they improve the concept. HTML/CSS only: no SVG, vector path data, canvas or raster imagery. Set root layout, dimensions, overflow, direction, colours and typography explicitly. No url(), @import, @font-face, expressions or external resources.",
    "QUALITY GATE: reject generic doodles, crooked stray strokes, two-line marks with no recognizable idea, stock icons, unmodified font initials, random ornament, over-complex illustrations, weak silhouettes, poor wordmarks, bad spacing, low contrast and designs that fail small-size reading. Verify that the symbol communicates the brief-specific idea and its actual spatial relationships, and that the complete silhouette is memorable in one colour at 32px. The design must contain a real shaped form, not merely scattered strokes; child layers are optional unless the concept needs them. Inspect the black one-colour silhouette: if it becomes a generic blob, ring or primitive icon, redesign it. Check every detail for recognition, hierarchy, geometry or material. Do not confuse the number of CSS techniques or layers with design quality.",
    "OUTPUT: return one valid JSON object only with keys brandCore, designIdea, designBriefEnglish, strategy, concepts. designIdea is a concise Persian statement of the central creative idea. Return exactly " + conceptCount + " concept object(s), each with Persian title, Persian rationale, centralThesis, briefElements, visualAnchors, anchorMap, symbolConstruction, briefAlignment, mechanism, expressionMove, differsBy, axes, defaultsUsed, html and css. centralThesis, briefElements, symbolConstruction and briefAlignment must be concise, concrete Persian text checked against the visible mark. Include no chain-of-thought, markdown or explanation outside JSON. Each HTML fragment under 6500 chars and each CSS stylesheet under 9000 chars."
  ].join("\n");
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
          contents: [{ role: "user", parts: [{ text: "Create exactly " + conceptCount + " complete logo design" + (conceptCount === 1 ? "" : " concepts") + " from this client brief. Preserve every named object literally and recognizably; do not substitute one object for another. Identify diagnostic shape features for each named object before designing. Follow the designPrompt as binding art direction and return a production-ready HTML/CSS identity, not a sketch.\n" + JSON.stringify(userBrief) }] }],
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

async function refineLogoConcepts(data, conceptsInput, apiKey) {
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
    "You are given the actual browser-rendered PNG preview for each concept, its HTML/CSS source, and the original client brief. Inspect the image itself. Do not merely repeat the rationale or validate that classes exist.",
    "For each concept diagnose visible problems in silhouette, object recognition, spatial relationships, overlap/occlusion, hierarchy, balance, scale, depth, lighting, material, typography and fidelity to the exact brief. Then revise the HTML and CSS so the rendered result visibly fixes those problems.",
    "The original client brief is the source of truth. Preserve its subject, required objects, exact spatial relationships, brand name and supplied slogan. Never replace the core idea with a generic icon or a different metaphor.",
    "For front/behind/emerging/partially hidden relationships, implement real CSS positioning, stacking and overlap. A relationship is not fixed by adding explanatory text or adjacent shapes.",
    "NON-NEGOTIABLE REVISION STANDARD: a successful revision must materially change the visible .navi-symbol construction, not just its wrapper, color, typography, shadow, scale or decorative effects. Change the actual silhouette, cut-out, contour, proportions, placement, overlap, or geometry of a meaningful symbol layer. Make the smallest set of high-impact changes that fixes the biggest visible mismatch with the original brief. If the current mark is merely an abstract approximation of a named object, replace that approximation with a recognizable constructed silhouette. Preserve the requested idea, but do not preserve a weak arrangement just because it already exists. In visualRevisionNotes name the exact shape/geometry changed and why it better expresses a specific brief anchor. A revision that only changes presentation styling will be rejected; do not claim an improvement without a visible structural correction.",
    "Improve the actual graphic design, not just the code structure: custom silhouette, deliberate geometry, considered negative space, intentional proportions, optical alignment and purposeful layered construction. Avoid arbitrary extra ornaments, generic rings, random diagonal strokes and default badges.",
    "Keep the existing .navi-symbol wrapper and every class referenced by anchorMap so the verified visual anchors remain attached to real layers. You may redesign their geometry and add nested HTML/CSS layers.",
    "Keep all text exactly as supplied. Preserve data-logo-role=brand and data-logo-role=slogan. Persian/Arabic must remain real HTML text with direction:rtl, unicode-bidi:plaintext and suitable font fallbacks.",
    "Return a single valid JSON object with a concepts array in the same order. Each item must contain only index (1-based), html, css and visualRevisionNotes (short Persian explanation of concrete visible changes). Do not return SVG, images, scripts, markdown or chain-of-thought. HTML must use only the already-supported safe tags and CSS must use the existing safe CSS subset."
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
        if (html.length < 20 || css.length < 40 || !notes) {
          throw validationError("LOGO_REVIEW_INCOMPLETE", "Visual refinement was incomplete.", "visual-review-output", index + 1);
        }
        refinedCount += 1;
        return { ...source, html, css, visualRevisionNotes: notes, visualReview: "refined" };
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

export async function handleLogoRoute({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);

  let input;
  try {
    const raw = await request.text();
    input = JSON.parse(raw);
    const maximumBodyLength = input?.action === "visual-refine" ? 3000000 : 12000;
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
  if (!data.brandName) return fail("نام برند برای طراحی لازم است.", 400, corsOrigin);
  if (!data.format) return fail("ساختار لوگوی انتخاب‌شده معتبر نیست.", 400, corsOrigin);
  if (!/^#[0-9a-fA-F]{6}$/.test(data.primaryColor) || !/^#[0-9a-fA-F]{6}$/.test(data.darkColor)) {
    return fail("رنگ‌های انتخاب‌شده معتبر نیستند؛ پالت را دوباره انتخاب کن.", 400, corsOrigin);
  }

  if (input?.action === "visual-refine") {
    const reviewAuthorized = await verifyLogoReviewToken(
      env.NAVI_SESSION_SECRET, data.brandName, input.reviewToken
    );
    if (!reviewAuthorized) return fail("مجوز بازبینی بصری معتبر نیست یا زمان آن پایان یافته است؛ دوباره طرح را تولید کن.", 403, corsOrigin);
    try {
      const review = await refineLogoConcepts(data, input.concepts, env.GEMINI_API_KEY);
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
      errorName: String(error?.name || "Error").slice(0, 80),
      httpStatus: error?.httpStatus || null,
      finishReason: error?.finishReason || null,
      outputLength: error?.outputLength || null,
      validationStage: error?.validationStage || "unclassified-design-pipeline",
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
      stage: error?.validationStage || "unclassified-design-pipeline",
      conceptIndex: error?.conceptIndex || null,
      retryable: ["MODEL_TIMEOUT", "MODEL_RATE_LIMIT", "MODEL_SERVICE_ERROR", "MODEL_EMPTY_RESPONSE"].includes(diagnosticCode)
    });
  }
}
