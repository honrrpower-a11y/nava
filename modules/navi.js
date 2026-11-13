// NAVI - Authentication, Chat, History and Smart Memory
// Version: 1.0

import { GEMINI_MODEL, ALLOWED_ORIGIN } from "./config.js";
import { json, safeNaviText } from "./shared.js";

import {
  createNaviSession,
  verifyNaviPassword,
  validateNaviPasswordVerifier,
  verifyNaviChallengeProof,
  authorizeNaviRequest
} from "./navi-auth.js";

import {
  getNaviMainThreadId,
  ensureNaviMainThread,
  getNaviDbHistory,
  getNaviPreviousExplicitMemoryValue,
  searchNaviConversationHistory,
  getNaviApprovedMemory,
  getNaviPendingMemory,
  getNaviArchivedMemory,
  parseNaviMemoryCommand,
  saveNaviMemoryFact,
  createNaviMemoryProposal,
  approveNaviMemoryProposal,
  rejectNaviMemoryProposal,
  updateNaviMemoryProposal,
  saveNaviConversation,
  prepareNaviHistory
} from "./navi-memory.js";

// ======================================
// CONSTANTS
// ======================================

const NAVI_VERSION = "1.0";
const NAVI_MAX_MESSAGE = 12000;
const NAVI_MAX_MEMORY_VALUE = 12000;
const NAVI_MAX_PROPOSALS = 1;
const NAVI_GEMINI_TIMEOUT = 60000;

// ======================================
// GENERAL HELPERS
// ======================================

function diagnostic(error) {
  return String(
    error?.message || error || "Unknown error"
  ).slice(0, 500);
}

function logError(label, error) {
  console.error("[NAVI] " + label + ":", error);
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function errorResponse(
  message,
  status,
  corsOrigin,
  extra = {}
) {
  return json({
    success: false,
    error: message,
    ...extra
  }, status, corsOrigin);
}

function successResponse(
  data,
  corsOrigin,
  status = 200
) {
  return json({
    success: true,
    ...data
  }, status, corsOrigin);
}

// ======================================
// TEXT NORMALIZATION
// ======================================

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length > 1);
}

// ======================================
// SENSITIVE INFORMATION FILTER
// ======================================

function containsSensitiveInformation(value) {
  const text = String(value || "");

  const patterns = [
    /\bpassword\b/i,
    /\bpasswd\b/i,
    /\bapi[_ -]?key\b/i,
    /\baccess[_ -]?token\b/i,
    /\brefresh[_ -]?token\b/i,
    /\bsecret[_ -]?key\b/i,
    /\bprivate[_ -]?key\b/i,
    /\bclient[_ -]?secret\b/i,

    /رمز\s*(عبور|ورود)/i,
    /کلمه\s*عبور/i,
    /کلید\s*خصوصی/i,
    /توکن\s*(دسترسی|ورود|امنیتی)/i,
    /کلید\s*ای‌پی‌آی/i,
    /شماره\s*کارت/i,
    /شماره\s*حساب/i,
    /اطلاعات\s*بانکی/i,
    /cvv2/i,
    /رمز\s*دوم/i
  ];

  return patterns.some(pattern => pattern.test(text));
}

// ======================================
// MEMORY RELEVANCE
// ======================================

// Approved memory retrieval is model-semantic, not keyword-ranked.
// The server supplies a bounded, account-scoped candidate set; Gemini selects
// relevant facts by meaning in the same response request. This avoids a second
// model call and prevents generic word overlap (e.g. "است") from ranking facts.
export function selectRelevantMemories(message, memories) {
  if (!Array.isArray(memories)) return [];

  const safe = memories.filter(item =>
    item &&
    item.memory_value &&
    !containsSensitiveInformation(item.memory_value)
  );

  const isFoundational = item => {
    const key = normalizeText(item.memory_key || "");
    const value = normalizeText(item.memory_value || "");
    return (
      /نام کاربر|هویت دستیار|ترجیحات پاسخ|پروژه نوا|پروژه ناوی|nava|navi/.test(key) ||
      /پروژه نوا|پروژه ناوی|دستیار شخصی|ترجیحات پاسخ|پلتفرم نوا/.test(value)
    );
  };

  // Keep identity/project anchors first, then retain the database's
  // updated_at-desc order. Do not use query-token overlap as a relevance gate.
  const foundational = safe.filter(isFoundational);
  const foundationalIds = new Set(foundational.map(item => item.id));
  const remaining = safe.filter(item => !foundationalIds.has(item.id));
  return [...foundational, ...remaining].slice(0, 80);
}

function buildMemoryContext(memories) {
  if (!memories.length) {
    return "No approved memory candidates are available for this account.";
  }

  const maxContextChars = 36000;
  const lines = [];
  let usedChars = 0;
  let omitted = 0;

  for (const item of memories) {
    const title = safeNaviText(item.memory_key || "یادداشت", 150);
    const value = safeNaviText(item.memory_value || "", NAVI_MAX_MEMORY_VALUE);
    const line = `- [memory id: ${item.id}] ${title}: ${value}`;
    if (usedChars + line.length > maxContextChars) {
      omitted += 1;
      continue;
    }
    lines.push(line);
    usedChars += line.length + 1;
  }

  if (omitted) {
    lines.push(`[توجه: ${omitted} یادداشت دیگر به دلیل محدودیت اندازه زمینه در این نوبت ارسال نشدند.]`);
  }

  return lines.join("\n");
}

// ======================================
// GEMINI RESPONSE PARSER
// ======================================

