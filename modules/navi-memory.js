
// حافظه و تاریخچه پایدار NAVI در Cloudflare D1

import { safeNaviText } from "./shared.js";

// ==========================================
// تنظیمات حافظه پایدار NAVI
// ==========================================

export const NAVI_MAIN_THREAD_ID = "owner-main";
export const NAVI_OWNER_ID = "owner";

const MEMORY_VALUE_LIMIT = 1000;
const MEMORY_KEY_LIMIT = 150;

// ==========================================
// ابزارهای عمومی
// ==========================================

function cleanMemoryValue(value) {
  return safeNaviText(value || "", MEMORY_VALUE_LIMIT);
}

function cleanMemoryTitle(value) {
  return safeNaviText(
    value || "یادداشت کاربر",
    MEMORY_KEY_LIMIT
  ) || "یادداشت کاربر";
}

function createUniqueMemoryKey(title) {
  return `${title} ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

// ==========================================
// ایجاد گفت‌وگوی اصلی
// ==========================================

export async function ensureNaviMainThread(db) {
  await db.prepare(`
    INSERT OR IGNORE INTO navi_chat_threads_v1
    (thread_id, owner_id, title)
    VALUES (?, ?, ?)
  `).bind(
    NAVI_MAIN_THREAD_ID,
    NAVI_OWNER_ID,
    "گفت‌وگوی اصلی ناوی"
  ).run();
}

// ==========================================
// خواندن تاریخچه از D1
// ==========================================

export async function getNaviDbHistory(db, limit = 10) {
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

  return (result.results || []).reverse().map(row => ({
    role: row.role,
    content: row.content,
    created_at: row.created_at
  }));
}

// ==========================================
// آماده‌سازی تاریخچه برای Gemini
// ==========================================

export function prepareNaviHistory(history, currentMessage) {
  const rawHistory = Array.isArray(history)
    ? history.slice(-10)
    : [];

  const contents = [];

  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;

    let role = String(item.role || "").toLowerCase();

    if (role === "assistant") role = "model";

    if (role !== "user" && role !== "model") continue;

    const historyText = safeNaviText(
      item.content || item.text || "",
      2000
    );

    if (!historyText) continue;

    const previousMessage = contents[contents.length - 1];

    if (previousMessage && previousMessage.role === role) {
      previousMessage.parts[0].text += "\n" + historyText;
    } else {
      contents.push({
        role,
        parts: [{ text: historyText }]
      });
    }
  }

  while (
    contents.length > 0 &&
    contents[0].role !== "user"
  ) {
    contents.shift();
  }

  const lastMessage = contents[contents.length - 1];

  if (
    lastMessage &&
    lastMessage.role === "user" &&
    lastMessage.parts[0].text.trim() === currentMessage.trim()
  ) {
    return contents;
  }

  if (lastMessage && lastMessage.role === "user") {
    lastMessage.parts[0].text += "\n" + currentMessage;
  } else {
    contents.push({
      role: "user",
      parts: [{ text: currentMessage }]
    });
  }

  return contents;
}

// ==========================================
// خواندن حافظه‌های تأییدشده
// ==========================================

export async function getNaviApprovedMemory(db) {
  const result = await db.prepare(`
    SELECT memory_key, memory_value
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND status = 'approved'
    ORDER BY updated_at DESC, id DESC
    LIMIT 100
  `).bind(NAVI_OWNER_ID).all();

  return result.results || [];
}

// ==========================================
// خواندن پیشنهادهای منتظر تأیید
// ==========================================

export async function getNaviPendingMemory(db) {
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
      AND status = 'pending'
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `).bind(NAVI_OWNER_ID).all();

  return result.results || [];
}

// ==========================================
// تشخیص دستور صریح ذخیره حافظه
// ==========================================

