// NAVI - Persistent Memory and Conversation History
// Version: 1.0

import { safeNaviText } from "./shared.js";

// ======================================
// CONSTANTS
// ======================================

export const NAVI_MAIN_THREAD_ID = "owner-main";
export const NAVI_OWNER_ID = "owner";
export function getNaviMainThreadId(ownerId = NAVI_OWNER_ID) { const id = String(ownerId || NAVI_OWNER_ID); return id === NAVI_OWNER_ID ? NAVI_MAIN_THREAD_ID : id + "-main"; }

const MEMORY_VALUE_LIMIT = 12000;
const MEMORY_KEY_LIMIT = 150;
const MEMORY_LIST_LIMIT = 200;

// ======================================
// TEXT HELPERS
// ======================================

function normalizeMemoryText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanMemoryValue(value) {
  const cleaned = safeNaviText(value || "", MEMORY_VALUE_LIMIT + 1);
  // Never store a silently truncated memory value.
  return cleaned.length > MEMORY_VALUE_LIMIT ? "" : cleaned;
}

function cleanMemoryTitle(value) {
  return safeNaviText(
    value || "یادداشت کاربر",
    MEMORY_KEY_LIMIT
  ) || "یادداشت کاربر";
}

function createUniqueMemoryKey(title) {
  const base = cleanMemoryTitle(title)
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .slice(0, 100) || "یادداشت";

  return `${base}-${crypto.randomUUID()}`;
}

function containsSensitiveMemory(value) {
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
    /رمز\s*دوم/i,
    /cvv2/i
  ];

  return patterns.some(pattern => pattern.test(text));
}

// ======================================
// DATABASE THREAD
// ======================================