export function parseNaviGeminiResponse(rawText) {
  const text = String(rawText || "").trim();

  if (!text) {
    return { reply: "", memoryProposals: [], structured: false };
  }

  // Gemini normally returns a JSON object because responseMimeType is set.
  // Be tolerant of harmless Markdown fences or short text surrounding it.
  const candidates = [];
  const unfenced = text
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  candidates.push(unfenced);

  const firstBrace = unfenced.indexOf("{");
  if (firstBrace >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < unfenced.length; index += 1) {
      const char = unfenced[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(unfenced.slice(firstBrace, index + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!isObject(parsed) || typeof parsed.reply !== "string") continue;

      return {
        reply: safeNaviText(parsed.reply, 20000),
        memoryProposals: Array.isArray(parsed.memoryProposals)
          ? parsed.memoryProposals
          : [],
        structured: true
      };
    } catch {
      // Try the next bounded candidate. Never evaluate or repair model text.
    }
  }

  // Plain-text fallback remains a user-visible answer, but cannot create
  // memory proposals because no structured proposal data was supplied.
  return {
    reply: safeNaviText(unfenced, 20000),
    memoryProposals: [],
    structured: false
  };
}

// ======================================
// MEMORY PROPOSAL VALIDATION
// ======================================

export function shouldSuppressNaviMemoryProposals(message) {
  const text = normalizeText(message);

  // A negative consent instruction always overrides automatic memory suggestions.
  const hasNoSaveInstruction =
    /بدون\s+(?:تأیید|تایید)(?:\s+نهایی)?(?:\s+من)?[\s\S]{0,120}(?:ذخیره|ثبت|اضافه)\s+نکن/u.test(text) ||
    /(?:فعلاً|فعلا)[\s\S]{0,100}(?:ذخیره|ثبت|اضافه)\s+نکن/u.test(text) ||
    /(?:ذخیره|ثبت|اضافه)\s+نکن[؛؛،,\s]*$/u.test(text);

  return hasNoSaveInstruction;
}

// Negative consent must be checked BEFORE the explicit-command parser.
// Otherwise a request phrased as adding a fact can bypass the proposal filter.
export function parseNaviMemoryCommandSafely(message) {
  if (shouldSuppressNaviMemoryProposals(message)) {
    return { isCommand: false, value: "" };
  }

  return parseNaviMemoryCommand(message);
}

// Deterministic safety net for clear, first-person durable preferences.
// Gemini remains the primary extractor; this only fills an empty proposal list.
export function extractNaviDeterministicMemoryProposal(message) {
  const value = safeNaviText(message || "", NAVI_MAX_MEMORY_VALUE).trim();
  if (!value || value.length < 20 || value.length > NAVI_MAX_MEMORY_VALUE) return [];
  if (shouldSuppressNaviMemoryProposals(value) || containsSensitiveInformation(value)) return [];

  // Do not turn questions, hypotheticals, quotations, or examples into personal facts.
  if (/[؟?]/u.test(value) || /(?:فرض کن|مثلاً|برای مثال|به‌عنوان نمونه|اگر\s)/u.test(value)) return [];
  if (/[«»“”]/u.test(value)) return [];

  const durableFirstPersonPatterns = [
    /(?:من\s+)?ترجیح\s+می[\s\u200c]*(?:دهم|دم|کنم)/u,
    /(?:من\s+)?دوست\s+دارم\s+(?:همیشه|معمولاً|معمولا|در\s+کار|در\s+پروژه)/u,
    /(?:اولویت|هدف|رویکرد|اصل)\s+(?:اصلی\s+)?من\s+(?:این\s+است|اینکه)/u,
    /برای\s+من\s+(?:همیشه\s+)?(?:مهم\s+است|اهمیت\s+دارد)/u,
    /من\s+(?:همیشه|معمولاً|معمولا)\s+(?:ترجیح|سعی|تلاش)/u
  ];
  if (!durableFirstPersonPatterns.some(pattern => pattern.test(value))) return [];

  return [{
    title: "ترجیح و رویکرد پایدار کاربر",
    value
  }];
}

function normalizeMemoryProposals(proposals) {
  if (!Array.isArray(proposals)) return [];

  const result = [];
  const seen = new Set();

  for (
    const item of proposals.slice(0, NAVI_MAX_PROPOSALS)
  ) {
    if (!isObject(item)) continue;

    const value = safeNaviText(
      item.value || "",
      NAVI_MAX_MEMORY_VALUE + 1
    );
    if (value.length > NAVI_MAX_MEMORY_VALUE) continue;

    const title = safeNaviText(
      item.title || "یادداشت کاربر",
      150
    );

    if (!value || value.length < 8) continue;

    if (containsSensitiveInformation(value)) {
      continue;
    }

    const normalized = normalizeText(value);

    if (seen.has(normalized)) continue;

    seen.add(normalized);

    result.push({
      title: title || "یادداشت کاربر",
      value
    });
  }

  return result;
}

// ======================================
// AUTHORIZATION
// ======================================

async function authorize(request, env, origin, corsOrigin) {
  if (origin !== ALLOWED_ORIGIN) {
    return {
      valid: false,
      response: errorResponse(
        "دسترسی غیرمجاز است.",
        403,
        corsOrigin
      )
    };
  }

  const auth = await authorizeNaviRequest(
    request,
    env
  );

  if (!auth.valid) {
    return {
      valid: false,
      response: errorResponse(
        auth.error || "دسترسی غیرمجاز است.",
        auth.status || 401,
        corsOrigin,
        { code: auth.code }
      )
    };
  }

  return { valid: true, user: auth.user };
}

// ======================================
// LOGIN
// ======================================

function naviAuthBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function handleNaviAuthChallenge({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("دیتابیس حساب‌های ناوی در دسترس نیست.", 503, corsOrigin);

  let input;
  try { input = await request.json(); } catch { return errorResponse("اطلاعات ورود معتبر نیست.", 400, corsOrigin); }
  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase() || "owner";
  if (username !== "owner" && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
  }

  try {
    const row = username === "owner"
      ? await env.NAVA_DB.prepare("SELECT id, username, password_hash, role, status FROM users WHERE id = ? LIMIT 1").bind("owner").first()
      : await env.NAVA_DB.prepare("SELECT id, username, password_hash, role, status FROM users WHERE username = ? LIMIT 1").bind(username).first();

    if (!row || row.status !== "active" || (username === "owner" && row.role !== "owner")) {
      return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
    }

    // The owner's pre-existing Worker secret is used only for the one-time
    // transition when no D1 verifier has been enrolled yet.
    if (username === "owner" && !row.password_hash) {
      return successResponse({ mode: "legacy" }, corsOrigin);
    }

    const parsed = validateNaviPasswordVerifier(row.password_hash);
    if (!parsed) return errorResponse("ساختار امن رمز این حساب معتبر نیست؛ نیاز به بازیابی امن دارد.", 409, corsOrigin);

    const now = Date.now();
    await env.NAVA_DB.prepare("DELETE FROM navi_auth_challenges WHERE expires_at <= ? OR used_at IS NOT NULL").bind(now).run();
    const challengeId = crypto.randomUUID();
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = naviAuthBase64Url(nonceBytes);
    const expiresAt = now + 120000;
    await env.NAVA_DB.prepare(
      "INSERT INTO navi_auth_challenges (challenge_id, user_id, nonce, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)"
    ).bind(challengeId, String(row.id), nonce, expiresAt).run();

    return successResponse({
      mode: "challenge",
      challengeId,
      nonce,
      salt: parsed.salt,
      iterations: parsed.iterations,
      expiresIn: 120
    }, corsOrigin);
  } catch (error) {
    logError("NAVI login challenge failed", error);
    return errorResponse("آماده‌سازی ورود امن ممکن نشد. ابتدا ساختار امنیتی دیتابیس را به‌روزرسانی کن.", 503, corsOrigin);
  }
}

async function handleLogin({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (!env.NAVI_SESSION_SECRET) return errorResponse("تنظیمات امنیتی نشست ناوی کامل نیست.", 500, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("دیتابیس حساب‌های ناوی در دسترس نیست.", 503, corsOrigin);

  let input;
  try { input = await request.json(); } catch { return errorResponse("اطلاعات ورود معتبر نیست.", 400, corsOrigin); }

  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase() || "owner";
  if (username !== "owner" && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
  }

  try {
    let row = username === "owner"
      ? await env.NAVA_DB.prepare("SELECT id, username, display_name, password_hash, role, status FROM users WHERE id = ? LIMIT 1").bind("owner").first()
      : await env.NAVA_DB.prepare("SELECT id, username, display_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1").bind(username).first();

    if (!row || row.status !== "active" || (username === "owner" && row.role !== "owner")) {
      // Retain the pre-migration owner-only fallback if the owner row has not
      // yet been created. No invited account can use this path.
      if (username === "owner" && !row && await verifyNaviPassword(input?.password || "", env.NAVI_OWNER_PASSWORD)) {
        const user = { id: "owner", username: "owner", display_name: "مالک", role: "owner" };
        const token = await createNaviSession(env.NAVI_SESSION_SECRET, user);
        return successResponse({ token, expiresIn: 43200, assistant: "NAVI", version: NAVI_VERSION,
          user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } }, corsOrigin);
      }
      return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
    }

    if (username === "owner" && !row.password_hash) {
      // One-time legacy owner authentication. The browser supplies the PBKDF2
      // verifier it computed locally; the server never runs PBKDF2.
      const password = typeof input?.password === "string" ? input.password : "";
      const verifier = validateNaviPasswordVerifier(input?.passwordHash);
      if (!password || password.length > 256 || !verifier ||
          !await verifyNaviPassword(password, env.NAVI_OWNER_PASSWORD)) {
        return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
      }
      const provision = await env.NAVA_DB.prepare(
        "UPDATE users SET username = COALESCE(NULLIF(username, ''), 'owner'), password_hash = ?, role = 'owner', status = 'active' WHERE id = ? AND (password_hash IS NULL OR password_hash = '')"
      ).bind(input.passwordHash, "owner").run();
      if (!provision?.success) throw new Error("Owner verifier enrollment was not confirmed.");
      if (Number(provision.meta?.changes || 0) !== 1) {
        const refreshed = await env.NAVA_DB.prepare(
          "SELECT password_hash, status, role FROM users WHERE id = ? LIMIT 1"
        ).bind("owner").first();
        if (!refreshed || refreshed.status !== "active" || refreshed.role !== "owner" ||
            refreshed.password_hash !== input.passwordHash) {
          return errorResponse("ثبت رمز مالک هم‌زمان تغییر کرده است؛ دوباره تلاش کن.", 409, corsOrigin);
        }
        row.password_hash = refreshed.password_hash;
      } else {
        row.password_hash = input.passwordHash;
      }
    } else {
      const challengeId = String(input?.challengeId || "");
      const proof = String(input?.proof || "");
      if (!/^[0-9a-f-]{36}$/i.test(challengeId) || proof.length > 128) {
        return errorResponse("درخواست ورود امن معتبر نیست؛ دوباره تلاش کن.", 401, corsOrigin);
      }
      // Atomic consume prevents the same challenge response from being replayed.
      const challenge = await env.NAVA_DB.prepare(
        "UPDATE navi_auth_challenges SET used_at = ? WHERE challenge_id = ? AND user_id = ? AND used_at IS NULL AND expires_at > ? RETURNING nonce"
      ).bind(Date.now(), challengeId, String(row.id), Date.now()).first();
      if (!challenge?.nonce) return errorResponse("درخواست ورود منقضی یا قبلاً استفاده شده است؛ دوباره تلاش کن.", 401, corsOrigin);
      const message = "navi-login|" + challengeId + "|" + username + "|" + challenge.nonce;
      if (!await verifyNaviChallengeProof(row.password_hash, message, proof)) {
        return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
      }
    }

    const user = {
      id: String(row.id),
      username: row.username || "owner",
      display_name: row.display_name || (username === "owner" ? "مالک" : row.username),
      role: row.role === "owner" ? "owner" : "user"
    };
    const token = await createNaviSession(env.NAVI_SESSION_SECRET, user);
    return successResponse({
      token, expiresIn: 43200, assistant: "NAVI", version: NAVI_VERSION,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
    }, corsOrigin);
  } catch (error) {
    logError("Login failed", error);
    return errorResponse("ورود به ناوی ناموفق بود.", 500, corsOrigin);
  }
}

// Public registration requests are stored as pending; only the owner can approve them.
async function handleNaviRegistration({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return errorResponse("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 503, corsOrigin);

  let input;
  try { input = await request.json(); }
  catch { return errorResponse("اطلاعات درخواست عضویت معتبر نیست.", 400, corsOrigin); }

  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase();
  const displayName = safeNaviText(input?.displayName || "", 80).trim();
  const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || username === "owner") {
    return errorResponse("نام کاربری باید ۳ تا ۴۰ نویسه انگلیسی و بدون فاصله باشد.", 400, corsOrigin);
  }
  if (displayName.length < 2 || displayName.length > 80 || !validateNaviPasswordVerifier(passwordHash)) {
    return errorResponse("نام نمایشی یا رمز امن واردشده معتبر نیست.", 400, corsOrigin);
  }

  try {
    const existingUser = await env.NAVA_DB.prepare(
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    ).bind(username).first();
    if (existingUser) return errorResponse("این نام کاربری قبلاً استفاده شده است.", 409, corsOrigin);

    const existingRequest = await env.NAVA_DB.prepare(
      "SELECT request_id FROM navi_registration_requests WHERE username = ? AND status = 'pending' LIMIT 1"
    ).bind(username).first();
    if (existingRequest) return errorResponse("برای این نام کاربری یک درخواست در انتظار بررسی وجود دارد.", 409, corsOrigin);

    const requestId = crypto.randomUUID();
    const result = await env.NAVA_DB.prepare(
      "INSERT INTO navi_registration_requests (request_id, username, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'pending')"
    ).bind(requestId, username, displayName, passwordHash).run();
    if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
      throw new Error("Registration request insert was not confirmed.");
    }
    return successResponse({
      submitted: true,
      request: { requestId, username, displayName, status: "pending" },
      message: "درخواست عضویت ثبت شد و پس از بررسی مالک نتیجه مشخص می‌شود."
    }, corsOrigin, 201);
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || ""))) {
      return errorResponse("برای این نام کاربری درخواست دیگری ثبت شده یا قبلاً استفاده شده است.", 409, corsOrigin);
    }
    logError("NAVI registration request failed", error);
    return errorResponse("ثبت درخواست عضویت انجام نشد. ساختار دیتابیس باید به‌روزرسانی شود.", 503, corsOrigin);
  }
}

