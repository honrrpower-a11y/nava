// NAVA SEO Studio — bounded, authenticated on-page audit. No database or paid API.
import { json, safeNaviText } from "./shared.js";
import { ALLOWED_ORIGIN } from "./config.js";
import { authorizeNaviRequest } from "./navi-auth.js";

const MAX_HTML_BYTES = 900_000;
const FETCH_TIMEOUT_MS = 9000;
const MAX_REDIRECTS = 3;

function fail(message, status, corsOrigin) {
  return json({ success: false, error: message }, status, corsOrigin);
}

function isBlockedHost(host) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!value || value === "localhost" || value.endsWith(".localhost") ||
      value.endsWith(".local") || value.endsWith(".internal") ||
      value === "metadata.google.internal") return true;
  if (value.includes(":")) return true; // IPv6 literals are not accepted.
  const parts = value.split(".");
  if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part))) {
    const n = parts.map(Number);
    if (n.some(part => part > 255) || n[0] === 0 || n[0] === 10 ||
        n[0] === 127 || n[0] >= 224 ||
        (n[0] === 169 && n[1] === 254) ||
        (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
        (n[0] === 192 && n[1] === 168)) return true;
  }
  return false;
}

function normalizePublicUrl(input) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      isBlockedHost(url.hostname) || (url.port && !["80", "443"].includes(url.port))) return null;
  url.hash = "";
  return url;
}

async function readBounded(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("PAGE_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("PAGE_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, Number(n))))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))));
}

function cleanMarkup(value) {
  return decodeEntities(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function metaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (key === name.toLowerCase()) return cleanMarkup(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || "");
  }
  return "";
}

