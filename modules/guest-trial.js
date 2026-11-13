// Server-enforced guest trial quota for NAVA's browser-side logo studio.
// Visitor identifiers and client IPs are HMACed; raw identifiers/IPs are never stored.
import { json } from "./shared.js";
import { getNaviSigningKey, authorizeNaviRequest } from "./navi-auth.js";

const GUEST_TRIAL_LIMIT = 2;
const GUEST_IP_DAILY_LIMIT = 20;
const GUEST_IP_WINDOW_SECONDS = 24 * 60 * 60;

async function hmacIdentity(value, purpose, secret) {
  if (typeof value !== "string" || !value.trim() || typeof secret !== "string" || !secret) {
    throw new Error("Guest trial identity is unavailable.");
  }
  const key = await getNaviSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC", key,
    new TextEncoder().encode("nava-guest-trial:v1:" + purpose + ":" + value.trim())
  );
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createGuestVisitorHash(visitorId, secret) {
  return hmacIdentity(visitorId, "visitor", secret);
}
export async function createGuestIpHash(ipAddress, secret) {
  return hmacIdentity(ipAddress, "ip", secret);
}

function error(message, status, corsOrigin, extra = {}) {
  return json({ success: false, error: message, ...extra }, status, corsOrigin);
}

export async function handleGuestTrial({ request, env, origin, corsOrigin }) {
  if (origin !== "https://honrrpower-a11y.github.io") return error("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return error("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  if (!env.NAVA_DB || !env.NAVI_SESSION_SECRET) {
    return error("سرویس سهمیه آزمایشی موقتاً در دسترس نیست.", 503, corsOrigin);
  }

  let input;
  try { input = await request.json(); }
  catch { return error("درخواست سهمیه معتبر نیست.", 400, corsOrigin); }

  if (!input || input.studio !== "logo") {
    return error("این استودیو هنوز در طرح آزمایشی مهمان فعال نیست.", 400, corsOrigin);
  }

  const authorization = request.headers.get("Authorization") || "";
  if (authorization) {
    const auth = await authorizeNaviRequest(request, env);
    if (!auth.valid) {
      return error(auth.error || "نشست ورود معتبر نیست؛ دوباره وارد شو.", auth.status || 401, corsOrigin, {
        code: auth.code || "NAVI_AUTH_REQUIRED"
      });
    }
    return json({ success: true, authenticated: true, remaining: null }, 200, corsOrigin);
  }

  const visitorId = typeof input.visitorId === "string" ? input.visitorId.trim() : "";
  if (!/^[a-f0-9-]{32,40}$/i.test(visitorId)) {
    return error("شناسه آزمایشی معتبر نیست؛ صفحه را تازه‌سازی کن.", 400, corsOrigin);
  }
  const clientIp = request.headers.get("CF-Connecting-IP") || "";
  if (!clientIp.trim()) return error("امکان تشخیص سهمیه مهمان وجود ندارد. لطفاً وارد حساب نوا شو.", 503, corsOrigin);

  try {
    const visitorHash = await createGuestVisitorHash(visitorId, env.NAVI_SESSION_SECRET);
    const ipHash = await createGuestIpHash(clientIp, env.NAVI_SESSION_SECRET);
    const now = Math.floor(Date.now() / 1000);

    await env.NAVA_DB.prepare(`
      CREATE TABLE IF NOT EXISTS nava_guest_trials (
        visitor_hash TEXT PRIMARY KEY,
        used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `).run();
    await env.NAVA_DB.prepare(`
      CREATE TABLE IF NOT EXISTS nava_guest_ip_limits (
        ip_hash TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
        updated_at INTEGER NOT NULL
      )
    `).run();

    const existing = await env.NAVA_DB.prepare(
      "SELECT used_count FROM nava_guest_trials WHERE visitor_hash = ? LIMIT 1"
    ).bind(visitorHash).first();
    if (Number(existing?.used_count || 0) >= GUEST_TRIAL_LIMIT) {
      return error("دو فرصت آزمایشی مهمان استفاده شده است. برای ادامه ساخت طرح‌ها وارد حساب نوا شو.",
        429, corsOrigin, { code: "GUEST_TRIAL_LIMIT", remaining: 0, limit: GUEST_TRIAL_LIMIT });
    }

    const ipUse = await env.NAVA_DB.prepare(`
      INSERT INTO nava_guest_ip_limits (ip_hash, window_started_at, used_count, updated_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(ip_hash) DO UPDATE SET
        window_started_at = CASE
          WHEN excluded.window_started_at - nava_guest_ip_limits.window_started_at >= ?
          THEN excluded.window_started_at ELSE nava_guest_ip_limits.window_started_at END,
        used_count = CASE
          WHEN excluded.window_started_at - nava_guest_ip_limits.window_started_at >= ?
          THEN 1 ELSE nava_guest_ip_limits.used_count + 1 END,
        updated_at = excluded.updated_at
      WHERE excluded.window_started_at - nava_guest_ip_limits.window_started_at >= ?
         OR nava_guest_ip_limits.used_count < ?
      RETURNING used_count
    `).bind(ipHash, now, now, GUEST_IP_WINDOW_SECONDS, GUEST_IP_WINDOW_SECONDS,
      GUEST_IP_WINDOW_SECONDS, GUEST_IP_DAILY_LIMIT).first();

    if (!ipUse) {
      return error("تعداد درخواست‌های آزمایشی از این شبکه فعلاً زیاد است. بعداً دوباره تلاش کن یا وارد حساب نوا شو.",
        429, corsOrigin, { code: "GUEST_IP_TRIAL_LIMIT" });
    }

    const consumed = await env.NAVA_DB.prepare(`
      INSERT INTO nava_guest_trials (visitor_hash, used_count, created_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT(visitor_hash) DO UPDATE SET
        used_count = nava_guest_trials.used_count + 1,
        updated_at = excluded.updated_at
      WHERE nava_guest_trials.used_count < ?
      RETURNING used_count
    `).bind(visitorHash, now, now, GUEST_TRIAL_LIMIT).first();

    if (!consumed) {
      return error("دو فرصت آزمایشی مهمان استفاده شده است. برای ادامه ساخت طرح‌ها وارد حساب نوا شو.",
        429, corsOrigin, { code: "GUEST_TRIAL_LIMIT", remaining: 0, limit: GUEST_TRIAL_LIMIT });
    }

    return json({ success: true, authenticated: false,
      remaining: Math.max(0, GUEST_TRIAL_LIMIT - Number(consumed.used_count)),
      limit: GUEST_TRIAL_LIMIT }, 200, corsOrigin);
  } catch (cause) {
    console.error("[NAVA] Guest trial check failed:", cause);
    return error("بررسی سهمیه آزمایشی انجام نشد. کمی بعد دوباره تلاش کن.", 503, corsOrigin);
  }
}