export async function ensureNaviMainThread(db, ownerId = NAVI_OWNER_ID) {
  if (!db) {
    throw new Error("NAVI database is unavailable.");
  }

  await db.prepare(`
    INSERT OR IGNORE INTO navi_chat_threads_v1 (
      thread_id,
      owner_id,
      title,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    getNaviMainThreadId(ownerId),
    ownerId,
    "گفت‌وگوی اصلی ناوی"
  ).run();
}

// ======================================
// CONVERSATION HISTORY
// ======================================

// If NAVI just asked what information to save, recover the immediately
// preceding user message from this same thread. Never search older messages
// or guess which content the user meant.
export async function getNaviPreviousExplicitMemoryValue(
  db,
  threadId = NAVI_MAIN_THREAD_ID,
  ownerId = NAVI_OWNER_ID
) {
  const result = await db.prepare(`
    SELECT m.role, m.content
    FROM navi_chat_messages_v1 m
    INNER JOIN navi_chat_threads_v1 t ON t.thread_id = m.thread_id
    WHERE m.thread_id = ? AND t.owner_id = ?
    ORDER BY m.id DESC
    LIMIT 2
  `).bind(threadId, ownerId).all();

  const rows = result.results || [];
  if (rows.length !== 2) return "";

  const latest = rows[0];
  const previous = rows[1];

  if (latest.role !== "assistant" || previous.role !== "user") {
    return "";
  }

  const prompt = normalizeMemoryText(latest.content || "").replace(/[\u200c\u200d]/g, "");
  const isMemoryClarification = (
    /چه اطلاعاتی را می(?:خواهی|خوای) در حافظه/.test(prompt) ||
    /چه اطلاعاتی.*(?:ذخیره|ثبت).*(?:حافظه|بلندمدت)/.test(prompt) ||
    /کدام اطلاعات.*(?:ذخیره|ثبت).*(?:حافظه|بلندمدت)/.test(prompt) ||
    /چه چیزی را می(?:خواهی|خوای).*(?:ذخیره|ثبت).*(?:حافظه|بلندمدت)/.test(prompt)
  );

  if (!isMemoryClarification) return "";

  const value = cleanMemoryValue(previous.content || "");
  if (value.length < 8 || containsSensitiveMemory(value)) return "";

  return value;
}

export async function getNaviDbHistory(
  db,
  limit = 10,
  threadId = NAVI_MAIN_THREAD_ID,
  ownerId = NAVI_OWNER_ID
) {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 10, 100)
  );

  const result = await db.prepare(`
    SELECT m.role, m.content, m.created_at
    FROM navi_chat_messages_v1 m
    INNER JOIN navi_chat_threads_v1 t ON t.thread_id = m.thread_id
    WHERE m.thread_id = ? AND t.owner_id = ?
    ORDER BY m.id DESC
    LIMIT ?
  `).bind(
    threadId,
    ownerId,
    safeLimit
  ).all();

  return (result.results || [])
    .reverse()
    .map(row => ({
      role: row.role,
      content: row.content,
      createdAt: row.created_at
    }));
}

export function prepareNaviHistory(
  history,
  currentMessage
) {
  const messages = [];

  for (const item of history || []) {
    if (!item) continue;

    const role = item.role === "assistant"
      ? "model"
      : item.role === "user"
        ? "user"
        : null;

    const content = safeNaviText(
      item.content || "",
      20000
    );

    if (!role || !content) continue;

    const previous = messages[messages.length - 1];

    if (previous && previous.role === role) {
      previous.parts[0].text += "\n" + content;
    } else {
      messages.push({
        role,
        parts: [{ text: content }]
      });
    }
  }

  const current = safeNaviText(
    currentMessage || "",
    12000
  );

  if (current) {
    const previous = messages[messages.length - 1];

    if (previous?.role === "user") {
      previous.parts[0].text += "\n" + current;
    } else {
      messages.push({
        role: "user",
        parts: [{ text: current }]
      });
    }
  }

  return messages;
}

// Search a bounded set of older messages across all saved NAVI threads.
export async function searchNaviConversationHistory(db, query, limit = 8, recentHistory = [], ownerId = NAVI_OWNER_ID, projectId = null) {
  const terms = [...new Set(String(query || '').normalize('NFKC')
    .replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    .filter(word => word.length > 1))];
  if (!terms.length) return [];
  const recent = new Set((recentHistory || []).map(item => String(item?.content || '').trim()).filter(Boolean));
  const result = await db.prepare(`
    SELECT m.thread_id, m.role, m.content, m.created_at, t.title AS thread_title
    FROM navi_chat_messages_v1 m
    INNER JOIN navi_chat_threads_v1 t ON t.thread_id = m.thread_id
    WHERE t.owner_id = ?
      AND (? IS NULL OR t.project_id = ?)
    ORDER BY m.id DESC LIMIT 600
  `).bind(ownerId, projectId, projectId).all();
  const ranked = (result.results || []).filter(row => row &&
    (row.role === 'user' || row.role === 'assistant') && row.content &&
    !recent.has(String(row.content).trim())).map(row => {
      const content = String(row.content).normalize('NFKC').replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').toLowerCase();
      let score = 0;
      for (const term of terms) if (content.includes(term)) score += term.length > 4 ? 3 : 1;
      return { ...row, score };
    }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 12));
  return ranked.slice(0, safeLimit).reverse().map(row => ({
    threadId: row.thread_id,
    threadTitle: row.thread_title || 'گفت‌وگوی بدون عنوان',
    role: row.role,
    content: safeNaviText(row.content, 3000),
    createdAt: row.created_at || null,
    relevance: row.score
  }));
}

// ======================================
// APPROVED MEMORY
// ======================================

export async function getNaviApprovedMemory(db, ownerId = NAVI_OWNER_ID, projectId = null) {
  const result = await db.prepare(`
    SELECT
      id,
      memory_key,
      memory_value,
      source,
      created_at,
      updated_at
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'approved'
      AND (project_id IS NULL OR project_id = ?)
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(
    ownerId,
    projectId,
    MEMORY_LIST_LIMIT
  ).all();

  return result.results || [];
}

// ======================================
// PENDING MEMORY PROPOSALS
// ======================================

export async function getNaviPendingMemory(db, ownerId = NAVI_OWNER_ID, projectId = null) {
  const result = await db.prepare(`
    SELECT
      id,
      memory_key,
      memory_value,
      source,
      status,
      created_at,
      updated_at
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'pending'
      AND (project_id IS NULL OR project_id = ?)
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(
    ownerId,
    projectId,
    MEMORY_LIST_LIMIT
  ).all();

  return result.results || [];
}

// ======================================
// ARCHIVED MEMORY (MANAGEMENT / AUDIT)
// ======================================

export async function getNaviArchivedMemory(db, ownerId = NAVI_OWNER_ID, projectId = null) {
  const result = await db.prepare(`
    SELECT
      id,
      memory_key,
      memory_value,
      source,
      status,
      created_at,
      updated_at
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'archived'
      AND (project_id IS NULL OR project_id = ?)
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(
    ownerId,
    projectId,
    MEMORY_LIST_LIMIT
  ).all();

  return result.results || [];
}

// ======================================
// MEMORY COMMAND PARSER
// ======================================

export function parseNaviMemoryCommand(message) {
  const text = safeNaviText(message || "", 12000).trim();

  if (!text) {
    return {
      isCommand: false,
      value: ""
    };
  }

  // A request to create a proposal and obtain approval is NOT a direct-save command.
  // Leave it on the conversational path so Gemini can create a pending proposal.
  const asksForProposalApproval =
    /(?:به\s*عنوان|به\s*صورت)\s+(?:یک\s+)?(?:پیشنهاد|پروپوزال)\s+(?:حافظه\s+)?(?:ثبت|ذخیره|ایجاد)/u.test(text) ||
    /(?:پیشنهاد\s+حافظه|حافظه\s+پیشنهادی)/u.test(text) &&
      /(?:تأیید|تایید|اجازه|موافقت)/u.test(text) ||
    /(?:قبل\s+از|پیش\s+از)\s+(?:ذخیره|جایگزینی|به\s*روزرسانی)[\s\S]{0,100}(?:تأیید|تایید|اجازه)/u.test(text);

  if (asksForProposalApproval) {
    return { isCommand: false, value: "" };
  }

  // جمله‌ای که ابتدا واقعیت را بیان می‌کند و در پایان می‌گوید
  // «این را به خاطر بسپار» باید از خودِ واقعیت استخراج شود؛
  // در غیر این صورت نقطه پایانی ممکن است به‌عنوان حافظه ذخیره شود.
  const trailingRememberMatch = text.match(
    /^([\s\S]+?)[.!؟]?\s+(?:این|این\s+(?:موضوع|نکته|مورد|اطلاعات))\s+(?:رو|را)\s+(?:به\s+خاطر\s+بسپار|یادت\s+(?:بمونه|بماند|باشه|باشد))\s*[.!؟]*$/i
  );

  if (trailingRememberMatch?.[1]) {
    let rememberedValue = trailingRememberMatch[1]
      .trim()
      .replace(/[.!؟،؛:]+$/u, "")
      .trim();

    // عبارت‌های مقدمه‌ای را حذف می‌کنیم، اما خودِ واقعیت را کامل نگه می‌داریم.
    rememberedValue = rememberedValue.replace(
      /^(?:من\s+)?(?:قبلاً|پیشتر)\s+(?:به\s+تو|بهت)\s+(?:گفته\s+بودم|گفتم)\s+/u,
      ""
    ).replace(
      /^(?:من\s+)?(?:به\s+تو|بهت)\s+(?:گفته\s+بودم|گفتم)\s+/u,
      ""
    ).trim();

    if (rememberedValue.length >= 4) {
      return {
        isCommand: true,
        type: "explicit",
        command: "remember",
        value: cleanMemoryValue(rememberedValue),
        memoryValue: cleanMemoryValue(rememberedValue),
        memoryKey: "یادداشت کاربر",
        source: "user_command"
      };
    }
  }

  // درخواست تکمیل یک حافظه موجود؛ متن بعد از جداکننده، محتوای تازه است.
  const supplementMatch = text.match(
    /^(?:یه|یک)\s+(?:نکته|مورد)\s+دیگه\s+هم\s+(?:بهش|به\s+قبلی)\s+اضافه\s+کن\s*[؛;:،-]\s*(.+)$/i
  ) || text.match(
    /^(?:این\s+رو|این\s+را)\s+هم\s+به\s+قبلی\s+اضافه\s+کن\s*[؛;:،-]\s*(.+)$/i
  );

  if (supplementMatch?.[1]?.trim()) {
    const value = cleanMemoryValue(supplementMatch[1]);
    const responsePreference = /(?:پاسخ|جواب)/i.test(value) &&
      /(?:کوتاه|مختصر|خلاصه|موجز|کاربردی|مستقیم|واضح|روشن|توضیح|اضافه.?گویی)/i.test(value);

    return {
      isCommand: true,
      type: "explicit",
      command: "supplement",
      value,
      memoryValue: value,
      memoryKey: responsePreference
        ? "ترجیحات پاسخ‌گویی"
        : "یادداشت کاربر",
      source: "user_command"
    };
  }

  if (/^(?:یه|یک)\s+(?:نکته|مورد)\s+دیگه\s+هم\s+(?:بهش|به\s+قبلی)\s+اضافه\s+کن\s*$/i.test(text)) {
    return {
      isCommand: true,
      type: "explicit",
      command: "supplement",
      value: ""
    };
  }

  /*
    درخواست ذخیره باید از منظور کاربر تشخیص داده شود،
    نه فقط از یک عبارت ثابت. الگوها شکل‌های محاوره‌ای
    رایج فارسی را پوشش می‌دهند.
  */
  const patterns = [
    {
      regex: /(?:می‌خواهم|میخواهم|می‌خوام|میخوام)\s+(?:این|این موضوع|این نکته|این ترجیح|این اطلاعات)\s+(?:رو|را)\s+(?:در|تو|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+بلندمدت)?(?:\s+من)?\s+(?:نگه داری|ذخیره کنی|ثبت کنی|اضافه کنی|قرار بدی)/i,
      type: "explicit",
      emptyValue: true
    },
    {
      regex: /(?:می‌خواهم|میخواهم|می‌خوام|میخوام|می‌خوام که|میخوام که)\s*(?:این(?:\s+(?:موضوع|نکته|ترجیح|اطلاعات))?\s+)?(?:رو|را)?\s*(?:یادت بمونه|یادت باشه|به خاطر بسپاری)(?:\s+که)?\s*(.+)$/i,
      type: "explicit"
    },
    {
      regex: /(?:می‌خواهم|میخواهم|می‌خوام|میخوام)\s+(.+?)\s+(?:رو|را)\s+(?:در|تو|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+بلندمدت)?(?:\s+من)?\s+(?:نگه داری|ذخیره کنی|ثبت کنی|اضافه کنی|قرار بدی)/i,
      type: "explicit"
    },
    {
      regex: /(.+?)\s+(?:رو|را)\s+(?:در|تو|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+بلندمدت)?(?:\s+من)?\s+(?:نگه دار|ذخیره کن|ثبت کن|اضافه کن|قرار بده)\s*[:،]?\s*$/i,
      type: "explicit"
    },
    {
      regex: /(?:می‌خواهم|میخواهم|می‌خوام|میخوام)?\s*(?:این|این موضوع|این نکته|این ترجیح|این مورد|این اطلاعات)\s+(?:رو|را)\s+(?:به|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+من)?\s+(?:اضافه کن|اضافه کنی|ثبت کن|ثبت کنی|ذخیره کن|ذخیره کنی)/i,
      type: "explicit",
      emptyValue: true
    },
    {
      regex: /(?:(?:می‌خواهم|میخواهم|می‌خوام|میخوام)\s+)?(.+?)\s+(?:رو|را)\s+(?:به|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+بلندمدت)?(?:\s+من)?\s+(?:اضافه کن|اضافه کنی|ثبت کن|ثبت کنی|ذخیره کن|ذخیره کنی)\s*[:،]?\s*$/i,
      type: "explicit"
    },
    {
      regex: /(?:این|این موضوع|این نکته|این ترجیح|این مورد|این اطلاعات)\s+(?:رو|را)\s+(?:برای دفعات بعد|از این به بعد)\s+(?:در نظر داشته باش|مدنظر قرار بده|رعایت کن)/i,
      type: "explicit",
      emptyValue: true
    },
    {
      regex: /(.+?)\s+(?:رو|را)\s+(?:برای دفعات بعد|از این به بعد)\s+(?:در نظر داشته باش|مدنظر قرار بده|رعایت کن)\s*$/i,
      type: "explicit"
    },
    {
      regex: /(?:به|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+بلندمدت)?(?:\s+من)?\s+(?:اضافه|وارد|ثبت|ذخیره)\s+کن\s*[:،]?\s*(.+)$/i,
      type: "explicit"
    },
    {
      regex: /(?:این|این موضوع|این نکته|این ترجیح|این اطلاعات)\s+(?:رو|را)\s+(?:در|تو|داخل)\s+(?:پروفایل|حافظه)(?:‌ی|ی)?(?:‌?م)?(?:\s+من)?\s+(?:نگه دار|ذخیره کن|ثبت کن|اضافه کن|داشته باش)/i,
      type: "explicit",
      emptyValue: true
    },
    {
      regex: /(?:این|این موضوع|این نکته|این ترجیح|این اطلاعات)\s+(?:رو|را)?\s*(?:یادت بمونه|یادت باشه|به خاطر بسپار)\s*[:،]?\s*(.+)$/i,
      type: "explicit"
    },
    {
      regex: /(?:به خاطر بسپار|یادت باشه|یادت بمونه)\s*[:،]?\s*(.+)$/i,
      type: "explicit"
    },
    {
      regex: /(?:اطلاعات|مطلب|نکته)\s+(.+?)\s+را\s+(?:در حافظه(?: بلندمدت| دائمی)?|برای همیشه)\s+(?:ثبت|ذخیره)\s+کن/i,
      type: "explicit"
    },
    {
      regex: /(?:ثبت کن|ذخیره کن)\s*[:،]?\s*(.+)$/i,
      type: "explicit"
    },
    {
      regex: /(?:اسم|نام)\s+من\s+(.+?)\s+(?:است|هست)$/i,
      type: "profile"
    }
  ];

  for (const item of patterns) {
    const match = text.match(item.regex);

    if (match || item.emptyValue && item.regex.test(text)) {
      const value = item.emptyValue
        ? ""
        : cleanMemoryValue(match?.[1] || "");

      return {
        isCommand: true,
        type: item.type,
        value,
        memoryValue: value,
        memoryKey: item.type === "profile"
          ? "نام کاربر"
          : "یادداشت کاربر",
        source: "user_command"
      };
    }
  }

  if (
    /(?:به خاطر بسپار|یادت باشه|یادت بمونه|ذخیره کن|ثبت کن|در پروفایلم نگه دار|به پروفایلم اضافه کن)/i.test(text)
  ) {
    return {
      isCommand: true,
      type: "explicit",
      value: ""
    };
  }

  return {
    isCommand: false,
    value: ""
  };
}

// ======================================
// DUPLICATE DETECTION
// ======================================

function normalizeMemoryKey(value) {
  return normalizeMemoryText(value)
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "")
    .trim();
}

function isProtectedMemoryKey(value) {
  const key = normalizeMemoryKey(value);

  return key === normalizeMemoryText("نام کاربر") ||
    key === normalizeMemoryText("هویت دستیار");
}

function getMemoryMeaningTokens(value) {
  const stopWords = new Set([
    "من", "تو", "برای", "که", "این", "اون", "آن", "را", "رو",
    "به", "از", "در", "با", "هم", "همیشه", "لطفا", "لطفاً",
    "میخوام", "میخواهم", "میخوام", "می‌خوام", "می‌خواهم",
    "باشه", "باشد", "هست", "است", "بشه", "شود",
    "قبلا", "پیشتر", "گفته", "گفتم", "بودم",
    "است", "هست", "هستم", "هستی", "هستیم", "هستند",
    "ترجیح", "ترجیحا", "ترجیحاً", "دوست", "دارم", "دارید",
    "کن", "کنه", "کنید", "بکن", "بکنه", "بکنید",
    "یادت", "بمونه", "بماند", "نگه", "دار", "داشته"
  ]);

  const synonyms = new Map([
    ["جواب", "پاسخ"],
    ["جوابها", "پاسخ"],
    ["جوابهای", "پاسخ"],
    ["جوابهات", "پاسخ"],
    ["جوابات", "پاسخ"],
    ["پاسخهات", "پاسخ"],
    ["پاسخها", "پاسخ"],
    ["پاسخهای", "پاسخ"],
    ["پاسخگویی", "پاسخ"],
    ["پاسخگوهات", "پاسخ"],
    ["کاربردی", "کاربردی"],
    ["مختصر", "کوتاه"],
    ["خلاصه", "کوتاه"],
    ["موجز", "کوتاه"]
  ]);

  return normalizeMemoryText(value)
    .replace(/[‌ـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map(token => {
      const directAlias = synonyms.get(token);
      if (directAlias) return directAlias;

      let normalized = token
        .replace(/(?:هاتون|هات|هایت|هاش|هایش)$/u, "")
        .replace(/(?:هایی|های|ها)$/u, "")
        // فارسیِ محاوره‌ای و اضافه‌های ملکی: رنگم، علاقه‌ام، سلیقه‌اش
        // باید به هستهٔ واژه برگردند تا اصلاح یک واقعیت، حافظهٔ جدا نسازد.
        .replace(/(?:ام|ات|اش)$/u, match =>
          token.length > match.length + 2 ? "" : match
        )
        .replace(/(?:م|ت|ش)$/u, match =>
          token.length > match.length + 2 ? "" : match
        )
        .replace(/(?:تر|ترین)$/u, "");

      return synonyms.get(normalized) || normalized;
    })
    .filter(token => token.length > 1 && !stopWords.has(token));
}

export function areMemoryValuesSemanticallySimilar(first, second) {
  const firstTokens = new Set(getMemoryMeaningTokens(first));
  const secondTokens = new Set(getMemoryMeaningTokens(second));

  if (!firstTokens.size || !secondTokens.size) {
    return false;
  }

  let overlap = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) overlap += 1;
  }

  const smallerSize = Math.min(firstTokens.size, secondTokens.size);
  const largerSize = Math.max(firstTokens.size, secondTokens.size);
  const overlapRatio = overlap / smallerSize;
  const jaccardRatio = overlap / (firstTokens.size + secondTokens.size - overlap);

  // برای حافظه‌های کوتاه، حداقل دو مفهوم مشترک لازم است؛
  // استثنا: یک موضوع صریح و مشخص مثل «رنگم» که مقدارش عوض شده است.
  const stableTopicTokens = new Set([
    "رنگ", "شهر", "کشور", "شغل", "نام", "سن",
    "غذا", "موسیقی", "سبک", "زبان", "رشته", "حرفه"
  ]);
  const sharesOneStableTopic = overlap === 1 &&
    [...firstTokens].some(token =>
      secondTokens.has(token) && stableTopicTokens.has(token)
    ) &&
    overlapRatio >= 0.5 &&
    jaccardRatio >= 0.3 &&
    smallerSize >= 2 &&
    largerSize <= smallerSize + 1;

  return sharesOneStableTopic || (
    overlap >= 2 &&
    overlapRatio >= 0.75 &&
    jaccardRatio >= 0.5 &&
    (smallerSize >= 2 && largerSize <= smallerSize + 3)
  );
}

function isResponsePreferenceMemory(value) {
  const tokens = new Set(getMemoryMeaningTokens(value));
  const hasResponseTopic = tokens.has("پاسخ") || tokens.has("جواب");
  const styleTerms = [
    "کوتاه", "کاربردی", "مستقیم", "واضح", "روشن",
    "توضیح", "اضافی", "اضافهگویی", "مختصر", "خلاصه", "موجز"
  ];
  return hasResponseTopic &&
    styleTerms.some(token => tokens.has(token));
}

function mergeMemoryValues(existingValue, incomingValue) {
  const existing = cleanMemoryValue(existingValue);
  const incoming = cleanMemoryValue(incomingValue);

  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingTokens = new Set(getMemoryMeaningTokens(existing));
  const incomingTokens = new Set(getMemoryMeaningTokens(incoming));

  const incomingAddsNothing = [...incomingTokens]
    .every(token => existingTokens.has(token));
  if (incomingAddsNothing) return existing;

  const existingAddsNothing = [...existingTokens]
    .every(token => incomingTokens.has(token));
  if (existingAddsNothing) return incoming;

  return cleanMemoryValue(existing + "؛ " + incoming);
}

async function findMemoryDuplicate(
  db,
  value,
  excludeId = null,
  memoryKey = null,
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const result = await db.prepare(`
    SELECT id, memory_key, memory_value, status
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status IN ('approved', 'pending')
      AND id != ?
      AND ((? IS NULL AND project_id IS NULL) OR project_id = ?)
  `).bind(
    ownerId,
    Number(excludeId) || -1,
    projectId,
    projectId
  ).all();

  const normalized = normalizeMemoryText(value);
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const genericKeys = new Set([
    normalizeMemoryText("یادداشت کاربر"),
    normalizeMemoryText("یادداشت"),
    normalizeMemoryText("حافظه"),
    ""
  ]);
  const hasSpecificKey =
    Boolean(normalizedKey) && !genericKeys.has(normalizedKey);
  const protectedKey = isProtectedMemoryKey(memoryKey);

  // First prefer the same stable topic key. Generated keys contain a UUID,
  // which normalizeMemoryKey removes. This is essential when a user approves
  // a changed value for the same topic (e.g. favorite color: red -> blue).
  const candidates = result.results || [];
  const sameKey = hasSpecificKey
    ? candidates.filter(item =>
        normalizeMemoryKey(item.memory_key) === normalizedKey
      )
    : [];

  if (sameKey.length) {
    // An approved fact is the current source of truth; do not accidentally
    // merge a proposal into another pending proposal with the same title.
    sameKey.sort((a, b) =>
      Number(b.status === "approved") - Number(a.status === "approved")
    );
    return sameKey[0];
  }

  return candidates.find(item => {
    // هویت‌های ثابت با کلید شناخته می‌شوند، نه فقط متن مقدار.
    if (
      protectedKey &&
      normalizeMemoryKey(item.memory_key) === normalizedKey
    ) {
      return true;
    }

    const existingValue = normalizeMemoryText(item.memory_value);

    return existingValue === normalized ||
      areMemoryValuesSemanticallySimilar(
        item.memory_value,
        value
      );
  }) || null;
}


async function findMemoryRelatedRecords(db, value, excludeId = null, memoryKey = null, ownerId = NAVI_OWNER_ID, projectId = null) {
  const result = await db.prepare(`
    SELECT id, memory_key, memory_value, status
    FROM navi_memory_facts_v1
    WHERE owner_id = ? AND status IN ('approved', 'pending') AND id != ?
      AND ((? IS NULL AND project_id IS NULL) OR project_id = ?)
  `).bind(ownerId, Number(excludeId) || -1, projectId, projectId).all();
  const normalized = normalizeMemoryText(value);
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const genericKeys = new Set(["یادداشت کاربر", "یادداشت", "حافظه", ""].map(normalizeMemoryText));
  const hasSpecificKey = Boolean(normalizedKey) && !genericKeys.has(normalizedKey);
  const protectedKey = isProtectedMemoryKey(memoryKey);
  return (result.results || []).filter(item => {
    if (hasSpecificKey && normalizeMemoryKey(item.memory_key) === normalizedKey) return true;
    if (protectedKey) return false;
    return normalizeMemoryText(item.memory_value) === normalized ||
      areMemoryValuesSemanticallySimilar(item.memory_value, value);
  });
}

// ======================================
// CREATE PENDING PROPOSAL
// ======================================

export async function createNaviMemoryProposal(
  db,
  value,
  title = "یادداشت کاربر",
  source = "navi_suggestion",
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const memoryValue = cleanMemoryValue(value);
  const memoryTitle = cleanMemoryTitle(title);
  const memorySource = safeNaviText(source, 100) || "navi";

  if (!memoryValue || memoryValue.length < 8) {
    return {
      inserted: false,
      invalid: true
    };
  }

  if (containsSensitiveMemory(memoryValue)) {
    return {
      inserted: false,
      sensitive: true
    };
  }

  let mergeCandidateId = null;

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    null,
    memoryTitle,
    ownerId,
    projectId
  );

  if (duplicate) {
    const mergedValue = mergeMemoryValues(
      duplicate.memory_value,
      memoryValue
    );

    if (!mergedValue) {
      return { inserted: false, tooLong: true, existingId: duplicate.id };
    }

    if (
      normalizeMemoryText(mergedValue) ===
      normalizeMemoryText(duplicate.memory_value)
    ) {
      return {
        inserted: false,
        duplicate: true,
        existingId: duplicate.id,
        existingStatus: duplicate.status
      };
    }

    if (duplicate.status === "pending") {
      const update = await db.prepare(`
        UPDATE navi_memory_facts_v1
        SET memory_value = ?, source = ?, updated_at = datetime('now')
        WHERE id = ? AND owner_id = ? AND status = 'pending'
      `).bind(mergedValue, memorySource, duplicate.id, ownerId).run();

      if (!update.success || !update.meta?.changes) {
        throw new Error("Could not merge pending memory proposal.");
      }

      return {
        inserted: false,
        merged: true,
        existingId: duplicate.id,
        existingStatus: "pending",
        memoryValue: mergedValue
      };
    }

    // حافظه تأییدشده بی‌اجازه تغییر نمی‌کند؛
    // پیشنهاد تازه برای تأیید کاربر ساخته می‌شود.
    mergeCandidateId = duplicate.id;
  }

  const memoryKey = createUniqueMemoryKey(
    memoryTitle
  );

  const result = await db.prepare("INSERT INTO navi_memory_facts_v1 (owner_id,memory_key,memory_value,source,status,project_id,created_at,updated_at) VALUES (?,?,?,?,'pending',?,datetime('now'),datetime('now'))").bind(
    ownerId, memoryKey, memoryValue, memorySource, projectId
  ).run();
  if (!result.success) {
    throw new Error("Could not create memory proposal.");
  }

  return {
    inserted: true,
    id: result.meta?.last_row_id || null,
    title: memoryTitle,
    memoryKey,
    memoryValue,
    mergeCandidateId
  };
}

