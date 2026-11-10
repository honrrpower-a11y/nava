// NAVI - Persistent Memory and Conversation History
// Version: 1.0

import { safeNaviText } from "./shared.js";

// ======================================
// CONSTANTS
// ======================================

export const NAVI_MAIN_THREAD_ID = "owner-main";
export const NAVI_OWNER_ID = "owner";

const MEMORY_VALUE_LIMIT = 1000;
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
  return safeNaviText(
    value || "",
    MEMORY_VALUE_LIMIT
  );
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

export async function ensureNaviMainThread(db) {
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
    NAVI_MAIN_THREAD_ID,
    NAVI_OWNER_ID,
    "گفت‌وگوی اصلی ناوی"
  ).run();
}

// ======================================
// CONVERSATION HISTORY
// ======================================

export async function getNaviDbHistory(
  db,
  limit = 10
) {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 10, 100)
  );

  const result = await db.prepare(`
    SELECT role, content, created_at
    FROM navi_chat_messages_v1
    WHERE thread_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).bind(
    NAVI_MAIN_THREAD_ID,
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
      10000
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
    4000
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

// ======================================
// APPROVED MEMORY
// ======================================

export async function getNaviApprovedMemory(db) {
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
    ORDER BY updated_at DESC, id DESC
    LIMIT ?
  `).bind(
    NAVI_OWNER_ID,
    MEMORY_LIST_LIMIT
  ).all();

  return result.results || [];
}

// ======================================
// PENDING MEMORY PROPOSALS
// ======================================

export async function getNaviPendingMemory(db) {
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
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(
    NAVI_OWNER_ID,
    MEMORY_LIST_LIMIT
  ).all();

  return result.results || [];
}

// ======================================
// MEMORY COMMAND PARSER
// ======================================

export function parseNaviMemoryCommand(message) {
  const text = safeNaviText(message || "", 4000).trim();

  if (!text) {
    return {
      isCommand: false,
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
    ["جوابهات", "پاسخ"],
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
        .replace(/(?:هایی|های|ها)$/u, "")
        .replace(/(?:هاتون|هات|هایت|هاش|هایش)$/u, "")
        .replace(/(?:تر|ترین)$/u, "");

      return synonyms.get(normalized) || normalized;
    })
    .filter(token => token.length > 1 && !stopWords.has(token));
}

function areMemoryValuesSemanticallySimilar(first, second) {
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

  // برای حافظه‌های کوتاه، حداقل دو مفهوم مشترک لازم است تا
  // شباهت یک واژه عمومی باعث حذف اشتباهی اطلاعات متفاوت نشود.
  return overlap >= 2 &&
    overlapRatio >= 0.75 &&
    jaccardRatio >= 0.5 &&
    (smallerSize >= 2 && largerSize <= smallerSize + 3);
}

async function findMemoryDuplicate(
  db,
  value,
  excludeId = null,
  memoryKey = null
) {
  const result = await db.prepare(`
    SELECT id, memory_key, memory_value, status
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status IN ('approved', 'pending')
      AND id != ?
  `).bind(
    NAVI_OWNER_ID,
    Number(excludeId) || -1
  ).all();

  const normalized = normalizeMemoryText(value);
  const normalizedKey = normalizeMemoryKey(memoryKey);
  const protectedKey = isProtectedMemoryKey(memoryKey);

  return (result.results || []).find(item => {
    // هویت‌های ثابت با کلید شناخته می‌شوند، نه فقط متن مقدار.
    // بنابراین «علی» و «نام کاربر علی است» یک حافظه محسوب می‌شوند.
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

// ======================================
// CREATE PENDING PROPOSAL
// ======================================

export async function createNaviMemoryProposal(
  db,
  value,
  title = "یادداشت کاربر",
  source = "navi_suggestion"
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

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    null,
    memoryTitle
  );

  if (duplicate) {
    return {
      inserted: false,
      duplicate: true,
      existingId: duplicate.id,
      existingStatus: duplicate.status
    };
  }

  const memoryKey = createUniqueMemoryKey(
    memoryTitle
  );

  const result = await db.prepare(`
    INSERT INTO navi_memory_facts_v1 (
      owner_id,
      memory_key,
      memory_value,
      source,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))
  `).bind(
    NAVI_OWNER_ID,
    memoryKey,
    memoryValue,
    memorySource
  ).run();

  if (!result.success) {
    throw new Error("Could not create memory proposal.");
  }

  return {
    inserted: true,
    id: result.meta?.last_row_id || null,
    title: memoryTitle,
    memoryKey,
    memoryValue
  };
}

// ======================================
// APPROVE PENDING PROPOSAL
// ======================================

export async function approveNaviMemoryProposal(
  db,
  id,
  editedValue = null
) {
  const proposalId = Number(id);

  if (
    !Number.isSafeInteger(proposalId) ||
    proposalId <= 0
  ) {
    return { notFound: true };
  }

  const existing = await db.prepare(`
    SELECT id, memory_key, memory_value
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
    LIMIT 1
  `).bind(
    proposalId,
    NAVI_OWNER_ID
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
    existing.memory_key
  );

  if (duplicate) {
    return { duplicate: true };
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
    NAVI_OWNER_ID
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
  id
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
  `).bind(
    proposalId,
    NAVI_OWNER_ID
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
  value
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
    SELECT id, memory_key
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
    LIMIT 1
  `).bind(
    proposalId,
    NAVI_OWNER_ID
  ).first();

  if (!existing) {
    return { notFound: true };
  }

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    proposalId,
    existing.memory_key
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
  `).bind(
    memoryValue,
    proposalId,
    NAVI_OWNER_ID
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
  source = "user_command"
) {
  const memoryValue = cleanMemoryValue(value);
  const memoryKey = cleanMemoryTitle(key);
  const memorySource = safeNaviText(source, 100) || "user_command";

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
      NAVI_OWNER_ID,
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
        NAVI_OWNER_ID
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

  const duplicate = await findMemoryDuplicate(
    db,
    memoryValue,
    null,
    memoryKey
  );

  if (duplicate) {
    return {
      duplicate: true,
      existingId: duplicate.id,
      existingStatus: duplicate.status
    };
  }

  const uniqueKey = createUniqueMemoryKey(memoryKey);

  const result = await db.prepare(`
    INSERT INTO navi_memory_facts_v1 (
      owner_id,
      memory_key,
      memory_value,
      source,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'approved', datetime('now'), datetime('now'))
  `).bind(
    NAVI_OWNER_ID,
    uniqueKey,
    memoryValue,
    memorySource
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
  assistantMessage
) {
  const userText = safeNaviText(
    userMessage || "",
    4000
  );

  const assistantText = safeNaviText(
    assistantMessage || "",
    10000
  );

  if (!userText || !assistantText) {
    throw new Error("Conversation messages cannot be empty.");
  }

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
      NAVI_MAIN_THREAD_ID,
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
      NAVI_MAIN_THREAD_ID,
      assistantText
    ),

    db.prepare(`
      UPDATE navi_chat_threads_v1
      SET updated_at = datetime('now')
      WHERE thread_id = ?
        AND owner_id = ?
    `).bind(
      NAVI_MAIN_THREAD_ID,
      NAVI_OWNER_ID
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