// Owner-only account administration and registration review.
async function handleNaviUsers({ request, env, origin, corsOrigin }) {
  const auth = await authorize(request, env, origin, corsOrigin);
  if (!auth.valid) return auth.response;
  if (auth.user.role !== "owner") return errorResponse("فقط مالک می‌تواند حساب‌ها را مدیریت کند.", 403, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 500, corsOrigin);

  if (request.method === "GET") {
    try {
      const [users, requests] = await Promise.all([
        env.NAVA_DB.prepare(
          "SELECT id, username, display_name, role, status, created_at, updated_at FROM users ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at DESC"
        ).all(),
        env.NAVA_DB.prepare(
          "SELECT request_id, username, display_name, status, created_at FROM navi_registration_requests WHERE status = 'pending' ORDER BY created_at ASC"
        ).all()
      ]);
      return successResponse({
        users: users.results || [],
        registrationRequests: requests.results || []
      }, corsOrigin);
    } catch (error) {
      logError("NAVI account list failed", error);
      return errorResponse("دریافت فهرست حساب‌ها ناموفق بود. اگر این قابلیت تازه نصب شده، Migration عضویت هنوز اجرا نشده است.", 500, corsOrigin);
    }
  }

  if (request.method !== "POST") {
    return errorResponse("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  }

  let input;
  try { input = await request.json(); }
  catch { return errorResponse("اطلاعات حساب معتبر نیست.", 400, corsOrigin); }

  const action = String(input?.action || "create").toLowerCase();

  if (action === "review_registration") {
    const requestId = String(input?.requestId || "").trim();
    const decision = String(input?.decision || "").toLowerCase();
    if (!requestId || requestId.length > 128 || !["approve", "reject"].includes(decision)) {
      return errorResponse("درخواست یا تصمیم مدیریتی معتبر نیست.", 400, corsOrigin);
    }
    try {
      const pending = await env.NAVA_DB.prepare(
        "SELECT request_id, username, display_name, password_hash FROM navi_registration_requests WHERE request_id = ? AND status = 'pending' LIMIT 1"
      ).bind(requestId).first();
      if (!pending) return errorResponse("این درخواست قبلاً بررسی شده یا وجود ندارد.", 404, corsOrigin);

      if (decision === "reject") {
        const rejected = await env.NAVA_DB.prepare(
          "UPDATE navi_registration_requests SET status = 'rejected', password_hash = '', reviewed_at = datetime('now'), reviewed_by = ? WHERE request_id = ? AND status = 'pending'"
        ).bind(auth.user.id, requestId).run();
        if (!rejected?.success || Number(rejected.meta?.changes || 0) !== 1) {
          return errorResponse("رد درخواست انجام نشد؛ فهرست را تازه‌سازی کن.", 409, corsOrigin);
        }
        return successResponse({ reviewed: true, decision: "rejected", message: "درخواست عضویت رد شد." }, corsOrigin);
      }

      const existing = await env.NAVA_DB.prepare(
        "SELECT id FROM users WHERE username = ? LIMIT 1"
      ).bind(pending.username).first();
      if (existing) return errorResponse("این نام کاربری در این فاصله توسط حساب دیگری استفاده شده است؛ درخواست را رد یا با متقاضی هماهنگ کن.", 409, corsOrigin);

      const userId = crypto.randomUUID();
      if (typeof env.NAVA_DB.batch !== "function") {
        return errorResponse("دیتابیس از عملیات اتمی تأیید عضویت پشتیبانی نمی‌کند؛ هیچ تغییری انجام نشد.", 503, corsOrigin);
      }
      const results = await env.NAVA_DB.batch([
        env.NAVA_DB.prepare(
          "INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) SELECT ?, 'navi-local', ?, display_name, username, password_hash, 'user', 'active' FROM navi_registration_requests WHERE request_id = ? AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM users WHERE username = (SELECT username FROM navi_registration_requests WHERE request_id = ?))"
        ).bind(userId, "navi-registration:" + userId, requestId, requestId),
        env.NAVA_DB.prepare(
          "UPDATE navi_registration_requests SET status = 'approved', password_hash = '', reviewed_at = datetime('now'), reviewed_by = ? WHERE request_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM users WHERE id = ?)"
        ).bind(auth.user.id, requestId, userId)
      ]);
      const inserted = Number(results?.[0]?.meta?.changes || 0);
      const reviewed = Number(results?.[1]?.meta?.changes || 0);
      if (inserted !== 1 || reviewed !== 1) {
        return errorResponse("تأیید انجام نشد؛ ممکن است درخواست هم‌زمان بررسی شده باشد. فهرست را تازه‌سازی کن.", 409, corsOrigin);
      }
      return successResponse({
        reviewed: true,
        decision: "approved",
        user: { id: userId, username: pending.username, displayName: pending.display_name, role: "user", status: "active" },
        message: "درخواست تأیید شد و حساب کاربری فعال است."
      }, corsOrigin);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || ""))) {
        return errorResponse("نام کاربری دیگر در دسترس نیست؛ درخواست تأیید نشد.", 409, corsOrigin);
      }
      logError("NAVI registration review failed", error);
      return errorResponse("بررسی درخواست عضویت ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action === "reset_password") {
    const userId = String(input?.userId || "").trim();
    const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
    if (!userId || userId.length > 128 || userId === "owner" || !validateNaviPasswordVerifier(passwordHash)) {
      return errorResponse("شناسه حساب یا رمز امن جدید معتبر نیست.", 400, corsOrigin);
    }
    try {
      const result = await env.NAVA_DB.prepare(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND role = 'user'"
      ).bind(passwordHash, userId).run();
      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse("حساب موردنظر پیدا نشد یا قابل بازنشانی نیست.", 404, corsOrigin);
      }
      return successResponse({ updated: true, user: { id: userId }, message: "رمز حساب با موفقیت بازنشانی شد." }, corsOrigin);
    } catch (error) {
      logError("NAVI account password reset failed", error);
      return errorResponse("بازنشانی رمز حساب ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action === "set_status") {
    const userId = String(input?.userId || "").trim();
    const status = String(input?.status || "").toLowerCase();
    if (!userId || userId.length > 128 || !["active", "disabled"].includes(status)) {
      return errorResponse("شناسه حساب یا وضعیت درخواستی معتبر نیست.", 400, corsOrigin);
    }
    if (userId === "owner") return errorResponse("حساب اصلی مالک از این بخش قابل غیرفعال‌سازی نیست.", 400, corsOrigin);
    try {
      const result = await env.NAVA_DB.prepare(
        "UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ? AND role = 'user'"
      ).bind(status, userId).run();
      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse("حساب موردنظر پیدا نشد یا قابل تغییر نیست.", 404, corsOrigin);
      }
      return successResponse({
        updated: true,
        user: { id: userId, status },
        message: status === "disabled" ? "حساب غیرفعال شد." : "حساب دوباره فعال شد."
      }, corsOrigin);
    } catch (error) {
      logError("NAVI account status update failed", error);
      return errorResponse("تغییر وضعیت حساب ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action !== "create") return errorResponse("عملیات مدیریت حساب معتبر نیست.", 400, corsOrigin);
  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase();
  const displayName = safeNaviText(input?.displayName || "", 80).trim();
  const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || username === "owner" ||
      displayName.length < 2 || !validateNaviPasswordVerifier(passwordHash)) {
    return errorResponse("نام نمایشی، نام کاربری یا ساختار رمز امن معتبر نیست.", 400, corsOrigin);
  }
  const id = crypto.randomUUID();
  try {
    const result = await env.NAVA_DB.prepare(
      "INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) VALUES (?, 'navi-local', ?, ?, ?, ?, 'user', 'active')"
    ).bind(id, "navi-invite:" + id, displayName, username, passwordHash).run();
    if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Account insert was not confirmed.");
    return successResponse({ user: { id, username, displayName, role: "user", status: "active" }, created: true }, corsOrigin, 201);
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || ""))) return errorResponse("این نام کاربری قبلاً ثبت شده است.", 409, corsOrigin);
    logError("NAVI account creation failed", error);
    return errorResponse("ساخت حساب انجام نشد. ساختار دیتابیس حساب‌ها را بررسی کن.", 500, corsOrigin);
  }
}

// ======================================
// HISTORY
// ======================================

async function handleHistory({
  request,
  env,
  origin,
  corsOrigin,
  url
}) {
  const auth = await authorize(
    request,
    env,
    origin,
    corsOrigin
  );

  if (!auth.valid) return auth.response;
  const userId = auth.user.id;

  if (!env.NAVA_DB) {
    return errorResponse(
      "اتصال دیتابیس NAVI تنظیم نشده است.",
      500,
      corsOrigin
    );
  }

  try {
    await ensureNaviMainThread(env.NAVA_DB, userId);

    const requestedThreadId = String(url.searchParams.get("thread_id") || getNaviMainThreadId(userId));    const thread = await env.NAVA_DB.prepare(`
      SELECT thread_id FROM navi_chat_threads_v1
      WHERE thread_id = ? AND owner_id = ? LIMIT 1
    `).bind(requestedThreadId, userId).first();

    if (!thread) {
      return errorResponse("این گفت‌وگو پیدا نشد.", 404, corsOrigin);
    }

    const result = await env.NAVA_DB.prepare(`
      SELECT m.id, m.role, m.content, m.created_at
      FROM navi_chat_messages_v1 AS m
      INNER JOIN navi_chat_threads_v1 AS t
        ON t.thread_id = m.thread_id
      WHERE m.thread_id = ?
        AND t.owner_id = ?
      ORDER BY m.id DESC
      LIMIT 100
    `).bind(requestedThreadId, userId).all();

    const messages = (result.results || [])
      .reverse()
      .map(row => ({
        id: Number(row.id),
        role: row.role,
        content: row.content,
        createdAt: row.created_at
      }));

    return successResponse({
      messages,
      threadId: requestedThreadId,
      assistant: "NAVI",
      version: NAVI_VERSION
    }, corsOrigin);

  } catch (error) {
    logError("History loading failed", error);

    return errorResponse(
      "خواندن تاریخچه گفت‌وگو ناموفق بود.",
      500,
      corsOrigin,
      { diagnostic: diagnostic(error) }
    );
  }
}

// ======================================
// SAVE A USER MESSAGE TO APPROVED MEMORY
// ======================================