// ======================================
// APPROVE PENDING PROPOSAL
// ======================================

export async function approveNaviMemoryProposal(
  db,
  id,
  editedValue = null,
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const proposalId = Number(id);

  if (
    !Number.isSafeInteger(proposalId) ||
    proposalId <= 0
  ) {
    return { notFound: true };
  }

  const existing = await db.prepare(`
    SELECT id, memory_key, memory_value, project_id
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
      AND (project_id IS NULL OR project_id = ?)
    LIMIT 1
  `).bind(
    proposalId,
    ownerId,
    projectId
  ).first();

  if (!existing) {
    return { notFound: true };
  }

  const memoryValue = editedValue === null
    ? cleanMemoryValue(existing.memory_value)
    : cleanMemoryValue(editedValue);

  if (!memoryValue) {
    return { invalid: true };
  }

  if (containsSensitiveMemory(memoryValue)) {
    return { sensitive: true };
  }

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    proposalId,
    existing.memory_key,
    ownerId,
    existing.project_id ?? null
  );

  if (duplicate) {
    // When a user approves a new proposal that matches an already
    // approved fact, treat the approval as confirmation of the newer
    // value. Do not concatenate contradictory values (for example,
    // favorite color: blue + green).
    // Pending proposals may still be combined because neither is
    // an approved source of truth yet.
    const targetStatus = duplicate.status;
    const replacesApprovedFact = targetStatus === "approved";
    const nextValue = replacesApprovedFact
      ? memoryValue
      : mergeMemoryValues(duplicate.memory_value, memoryValue);

    if (!nextValue) return { tooLong: true };

    if (containsSensitiveMemory(nextValue)) {
      return { sensitive: true };
    }

    const update = db.prepare(`
      UPDATE navi_memory_facts_v1
      SET memory_value = ?, updated_at = datetime('now')
      WHERE id = ? AND owner_id = ? AND status = ?
    `).bind(
      nextValue,
      duplicate.id,
      ownerId,
      targetStatus
    );

    const archive = db.prepare(`
      UPDATE navi_memory_facts_v1
      SET status = 'archived', updated_at = datetime('now')
      WHERE id = ? AND owner_id = ? AND status = 'pending'
    `).bind(
      proposalId,
      ownerId
    );

    const relatedRecords = replacesApprovedFact
      ? await findMemoryRelatedRecords(db, memoryValue, proposalId, existing.memory_key, ownerId, existing.project_id ?? null)
      : [];
    const archiveSuperseded = relatedRecords
      .filter(item => item.status === "approved" && item.id !== duplicate.id)
      .map(item => db.prepare(`
        UPDATE navi_memory_facts_v1
        SET status = 'archived', updated_at = datetime('now')
        WHERE id = ? AND owner_id = ? AND status = 'approved'
      `).bind(item.id, ownerId));
    const results = await db.batch([update, archive, ...archiveSuperseded]);
    if (!Array.isArray(results) || results.some(item => !item.success)) {
      throw new Error("Could not update related memory records.");
    }

    return {
      success: true,
      merged: !replacesApprovedFact,
      replaced: replacesApprovedFact,
      id: duplicate.id,
      archivedId: proposalId,
      memoryValue: nextValue,
      mergedIntoStatus: targetStatus
    };
  }

  const result = await db.prepare(`
    UPDATE navi_memory_facts_v1
    SET
      memory_value = ?,
      status = 'approved',
      updated_at = datetime('now')
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
  `).bind(
    memoryValue,
    proposalId,
    ownerId
  ).run();

  if (!result.success || !result.meta?.changes) {
    return { notFound: true };
  }

  return {
    success: true,
    id: proposalId,
    memoryValue
  };
}