export function parseNaviMemoryCommand(message) {
  const text = safeNaviText(message, 4000);

  // حالت اول: «به خاطر بسپار»

  const rememberMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?به\s+خاطر\s+بسپار(?:\s+که)?\s*[:：،-]?\s*/u
  );

  if (rememberMatch) {
    const value = safeNaviText(
      text.slice(rememberMatch[0].length),
      MEMORY_VALUE_LIMIT
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت دوم: دستور ثبت در حافظه بلندمدت

  const saveMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?(?:این\s+)?(?:اطلاعات|مطلب|نکته|موضوع|مورد|رو|را)\s*(?:را|رو)?\s*(?:در|به)\s+حافظه\s+(?:بلندمدت|دائمی)(?:\s+خود)?\s*(?:ثبت|ذخیره|اضافه)\s*(?:کن|بکن|نمای)\s*[:：،-]?\s*/u
  );

  if (saveMatch) {
    const value = safeNaviText(
      text.slice(saveMatch[0].length),
      MEMORY_VALUE_LIMIT
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت سوم: «ثبت کن» یا «ذخیره کن»

  const shortSaveMatch = text.match(
    /^\s*(?:ناوی[،,:؛]?\s*)?(?:لطفاً\s*)?(?:ثبت|ذخیره)\s+کن(?:\s+که)?\s*[:：،-]?\s*/u
  );

  if (shortSaveMatch) {
    const value = safeNaviText(
      text.slice(shortSaveMatch[0].length),
      MEMORY_VALUE_LIMIT
    );

    return {
      isCommand: true,
      value,
      memoryKey: "یادداشت کاربر",
      memoryValue: value,
      source: "user_command",
      type: "explicit"
    };
  }

  // حالت چهارم: معرفی صریح نام کاربر

  const nameMatch = text.match(
    /^\s*(?:اسم|نام)\s+من\s+(?:هم\s+)?([آ-یءاأإؤئ‌\-]{2,40})\s*(?:است|هست|می‌باشد|میباشد)?[.!؟،؛\s]*$/u
  );

  if (nameMatch) {
    const userName = safeNaviText(
      nameMatch[1].replace(/\s+/g, " "),
      60
    );

    if (userName) {
      return {
        isCommand: true,
        value: userName,
        memoryKey: "نام کاربر",
        memoryValue: userName,
        source: "user_statement",
        type: "profile"
      };
    }
  }

  return {
    isCommand: false,
    value: "",
    memoryKey: "",
    memoryValue: "",
    source: "",
    type: ""
  };
}

// ==========================================
// ذخیره پیشنهاد هوشمند حافظه
// وضعیت اولیه: pending
// ==========================================

export async function createNaviMemoryProposal(
  db,
  value,
  title = "یادداشت کاربر",
  source = "navi_suggestion"
) {
  const ownerId = NAVI_OWNER_ID;

  const cleanValue = cleanMemoryValue(value);
  const cleanTitle = cleanMemoryTitle(title);

  if (!cleanValue) {
    return {
      inserted: false,
      duplicate: false,
      error: "empty_value"
    };
  }

  // پیشنهاد نباید اطلاعات حساس و محرمانه را وارد حافظه کند.

  const sensitivePatterns = [
    /api[_\s-]?key\s*[:=]/iu,
    /password\s*[:=]/iu,
    /secret\s*[:=]/iu,
    /access[_\s-]?token\s*[:=]/iu,
    /refresh[_\s-]?token\s*[:=]/iu,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u
  ];

  if (sensitivePatterns.some(pattern => pattern.test(cleanValue))) {
    return {
      inserted: false,
      duplicate: false,
      skipped: true,
      reason: "sensitive_information"
    };
  }

  // جلوگیری از پیشنهاد تکراری در حافظه تأییدشده یا در انتظار تأیید.

  const existing = await db.prepare(`
    SELECT id, status
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND memory_value = ?
      AND status IN ('approved', 'pending')
    LIMIT 1
  `).bind(
    ownerId,
    cleanValue
  ).first();

  if (existing) {
    return {
      inserted: false,
      duplicate: true,
      existingStatus: existing.status,
      id: existing.id
    };
  }

  const uniqueKey = createUniqueMemoryKey(cleanTitle);

  await db.prepare(`
    INSERT INTO navi_memory_facts_v1
      (owner_id, memory_key, memory_value, source, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).bind(
    ownerId,
    uniqueKey,
    cleanValue,
    source
  ).run();

  const created = await db.prepare(`
    SELECT id, memory_key, memory_value, source, created_at, updated_at
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND memory_key = ?
      AND status = 'pending'
    LIMIT 1
  `).bind(
    ownerId,
    uniqueKey
  ).first();

  return {
    inserted: true,
    duplicate: false,
    id: created?.id || null,
    memoryKey: uniqueKey,
    memoryValue: cleanValue,
    title: cleanTitle
  };
}

// ==========================================
// تأیید پیشنهاد حافظه
// pending -> approved
// ==========================================

export async function approveNaviMemoryProposal(
  db,
  id,
  editedValue = null
) {
  const memoryId = Number(id);

  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
    throw new Error("Invalid memory proposal ID.");
  }

  const existing = await db.prepare(`
    SELECT id, memory_key, memory_value
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
    LIMIT 1
  `).bind(
    memoryId,
    NAVI_OWNER_ID
  ).first();

  if (!existing) {
    return {
      success: false,
      notFound: true
    };
  }

  const finalValue = editedValue === null
    ? existing.memory_value
    : cleanMemoryValue(editedValue);

  if (!finalValue) {
    throw new Error("Memory value cannot be empty.");
  }

  // جلوگیری از تأیید نسخه تکراری

  const duplicate = await db.prepare(`
    SELECT id
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND memory_value = ?
      AND status = 'approved'
      AND id != ?
    LIMIT 1
  `).bind(
    NAVI_OWNER_ID,
    finalValue,
    memoryId
  ).first();

  if (duplicate) {
    return {
      success: false,
      duplicate: true,
      duplicateId: duplicate.id
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
    finalValue,
    memoryId,
    NAVI_OWNER_ID
  ).run();

  return {
    success: true,
    id: memoryId,
    memoryValue: finalValue,
    changes: result.meta?.changes || 0
  };
}

// ==========================================
// رد پیشنهاد حافظه
// pending -> archived
// ==========================================

export async function rejectNaviMemoryProposal(db, id) {
  const memoryId = Number(id);

  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
    throw new Error("Invalid memory proposal ID.");
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
    memoryId,
    NAVI_OWNER_ID
  ).run();

  return {
    success: (result.meta?.changes || 0) > 0,
    id: memoryId,
    changes: result.meta?.changes || 0
  };
}

// ==========================================
// ویرایش پیشنهاد قبل از تأیید
// ==========================================

export async function updateNaviMemoryProposal(
  db,
  id,
  value
) {
  const memoryId = Number(id);
  const cleanValue = cleanMemoryValue(value);

  if (!Number.isSafeInteger(memoryId) || memoryId <= 0) {
    throw new Error("Invalid memory proposal ID.");
  }

  if (!cleanValue) {
    throw new Error("Memory value cannot be empty.");
  }

  const existing = await db.prepare(`
    SELECT id
    FROM navi_memory_facts_v1
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
    LIMIT 1
  `).bind(
    memoryId,
    NAVI_OWNER_ID
  ).first();

  if (!existing) {
    return {
      success: false,
      notFound: true
    };
  }

  const duplicate = await db.prepare(`
    SELECT id
    FROM navi_memory_facts_v1
    WHERE owner_id = ?
      AND memory_value = ?
      AND status IN ('approved', 'pending')
      AND id != ?
    LIMIT 1
  `).bind(
    NAVI_OWNER_ID,
    cleanValue,
    memoryId
  ).first();

  if (duplicate) {
    return {
      success: false,
      duplicate: true
    };
  }

  await db.prepare(`
    UPDATE navi_memory_facts_v1
    SET
      memory_value = ?,
      updated_at = datetime('now')
    WHERE id = ?
      AND owner_id = ?
      AND status = 'pending'
  `).bind(
    cleanValue,
    memoryId,
    NAVI_OWNER_ID
  ).run();

  return {
    success: true,
    id: memoryId
  };
}

// ==========================================
// ذخیره یا به‌روزرسانی حافظه تأییدشده
// دستور صریح کاربر
// ==========================================

export async function saveNaviMemoryFact(
  db,
  value,
  memoryKey = "یادداشت کاربر",
  source = "user_command"
) {
  const ownerId = NAVI_OWNER_ID;
  const cleanValue = cleanMemoryValue(value);

  if (!cleanValue) {
    throw new Error("Memory value cannot be empty.");
  }

  // تشخیص هویت دستیار

  const isAssistantIdentity =
    /(?:نام|اسم)\s*(?:دستیار|هوشمند)/u.test(cleanValue) &&
    /ناوی/u.test(cleanValue);

  const finalKey = isAssistantIdentity
    ? "هویت دستیار"
    : cleanMemoryTitle(memoryKey);

  // کلیدهای پروفایل

  const isProtectedProfileKey = [
    "نام کاربر",
    "هویت دستیار"
  ].includes(finalKey);

  if (isProtectedProfileKey) {
    const existing = await db.prepare(`
      SELECT id, memory_value
      FROM navi_memory_facts_v1
      WHERE owner_id = ?
        AND memory_key = ?
        AND status = 'approved'
      ORDER BY id DESC
      LIMIT 1
    `).bind(
      ownerId,
      finalKey
    ).first();

    if (existing) {
      if (existing.memory_value === cleanValue) {
        return {
          duplicate: true,
          updated: false,
          inserted: false,
          memoryKey: finalKey
        };
      }

      await db.prepare(`
        UPDATE navi_memory_facts_v1
        SET
          memory_value = ?,
          source = ?,
          updated_at = datetime('now'),
          status = 'approved'
        WHERE id = ?
          AND owner_id = ?
      `).bind(
        cleanValue,
        source,
        existing.id,
        ownerId
      ).run();

      return {
        duplicate: false,
        updated: true,
        inserted: false,
        memoryKey: finalKey
      };
    }
  } else {
    const existing = await db.prepare(`
      SELECT id
      FROM navi_memory_facts_v1
      WHERE owner_id = ?
        AND memory_value = ?
        AND status = 'approved'
      LIMIT 1
    `).bind(
      ownerId,
      cleanValue
    ).first();

    if (existing) {
      return {
        duplicate: true,
        updated: false,
        inserted: false,
        memoryKey: finalKey
      };
    }
  }

  const uniqueKey = isProtectedProfileKey
    ? finalKey
    : createUniqueMemoryKey(finalKey);

  await db.prepare(`
    INSERT INTO navi_memory_facts_v1
      (owner_id, memory_key, memory_value, source, status)
    VALUES (?, ?, ?, ?, 'approved')
  `).bind(
    ownerId,
    uniqueKey,
    cleanValue,
    source
  ).run();

  return {
    duplicate: false,
    updated: false,
    inserted: true,
    memoryKey: uniqueKey
  };
}

// ==========================================
// ذخیره تاریخچه گفت‌وگو
// ==========================================

export async function saveNaviConversation(
  db,
  userMessage,
  assistantMessage
) {
  await db.batch([
    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'user', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      userMessage
    ),

    db.prepare(`
      INSERT INTO navi_chat_messages_v1
      (thread_id, role, content)
      VALUES (?, 'assistant', ?)
    `).bind(
      NAVI_MAIN_THREAD_ID,
      assistantMessage
    ),

    db.prepare(`
      UPDATE navi_chat_threads_v1
      SET updated_at = datetime('now')
      WHERE thread_id = ?
    `).bind(NAVI_MAIN_THREAD_ID)
  ]);
}