async function handleSaveMessageMemory({
  request,
  env,
  origin,
  corsOrigin
}) {
  const auth = await authorize(request, env, origin, corsOrigin);
  if (!auth.valid) return auth.response;
  const userId = auth.user.id;

  if (!env.NAVA_DB) {
    return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 500, corsOrigin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return errorResponse("اطلاعات ارسالی معتبر نیست.", 400, corsOrigin);
  }

  if (!isObject(input)) {
    return errorResponse("ساختار اطلاعات ارسالی معتبر نیست.", 400, corsOrigin);
  }

  const messageId = Number(input.messageId);
  const threadId = String(input.threadId || "").trim();

  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !threadId || threadId.length > 128) {
    return errorResponse("شناسه پیام یا گفت‌وگو معتبر نیست.", 400, corsOrigin);
  }

  try {
    const row = await env.NAVA_DB.prepare(`
      SELECT m.id, m.content, t.project_id
      FROM navi_chat_messages_v1 AS m
      INNER JOIN navi_chat_threads_v1 AS t
        ON t.thread_id = m.thread_id
      WHERE m.id = ?
        AND m.thread_id = ?
        AND m.role = 'user'
        AND t.owner_id = ?
      LIMIT 1
    `).bind(messageId, threadId, userId).first();

    if (!row) {
      return errorResponse("پیام انتخاب‌شده پیدا نشد یا متعلق به این گفت‌وگو نیست.", 404, corsOrigin);
    }

    const memoryValue = String(row.content || "").trim();

    if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
      return errorResponse("متن پیام بیش از ۱۲۰۰۰ نویسه است و ذخیره نشد.", 413, corsOrigin);
    }

    if (memoryValue.length < 8) {
      return errorResponse("این پیام برای ذخیره در حافظه بیش از حد کوتاه است.", 400, corsOrigin);
    }

    if (containsSensitiveInformation(memoryValue)) {
      return errorResponse("این پیام شامل اطلاعات حساس است و در حافظه ذخیره نمی‌شود.", 400, corsOrigin);
    }

    const result = await saveNaviMemoryFact(
      env.NAVA_DB,
      memoryValue,
      "پیام ذخیره‌شده از گفتگو",
      "manual_message_save",
      userId,
      row.project_id || "project-general"
    );

    return successResponse({
      action: "manual_message_save",
      messageId,
      duplicate: Boolean(result.duplicate),
      saved: !result.duplicate,
      memory: result,
      message: result.duplicate
        ? "این پیام یا اطلاعات مشابه آن از قبل در حافظه وجود دارد."
        : "پیام انتخاب‌شده در حافظه تأییدشده NAVI ذخیره شد."
    }, corsOrigin);

  } catch (error) {
    logError("Manual message memory save failed", error);
    const sensitive = String(error?.message || "").includes("Sensitive information");
    return errorResponse(
      sensitive
        ? "این پیام شامل اطلاعات حساس است و ذخیره نشد."
        : "ذخیره پیام در حافظه NAVI ناموفق بود.",
      sensitive ? 400 : 500,
      corsOrigin,
      { diagnostic: diagnostic(error) }
    );
  }
}


// ======================================
// MEMORY MANAGEMENT
// ======================================