// ======================================
// REJECT PROPOSAL
// ======================================

export async function rejectNaviMemoryProposal(
  db,
  id,
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const proposalId = Number(id);

  if (
    !Number.isSafeInteger(proposalId) ||
    proposalId <= 0
  ) {
    return { success: false };
  }

  const result = await db.prepare(`
    UPDATE navi_memory_facts_v1
    SET
      status = 'archived',
      updated_at = datetime('now')
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
      AND (project_id IS NULL OR project_id = ?)
  `).bind(
    proposalId,
    ownerId,
    projectId
  ).run();

  return {
    success: Boolean(
      result.success && result.meta?.changes
    )
  };
}

// ======================================
// UPDATE PENDING PROPOSAL
// ======================================

export async function updateNaviMemoryProposal(
  db,
  id,
  value,
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const proposalId = Number(id);
  const memoryValue = cleanMemoryValue(value);

  if (
    !Number.isSafeInteger(proposalId) ||
    proposalId <= 0 ||
    !memoryValue
  ) {
    return { notFound: true };
  }

  if (containsSensitiveMemory(memoryValue)) {
    return { sensitive: true };
  }

  const existing = await db.prepare(`
    SELECT id, memory_key, project_id
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
      AND (project_id IS NULL OR project_id = ?)
    LIMIT 1
  `).bind(
    proposalId,
    ownerId,
    projectId
  ).first();

  if (!existing) {
    return { notFound: true };
  }

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    proposalId,
    existing.memory_key,
    ownerId,
    existing.project_id ?? null
  );

  if (duplicate) {
    return { duplicate: true };
  }

  const result = await db.prepare(`
    UPDATE navi_memory_facts_v1
    SET
      memory_value = ?,
      updated_at = datetime('now')
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
      AND ((? IS NULL AND project_id IS NULL) OR project_id = ?)
  `).bind(
    memoryValue,
    proposalId,
    ownerId,
    existing.project_id ?? null,
    existing.project_id ?? null
  ).run();

  if (!result.success || !result.meta?.changes) {
    return { notFound: true };
  }

  return {
    success: true,
    id: proposalId
  };
}