function auditHtml(html, requestedUrl, finalUrl, status, contentType) {
  const title = cleanMarkup(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = metaContent(html, "description");
  const canonicalRaw = html.match(/<link\b(?=[^>]*\brel\s*=\s*["'][^"']*canonical[^"']*["'])[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const canonical = canonicalRaw ? new URL(canonicalRaw, finalUrl).href : "";
  const lang = html.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i)?.[1] || "";
  const viewport = /<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(html);
  const robots = metaContent(html, "robots").toLowerCase();
  const h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => cleanMarkup(m[1])).filter(Boolean);
  const h2 = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => cleanMarkup(m[1])).filter(Boolean);
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(m => ({
    alt: m[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? null
  }));
  const links = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>/gi)].map(m => m[1]);
  const wordCount = cleanMarkup(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ")).split(/\s+/).filter(Boolean).length;
  const findings = [];
  const add = (severity, code, titleText, detail) => findings.push({ severity, code, title: titleText, detail });
  if (!title) add("critical", "missing-title", "عنوان صفحه وجود ندارد", "یک title یکتا و توصیفی برای این صفحه تعیین کن.");
  else if (title.length < 25 || title.length > 60) add("warning", "title-length", "طول عنوان نیاز به بازبینی دارد", "عنوان فعلی " + title.length + " نویسه است؛ وضوح و تناسب آن با موضوع را بررسی کن.");
  else add("good", "title-ok", "عنوان صفحه ثبت شده است", "عنوان " + title.length + " نویسه دارد.");
  if (!description) add("critical", "missing-description", "توضیحات متا وجود ندارد", "یک توضیح دقیق و اختصاصی برای معرفی محتوای صفحه بنویس.");
  else if (description.length < 70 || description.length > 160) add("warning", "description-length", "طول توضیحات متا قابل بازبینی است", "توضیحات فعلی " + description.length + " نویسه است.");
  else add("good", "description-ok", "توضیحات متا ثبت شده است", "طول توضیحات " + description.length + " نویسه است.");
  if (h1.length === 0) add("critical", "missing-h1", "تیتر اصلی H1 پیدا نشد", "برای موضوع اصلی صفحه یک H1 واضح و یکتا قرار بده.");
  else if (h1.length > 1) add("warning", "multiple-h1", "چند H1 در صفحه وجود دارد", "تعداد H1ها: " + h1.length + "؛ سلسله‌مراتب تیترها را بازبینی کن.");
  else add("good", "h1-ok", "یک H1 در صفحه وجود دارد", h1[0].slice(0, 180));
  if (!viewport) add("warning", "missing-viewport", "تنظیم viewport پیدا نشد", "نمایش واکنش‌گرا در موبایل را بررسی کن.");
  else add("good", "viewport-ok", "تنظیم viewport وجود دارد", "متاتگ viewport شناسایی شد.");
  if (!lang) add("warning", "missing-lang", "زبان سند مشخص نشده است", "ویژگی lang را روی تگ html تنظیم کن.");
  else add("good", "lang-ok", "زبان صفحه مشخص است", "زبان ثبت‌شده: " + lang);
  const missingAlt = images.filter(image => image.alt === null || !image.alt.trim()).length;
  if (missingAlt) add("warning", "image-alt", "تصاویر بدون متن جایگزین", missingAlt + " تصویر از " + images.length + " تصویر، alt خالی یا ناموجود دارد.");
  else if (images.length) add("good", "image-alt-ok", "برای تصاویر متن جایگزین ثبت شده", images.length + " تصویر بررسی شد.");
  if (!canonical) add("warning", "missing-canonical", "نشانی canonical پیدا نشد", "در صورت وجود نسخه‌های تکراری، canonical مناسب تعیین کن.");
  else add("good", "canonical-ok", "نشانی canonical ثبت شده است", canonical);
  if (/noindex/.test(robots)) add("critical", "noindex", "صفحه دارای دستور noindex است", "این دستور می‌تواند مانع ایندکس‌شدن صفحه شود؛ عمدی‌بودن آن را بررسی کن.");
  if (new URL(finalUrl).protocol !== "https:") add("warning", "not-https", "صفحه با HTTPS بارگذاری نشد", "نسخه امن HTTPS را برای سایت فعال کن.");
  if (wordCount < 120) add("warning", "low-content", "متن قابل‌استخراج صفحه کم است", "حدود " + wordCount + " واژه در HTML قابل‌استخراج بود؛ ممکن است محتوای جاوااسکریپتی در این شمارش نیامده باشد.");
  if (!findings.some(item => item.severity === "critical" || item.severity === "warning")) add("good", "baseline-ok", "مورد مهمی در بررسی پایه پیدا نشد", "این بررسی جایگزین ارزیابی کامل فنی و تجربه کاربری نیست.");
  const counts = { critical: 0, warning: 0, good: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return {
    requestedUrl, finalUrl, status, contentType, title, description, canonical,
    lang, viewport, h1, h2Count: h2.length, imageCount: images.length,
    imagesMissingAlt: missingAlt, internalLinks: links.filter(href => {
      try { return new URL(href, finalUrl).hostname === new URL(finalUrl).hostname; } catch { return false; }
    }).length,
    externalLinks: links.filter(href => {
      try { return new URL(href, finalUrl).hostname !== new URL(finalUrl).hostname; } catch { return false; }
    }).length,
    wordCount, htmlBytes: new TextEncoder().encode(html).length,
    robots: robots || "تنظیم نشده", counts, findings
  };
}

async function fetchPage(startUrl) {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = normalizePublicUrl(current);
    if (!url) throw new Error("URL_BLOCKED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url.href, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { "User-Agent": "NAVA-SEO-Audit/1.0 (+https://honrrpower-a11y.github.io/nava/)", "Accept": "text/html,application/xhtml+xml;q=0.9" }
      });
    } finally { clearTimeout(timeout); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === MAX_REDIRECTS) throw new Error("TOO_MANY_REDIRECTS");
      const location = response.headers.get("location");
      if (!location) throw new Error("REDIRECT_INVALID");
      current = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error("HTTP_" + response.status);
    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("NOT_HTML");
    return { html: await readBounded(response), finalUrl: url.href, status: response.status, contentType: type };
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

export async function handleSeoRoute({ request, env, origin, corsOrigin }) {
  if (new URL(request.url).pathname !== "/seo-audit") return null;
  if (request.method !== "POST") return fail("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  if (origin !== ALLOWED_ORIGIN) return fail("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  const auth = await authorizeNaviRequest(request, env);
  if (!auth.valid) return fail(auth.error || "برای استفاده از تحلیل سئو وارد حساب شو.", auth.status || 401, corsOrigin);
  let input;
  try { input = await request.json(); } catch { return fail("نشانی سایت معتبر نیست.", 400, corsOrigin); }
  const rawUrl = safeNaviText(input?.url, 2048);
  const normalized = normalizePublicUrl(rawUrl);
  if (!normalized) return fail("فقط نشانی عمومی HTTP یا HTTPS معتبر پذیرفته می‌شود؛ نشانی‌های محلی و شبکه خصوصی مجاز نیستند.", 400, corsOrigin);
  try {
    const page = await fetchPage(normalized.href);
    const report = auditHtml(page.html, normalized.href, page.finalUrl, page.status, page.contentType);
    return json({ success: true, report, checkedAt: new Date().toISOString() }, 200, corsOrigin);
  } catch (error) {
    const message = error?.message || "";
    const userMessage = message === "URL_BLOCKED" ? "مسیر انتقال صفحه به یک نشانی غیرمجاز می‌رسد."
      : message === "PAGE_TOO_LARGE" ? "حجم HTML صفحه برای بررسی از حد مجاز بیشتر است."
      : message === "NOT_HTML" ? "نشانی واردشده یک صفحه HTML قابل بررسی برنگرداند."
      : message === "TOO_MANY_REDIRECTS" ? "تعداد انتقال‌های صفحه بیش از حد مجاز است."
      : message === "REDIRECT_INVALID" ? "انتقال صفحه نشانی معتبری ندارد."
      : message.startsWith("HTTP_") ? "سایت پاسخ خطای HTTP " + message.slice(5) + " برگرداند."
      : "دریافت صفحه ممکن نشد؛ ممکن است سایت در دسترس نباشد یا اتصال را محدود کرده باشد.";
    return fail(userMessage, 422, corsOrigin);
  }
}