async function handleMemory({
  request,
  env,
  origin,
  corsOrigin,
  url
}) {
  const auth = await authorize(
    request,
    env,
    origin,
    corsOrigin
  );

  if (!auth.valid) return auth.response;
  const userId = auth.user.id;
  const projectId = String(url?.searchParams.get("project_id") || "project-general").slice(0,100);

  if (!env.NAVA_DB) {
    return errorResponse(
      "اتصال دیتابیس NAVI تنظیم نشده است.",
      500,
      corsOrigin
    );
  }

  try {
    await ensureNaviMainThread(env.NAVA_DB, userId);
    const activeProject = await env.NAVA_DB.prepare("SELECT project_id FROM navi_projects_v1 WHERE project_id=? AND owner_id=? LIMIT 1").bind(projectId,userId).first();
    if (!activeProject) return errorResponse("پروژه انتخاب‌شده پیدا نشد.",404,corsOrigin);

    // GET: approved + pending

    if (request.method === "GET") {
      const project = await env.NAVA_DB.prepare("SELECT project_id FROM navi_projects_v1 WHERE project_id=? AND owner_id=? LIMIT 1").bind(projectId,userId).first();
      if (!project) return errorResponse("پروژه انتخاب‌شده پیدا نشد.",404,corsOrigin);
      const [memories,proposals,archived] = await Promise.all([
        getNaviApprovedMemory(env.NAVA_DB,userId,projectId),
        getNaviPendingMemory(env.NAVA_DB,userId,projectId),
        getNaviArchivedMemory(env.NAVA_DB,userId,projectId)
      ]);
      return successResponse({ memories,proposals,archived,count:memories.length,proposalCount:proposals.length,archivedCount:archived.length,projectId,version:NAVI_VERSION },corsOrigin);
    }
    let input;

    try {
      input = await request.json();
    } catch {
      return errorResponse(
        "اطلاعات ارسالی معتبر نیست.",
        400,
        corsOrigin
      );
    }

    if (!isObject(input)) {
      return errorResponse(
        "ساختار اطلاعات ارسالی معتبر نیست.",
        400,
        corsOrigin
      );
    }

    const action = String(
      input.action || ""
    ).toLowerCase();

    const id = Number(input.id);

    if (
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return errorResponse(
        "شناسه حافظه معتبر نیست.",
        400,
        corsOrigin
      );
    }

    // ----------------------------------
    // UPDATE APPROVED MEMORY
    // ----------------------------------

    if (action === "update") {
      const memoryValue = safeNaviText(
        input.memory_value || "",
        NAVI_MAX_MEMORY_VALUE + 1
      );
      if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }

      if (!memoryValue) {
        return errorResponse(
          "متن حافظه نمی‌تواند خالی باشد.",
          400,
          corsOrigin
        );
      }

      if (containsSensitiveInformation(memoryValue)) {
        return errorResponse(
          "ذخیره اطلاعات حساس در حافظه مجاز نیست.",
          400,
          corsOrigin
        );
      }

      const existing = await env.NAVA_DB.prepare(`
        SELECT id
        FROM navi_memory_facts_v1
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
        LIMIT 1
      `).bind(
        id,
        userId,
        projectId
      ).first();

      if (!existing) {
        return errorResponse(
          "این یادداشت در حافظه پیدا نشد.",
          404,
          corsOrigin
        );
      }

      const duplicate = await env.NAVA_DB.prepare(`
        SELECT id
        FROM navi_memory_facts_v1
        WHERE owner_id = ?
          AND memory_value = ?
          AND status = 'approved'
          AND id != ?
          AND (project_id IS NULL OR project_id = ?)
        LIMIT 1
      `).bind(
        userId,
        memoryValue,
        id,
        projectId
      ).first();

      if (duplicate) {
        return errorResponse(
          "یادداشت مشابهی از قبل در حافظه وجود دارد.",
          409,
          corsOrigin
        );
      }

      const updateResult = await env.NAVA_DB.prepare(`
        UPDATE navi_memory_facts_v1
        SET memory_value = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
      `).bind(
        memoryValue,
        id,
        userId,
        projectId
      ).run();

      // Confirm that exactly the requested approved record was updated.
      // Never report success when the database did not change that row.
      if (
        !updateResult?.success ||
        Number(updateResult.meta?.changes || 0) !== 1
      ) {
        return errorResponse(
          "این یادداشت تغییر نکرد؛ فهرست حافظه را تازه‌سازی و دوباره تلاش کن.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "update",
        id,
        message: "فقط همین یادداشت با موفقیت ویرایش شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // DELETE APPROVED MEMORY
    // ----------------------------------

    if (action === "delete") {
      const result = await env.NAVA_DB.prepare(`
        DELETE FROM navi_memory_facts_v1
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
      `).bind(
        id,
        userId,
        projectId
      ).run();

      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse(
          "این یادداشت پیدا نشد یا قبلاً حذف شده است.",
          404,
          corsOrigin
        );
      }

      return successResponse({
        action: "delete",
        id,
        message: "فقط همین یادداشت از حافظه حذف شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // UPDATE PENDING PROPOSAL
    // ----------------------------------

    if (action === "update_pending") {
      const memoryValue = safeNaviText(
        input.memory_value || "",
        NAVI_MAX_MEMORY_VALUE + 1
      );
      if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }

      if (!memoryValue) {
        return errorResponse(
          "متن پیشنهاد نمی‌تواند خالی باشد.",
          400,
          corsOrigin
        );
      }

      if (containsSensitiveInformation(memoryValue)) {
        return errorResponse(
          "این پیشنهاد شامل اطلاعات حساس است.",
          400,
          corsOrigin
        );
      }

      const result = await updateNaviMemoryProposal(
        env.NAVA_DB,
        id,
        memoryValue,
        userId,
        projectId
      );

      if (result.notFound) {
        return errorResponse(
          "این پیشنهاد پیدا نشد یا قبلاً بررسی شده است.",
          404,
          corsOrigin
        );
      }

      if (result.duplicate) {
        return errorResponse(
          "این اطلاعات از قبل در حافظه یا پیشنهادها وجود دارد.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "update_pending",
        id,
        message: "پیشنهاد حافظه ویرایش شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // APPROVE PROPOSAL
    // ----------------------------------

    if (action === "approve") {
      const editedValue =
        typeof input.memory_value === "string"
          ? safeNaviText(
              input.memory_value,
              NAVI_MAX_MEMORY_VALUE + 1
            )
          : null;

      if (editedValue && editedValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }
      if (
        editedValue &&
        containsSensitiveInformation(editedValue)
      ) {
        return errorResponse(
          "این پیشنهاد شامل اطلاعات حساس است.",
          400,
          corsOrigin
        );
      }

      const result = await approveNaviMemoryProposal(
        env.NAVA_DB,
        id,
        editedValue,
        userId,
        projectId
      );

      if (result.notFound) {
        return errorResponse(
          "این پیشنهاد پیدا نشد یا قبلاً بررسی شده است.",
          404,
          corsOrigin
        );
      }

      if (result.tooLong) {
        return errorResponse("ترکیب این پیشنهاد با حافظه قبلی از سقف ۱۲۰۰۰ نویسه عبور می‌کند؛ پیشنهاد را کوتاه‌تر و دوباره تأیید کن.", 413, corsOrigin);
      }
      if (result.duplicate) {
        return errorResponse(
          "این اطلاعات از قبل در حافظه تأییدشده وجود دارد.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "approve",
        id,
        message: "پیشنهاد با تأیید شما به حافظه بلندمدت اضافه شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // REJECT PROPOSAL
    // ----------------------------------

    if (action === "reject") {
      const result = await rejectNaviMemoryProposal(
// NAVI - Authentication, Chat, History and Smart Memory
// Version: 1.0

import { GEMINI_MODEL, ALLOWED_ORIGIN } from "./config.js";
import { json, safeNaviText } from "./shared.js";

import {
  createNaviSession,
  verifyNaviPassword,
  validateNaviPasswordVerifier,
  verifyNaviChallengeProof,
  authorizeNaviRequest
} from "./navi-auth.js";

import {
  getNaviMainThreadId,
  ensureNaviMainThread,
  getNaviDbHistory,
  getNaviPreviousExplicitMemoryValue,
  searchNaviConversationHistory,
  getNaviApprovedMemory,
  getNaviPendingMemory,
  getNaviArchivedMemory,
  parseNaviMemoryCommand,
  saveNaviMemoryFact,
  createNaviMemoryProposal,
  approveNaviMemoryProposal,
  rejectNaviMemoryProposal,
  updateNaviMemoryProposal,
  saveNaviConversation,
  prepareNaviHistory
} from "./navi-memory.js";

// ======================================
// CONSTANTS
// ======================================

const NAVI_VERSION = "1.0";
const NAVI_MAX_MESSAGE = 12000;
const NAVI_MAX_MEMORY_VALUE = 12000;
const NAVI_MAX_PROPOSALS = 1;
const NAVI_GEMINI_TIMEOUT = 60000;

// ======================================
// GENERAL HELPERS
// ======================================

function diagnostic(error) {
  return String(
    error?.message || error || "Unknown error"
  ).slice(0, 500);
}

function logError(label, error) {
  console.error("[NAVI] " + label + ":", error);
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function errorResponse(
  message,
  status,
  corsOrigin,
  extra = {}
) {
  return json({
    success: false,
    error: message,
    ...extra
  }, status, corsOrigin);
}

function successResponse(
  data,
  corsOrigin,
  status = 200
) {
  return json({
    success: true,
    ...data
  }, status, corsOrigin);
}

// ======================================
// TEXT NORMALIZATION
// ======================================

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length > 1);
}

// ======================================
// SENSITIVE INFORMATION FILTER
// ======================================

function containsSensitiveInformation(value) {
  const text = String(value || "");

  const patterns = [
    /\bpassword\b/i,
    /\bpasswd\b/i,
    /\bapi[_ -]?key\b/i,
    /\baccess[_ -]?token\b/i,
    /\brefresh[_ -]?token\b/i,
    /\bsecret[_ -]?key\b/i,
    /\bprivate[_ -]?key\b/i,
    /\bclient[_ -]?secret\b/i,

    /رمز\s*(عبور|ورود)/i,
    /کلمه\s*عبور/i,
    /کلید\s*خصوصی/i,
    /توکن\s*(دسترسی|ورود|امنیتی)/i,
    /کلید\s*ای‌پی‌آی/i,
    /شماره\s*کارت/i,
    /شماره\s*حساب/i,
    /اطلاعات\s*بانکی/i,
    /cvv2/i,
    /رمز\s*دوم/i
  ];

  return patterns.some(pattern => pattern.test(text));
}

// ======================================
// MEMORY RELEVANCE
// ======================================

// Approved memory retrieval is model-semantic, not keyword-ranked.
// The server supplies a bounded, account-scoped candidate set; Gemini selects
// relevant facts by meaning in the same response request. This avoids a second
// model call and prevents generic word overlap (e.g. "است") from ranking facts.
export function selectRelevantMemories(message, memories) {
  if (!Array.isArray(memories)) return [];

  const safe = memories.filter(item =>
    item &&
    item.memory_value &&
    !containsSensitiveInformation(item.memory_value)
  );

  const isFoundational = item => {
    const key = normalizeText(item.memory_key || "");
    const value = normalizeText(item.memory_value || "");
    return (
      /نام کاربر|هویت دستیار|ترجیحات پاسخ|پروژه نوا|پروژه ناوی|nava|navi/.test(key) ||
      /پروژه نوا|پروژه ناوی|دستیار شخصی|ترجیحات پاسخ|پلتفرم نوا/.test(value)
    );
  };

  // Keep identity/project anchors first, then retain the database's
  // updated_at-desc order. Do not use query-token overlap as a relevance gate.
  const foundational = safe.filter(isFoundational);
  const foundationalIds = new Set(foundational.map(item => item.id));
  const remaining = safe.filter(item => !foundationalIds.has(item.id));
  return [...foundational, ...remaining].slice(0, 80);
}

function buildMemoryContext(memories) {
  if (!memories.length) {
    return "No approved memory candidates are available for this account.";
  }

  const maxContextChars = 36000;
  const lines = [];
  let usedChars = 0;
  let omitted = 0;

  for (const item of memories) {
    const title = safeNaviText(item.memory_key || "یادداشت", 150);
    const value = safeNaviText(item.memory_value || "", NAVI_MAX_MEMORY_VALUE);
    const line = `- [memory id: ${item.id}] ${title}: ${value}`;
    if (usedChars + line.length > maxContextChars) {
      omitted += 1;
      continue;
    }
    lines.push(line);
    usedChars += line.length + 1;
  }

  if (omitted) {
    lines.push(`[توجه: ${omitted} یادداشت دیگر به دلیل محدودیت اندازه زمینه در این نوبت ارسال نشدند.]`);
  }

  return lines.join("\n");
}

// ======================================
// GEMINI RESPONSE PARSER
// ======================================

export function parseNaviGeminiResponse(rawText) {
  const text = String(rawText || "").trim();

  if (!text) {
    return { reply: "", memoryProposals: [], structured: false };
  }

  // Gemini normally returns a JSON object because responseMimeType is set.
  // Be tolerant of harmless Markdown fences or short text surrounding it.
  const candidates = [];
  const unfenced = text
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  candidates.push(unfenced);

  const firstBrace = unfenced.indexOf("{");
  if (firstBrace >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = firstBrace; index < unfenced.length; index += 1) {
      const char = unfenced[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(unfenced.slice(firstBrace, index + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!isObject(parsed) || typeof parsed.reply !== "string") continue;

      return {
        reply: safeNaviText(parsed.reply, 20000),
        memoryProposals: Array.isArray(parsed.memoryProposals)
          ? parsed.memoryProposals
          : [],
        structured: true
      };
    } catch {
      // Try the next bounded candidate. Never evaluate or repair model text.
    }
  }

  // Plain-text fallback remains a user-visible answer, but cannot create
  // memory proposals because no structured proposal data was supplied.
  return {
    reply: safeNaviText(unfenced, 20000),
    memoryProposals: [],
    structured: false
  };
}

// ======================================
// MEMORY PROPOSAL VALIDATION
// ======================================

export function shouldSuppressNaviMemoryProposals(message) {
  const text = normalizeText(message);

  // A negative consent instruction always overrides automatic memory suggestions.
  const hasNoSaveInstruction =
    /بدون\s+(?:تأیید|تایید)(?:\s+نهایی)?(?:\s+من)?[\s\S]{0,120}(?:ذخیره|ثبت|اضافه)\s+نکن/u.test(text) ||
    /(?:فعلاً|فعلا)[\s\S]{0,100}(?:ذخیره|ثبت|اضافه)\s+نکن/u.test(text) ||
    /(?:ذخیره|ثبت|اضافه)\s+نکن[؛؛،,\s]*$/u.test(text);

  return hasNoSaveInstruction;
}

// Negative consent must be checked BEFORE the explicit-command parser.
// Otherwise a request phrased as adding a fact can bypass the proposal filter.
export function parseNaviMemoryCommandSafely(message) {
  if (shouldSuppressNaviMemoryProposals(message)) {
    return { isCommand: false, value: "" };
  }

  return parseNaviMemoryCommand(message);
}

// Deterministic safety net for clear, first-person durable preferences.
// Gemini remains the primary extractor; this only fills an empty proposal list.
export function extractNaviDeterministicMemoryProposal(message) {
  const value = safeNaviText(message || "", NAVI_MAX_MEMORY_VALUE).trim();
  if (!value || value.length < 20 || value.length > NAVI_MAX_MEMORY_VALUE) return [];
  if (shouldSuppressNaviMemoryProposals(value) || containsSensitiveInformation(value)) return [];

  // Do not turn questions, hypotheticals, quotations, or examples into personal facts.
  if (/[؟?]/u.test(value) || /(?:فرض کن|مثلاً|برای مثال|به‌عنوان نمونه|اگر\s)/u.test(value)) return [];
  if (/[«»“”]/u.test(value)) return [];

  const durableFirstPersonPatterns = [
    /(?:من\s+)?ترجیح\s+می[\s\u200c]*(?:دهم|دم|کنم)/u,
    /(?:من\s+)?دوست\s+دارم\s+(?:همیشه|معمولاً|معمولا|در\s+کار|در\s+پروژه)/u,
    /(?:اولویت|هدف|رویکرد|اصل)\s+(?:اصلی\s+)?من\s+(?:این\s+است|اینکه)/u,
    /برای\s+من\s+(?:همیشه\s+)?(?:مهم\s+است|اهمیت\s+دارد)/u,
    /من\s+(?:همیشه|معمولاً|معمولا)\s+(?:ترجیح|سعی|تلاش)/u
  ];
  if (!durableFirstPersonPatterns.some(pattern => pattern.test(value))) return [];

  return [{
    title: "ترجیح و رویکرد پایدار کاربر",
    value
  }];
}

function normalizeMemoryProposals(proposals) {
  if (!Array.isArray(proposals)) return [];

  const result = [];
  const seen = new Set();

  for (
    const item of proposals.slice(0, NAVI_MAX_PROPOSALS)
  ) {
    if (!isObject(item)) continue;

    const value = safeNaviText(
      item.value || "",
      NAVI_MAX_MEMORY_VALUE + 1
    );
    if (value.length > NAVI_MAX_MEMORY_VALUE) continue;

    const title = safeNaviText(
      item.title || "یادداشت کاربر",
      150
    );

    if (!value || value.length < 8) continue;

    if (containsSensitiveInformation(value)) {
      continue;
    }

    const normalized = normalizeText(value);

    if (seen.has(normalized)) continue;

    seen.add(normalized);

    result.push({
      title: title || "یادداشت کاربر",
      value
    });
  }

  return result;
}

// ======================================
// AUTHORIZATION
// ======================================

async function authorize(request, env, origin, corsOrigin) {
  if (origin !== ALLOWED_ORIGIN) {
    return {
      valid: false,
      response: errorResponse(
        "دسترسی غیرمجاز است.",
        403,
        corsOrigin
      )
    };
  }

  const auth = await authorizeNaviRequest(
    request,
    env
  );

  if (!auth.valid) {
    return {
      valid: false,
      response: errorResponse(
        auth.error || "دسترسی غیرمجاز است.",
        auth.status || 401,
        corsOrigin,
        { code: auth.code }
      )
    };
  }

  return { valid: true, user: auth.user };
}

// ======================================
// LOGIN
// ======================================

function naviAuthBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function handleNaviAuthChallenge({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("دیتابیس حساب‌های ناوی در دسترس نیست.", 503, corsOrigin);

  let input;
  try { input = await request.json(); } catch { return errorResponse("اطلاعات ورود معتبر نیست.", 400, corsOrigin); }
  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase() || "owner";
  if (username !== "owner" && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
  }

  try {
    const row = username === "owner"
      ? await env.NAVA_DB.prepare("SELECT id, username, password_hash, role, status FROM users WHERE id = ? LIMIT 1").bind("owner").first()
      : await env.NAVA_DB.prepare("SELECT id, username, password_hash, role, status FROM users WHERE username = ? LIMIT 1").bind(username).first();

    if (!row || row.status !== "active" || (username === "owner" && row.role !== "owner")) {
      return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
    }

    // The owner's pre-existing Worker secret is used only for the one-time
    // transition when no D1 verifier has been enrolled yet.
    if (username === "owner" && !row.password_hash) {
      return successResponse({ mode: "legacy" }, corsOrigin);
    }

    const parsed = validateNaviPasswordVerifier(row.password_hash);
    if (!parsed) return errorResponse("ساختار امن رمز این حساب معتبر نیست؛ نیاز به بازیابی امن دارد.", 409, corsOrigin);

    const now = Date.now();
    await env.NAVA_DB.prepare("DELETE FROM navi_auth_challenges WHERE expires_at <= ? OR used_at IS NOT NULL").bind(now).run();
    const challengeId = crypto.randomUUID();
    const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = naviAuthBase64Url(nonceBytes);
    const expiresAt = now + 120000;
    await env.NAVA_DB.prepare(
      "INSERT INTO navi_auth_challenges (challenge_id, user_id, nonce, expires_at, used_at) VALUES (?, ?, ?, ?, NULL)"
    ).bind(challengeId, String(row.id), nonce, expiresAt).run();

    return successResponse({
      mode: "challenge",
      challengeId,
      nonce,
      salt: parsed.salt,
      iterations: parsed.iterations,
      expiresIn: 120
    }, corsOrigin);
  } catch (error) {
    logError("NAVI login challenge failed", error);
    return errorResponse("آماده‌سازی ورود امن ممکن نشد. ابتدا ساختار امنیتی دیتابیس را به‌روزرسانی کن.", 503, corsOrigin);
  }
}

async function handleLogin({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (!env.NAVI_SESSION_SECRET) return errorResponse("تنظیمات امنیتی نشست ناوی کامل نیست.", 500, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("دیتابیس حساب‌های ناوی در دسترس نیست.", 503, corsOrigin);

  let input;
  try { input = await request.json(); } catch { return errorResponse("اطلاعات ورود معتبر نیست.", 400, corsOrigin); }

  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase() || "owner";
  if (username !== "owner" && !/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
  }

  try {
    let row = username === "owner"
      ? await env.NAVA_DB.prepare("SELECT id, username, display_name, password_hash, role, status FROM users WHERE id = ? LIMIT 1").bind("owner").first()
      : await env.NAVA_DB.prepare("SELECT id, username, display_name, password_hash, role, status FROM users WHERE username = ? LIMIT 1").bind(username).first();

    if (!row || row.status !== "active" || (username === "owner" && row.role !== "owner")) {
      // Retain the pre-migration owner-only fallback if the owner row has not
      // yet been created. No invited account can use this path.
      if (username === "owner" && !row && await verifyNaviPassword(input?.password || "", env.NAVI_OWNER_PASSWORD)) {
        const user = { id: "owner", username: "owner", display_name: "مالک", role: "owner" };
        const token = await createNaviSession(env.NAVI_SESSION_SECRET, user);
        return successResponse({ token, expiresIn: 43200, assistant: "NAVI", version: NAVI_VERSION,
          user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role } }, corsOrigin);
      }
      return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
    }

    if (username === "owner" && !row.password_hash) {
      // One-time legacy owner authentication. The browser supplies the PBKDF2
      // verifier it computed locally; the server never runs PBKDF2.
      const password = typeof input?.password === "string" ? input.password : "";
      const verifier = validateNaviPasswordVerifier(input?.passwordHash);
      if (!password || password.length > 256 || !verifier ||
          !await verifyNaviPassword(password, env.NAVI_OWNER_PASSWORD)) {
        return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
      }
      const provision = await env.NAVA_DB.prepare(
        "UPDATE users SET username = COALESCE(NULLIF(username, ''), 'owner'), password_hash = ?, role = 'owner', status = 'active' WHERE id = ? AND (password_hash IS NULL OR password_hash = '')"
      ).bind(input.passwordHash, "owner").run();
      if (!provision?.success) throw new Error("Owner verifier enrollment was not confirmed.");
      if (Number(provision.meta?.changes || 0) !== 1) {
        const refreshed = await env.NAVA_DB.prepare(
          "SELECT password_hash, status, role FROM users WHERE id = ? LIMIT 1"
        ).bind("owner").first();
        if (!refreshed || refreshed.status !== "active" || refreshed.role !== "owner" ||
            refreshed.password_hash !== input.passwordHash) {
          return errorResponse("ثبت رمز مالک هم‌زمان تغییر کرده است؛ دوباره تلاش کن.", 409, corsOrigin);
        }
        row.password_hash = refreshed.password_hash;
      } else {
        row.password_hash = input.passwordHash;
      }
    } else {
      const challengeId = String(input?.challengeId || "");
      const proof = String(input?.proof || "");
      if (!/^[0-9a-f-]{36}$/i.test(challengeId) || proof.length > 128) {
        return errorResponse("درخواست ورود امن معتبر نیست؛ دوباره تلاش کن.", 401, corsOrigin);
      }
      // Atomic consume prevents the same challenge response from being replayed.
      const challenge = await env.NAVA_DB.prepare(
        "UPDATE navi_auth_challenges SET used_at = ? WHERE challenge_id = ? AND user_id = ? AND used_at IS NULL AND expires_at > ? RETURNING nonce"
      ).bind(Date.now(), challengeId, String(row.id), Date.now()).first();
      if (!challenge?.nonce) return errorResponse("درخواست ورود منقضی یا قبلاً استفاده شده است؛ دوباره تلاش کن.", 401, corsOrigin);
      const message = "navi-login|" + challengeId + "|" + username + "|" + challenge.nonce;
      if (!await verifyNaviChallengeProof(row.password_hash, message, proof)) {
        return errorResponse("نام کاربری یا رمز ورود صحیح نیست.", 401, corsOrigin);
      }
    }

    const user = {
      id: String(row.id),
      username: row.username || "owner",
      display_name: row.display_name || (username === "owner" ? "مالک" : row.username),
      role: row.role === "owner" ? "owner" : "user"
    };
    const token = await createNaviSession(env.NAVI_SESSION_SECRET, user);
    return successResponse({
      token, expiresIn: 43200, assistant: "NAVI", version: NAVI_VERSION,
      user: { id: user.id, username: user.username, displayName: user.display_name, role: user.role }
    }, corsOrigin);
  } catch (error) {
    logError("Login failed", error);
    return errorResponse("ورود به ناوی ناموفق بود.", 500, corsOrigin);
  }
}

// Public registration requests are stored as pending; only the owner can approve them.
async function handleNaviRegistration({ request, env, origin, corsOrigin }) {
  if (origin !== ALLOWED_ORIGIN) return errorResponse("مبدأ درخواست مجاز نیست.", 403, corsOrigin);
  if (request.method !== "POST") return errorResponse("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 503, corsOrigin);

  let input;
  try { input = await request.json(); }
  catch { return errorResponse("اطلاعات درخواست عضویت معتبر نیست.", 400, corsOrigin); }

  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase();
  const displayName = safeNaviText(input?.displayName || "", 80).trim();
  const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || username === "owner") {
    return errorResponse("نام کاربری باید ۳ تا ۴۰ نویسه انگلیسی و بدون فاصله باشد.", 400, corsOrigin);
  }
  if (displayName.length < 2 || displayName.length > 80 || !validateNaviPasswordVerifier(passwordHash)) {
    return errorResponse("نام نمایشی یا رمز امن واردشده معتبر نیست.", 400, corsOrigin);
  }

  try {
    const existingUser = await env.NAVA_DB.prepare(
      "SELECT id FROM users WHERE username = ? LIMIT 1"
    ).bind(username).first();
    if (existingUser) return errorResponse("این نام کاربری قبلاً استفاده شده است.", 409, corsOrigin);

    const existingRequest = await env.NAVA_DB.prepare(
      "SELECT request_id FROM navi_registration_requests WHERE username = ? AND status = 'pending' LIMIT 1"
    ).bind(username).first();
    if (existingRequest) return errorResponse("برای این نام کاربری یک درخواست در انتظار بررسی وجود دارد.", 409, corsOrigin);

    const requestId = crypto.randomUUID();
    const result = await env.NAVA_DB.prepare(
      "INSERT INTO navi_registration_requests (request_id, username, display_name, password_hash, status) VALUES (?, ?, ?, ?, 'pending')"
    ).bind(requestId, username, displayName, passwordHash).run();
    if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
      throw new Error("Registration request insert was not confirmed.");
    }
    return successResponse({
      submitted: true,
      request: { requestId, username, displayName, status: "pending" },
      message: "درخواست عضویت ثبت شد و پس از بررسی مالک نتیجه مشخص می‌شود."
    }, corsOrigin, 201);
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || ""))) {
      return errorResponse("برای این نام کاربری درخواست دیگری ثبت شده یا قبلاً استفاده شده است.", 409, corsOrigin);
    }
    logError("NAVI registration request failed", error);
    return errorResponse("ثبت درخواست عضویت انجام نشد. ساختار دیتابیس باید به‌روزرسانی شود.", 503, corsOrigin);
  }
}

// Owner-only account administration and registration review.
async function handleNaviUsers({ request, env, origin, corsOrigin }) {
  const auth = await authorize(request, env, origin, corsOrigin);
  if (!auth.valid) return auth.response;
  if (auth.user.role !== "owner") return errorResponse("فقط مالک می‌تواند حساب‌ها را مدیریت کند.", 403, corsOrigin);
  if (!env.NAVA_DB) return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 500, corsOrigin);

  if (request.method === "GET") {
    try {
      const [users, requests] = await Promise.all([
        env.NAVA_DB.prepare(
          "SELECT id, username, display_name, role, status, created_at, updated_at FROM users ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at DESC"
        ).all(),
        env.NAVA_DB.prepare(
          "SELECT request_id, username, display_name, status, created_at FROM navi_registration_requests WHERE status = 'pending' ORDER BY created_at ASC"
        ).all()
      ]);
      return successResponse({
        users: users.results || [],
        registrationRequests: requests.results || []
      }, corsOrigin);
    } catch (error) {
      logError("NAVI account list failed", error);
      return errorResponse("دریافت فهرست حساب‌ها ناموفق بود. اگر این قابلیت تازه نصب شده، Migration عضویت هنوز اجرا نشده است.", 500, corsOrigin);
    }
  }

  if (request.method !== "POST") {
    return errorResponse("روش درخواست پشتیبانی نمی‌شود.", 405, corsOrigin);
  }

  let input;
  try { input = await request.json(); }
  catch { return errorResponse("اطلاعات حساب معتبر نیست.", 400, corsOrigin); }

  const action = String(input?.action || "create").toLowerCase();

  if (action === "review_registration") {
    const requestId = String(input?.requestId || "").trim();
    const decision = String(input?.decision || "").toLowerCase();
    if (!requestId || requestId.length > 128 || !["approve", "reject"].includes(decision)) {
      return errorResponse("درخواست یا تصمیم مدیریتی معتبر نیست.", 400, corsOrigin);
    }
    try {
      const pending = await env.NAVA_DB.prepare(
        "SELECT request_id, username, display_name, password_hash FROM navi_registration_requests WHERE request_id = ? AND status = 'pending' LIMIT 1"
      ).bind(requestId).first();
      if (!pending) return errorResponse("این درخواست قبلاً بررسی شده یا وجود ندارد.", 404, corsOrigin);

      if (decision === "reject") {
        const rejected = await env.NAVA_DB.prepare(
          "UPDATE navi_registration_requests SET status = 'rejected', password_hash = '', reviewed_at = datetime('now'), reviewed_by = ? WHERE request_id = ? AND status = 'pending'"
        ).bind(auth.user.id, requestId).run();
        if (!rejected?.success || Number(rejected.meta?.changes || 0) !== 1) {
          return errorResponse("رد درخواست انجام نشد؛ فهرست را تازه‌سازی کن.", 409, corsOrigin);
        }
        return successResponse({ reviewed: true, decision: "rejected", message: "درخواست عضویت رد شد." }, corsOrigin);
      }

      const existing = await env.NAVA_DB.prepare(
        "SELECT id FROM users WHERE username = ? LIMIT 1"
      ).bind(pending.username).first();
      if (existing) return errorResponse("این نام کاربری در این فاصله توسط حساب دیگری استفاده شده است؛ درخواست را رد یا با متقاضی هماهنگ کن.", 409, corsOrigin);

      const userId = crypto.randomUUID();
      if (typeof env.NAVA_DB.batch !== "function") {
        return errorResponse("دیتابیس از عملیات اتمی تأیید عضویت پشتیبانی نمی‌کند؛ هیچ تغییری انجام نشد.", 503, corsOrigin);
      }
      const results = await env.NAVA_DB.batch([
        env.NAVA_DB.prepare(
          "INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) SELECT ?, 'navi-local', ?, display_name, username, password_hash, 'user', 'active' FROM navi_registration_requests WHERE request_id = ? AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM users WHERE username = (SELECT username FROM navi_registration_requests WHERE request_id = ?))"
        ).bind(userId, "navi-registration:" + userId, requestId, requestId),
        env.NAVA_DB.prepare(
          "UPDATE navi_registration_requests SET status = 'approved', password_hash = '', reviewed_at = datetime('now'), reviewed_by = ? WHERE request_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM users WHERE id = ?)"
        ).bind(auth.user.id, requestId, userId)
      ]);
      const inserted = Number(results?.[0]?.meta?.changes || 0);
      const reviewed = Number(results?.[1]?.meta?.changes || 0);
      if (inserted !== 1 || reviewed !== 1) {
        return errorResponse("تأیید انجام نشد؛ ممکن است درخواست هم‌زمان بررسی شده باشد. فهرست را تازه‌سازی کن.", 409, corsOrigin);
      }
      return successResponse({
        reviewed: true,
        decision: "approved",
        user: { id: userId, username: pending.username, displayName: pending.display_name, role: "user", status: "active" },
        message: "درخواست تأیید شد و حساب کاربری فعال است."
      }, corsOrigin);
    } catch (error) {
      if (/unique|constraint/i.test(String(error?.message || ""))) {
        return errorResponse("نام کاربری دیگر در دسترس نیست؛ درخواست تأیید نشد.", 409, corsOrigin);
      }
      logError("NAVI registration review failed", error);
      return errorResponse("بررسی درخواست عضویت ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action === "reset_password") {
    const userId = String(input?.userId || "").trim();
    const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
    if (!userId || userId.length > 128 || userId === "owner" || !validateNaviPasswordVerifier(passwordHash)) {
      return errorResponse("شناسه حساب یا رمز امن جدید معتبر نیست.", 400, corsOrigin);
    }
    try {
      const result = await env.NAVA_DB.prepare(
        "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND role = 'user'"
      ).bind(passwordHash, userId).run();
      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse("حساب موردنظر پیدا نشد یا قابل بازنشانی نیست.", 404, corsOrigin);
      }
      return successResponse({ updated: true, user: { id: userId }, message: "رمز حساب با موفقیت بازنشانی شد." }, corsOrigin);
    } catch (error) {
      logError("NAVI account password reset failed", error);
      return errorResponse("بازنشانی رمز حساب ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action === "set_status") {
    const userId = String(input?.userId || "").trim();
    const status = String(input?.status || "").toLowerCase();
    if (!userId || userId.length > 128 || !["active", "disabled"].includes(status)) {
      return errorResponse("شناسه حساب یا وضعیت درخواستی معتبر نیست.", 400, corsOrigin);
    }
    if (userId === "owner") return errorResponse("حساب اصلی مالک از این بخش قابل غیرفعال‌سازی نیست.", 400, corsOrigin);
    try {
      const result = await env.NAVA_DB.prepare(
        "UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ? AND role = 'user'"
      ).bind(status, userId).run();
      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse("حساب موردنظر پیدا نشد یا قابل تغییر نیست.", 404, corsOrigin);
      }
      return successResponse({
        updated: true,
        user: { id: userId, status },
        message: status === "disabled" ? "حساب غیرفعال شد." : "حساب دوباره فعال شد."
      }, corsOrigin);
    } catch (error) {
      logError("NAVI account status update failed", error);
      return errorResponse("تغییر وضعیت حساب ناموفق بود.", 500, corsOrigin);
    }
  }

  if (action !== "create") return errorResponse("عملیات مدیریت حساب معتبر نیست.", 400, corsOrigin);
  const username = safeNaviText(input?.username || "", 40).trim().toLowerCase();
  const displayName = safeNaviText(input?.displayName || "", 80).trim();
  const passwordHash = typeof input?.passwordHash === "string" ? input.passwordHash : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username) || username === "owner" ||
      displayName.length < 2 || !validateNaviPasswordVerifier(passwordHash)) {
    return errorResponse("نام نمایشی، نام کاربری یا ساختار رمز امن معتبر نیست.", 400, corsOrigin);
  }
  const id = crypto.randomUUID();
  try {
    const result = await env.NAVA_DB.prepare(
      "INSERT INTO users (id, auth_provider, auth_subject, display_name, username, password_hash, role, status) VALUES (?, 'navi-local', ?, ?, ?, ?, 'user', 'active')"
    ).bind(id, "navi-invite:" + id, displayName, username, passwordHash).run();
    if (!result.success || Number(result.meta?.changes || 0) !== 1) throw new Error("Account insert was not confirmed.");
    return successResponse({ user: { id, username, displayName, role: "user", status: "active" }, created: true }, corsOrigin, 201);
  } catch (error) {
    if (/unique|constraint/i.test(String(error?.message || ""))) return errorResponse("این نام کاربری قبلاً ثبت شده است.", 409, corsOrigin);
    logError("NAVI account creation failed", error);
    return errorResponse("ساخت حساب انجام نشد. ساختار دیتابیس حساب‌ها را بررسی کن.", 500, corsOrigin);
  }
}

// ======================================
// HISTORY
// ======================================

async function handleHistory({
  request,
  env,
  origin,
  corsOrigin,
  url
}) {
  const auth = await authorize(
    request,
    env,
    origin,
    corsOrigin
  );

  if (!auth.valid) return auth.response;
  const userId = auth.user.id;

  if (!env.NAVA_DB) {
    return errorResponse(
      "اتصال دیتابیس NAVI تنظیم نشده است.",
      500,
      corsOrigin
    );
  }

  try {
    await ensureNaviMainThread(env.NAVA_DB, userId);

    const requestedThreadId = String(url.searchParams.get("thread_id") || getNaviMainThreadId(userId));    const thread = await env.NAVA_DB.prepare(`
      SELECT thread_id FROM navi_chat_threads_v1
      WHERE thread_id = ? AND owner_id = ? LIMIT 1
    `).bind(requestedThreadId, userId).first();

    if (!thread) {
      return errorResponse("این گفت‌وگو پیدا نشد.", 404, corsOrigin);
    }

    const result = await env.NAVA_DB.prepare(`
      SELECT m.id, m.role, m.content, m.created_at
      FROM navi_chat_messages_v1 AS m
      INNER JOIN navi_chat_threads_v1 AS t
        ON t.thread_id = m.thread_id
      WHERE m.thread_id = ?
        AND t.owner_id = ?
      ORDER BY m.id DESC
      LIMIT 100
    `).bind(requestedThreadId, userId).all();

    const messages = (result.results || [])
      .reverse()
      .map(row => ({
        id: Number(row.id),
        role: row.role,
        content: row.content,
        createdAt: row.created_at
      }));

    return successResponse({
      messages,
      threadId: requestedThreadId,
      assistant: "NAVI",
      version: NAVI_VERSION
    }, corsOrigin);

  } catch (error) {
    logError("History loading failed", error);

    return errorResponse(
      "خواندن تاریخچه گفت‌وگو ناموفق بود.",
      500,
      corsOrigin,
      { diagnostic: diagnostic(error) }
    );
  }
}

// ======================================
// SAVE A USER MESSAGE TO APPROVED MEMORY
// ======================================

async function handleSaveMessageMemory({
  request,
  env,
  origin,
  corsOrigin
}) {
  const auth = await authorize(request, env, origin, corsOrigin);
  if (!auth.valid) return auth.response;
  const userId = auth.user.id;

  if (!env.NAVA_DB) {
    return errorResponse("اتصال دیتابیس NAVI تنظیم نشده است.", 500, corsOrigin);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return errorResponse("اطلاعات ارسالی معتبر نیست.", 400, corsOrigin);
  }

  if (!isObject(input)) {
    return errorResponse("ساختار اطلاعات ارسالی معتبر نیست.", 400, corsOrigin);
  }

  const messageId = Number(input.messageId);
  const threadId = String(input.threadId || "").trim();

  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !threadId || threadId.length > 128) {
    return errorResponse("شناسه پیام یا گفت‌وگو معتبر نیست.", 400, corsOrigin);
  }

  try {
    const row = await env.NAVA_DB.prepare(`
      SELECT m.id, m.content, t.project_id
      FROM navi_chat_messages_v1 AS m
      INNER JOIN navi_chat_threads_v1 AS t
        ON t.thread_id = m.thread_id
      WHERE m.id = ?
        AND m.thread_id = ?
        AND m.role = 'user'
        AND t.owner_id = ?
      LIMIT 1
    `).bind(messageId, threadId, userId).first();

    if (!row) {
      return errorResponse("پیام انتخاب‌شده پیدا نشد یا متعلق به این گفت‌وگو نیست.", 404, corsOrigin);
    }

    const memoryValue = String(row.content || "").trim();

    if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
      return errorResponse("متن پیام بیش از ۱۲۰۰۰ نویسه است و ذخیره نشد.", 413, corsOrigin);
    }

    if (memoryValue.length < 8) {
      return errorResponse("این پیام برای ذخیره در حافظه بیش از حد کوتاه است.", 400, corsOrigin);
    }

    if (containsSensitiveInformation(memoryValue)) {
      return errorResponse("این پیام شامل اطلاعات حساس است و در حافظه ذخیره نمی‌شود.", 400, corsOrigin);
    }

    const result = await saveNaviMemoryFact(
      env.NAVA_DB,
      memoryValue,
      "پیام ذخیره‌شده از گفتگو",
      "manual_message_save",
      userId,
      row.project_id || "project-general"
    );

    return successResponse({
      action: "manual_message_save",
      messageId,
      duplicate: Boolean(result.duplicate),
      saved: !result.duplicate,
      memory: result,
      message: result.duplicate
        ? "این پیام یا اطلاعات مشابه آن از قبل در حافظه وجود دارد."
        : "پیام انتخاب‌شده در حافظه تأییدشده NAVI ذخیره شد."
    }, corsOrigin);

  } catch (error) {
    logError("Manual message memory save failed", error);
    const sensitive = String(error?.message || "").includes("Sensitive information");
    return errorResponse(
      sensitive
        ? "این پیام شامل اطلاعات حساس است و ذخیره نشد."
        : "ذخیره پیام در حافظه NAVI ناموفق بود.",
      sensitive ? 400 : 500,
      corsOrigin,
      { diagnostic: diagnostic(error) }
    );
  }
}


// ======================================
// MEMORY MANAGEMENT
// ======================================

async function handleMemory({
  request,
  env,
  origin,
  corsOrigin,
  url
}) {
  const auth = await authorize(
    request,
    env,
    origin,
    corsOrigin
  );

  if (!auth.valid) return auth.response;
  const userId = auth.user.id;
  const projectId = String(url?.searchParams.get("project_id") || "project-general").slice(0,100);

  if (!env.NAVA_DB) {
    return errorResponse(
      "اتصال دیتابیس NAVI تنظیم نشده است.",
      500,
      corsOrigin
    );
  }

  try {
    await ensureNaviMainThread(env.NAVA_DB, userId);
    const activeProject = await env.NAVA_DB.prepare("SELECT project_id FROM navi_projects_v1 WHERE project_id=? AND owner_id=? LIMIT 1").bind(projectId,userId).first();
    if (!activeProject) return errorResponse("پروژه انتخاب‌شده پیدا نشد.",404,corsOrigin);

    // GET: approved + pending

    if (request.method === "GET") {
      const project = await env.NAVA_DB.prepare("SELECT project_id FROM navi_projects_v1 WHERE project_id=? AND owner_id=? LIMIT 1").bind(projectId,userId).first();
      if (!project) return errorResponse("پروژه انتخاب‌شده پیدا نشد.",404,corsOrigin);
      const [memories,proposals,archived] = await Promise.all([
        getNaviApprovedMemory(env.NAVA_DB,userId,projectId),
        getNaviPendingMemory(env.NAVA_DB,userId,projectId),
        getNaviArchivedMemory(env.NAVA_DB,userId,projectId)
      ]);
      return successResponse({ memories,proposals,archived,count:memories.length,proposalCount:proposals.length,archivedCount:archived.length,projectId,version:NAVI_VERSION },corsOrigin);
    }
    let input;

    try {
      input = await request.json();
    } catch {
      return errorResponse(
        "اطلاعات ارسالی معتبر نیست.",
        400,
        corsOrigin
      );
    }

    if (!isObject(input)) {
      return errorResponse(
        "ساختار اطلاعات ارسالی معتبر نیست.",
        400,
        corsOrigin
      );
    }

    const action = String(
      input.action || ""
    ).toLowerCase();

    const id = Number(input.id);

    if (
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      return errorResponse(
        "شناسه حافظه معتبر نیست.",
        400,
        corsOrigin
      );
    }

    // ----------------------------------
    // UPDATE APPROVED MEMORY
    // ----------------------------------

    if (action === "update") {
      const memoryValue = safeNaviText(
        input.memory_value || "",
        NAVI_MAX_MEMORY_VALUE + 1
      );
      if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }

      if (!memoryValue) {
        return errorResponse(
          "متن حافظه نمی‌تواند خالی باشد.",
          400,
          corsOrigin
        );
      }

      if (containsSensitiveInformation(memoryValue)) {
        return errorResponse(
          "ذخیره اطلاعات حساس در حافظه مجاز نیست.",
          400,
          corsOrigin
        );
      }

      const existing = await env.NAVA_DB.prepare(`
        SELECT id
        FROM navi_memory_facts_v1
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
        LIMIT 1
      `).bind(
        id,
        userId,
        projectId
      ).first();

      if (!existing) {
        return errorResponse(
          "این یادداشت در حافظه پیدا نشد.",
          404,
          corsOrigin
        );
      }

      const duplicate = await env.NAVA_DB.prepare(`
        SELECT id
        FROM navi_memory_facts_v1
        WHERE owner_id = ?
          AND memory_value = ?
          AND status = 'approved'
          AND id != ?
          AND (project_id IS NULL OR project_id = ?)
        LIMIT 1
      `).bind(
        userId,
        memoryValue,
        id,
        projectId
      ).first();

      if (duplicate) {
        return errorResponse(
          "یادداشت مشابهی از قبل در حافظه وجود دارد.",
          409,
          corsOrigin
        );
      }

      const updateResult = await env.NAVA_DB.prepare(`
        UPDATE navi_memory_facts_v1
        SET memory_value = ?,
            updated_at = datetime('now')
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
      `).bind(
        memoryValue,
        id,
        userId,
        projectId
      ).run();

      // Confirm that exactly the requested approved record was updated.
      // Never report success when the database did not change that row.
      if (
        !updateResult?.success ||
        Number(updateResult.meta?.changes || 0) !== 1
      ) {
        return errorResponse(
          "این یادداشت تغییر نکرد؛ فهرست حافظه را تازه‌سازی و دوباره تلاش کن.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "update",
        id,
        message: "فقط همین یادداشت با موفقیت ویرایش شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // DELETE APPROVED MEMORY
    // ----------------------------------

    if (action === "delete") {
      const result = await env.NAVA_DB.prepare(`
        DELETE FROM navi_memory_facts_v1
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
          AND (project_id IS NULL OR project_id = ?)
      `).bind(
        id,
        userId,
        projectId
      ).run();

      if (!result?.success || Number(result.meta?.changes || 0) !== 1) {
        return errorResponse(
          "این یادداشت پیدا نشد یا قبلاً حذف شده است.",
          404,
          corsOrigin
        );
      }

      return successResponse({
        action: "delete",
        id,
        message: "فقط همین یادداشت از حافظه حذف شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // UPDATE PENDING PROPOSAL
    // ----------------------------------

    if (action === "update_pending") {
      const memoryValue = safeNaviText(
        input.memory_value || "",
        NAVI_MAX_MEMORY_VALUE + 1
      );
      if (memoryValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }

      if (!memoryValue) {
        return errorResponse(
          "متن پیشنهاد نمی‌تواند خالی باشد.",
          400,
          corsOrigin
        );
      }

      if (containsSensitiveInformation(memoryValue)) {
        return errorResponse(
          "این پیشنهاد شامل اطلاعات حساس است.",
          400,
          corsOrigin
        );
      }

      const result = await updateNaviMemoryProposal(
        env.NAVA_DB,
        id,
        memoryValue,
        userId,
        projectId
      );

      if (result.notFound) {
        return errorResponse(
          "این پیشنهاد پیدا نشد یا قبلاً بررسی شده است.",
          404,
          corsOrigin
        );
      }

      if (result.duplicate) {
        return errorResponse(
          "این اطلاعات از قبل در حافظه یا پیشنهادها وجود دارد.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "update_pending",
        id,
        message: "پیشنهاد حافظه ویرایش شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // APPROVE PROPOSAL
    // ----------------------------------

    if (action === "approve") {
      const editedValue =
        typeof input.memory_value === "string"
          ? safeNaviText(
              input.memory_value,
              NAVI_MAX_MEMORY_VALUE + 1
            )
          : null;

      if (editedValue && editedValue.length > NAVI_MAX_MEMORY_VALUE) {
        return errorResponse("متن حافظه بیش از ۱۲۰۰۰ نویسه است؛ آن را کوتاه‌تر کن.", 413, corsOrigin);
      }
      if (
        editedValue &&
        containsSensitiveInformation(editedValue)
      ) {
        return errorResponse(
          "این پیشنهاد شامل اطلاعات حساس است.",
          400,
          corsOrigin
        );
      }

      const result = await approveNaviMemoryProposal(
        env.NAVA_DB,
        id,
        editedValue,
        userId,
        projectId
      );

      if (result.notFound) {
        return errorResponse(
          "این پیشنهاد پیدا نشد یا قبلاً بررسی شده است.",
          404,
          corsOrigin
        );
      }

      if (result.tooLong) {
        return errorResponse("ترکیب این پیشنهاد با حافظه قبلی از سقف ۱۲۰۰۰ نویسه عبور می‌کند؛ پیشنهاد را کوتاه‌تر و دوباره تأیید کن.", 413, corsOrigin);
      }
      if (result.duplicate) {
        return errorResponse(
          "این اطلاعات از قبل در حافظه تأییدشده وجود دارد.",
          409,
          corsOrigin
        );
      }

      return successResponse({
        action: "approve",
        id,
        message: "پیشنهاد با تأیید شما به حافظه بلندمدت اضافه شد."
      }, corsOrigin);
    }

    // ----------------------------------
    // REJECT PROPOSAL
    // ----------------------------------

    if (action === "reject") {
      const result = await rejectNaviMemoryProposal(