// ======================================
// SAVE EXPLICIT MEMORY FACT
// ======================================

export async function saveNaviMemoryFact(
  db,
  value,
  key = "یادداشت کاربر",
  source = "user_command",
  ownerId = NAVI_OWNER_ID,
  projectId = null
) {
  const memoryValue = cleanMemoryValue(value);
  const memoryKey = cleanMemoryTitle(key);
  const memorySource = safeNaviText(source, 100) || "user_command";
  const globalMemoryKeys = ["نام کاربر", "هویت دستیار", "ترجیحات پاسخ‌گویی"];
  const memoryProjectId = globalMemoryKeys.includes(memoryKey) ? null : projectId;

  if (!memoryValue) {
    throw new Error("Memory value is empty.");
  }

  if (containsSensitiveMemory(memoryValue)) {
    throw new Error("Sensitive information cannot be stored.");
  }

  // نام کاربر و هویت دستیار کلیدهای ثابت هستند.
  // در صورت درخواست صریح، مقدار قبلی به‌روزرسانی می‌شود.

  const protectedKeys = [
    "نام کاربر",
    "هویت دستیار"
  ];

  if (protectedKeys.includes(memoryKey)) {
    const existing = await db.prepare(`
      SELECT id, memory_value
      FROM navi_memory_facts_v1
      WHERE owner_id = ?
        AND memory_key = ?
        AND status = 'approved'
      LIMIT 1
    `).bind(
      ownerId,
      memoryKey
    ).first();

    if (existing) {
      if (
        normalizeMemoryText(existing.memory_value) ===
        normalizeMemoryText(memoryValue)
      ) {
        return {
          duplicate: true,
          memoryKey
        };
      }

      const update = await db.prepare(`
        UPDATE navi_memory_facts_v1
        SET
          memory_value = ?,
          source = ?,
          updated_at = datetime('now')
        WHERE id = ?
          AND owner_id = ?
          AND status = 'approved'
      `).bind(
        memoryValue,
        memorySource,
        existing.id,
        ownerId
      ).run();

      if (!update.success || !update.meta?.changes) {
        throw new Error("Could not update approved memory.");
      }

      return {
        updated: true,
        id: existing.id,
        memoryKey
      };
    }
  }

  // درخواست صریح «تکمیل ترجیحات پاسخ‌گویی» باید به همان حافظه قبلی متصل شود،
  // حتی اگر جمله تازه از نظر واژه‌به‌واژه با مقدار قبلی شباهت کمی داشته باشد.
  if (memoryKey === "ترجیحات پاسخ‌گویی" &&
      isResponsePreferenceMemory(memoryValue)) {
    const candidates = await db.prepare(`
      SELECT id, memory_key, memory_value, status
      FROM navi_memory_facts_v1
      WHERE owner_id = ?
        AND project_id IS NULL
        AND status IN ('approved', 'pending')
      ORDER BY updated_at DESC, id DESC
    `).bind(ownerId).all();

    const related = (candidates.results || []).find(item =>
      isResponsePreferenceMemory(item.memory_value)
    );

    if (related) {
      const mergedValue = mergeMemoryValues(
        related.memory_value,
        memoryValue
      );

      if (!mergedValue) return { tooLong: true };

      if (normalizeMemoryText(mergedValue) ===
          normalizeMemoryText(related.memory_value)) {
        return {
          duplicate: true,
          existingId: related.id,
          existingStatus: related.status,
          memoryKey: related.memory_key
        };
      }

      const update = await db.prepare(`
        UPDATE navi_memory_facts_v1
        SET memory_value = ?, source = ?, status = 'approved',
            updated_at = datetime('now')
        WHERE id = ? AND owner_id = ? AND status IN ('approved', 'pending')
      `).bind(
        mergedValue,
        memorySource,
        related.id,
        ownerId
      ).run();

      if (!update.success || !update.meta?.changes) {
        throw new Error("Could not supplement response preference memory.");
      }

      return {
        merged: true,
        updated: related.status === "approved",
        id: related.id,
        existingStatus: related.status,
        memoryKey: related.memory_key,
        memoryValue: mergedValue
      };
    }
  }

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    null,
    memoryKey,
    ownerId,
    memoryProjectId
  );

  if (duplicate) {
    if (
      normalizeMemoryText(duplicate.memory_value) ===
      normalizeMemoryText(memoryValue)
    ) {
      const relatedRecords = await findMemoryRelatedRecords(
        db,
        memoryValue,
        null,
        memoryKey,
        ownerId,
        memoryProjectId
      );
      const superseded = relatedRecords.filter(item =>
        item.id !== duplicate.id &&
        item.status === "approved" &&
        normalizeMemoryText(item.memory_value) !== normalizeMemoryText(memoryValue)
      );
      if (superseded.length) {
        const results = await db.batch(superseded.map(item => db.prepare(`
          UPDATE navi_memory_facts_v1
          SET status = 'archived', updated_at = datetime('now')
          WHERE id = ? AND owner_id = ? AND status = 'approved'
        `).bind(item.id, ownerId)));
        if (!Array.isArray(results) || results.some(result => !result.success)) {
          throw new Error("Could not archive superseded duplicate memory facts.");
        }
      }
      return {
        duplicate: true,
        existingId: duplicate.id,
        existingStatus: duplicate.status,
        archivedCount: superseded.length
      };
    }

    // A direct user memory command is an authoritative correction:
    // replace the matched fact instead of concatenating contradictory
    // values (for example, favorite color: red -> blue).
    const relatedRecords = await findMemoryRelatedRecords(db, memoryValue, null, memoryKey, ownerId);
    const statements = [
      db.prepare(`
        UPDATE navi_memory_facts_v1
        SET memory_value = ?, source = ?, status = 'approved',
            updated_at = datetime('now')
        WHERE id = ? AND owner_id = ? AND status IN ('approved', 'pending')
      `).bind(
        memoryValue,
        memorySource,
        duplicate.id,
        ownerId
      ),
      ...relatedRecords
        .filter(item => item.id !== duplicate.id)
        .map(item => db.prepare(`
          UPDATE navi_memory_facts_v1
          SET status = 'archived', updated_at = datetime('now')
          WHERE id = ? AND owner_id = ? AND status IN ('approved', 'pending')
        `).bind(item.id, ownerId))
    ];

    const results = await db.batch(statements);
    if (
      !Array.isArray(results) ||
      results.some(result => !result.success) ||
      Number(results[0]?.meta?.changes || 0) !== 1
    ) {
      throw new Error("Could not replace corrected explicit memory fact.");
    }

    return {
      updated: true,
      replaced: true,
      id: duplicate.id,
      existingStatus: duplicate.status,
      memoryKey: duplicate.memory_key,
      memoryValue
    };
  }

  const uniqueKey = createUniqueMemoryKey(memoryKey);

  const result = await db.prepare("INSERT INTO navi_memory_facts_v1 (owner_id,memory_key,memory_value,source,status,project_id,created_at,updated_at) VALUES (?,?,?,?,'approved',?,datetime('now'),datetime('now'))").bind(
    ownerId, memoryKey, memoryValue, memorySource, memoryProjectId
  ).run();
  if (!result.success) {
    throw new Error("Could not save approved memory.");
  }

  return {
    inserted: true,
    id: result.meta?.last_row_id || null,
    memoryKey: uniqueKey
  };
}

// ======================================
// SAVE CONVERSATION
// ======================================

export async function saveNaviConversation(
  db,
  userMessage,
  assistantMessage,
  threadId = NAVI_MAIN_THREAD_ID,
  ownerId = NAVI_OWNER_ID
) {
  const userText = safeNaviText(
    userMessage || "",
    12000
  );

  const assistantText = safeNaviText(
    assistantMessage || "",
    20000
  );

  if (!userText || !assistantText) {
    throw new Error("Conversation messages cannot be empty.");
  }

  const ownedThread = await db.prepare(`SELECT thread_id FROM navi_chat_threads_v1 WHERE thread_id = ? AND owner_id = ? LIMIT 1`).bind(threadId, ownerId).first();
  if (!ownedThread) throw new Error("NAVI conversation thread does not belong to this user.");

  const statements = [
    db.prepare(`
      INSERT INTO navi_chat_messages_v1 (
        thread_id,
        role,
        content,
        created_at
      )
      VALUES (?, 'user', ?, datetime('now'))
    `).bind(
      threadId,
      userText
    ),

    db.prepare(`
      INSERT INTO navi_chat_messages_v1 (
        thread_id,
        role,
        content,
        created_at
      )
      VALUES (?, 'assistant', ?, datetime('now'))
    `).bind(
      threadId,
      assistantText
    ),

    db.prepare(`
      UPDATE navi_chat_threads_v1
      SET updated_at = datetime('now')
      WHERE thread_id = ?
        AND owner_id = ?
    `).bind(
      threadId,
      ownerId
    )
  ];

  const results = await db.batch(statements);

  if (
    !Array.isArray(results) ||
    results.some(result => !result.success)
  ) {
    throw new Error("Could not save NAVI conversation.");
  }

  return {
    success: true
  };
    }
